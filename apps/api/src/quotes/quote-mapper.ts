import { RouteDescriptorSchema, type Quote } from "@pontis/api-types";
import type { quotes } from "../db/schema/index.ts";

export type QuoteRow = typeof quotes.$inferSelect;

/** Table row to the API `Quote`. The signature stays server-side; it is only sent in the wallet plan. */
export const quoteFromRow = (r: QuoteRow): Quote => ({
  id: r.id,
  fromId: r.fromId,
  toId: r.toId,
  accountId: r.accountId,
  amountIn: r.amountIn,
  amountOutGross: r.amountOutGross,
  fee: r.fee,
  amountOut: r.amountOut,
  ratio: { num: r.ratioNum, den: r.ratioDen },
  feeBps: r.feeBps,
  expiresAt: r.expiresAt.toISOString(),
  route: RouteDescriptorSchema.parse(r.route),
  compatibilityVersion: r.compatibilityVersion,
  policyVersion: r.policyVersion,
  warnings: r.warnings,
  state: r.state,
  createdAt: r.createdAt.toISOString(),
});
