// Build-time configuration. Pontis is Testnet-only; there is no mainnet switch.
const env = import.meta.env;

export const config = {
  apiMode: env.VITE_API_MODE === "live" ? ("live" as const) : ("mock" as const),
  apiUrl: (env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  rpcUrl: env.VITE_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  coreAccountId: env.VITE_PONTIS_CORE_ACCOUNT_ID ?? "pontis-core.pontis.testnet",
  networkId: "testnet" as const,
  explorerUrl: "https://testnet.nearblocks.io",
};

export const isMock = config.apiMode === "mock";
