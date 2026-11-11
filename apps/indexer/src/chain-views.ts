// Reads of the ADR 0020 views the indexer needs: custodians, reserve status, the escrow ledger and
// issuer reliability. Validated at runtime so a contract and an indexer that drift apart fail
// loudly. These are local to the indexer until near-client grows typed wrappers for them.

import {
  ChainEvidenceSchema,
  ChainMintRequestSchema,
  type ChainMintRequest,
  type RpcClient,
} from "@pontis/near-client";
import { z } from "zod";

const accountId = z.string().min(2).max(64);
const units = z.string().regex(/^(0|[1-9][0-9]*)$/);
const ms = z.number().int().nonnegative();
const state = z.enum(["ok", "breached", "stale", "no_attestation", "unmonitored"]);
const action = z.enum(["warn", "restrict_conversions", "pause_mint"]);

export const ChainCustodianSchema = z.object({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string().nullable(),
  attester_key: z.string(),
  status: z.enum(["active", "suspended", "retired"]),
  synthetic: z.boolean(),
  verification_status: z.string(),
  evidence: z.array(ChainEvidenceSchema),
  registered_by: accountId,
  registered_at_ms: ms,
});

export const ChainReserveStatusSchema = z.object({
  monitored: z.boolean(),
  state,
  action: action.nullable(),
  tolerance_bps: z.number().int(),
  max_reserve_age_ms: ms,
  attested_units: units,
  limit_units: units,
  circulating_units: units,
  headroom_units: units,
  ratio_bps: z.number().int().nonnegative().nullable(),
  oldest_as_of_ms: ms.nullable(),
  age_ms: ms.nullable(),
  supply_read_ms: ms.nullable(),
  restricts_conversions: z.boolean(),
  mint_paused: z.boolean(),
  simulated: z.boolean(),
  sources: z.array(z.string()),
});

export const ChainEscrowLedgerSchema = z.object({
  escrowed_in: units,
  burned: units,
  returned: units,
  held: units,
  open_amount: units,
});

export const ChainIssuerReliabilitySchema = z.object({
  issuer_id: z.string(),
  requested: z.number().int(),
  accepted: z.number().int(),
  fulfilled: z.number().int(),
  rejected: z.number().int(),
  expired: z.number().int(),
  accept_misses: z.number().int(),
  fulfil_misses: z.number().int(),
  reclaimed: z.number().int(),
  accept_latency_ms_total: units,
  settle_latency_ms_total: units,
  last_miss_ms: ms.nullable(),
  simulated: z.boolean(),
});

export type ChainCustodian = z.infer<typeof ChainCustodianSchema>;
export type ChainReserveStatus = z.infer<typeof ChainReserveStatusSchema>;
export type ChainEscrowLedger = z.infer<typeof ChainEscrowLedgerSchema>;
export type ChainIssuerReliability = z.infer<typeof ChainIssuerReliabilitySchema>;
export type { ChainMintRequest };

/** What the mirror refresh reads from the chain. */
export interface MirrorChain {
  custodian(id: string): Promise<ChainCustodian | null>;
  reserveStatus(representationId: string): Promise<ChainReserveStatus>;
  issuerReliability(issuerId: string): Promise<ChainIssuerReliability>;
  /** `get_mint_request`: `execute_mint` emits no event, so the mirror reads this to see `minting` and to close a request whose completion event it missed. */
  mintRequest(id: number): Promise<ChainMintRequest | null>;
}

/** What the reconciler's reserve and escrow rules read from the chain. */
export interface ReserveChain {
  reserveStatus(representationId: string): Promise<ChainReserveStatus>;
  /** Tokens the core holds in redemption escrow for the representation (`get_escrow_ledger`). */
  escrowHeld(representationId: string): Promise<string>;
}

/** The views above over RPC. */
export class CustodyViews implements MirrorChain, ReserveChain {
  constructor(
    private readonly rpc: RpcClient,
    private readonly coreId: string,
  ) {}

  async custodian(id: string): Promise<ChainCustodian | null> {
    const raw = await this.rpc.view(this.coreId, "get_custodian", { id });
    return z.nullable(ChainCustodianSchema).parse(raw);
  }

  async reserveStatus(representationId: string): Promise<ChainReserveStatus> {
    const raw = await this.rpc.view(this.coreId, "get_reserve_status", {
      representation_id: representationId,
    });
    return ChainReserveStatusSchema.parse(raw);
  }

  async issuerReliability(issuerId: string): Promise<ChainIssuerReliability> {
    const raw = await this.rpc.view(this.coreId, "get_issuer_reliability", {
      issuer_id: issuerId,
    });
    return ChainIssuerReliabilitySchema.parse(raw);
  }

  async mintRequest(id: number): Promise<ChainMintRequest | null> {
    const raw = await this.rpc.view(this.coreId, "get_mint_request", { id });
    return z.nullable(ChainMintRequestSchema).parse(raw);
  }

  async escrowHeld(representationId: string): Promise<string> {
    const raw = await this.rpc.view(this.coreId, "get_escrow_ledger", {
      representation_id: representationId,
    });
    return ChainEscrowLedgerSchema.parse(raw).held;
  }
}
