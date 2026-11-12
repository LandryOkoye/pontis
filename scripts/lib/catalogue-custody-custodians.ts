// The invented custodians of the demo catalogue. Every name carries "(SIMULATED)" and none imitates
// a real custodian, bank, auditor or vault operator (scripts/test/real-brands.ts denylists the
// real ones). Each holds the public dev reserve-attester key (packages/dev-keys) because the
// simulated custodian signs for all of them.

import type { PlannedCustodian } from "./catalogue-custody-types.ts";

export const CUSTODIANS: readonly PlannedCustodian[] = [
  {
    id: "northquay-custody-sim",
    name: "Northquay Securities Custody (SIMULATED)",
    jurisdiction: "LU",
    kind: "Fund and note custodian: Treasury, money-market and bond funds, credit notes",
    tier: "demo",
  },
  {
    id: "lindenhall-vaults-sim",
    name: "Lindenhall Vault Services (SIMULATED)",
    jurisdiction: "CH",
    kind: "Vaulted precious metal and commodity storage, segregated bars",
    tier: "demo",
  },
  {
    id: "orrinvale-bullion-sim",
    name: "Orrinvale Bullion Storage (SIMULATED)",
    jurisdiction: "SG",
    kind: "Vaulted precious metal and industrial commodity storage, omnibus stock",
    tier: "demo",
  },
  {
    id: "ferncliff-vault-sim",
    name: "Ferncliff On-Chain Vault (SIMULATED)",
    jurisdiction: "KY",
    kind: "On-chain vault: the reserve is a simulated pool, not an account at a firm",
    tier: "demo",
  },
  {
    id: "mossgrove-registry-sim",
    name: "Mossgrove Carbon Registry Trustee (SIMULATED)",
    jurisdiction: "BR",
    kind: "Carbon credit registry trustee: a fictional serial-number ledger",
    tier: "demo",
  },
  {
    id: "calderwick-fund-custody-sim",
    name: "Calderwick Fund Custody (SIMULATED)",
    jurisdiction: "IE",
    kind: "Second fund custodian: Treasury, money-market and bond funds",
    tier: "full",
  },
  {
    id: "wexcombe-spv-registry-sim",
    name: "Wexcombe Property SPV Registry (SIMULATED)",
    jurisdiction: "DE",
    kind: "Real-estate SPV record keeper: a fictional property record, no deed or title",
    tier: "full",
  },
  {
    id: "tamarisk-reserve-trust-sim",
    name: "Tamarisk Reserve Trust (SIMULATED)",
    jurisdiction: "KY",
    kind: "Stable-value reserve trustee: a fictional reserve account, nothing backs the peg",
    tier: "full",
  },
];
