import type {
  ChainCustodian,
  ChainCustodyLink,
  ChainIssuerReliability,
  ChainPage,
  ChainRedemption,
  ChainRedemptionTerms,
  ChainReserveRecord,
  ChainReserveStatus,
} from "@pontis/near-client";

/**
 * What the custody, reserve and redemption endpoints read (ADR 0020). `CoreClient` implements it
 * straight from the contract's views. The indexer's mirror tables can later implement the same
 * interface for the history-shaped reads without the services changing.
 */
export interface CustodyRepository {
  getCustodians(fromIndex: number, limit: number): Promise<ChainPage<ChainCustodian>>;
  getCustodian(id: string): Promise<ChainCustodian | null>;
  getCustodyLink(representationId: string): Promise<ChainCustodyLink | null>;
  getReserveStatus(representationId: string): Promise<ChainReserveStatus>;
  getReserveAttestations(representationId: string): Promise<ChainReserveRecord[]>;
  getReserveHistory(
    representationId: string,
    fromIndex: number,
    limit: number,
  ): Promise<ChainPage<ChainReserveRecord>>;
  getRedemptionTerms(representationId: string): Promise<ChainRedemptionTerms | null>;
  getRedemption(id: number): Promise<ChainRedemption | null>;
  getRedemptionsByUser(
    accountId: string,
    fromIndex: number,
    limit: number,
  ): Promise<ChainPage<ChainRedemption>>;
  getRedemptionsByRepresentation(
    representationId: string,
    fromIndex: number,
    limit: number,
  ): Promise<ChainPage<ChainRedemption>>;
  getIssuerReliability(issuerId: string): Promise<ChainIssuerReliability>;
}

/** The arguments of `submit_reserve_attestation`, in the contract's JSON shape. */
export interface ReserveAttestationCall {
  attestation: Record<string, unknown>;
  /** Base64 ed25519 signature. */
  signature: string;
  publicKey: string;
}

/** The contract refused the relayed attestation (or the transaction failed): the reason, for the caller. */
export class RelayRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayRefusedError";
  }
}

/**
 * Sends `submit_reserve_attestation` as the relayer account. The signature is the authority: the
 * relayer holds no custodian key and no user key, and only pays for the call.
 */
export interface ReserveRelayer {
  /** Resolves with the transaction hash; rejects with `RelayRefusedError` when the chain refused. */
  submitReserveAttestation(call: ReserveAttestationCall): Promise<{ txHash: string }>;
}
