import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { comparePriority, crosses, deviationBps, validateOrder } from "./matching-policy.ts";
import {
  createRfqKeys,
  decryptOrder,
  matchCommitment,
  openDisclosure as openEncryptedDisclosure,
  sealDisclosure,
  type EncryptedOrder,
  type MatchDisclosure,
  type PrivateOrder,
} from "./private-crypto.ts";
import type { MatchRecord, PrivateRfqSubmission, RestingOrder, RfqOptions, SettlementInstruction } from "./private-rfq-types.ts";
export type { EncryptedOrder, PrivateOrder, RfqKeys, Side } from "./private-crypto.ts";
export type { PrivateRfqSubmission, RfqOptions, SettlementInstruction } from "./private-rfq-types.ts";

/** In-memory price-time matcher. It is simulated and the operator sees clear orders. */
export class PrivateRfqMatcher {
  private readonly keys = createRfqKeys();
  private readonly resting: RestingOrder[] = [];
  private readonly usedOrderIds = new Set<string>();
  private readonly matches = new Map<string, MatchRecord>();
  private sequence = 0;
  private readonly now: () => number;

  constructor(private readonly options: RfqOptions) {
    this.now = options.now ?? Date.now;
  }

  get matcherPublicKey(): Uint8Array {
    return Uint8Array.from(this.keys.publicKey);
  }

  submit(encrypted: EncryptedOrder, disclosureKey: Uint8Array): PrivateRfqSubmission {
    const order = decryptOrder(encrypted, this.keys);
    validateOrder(order, this.now());
    if (this.usedOrderIds.has(order.id)) throw new Error("Order replay rejected");
    const oracle = this.options.oraclePrice(order.assetId);
    if (oracle === undefined || oracle <= 0n) throw new Error("Oracle price unavailable");
    if (deviationBps(BigInt(order.limitPrice), oracle) > this.options.maxOracleDeviationBps) {
      throw new Error("Order limit exceeds oracle deviation bound");
    }
    this.usedOrderIds.add(order.id);
    for (let i = this.resting.length - 1; i >= 0; i -= 1) {
      if (this.resting[i]!.order.expiryMs <= this.now()) this.resting.splice(i, 1);
    }

    const candidates = this.resting
      .filter(
        ({ order: resting }) => resting.assetId === order.assetId && resting.side !== order.side,
      )
      .sort((a, b) => comparePriority(a.order, b.order));
    const resting = candidates.find(
      ({ order: candidate }) =>
        candidate.institutionId !== order.institutionId && crosses(order, candidate),
    );
    if (!resting) {
      this.resting.push({ order, disclosurePublicKey: Uint8Array.from(disclosureKey) });
      return { status: "resting", confidentiality_level: "operator_trusted", simulated: true };
    }

    this.resting.splice(this.resting.indexOf(resting), 1);
    const settlementSize = [BigInt(order.size), BigInt(resting.order.size)].reduce((a, b) =>
      a < b ? a : b,
    );
    const executionPrice = BigInt(resting.order.limitPrice);
    if (deviationBps(executionPrice, oracle) > this.options.maxOracleDeviationBps) {
      this.resting.push(resting);
      throw new Error("Execution price exceeds oracle deviation bound");
    }
    if (BigInt(resting.order.size) > settlementSize) {
      this.resting.push({
        ...resting,
        order: { ...resting.order, size: (BigInt(resting.order.size) - settlementSize).toString() },
      });
    }
    if (BigInt(order.size) > settlementSize) {
      this.resting.push({
        order: { ...order, size: (BigInt(order.size) - settlementSize).toString() },
        disclosurePublicKey: Uint8Array.from(disclosureKey),
      });
    }
    const settlement = this.makeSettlement(
      order,
      resting.order,
      resting.disclosurePublicKey,
      disclosureKey,
      settlementSize,
    );
    return {
      status: "matched",
      settlement,
      confidentiality_level: "operator_trusted",
      simulated: true,
    };
  }

  openDisclosure(settlementId: string, recipientPrivateKey: Uint8Array): unknown {
    const record = this.matches.get(settlementId);
    if (!record) throw new Error("Unknown settlement");
    const blob =
      record.disclosures[
        Buffer.from(nacl.box.keyPair.fromSecretKey(recipientPrivateKey).publicKey).toString(
          "base64",
        )
      ];
    if (!blob) throw new Error("No disclosure was encrypted for this key");
    const packageValue = openEncryptedDisclosure(blob, recipientPrivateKey) as MatchDisclosure;
    if (matchCommitment(packageValue) !== record.instruction.commitment) {
      throw new Error("Disclosure commitment mismatch");
    }
    return { ...packageValue, commitment: record.instruction.commitment };
  }

  getDisclosure(
    settlementId: string,
    recipientPublicKey: Uint8Array,
  ):
    | {
        settlementId: string;
        commitment: string;
        disclosure: EncryptedOrder;
        confidentiality_level: "operator_trusted";
        simulated: true;
      }
    | undefined {
    const record = this.matches.get(settlementId);
    if (!record) return undefined;
    const disclosure = record.disclosures[Buffer.from(recipientPublicKey).toString("base64")];
    if (!disclosure) return undefined;
    return {
      settlementId,
      commitment: record.instruction.commitment,
      disclosure,
      confidentiality_level: "operator_trusted",
      simulated: true,
    };
  }

  private makeSettlement(
    incoming: PrivateOrder,
    resting: PrivateOrder,
    restingKey: Uint8Array,
    incomingKey: Uint8Array,
    size: bigint,
  ): SettlementInstruction {
    const buy = incoming.side === "buy" ? incoming : resting;
    const sell = incoming.side === "sell" ? incoming : resting;
    const price = resting.limitPrice;
    const settlementId = `rfq-${++this.sequence}`;
    const salt = randomBytes(32).toString("hex");
    const disclosure: MatchDisclosure = {
      buyOrder: { ...buy, size: size.toString() },
      sellOrder: { ...sell, size: size.toString() },
      size: size.toString(),
      price,
      salt,
    };
    const commitmentHash = matchCommitment(disclosure);
    const instruction: SettlementInstruction = {
      settlementId,
      assetId: buy.assetId,
      size: size.toString(),
      price,
      buyOrderId: buy.id,
      sellOrderId: sell.id,
      commitment: commitmentHash,
      settlementMode: "not_submitted",
      confidentiality_level: "operator_trusted",
      simulated: true,
    };
    const buyKey = incoming.side === "buy" ? incomingKey : restingKey;
    const sellKey = incoming.side === "sell" ? incomingKey : restingKey;
    const disclosures: Record<string, EncryptedOrder> = {};
    disclosures[Buffer.from(buyKey).toString("base64")] = sealDisclosure(disclosure, buyKey);
    disclosures[Buffer.from(sellKey).toString("base64")] = sealDisclosure(disclosure, sellKey);
    if (this.options.auditorPublicKey) {
      disclosures[Buffer.from(this.options.auditorPublicKey).toString("base64")] = sealDisclosure(
        disclosure,
        this.options.auditorPublicKey,
      );
    }
    this.matches.set(settlementId, { instruction, disclosures });
    return instruction;
  }
}
