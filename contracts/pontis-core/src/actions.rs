//! Corporate action lifecycle up to approval (ADR 0017 sections 1 and 4): a `registrar` proposes
//! and records evidence, a different `compat_approver` approves or cancels. Application of an
//! approved action to representations is in `actions_apply.rs`.

use crate::actions_events::ActionEvent;
use crate::actions_types::*;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId};

fn history(status: ActionStatus, by: &AccountId, at_ms: u64, note: &str) -> ActionHistoryEntry {
    ActionHistoryEntry {
        status,
        by: by.clone(),
        at_ms,
        note: note.to_string(),
    }
}

#[near]
impl Contract {
    /// Registrar. Records an announced action and returns its ID, `{asset_id}-{n}`. It has no
    /// effect on routes until a `compat_approver` approves it.
    #[payable]
    pub fn propose_corporate_action(&mut self, action: NewCorporateAction) -> String {
        let by = self.assert_registrar();
        check(
            self.canonical_assets.contains_key(&action.asset_id),
            "canonical asset not found",
        );
        let multiplier_change = action.validate();
        let mut ids = self
            .actions_by_asset
            .get(&action.asset_id)
            .cloned()
            .unwrap_or_default();
        check(
            ids.len() < MAX_ACTIONS_PER_ASSET,
            "too many corporate actions on this asset",
        );
        let id = format!("{}-{}", action.asset_id, ids.len() + 1);
        let now = now_ms();
        ids.push(id.clone());
        self.actions_by_asset.insert(action.asset_id.clone(), ids);
        self.set_open(&action.asset_id, &id, true);
        self.corporate_actions.insert(
            id.clone(),
            CorporateAction {
                id: id.clone(),
                asset_id: action.asset_id.clone(),
                kind: action.kind,
                announced_at_ms: action.announced_at_ms,
                ex_date_ms: action.ex_date_ms,
                effective_ms: action.effective_ms,
                freeze_from_ms: action.freeze_from_ms,
                freeze_until_ms: action.freeze_until_ms,
                multiplier_change,
                evidence: vec![],
                status: ActionStatus::Proposed,
                proposed_by: by.clone(),
                approved_by: None,
                applied_representations: vec![],
                history: vec![history(ActionStatus::Proposed, &by, now, "")],
            },
        );
        ActionEvent::CorporateActionProposed {
            id: id.clone(),
            asset_id: action.asset_id,
            kind: action.kind,
            effective_ms: action.effective_ms,
            freeze_from_ms: action.freeze_from_ms,
            freeze_until_ms: action.freeze_until_ms,
            multiplier_change,
            by,
            timestamp_ms: now,
        }
        .emit();
        id
    }

    /// Registrar. Attaches evidence to an action that is proposed or approved.
    #[payable]
    pub fn add_corporate_action_evidence(&mut self, action_id: String, evidence: NewEvidence) {
        let by = self.assert_registrar();
        validate_new_evidence(&evidence);
        let action = self.action_mut(&action_id);
        check(
            matches!(
                action.status,
                ActionStatus::Proposed | ActionStatus::Approved
            ),
            "evidence can only be added to a proposed or approved action",
        );
        check(
            action.evidence.len() < MAX_EVIDENCE_PER_RECORD,
            "too much evidence on this action",
        );
        let added = EvidenceRef {
            uri: evidence.uri,
            sha256: evidence.sha256,
            provenance: evidence.provenance,
            description: evidence.description,
            added_by: by,
            timestamp_ms: now_ms(),
        };
        action.evidence.push(added.clone());
        ActionEvent::evidence_added(&action_id, &added).emit();
    }

    /// Compat approver other than the proposer. Only before `effective_ms`: an action approved
    /// after it would start with its freeze window already over.
    #[payable]
    pub fn approve_corporate_action(&mut self, action_id: String, rationale: String) {
        let by = self.assert_compat_approver();
        require_text(&rationale, "rationale");
        let now = now_ms();
        let action = self.action_mut(&action_id);
        check(
            action.status == ActionStatus::Proposed,
            "only a proposed action can be approved",
        );
        check(
            action.proposed_by != by,
            "the proposer cannot approve their own action",
        );
        check(now < action.effective_ms, "the action is already effective");
        action.status = ActionStatus::Approved;
        action.approved_by = Some(by.clone());
        action
            .history
            .push(history(ActionStatus::Approved, &by, now, &rationale));
        ActionEvent::CorporateActionApproved {
            id: action_id,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// Compat approver. A proposed action may always be cancelled; an approved one only before
    /// `effective_ms` and while no wrapper has applied it (an applied epoch cannot be taken back,
    /// so a correction is a new action).
    #[payable]
    pub fn cancel_corporate_action(&mut self, action_id: String, reason: String) {
        let by = self.assert_compat_approver();
        require_text(&reason, "reason");
        let now = now_ms();
        let action = self.action_mut(&action_id);
        match action.status {
            ActionStatus::Proposed => {}
            ActionStatus::Approved => {
                check(now < action.effective_ms, "the action is already effective");
                check(
                    action.applied_representations.is_empty(),
                    "a wrapper has already applied this action",
                );
            }
            _ => env::panic_str("the action is already applied or cancelled"),
        }
        action.status = ActionStatus::Cancelled;
        action
            .history
            .push(history(ActionStatus::Cancelled, &by, now, &reason));
        let asset_id = action.asset_id.clone();
        self.set_open(&asset_id, &action_id, false);
        ActionEvent::CorporateActionCancelled {
            id: action_id,
            reason,
            by,
            timestamp_ms: now,
        }
        .emit();
    }
}

impl Contract {
    pub(crate) fn action_mut(&mut self, id: &str) -> &mut CorporateAction {
        self.corporate_actions
            .get_mut(id)
            .unwrap_or_else(|| env::panic_str("corporate action not found"))
    }

    /// Adds `id` to, or removes it from, the asset's list of non-terminal actions, which is all
    /// the route check has to read.
    pub(crate) fn set_open(&mut self, asset_id: &str, id: &str, open: bool) {
        let mut ids = self.open_actions.get(asset_id).cloned().unwrap_or_default();
        ids.retain(|i| i != id);
        if open {
            ids.push(id.to_string());
        }
        self.open_actions.insert(asset_id.to_string(), ids);
    }
}
