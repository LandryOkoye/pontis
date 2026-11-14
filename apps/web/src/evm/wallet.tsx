// EVM wallet session for the lending pages. A small module store rather than a provider: only
// lending uses it, and the adapter (injected or simulated) loads lazily on first use.
import type { ComponentType } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { isMock } from "../lib/config.ts";
import type { EvmAdapter } from "./types.ts";

interface Session {
  account: string | null;
  /** False until the adapter has loaded and reported any existing session. */
  ready: boolean;
  /** False when the browser has no EVM wallet. */
  available: boolean;
  connecting: boolean;
  Prompts: ComponentType | null;
}

const INITIAL: Session = {
  account: null,
  ready: false,
  available: true,
  connecting: false,
  Prompts: null,
};

let session = INITIAL;
let started = false;
let adapterPromise: Promise<EvmAdapter> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<Session>): void {
  session = { ...session, ...patch };
  listeners.forEach((l) => l());
}

/** The wallet adapter. Safe to call from queries and mutations. */
export function evmAdapter(): Promise<EvmAdapter> {
  adapterPromise ??= (async () => {
    if (isMock) {
      const mock = await import("./mock-wallet.tsx");
      update({ Prompts: mock.MockEvmPrompts });
      return mock.createMockEvmWallet();
    }
    return (await import("./injected.ts")).createInjectedWallet();
  })();
  return adapterPromise;
}

async function start(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const adapter = await evmAdapter();
    adapter.onAccountChange((account) => update({ account }));
    update({ account: await adapter.account(), available: adapter.available() });
  } catch (error) {
    console.error("EVM wallet failed to load", error);
  } finally {
    update({ ready: true });
  }
}

async function connect(): Promise<void> {
  update({ connecting: true });
  try {
    update({ account: await (await evmAdapter()).connect() });
  } finally {
    update({ connecting: false });
  }
}

async function disconnect(): Promise<void> {
  await (await evmAdapter()).disconnect();
  update({ account: null });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useEvmWallet() {
  const state = useSyncExternalStore(subscribe, () => session);
  useEffect(() => void start(), []);
  return {
    ...state,
    kind: isMock ? ("mock" as const) : ("injected" as const),
    connect,
    disconnect,
  };
}

/** Mount once on a page that signs; renders the simulated wallet's dialogs in mock mode. */
export function EvmWalletPrompts() {
  const { Prompts } = useEvmWallet();
  return Prompts ? <Prompts /> : null;
}

/** Tests only: forget the session so the next render re-reads it from storage. */
export function resetEvmWallet(): void {
  session = { ...INITIAL, Prompts: session.Prompts };
  started = false;
  listeners.forEach((l) => l());
}
