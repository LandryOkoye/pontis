// Typed view wrappers for pontis-core and synthetic-token. Writes are not signed here: the
// backend never holds user keys, and admin actions run from scripts/ (see actions.ts for the
// unsigned plans the wallet signs).

import { z } from "zod";
import type { RpcClient } from "./rpc.ts";
import {
  ChainCanonicalAssetSchema,
  ChainCompatibilitySchema,
  ChainCorporateActionSchema,
  ChainIssuerSchema,
  ChainLifecycleSchema,
  ChainMultiplierEpochSchema,
  ChainNavStrikeSchema,
  ChainPolicySchema,
  ChainRepresentationSchema,
  ChainPriceSchema,
  ChainRouteGuardsSchema,
  ChainRouteViewSchema,
  type ChainCanonicalAsset,
  type ChainCompatibility,
  type ChainCorporateAction,
  type ChainIssuer,
  type ChainLifecycle,
  type ChainMultiplierEpoch,
  type ChainNavStrike,
  type ChainPolicy,
  type ChainRepresentation,
  type ChainPrice,
  type ChainRouteGuards,
  type ChainRouteView,
} from "./schemas.ts";
import {
  ChainCustodianSchema,
  ChainCustodyLinkSchema,
  ChainEscrowLedgerSchema,
  ChainIssuerReliabilitySchema,
  ChainMintHeadroomSchema,
  ChainMintRequestSchema,
  ChainRedemptionSchema,
  ChainRedemptionTermsSchema,
  ChainReserveRecordSchema,
  ChainReserveStatusSchema,
  ChainSupplySchema,
  pagedOf,
  type ChainCustodian,
  type ChainCustodyLink,
  type ChainEscrowLedger,
  type ChainIssuerReliability,
  type ChainMintHeadroom,
  type ChainMintRequest,
  type ChainPage,
  type ChainRedemption,
  type ChainRedemptionTerms,
  type ChainReserveRecord,
  type ChainReserveStatus,
  type ChainSupply,
} from "./custody-schemas.ts";

const PAGE = 100;
const amount = z.string().regex(/^(0|[1-9][0-9]*)$/);

/** Everything the registry sync reads. `CoreClient` implements it; tests supply fixtures. */
export interface RegistrySource {
  blockHeight(): Promise<number>;
  listIssuers(): Promise<ChainIssuer[]>;
  listCanonicalAssets(): Promise<ChainCanonicalAsset[]>;
  listRepresentations(): Promise<ChainRepresentation[]>;
  listCompatibilities(): Promise<ChainCompatibility[]>;
  getPolicy(representationId: string): Promise<ChainPolicy | null>;
  getInventory(representationId: string): Promise<string>;
}

export class CoreClient implements RegistrySource {
  constructor(
    private readonly rpc: RpcClient,
    readonly accountId: string,
  ) {}

  async blockHeight(): Promise<number> {
    return (await this.rpc.status()).latestBlockHeight;
  }

