import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  AssetSchema,
  AssetSummarySchema,
  CompareRoutesRequestSchema,
  CompatibilitySchema,
  CreateConversionRequestSchema,
  CreateConversionResponseSchema,
  CreateQuoteRequestSchema,
  ERROR_CODES_FOR_TEST,
  HealthSchema,
  IssuerSchema,
  ListTransactionsQuerySchema,
  QuoteSchema,
  SubmittedRequestSchema,
  TransactionSchema,
} from "./helpers.ts";
import * as fx from "../src/fixtures.ts";

describe("fixtures round-trip through the schemas", () => {
  it.each([
    ["issuer A", IssuerSchema, fx.issuerA],
    ["issuer B", IssuerSchema, fx.issuerB],
    ["TGOLD-A", AssetSchema, fx.tgoldA],
    ["TGOLD-B", AssetSchema, fx.tgoldB],
    ["TGOLD-A summary", AssetSummarySchema, fx.tgoldASummary],
    ["compatibility from A", CompatibilitySchema, fx.compatibilityFromA],
    ["compatibility from B", CompatibilitySchema, fx.compatibilityFromB],
    ["quote", QuoteSchema, fx.quote],
    ["settled transaction", TransactionSchema, fx.transactionSettled],
    ["health", HealthSchema, fx.health],
  ] as const)("%s", (_name, schema, value) => {
    const parsed = schema.parse(value);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(JSON.stringify(value)));
  });

  it("encodes the approved ratio and fee rules for 1 A -> B (ADR 0001)", () => {
    expect(fx.quote.amountIn).toBe("1000000");
    expect(fx.quote.ratio).toEqual({ num: "1000", den: "1" });
    expect(fx.quote.amountOutGross).toBe("1000000000"); // 10 B at 8 decimals
    expect(fx.quote.fee).toBe("1000000"); // ceil(10 bps)
    expect(fx.quote.amountOut).toBe("999000000");
  });

  it("labels every MVP record synthetic and unverified (ADR 0009)", () => {
    for (const r of [fx.issuerA, fx.issuerB, fx.tgoldA, fx.tgoldB, fx.canonicalAsset]) {
      expect(r.synthetic).toBe(true);
      expect(r.verificationStatus).toBe("unverified");
    }
  });
});

describe("amounts and ratios are strict strings", () => {
  const base = { fromId: "tgold-a", toId: "tgold-b", accountId: "alice.testnet" };

  it("accepts canonical integer strings up to u128", () => {
    for (const amountIn of ["0", "1", "340282366920938463463374607431768211455"]) {
      expect(CreateQuoteRequestSchema.safeParse({ ...base, amountIn }).success).toBe(true);
    }
  });

  it.each(["", "-1", "01", "1.5", "1e6", " 1", "340282366920938463463374607431768211456"])(
    "rejects amountIn %j",
    (amountIn) => {
      expect(CreateQuoteRequestSchema.safeParse({ ...base, amountIn }).success).toBe(false);
    },
  );

  it("rejects JSON numbers for amounts", () => {
    expect(CreateQuoteRequestSchema.safeParse({ ...base, amountIn: 1000000 }).success).toBe(false);
  });

  it("rejects unknown fields on requests (strict)", () => {
    expect(CreateQuoteRequestSchema.safeParse({ ...base, amountIn: "1", extra: 1 }).success).toBe(
      false,
    );
    expect(CompareRoutesRequestSchema.safeParse({ fromId: "a", toId: "b", x: 1 }).success).toBe(
      false,
    );
  });

  it("rejects zero or non-integer rational components", () => {
    for (const ratio of [
      { num: "0", den: "1" },
      { num: "1", den: "0" },
      { num: "1.5", den: "1" },
    ]) {
      expect(QuoteSchema.safeParse({ ...fx.quote, ratio }).success).toBe(false);
    }
  });

  it("rejects non-UTC or malformed timestamps", () => {
    expect(QuoteSchema.safeParse({ ...fx.quote, expiresAt: "2026-11-07 18:01:00" }).success).toBe(
      false,
    );
    expect(
      QuoteSchema.safeParse({ ...fx.quote, expiresAt: "2026-11-07T18:01:00+01:00" }).success,
    ).toBe(false);
  });

  it("accepts routes compare without an amount", () => {
    expect(
      CompareRoutesRequestSchema.safeParse({ fromId: "tgold-a", toId: "tgold-b" }).success,
    ).toBe(true);
  });
});

describe("requests and errors", () => {
  it("validates conversion and submission bodies", () => {
    expect(CreateConversionRequestSchema.safeParse({ quoteId: fx.quote.id }).success).toBe(true);
    expect(CreateConversionRequestSchema.safeParse({ quoteId: "not-a-uuid" }).success).toBe(false);
    expect(SubmittedRequestSchema.safeParse({ txHash: fx.transactionSettled.txHash }).success).toBe(
      true,
    );
    expect(SubmittedRequestSchema.safeParse({ txHash: "x" }).success).toBe(false);
  });

  it("requires at least one wallet action and string gas/deposit", () => {
    const action = {
      receiverId: "tgold-a.pontis.testnet",
      methodName: "ft_transfer_call",
      args: { receiver_id: "core.pontis.testnet", amount: "1000000", msg: "{}" },
      gas: "300000000000000",
      deposit: "1",
    };
    const ok = { conversionId: fx.quote.id, quoteId: fx.quote.id, actions: [action] };
    expect(CreateConversionResponseSchema.safeParse(ok).success).toBe(true);
    expect(CreateConversionResponseSchema.safeParse({ ...ok, actions: [] }).success).toBe(false);
    expect(
      CreateConversionResponseSchema.safeParse({ ...ok, actions: [{ ...action, gas: 3e14 }] })
        .success,
    ).toBe(false);
  });

  it("coerces and bounds the history query", () => {
    expect(ListTransactionsQuerySchema.parse({ account: "alice.testnet" }).limit).toBe(50);
    expect(ListTransactionsQuerySchema.parse({ account: "alice.testnet", limit: "5" }).limit).toBe(
      5,
    );
    expect(
      ListTransactionsQuerySchema.safeParse({ account: "alice.testnet", limit: "0" }).success,
    ).toBe(false);
    expect(
      ListTransactionsQuerySchema.safeParse({ account: "alice.testnet", limit: "101" }).success,
    ).toBe(false);
    expect(ListTransactionsQuerySchema.safeParse({}).success).toBe(false);
  });

  it("accepts every documented error code and rejects unknown ones", () => {
    for (const code of ERROR_CODES_FOR_TEST) {
      expect(ApiErrorSchema.safeParse({ code, message: "m" }).success).toBe(true);
    }
    expect(ApiErrorSchema.safeParse({ code: "SOMETHING_ELSE", message: "m" }).success).toBe(false);
  });
});
