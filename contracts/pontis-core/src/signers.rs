//! Signer key registry (ADR 0019 section 2, ADR 0020 section 1): the ed25519 keys whose
//! signatures an attester role's attestations carry. A role names who may act; the signing
//! authority is a registered key, tied to an account that holds the role and to a scope list.
//!
//! Other modules verify through `verify_signer`, which returns the account the key is tied to.
//! Revoking a role drops that account's keys of the role in the same call, so a key never
//! outlives its role. The `price_publisher` key set is separate and unchanged.

use crate::events::RoleName;
use crate::price::verify_ed25519;
use crate::types::check;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId, CurveType, PublicKey};

pub const MAX_SIGNER_KEYS: usize = 8;
pub const MAX_SCOPES: usize = 4;

/// A registered signing key.
#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub struct SignerKey {
    pub account_id: AccountId,
    pub public_key: PublicKey,
    pub scopes: Vec<String>,
    pub added_ms: u64,
}

/// Why `verify_signer` refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignerError {
    UnknownKey,
    ScopeMissing,
    BadSignature,
}

#[near(event_json(standard = "pontis"))]
pub enum SignerEvent {
    #[event_version("1.0.0")]
    SignerKeyAdded {
        role: RoleName,
        account_id: AccountId,
        public_key: String,
        scopes: Vec<String>,
        by: AccountId,
        timestamp_ms: u64,
    },
    #[event_version("1.0.0")]
    SignerKeyRemoved {
        role: RoleName,
        account_id: AccountId,
        public_key: String,
        by: AccountId,
        timestamp_ms: u64,
    },
}

/// The scopes a role's keys may carry; `None` for a role without a key registry.
fn allowed_scopes(role: RoleName) -> Option<&'static [&'static str]> {
    match role {
        RoleName::Attester => Some(&["kyb", "legal", "custody", "audit"]),
        RoleName::ReserveAttester => Some(&["reserves", "custody"]),
        RoleName::BridgeAttester => Some(&["bridge"]),
        _ => None,
    }
}

#[near]
impl Contract {
    /// Owner only. Registers `public_key` for an account that holds the attester `role`, with
    /// `scopes` from the role's allowed set (1 to 4, distinct). At most 8 keys per role.
    #[payable]
    pub fn add_signer_key(
        &mut self,
        role: RoleName,
        account_id: AccountId,
        public_key: PublicKey,
        scopes: Vec<String>,
    ) {
        self.assert_owner();
        let allowed = allowed_scopes(role)
            .unwrap_or_else(|| env::panic_str("role has no signer key registry"));
        check(
            self.has_role(role, account_id.clone()),
            "account does not hold this role",
        );
        check(
            public_key.curve_type() == CurveType::ED25519,
            "signer key must be an ed25519 key",
        );
        check(
            (1..=MAX_SCOPES).contains(&scopes.len()),
            "a key needs 1 to 4 scopes",
        );
        for (i, scope) in scopes.iter().enumerate() {
            check(
                allowed.contains(&scope.as_str()),
                "scope is not allowed for this role",
            );
            check(!scopes[..i].contains(scope), "duplicate scope");
        }
        let mut keys = self.keys_of(role);
        check(
            keys.len() < MAX_SIGNER_KEYS,
            "too many signer keys for this role",
        );
        check(
            keys.iter().all(|k| k.public_key != public_key),
            "key is already registered for this role",
        );
        let now = now_ms();
        keys.push(SignerKey {
            account_id: account_id.clone(),
            public_key: public_key.clone(),
            scopes: scopes.clone(),
            added_ms: now,
        });
        self.signer_keys.insert(role.as_str().to_string(), keys);
        SignerEvent::SignerKeyAdded {
            role,
            account_id,
            public_key: String::from(&public_key),
            scopes,
            by: env::predecessor_account_id(),
            timestamp_ms: now,
        }
        .emit();
    }

    /// Owner only. Removing a key stops its signatures at once.
    #[payable]
    pub fn remove_signer_key(&mut self, role: RoleName, public_key: PublicKey) {
        self.assert_owner();
        let mut keys = self.keys_of(role);
        let at = keys
            .iter()
            .position(|k| k.public_key == public_key)
            .unwrap_or_else(|| env::panic_str("key is not registered for this role"));
        let key = keys.remove(at);
        self.signer_keys.insert(role.as_str().to_string(), keys);
        emit_removed(role, key, env::predecessor_account_id());
    }

    pub fn get_signer_keys(&self, role: RoleName) -> Vec<SignerKey> {
        self.keys_of(role)
    }

    /// Every role the account holds, as snake_case names: `owner` first, then the grantable
    /// roles in a fixed order. Empty for an account with no role.
    pub fn get_account_roles(&self, account_id: AccountId) -> Vec<String> {
        let mut roles = Vec::new();
        if account_id == self.owner_id {
            roles.push("owner".to_string());
        }
        for role in RoleName::ALL {
            if self.has_role(role, account_id.clone()) {
                roles.push(role.as_str().to_string());
            }
        }
        roles
    }
}

impl Contract {
    fn keys_of(&self, role: RoleName) -> Vec<SignerKey> {
        self.signer_keys
            .get(role.as_str())
            .cloned()
            .unwrap_or_default()
    }

    /// Verifies that `public_key` is registered for `role` with `scope` and signed `message`.
    /// Returns the account the key is tied to.
    #[allow(dead_code)] // the first caller is the reserve attestation of ADR 0020
    pub(crate) fn verify_signer(
        &self,
        role: RoleName,
        public_key: &PublicKey,
        scope: &str,
        message: &[u8],
        signature: &[u8],
    ) -> Result<AccountId, SignerError> {
        let keys = self.keys_of(role);
        let key = keys
            .iter()
            .find(|k| &k.public_key == public_key)
            .ok_or(SignerError::UnknownKey)?;
        if !key.scopes.iter().any(|s| s == scope) {
            return Err(SignerError::ScopeMissing);
        }
        if !verify_ed25519(public_key, message, signature) {
            return Err(SignerError::BadSignature);
        }
        Ok(key.account_id.clone())
    }

    /// Drops every key of `role` tied to `account_id` (called when the role is revoked).
    pub(crate) fn drop_signer_keys(&mut self, role: RoleName, account_id: &AccountId) {
        let (gone, kept): (Vec<_>, Vec<_>) = self
            .keys_of(role)
            .into_iter()
            .partition(|k| &k.account_id == account_id);
        if gone.is_empty() {
            return;
        }
        self.signer_keys.insert(role.as_str().to_string(), kept);
        for key in gone {
            emit_removed(role, key, env::predecessor_account_id());
        }
    }
}

fn emit_removed(role: RoleName, key: SignerKey, by: AccountId) {
    SignerEvent::SignerKeyRemoved {
        role,
        account_id: key.account_id,
        public_key: String::from(&key.public_key),
        by,
        timestamp_ms: now_ms(),
    }
    .emit();
}
