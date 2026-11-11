// The custody rows only the `full` tier has (the demo tier's are in catalogue-custody-reps.ts).
// Fiction: nothing is custodied or backed, every attestation is simulated.

import { LH, MG, NQ, OB, QF, row } from "./catalogue-custody-reps.ts";
import type { PlannedCustody } from "./catalogue-custody-types.ts";

const CW = "calderwick-fund-custody-sim";
const WX = "wexcombe-spv-registry-sim";
const TM = "tamarisk-reserve-trust-sim";

export const FULL_CUSTODY: readonly PlannedCustody[] = [
  // Treasury, money-market and bond funds
  row("full", "tustb-h", NQ, "omnibus", "healthy"),
  row("full", "tustb-o", CW, "segregated", "healthy", { coverBps: 10_300 }),
  row("full", "ttb3m-e", CW, "segregated", "healthy", { coverBps: 10_100 }),
  row("full", "tlad-e", CW, "segregated", "healthy", { coverBps: 10_050 }),
  row("full", "tmmfusd-e", CW, "omnibus", "warn_only"),
  row("full", "tmmfeur-e", CW, "omnibus", "healthy", { coverBps: 10_400 }),
  row("full", "tmmfeur-c", CW, "segregated", "never_attested"),
  row("full", "tigc-c", NQ, "segregated", "healthy", { coverBps: 10_150 }),
  row("full", "tigc-r", CW, "omnibus", "pause_mint", { gatedMint: true }),
  // Credit notes
  row("full", "tcredit-1", NQ, "omnibus", "healthy"),
  row("full", "tsme-b", NQ, "segregated", "healthy", { coverBps: 10_250 }),
  row("full", "ttrd-b", NQ, "segregated", "healthy", { coverBps: 10_100 }),
  row("full", "tcredit-b", NQ, "omnibus", "healthy"),
  // Vaulted precious metals, oil and copper
  row("full", "tsil-a", LH, "segregated", "healthy", { coverBps: 10_200 }),
  row("full", "tsil-w", OB, "omnibus", "healthy"),
  row("full", "toil-d", OB, "omnibus", "healthy", { coverBps: 10_050 }),
  row("full", "toil-a", LH, "segregated", "healthy", { coverBps: 10_100 }),
  row("full", "tcu-d", OB, "omnibus", "thin"),
  row("full", "tcu-w", OB, "omnibus", "healthy"),
  // Real estate (a fictional SPV record)
  row("full", "tvilla-1", WX, "segregated", "healthy"),
  row("full", "tcreo-r", WX, "segregated", "healthy", { coverBps: 10_100 }),
  row("full", "tcrel-r", WX, "segregated", "healthy", { coverBps: 10_050 }),
  row("full", "tcrel-t", WX, "segregated", "healthy"),
  row("full", "tresi-r", WX, "segregated", "healthy", { coverBps: 10_150 }),
  // Stable-value tokens (nothing backs the peg)
  row("full", "teur-e", QF, "on_chain_vault", "healthy", { coverBps: 10_100 }),
  row("full", "tjpy-m", TM, "segregated", "healthy", { coverBps: 10_200 }),
  row("full", "tusd-h", TM, "segregated", "healthy"),
  // Carbon
  row("full", "tcbn-d", MG, "omnibus", "healthy"),
  row("full", "tcbe-w", MG, "segregated", "healthy", { coverBps: 10_300 }),
];
