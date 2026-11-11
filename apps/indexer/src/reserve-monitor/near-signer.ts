// A monitor account that signs `refresh_supply` and `evaluate_reserve` with a key from the
// environment. Both methods are permissionless, so the account needs only a little testnet NEAR for
// gas and the 1 yocto deposit; it holds no role and no value. Testnet and sandbox only: the key is
// a plain environment variable.

import { Account, JsonRpcProvider } from "near-api-js";
import type { MonitorSigner } from "./monitor.ts";

const MAX_GAS = 300_000_000_000_000n;
const ONE_YOCTO = 1n;

export interface NearSignerOptions {
  rpcUrl: string;
  coreId: string;
  accountId: string;
  /** `ed25519:<base58>` secret key of the monitor account. */
  privateKey: string;
}

export function nearMonitorSigner(options: NearSignerOptions): MonitorSigner {
  const provider = new JsonRpcProvider({ url: options.rpcUrl });
  const account = new Account(
    options.accountId,
    provider,
    options.privateKey as `ed25519:${string}`,
  );
  return {
    accountId: options.accountId,
    async call(method, args) {
      // FINAL waits for the whole receipt tree, so the supply read's callback has run by return.
      await account.callFunction({
        contractId: options.coreId,
        methodName: method,
        args,
        deposit: ONE_YOCTO,
        gas: MAX_GAS,
        waitUntil: "FINAL",
      });
    },
  };
}
