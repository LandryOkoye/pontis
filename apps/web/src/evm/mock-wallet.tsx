// Simulated EVM wallet for mock mode and tests. It asks for approval in a dialog, where a real
// wallet would, and applies approved calls to the in-memory lending venue.
import { useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import type { LendingTx } from "../lib/lending-types.ts";
import { shortId } from "../lib/format.ts";
import { DEMO_EVM_ACCOUNT, lendingDb } from "../mocks/lending.ts";
import type { EvmAdapter } from "./types.ts";
import { EvmRejected } from "./types.ts";

export const MOCK_EVM_STORAGE_KEY = "pontis.mock.evm";

interface Prompt {
  account: string;
  tx: LendingTx;
  resolve: (approved: boolean) => void;
}

let prompt: Prompt | null = null;
const promptListeners = new Set<() => void>();
const accountListeners = new Set<(account: string | null) => void>();
const notify = () => promptListeners.forEach((l) => l());

const fakeTxHash = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function stored(): string | null {
  try {
    return localStorage.getItem(MOCK_EVM_STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(account: string | null): void {
  try {
    if (account) localStorage.setItem(MOCK_EVM_STORAGE_KEY, account);
    else localStorage.removeItem(MOCK_EVM_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private windows; the session still works in memory.
  }
  accountListeners.forEach((l) => l(account));
}

export function createMockEvmWallet(): EvmAdapter {
  return {
    kind: "mock",
    available: () => true,
    account: async () => stored(),
    async connect() {
      store(DEMO_EVM_ACCOUNT);
      return DEMO_EVM_ACCOUNT;
    },
    async disconnect() {
      store(null);
    },
    async send(from, tx) {
      const approved = await new Promise<boolean>((resolve) => {
        prompt = {
          account: from,
          tx,
          resolve: (value) => {
            prompt = null;
            notify();
            resolve(value);
          },
        };
        notify();
      });
      if (!approved) throw new EvmRejected();
      try {
        lendingDb.execute(tx.data);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown reason";
        throw new Error(`The call would revert, so it was not sent. ${reason}`, { cause: error });
      }
      return fakeTxHash();
    },
    confirm: async () => {},
    decimals: async (token) => lendingDb.decimals(token),
    balanceOf: async (token, owner) => lendingDb.balanceOf(token, owner),
    onAccountChange(listener) {
      accountListeners.add(listener);
      return () => accountListeners.delete(listener);
    },
  };
}

/** Renders whatever the simulated wallet is currently asking. */
export function MockEvmPrompts() {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    promptListeners.add(listener);
    return () => void promptListeners.delete(listener);
  }, []);
  const active = prompt;
  if (!active) return null;
  return (
    <Dialog
      open
      title="Approve in wallet"
      description={`Simulated signing as ${shortId(active.account, 8, 6)}. Nothing is sent to a chain.`}
      onClose={() => active.resolve(false)}
    >
      <div className="rounded-lg border border-line bg-panel-2 p-3">
        <p className="text-sm text-text">{active.tx.description}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs text-muted">
          <dt>to</dt>
          <dd className="truncate text-text">{active.tx.to}</dd>
          <dt>value</dt>
          <dd className="text-text">{active.tx.value} wei</dd>
          <dt>data</dt>
          <dd className="truncate text-text">{active.tx.data.slice(0, 18)}…</dd>
        </dl>
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-parity" aria-hidden />
        The Pontis API only assembles this call. Your wallet signs it; the backend never holds your
        key.
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
