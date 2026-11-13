// Derives the Sepolia address controlled by a NEAR Testnet account through Chain Signatures.
// This is read-only: it never asks MPC to sign or submits an EVM transaction.

import {
  DEFAULT_DERIVATION_PATH,
  derivationPath,
  deriveEvmAddress,
} from "./lib/chain-signatures.ts";

const accountId = process.env.DEPLOYER_ACCOUNT_ID?.trim();
if (!accountId) throw new Error("DEPLOYER_ACCOUNT_ID is required (NEAR Testnet account)");
const path = derivationPath();

console.log(
  JSON.stringify(
    {
      nearAccountId: accountId,
      derivationPath: path || DEFAULT_DERIVATION_PATH,
      evmAddress: deriveEvmAddress(accountId, path),
      network: "Sepolia",
      next: "Fund this address with Sepolia ETH before submitting the MPC-signed mint.",
    },
    null,
    2,
  ),
);
