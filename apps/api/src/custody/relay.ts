// POST /v1/reserves/attestations (ADR 0020 section 10): relays a custodian's signed reserve
// attestation to `submit_reserve_attestation`. The signature is the authority; the relayer account
// only pays for the call and holds no custodian key and no user key. The contract decides whether
// the attestation counts, so a refusal on chain is passed back and nothing is stored here.

import type {
  SubmitReserveAttestationRequest,
  SubmitReserveAttestationResponse,
} from "@pontis/api-types";
import type { Db } from "@pontis/db";
import { AppError } from "../errors.ts";
import { RelayRefusedError, type ReserveRelayer } from "./chain.ts";
import { requireRepresentation } from "./service.ts";

export async function relayReserveAttestation(
  deps: { db: Db; relayer: ReserveRelayer | undefined; coreId: string },
  req: SubmitReserveAttestationRequest,
): Promise<SubmitReserveAttestationResponse> {
  if (!deps.relayer) {
    throw new AppError("NOT_FOUND", 404, "Reserve relay is not configured on this server");
  }
  const a = req.attestation;
  if (a.contract !== deps.coreId) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `The attestation is for ${a.contract}, not this protocol's contract ${deps.coreId}`,
    );
  }
  await requireRepresentation(deps.db, a.representationId);
  try {
    const { txHash } = await deps.relayer.submitReserveAttestation({
      attestation: {
        version: a.version,
        contract: a.contract,
        representation_id: a.representationId,
        custodian_id: a.custodianId,
        reserved_units: a.reservedUnits,
        as_of_ms: a.asOfMs,
        report_hash: a.reportHash,
        report_uri: a.reportUri,
        simulated: a.simulated,
        source: a.source,
      },
      signature: req.signature,
      publicKey: req.publicKey,
    });
    return {
      txHash,
      representationId: a.representationId,
      custodianId: a.custodianId,
      simulated: a.simulated,
    };
  } catch (error) {
    if (error instanceof RelayRefusedError) {
      throw new AppError(
        "ATTESTATION_REJECTED",
        422,
        `The contract refused the attestation: ${error.message}`,
      );
    }
    throw error;
  }
}
