import bs58 from "bs58";
import elliptic from "elliptic";
import { sha3_256 } from "js-sha3";
import { getAddress, keccak256, type Hex } from "viem";

export const MPC_CONTRACT_ID = "v1.signer-prod.testnet";
export const DEFAULT_DERIVATION_PATH = "pontis-sepolia-mint-v1";
export const SIGNATURE_DEPOSIT_YOCTONEAR = 1n;
export const SIGNATURE_GAS = 300_000_000_000_000n;

const TESTNET_ROOT_PUBLIC_KEY =
  "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3";

export function derivationPath(): string {
  return process.env.CHAIN_SIGNATURES_DERIVATION_PATH?.trim() || DEFAULT_DERIVATION_PATH;
}

export function deriveEvmAddress(accountId: string, path: string): string {
  const curve = new elliptic.ec("secp256k1");
  const encoded = TESTNET_ROOT_PUBLIC_KEY.split(":")[1];
  const rootBytes = bs58.decode(encoded!);
  if (rootBytes.length !== 64) throw new Error("Unexpected Testnet MPC public key length");
  const root = curve
    .keyFromPublic(`04${Buffer.from(rootBytes).toString("hex")}`, "hex")
    .getPublic();
  const tweak = sha3_256(`near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`);
  const child = root.add(curve.g.mul(tweak));
  const publicKey = child.encode("hex", false).slice(2);
  return getAddress(`0x${keccak256(`0x${publicKey}` as Hex).slice(-40)}`);
}
