// Vault solvency (ADR 0008): the core must hold at least as many tokens as its inventory records.

import { assetRepresentations, type Db } from "@pontis/db";
import type { VaultReading } from "@pontis/api-types";
import type { Candidate } from "./finding.ts";

/** The chain reads the vault check needs; `CoreClient` and `TokenClient` provide them. */
export interface VaultChain {
  inventory(representationId: string): Promise<string>;
  /** Tokens `holder` owns on the token contract `tokenAccountId`. */
  balanceOf(tokenAccountId: string, holder: string): Promise<string>;
}

export async function readVaults(
  db: Db,
  chain: VaultChain,
  coreId: string,
): Promise<VaultReading[]> {
  const reps = await db
    .select({ id: assetRepresentations.id, accountId: assetRepresentations.accountId })
    .from(assetRepresentations);
  const readings: VaultReading[] = [];
  for (const rep of reps) {
    // Inventory first: a funding between the two reads can only make the balance look larger.
    const inventory = await chain.inventory(rep.id);
    const balance = await chain.balanceOf(rep.accountId, coreId);
    readings.push({
      representationId: rep.id,
      tokenAccountId: rep.accountId,
      inventory,
      balance,
    });
  }
  return readings;
}

export function vaultCandidates(readings: readonly VaultReading[]): Candidate[] {
  return readings.flatMap((r): Candidate[] => {
    const inventory = BigInt(r.inventory);
    const balance = BigInt(r.balance);
    if (inventory > balance) {
      return [
        {
          key: `vault:${r.representationId}:insolvent`,
          kind: "VAULT_INSOLVENT",
          severity: "critical",
          subject: r.representationId,
          message: `Inventory ${r.inventory} exceeds the ${r.balance} tokens the core holds`,
        },
      ];
    }
    if (balance > inventory) {
      return [
        {
          key: `vault:${r.representationId}:untracked`,
          kind: "VAULT_UNTRACKED_BALANCE",
          severity: "warning",
          subject: r.representationId,
          message: `The core holds ${balance - inventory} more tokens than its inventory records`,
        },
      ];
    }
    return [];
  });
}
