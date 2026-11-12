// In-memory stand-in for the API database and the chain, used by mock mode and by tests.
// It starts from the shared `@pontis/api-types` fixtures and applies the same quote math as the
// contract (floor on the ratio, ceil on the fee), so numbers in mock mode match live behaviour.
//
// Two extra representations exist ONLY here (TGOLD-U, TSILV-A). They are not deployed anywhere;
// they let the demo show the non-convertible compatibility classes.
import type {
  Asset,
  AssetSummary,
  Compatibility,
  Issuer,
  Quote,
  ReconciliationReport,
  Transaction,
  WalletAction,
} from "@pontis/api-types";
import {
  canonicalAsset,
  compatibilityFromA,
  compatibilityFromB,
  FIXTURE_FEE_BPS,
  issuerA,
  issuerB,
  tgoldA,
  tgoldB,
} from "@pontis/api-types/fixtures";
import type { QuoteState, RefusalCode } from "@pontis/domain";
import {
  applyFloor,
  mulDivCeil,
  ratioBetween,
  rationalFromWire,
  rationalToWire,
} from "@pontis/domain";

export const CORE = "pontis-core.pontis.testnet";
export const DEMO_ACCOUNT = "alice.testnet";
/** A demo account that is deliberately not on the allowlist. */
export const GUEST_ACCOUNT = "guest.testnet";
export const QUOTE_TTL_MS = 60_000;
const SETTLE_AFTER_MS = 4_000;
const OWNER = "pontis-owner.testnet";

const FAUCET = { enabled: true, max_per_call: "100000000000", cooldown_ms: 60_000 };

const iso = (ms: number) => new Date(ms).toISOString();
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function fakeHash(length = 44): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => BASE58[b % BASE58.length]).join("");
}

