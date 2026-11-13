import { ENDPOINTS } from "@pontis/api-types";
import type { IntentsClient, IntentQuoteRequest } from "@pontis/intents-private";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.ts";

export function registerIntentsRoutes(app: FastifyInstance, client: IntentsClient): void {
  app.get(ENDPOINTS.getIntentTokens.path, async () =>
    ENDPOINTS.getIntentTokens.response.parse({
      assets: await client.supportedAssets(),
      source: client.source,
      simulated: client.simulated,
    }),
  );

  app.post(ENDPOINTS.createIntentQuote.path, async (request) => {
    const body = ENDPOINTS.createIntentQuote.body!.parse(request.body);
    const { confidentiality, ...fields } = body;
    const quote = await client.getQuote({
      ...fields,
      ...(confidentiality ? { confidentiality } : {}),
      dry: true,
    } satisfies IntentQuoteRequest & { dry: true });
    return ENDPOINTS.createIntentQuote.response.parse(quote);
  });

  app.post(ENDPOINTS.createIntentSwap.path, async (request) => {
    if (!client.simulated) {
      throw new AppError("VALIDATION_ERROR", 400, "Live Intents mode supports dry quotes only");
    }
    const body = ENDPOINTS.createIntentSwap.body!.parse(request.body);
    const { confidentiality, ...fields } = body;
    const quote = await client.createSwap({
      ...fields,
      ...(confidentiality ? { confidentiality } : {}),
      dry: false,
    } satisfies IntentQuoteRequest & { dry: false });
    return ENDPOINTS.createIntentSwap.response.parse(quote);
  });

  app.get(ENDPOINTS.getIntentStatus.path, async (request) => {
    const query = ENDPOINTS.getIntentStatus.query!.parse(request.query);
    return ENDPOINTS.getIntentStatus.response.parse(
      await client.getStatus(query.depositAddress, query.depositMemo),
    );
  });
}
