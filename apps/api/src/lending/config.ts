import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import { CollateralRegistry } from "./eligibility.ts";
import { MorphoBlueSepoliaProvider } from "./morpho-blue.ts";
import { LendingProviders } from "./providers.ts";
import { LendingService, type OraclePriceSource } from "./service.ts";
import type { CollateralAsset, CollateralPolicy, OraclePrice } from "./types.ts";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value as Address);
const bigintString = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(BigInt);
const assetSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  underlyingReference: z.string(),
  chain: z.enum(["ethereum-sepolia", "near-testnet"]),
  tokenStandard: z.enum(["ERC-20", "NEP-141"]),
  token: z.string(),
  decimals: z.number().int().min(0).max(255),
  origin: z.enum(["pontis", "rhea"]),
  verified: z.boolean(),
  issuer: z.object({ id: z.string(), name: z.string(), authorized: z.boolean() }),
});
const policySchema = z.object({
  assetId: z.string(),
  enabled: z.boolean(),
  maxLtvWad: bigintString,
  maxOracleAgeSeconds: z.number().int().positive(),
  minimumValuationConfidenceBps: z.number().int().min(0).max(10_000),
  allowedProviders: z.array(z.enum(["morpho-blue", "rhea"])),
  allowedChains: z.array(z.enum(["ethereum-sepolia", "near-testnet"])),
  restrictions: z.array(z.string()),
});
const marketSchema = z.object({
  id: z.string(),
  collateralAssetId: z.string(),
  collateralToken: address,
  loanToken: address,
  loanSymbol: z.string(),
  oracle: address,
  irm: address,
  lltvWad: bigintString,
});
const priceSchema = z.object({
  assetId: z.string(),
  loanToken: z.string(),
  numerator: bigintString,
  denominator: bigintString,
  observedAt: z.iso.datetime().transform((value) => new Date(value)),
  confidenceBps: z.number().int().min(0).max(10_000),
  verified: z.boolean(),
});

interface LendingEnvironment {
  MORPHO_SEPOLIA_RPC_URL?: string | undefined;
  MORPHO_BLUE_ADDRESS?: string | undefined;
  MORPHO_BLUE_MARKETS_JSON?: string | undefined;
  PONTIS_COLLATERAL_REGISTRY_JSON?: string | undefined;
  PONTIS_ORACLE_PRICES_JSON?: string | undefined;
}

/**
 * Builds lending only from an explicit complete deployment bundle. An empty
 * configuration leaves lending routes unavailable; a partial one fails startup
 * rather than silently publishing an unsafe market.
 */
export function lendingFromEnvironment(env: LendingEnvironment): LendingService | undefined {
  const values = [
    env.MORPHO_SEPOLIA_RPC_URL,
    env.MORPHO_BLUE_ADDRESS,
    env.MORPHO_BLUE_MARKETS_JSON,
    env.PONTIS_COLLATERAL_REGISTRY_JSON,
    env.PONTIS_ORACLE_PRICES_JSON,
  ];
  if (values.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) throw new Error("Incomplete Morpho lending configuration");
  const rpcUrl = z.url().parse(env.MORPHO_SEPOLIA_RPC_URL);
  const morpho = address.parse(env.MORPHO_BLUE_ADDRESS);
  const markets = parseJson(
    env.MORPHO_BLUE_MARKETS_JSON,
    z.array(marketSchema),
    "MORPHO_BLUE_MARKETS_JSON",
  );
  const registryConfig = parseJson(
    env.PONTIS_COLLATERAL_REGISTRY_JSON,
    z.object({ assets: z.array(assetSchema), policies: z.array(policySchema) }),
    "PONTIS_COLLATERAL_REGISTRY_JSON",
  );
  const prices = parseJson(
    env.PONTIS_ORACLE_PRICES_JSON,
    z.array(priceSchema),
    "PONTIS_ORACLE_PRICES_JSON",
  );
  const provider = new MorphoBlueSepoliaProvider(
    createPublicClient({ chain: sepolia, transport: http(rpcUrl) }),
    morpho,
    markets,
  );
  return new LendingService(
    new CollateralRegistry(
      registryConfig.assets as CollateralAsset[],
      registryConfig.policies as CollateralPolicy[],
    ),
    new LendingProviders([provider]),
    new StaticOraclePriceSource(prices as OraclePrice[]),
  );
}

export class StaticOraclePriceSource implements OraclePriceSource {
  constructor(private readonly prices: readonly OraclePrice[]) {}
  async get(assetId: string, loanToken: string): Promise<OraclePrice | null> {
    return (
      this.prices.find(
        (price) =>
          price.assetId === assetId && price.loanToken.toLowerCase() === loanToken.toLowerCase(),
      ) ?? null
    );
  }
}

function parseJson<T>(raw: string | undefined, schema: z.ZodType<T>, name: string): T {
  try {
    return schema.parse(JSON.parse(raw ?? ""));
  } catch (error) {
    throw new Error(`Invalid ${name}`, { cause: error });
  }
}
