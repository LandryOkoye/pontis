// Seeds the operational steps: quote signer, allowlist, token registration and vault funding.

import { KeyPair } from "near-api-js";
import { admin, type Chain } from "./chain.ts";

const WHOLE_TOKENS = { a: 1_000n * 10n ** 6n, b: 10_000n * 10n ** 8n };

export interface SeedOptions {
  /** `ed25519:...` secret key of the quote signer; generated if absent and no signer is set. */
  quoteSignerSecretKey?: string;
  /** Extra accounts to allowlist on both representations. */
  allowlist?: string[];
}

export interface SeedResult {
  generatedQuoteSignerSecretKey?: string;
}

export async function seedOps(chain: Chain, options: SeedOptions): Promise<SeedResult> {
  const { coreId, tokenAId, tokenBId, deployerId } = chain.config;
  const core = <T>(method: string, args: Record<string, unknown> = {}) =>
    chain.view<T | null>(coreId, method, args);
  const act = (method: string, args: Record<string, unknown>) => admin(chain, coreId, method, args);
  const result: SeedResult = {};

  if (!(await core<string>("get_quote_signer"))) {
    const keyPair = options.quoteSignerSecretKey
      ? KeyPair.fromString(options.quoteSignerSecretKey as `ed25519:${string}`)
      : KeyPair.fromRandom("ed25519");
    await act("set_quote_signer", { public_key: keyPair.getPublicKey().toString() });
    console.log(`set quote signer ${keyPair.getPublicKey().toString()}`);
    if (!options.quoteSignerSecretKey) result.generatedQuoteSignerSecretKey = keyPair.toString();
  } else {
    console.log("quote signer already set; left unchanged");
  }

  const accounts = [...new Set([deployerId, ...(options.allowlist ?? [])])];
  for (const representation_id of ["tgold-a", "tgold-b"]) {
    await act("set_allowlist", { representation_id, account_ids: accounts, allowed: true });
  }
  console.log(`allowlisted ${accounts.join(", ")}`);

  for (const token of [tokenAId, tokenBId]) {
    const registered = await chain.view<unknown>(token, "storage_balance_of", {
      account_id: coreId,
    });
    if (!registered) {
      await chain.call(
        token,
        "storage_deposit",
        { account_id: coreId, registration_only: true },
        { deposit: 10n ** 22n },
      );
      console.log(`registered ${coreId} on ${token}`);
    }
  }
  for (const [rep, token, target] of [
    ["tgold-a", tokenAId, WHOLE_TOKENS.a],
    ["tgold-b", tokenBId, WHOLE_TOKENS.b],
  ] as const) {
    const held = BigInt((await core<string>("get_inventory", { representation_id: rep })) ?? "0");
    if (held >= target) continue;
    const top = target - held;
    await admin(chain, token, "mint", { account_id: deployerId, amount: top.toString() });
    await chain.call(
      token,
      "ft_transfer_call",
      { receiver_id: coreId, amount: top.toString(), msg: "fund_vault" },
      { deposit: 1n },
    );
    console.log(`funded vault ${rep} with ${top}`);
  }
  return result;
}
