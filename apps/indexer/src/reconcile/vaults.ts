// Vault solvency (ADR 0008): the core must hold at least as many tokens as its inventory records.

import { assetRepresentations, type Db } from "@pontis/db";
import type { VaultReading } from "@pontis/api-types";
import type { ReserveChain } from "../chain-views.ts";
import type { Candidate } from "./finding.ts";
import { escrowRepresentations } from "./redemptions.ts";

/** The chain reads the vault check needs; `CoreClient` and `TokenClient` provide them. */
export interface VaultChain {
  inventory(representationId: string): Promise<string>;
  /** Tokens `holder` owns on the token contract `tokenAccountId`. */
  balanceOf(tokenAccountId: string, holder: string): Promise<string>;
}

export interface VaultReadings {
  /** One per representation; `inventory` counts everything the core accounts for, including redemption escrow. */
  readings: VaultReading[];
  /** The core's redemption escrow books per representation that has any (ADR 0020 section 7). */
  escrowHeld: Map<string, bigint>;
}

/**
 * Reads each vault. Tokens held in redemption escrow are tokens the core holds on top of its
 * inventory, so they count towards the accounted amount; only representations with redemption
 * terms or requests are asked for their escrow books.
 */
export async function readVaults(
  db: Db,
  chain: VaultChain & Pick<ReserveChain, "escrowHeld">,
  coreId: string,
): Promise<VaultReadings> {
  const escrowReps = await escrowRepresentations(db);
  const reps = await db
    .select({ id: assetRepresentations.id, accountId: assetRepresentations.accountId })
    .from(assetRepresentations);
  const readings: VaultReading[] = [];
  const escrowHeld = new Map<string, bigint>();
  for (const rep of reps) {
    // Books first: a funding between the reads can only make the balance look larger.
    let inventory = BigInt(await chain.inventory(rep.id));
    if (escrowReps.has(rep.id)) {
      const held = BigInt(await chain.escrowHeld(rep.id));
      escrowHeld.set(rep.id, held);
      inventory += held;
    }
    const balance = await chain.balanceOf(rep.accountId, coreId);
    readings.push({
      representationId: rep.id,
      tokenAccountId: rep.accountId,
      inventory: inventory.toString(),
      balance,
    });
  }
  return { readings, escrowHeld };
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
