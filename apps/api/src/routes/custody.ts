// Custody, reserve, redemption and reliability reads, and the reserve attestation relay (ADR 0020).

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import type { CustodyRepository, ReserveRelayer } from "../custody/chain.ts";
import { getRedemption, listRedemptions } from "../custody/redemptions.ts";
import { relayReserveAttestation } from "../custody/relay.ts";
import {
  assetCustody,
  assetRedemptionTerms,
  assetReserves,
  getCustodian,
  issuerReliability,
  listCustodians,
  reserveHistory,
} from "../custody/service.ts";

const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface CustodyRouteDeps {
  db: Db;
  chain: CustodyRepository;
  /** Absent unless `PONTIS_RELAYER_*` is configured. */
  relayer?: ReserveRelayer | undefined;
  coreId: string;
  now?: () => Date;
}

export function registerCustodyRoutes(app: FastifyInstance, deps: CustodyRouteDeps): void {
  const e = ENDPOINTS;
  const { db, chain } = deps;
  const now = () => (deps.now ?? (() => new Date()))();

  app.get(route(e.listCustodians.path), async (req) => {
    const q = e.listCustodians.query.parse(req.query);
    return e.listCustodians.response.parse(await listCustodians(chain, q));
  });
  app.get(route(e.getCustodian.path), async (req) => {
    const { id } = e.getCustodian.params.parse(req.params);
    return e.getCustodian.response.parse(await getCustodian(chain, id));
  });
  app.get(route(e.getAssetCustody.path), async (req) => {
    const { id } = e.getAssetCustody.params.parse(req.params);
    return e.getAssetCustody.response.parse(await assetCustody(db, chain, id));
  });
  app.get(route(e.getAssetReserves.path), async (req) => {
    const { id } = e.getAssetReserves.params.parse(req.params);
    return e.getAssetReserves.response.parse(await assetReserves(db, chain, id, now()));
  });
  app.get(route(e.getAssetReserveHistory.path), async (req) => {
    const { id } = e.getAssetReserveHistory.params.parse(req.params);
    const q = e.getAssetReserveHistory.query.parse(req.query);
    return e.getAssetReserveHistory.response.parse(await reserveHistory(db, chain, id, q));
  });
  app.get(route(e.getAssetRedemptionTerms.path), async (req) => {
    const { id } = e.getAssetRedemptionTerms.params.parse(req.params);
    return e.getAssetRedemptionTerms.response.parse(
      await assetRedemptionTerms(db, chain, id, now()),
    );
  });
  app.get(route(e.getIssuerReliability.path), async (req) => {
    const { id } = e.getIssuerReliability.params.parse(req.params);
    return e.getIssuerReliability.response.parse(await issuerReliability(db, chain, id));
  });
  app.get(route(e.listRedemptions.path), async (req) => {
    const q = e.listRedemptions.query.parse(req.query);
    return e.listRedemptions.response.parse(await listRedemptions(db, chain, q, now()));
  });
  app.get(route(e.getRedemption.path), async (req) => {
    const { id } = e.getRedemption.params.parse(req.params);
    return e.getRedemption.response.parse(await getRedemption(chain, id, now()));
  });
  app.post(route(e.submitReserveAttestation.path), async (req, reply) => {
    const body = e.submitReserveAttestation.body.parse(req.body);
    const result = await relayReserveAttestation(
      { db, relayer: deps.relayer, coreId: deps.coreId },
      body,
    );
    void reply.code(e.submitReserveAttestation.status);
    return e.submitReserveAttestation.response.parse(result);
  });
}
