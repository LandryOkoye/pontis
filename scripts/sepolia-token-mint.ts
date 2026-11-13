// Request a NEAR Testnet MPC signature and broadcast one demo mint on Sepolia.

import { getTransactionLastResult } from "@near-js/utils";
import { encodeFunctionData, keccak256, serializeTransaction, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { assertSepolia, evmClients, nearSigner, required, tokenAbi } from "./lib/sepolia-token.ts";
import {
  derivationPath,
  deriveEvmAddress,
  MPC_CONTRACT_ID,
  SIGNATURE_DEPOSIT_YOCTONEAR,
  SIGNATURE_GAS,
} from "./lib/chain-signatures.ts";

function signatureParts(value: unknown): { r: Hex; s: Hex; yParity: 0 | 1 } {
  if (typeof value !== "object" || value === null)
    throw new Error("Malformed MPC signature response");
  const response = value as { scheme?: string; Secp256k1?: unknown };
  const signature = response.scheme === "Secp256k1" ? response : response.Secp256k1;
  if (typeof signature !== "object" || signature === null)
    throw new Error("Unexpected MPC signature response scheme");
  const fields = signature as {
    big_r?: { affine_point?: string } | string;
    s?: { scalar?: string } | string;
    recovery_id?: number;
  };
  const r = typeof fields.big_r === "string" ? fields.big_r : fields.big_r?.affine_point?.slice(2);
  const s = typeof fields.s === "string" ? fields.s : fields.s?.scalar;
  if (!r || !s || (fields.recovery_id !== 0 && fields.recovery_id !== 1))
    throw new Error("Incomplete MPC ECDSA signature");
  return { r: `0x${r.slice(-64)}`, s: `0x${s.slice(-64)}`, yParity: fields.recovery_id };
}

async function mint(): Promise<void> {
  const near = nearSigner();
  const path = derivationPath();
  const bridge = deriveEvmAddress(near.accountId, path) as Address;
  const tokenAddress = required("SEPOLIA_TOKEN_ADDRESS") as Address;
  const recipient = required("SEPOLIA_MINT_RECIPIENT") as Address;
  const amount = BigInt(process.env.SEPOLIA_MINT_AMOUNT ?? "1000000000000000000");
  const { publicClient, rpcUrl } = evmClients();
  await assertSepolia(publicClient);
  const configuredBridge = await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "bridge",
  });
  if (configuredBridge.toLowerCase() !== bridge.toLowerCase())
    throw new Error("Token bridge does not match the derived NEAR address");
  if (
    !(await publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "eligible",
      args: [recipient],
    }))
  )
    throw new Error("Mint recipient is not allowlisted by the token issuer");
  if ((await publicClient.getBalance({ address: bridge })) === 0n)
    throw new Error("Derived Sepolia address has no ETH for gas");

  const data = encodeFunctionData({
    abi: tokenAbi,
    functionName: "bridgeMint",
    args: [recipient, amount],
  });
  const nonce = await publicClient.getTransactionCount({ address: bridge });
  const fees = await publicClient.estimateFeesPerGas();
  const gas = await publicClient.estimateGas({
    account: bridge,
    to: tokenAddress,
    data,
    value: 0n,
  });
  const unsigned = {
    type: "eip1559" as const,
    chainId: sepolia.id,
    nonce,
    to: tokenAddress,
    value: 0n,
    data,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
  const payload = keccak256(serializeTransaction(unsigned));
  const outcome = await near.account.callFunctionRaw({
    contractId: MPC_CONTRACT_ID,
    methodName: "sign",
    args: { request: { payload_v2: { Ecdsa: payload.slice(2) }, path, domain_id: 0 } },
    deposit: SIGNATURE_DEPOSIT_YOCTONEAR,
    gas: SIGNATURE_GAS,
    waitUntil: "FINAL",
  });
  const signature = signatureParts(
    getTransactionLastResult(outcome as Parameters<typeof getTransactionLastResult>[0]),
  );
  const signedTransaction = serializeTransaction(unsigned, signature);
  const sendResponse = await fetch(`${rpcUrl}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [signedTransaction],
    }),
  });
  const sendResult = (await sendResponse.json()) as { result?: Hex; error?: { message?: string } };
  if (!sendResponse.ok || sendResult.error || !sendResult.result)
    throw new Error(
      `Sepolia broadcast failed: ${sendResult.error?.message ?? sendResponse.status}`,
    );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: sendResult.result });
  const transaction = await publicClient.getTransaction({ hash: sendResult.result });
  if (receipt.status !== "success" || transaction.from.toLowerCase() !== bridge.toLowerCase())
    throw new Error(`Sepolia mint failed sender or receipt check: ${sendResult.result}`);
  console.log(
    JSON.stringify(
      {
        nearTransaction: outcome.transaction.hash,
        nearExplorer: `https://testnet.nearblocks.io/txns/${outcome.transaction.hash}`,
        sepoliaTransaction: sendResult.result,
        sepoliaExplorer: `https://sepolia.etherscan.io/tx/${sendResult.result}`,
        tokenAddress,
        derivedAddress: bridge,
        derivationPath: path,
        sender: transaction.from,
        recipient,
        amount: amount.toString(),
      },
      null,
      2,
    ),
  );
}

await mint();
