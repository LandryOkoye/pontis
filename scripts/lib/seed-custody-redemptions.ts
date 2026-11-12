// The redemption step of the custody seed: three simulated redemptions left in different states.
// The request is a real `ft_transfer_call` from the deployer (the demo holder); accept and fulfil
// are signed by the issuer's token account (it is in the issuer's `controlled_accounts`), which is
// the call the simulated back-office makes. Every step reads chain state first. SIMULATED: nothing
// is paid out; on fulfilment the escrow is burned and that is all.

import { admin, type Chain } from "./chain.ts";
import { payoutInstructionHash, redeemMessage } from "./catalogue-custody-plan.ts";
import type { PlannedRedemption, RedemptionState } from "./catalogue-custody-types.ts";
import { syntheticReceiptHash, type RedemptionView } from "./backoffice-plan.ts";
import { chainAs } from "./reserve-chain.ts";
import { ensureCoreRegistered } from "./seed-catalogue-tokens.ts";
import type { RepLookup, TermsRecord } from "./seed-custody-terms.ts";

interface SeededRedemption extends RedemptionView {
  payout_instruction_hash: string;
}

const ORDER: RedemptionState[] = ["requested", "accepted", "fulfilled"];

async function redemptionsOf(chain: Chain, user: string): Promise<SeededRedemption[]> {
  const { coreId } = chain.config;
  const all: SeededRedemption[] = [];
  for (let from = 0; ;) {
    const page = await chain.view<{ items: SeededRedemption[]; total: number }>(
      coreId,
      "get_redemptions_by_user",
      { account_id: user, from_index: from, limit: 100 },
    );
    if (!page || page.items.length === 0) return all;
    all.push(...page.items);
    from += page.items.length;
    if (from >= page.total) return all;
  }
}

/**
 * Leaves each planned redemption in its state: requests it if the deployer has none with its
 * payout hash, then has the issuer's token account accept and fulfil as far as the state needs.
 * `officeFor` is the chain handle that signs as the issuer's account.
 */
export async function seedRedemptions(
  chain: Chain,
  planned: readonly PlannedRedemption[],
  reps: RepLookup,
  officeFor: (accountId: string) => Chain = (id) => chainAs(chain, id, chain.config.deployerKey),
): Promise<void> {
  const { coreId, deployerId } = chain.config;
  for (const r of planned) {
    const id = r.representationId;
    const token = reps.accountOf(id);
    const payout = payoutInstructionHash(r);
    const find = async () =>
      (await redemptionsOf(chain, deployerId)).find((x) => x.payout_instruction_hash === payout);
    let current = await find();
    if (!current) {
      const record = await chain.view<TermsRecord | null>(coreId, "get_redemption_terms", {
        representation_id: id,
      });
      if (!record) throw new Error(`${id} has no redemption terms to request against`);
      await ensureCoreRegistered(chain, token);
      await chain.call(
        token,
        "ft_transfer_call",
        {
          receiver_id: coreId,
          amount: (r.amountWhole * 10n ** BigInt(reps.decimalsOf(id))).toString(),
          msg: redeemMessage(record.terms_hash, payout),
        },
        { deposit: 1n },
      );
      current = await find();
      if (!current)
        throw new Error(`${id}: the core refused the redemption request (see its event log)`);
      console.log(`${id}: redemption ${current.id} requested (SIMULATED)`);
    }
    const reached = ORDER.indexOf(current.status as RedemptionState);
    if (reached < 0 || reached >= ORDER.indexOf(r.state)) continue;
    const office = officeFor(token);
    if (reached < 1) {
      await admin(office, coreId, "accept_redemption", { id: current.id });
      console.log(`${id}: redemption ${current.id} accepted (SIMULATED issuer)`);
    }
    if (r.state === "fulfilled") {
      await admin(office, coreId, "fulfil_redemption", {
        id: current.id,
        evidence_hash: syntheticReceiptHash(current),
      });
      console.log(`${id}: redemption ${current.id} fulfilled, SIMULATED receipt, nothing paid out`);
    }
  }
}
