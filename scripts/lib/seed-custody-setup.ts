// The registry steps of the custody seed: the attester role and key, the custodians and the custody
// links. Each step reads current state first, so repeating the seed changes nothing. SIMULATED:
// the custodians are invented and sign with the public dev reserve-attester key.

import { devKey } from "@pontis/dev-keys";
import { admin, type Chain } from "./chain.ts";
import {
  attesterAccountId,
  attesterKeyArgs,
  custodianArgs,
  linkArgs,
} from "./catalogue-custody-plan.ts";
import type { PlannedCustodian, PlannedCustody } from "./catalogue-custody-types.ts";

interface SignerKeyView {
  public_key: string;
  scopes: string[];
}
interface CustodianView {
  attester_key: string;
}
interface LinkView {
  structure: string;
  custodian_ids: string[];
}

/** Grants `reserve_attester` to the simulated custodian's account and registers the dev key (scope `reserves`) for it. */
export async function seedAttesterRole(chain: Chain): Promise<void> {
  const { coreId, deployerId } = chain.config;
  const attester = attesterAccountId(deployerId);
  const has = (role: string, account: string) =>
    chain.view<boolean>(coreId, "has_role", { role, account_id: account });
  if (await has("registrar", attester)) {
    throw new Error(`${attester} is a registrar: a registrar cannot also be a reserve attester`);
  }
  if (await has("reserve_attester", deployerId)) {
    throw new Error(`${deployerId} is a reserve attester: it cannot also act as the registrar`);
  }
  if (!(await has("reserve_attester", attester))) {
    await admin(chain, coreId, "grant_role", { role: "reserve_attester", account_id: attester });
    console.log(`granted reserve_attester to ${attester}`);
  }
  const key = devKey("reserve-attester").publicKey;
  const keys =
    (await chain.view<SignerKeyView[]>(coreId, "get_signer_keys", { role: "reserve_attester" })) ??
    [];
  if (!keys.some((k) => k.public_key === key && k.scopes.includes("reserves"))) {
    await admin(chain, coreId, "add_signer_key", attesterKeyArgs(deployerId));
    console.log(`registered the dev reserve-attester key for ${attester}, scope reserves`);
  }
}

/** Registers the custodians the chain does not know; one with another key is reported, not changed. */
export async function seedCustodians(
  chain: Chain,
  custodians: readonly PlannedCustodian[],
): Promise<void> {
  const { coreId } = chain.config;
  for (const c of custodians) {
    const current = await chain.view<CustodianView | null>(coreId, "get_custodian", { id: c.id });
    if (!current) {
      await admin(chain, coreId, "register_custodian", custodianArgs(c));
      console.log(`registered SIMULATED custodian ${c.id}`);
    } else if (current.attester_key !== devKey("reserve-attester").publicKey) {
      console.log(`custodian ${c.id} is registered with another key; left alone`);
    }
  }
}

/** Links the representations whose link is missing or different. */
export async function seedLinks(chain: Chain, rows: readonly PlannedCustody[]): Promise<void> {
  const { coreId } = chain.config;
  for (const row of rows) {
    const current = await chain.view<LinkView | null>(coreId, "get_custody_link", {
      representation_id: row.representationId,
    });
    const same =
      current?.structure === row.structure &&
      current.custodian_ids.length === 1 &&
      current.custodian_ids[0] === row.custodianId;
    if (same) continue;
    await admin(chain, coreId, "link_custody", linkArgs(row));
    console.log(
      `${row.representationId} linked to ${row.custodianId} (${row.structure}, SIMULATED)`,
    );
  }
}
