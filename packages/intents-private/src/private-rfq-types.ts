import type { EncryptedOrder, PrivateOrder } from "./private-crypto.ts";

export type SettlementInstruction = {
  settlementId: string;
  assetId: string;
  size: string;
  price: string;
  buyOrderId: string;
  sellOrderId: string;
  commitment: string;
  settlementMode: "not_submitted";
  confidentiality_level: "operator_trusted";
  simulated: true;
};

export type PrivateRfqSubmission = {
  status: "resting" | "matched";
  confidentiality_level: "operator_trusted";
  simulated: true;
  settlement?: SettlementInstruction;
};

export type RfqOptions = {
  oraclePrice: (assetId: string) => bigint | undefined;
  maxOracleDeviationBps: bigint;
  auditorPublicKey?: Uint8Array;
  now?: () => number;
};

export type RestingOrder = { order: PrivateOrder; disclosurePublicKey: Uint8Array };
export type MatchRecord = { instruction: SettlementInstruction; disclosures: Record<string, EncryptedOrder> };
