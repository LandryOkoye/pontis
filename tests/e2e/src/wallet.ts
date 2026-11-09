// A user's wallet, played by a script: it holds a key and signs exactly what the API returns.

import type { WalletAction } from "@pontis/api-types";
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";
import { z } from "zod";
import { admin } from "../../../scripts/lib/chain.ts";
import type { World } from "./world.ts";
import { randomBytes } from "node:crypto";

export interface User {
  accountId: string;
  wallet: Account;
}

const NEAR = 10n ** 24n;
const STORAGE_DEPOSIT = 10n ** 22n;

/** A funded account; optionally on both allowlists, registered on TGOLD-A and holding some of it. */
export async function createUser(
  world: World,
  options: { allowlisted: boolean; mintA?: bigint },
): Promise<User> {
  const { chain, config } = world;
  const key = KeyPair.fromRandom("ed25519");
  const prefix = `e2e${randomBytes(4).toString("hex")}`;
  await chain.account.createSubAccount({
    accountOrPrefix: prefix,
    publicKey: key.getPublicKey(),
    nearToTransfer: 5n * NEAR,
  });
  const accountId = `${prefix}.${config.deployerId}`;
  if (options.allowlisted) {
    for (const representation_id of ["tgold-a", "tgold-b"]) {
      await admin(chain, config.coreId, "set_allowlist", {
        representation_id,
        account_ids: [accountId],
        allowed: true,
      });
    }
  }
  if (options.mintA) {
    await chain.call(
      config.tokenAId,
      "storage_deposit",
      { account_id: accountId, registration_only: true },
      { deposit: STORAGE_DEPOSIT },
    );
    await admin(chain, config.tokenAId, "mint", {
      account_id: accountId,
      amount: options.mintA.toString(),
    });
  }
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  return {
    accountId,
    wallet: new Account(accountId, provider, key.toString() as `ed25519:${string}`),
  };
}

const OutcomeSchema = z.object({ transaction: z.object({ hash: z.string() }) });

/** Signs and sends each action as its own transaction, in order; returns the last hash. */
export async function execute(user: User, actions: WalletAction[]): Promise<string> {
  let hash = "";
  for (const action of actions) {
    const outcome = await user.wallet.callFunctionRaw({
      contractId: action.receiverId,
      methodName: action.methodName,
      args: action.args,
      gas: BigInt(action.gas),
      deposit: BigInt(action.deposit),
      waitUntil: "FINAL",
    });
    hash = OutcomeSchema.parse(outcome).transaction.hash;
  }
  return hash;
}

export async function balance(world: World, token: string, accountId: string): Promise<bigint> {
  const raw = await world.chain.view<string>(token, "ft_balance_of", { account_id: accountId });
  if (raw === undefined) throw new Error(`${token} did not answer ft_balance_of`);
  return BigInt(raw);
}
