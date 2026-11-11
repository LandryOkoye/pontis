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
