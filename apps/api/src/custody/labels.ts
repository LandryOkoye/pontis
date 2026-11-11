// The honesty labels of every custody, reserve and redemption response (ADR 0009, ADR 0020).
// The custodians and issuers of the demo are simulators; nothing is custodied, backed or audited.

export const CUSTODY_NOTICE =
  "Simulated test figures from fictional parties. Nothing is custodied, backed, audited or redeemable for value.";

/** The source of a record the registrar typed in, as opposed to a figure a signer attested. */
export const REGISTRAR_SOURCE = "registrar_entry";
/** The source of redemption records and issuer counters: the demo issuer back-office. */
export const ISSUER_SOURCE = "simulated_issuer";

export const iso = (ms: number): string => new Date(ms).toISOString();
export const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));
