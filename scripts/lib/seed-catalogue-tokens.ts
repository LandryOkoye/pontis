// The token steps of the catalogue seed: starting supply, faucet, allowlist and vault inventory.
// Each step reads current state first, so re-running is safe.

import { admin, type Chain } from "./chain.ts";

export interface TokenPlan {
  representation: { id: string; symbol: string; account_id: string };
  /** Smallest units the owner holds in total after seeding. */
  startingSupply: bigint;
  /** Smallest units funded into the vault; 0 for a token with no approved relationship. */
  vaultInventory: bigint;
  /** Whether the token's testnet faucet stays enabled. */
  faucet: boolean;
}

/** Registers the core on a token's storage so it can receive transfers (vault funding, redemptions). */
export async function ensureCoreRegistered(chain: Chain, token: string): Promise<void> {
  const { coreId } = chain.config;
  if (await chain.view<unknown>(token, "storage_balance_of", { account_id: coreId })) return;
  await chain.call(
    token,
    "storage_deposit",
    { account_id: coreId, registration_only: true },
    { deposit: 10n ** 22n },
  );
  console.log(`registered ${coreId} on ${token}`);
}

export async function seedTokens(
  chain: Chain,
  tokens: readonly TokenPlan[],
  allowlist: readonly string[],
): Promise<void> {
  const { coreId, deployerId } = chain.config;
  const core = <T>(method: string, args: Record<string, unknown> = {}) =>
    chain.view<T | null>(coreId, method, args);
  for (const { representation: rep, startingSupply, vaultInventory, faucet } of tokens) {
    const token = rep.account_id;
    const view = <T>(method: string, args: Record<string, unknown>) =>
      chain.view<T>(token, method, args);

    // A token whose minter is the core is gated (the custody seed does that): the owner mint is
    // closed, and a redemption burn lowers its supply on purpose, so it is not topped up again.
    const gated = Boolean(await view<string | null>("get_minter", {}));
    const supply = BigInt((await view<string>("ft_total_supply", {})) ?? "0");
    if (supply < startingSupply && !gated) {
      await admin(chain, token, "mint", {
        account_id: deployerId,
        amount: (startingSupply - supply).toString(),
      });
      console.log(`minted ${startingSupply - supply} ${rep.symbol} to ${deployerId}`);
    }
    const faucetConfig = await view<{
      enabled: boolean;
      max_per_call: string;
      cooldown_ms: number;
    }>("faucet_config", {});
    if (!faucet && faucetConfig?.enabled) {
      await admin(chain, token, "set_faucet_config", {
        enabled: false,
        max_per_call: faucetConfig.max_per_call,
        cooldown_ms: faucetConfig.cooldown_ms,
      });
      console.log(`disabled the faucet of ${rep.symbol}`);
    }
    await admin(chain, coreId, "set_allowlist", {
      representation_id: rep.id,
      account_ids: [...allowlist],
      allowed: true,
    });

    if (vaultInventory === 0n) continue;
    await ensureCoreRegistered(chain, token);
    const held = BigInt(
      (await core<string>("get_inventory", { representation_id: rep.id })) ?? "0",
    );
    if (held >= vaultInventory) continue;
    const top = vaultInventory - held;
    const owned = BigInt((await view<string>("ft_balance_of", { account_id: deployerId })) ?? "0");
    if (owned < top && !gated) {
      await admin(chain, token, "mint", {
        account_id: deployerId,
        amount: (top - owned).toString(),
      });
    }
    await chain.call(
      token,
      "ft_transfer_call",
      { receiver_id: coreId, amount: top.toString(), msg: "fund_vault" },
      { deposit: 1n },
    );
    console.log(`funded vault ${rep.id} with ${top}`);
  }
  console.log(`allowlisted ${allowlist.join(", ")} on every catalogue representation`);
}
