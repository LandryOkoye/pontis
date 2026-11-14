// Live wallet: NEAR wallet selector, Testnet only. Browser-extension wallets come first; the
// selector marks each one as installed or not, and drops any that do not support Testnet.
// Loaded lazily so none of the wallet libraries are in the first paint bundle.
import type { WalletSelector } from "@near-wallet-selector/core";
import { internalActionToNaj, setupWalletSelector } from "@near-wallet-selector/core";
import { setupBitgetWallet } from "@near-wallet-selector/bitget-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";
import { setupOKXWallet } from "@near-wallet-selector/okx-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { config } from "../lib/config.ts";
import { viewCall } from "./rpc.ts";
import type { PendingContext, SendResult, WalletAction, WalletAdapter } from "./types.ts";
import { WalletRedirected, WalletRejected } from "./types.ts";

const PENDING_KEY = "pontis.wallet.pending";

interface Outcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
  status?: unknown;
}

function activeAccount(selector: WalletSelector): string | null {
  return selector.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
}

/** One transaction per run of actions that share a receiver, keeping the order. */
function toTransactions(actions: WalletAction[]) {
  const transactions: { receiverId: string; actions: ReturnType<typeof internalActionToNaj>[] }[] =
    [];
  for (const action of actions) {
    const naj = internalActionToNaj({
      type: "FunctionCall",
      params: {
        methodName: action.methodName,
        args: action.args,
        gas: action.gas,
        deposit: action.deposit,
      },
    });
    const last = transactions[transactions.length - 1];
    if (last && last.receiverId === action.receiverId) last.actions.push(naj);
    else transactions.push({ receiverId: action.receiverId, actions: [naj] });
  }
  return transactions;
}

function failureMessage(status: unknown): string | null {
  if (typeof status !== "object" || status === null || !("Failure" in status)) return null;
  const text = JSON.stringify((status as { Failure: unknown }).Failure);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  return panic?.[1] ?? "The transaction failed on chain.";
}

interface InjectedWallets {
  nightly?: { near?: unknown };
  okxwallet?: { near?: unknown };
  near?: { isSender?: boolean };
  bitkeep?: { near?: unknown };
}

/**
 * The wallets offered, with any browser extension the visitor already has listed first.
 * Extensions announce themselves by injecting an object into the page; web wallets (Meteor,
 * HOT, MyNearWallet) need nothing installed and keep their fixed order after those.
 */
function walletModules() {
  const page = window as unknown as InjectedWallets;
  const extensions = [
    { installed: Boolean(page.nightly?.near), module: setupNightly() },
    { installed: Boolean(page.okxwallet?.near), module: setupOKXWallet() },
    { installed: Boolean(page.near?.isSender), module: setupSender() },
    { installed: Boolean(page.bitkeep?.near), module: setupBitgetWallet() },
  ];
  return [
    ...extensions.filter((e) => e.installed).map((e) => e.module),
    setupMeteorWallet(),
    setupHotWallet(),
    setupMyNearWallet(),
    ...extensions.filter((e) => !e.installed).map((e) => e.module),
  ];
}

export async function createNearWallet(): Promise<WalletAdapter> {
  const selector = await setupWalletSelector({
    network: config.networkId,
    modules: walletModules(),
  });
  const modal: WalletSelectorModal = setupModal(selector, {
    theme: "dark",
    description: "Pontis runs on NEAR Testnet only. Use a testnet account.",
  });

  return {
    kind: "near",
    ready: async () => activeAccount(selector),
    connect: () =>
      new Promise((resolve) => {
        const subscription = modal.on("onHide", () => {
          subscription.remove();
          resolve(activeAccount(selector));
        });
        modal.show();
      }),
    async disconnect() {
      const wallet = await selector.wallet();
      await wallet.signOut();
    },
    async send(actions: WalletAction[], context?: PendingContext): Promise<SendResult> {
      const wallet = await selector.wallet();
      if (context) sessionStorage.setItem(PENDING_KEY, JSON.stringify(context));
      let outcomes: Outcome[] | void;
      try {
        outcomes = (await wallet.signAndSendTransactions({
          transactions: toTransactions(actions),
        })) as Outcome[] | void;
      } catch (error) {
        sessionStorage.removeItem(PENDING_KEY);
        const message = error instanceof Error ? error.message : String(error);
        if (/reject|cancel|denied|closed|user/i.test(message)) throw new WalletRejected();
        throw new Error(message || "The wallet could not send the transaction.", { cause: error });
      }
      // A redirect wallet navigates away and answers through the return URL instead.
      if (!outcomes || outcomes.length === 0) throw new WalletRedirected();
      sessionStorage.removeItem(PENDING_KEY);
      const last = outcomes[outcomes.length - 1] as Outcome;
      const failed = outcomes.map((o) => failureMessage(o.status)).find(Boolean);
      const txHash = last.transaction?.hash ?? last.transaction_outcome?.id;
      if (!txHash) throw new Error("The wallet did not return a transaction hash.");
      if (failed) throw Object.assign(new Error(failed), { txHash });
      return { txHash };
    },
    view: viewCall,
    onAccountChange(listener) {
      const subscription = selector.store.observable.subscribe(() =>
        listener(activeAccount(selector)),
      );
      return () => subscription.unsubscribe();
    },
  };
}

export interface RedirectResult {
  context: PendingContext;
  txHash: string | null;
  error: string | null;
}

/**
 * Reads what a redirect wallet left in the return URL (`transactionHashes` or `errorCode`),
 * pairs it with what the app was doing, and cleans the URL. Null when there is nothing pending.
 */
export function consumeRedirectResult(): RedirectResult | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  const url = new URL(window.location.href);
  const hashes = url.searchParams.get("transactionHashes");
  const errorCode = url.searchParams.get("errorCode");
  if (!raw || (!hashes && !errorCode)) return null;
  sessionStorage.removeItem(PENDING_KEY);
  const errorMessage = url.searchParams.get("errorMessage");
  for (const name of ["transactionHashes", "errorCode", "errorMessage"])
    url.searchParams.delete(name);
  window.history.replaceState(null, "", url);
  const list = hashes ? hashes.split(",").filter(Boolean) : [];
  return {
    context: JSON.parse(raw) as PendingContext,
    txHash: list[list.length - 1] ?? null,
    error: errorCode ? decodeURIComponent(errorMessage ?? errorCode) : null,
  };
}
