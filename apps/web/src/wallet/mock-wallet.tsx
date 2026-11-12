// Simulated wallet for mock mode and tests. It asks for approval in a dialog, exactly where a
// real wallet would, and applies approved actions to the in-memory mock chain.
import { useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import { shortId } from "../lib/format.ts";
import { DEMO_ACCOUNT, GUEST_ACCOUNT, db, fakeHash } from "../mocks/db.ts";
import type { WalletAction, WalletAdapter } from "./types.ts";
import { WalletRejected } from "./types.ts";

const STORAGE_KEY = "pontis.mock.account";

type Prompt =
  | { kind: "connect"; resolve: (account: string | null) => void }
  | {
      kind: "sign";
      account: string;
      actions: WalletAction[];
      resolve: (approved: boolean) => void;
    };

let prompt: Prompt | null = null;
const promptListeners = new Set<() => void>();
const accountListeners = new Set<(account: string | null) => void>();

function ask<T>(build: (resolve: (value: T) => void) => Prompt): Promise<T> {
  return new Promise<T>((resolve) => {
    prompt = build((value) => {
      prompt = null;
      promptListeners.forEach((l) => l());
      resolve(value);
    });
    promptListeners.forEach((l) => l());
  });
}

function readAccount(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setAccount(account: string | null): void {
  try {
    if (account) localStorage.setItem(STORAGE_KEY, account);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private windows; the session still works in memory.
  }
  accountListeners.forEach((l) => l(account));
}

export function createMockWallet(): WalletAdapter {
  let current = readAccount();
  return {
    kind: "mock",
    ready: async () => current,
    async connect() {
      const chosen = await ask<string | null>((resolve) => ({ kind: "connect", resolve }));
      if (chosen) {
        current = chosen;
        setAccount(chosen);
      }
      return current;
    },
    async disconnect() {
      current = null;
      setAccount(null);
    },
    async send(actions) {
      if (!current) throw new Error("Connect a wallet first.");
      const account = current;
      const approved = await ask<boolean>((resolve) => ({
        kind: "sign",
        account,
        actions,
        resolve,
      }));
      if (!approved) throw new WalletRejected();
      for (const action of actions) db.execute(account, action);
      return { txHash: fakeHash() };
    },
    view: async <T,>(contractId: string, method: string, args: Record<string, unknown>) =>
      db.view(contractId, method, args) as T,
    onAccountChange(listener) {
      accountListeners.add(listener);
      return () => accountListeners.delete(listener);
    },
  };
}

const ACCOUNTS = [
  { id: DEMO_ACCOUNT, note: "On the testnet allowlist. Holds 25 TGOLD-A." },
  { id: GUEST_ACCOUNT, note: "Not on the allowlist. Quotes are refused with NOT_ELIGIBLE." },
];

/** Renders whatever the simulated wallet is currently asking. Mounted once by the provider. */
export function MockWalletPrompts() {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    promptListeners.add(listener);
    return () => void promptListeners.delete(listener);
  }, []);
  const active = prompt;
  if (!active) return null;

  if (active.kind === "connect") {
    return (
      <Dialog
        open
        title="Simulated wallet"
        description="Mock mode: no chain, no keys. Pick a demo account."
        onClose={() => active.resolve(null)}
      >
        <ul className="space-y-2">
          {ACCOUNTS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => active.resolve(a.id)}
                className="group flex w-full items-center gap-3 rounded-[14px] border border-line bg-panel-2 px-4 py-3 text-left transition hover:border-gold/50"
              >
                <span className="grid size-9 place-items-center rounded-full bg-gold/10 font-mono text-xs text-gold">
                  {a.id.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm text-text">{a.id}</span>
                  <span className="block text-xs text-muted">{a.note}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="Approve in wallet"
      description={`Simulated signing as ${active.account}. Nothing is sent to a chain.`}
      onClose={() => active.resolve(false)}
    >
      <ol className="space-y-2">
        {active.actions.map((action, i) => (
          <li key={i} className="rounded-[14px] border border-line bg-panel-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-gold">{action.methodName}</span>
              <span className="eyebrow">Tx {i + 1}</span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-muted">
              <dt>to</dt>
              <dd className="truncate text-text">{action.receiverId}</dd>
              <dt>deposit</dt>
              <dd className="text-text">{action.deposit} yoctoNEAR</dd>
              {typeof action.args.amount === "string" && (
                <>
                  <dt>amount</dt>
                  <dd className="text-text">{shortId(action.args.amount, 14, 0)}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-parity" aria-hidden />
        The Pontis API only assembles these actions. Your wallet signs them; the backend never holds
        your key.
      </p>
      <div className="mt-5 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => active.resolve(false)}>
          <X className="size-4" aria-hidden /> Reject
        </Button>
        <Button className="flex-1" onClick={() => active.resolve(true)}>
          <Check className="size-4" aria-hidden /> Approve
        </Button>
      </div>
    </Dialog>
  );
}
