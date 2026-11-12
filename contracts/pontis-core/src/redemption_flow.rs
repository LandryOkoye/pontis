//! Redemption transitions after the request (ADR 0020 section 7): accept, reject and fulfil
//! (burn through the token's `minter_burn`), with the burn callback. Expiry and reclaim are in
//! `redemption_exit`.
//!
//! The status changes before a token call and `settling` marks the call in flight, so nothing
//! else can move the request. The books (`burned`, counters) move only when the token call
//! succeeded; a failure restores the status the request had.

use crate::redemption_events::RedemptionEvent;
use crate::redemption_types::*;
use crate::token_calls::{ext_token, GAS_TOKEN_CALL, GAS_TOKEN_CALLBACK};
use crate::types::check;
use crate::{hexa, now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, NearToken, PromiseError, PromiseOrValue};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl Contract {
    /// Issuer account only, before the accept deadline.
    #[payable]
    pub fn accept_redemption(&mut self, id: u64) {
        let mut r = self.redemption_or_panic(id);
        let by = self.assert_issuer_account(&r.representation_id);
        check(
            r.status == RedemptionStatus::Requested,
            "request is not open",
        );
        let now = now_ms();
        check(
            now <= r.accept_deadline_ms,
            "the accept deadline has passed",
        );
        r.status = RedemptionStatus::Accepted;
        r.accepted_ms = Some(now);
        let deadline = now.saturating_add(u64::from(r.settlement_days) * DAY_MS);
        r.fulfil_deadline_ms = Some(deadline);
        let latency = u128::from(now - r.created_ms);
        self.bump_reliability(&r.issuer_id, |c| {
            c.accepted += 1;
            c.accept_latency_ms_total = U128(c.accept_latency_ms_total.0 + latency);
        });
        RedemptionEvent::RedemptionAccepted {
            id,
            accepted_ms: now,
            fulfil_deadline_ms: deadline,
            by,
            timestamp_ms: now,
        }
        .emit();
        self.redemptions.insert(id, r);
    }

    /// Issuer account only, before the current deadline; not blocked by the pause. The user
    /// reclaims the escrow afterwards.
    #[payable]
    pub fn reject_redemption(&mut self, id: u64, reason: String) {
        let mut r = self.redemption_or_panic(id);
        let by = self.issuer_account_caller(&r.representation_id);
        check((1..=64).contains(&reason.len()), "reason is 1 to 64 bytes");
        let now = now_ms();
        let deadline = match r.status {
            RedemptionStatus::Requested => r.accept_deadline_ms,
            RedemptionStatus::Accepted => r.fulfil_deadline_ms.unwrap_or(0),
            _ => env::panic_str("request is not open"),
        };
        check(
            now <= deadline,
            "the deadline has passed; the request can only expire",
        );
        r.status = RedemptionStatus::Rejected;
        r.reject_reason = Some(reason.clone());
        r.resolved_ms = Some(now);
        self.bump_reliability(&r.issuer_id, |c| c.rejected += 1);
        RedemptionEvent::RedemptionRejected {
            id,
            reason,
            by,
            timestamp_ms: now,
        }
        .emit();
        self.redemptions.insert(id, r);
    }

    /// Issuer account only, before the fulfil deadline. Burns the escrow through the token's
    /// `minter_burn`; the request is `fulfilled` from this call on and returns to `accepted` if
    /// the burn fails.
    #[payable]
    pub fn fulfil_redemption(&mut self, id: u64, evidence_hash: String) -> PromiseOrValue<()> {
        let mut r = self.redemption_or_panic(id);
        self.assert_issuer_account(&r.representation_id);
        check(
            r.status == RedemptionStatus::Accepted,
            "request is not accepted",
        );
        check(
            now_ms() <= r.fulfil_deadline_ms.unwrap_or(0),
            "the fulfil deadline has passed",
        );
        check(
            hexa::decode32(&evidence_hash).is_some(),
            "evidence_hash must be 64 lowercase hex characters",
        );
        let token = self.token_of(&r.representation_id);
        r.status = RedemptionStatus::Fulfilled;
        r.settling = true;
        r.fulfilment_evidence_hash = Some(evidence_hash);
        r.resolved_ms = Some(now_ms());
        let amount = r.amount;
        self.redemptions.insert(id, r);
        ext_token::ext(token)
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_TOKEN_CALL)
            .minter_burn(amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_TOKEN_CALLBACK)
                    .on_burn_resolved(id),
            )
            .into()
    }

    /// Callback of `fulfil_redemption`, run once per request.
    #[private]
    pub fn on_burn_resolved(
        &mut self,
        id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let mut r = self.redemption_or_panic(id);
        check(
            r.status == RedemptionStatus::Fulfilled && r.settling,
            "request is not settling",
        );
        let now = now_ms();
        r.settling = false;
        if result.is_err() {
            r.status = RedemptionStatus::Accepted;
            r.fulfilment_evidence_hash = None;
            r.resolved_ms = None;
            self.redemptions.insert(id, r);
            RedemptionEvent::RedemptionFulfilFailed {
                id,
                timestamp_ms: now,
            }
            .emit();
            return;
        }
        let rep_id = r.representation_id.clone();
        let mut totals = self.escrow_totals.get(&rep_id).copied().unwrap_or_default();
        totals.burned += r.amount.0;
        self.escrow_totals.insert(rep_id.clone(), totals);
        self.supply_burned(&rep_id, r.amount.0);
        self.close_open(&r.user);
        let latency = u128::from(now.saturating_sub(r.created_ms));
        self.bump_reliability(&r.issuer_id, |c| {
            c.fulfilled += 1;
            c.settle_latency_ms_total = U128(c.settle_latency_ms_total.0 + latency);
        });
        let status = self.compute_reserve_status(&rep_id, now);
        RedemptionEvent::RedemptionFulfilled {
            id,
            evidence_hash: r.fulfilment_evidence_hash.clone().unwrap_or_default(),
            amount: r.amount,
            circulating_units: status.circulating_units,
            timestamp_ms: now,
        }
        .emit();
        self.redemptions.insert(id, r);
        self.refresh_reserve_state(&rep_id);
    }
}
