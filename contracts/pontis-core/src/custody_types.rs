//! Custody registry records (ADR 0020 section 2) and the shared page shape of its views.

use crate::types::{EvidenceRef, NewEvidence, VerificationStatus};
use near_sdk::{near, AccountId, PublicKey};

pub const MAX_CUSTODIANS_PER_LINK: usize = 4;
pub const DEFAULT_PAGE: u64 = 50;
pub const MAX_PAGE: u64 = 100;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum CustodianStatus {
    Active,
    Suspended,
    Retired,
}

impl CustodianStatus {
    /// `active <-> suspended`, and either to `retired`, which is final.
    pub fn may_move(self, to: CustodianStatus) -> bool {
        matches!(
            (self, to),
            (CustodianStatus::Active, CustodianStatus::Suspended)
                | (CustodianStatus::Suspended, CustodianStatus::Active)
                | (CustodianStatus::Active, CustodianStatus::Retired)
                | (CustodianStatus::Suspended, CustodianStatus::Retired)
        )
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
pub enum CustodyStructure {
    Segregated,
    Omnibus,
    OnChainVault,
}

/// A custodian: who signs the reserve attestations of the representations it is linked to.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct Custodian {
    pub id: String,
    pub name: String,
    pub jurisdiction: Option<String>,
    /// The ed25519 key whose signatures count for this custodian; it must also be registered for
    /// the `reserve_attester` role with scope `reserves` (checked at registration and at every
    /// attestation).
    pub attester_key: PublicKey,
    pub status: CustodianStatus,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
    pub evidence: Vec<EvidenceRef>,
    pub registered_by: AccountId,
    pub registered_at_ms: u64,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct NewCustodian {
    pub id: String,
    pub name: String,
    pub jurisdiction: Option<String>,
    pub attester_key: PublicKey,
    pub synthetic: bool,
    pub verification_status: VerificationStatus,
    pub evidence: Vec<NewEvidence>,
}

/// The custodians of a representation and how its backing is held.
#[derive(Clone, Debug)]
#[near(serializers = [borsh, json])]
pub struct CustodyLink {
    pub representation_id: String,
    pub structure: CustodyStructure,
    pub custodian_ids: Vec<String>,
    pub linked_by: AccountId,
    pub linked_at_ms: u64,
}

/// A page of a paged view: `items` from `from_index`, and the `total` count.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: u64,
}

/// Clamps a requested page size: 0 means the default, at most `MAX_PAGE`.
pub fn page_limit(limit: u64) -> usize {
    if limit == 0 {
        DEFAULT_PAGE as usize
    } else {
        limit.min(MAX_PAGE) as usize
    }
}
