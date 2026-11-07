//! Roles, global pause and two-step ownership transfer (ADR 0003).
//!
//! | Role | Held by |
//! |---|---|
//! | `owner` | one account; grants roles, unpauses, transfers ownership |
//! | `registrar` | registers records, evidence, status changes |
//! | `compat_approver` | compatibility lifecycle (B6) |
//! | `pauser` | pauses globally or per asset; can never unpause |

use crate::events::{CoreEvent, PauseScope, RoleName};
use crate::types::check;
use crate::{Contract, ContractExt};
use near_sdk::store::IterableSet;
use near_sdk::{assert_one_yocto, env, near, AccountId};

#[near]
impl Contract {
    /// Owner only. Roles other than `owner` are grantable; granting twice is an error.
    #[payable]
    pub fn grant_role(&mut self, role: RoleName, account_id: AccountId) {
        self.assert_owner();
        check(
            self.role_set_mut(role).insert(account_id.clone()),
            "account already holds this role",
        );
        CoreEvent::RoleGranted {
            role,
            account_id,
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    /// Owner only. Revoking a role the account does not hold is an error.
    #[payable]
    pub fn revoke_role(&mut self, role: RoleName, account_id: AccountId) {
        self.assert_owner();
        check(
            self.role_set_mut(role).remove(&account_id),
            "account does not hold this role",
        );
        CoreEvent::RoleRevoked {
            role,
            account_id,
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    /// Owner only. Step one: nominate a new owner. Ownership does not move until they accept.
    /// Calling again replaces the nominee.
    #[payable]
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        check(new_owner != self.owner_id, "already the owner");
        self.pending_owner = Some(new_owner.clone());
        CoreEvent::OwnershipTransferProposed {
            current_owner: self.owner_id.clone(),
            proposed_owner: new_owner,
        }
        .emit();
    }

    /// Step two: the nominee accepts and becomes owner.
    #[payable]
    pub fn accept_ownership(&mut self) {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        check(
            self.pending_owner.as_ref() == Some(&caller),
            "caller is not the pending owner",
        );
        let previous_owner = std::mem::replace(&mut self.owner_id, caller.clone());
        self.pending_owner = None;
        CoreEvent::OwnershipTransferred {
            previous_owner,
            new_owner: caller,
        }
        .emit();
    }

    /// Pauser only. Pauses registry mutations globally immediately. Only the owner can unpause.
    #[payable]
    pub fn pause(&mut self) {
        let caller = self.assert_pauser();
        check(!self.paused, "already paused");
        self.paused = true;
        CoreEvent::Paused {
            scope: PauseScope::Global,
            target: None,
            by: caller,
        }
        .emit();
    }

    /// Owner only.
    #[payable]
    pub fn unpause(&mut self) {
        self.assert_owner();
        check(self.paused, "not paused");
        self.paused = false;
        CoreEvent::Unpaused {
            scope: PauseScope::Global,
            target: None,
            by: env::predecessor_account_id(),
        }
        .emit();
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_pending_owner(&self) -> Option<AccountId> {
        self.pending_owner.clone()
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn has_role(&self, role: RoleName, account_id: AccountId) -> bool {
        self.role_set(role).contains(&account_id)
    }

    pub fn get_role_members(&self, role: RoleName) -> Vec<AccountId> {
        self.role_set(role).iter().cloned().collect()
    }
}

impl Contract {
    fn role_set(&self, role: RoleName) -> &IterableSet<AccountId> {
        match role {
            RoleName::Registrar => &self.registrars,
            RoleName::CompatApprover => &self.compat_approvers,
            RoleName::Pauser => &self.pausers,
        }
    }

    fn role_set_mut(&mut self, role: RoleName) -> &mut IterableSet<AccountId> {
        match role {
            RoleName::Registrar => &mut self.registrars,
            RoleName::CompatApprover => &mut self.compat_approvers,
            RoleName::Pauser => &mut self.pausers,
        }
    }

    /// Requires 1 yocto and `predecessor == owner`.
    pub(crate) fn assert_owner(&self) {
        assert_one_yocto();
        check(
            env::predecessor_account_id() == self.owner_id,
            "only the owner can call this method",
        );
    }

    /// Requires 1 yocto and the pauser role. Returns the caller.
    pub(crate) fn assert_pauser(&self) -> AccountId {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        check(self.pausers.contains(&caller), "caller is not a pauser");
        caller
    }

    /// Requires 1 yocto, the registrar role and no global pause. Returns the caller.
    pub(crate) fn assert_registrar(&self) -> AccountId {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        check(
            self.registrars.contains(&caller),
            "caller is not a registrar",
        );
        self.assert_not_paused();
        caller
    }

    /// Requires 1 yocto, the compat_approver role and no global pause. Returns the caller.
    pub(crate) fn assert_compat_approver(&self) -> AccountId {
        assert_one_yocto();
        let caller = env::predecessor_account_id();
        check(
            self.compat_approvers.contains(&caller),
            "caller is not a compat approver",
        );
        self.assert_not_paused();
        caller
    }

    pub(crate) fn assert_not_paused(&self) {
        check(!self.paused, "contract is paused");
    }
}
