// The gated mint's unsigned actions (ADR 0020 section 6 and 10): `request_mint` records an intent,
// `execute_mint` mints within the attested reserve headroom. The API pre-checks what the contract
// would panic on, so the issuer hears why before paying gas. It signs and sends nothing.

import type { MintIntent } from "@pontis/api-types";
import { executeMintAction, requestMintAction } from "@pontis/near-client";
import { AppError, notFound } from "../errors.ts";
import { conflict, intentLabels, type IntentDeps } from "./intent-context.ts";
import { requireIssuerAccount } from "./issuer-access.ts";

/** `request_mint`: only records the intent. Authority is the issuer account of the asset. */
export async function mintRequestIntent(
  deps: IntentDeps,
  body: { representationId: string; recipient: string; amount: string; reference: string },
): Promise<MintIntent> {
  await requireIssuerAccount(deps.db, deps.chain, deps.caller, body.representationId, deps.subject);
  return {
    intent: "request",
    requestId: null,
    assetId: body.representationId,
    amount: body.amount,
    headroomUnits: null,
    actions: [requestMintAction(deps.coreId, body)],
    ...intentLabels,
  };
}

/** `execute_mint`: refused here when the contract would panic for headroom, the reserve action or policy. */
export async function mintExecuteIntent(deps: IntentDeps, id: string): Promise<MintIntent> {
  const request = await deps.chain.getMintRequest(Number(id));
  if (!request) throw notFound(`Mint request ${id}`);
  await requireIssuerAccount(
    deps.db,
    deps.chain,
    deps.caller,
    request.representation_id,
    deps.subject,
  );
  if (request.status !== "requested")
    throw conflict(`A ${request.status} mint request cannot be executed`);
  const rep = await deps.chain.getRepresentation(request.representation_id);
  if (rep?.status !== "active")
    throw new AppError("MINT_REFUSED", 422, "The asset is not active; nothing can be minted");
  const headroom = await deps.chain.getMintHeadroom(request.representation_id);
  if (headroom.state === "unmonitored")
    throw new AppError(
      "MINT_REFUSED",
      422,
      "The asset has no reserve policy, so it cannot be minted through the gate",
    );
  if (headroom.mint_paused)
    throw new AppError("MINT_REFUSED", 422, "Minting is paused by the asset's reserve action");
  if (BigInt(request.amount) > BigInt(headroom.headroom_units))
    throw new AppError(
      "MINT_REFUSED",
      422,
      `The amount exceeds the attested reserve headroom of ${headroom.headroom_units}`,
    );
  return {
    intent: "execute",
    requestId: id,
    assetId: request.representation_id,
    amount: request.amount,
    headroomUnits: headroom.headroom_units,
    actions: [executeMintAction(deps.coreId, id)],
    ...intentLabels,
  };
}
