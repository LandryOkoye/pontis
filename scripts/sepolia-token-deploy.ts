// Deploy the demo token and allowlist one recipient on Sepolia.

import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  assertSepolia,
  evmClients,
  nearSigner,
  readTokenArtifact,
  required,
  tokenAbi,
} from "./lib/sepolia-token.ts";
import { derivationPath, deriveEvmAddress } from "./lib/chain-signatures.ts";

async function deploy(): Promise<void> {
  const { publicClient } = evmClients();
  await assertSepolia(publicClient);
  const rawDeploymentKey =
    process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY?.trim() || required("ETH_DEPLOYER_KEY");
  const deploymentKey = (
    rawDeploymentKey.startsWith("0x") ? rawDeploymentKey : `0x${rawDeploymentKey}`
  ) as `0x${string}`;
  const deployer = privateKeyToAccount(deploymentKey);
  const wallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(required("SEPOLIA_RPC_URL")),
  });
  const recipient = required("SEPOLIA_MINT_RECIPIENT") as Address;
  const artifact = readTokenArtifact();
  const bridge = deriveEvmAddress(nearSigner().accountId, derivationPath()) as Address;
  const hash = await wallet.deployContract({
    account: deployer,
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [
      "Pontis NEAR Chain Signature Demo",
      "PNCS",
      deployer.address,
      bridge,
      1_000n * 10n ** 18n,
    ],
  });
  const deployment = await publicClient.waitForTransactionReceipt({ hash });
  if (deployment.status !== "success" || !deployment.contractAddress)
    throw new Error(`Sepolia token deployment failed: ${hash}`);
  const allowlistHash = await wallet.writeContract({
    account: deployer,
    address: deployment.contractAddress,
    abi: tokenAbi,
    functionName: "setEligible",
    args: [recipient, true],
  });
  const allowlist = await publicClient.waitForTransactionReceipt({ hash: allowlistHash });
  if (allowlist.status !== "success")
    throw new Error(`Recipient allowlist transaction failed: ${allowlistHash}`);
  console.log(
    JSON.stringify(
      {
        tokenAddress: deployment.contractAddress,
        bridgeAddress: bridge,
        issuer: deployer.address,
        recipient,
        deploymentTx: hash,
        allowlistTx: allowlistHash,
        explorer: `https://sepolia.etherscan.io/address/${deployment.contractAddress}`,
      },
      null,
      2,
    ),
  );
}

await deploy();
