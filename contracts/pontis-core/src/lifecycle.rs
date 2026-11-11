//! Lifecycle transitions and flags (ADR 0018 section 2). `registrar` moves a representation
//! through its stages and sets its kind and flags; delisting is two steps by two accounts
//! (`request_delist`, then `approve_delist` by a different `compat_approver`).

use crate::actions_events::ActionEvent;
use crate::lifecycle_types::*;
use crate::types::*;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{env, near, AccountId};

/// An optional evidence hash must be a sha256 digest; the note is required text.
fn check_evidence_and_note(evidence_hash: &Option<String>, note: &str) {
    if let Some(hash) = evidence_hash {
        validate_sha256(hash);
    }
    require_text(note, "note");
}

#[near]
impl Contract {
    /// Registrar. Moves a representation to `to` and appends the transition to its history.
    /// `delisted` is refused here (use `request_delist`), `nav_strike_window` is never stored, and
    /// only a `term_instrument` may enter `matured`, `redeeming` or `redeemed`.
    #[payable]
    pub fn set_lifecycle_stage(
        &mut self,
        representation_id: String,
        to: LifecycleStage,
        evidence_hash: Option<String>,
        note: String,
    ) {
        let by = self.assert_registrar();
        check_evidence_and_note(&evidence_hash, &note);
        check(
            to != LifecycleStage::Delisted,
            "delisting is two steps: request_delist, then approve_delist",
        );
        let current = self.require_lifecycle(&representation_id);
        check(
            to != LifecycleStage::NavStrikeWindow && current.stage.may_move(to),
            "this lifecycle transition is not allowed",
        );
        check(
            current.kind == AssetKind::TermInstrument,
            "only a term_instrument can mature or be redeemed",
        );
        self.move_stage(&representation_id, to, by, evidence_hash, note);
    }

    /// Registrar. Opens a request to delist; an approver other than the requester completes it.
    /// A new request replaces an unapproved one.
    #[payable]
    pub fn request_delist(
        &mut self,
        representation_id: String,
        evidence_hash: Option<String>,
        note: String,
    ) {
        let by = self.assert_registrar();
        check_evidence_and_note(&evidence_hash, &note);
        let mut life = self.require_lifecycle(&representation_id);
        check(
            life.stage.may_move(LifecycleStage::Delisted),
            "this representation cannot be delisted from its current stage",
        );
        let now = now_ms();
        life.delist_request = Some(DelistRequest {
            by: by.clone(),
            evidence_hash: evidence_hash.clone(),
            note: note.clone(),
            at_ms: now,
        });
        self.lifecycles.insert(representation_id.clone(), life);
        ActionEvent::DelistRequested {
            representation_id,
            evidence_hash,
            note,
            by,
            timestamp_ms: now,
        }
        .emit();
    }

    /// Compat approver other than the account that requested the delisting.
    #[payable]
    pub fn approve_delist(&mut self, representation_id: String) {
        let by = self.assert_compat_approver();
        let life = self.require_lifecycle(&representation_id);
        let request = life
            .delist_request
            .unwrap_or_else(|| env::panic_str("no delist request is open"));
        check(
            request.by != by,
            "the requester cannot approve their own delisting",
        );
        check(
            life.stage.may_move(LifecycleStage::Delisted),
            "this representation cannot be delisted from its current stage",
        );
        let note = format!("requested by {}: {}", request.by, request.note);
        self.move_stage(
            &representation_id,
            LifecycleStage::Delisted,
            by,
            request.evidence_hash,
            note,
        );
    }

    /// Registrar, while the stage is `active`. Sets the kind and flags (`bridge_only` implies
    /// `no_conversion`) and moves every relationship of the representation to a new version, which
    /// voids older quotes.
    #[payable]
    pub fn set_lifecycle_flags(
        &mut self,
        representation_id: String,
        kind: AssetKind,
        no_conversion: bool,
        bridge_only: bool,
    ) {
        let by = self.assert_registrar();
        let mut life = self.require_lifecycle(&representation_id);
        check(
            life.stage == LifecycleStage::Active,
            "flags can only change while the stage is active",
        );
        life.kind = kind;
        life.no_conversion = no_conversion || bridge_only;
        life.bridge_only = bridge_only;
        let event = ActionEvent::LifecycleFlagsChanged {
            representation_id: representation_id.clone(),
            kind,
            no_conversion: life.no_conversion,
            bridge_only,
            by: by.clone(),
            timestamp_ms: now_ms(),
        };
        self.lifecycles.insert(representation_id.clone(), life);
        self.bump_relationships_of(&representation_id, ReviewAction::LifecycleFlags, &by);
        event.emit();
    }

    /// The lifecycle record of a representation; the default (fungible, active) when none was set.
    pub fn get_lifecycle(&self, representation_id: String) -> Option<Lifecycle> {
        self.representations
            .contains_key(&representation_id)
            .then(|| self.lifecycle_of(&representation_id).clone())
    }
}

impl Contract {
    pub(crate) fn lifecycle_of(&self, rep_id: &str) -> &Lifecycle {
        self.lifecycles.get(rep_id).unwrap_or(&DEFAULT_LIFECYCLE)
    }

    /// A copy of the record to modify; panics if the representation does not exist.
    fn require_lifecycle(&self, rep_id: &str) -> Lifecycle {
        check(
            self.representations.contains_key(rep_id),
            "representation not found",
        );
        self.lifecycle_of(rep_id).clone()
    }

    fn move_stage(
        &mut self,
        rep_id: &str,
        to: LifecycleStage,
        by: AccountId,
        evidence_hash: Option<String>,
        note: String,
    ) {
        let mut life = self.require_lifecycle(rep_id);
        let (from, now) = (life.stage, now_ms());
        life.stage = to;
        life.delist_request = None;
        life.history.push(LifecycleEntry {
            from,
            to,
            by: by.clone(),
            at_ms: now,
            evidence_hash: evidence_hash.clone(),
            note: note.clone(),
        });
        self.lifecycles.insert(rep_id.to_string(), life);
        ActionEvent::LifecycleStageChanged {
            representation_id: rep_id.to_string(),
            from,
            to,
            evidence_hash,
            note,
            by,
            timestamp_ms: now,
        }
        .emit();
    }
}
