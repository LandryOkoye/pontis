// Chart responses (ADR 0015). Same honesty rule as the rest of the market data: every point and
// every envelope says whether it is simulated.

import { z } from "zod";
import { AmountString, Timestamp } from "./common.ts";
import {
  CandleIntervalSchema,
  DataFilterSchema,
  DataSourceSchema,
  PriceString,
} from "./market-types.ts";

export const ChartQuerySchema = z.object({
  interval: CandleIntervalSchema.default("1h"),
  from: Timestamp.optional(),
  to: Timestamp.optional(),
  data: DataFilterSchema.default("all"),
});

const chartEnvelope = <T extends z.ZodType>(id: string, point: T) =>
  z
    .object({
      representationId: z.string(),
      interval: CandleIntervalSchema,
      from: Timestamp,
      to: Timestamp,
      points: z.array(point),
      /** Sources of the points actually returned. */
      source: z.array(DataSourceSchema),
      /** True when any returned point is simulated. */
      simulated: z.boolean(),
      /** Points that carry a previous value forward because no observation fell in the bucket. */
      filledPoints: z.number().int().min(0),
    })
    .meta({ id });

const pointFlags = { t: Timestamp, simulated: z.boolean() };

export const PricePointSchema = z
  .object({
    ...pointFlags,
    open: PriceString,
    high: PriceString,
    low: PriceString,
    close: PriceString,
    volumeBase: AmountString,
    volumeQuote: PriceString,
    trades: z.number().int().min(0),
    filled: z.boolean(),
  })
  .meta({ id: "PricePoint" });
export const NavPointSchema = z
  .object({ ...pointFlags, nav: PriceString, filled: z.boolean() })
  .meta({ id: "NavPoint" });
export const SupplyPointSchema = z
  .object({ ...pointFlags, supply: AmountString, filled: z.boolean() })
  .meta({ id: "SupplyPoint" });
export const VolumePointSchema = z
  .object({
    ...pointFlags,
    volumeBase: AmountString,
    volumeQuote: PriceString,
    trades: z.number().int().min(0),
    filled: z.boolean(),
  })
  .meta({ id: "VolumePoint" });

export const PriceChartSchema = chartEnvelope("PriceChart", PricePointSchema);
export const NavChartSchema = chartEnvelope("NavChart", NavPointSchema);
export const SupplyChartSchema = chartEnvelope("SupplyChart", SupplyPointSchema);
export const VolumeChartSchema = chartEnvelope("VolumeChart", VolumePointSchema);

export type PriceChart = z.infer<typeof PriceChartSchema>;
export type NavChart = z.infer<typeof NavChartSchema>;
export type SupplyChart = z.infer<typeof SupplyChartSchema>;
export type VolumeChart = z.infer<typeof VolumeChartSchema>;
