//! Per-representation eligibility policy (ADR 0004, ADR 0005).
//!
//! A representation's policy says whether an allowlist is required (default: yes). Membership is
//! checked live at execution. `policy_version` is one global counter that moves when a policy
//! *rule* changes, not when membership changes, so onboarding an account never voids other
//! users' quotes.

use crate::events::CoreEvent;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{near, AccountId};

const MAX_ACCOUNTS_PER_CALL: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json])]
pub struct Policy {
    pub representation_id: String,
    pub allowlist_required: bool,
    pub policy_version: u64,
}

#[near]
impl Contract {
    /// Registrar only. Changing the rule bumps the global `policy_version`; setting the value it
    /// already has is an error so a no-op cannot invalidate quotes.
    #[payable]
    pub fn set_allowlist_required(&mut self, representation_id: String, required: bool) {
        let by = self.assert_registrar();
        self.assert_representation_exists(&representation_id);
        check(
            self.allowlist_required_for(&representation_id) != required,
            "allowlist_required already has this value",
        );
        self.allowlist_required
            .insert(representation_id.clone(), required);
        self.policy_version += 1;
        CoreEvent::PolicyUpdated {
            representation_id,
            allowlist_required: required,
            policy_version: self.policy_version,
            by,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    /// Registrar only. Adds or removes up to 50 accounts for one representation. Membership
    /// changes are live immediately and do not change `policy_version`.
    #[payable]
    pub fn set_allowlist(
        &mut self,
        representation_id: String,
        account_ids: Vec<AccountId>,
        allowed: bool,
    ) {
        let by = self.assert_registrar();
        self.assert_representation_exists(&representation_id);
        check(
            !account_ids.is_empty() && account_ids.len() <= MAX_ACCOUNTS_PER_CALL,
            "provide 1-50 accounts",
        );
        for account_id in &account_ids {
            let key = (representation_id.clone(), account_id.clone());
            if allowed {
                self.allowlist.insert(key);
            } else {
                self.allowlist.remove(&key);
            }
        }
        CoreEvent::AllowlistUpdated {
            representation_id,
            account_ids,
            allowed,
            by,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    pub fn get_policy(&self, representation_id: String) -> Option<Policy> {
        self.representations
            .contains_key(&representation_id)
            .then(|| Policy {
                allowlist_required: self.allowlist_required_for(&representation_id),
                representation_id,
                policy_version: self.policy_version,
            })
    }

    pub fn get_policy_version(&self) -> u64 {
        self.policy_version
    }

    /// True if the representation does not require an allowlist, or the account is on it.
    /// Unknown representations are never allowed.
    pub fn is_allowed(&self, representation_id: String, account_id: AccountId) -> bool {
        self.representations.contains_key(&representation_id)
            && (!self.allowlist_required_for(&representation_id)
                || self.allowlist.contains(&(representation_id, account_id)))
    }
}

impl Contract {
    pub(crate) fn allowlist_required_for(&self, representation_id: &str) -> bool {
        self.allowlist_required
            .get(representation_id)
            .copied()
            .unwrap_or(true)
    }

    fn assert_representation_exists(&self, representation_id: &str) {
        check(
            self.representations.contains_key(representation_id),
            "representation not found",
        );
    }
}