export class MockRefusal extends Error {
  constructor(
    readonly code:
      RefusalCode | "NOT_FOUND" | "QUOTE_EXPIRED" | "QUOTE_ALREADY_USED" | "VALIDATION_ERROR",
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Relation {
  a: string;
  b: string;
  build: (self: string, counterpart: string) => Compatibility;
}

function createState() {
  const start = Date.now();
  const T0 = "2026-11-07T18:00:00.000Z";

  const issuerC: Issuer = {
    ...issuerA,
    id: "synthetic-issuer-c",
    name: "Synthetic Issuer C",
    controlledAccounts: ["tgold-u.pontis.testnet", "tsilv-a.pontis.testnet"],
    evidence: issuerA.evidence.map((e) => ({
      ...e,
      id: "ev-synthetic-issuer-c",
      subjectId: "synthetic-issuer-c",
    })),
  };
  const issuers: Issuer[] = [issuerA, issuerB, issuerC];
  const issuerSummary = (i: Issuer) => ({
    id: i.id,
    name: i.name,
    status: i.status,
    synthetic: i.synthetic,
    verificationStatus: i.verificationStatus,
  });

  const variant = (
    id: string,
    symbol: string,
    name: string,
    claim: Partial<Asset["canonicalAsset"]>,
  ): Asset => ({
    ...tgoldA,
    id,
    symbol,
    name,
    accountId: `${id}.pontis.testnet`,
    issuer: issuerSummary(issuerC),
    canonicalAsset: { ...canonicalAsset, ...claim },
    evidence: tgoldA.evidence.map((e) => ({ ...e, id: `ev-${id}`, subjectId: id })),
    vaultInventory: "0",
  });

  const assets = new Map<string, Asset>(
    [
      structuredClone(tgoldA),
      structuredClone(tgoldB),
      variant("tgold-u", "TGOLD-U", "SYNTHETIC TEST Gold, unallocated", {
        id: "syn-gold-unalloc",
        name: "Synthetic Gold, unallocated ounce",
        claimDescription: "A fictional claim on a fictional pooled, unallocated gold account.",
        unitDefinition: "1 canonical unit = 1 fictional unallocated troy ounce",
      }),
      variant("tsilv-a", "TSILV-A", "SYNTHETIC TEST Silver A", {
        id: "syn-silver-oz",
        name: "Synthetic Silver, one troy ounce",
        claimDescription: "A fictional claim to one troy ounce of fictional allocated silver.",
        unitDefinition: "1 canonical unit = 1 fictional troy ounce of silver",
      }),
    ].map((a) => [a.id, a]),
  );

  const multiplier = (id: string) => rationalFromWire((assets.get(id) as Asset).unitMultiplier);
  const nonParity =
    (key: string, classification: "ECONOMICALLY_SIMILAR" | "INCOMPATIBLE", rationale: string) =>
    (self: string, counterpart: string): Compatibility => {
      const ratio = rationalToWire(ratioBetween(multiplier(self), multiplier(counterpart)));
      const scope = "Recorded for discovery only. No conversion route.";
      return {
        id: key,
        counterpartId: counterpart,
        classification,
        ratio,
        scope,
        rationale,
        version: 1,
        status: "approved",
        parityEnabled: false,
        proposedBy: OWNER,
        approvedBy: OWNER,
        updatedAt: T0,
        evidence: [],
        history: [
          {
            version: 1,
            action: "approved",
            classification,
            status: "approved",
            ratio,
            scope,
            rationale,
            actor: OWNER,
            at: T0,
          },
        ],
      };
    };
  const direct = (self: string): Compatibility => {
    const base = self === "tgold-a" ? compatibilityFromA : compatibilityFromB;
    const first = base.history[0];
    return {
      ...base,
      history: first
        ? [
            {
              ...first,
              action: "proposed",
              status: "proposed",
              rationale: "Proposed from the unit multipliers in both dossiers.",
              at: "2026-11-07T17:30:00.000Z",
            },
            first,
          ]
        : [],
    };
  };
  const similar =
    "Allocated and unallocated claims carry different custody and insolvency terms. Same unit, different claim.";
  const different =
    "Gold and silver are different underlying claims. The equal unit multiplier is a coincidence of decimals.";
  const relations: Relation[] = [
    { a: "tgold-a", b: "tgold-b", build: (self) => direct(self) },
    {
      a: "tgold-a",
      b: "tgold-u",
      build: nonParity("rel-tgold-a-tgold-u", "ECONOMICALLY_SIMILAR", similar),
    },
    {
      a: "tgold-b",
      b: "tgold-u",
      build: nonParity("rel-tgold-b-tgold-u", "ECONOMICALLY_SIMILAR", similar),
    },
    {
      a: "tgold-a",
      b: "tsilv-a",
      build: nonParity("rel-tgold-a-tsilv-a", "INCOMPATIBLE", different),
    },
    {
      a: "tgold-b",
      b: "tsilv-a",
      build: nonParity("rel-tgold-b-tsilv-a", "INCOMPATIBLE", different),
    },
  ];

  return {
    start,
    issuers,
    assets,
    relations,
    allowlist: new Set<string>([DEMO_ACCOUNT]),
    balances: new Map<string, bigint>([
      [`${DEMO_ACCOUNT}:tgold-a`, 25_000_000n],
      [`${DEMO_ACCOUNT}:tgold-b`, 0n],
      [`${GUEST_ACCOUNT}:tgold-a`, 5_000_000n],
    ]),
    registered: new Set<string>([`${DEMO_ACCOUNT}:tgold-a`, `${GUEST_ACCOUNT}:tgold-a`]),
    faucetLast: new Map<string, number>(),
    quotes: new Map<string, Quote>(),
    transactions: new Map<string, Transaction>(),
    idempotency: new Map<string, string>(),
  };
}

let state = createState();

function assetOrThrow(id: string): Asset {
  const asset = state.assets.get(id);
  if (!asset) throw new MockRefusal("NOT_FOUND", 404, `No asset with id "${id}".`);
  return asset;
}

const summary = (a: Asset): AssetSummary => ({
  id: a.id,
  symbol: a.symbol,
  name: a.name,
  network: a.network,
  accountId: a.accountId,
  decimals: a.decimals,
  unitMultiplier: a.unitMultiplier,
  status: a.status,
  canonicalAssetId: a.canonicalAsset.id,
  canonicalAssetName: a.canonicalAsset.name,
  issuer: a.issuer,
  synthetic: a.synthetic,
  verificationStatus: a.verificationStatus,
});

function relationBetween(fromId: string, toId: string): Compatibility | undefined {
  const relation = state.relations.find(
    (r) => (r.a === fromId && r.b === toId) || (r.a === toId && r.b === fromId),
  );
  return relation?.build(fromId, toId);
}

function tokenIdByAccount(accountId: string): string | undefined {
  return [...state.assets.values()].find((a) => a.accountId === accountId)?.id;
}

function buildQuote(
  fromId: string,
  toId: string,
  amountIn: bigint,
  accountId: string,
  createdMs: number,
  quoteState: QuoteState = "QUOTED",
): Quote {
  const relation = relationBetween(fromId, toId) as Compatibility;
  const ratio = rationalFromWire(relation.ratio);
  const gross = applyFloor(ratio, amountIn);
  const fee = mulDivCeil(gross, BigInt(FIXTURE_FEE_BPS), 10_000n);
  return {
    id: crypto.randomUUID(),
    fromId,
    toId,
    accountId,
    amountIn: amountIn.toString(),
    amountOutGross: gross.toString(),
    fee: fee.toString(),
    amountOut: (gross - fee).toString(),
    ratio: relation.ratio,
    feeBps: FIXTURE_FEE_BPS,
    expiresAt: iso(createdMs + QUOTE_TTL_MS),
    route: {
      type: "PARITY_CONVERSION",
      venue: "CONTROLLED_TEST_VAULT",
      network: "near-testnet",
      settlement: "ASYNC_CALLBACK_WITH_REFUND",
      description:
        "Controlled test vault, same chain. Settled asynchronously across several receipts with a refund if the payout fails; not an atomic transaction.",
    },
    compatibilityVersion: relation.version,
    policyVersion: 1,
    warnings: [
      {
        code: "SYNTHETIC",
        message: "Synthetic, unbacked test assets. Testnet only; no real value.",
      },
      {
        code: "NETWORK_COST",
        message: "Network fees are paid by your wallet and are not part of this quote.",
      },
    ],
    state: quoteState,
    createdAt: iso(createdMs),
  };
}

function completionEvent(tx: Transaction, atMs: number): Transaction["events"][number] {
  return {
    eventName: "conversion_completed",
    receiptId: fakeHash(),
    logIndex: 0,
    blockHeight: chainHeight(atMs),
    blockTimestamp: iso(atMs),
    txHash: tx.txHash,
    data: {
      quote_nonce: tx.quote.id.slice(0, 8),
      user: tx.quote.accountId,
      token_in: `${tx.quote.fromId}.pontis.testnet`,
      token_out: `${tx.quote.toId}.pontis.testnet`,
      amount_in: tx.quote.amountIn,
      amount_out_gross: tx.quote.amountOutGross,
      fee: tx.quote.fee,
      amount_out: tx.quote.amountOut,
    },
  };
}

const chainHeight = (atMs = Date.now()) =>
  200_000_000 + Math.floor((atMs - state.start) / 1000) + 3600;

/** Seeds a history that covers every state a user can meet. */
function seedHistory(): void {
  const now = state.start;
  const make = (
    minutesAgo: number,
    fromId: string,
    toId: string,
    amountIn: bigint,
    txState: QuoteState,
    extra: Partial<Transaction> = {},
  ) => {
    const created = now - minutesAgo * 60_000;
    const quote = buildQuote(fromId, toId, amountIn, DEMO_ACCOUNT, created, txState);
    const sent = ["SUBMITTED", "SETTLED", "FAILED", "REQUIRES_RECONCILIATION"].includes(txState);
    const txHash = sent ? fakeHash() : null;
    const tx: Transaction = {
      id: crypto.randomUUID(),
      quote,
      state: txState,
      txHash,
      reportedTxHash: txHash,
      txHashStatus: txHash ? "VERIFIED" : "NONE",
      failureReason: null,
      events: [],
      createdAt: iso(created),
      submittedAt: sent ? iso(created + 14_000) : null,
      settledAt: txState === "SETTLED" ? iso(created + 19_000) : null,
      ...extra,
    };
    if (txState === "SETTLED") tx.events = [completionEvent(tx, created + 19_000)];
    state.quotes.set(quote.id, quote);
    state.transactions.set(tx.id, tx);
    return tx;
  };
  make(3 * 24 * 60, "tgold-a", "tgold-b", 2_000_000n, "SETTLED");
  make(2 * 24 * 60 + 40, "tgold-b", "tgold-a", 500_000_000n, "SETTLED");
  make(26 * 60, "tgold-a", "tgold-b", 1_250_000n, "EXPIRED");
  const failed = make(9 * 60, "tgold-a", "tgold-b", 4_000_000n, "FAILED", {
    failureReason: "The payout transfer failed, so the contract refunded the full input.",
  });
  failed.events = [
    {
      ...completionEvent(failed, now - 9 * 3_600_000 + 19_000),
      eventName: "conversion_failed",
      data: { reason: "payout_failed", refunded: failed.quote.amountIn },
    },
  ];
  make(95, "tgold-a", "tgold-b", 750_000n, "REQUIRES_RECONCILIATION", {
    failureReason: "Submitted, but no settlement event was indexed within the expected window.",
  });
  make(42, "tgold-a", "tgold-b", 3_000_000n, "SETTLED");
}
seedHistory();

/** Moves time-dependent states forward. Called on every read, so no timers are needed. */
function advance(now = Date.now()): void {
  for (const tx of state.transactions.values()) {
    if (
      tx.state === "SUBMITTED" &&
      tx.submittedAt &&
      now - Date.parse(tx.submittedAt) >= SETTLE_AFTER_MS
    ) {
      const q = tx.quote;
      const bal = (id: string) => state.balances.get(`${q.accountId}:${id}`) ?? 0n;
      state.balances.set(`${q.accountId}:${q.fromId}`, bal(q.fromId) - BigInt(q.amountIn));
      state.balances.set(`${q.accountId}:${q.toId}`, bal(q.toId) + BigInt(q.amountOut));
      const src = assetOrThrow(q.fromId);
      const dst = assetOrThrow(q.toId);
      src.vaultInventory = (BigInt(src.vaultInventory) + BigInt(q.amountIn)).toString();
      dst.vaultInventory = (BigInt(dst.vaultInventory) - BigInt(q.amountOut)).toString();
      tx.state = "SETTLED";
      tx.settledAt = iso(now);
      tx.events = [completionEvent(tx, now)];
    }
    if (
      (tx.state === "QUOTED" || tx.state === "ACCEPTED") &&
      now > Date.parse(tx.quote.expiresAt)
    ) {
      tx.state = "EXPIRED";
    }
    tx.quote.state = tx.state;
  }
  for (const quote of state.quotes.values()) {
    if (quote.state === "QUOTED" && now > Date.parse(quote.expiresAt)) quote.state = "EXPIRED";
  }
}

export const db = {
  reset() {
    state = createState();
    seedHistory();
  },

  health: () => ({
    status: "ok" as const,
    chainHeight: chainHeight(),
    indexerLagBlocks: Math.floor(Date.now() / 7000) % 3,
  }),
  issuers: () =>
    state.issuers.map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      synthetic: i.synthetic,
      verificationStatus: i.verificationStatus,
    })),
  issuer(id: string): Issuer {
    const found = state.issuers.find((i) => i.id === id);
    if (!found) throw new MockRefusal("NOT_FOUND", 404, `No issuer with id "${id}".`);
    return found;
  },
  assets: () => [...state.assets.values()].map(summary),
  asset: (id: string) => (advance(), assetOrThrow(id)),
  compatibility(id: string): Compatibility[] {
    assetOrThrow(id);
    return state.relations
      .filter((r) => r.a === id || r.b === id)
      .map((r) => r.build(id, r.a === id ? r.b : r.a));
  },

  compare(fromId: string, toId: string, amount?: string) {
    assetOrThrow(fromId);
    const to = assetOrThrow(toId);
    const type = "PARITY_CONVERSION" as const;
    const relation = relationBetween(fromId, toId);
    if (!relation) {
      return {
        routes: [
          {
            type,
            executable: false,
            reasonCode: "NOT_DIRECT_EQUIVALENT" as const,
            explanation:
              "No compatibility relationship has been proposed for this pair, so there is no route.",
          },
        ],
      };
    }
    if (!relation.parityEnabled) {
      return {
        routes: [
          {
            type,
            executable: false,
            reasonCode: "NOT_DIRECT_EQUIVALENT" as const,
            explanation:
              "These assets are not approved as direct equivalents. A matching unit ratio alone never allows a parity conversion.",
            ratio: relation.ratio,
            compatibilityVersion: relation.version,
          },
        ],
      };
    }
    const base = { type, ratio: relation.ratio, compatibilityVersion: relation.version };
    if (amount !== undefined) {
      const wanted = applyFloor(rationalFromWire(relation.ratio), BigInt(amount));
      if (wanted > BigInt(to.vaultInventory)) {
        return {
          routes: [
            {
              ...base,
              executable: false,
              reasonCode: "INSUFFICIENT_INVENTORY" as const,
              explanation:
                "The test vault does not hold enough of the destination asset for this amount.",
            },
          ],
        };
      }
    }
    return {
      routes: [
        {
          ...base,
          executable: true,
          explanation:
            "Approved direct equivalents for a narrow, recorded scope: converted at the approved unit ratio from a controlled test vault, same chain, asynchronous with refund on failure. Synthetic test assets only.",
        },
      ],
    };
  },

  createQuote(fromId: string, toId: string, amountIn: string, accountId: string): Quote {
    const route = db.compare(fromId, toId, amountIn).routes[0];
    if (!route) throw new MockRefusal("NOT_FOUND", 404, "No route.");
    if (!/^[1-9][0-9]*$/.test(amountIn)) {
      throw new MockRefusal("VALIDATION_ERROR", 400, "amountIn must be a positive integer string.");
    }
    if (!route.executable) {
      throw new MockRefusal(
        "reasonCode" in route ? route.reasonCode : "NOT_DIRECT_EQUIVALENT",
        422,
        route.explanation,
      );
    }
    if (!state.allowlist.has(accountId)) {
      throw new MockRefusal(
        "NOT_ELIGIBLE",
        422,
        `${accountId} is not on the testnet allowlist for this pair.`,
      );
    }
    const quote = buildQuote(fromId, toId, BigInt(amountIn), accountId, Date.now());
    state.quotes.set(quote.id, quote);
    return quote;
  },
  quote(id: string): Quote {
    advance();
    const quote = state.quotes.get(id);
    if (!quote) throw new MockRefusal("NOT_FOUND", 404, "No such quote.");
    return quote;
  },

  createConversion(quoteId: string, idempotencyKey: string) {
    advance();
    const quote = state.quotes.get(quoteId);
    if (!quote) throw new MockRefusal("NOT_FOUND", 404, "No such quote.");
    const existing = state.idempotency.get(idempotencyKey);
    let tx = existing ? state.transactions.get(existing) : undefined;
    if (!tx) {
      if (quote.state === "EXPIRED")
        throw new MockRefusal("QUOTE_EXPIRED", 410, "This quote expired before it was accepted.");
      if (quote.state !== "QUOTED")
        throw new MockRefusal("QUOTE_ALREADY_USED", 409, "This quote was already accepted.");
      quote.state = "ACCEPTED";
      tx = {
        id: crypto.randomUUID(),
        quote,
        state: "ACCEPTED",
        txHash: null,
        reportedTxHash: null,
        txHashStatus: "NONE",
        failureReason: null,
        events: [],
        createdAt: new Date().toISOString(),
        submittedAt: null,
        settledAt: null,
      };
      state.transactions.set(tx.id, tx);
      state.idempotency.set(idempotencyKey, tx.id);
    }
    const from = assetOrThrow(quote.fromId);
    const to = assetOrThrow(quote.toId);
    const transfer: WalletAction = {
      receiverId: from.accountId,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: CORE,
        amount: quote.amountIn,
        msg: JSON.stringify({ quote: { id: quote.id }, signature: "bW9jay1zaWduYXR1cmU=" }),
      },
      gas: "100000000000000",
      deposit: "1",
    };
    const storage: WalletAction = {
      receiverId: to.accountId,
      methodName: "storage_deposit",
      args: { account_id: quote.accountId, registration_only: true },
      gas: "30000000000000",
      deposit: "10000000000000000000000",
    };
    const registered = state.registered.has(`${quote.accountId}:${to.id}`);
    return {
      conversionId: tx.id,
      quoteId: quote.id,
      actions: registered ? [transfer] : [storage, transfer],
    };
  },

  markSubmitted(conversionId: string, txHash: string): Transaction {
    advance();
    const tx = state.transactions.get(conversionId);
    if (!tx) throw new MockRefusal("NOT_FOUND", 404, "No such conversion.");
    if (tx.txHash && tx.txHash !== txHash)
      throw new MockRefusal(
        "QUOTE_ALREADY_USED",
        409,
        "A different transaction was already reported.",
      );
    if (tx.state === "EXPIRED")
      throw new MockRefusal("QUOTE_EXPIRED", 410, "The quote expired before it was submitted.");
    if (tx.state === "ACCEPTED") {
      tx.state = "SUBMITTED";
      tx.quote.state = "SUBMITTED";
      tx.txHash = txHash;
      tx.submittedAt = new Date().toISOString();
    }
    return tx;
  },
  transaction(id: string): Transaction {
    advance();
    const tx = state.transactions.get(id);
    if (!tx) throw new MockRefusal("NOT_FOUND", 404, "No such conversion.");
    return tx;
  },
  transactions(account: string): Transaction[] {
    advance();
    return [...state.transactions.values()]
      .filter((t) => t.quote.accountId === account)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  },

  reconciliation(): ReconciliationReport {
    advance();
    const flagged = [...state.transactions.values()].filter(
      (t) => t.state === "REQUIRES_RECONCILIATION",
    );
    const vaults = ["tgold-a", "tgold-b"].map((id) => {
      const a = assetOrThrow(id);
      return {
        representationId: id,
        tokenAccountId: a.accountId,
        inventory: a.vaultInventory,
        balance: a.vaultInventory,
      };
    });
    return {
      status: flagged.length > 0 ? "ATTENTION" : "OK",
      ranAt: new Date(Date.now() - 45_000).toISOString(),
      findings: flagged.map((t) => ({
        key: `stuck:${t.quote.id}`,
        kind: "STUCK_SUBMITTED" as const,
        severity: "warning" as const,
        subject: t.quote.id,
        message:
          "Quote has been SUBMITTED for longer than the stuck threshold with no settlement event.",
        firstSeenAt: t.submittedAt ?? t.createdAt,
      })),
      vaults,
      requiresReconciliation: flagged.map((t) => ({
        quoteId: t.quote.id,
        conversionId: t.id,
        reason: t.failureReason,
        flaggedAt: t.submittedAt ?? t.createdAt,
      })),
    };
  },

  // ---- the "chain": views and calls the mock wallet uses ----

  view(contractId: string, method: string, args: Record<string, unknown>): unknown {
    advance();
    const tokenId = tokenIdByAccount(contractId);
    const account = String(args.account_id ?? "");
    if (!tokenId) throw new Error(`mock chain: unknown contract ${contractId}`);
    switch (method) {
      case "ft_balance_of":
        return (state.balances.get(`${account}:${tokenId}`) ?? 0n).toString();
      case "storage_balance_of":
        return state.registered.has(`${account}:${tokenId}`)
          ? { total: "1250000000000000000000", available: "0" }
          : null;
      case "faucet_config":
        return FAUCET;
      case "faucet_next_available_ms": {
        const last = state.faucetLast.get(`${account}:${tokenId}`);
        return last === undefined ? 0 : last + FAUCET.cooldown_ms;
      }
      default:
        throw new Error(`mock chain: unknown view ${method}`);
    }
  },

  /** Applies a signed action. Throws with the contract's panic message on failure. */
  execute(signer: string, action: WalletAction): void {
    const tokenId = tokenIdByAccount(action.receiverId);
    if (!tokenId) throw new Error(`mock chain: unknown contract ${action.receiverId}`);
    const key = `${signer}:${tokenId}`;
    if (action.methodName === "storage_deposit") {
      state.registered.add(key);
    } else if (action.methodName === "faucet_mint") {
      const amount = BigInt(String(action.args.amount));
      if (amount > BigInt(FAUCET.max_per_call))
        throw new Error("amount exceeds faucet max_per_call");
      const last = state.faucetLast.get(key);
      if (last !== undefined && Date.now() < last + FAUCET.cooldown_ms)
        throw new Error("faucet cooldown has not elapsed");
      state.balances.set(key, (state.balances.get(key) ?? 0n) + amount);
      state.faucetLast.set(key, Date.now());
    }
    // ft_transfer_call settles through `advance` once the conversion is reported as submitted.
  },
};
