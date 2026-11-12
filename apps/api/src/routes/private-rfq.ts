import type { PrivateRfqMatcher } from "@pontis/intents-private";
import { ENDPOINTS } from "@pontis/api-types";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AppError, notFound } from "../errors.ts";

const encodedKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .transform((value) => Buffer.from(value, "base64"))
  .refine((value) => value.length === 32);
export function registerPrivateRfqRoutes(app: FastifyInstance, matcher: PrivateRfqMatcher): void {
  app.get(ENDPOINTS.getPrivateRfqMatcherKey.path, async () =>
    ENDPOINTS.getPrivateRfqMatcherKey.response.parse({
      publicKey: Buffer.from(matcher.matcherPublicKey).toString("base64"),
      algorithm: "x25519-xsalsa20-poly1305",
      confidentiality_level: "operator_trusted",
      simulated: true,
    }),
  );

  app.post(ENDPOINTS.submitPrivateRfqOrder.path, async (request) => {
    const body = ENDPOINTS.submitPrivateRfqOrder.body!.parse(request.body);
    const disclosurePublicKey = encodedKey.parse(body.disclosurePublicKey);
    try {
      return ENDPOINTS.submitPrivateRfqOrder.response.parse(
        matcher.submit(body.order, disclosurePublicKey),
      );
    } catch (error) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        error instanceof Error ? error.message : "Order rejected",
      );
    }
  });

  app.get(
    ENDPOINTS.getPrivateRfqDisclosure.path.replace("{settlementId}", ":settlementId"),
    async (request) => {
      const params = ENDPOINTS.getPrivateRfqDisclosure.params!.parse(request.params);
      const parsedQuery = ENDPOINTS.getPrivateRfqDisclosure.query!.parse(request.query);
      const query = { publicKey: encodedKey.parse(parsedQuery.publicKey) };
      const disclosure = matcher.getDisclosure(params.settlementId, query.publicKey);
      if (!disclosure) throw notFound("Disclosure");
      return ENDPOINTS.getPrivateRfqDisclosure.response.parse(disclosure);
    },
  );
}
