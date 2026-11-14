// The browser's injected EIP-1193 wallet (MetaMask, Rabby, OKX, ...) on Ethereum Sepolia.
// Token reads go to a public RPC so the page works before a wallet connects.
import { config } from "../lib/config.ts";
import type { EvmAdapter } from "./types.ts";
import { EvmRejected } from "./types.ts";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (payload: unknown) => void): void;
  removeListener?(event: string, listener: (payload: unknown) => void): void;
}

const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_PARAMS = {
  chainId: SEPOLIA_CHAIN_ID,
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [config.evmRpcUrl],
  blockExplorerUrls: [config.evmExplorerUrl],
};
/** Set when the user disconnects here; injected wallets have no real "sign out". */
const FORGOTTEN_KEY = "pontis.evm.forgotten";
const RECEIPT_POLL_MS = 3_000;
const RECEIPT_TIMEOUT_MS = 5 * 60_000;

const injected = (): Eip1193 | undefined => (window as { ethereum?: Eip1193 }).ethereum;

function wallet(): Eip1193 {
  const provider = injected();
  if (!provider) throw new Error("No EVM wallet was found in this browser.");
  return provider;
}

const errorCode = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? Number((error as { code: unknown }).code)
    : undefined;

const errorText = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : "The wallet returned an error.";

/** A wallet request; a user rejection (EIP-1193 code 4001) becomes `EvmRejected`. */
async function ask<T>(method: string, params?: unknown[]): Promise<T> {
  try {
    return (await wallet().request(params ? { method, params } : { method })) as T;
  } catch (error) {
    if (errorCode(error) === 4001) throw new EvmRejected();
    throw error;
  }
}

/** Read-only JSON-RPC against the public Sepolia endpoint. */
async function read(to: string, data: string): Promise<string> {
  const response = await fetch(config.evmRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!response.ok || !payload.result || payload.result === "0x")
    throw new Error(payload.error?.message ?? "The Sepolia RPC did not answer the token read.");
  return payload.result;
}

async function ensureSepolia(): Promise<void> {
  if ((await ask<string>("eth_chainId")).toLowerCase() === SEPOLIA_CHAIN_ID) return;
  try {
    await ask("wallet_switchEthereumChain", [{ chainId: SEPOLIA_CHAIN_ID }]);
  } catch (error) {
    // 4902: the wallet does not know Sepolia yet.
    if (errorCode(error) !== 4902) throw error;
    await ask("wallet_addEthereumChain", [SEPOLIA_PARAMS]);
  }
}

const forgotten = (): boolean => {
  try {
    return localStorage.getItem(FORGOTTEN_KEY) === "1";
  } catch {
    return false;
  }
};
const setForgotten = (value: boolean): void => {
  try {
    if (value) localStorage.setItem(FORGOTTEN_KEY, "1");
    else localStorage.removeItem(FORGOTTEN_KEY);
  } catch {
    // Storage can be unavailable in private windows; the session still works in memory.
  }
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function createInjectedWallet(): EvmAdapter {
  return {
    kind: "injected",
    available: () => !!injected(),
    async account() {
      if (!injected() || forgotten()) return null;
      return (await ask<string[]>("eth_accounts"))[0] ?? null;
    },
    async connect() {
      const account = (await ask<string[]>("eth_requestAccounts"))[0] ?? null;
      if (account) {
        setForgotten(false);
        await ensureSepolia();
      }
      return account;
    },
    async disconnect() {
      setForgotten(true);
    },
    async send(from, tx) {
      if (tx.chain !== "ethereum-sepolia")
        throw new Error("This call is not for Ethereum Sepolia, so this wallet cannot send it.");
      await ensureSepolia();
      const call = { from, to: tx.to, data: tx.data, value: `0x${BigInt(tx.value).toString(16)}` };
      // Re-simulate right before signing: an earlier call in the plan (an approval) changes
      // whether this one succeeds, so the API's own simulation is not enough.
      try {
        await ask("eth_call", [call, "latest"]);
      } catch (error) {
        if (error instanceof EvmRejected) throw error;
        throw new Error(`The call would revert, so it was not sent. ${errorText(error)}`, {
          cause: error,
        });
      }
      return ask<string>("eth_sendTransaction", [call]);
    },
    async confirm(hash) {
      const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const receipt = await ask<{ status?: string } | null>("eth_getTransactionReceipt", [hash]);
        if (receipt) {
          if (receipt.status === "0x1") return;
          throw new Error("The transaction was mined but reverted.");
        }
        await sleep(RECEIPT_POLL_MS);
      }
      throw new Error("Timed out waiting for the transaction to be mined.");
    },
    async decimals(token) {
      return Number(BigInt(await read(token, "0x313ce567")));
    },
    async balanceOf(token, owner) {
      const padded = owner.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      return BigInt(await read(token, `0x70a08231${padded}`));
    },
    onAccountChange(listener) {
      const provider = injected();
      if (!provider?.on) return () => {};
      const handle = (accounts: unknown) =>
        listener(forgotten() ? null : ((accounts as string[])[0] ?? null));
      provider.on("accountsChanged", handle);
      return () => provider.removeListener?.("accountsChanged", handle);
    },
  };
}
