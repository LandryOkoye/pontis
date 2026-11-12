// The reserve relayer on near-api-js (ADR 0020 section 10). Testnet and sandbox only: the key is
// the dedicated relayer account's, configured by `PONTIS_RELAYER_*`, never a user's.

import { Account, JsonRpcProvider } from "near-api-js";
import { RelayRefusedError, type ReserveAttestationCall, type ReserveRelayer } from "./chain.ts";

const TGAS = 10n ** 12n;
/** Evaluating the reserve status runs inside the call; 150 Tgas leaves wide headroom. */
const GAS = 150n * TGAS;
const ONE_YOCTO = 1n;

export interface NearRelayerOptions {
  rpcUrl: string;
  coreId: string;
  accountId: string;
  /** `ed25519:<base58>` secret key of the relayer account. */
  secretKey: string;
}

/** The failure of an executed transaction, in words, or undefined if it succeeded. */
export function failureOf(status: unknown): string | undefined {
  if (typeof status !== "object" || status === null || !("Failure" in status)) return undefined;
  const text = JSON.stringify((status as { Failure: unknown }).Failure);
  // A contract panic carries its message in `ExecutionError`; keep it short for the response.
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

export class NearReserveRelayer implements ReserveRelayer {
  private readonly account: Account;

  constructor(private readonly options: NearRelayerOptions) {
    this.account = new Account(
      options.accountId,
      new JsonRpcProvider({ url: options.rpcUrl }),
      options.secretKey as `ed25519:${string}`,
    );
  }

  async submitReserveAttestation(call: ReserveAttestationCall): Promise<{ txHash: string }> {
    const outcome = await this.account.callFunctionRaw({
      contractId: this.options.coreId,
      methodName: "submit_reserve_attestation",
      args: {
        attestation: call.attestation,
        signature: call.signature,
        public_key: call.publicKey,
      },
      deposit: ONE_YOCTO,
      gas: GAS,
      waitUntil: "EXECUTED_OPTIMISTIC",
    });
    const failure = failureOf((outcome as { status?: unknown }).status);
    if (failure) throw new RelayRefusedError(failure);
    return { txHash: outcome.transaction.hash };
  }
}
