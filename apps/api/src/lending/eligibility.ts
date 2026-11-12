import type {
  CollateralAsset,
  CollateralEligibility,
  CollateralPolicy,
  LendingProviderId,
  OraclePrice,
  SupportedChain,
} from "./types.ts";

/** Config-backed registry. Eligibility policy is data, never a symbol check in route code. */
export class CollateralRegistry {
  private readonly assets = new Map<string, CollateralAsset>();
  private readonly policies = new Map<string, CollateralPolicy>();

  constructor(assets: readonly CollateralAsset[] = [], policies: readonly CollateralPolicy[] = []) {
    for (const asset of assets) this.assets.set(asset.id, asset);
    for (const policy of policies) this.policies.set(policy.assetId, policy);
  }

  getAsset(assetId: string): CollateralAsset | undefined {
    return this.assets.get(assetId);
  }

  getPolicy(assetId: string): CollateralPolicy | undefined {
    return this.policies.get(assetId);
  }

  listAssets(): readonly CollateralAsset[] {
    return [...this.assets.values()];
  }

  assess(input: {
    assetId: string;
    provider: LendingProviderId;
    chain: SupportedChain;
    loanToken: string;
    price: OraclePrice | null;
    now: Date;
  }): CollateralEligibility {
    const asset = this.getAsset(input.assetId) ?? null;
    const policy = this.getPolicy(input.assetId) ?? null;
    const reasons: CollateralEligibility["reasons"][number][] = [];
    if (!asset || !policy) reasons.push("UNKNOWN_ASSET");
    if (asset && !asset.verified) reasons.push("UNVERIFIED_TOKEN");
    if (asset && !asset.issuer.authorized) reasons.push("UNAUTHORIZED_ISSUER");
    if (policy && !policy.enabled) reasons.push("POLICY_DISABLED");
    if (asset && asset.chain !== input.chain) reasons.push("UNSUPPORTED_CHAIN");
    if (policy && !policy.allowedChains.includes(input.chain)) reasons.push("UNSUPPORTED_CHAIN");
    if (policy && !policy.allowedProviders.includes(input.provider))
      reasons.push("UNSUPPORTED_PROVIDER");
    if (
      !input.price ||
      !input.price.verified ||
      input.price.loanToken.toLowerCase() !== input.loanToken.toLowerCase()
    ) {
      reasons.push("MISSING_PRICE");
    } else if (policy) {
      const age = (input.now.getTime() - input.price.observedAt.getTime()) / 1_000;
      if (age > policy.maxOracleAgeSeconds) reasons.push("STALE_PRICE");
      if (input.price.confidenceBps < policy.minimumValuationConfidenceBps)
        reasons.push("LOW_CONFIDENCE_PRICE");
    }
    return { eligible: reasons.length === 0, reasons, asset, policy, price: input.price };
  }
}