  /** Pages through a `list_*` view until a short page. */
  private async listAll<T>(method: string, item: z.ZodType<T>): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const raw = await this.rpc.view(this.accountId, method, { from_index: from, limit: PAGE });
      const page = z.array(item).parse(raw);
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  }

  listIssuers = () => this.listAll("list_issuers", ChainIssuerSchema);
  listCanonicalAssets = () => this.listAll("list_canonical_assets", ChainCanonicalAssetSchema);
  listRepresentations = () => this.listAll("list_representations", ChainRepresentationSchema);
  listCompatibilities = () => this.listAll("list_compatibilities", ChainCompatibilitySchema);

  async getPolicy(representationId: string): Promise<ChainPolicy | null> {
    const raw = await this.rpc.view(this.accountId, "get_policy", {
      representation_id: representationId,
    });
    return z.nullable(ChainPolicySchema).parse(raw);
  }

  async getInventory(representationId: string): Promise<string> {
    const raw = await this.rpc.view(this.accountId, "get_inventory", {
      representation_id: representationId,
    });
    return amount.parse(raw);
  }

  /** Input tokens held for conversions whose payout has not resolved; not spendable inventory. */
  async getPendingInbound(representationId: string): Promise<string> {
    const raw = await this.rpc.view(this.accountId, "get_pending_inbound", {
      representation_id: representationId,
    });
    return amount.parse(raw);
  }

  /** The parity-route gate for `from` to `to`: terms if executable, else the refusal reason. */
  async getRoute(fromId: string, toId: string): Promise<ChainRouteView> {
    const raw = await this.rpc.view(this.accountId, "get_route", { from_id: fromId, to_id: toId });
    return ChainRouteViewSchema.parse(raw);
  }

  /**
   * Every guard of the route with its verdict and, given an amount, the fee the contract will
   * charge for it (the skew rises as the vault drains). Authoritative: quotes copy this fee.
   */
  async getRouteGuards(fromId: string, toId: string, amountIn?: string): Promise<ChainRouteGuards> {
    const raw = await this.rpc.view(this.accountId, "get_route_guards", {
      from_id: fromId,
      to_id: toId,
      amount_in: amountIn ?? null,
    });
    return ChainRouteGuardsSchema.parse(raw);
  }

  /** The latest reference price the contract holds for a representation, or null before any. */
  async getPrice(representationId: string): Promise<ChainPrice | null> {
    const raw = await this.rpc.view(this.accountId, "get_price", {
      representation_id: representationId,
    });
    return raw === null ? null : ChainPriceSchema.parse(raw);
  }

  /** Every corporate action recorded for a canonical asset, oldest first (ADR 0017). */
  async getCorporateActions(assetId: string): Promise<ChainCorporateAction[]> {
    const raw = await this.rpc.view(this.accountId, "get_corporate_actions", { asset_id: assetId });
    return z.array(ChainCorporateActionSchema).parse(raw);
  }

  /** A representation's multiplier schedule: the genesis epoch first, then one per applied action. */
  async getMultiplierEpochs(representationId: string): Promise<ChainMultiplierEpoch[]> {
    const raw = await this.rpc.view(this.accountId, "get_multiplier_epochs", {
      representation_id: representationId,
    });
    return z.array(ChainMultiplierEpochSchema).parse(raw);
  }

  /** The lifecycle record (a fungible asset in stage `active` when never set); null for an unknown representation. */
  async getLifecycle(representationId: string): Promise<ChainLifecycle | null> {
    const raw = await this.rpc.view(this.accountId, "get_lifecycle", {
      representation_id: representationId,
    });
    return raw === null ? null : ChainLifecycleSchema.parse(raw);
  }

  /** The latest NAV strike of a `nav_fund`, or null before any. */
  async getNavStrike(representationId: string): Promise<ChainNavStrike | null> {
    const raw = await this.rpc.view(this.accountId, "get_nav_strike", {
      representation_id: representationId,
    });
    return raw === null ? null : ChainNavStrikeSchema.parse(raw);
  }

  /** One page of a paged view (ADR 0020 section 0): `limit` 1 to 100, `total` counts everything stored. */
  private async page<T>(
    method: string,
    args: Record<string, unknown>,
    item: z.ZodType<T>,
    fromIndex: number,
    limit: number,
  ): Promise<ChainPage<T>> {
    const raw = await this.rpc.view(this.accountId, method, {
      ...args,
      from_index: fromIndex,
      limit,
    });
    return pagedOf(item).parse(raw);
  }

  /** Registered custodians in registration order (ADR 0020 section 2). */
  getCustodians = (fromIndex: number, limit: number) =>
    this.page("get_custodians", {}, ChainCustodianSchema, fromIndex, limit);

  async getCustodian(id: string): Promise<ChainCustodian | null> {
    const raw = await this.rpc.view(this.accountId, "get_custodian", { id });
    return raw === null ? null : ChainCustodianSchema.parse(raw);
  }

  /** How a representation's reserves are held and by whom; null until the registrar links it. */
  async getCustodyLink(representationId: string): Promise<ChainCustodyLink | null> {
    const raw = await this.rpc.view(this.accountId, "get_custody_link", {
      representation_id: representationId,
    });
    return raw === null ? null : ChainCustodyLinkSchema.parse(raw);
  }

  /** The latest attestation of one custodian, or the newest across custodians when omitted (ADR 0020 section 3). */
  async getReserveAttestation(
    representationId: string,
    custodianId?: string,
  ): Promise<ChainReserveRecord | null> {
    const raw = await this.rpc.view(this.accountId, "get_reserve_attestation", {
      representation_id: representationId,
      custodian_id: custodianId ?? null,
    });
    return raw === null ? null : ChainReserveRecordSchema.parse(raw);
  }

  /** The latest attestation of each linked custodian that has one. */
  async getReserveAttestations(representationId: string): Promise<ChainReserveRecord[]> {
    const raw = await this.rpc.view(this.accountId, "get_reserve_attestations", {
      representation_id: representationId,
    });
    return z.array(ChainReserveRecordSchema).parse(raw);
  }

  /** The last 500 attestations of a representation by `seq`; older ones live in events and the indexer. */
  getReserveHistory = (representationId: string, fromIndex: number, limit: number) =>
    this.page(
      "get_reserve_history",
      { representation_id: representationId },
      ChainReserveRecordSchema,
      fromIndex,
      limit,
    );

  /** Computed on every read from signed attestations and the supply counters; never a stored verdict. */
  async getReserveStatus(representationId: string): Promise<ChainReserveStatus> {
    const raw = await this.rpc.view(this.accountId, "get_reserve_status", {
      representation_id: representationId,
    });
    return ChainReserveStatusSchema.parse(raw);
  }

  async getSupply(representationId: string): Promise<ChainSupply> {
    const raw = await this.rpc.view(this.accountId, "get_supply", {
      representation_id: representationId,
    });
    return ChainSupplySchema.parse(raw);
  }

  async getMintHeadroom(representationId: string): Promise<ChainMintHeadroom> {
    const raw = await this.rpc.view(this.accountId, "get_mint_headroom", {
      representation_id: representationId,
    });
    return ChainMintHeadroomSchema.parse(raw);
  }

  async getMintRequest(id: number): Promise<ChainMintRequest | null> {
    const raw = await this.rpc.view(this.accountId, "get_mint_request", { id });
    return raw === null ? null : ChainMintRequestSchema.parse(raw);
  }

  getMintRequests = (representationId: string, fromIndex: number, limit: number) =>
    this.page(
      "get_mint_requests",
      { representation_id: representationId },
      ChainMintRequestSchema,
      fromIndex,
      limit,
    );

  /** The enforced redemption terms of a representation, or null before the registrar sets them. */
  async getRedemptionTerms(representationId: string): Promise<ChainRedemptionTerms | null> {
    const raw = await this.rpc.view(this.accountId, "get_redemption_terms", {
      representation_id: representationId,
    });
    return raw === null ? null : ChainRedemptionTermsSchema.parse(raw);
  }

  async getRedemption(id: number): Promise<ChainRedemption | null> {
    const raw = await this.rpc.view(this.accountId, "get_redemption", { id });
    return raw === null ? null : ChainRedemptionSchema.parse(raw);
  }

  getRedemptionsByUser = (accountId: string, fromIndex: number, limit: number) =>
    this.page(
      "get_redemptions_by_user",
      { account_id: accountId },
      ChainRedemptionSchema,
      fromIndex,
      limit,
    );

  /** The issuer queue of a representation; filter by status in the caller. */
  getRedemptionsByRepresentation = (representationId: string, fromIndex: number, limit: number) =>
    this.page(
      "get_redemptions_by_representation",
      { representation_id: representationId },
      ChainRedemptionSchema,
      fromIndex,
      limit,
    );

  async getEscrowLedger(representationId: string): Promise<ChainEscrowLedger> {
    const raw = await this.rpc.view(this.accountId, "get_escrow_ledger", {
      representation_id: representationId,
    });
    return ChainEscrowLedgerSchema.parse(raw);
  }

  /** Counters of an issuer's redemption record; the score is derived by the caller, not stored. */
  async getIssuerReliability(issuerId: string): Promise<ChainIssuerReliability> {
    const raw = await this.rpc.view(this.accountId, "get_issuer_reliability", {
      issuer_id: issuerId,
    });
    return ChainIssuerReliabilitySchema.parse(raw);
  }

  /** Live allowlist check: true if the representation needs no allowlist or the account is on it. */
  async isAllowed(representationId: string, account: string): Promise<boolean> {
    const raw = await this.rpc.view(this.accountId, "is_allowed", {
      representation_id: representationId,
      account_id: account,
    });
    return z.boolean().parse(raw);
  }

  /**
   * The roles an account holds on the contract, snake_case, with `owner` when it is the owner
   * (ADR 0019). Names are returned as the contract spells them; the caller decides which it knows.
   */
  async getAccountRoles(accountId: string): Promise<string[]> {
    const raw = await this.rpc.view(this.accountId, "get_account_roles", {
      account_id: accountId,
    });
    return z.array(z.string()).parse(raw);
  }

  async getFeeBps(): Promise<number> {
    return z
      .number()
      .int()
      .min(0)
      .max(100)
      .parse(await this.rpc.view(this.accountId, "get_fee_bps"));
  }

  /** `ed25519:<base58>` public key of the quote signer, or null until the owner sets one. */
  async getQuoteSigner(): Promise<string | null> {
    return z
      .string()
      .nullable()
      .parse(await this.rpc.view(this.accountId, "get_quote_signer"));
  }
}

const StorageBalanceSchema = z.object({ total: amount, available: amount });

export class TokenClient {
  constructor(
    private readonly rpc: RpcClient,
    readonly accountId: string,
  ) {}

  async ftBalanceOf(account: string): Promise<string> {
    return amount.parse(
      await this.rpc.view(this.accountId, "ft_balance_of", { account_id: account }),
    );
  }

  /** `null` when the account is not registered on the token (a payout to it would fail). */
  async storageBalanceOf(account: string) {
    const raw = await this.rpc.view(this.accountId, "storage_balance_of", { account_id: account });
    return z.nullable(StorageBalanceSchema).parse(raw);
  }
}
