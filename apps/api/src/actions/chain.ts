import type {
  ChainCorporateAction,
  ChainLifecycle,
  ChainMultiplierEpoch,
  ChainNavStrike,
} from "@pontis/near-client";

/** What the lifecycle, corporate action and NAV endpoints read from the chain; `CoreClient` implements it. */
export interface ActionsChain {
  getCorporateActions(assetId: string): Promise<ChainCorporateAction[]>;
  getMultiplierEpochs(representationId: string): Promise<ChainMultiplierEpoch[]>;
  getLifecycle(representationId: string): Promise<ChainLifecycle | null>;
  getNavStrike(representationId: string): Promise<ChainNavStrike | null>;
}
