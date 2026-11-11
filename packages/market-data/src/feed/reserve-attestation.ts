// Signed reserve attestations (ADR 0020 section 3). The same ed25519 conventions as the price and
// NAV attestations, its own domain so no other signature can be replayed as a reserve figure:
// `b"pontis-reserve-v1" ++ borsh(payload)`, rebuilt by `submit_reserve_attestation` on chain.
// `test-vectors/reserve-attestation.json` pins the layout for TypeScript, Python and Rust.
//
// A reserve figure is signed by a custodian's key and is only ever a claim: in the demo the
// custodian is a simulator, so every figure carries `simulated: true`.

import { sign } from "node:crypto";
import { U128_MAX } from "@pontis/domain";
import type { QuoteKey } from "@pontis/quote-engine";
import { le, str } from "./borsh.ts";

export const RESERVE_ATTESTATION_DOMAIN = "pontis-reserve-v1";
export const RESERVE_ATTESTATION_VERSION = 1;

const HASH_HEX = /^[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** What a custodian signs: its reserve of one representation at `asOfMs`, in token smallest units. */
export interface ReserveAttestation {
  contract: string;
  representationId: string;
  custodianId: string;
  /** In smallest units of the representation token, the unit of `ft_total_supply`. */
  reservedUnits: bigint;
  asOfMs: number;
  /** 64 lowercase hex characters: the sha256 of the (synthetic) report. */
  reportHash: string;
  reportUri: string;
  simulated: boolean;
  source: string;
}

/** The JSON argument of `submit_reserve_attestation` (`attestation`). */
export type ReserveAttestationJson = {
  version: number;
  contract: string;
  representation_id: string;
  custodian_id: string;
  reserved_units: string;
  as_of_ms: number;
  report_hash: string;
  report_uri: string;
  simulated: boolean;
  source: string;
};

function ms(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} outside the supported range`);
  }
  return BigInt(value);
}

function units(value: bigint): bigint {
  if (value < 0n || value > U128_MAX) throw new RangeError("reservedUnits outside u128");
  return value;
}

function hash(value: string): Buffer {
  if (!HASH_HEX.test(value)) throw new RangeError("reportHash must be 64 lowercase hex characters");
  return Buffer.from(value, "hex");
}

/** The exact bytes a custodian signs for `att`; the contract is part of `att`. */
export function reserveAttestationMessage(att: ReserveAttestation): Buffer {
  return Buffer.concat([
    Buffer.from(RESERVE_ATTESTATION_DOMAIN, "utf8"),
    Buffer.from([RESERVE_ATTESTATION_VERSION]),
    str(att.contract),
    str(att.representationId),
    str(att.custodianId),
    le(units(att.reservedUnits), 16),
    le(ms(att.asOfMs, "asOfMs"), 8),
    hash(att.reportHash),
    str(att.reportUri),
    Buffer.from([att.simulated ? 1 : 0]),
    str(att.source),
  ]);
}

/** The `attestation` argument as the contract's JSON: the amount a decimal string, the hash hex. */
export function reserveAttestationJson(att: ReserveAttestation): ReserveAttestationJson {
  return {
    version: RESERVE_ATTESTATION_VERSION,
    contract: att.contract,
    representation_id: att.representationId,
    custodian_id: att.custodianId,
    reserved_units: units(att.reservedUnits).toString(),
    as_of_ms: Number(ms(att.asOfMs, "asOfMs")),
    report_hash: hash(att.reportHash).toString("hex"),
    report_uri: att.reportUri,
    simulated: att.simulated,
    source: att.source,
  };
}

/** The inverse of `reserveAttestationJson`; throws on anything the contract's parser would refuse. */
export function parseReserveAttestation(json: ReserveAttestationJson): ReserveAttestation {
  if (json.version !== RESERVE_ATTESTATION_VERSION) {
    throw new RangeError(`unsupported reserve attestation version ${json.version}`);
  }
  if (!DECIMAL.test(json.reserved_units)) {
    throw new RangeError("reserved_units must be a decimal string");
  }
  const att: ReserveAttestation = {
    contract: json.contract,
    representationId: json.representation_id,
    custodianId: json.custodian_id,
    reservedUnits: BigInt(json.reserved_units),
    asOfMs: json.as_of_ms,
    reportHash: json.report_hash,
    reportUri: json.report_uri,
    simulated: json.simulated,
    source: json.source,
  };
  reserveAttestationMessage(att); // range and hash-format checks
  return att;
}

/** Base64 ed25519 signature over the message of `att`: the `signature` argument. */
export function signReserveAttestation(att: ReserveAttestation, key: QuoteKey): string {
  return sign(null, reserveAttestationMessage(att), key.privateKey).toString("base64");
}

/** The arguments of `submit_reserve_attestation`: what a relayer sends, nothing else. */
// A type alias, not an interface: it must be assignable to the `Record<string, unknown>` call arguments.
export type SubmitReserveAttestationArgs = {
  attestation: ReserveAttestationJson;
  /** Base64 ed25519 signature. */
  signature: string;
  public_key: string;
};

export function submitReserveAttestationArgs(
  att: ReserveAttestation,
  key: QuoteKey,
): SubmitReserveAttestationArgs {
  return {
    attestation: reserveAttestationJson(att),
    signature: signReserveAttestation(att, key),
    public_key: key.publicKey,
  };
}
