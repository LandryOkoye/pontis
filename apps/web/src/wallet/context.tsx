// Wallet state for the whole app. The adapter (real or simulated) loads lazily after first paint.
import type { ComponentType, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isMock } from "../lib/config.ts";
import type { PendingContext, SendResult, WalletAction, WalletAdapter } from "./types.ts";

interface WalletValue {
  /** Signed-in account, or null. */
  accountId: string | null;
  /** False until the wallet library has loaded and reported the session. */
  ready: boolean;
  connecting: boolean;
  kind: "mock" | "near";
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (actions: WalletAction[], context?: PendingContext) => Promise<SendResult>;
  view: <T>(contractId: string, method: string, args: Record<string, unknown>) => Promise<T>;
}

const WalletContext = createContext<WalletValue | null>(null);

async function loadAdapter(): Promise<{ adapter: WalletAdapter; Prompts: ComponentType | null }> {
  if (isMock) {
    const mock = await import("./mock-wallet.tsx");
    return { adapter: mock.createMockWallet(), Prompts: mock.MockWalletPrompts };
  }
  await import("./node-globals.ts");
  const near = await import("./near-wallet.ts");
  return { adapter: await near.createNearWallet(), Prompts: null };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [Prompts, setPrompts] = useState<ComponentType | null>(null);
  const adapterRef = useRef<Promise<WalletAdapter> | null>(null);

  const adapter = useCallback(() => {
    adapterRef.current ??= loadAdapter().then(({ adapter: loaded, Prompts: prompts }) => {
      if (prompts) setPrompts(() => prompts);
      return loaded;
    });
    return adapterRef.current;
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    adapter()
      .then(async (loaded) => {
        const account = await loaded.ready();
        if (cancelled) return;
        setAccountId(account);
        unsubscribe = loaded.onAccountChange(setAccountId);
      })
      .catch((error: unknown) => console.error("wallet failed to load", error))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [adapter]);

  const value = useMemo<WalletValue>(
    () => ({
      accountId,
      ready,
      connecting,
      kind: isMock ? "mock" : "near",
      async connect() {
        setConnecting(true);
        try {
          setAccountId(await (await adapter()).connect());
        } finally {
          setConnecting(false);
        }
      },
      async disconnect() {
        await (await adapter()).disconnect();
        setAccountId(null);
      },
      send: async (actions, context) => (await adapter()).send(actions, context),
      view: async (contractId, method, args) => (await adapter()).view(contractId, method, args),
    }),
    [accountId, ready, connecting, adapter],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {Prompts && <Prompts />}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>");
  return value;
}
