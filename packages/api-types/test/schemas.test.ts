import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  ActivityListSchema,
  AssetChainListSchema,
  AssetDocumentListSchema,
  AssetIssuerViewSchema,
  AssetListSchema,
  AssetMetadataSchema,
  CategoryListSchema,
  CompareQuerySchema,
  CompareResponseSchema,
  IssuerLeaderboardSchema,
  SearchResultSchema,
  StatusSchema,
  ChainListSchema,
  MarketMoversSchema,
  MarketOverviewSchema,
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
  ListAssetsQuerySchema,
  NavChartSchema,
  PriceChartSchema,
  PriceString,
  SupplyChartSchema,
  VolumeChartSchema,
  QuoteSchema,
  ReconciliationFindingSchema,
  ReconciliationReportSchema,
  SubmittedRequestSchema,
  RouteGuardsResponseSchema,
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
    ["asset directory", AssetListSchema, fx.assetDirectory],
    ["price chart", PriceChartSchema, fx.priceChart],
    ["NAV chart", NavChartSchema, fx.navChart],
    ["supply chart", SupplyChartSchema, fx.supplyChart],
    ["volume chart", VolumeChartSchema, fx.volumeChart],
    ["market overview", MarketOverviewSchema, fx.marketOverview],
    ["market movers", MarketMoversSchema, fx.marketMovers],
    ["category breakdown", CategoryListSchema, fx.categoryList],
    ["chain breakdown", ChainListSchema, fx.chainList],
    ["asset metadata", AssetMetadataSchema, fx.assetMetadata],
    ["asset issuer view", AssetIssuerViewSchema, fx.assetIssuerView],
    ["asset chains", AssetChainListSchema, fx.assetChainList],
    ["asset documents", AssetDocumentListSchema, fx.assetDocumentList],
    ["asset activity", ActivityListSchema, fx.activityList],
    ["compare", CompareResponseSchema, fx.compareResponse],
    ["search", SearchResultSchema, fx.searchResult],
    ["issuer leaderboard", IssuerLeaderboardSchema, fx.issuerLeaderboard],
    ["status", StatusSchema, fx.status],
    ["route guards", RouteGuardsResponseSchema, fx.routeGuards],
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

describe("reconciliation report", () => {
  const finding = {
    key: "vault:tgold-b:insolvent",
    kind: "VAULT_INSOLVENT",
    severity: "critical",
    subject: "tgold-b",
    message: "Inventory 5 exceeds the token balance 3",
    firstSeenAt: "2026-11-09T10:00:00.000Z",
  };

  it("accepts a populated report and a never-run report", () => {
    const report = {
      status: "ATTENTION",
      ranAt: "2026-11-09T10:01:00.000Z",
      findings: [finding],
      vaults: [
        {
          representationId: "tgold-b",
          tokenAccountId: "tgold-b.testnet",
          inventory: "5",
          balance: "3",
        },
      ],
      requiresReconciliation: [],
    };
    expect(ReconciliationReportSchema.parse(report)).toEqual(report);
    expect(
      ReconciliationReportSchema.parse({
        status: "NEVER_RUN",
        ranAt: null,
        findings: [],
        vaults: [],
        requiresReconciliation: [],
      }).status,
    ).toBe("NEVER_RUN");
  });

  it("rejects a finding of an unknown kind and a non-integer amount", () => {
    expect(
      ReconciliationFindingSchema.safeParse({ ...finding, kind: "SOMETHING_ELSE" }).success,
    ).toBe(false);
    expect(
      ReconciliationReportSchema.safeParse({
        status: "OK",
        ranAt: null,
        findings: [],
        requiresReconciliation: [],
        vaults: [
          { representationId: "a", tokenAccountId: "a.testnet", inventory: "1.5", balance: "1" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("transaction hashes", () => {
  const unverified = {
    ...fx.transactionSettled,
    txHash: null,
    reportedTxHash: fx.transactionSettled.txHash,
    txHashStatus: "REPORTED",
  };

  it("keeps the verified hash apart from the reported one", () => {
    expect(TransactionSchema.parse(fx.transactionSettled)).toMatchObject({
      txHash: fx.transactionSettled.reportedTxHash,
      txHashStatus: "VERIFIED",
    });
    expect(TransactionSchema.parse(unverified)).toMatchObject({
      txHash: null,
      txHashStatus: "REPORTED",
    });
    expect(
      TransactionSchema.parse({ ...unverified, reportedTxHash: null, txHashStatus: "NONE" }),
    ).toBeTruthy();
  });

  it("requires the reported hash and its status, and knows only four statuses", () => {
    const { reportedTxHash: _r, ...withoutReported } = unverified;
    expect(TransactionSchema.safeParse(withoutReported).success).toBe(false);
    const { txHashStatus: _s, ...withoutStatus } = unverified;
    expect(TransactionSchema.safeParse(withoutStatus).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...unverified, txHashStatus: "TRUSTED" }).success).toBe(
      false,
    );
    for (const status of ["NONE", "REPORTED", "VERIFIED", "REJECTED"])
      expect(TransactionSchema.safeParse({ ...unverified, txHashStatus: status }).success).toBe(
        true,
      );
  });
});

describe("market strings and queries", () => {
  it("accepts decimal prices with up to eight places", () => {
    for (const price of ["0", "1", "2681.42585338", "0.00000001", "100.5"]) {
      expect(PriceString.safeParse(price).success, price).toBe(true);
    }
  });

  it.each(["", "-1", "01", "1.", ".5", "1e3", "1.123456789", " 1", "NaN"])(
    "rejects price %j",
    (price) => {
      expect(PriceString.safeParse(price).success).toBe(false);
    },
  );

  it("rejects a JSON number for a price", () => {
    expect(PriceString.safeParse(2681.4).success).toBe(false);
  });

  it("defaults the directory query and bounds the page size", () => {
    expect(ListAssetsQuerySchema.parse({})).toMatchObject({
      sort: "id",
      order: "asc",
      limit: 25,
      data: "all",
    });
    expect(ListAssetsQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(ListAssetsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(ListAssetsQuerySchema.safeParse({ sort: "rank" }).success).toBe(false);
    expect(ListAssetsQuerySchema.safeParse({ data: "fake" }).success).toBe(false);
  });

  it("accepts two to six comma-separated asset IDs to compare, and nothing else", () => {
    expect(CompareQuerySchema.parse({ ids: "a-1,b-2" }).data).toBe("all");
    expect(CompareQuerySchema.safeParse({ ids: "a,b,c,d,e,f" }).success).toBe(true);
    for (const ids of ["a", "a,b,c,d,e,f,g", "a,,b", "A,b", "a b"]) {
      expect(CompareQuerySchema.safeParse({ ids }).success, ids).toBe(false);
    }
  });
});
