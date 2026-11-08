// Typed view wrappers for pontis-core and synthetic-token. Writes are not signed here: the
// backend never holds user keys, and admin actions run from scripts/ (see actions.ts for the
// unsigned plans the wallet signs).

import { z } from "zod";
import type { RpcClient } from "./rpc.ts";
import {
  ChainCanonicalAssetSchema,
  ChainCompatibilitySchema,
  ChainIssuerSchema,
  ChainPolicySchema,
  ChainRepresentationSchema,
  type ChainCanonicalAsset,
  type ChainCompatibility,
  type ChainIssuer,
  type ChainPolicy,
  type ChainRepresentation,
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
