//! The parity-route gate (brief §13.4, BuildPlan §11): a route is executable only when both
//! representations are active and unpaused (with their issuer and claim active) and the pair's
//! relationship is `approved` and `DIRECT_EQUIVALENT`. B7 calls `check_route` at execution time;
//! the API calls the `get_route` view at quote time.

use crate::types::*;
use crate::{Contract, ContractExt};
use near_sdk::near;

/// Why a route is refused. The API maps these to its error codes: `asset_paused` and
/// `asset_not_active` to `ASSET_PAUSED`, `relationship_suspended` to `RELATIONSHIP_SUSPENDED`,
/// the rest to `NOT_DIRECT_EQUIVALENT`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
pub enum RouteRefusal {
    AssetNotFound,
    AssetPaused,
    AssetNotActive,
    NoRelationship,
    RelationshipNotApproved,
    RelationshipSuspended,
    NotDirectEquivalent,
    PriceDeviation,
    PriceStale,
    PriceMissing,
    PriceUnavailable,
    CorporateActionFreeze,
    CorporateActionPending,
    EpochMismatch,
    NotConvertible,
    LifecycleBlocked,
    NavWindowClosed,
    ReserveRestricted,
    ReserveStale,
}

/// What a quote and its execution must be bound to.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json])]
pub struct RouteTerms {
    /// Output smallest units of the destination per smallest unit of the source.
    pub ratio: Ratio,
    pub compatibility_version: u64,
    pub policy_version: u64,
    /// Added to the fee when a stale or missing price is tolerated (`fail_open_with_wider_fee`).
    pub extra_fee_bps: u16,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [json])]
pub struct RouteView {
    pub executable: bool,
    pub refusal: Option<RouteRefusal>,
    pub terms: Option<RouteTerms>,
    /// The earliest upcoming freeze start of an approved corporate action of either asset
    /// (ADR 0017); a quote must not outlive it.
    pub next_freeze_ms: Option<u64>,
}

#[near]
impl Contract {
    pub fn get_route(&self, from_id: String, to_id: String) -> RouteView {
        let next_freeze_ms = self.next_freeze_of_route(&from_id, &to_id);
        match self.check_route(&from_id, &to_id) {
            Ok(terms) => RouteView {
                executable: true,
                refusal: None,
                terms: Some(terms),
                next_freeze_ms,
            },
            Err(refusal) => RouteView {
                executable: false,
                refusal: Some(refusal),
                terms: None,
                next_freeze_ms,
            },
        }
    }
}

impl Contract {
    pub(crate) fn check_route(
        &self,
        from_id: &str,
        to_id: &str,
    ) -> Result<RouteTerms, RouteRefusal> {
        if self.paused {
            return Err(RouteRefusal::AssetPaused);
        }
        for id in [from_id, to_id] {
            let rep = self
                .representations
                .get(id)
                .ok_or(RouteRefusal::AssetNotFound)?;
            if rep.status == Status::Paused {
                return Err(RouteRefusal::AssetPaused);
            }
            let active = |s: Option<Status>| s == Some(Status::Active);
            if rep.status != Status::Active
                || !active(self.issuers.get(&rep.issuer_id).map(|i| i.status))
                || !active(
                    self.canonical_assets
                        .get(&rep.canonical_asset_id)
                        .map(|a| a.status),
                )
            {
                return Err(RouteRefusal::AssetNotActive);
            }
        }
        self.check_lifecycle(from_id, to_id)?;
        self.check_actions(from_id, to_id)?;
        self.check_reserves(from_id, to_id)?;
        let key = crate::compatibility::pair_key(from_id, to_id);
        let rel = self
            .compatibilities
            .get(&key)
            .ok_or(RouteRefusal::NoRelationship)?;
        match rel.status {
            RelationshipStatus::Suspended => return Err(RouteRefusal::RelationshipSuspended),
            RelationshipStatus::Approved => {}
            _ => return Err(RouteRefusal::RelationshipNotApproved),
        }
        if rel.classification != Classification::DirectEquivalent {
            return Err(RouteRefusal::NotDirectEquivalent);
        }
        let ratio = if from_id == rel.representation_a_id {
            rel.ratio
        } else {
            Ratio {
                num: rel.ratio.den,
                den: rel.ratio.num,
            }
        };
        let extra_fee_bps = match self.check_price_guard(from_id, to_id, ratio)? {
            crate::guard::PriceOutcome::Ok => 0,
            crate::guard::PriceOutcome::Degraded { extra_fee_bps } => extra_fee_bps,
        };
        Ok(RouteTerms {
            ratio,
            compatibility_version: rel.version,
            policy_version: self.policy_version,
            extra_fee_bps,
        })
    }
}
