// What the two redemption scenarios share: the terms the run sets, the chain and API readings of a
// redemption and of the escrow ledger, and the user's `redeem:` transfer. SIMULATED throughout.

import { createHash } from "node:crypto";
import { ENDPOINTS, type Redemption } from "@pontis/api-types";
import {
  parseBackofficeArgs,
  type BackofficeCommand,
} from "../../../../scripts/lib/backoffice-ops.ts";
import { parse } from "../api.ts";
import { balance } from "../wallet.ts";
import type { World } from "../world.ts";
import { REP, view, type CustodyKit } from "./custody-kit.ts";

export const ACCEPT_WITHIN_MS = 25_000;
export const FULFIL = 2_000_000n;
export const RECLAIM = 1_500_000n;

export interface RedemptionView {
  id: number;
  status: string;
  amount: string;
  fee_units: string;
  net_units: string;
  settling: boolean;
  accept_deadline_ms: number;
  fulfilment_evidence_hash: string | null;
  miss: string | null;
}
export interface Ledger {
  escrowed_in: string;
  burned: string;
  returned: string;
  held: string;
  open_amount: string;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The readings and actions of the redemption steps, with the facts they pass to one another. */
export interface Redemptions {
  redemptionsOf(): Promise<RedemptionView[]>;
  redemption(id: number): Promise<RedemptionView>;
  ledger(): Promise<Ledger>;
  held(account: string): Promise<bigint>;
  supply(): Promise<bigint>;
  /** `ft_transfer_call` of `amount` TGOLD-A to the core with the `redeem:` message. */
  redeem(amount: bigint, termsHash: string, payout: string): Promise<void>;
  apiRedemption(id: number): Promise<Redemption>;
  /** One back-office round that serves TGOLD-A at once, ignoring `ignore`. */
  backoffice(ignore?: number[]): BackofficeCommand;
  announced: Set<string>;
  /** Balances and supply before any redemption, for the conservation checks. */
  start: { user: bigint; core: bigint; supply: bigint };
  /** Filled in by the steps as they learn it. */
  facts: { termsHash: string; untrackedBefore: bigint; id1: number; id2: number };
}

export async function redemptionKit(world: World, kit: CustodyKit): Promise<Redemptions> {
  const { api, config } = world;
  const { user } = kit;
  const redemptionsOf = async () =>
    (
      await view<{ items: RedemptionView[]; total: number }>(
        world,
        config.coreId,
        "get_redemptions_by_user",
        { account_id: user.accountId, from_index: 0, limit: 100 },
      )
    ).items;
  const redemption = async (id: number) =>
    view<RedemptionView>(world, config.coreId, "get_redemption", { id });
  const ledger = () =>
    view<Ledger>(world, config.coreId, "get_escrow_ledger", { representation_id: REP });
  const held = (account: string) => balance(world, config.tokenAId, account);
  const supply = async () => BigInt(await view<string>(world, config.tokenAId, "ft_total_supply"));
  const backoffice = parseBackofficeArgs([
    "--once",
    "--representation",
    REP,
    "--accept-after-ms",
    "0",
    "--fulfil-after-ms",
    "0",
  ]);
  const announced = new Set<string>();
  const redeem = async (amount: bigint, termsHash: string, payout: string): Promise<void> => {
    await user.wallet.callFunctionRaw({
      contractId: config.tokenAId,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: config.coreId,
        amount: amount.toString(),
        msg: `redeem:${termsHash}:${payout}`,
      },
      gas: 150_000_000_000_000n,
      deposit: 1n,
      waitUntil: "FINAL",
    });
  };
  const apiRedemption = async (id: number) =>
    parse(await api.get(`/v1/redemptions/${id}`), ENDPOINTS.getRedemption.response);
  return {
    redemptionsOf,
    redemption,
    ledger,
    held,
    supply,
    redeem,
    apiRedemption,
    backoffice: (ignore = []) => ({ ...backoffice, ignore }),
    announced,
    start: {
      user: await held(user.accountId),
      core: await held(config.coreId),
      supply: await supply(),
    },
    facts: { termsHash: "", untrackedBefore: 0n, id1: 0, id2: 0 },
  };
}
