//! Redemption exits (ADR 0020 section 7): expiry of an overdue request and the user's reclaim of
//! the escrow (return through the token's `ft_transfer`), with the reclaim callback.
//!
//! Neither is blocked by the pause: a user can always get an escrow back. The status changes
//! before the token call and `settling` marks it in flight; `returned` and the counters move only
//! when the call succeeded, and a failure restores `rejected` or `expired`.

use crate::redemption_events::RedemptionEvent;
use crate::redemption_types::*;
use crate::token_calls::GAS_TOKEN_CALLBACK;
use crate::types::check;
use crate::vault::ext_ft;
use crate::{now_ms, Contract, ContractExt};
use near_sdk::{assert_one_yocto, env, near, NearToken, PromiseError, PromiseOrValue};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl Contract {
    /// Anyone may call (1 yocto, not blocked by the pause) once a deadline has passed. Records
    /// the miss against the issuer.
    #[payable]
    pub fn expire_redemption(&mut self, id: u64) {
        assert_one_yocto();
        let mut r = self.redemption_or_panic(id);
        check(self.expire_if_overdue(&mut r), "nothing to expire");
        self.redemptions.insert(id, r);
    }

    /// The redemption's user. `rejected` and `expired` requests, and `requested` or `accepted`
    /// ones past their deadline (which expire first), return the escrow. Not blocked by the pause.
    #[payable]
    pub fn reclaim_redemption(&mut self, id: u64) -> PromiseOrValue<()> {
        assert_one_yocto();
        let mut r = self.redemption_or_panic(id);
        check(
            env::predecessor_account_id() == r.user,
            "only the redemption's user can reclaim",
        );
        check(!r.settling, "a token call is in flight");
        self.expire_if_overdue(&mut r);
        check(
            matches!(
                r.status,
                RedemptionStatus::Rejected | RedemptionStatus::Expired
            ),
            "the escrow is not reclaimable yet",
        );
        r.status = RedemptionStatus::Reclaimed;
        r.settling = true;
        let (token, user, amount) = (
            self.token_of(&r.representation_id),
            r.user.clone(),
            r.amount,
        );
        self.redemptions.insert(id, r);
        ext_ft::ext(token)
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(crate::vault::GAS_FT_TRANSFER)
            .ft_transfer(user, amount, Some("pontis redemption reclaim".to_string()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_TOKEN_CALLBACK)
                    .on_reclaim_resolved(id),
            )
            .into()
    }

    /// Callback of `reclaim_redemption`, run once per request.
    #[private]
    pub fn on_reclaim_resolved(
        &mut self,
        id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let mut r = self.redemption_or_panic(id);
        check(
            r.status == RedemptionStatus::Reclaimed && r.settling,
            "request is not settling",
        );
        let now = now_ms();
        r.settling = false;
        if result.is_err() {
            r.status = if r.miss.is_some() {
                RedemptionStatus::Expired
            } else {
                RedemptionStatus::Rejected
            };
            self.redemptions.insert(id, r);
            RedemptionEvent::RedemptionReclaimFailed {
                id,
                timestamp_ms: now,
            }
            .emit();
            return;
        }
        let mut totals = self
            .escrow_totals
            .get(&r.representation_id)
            .copied()
            .unwrap_or_default();
        totals.returned += r.amount.0;
        self.escrow_totals
            .insert(r.representation_id.clone(), totals);
        self.close_open(&r.user);
        self.bump_reliability(&r.issuer_id, |c| c.reclaimed += 1);
        RedemptionEvent::RedemptionReclaimed {
            id,
            user: r.user.clone(),
            amount: r.amount,
            timestamp_ms: now,
        }
        .emit();
        self.redemptions.insert(id, r);
    }
}

impl Contract {
    pub(crate) fn token_of(&self, rep_id: &str) -> near_sdk::AccountId {
        self.representations
            .get(rep_id)
            .map(|r| r.account_id.clone())
            .unwrap_or_else(|| env::panic_str("representation not found"))
    }

    /// One fewer open request for `user`.
    pub(crate) fn close_open(&mut self, user: &near_sdk::AccountId) {
        let open = self.redemption_open.get(user).copied().unwrap_or(0);
        self.redemption_open
            .insert(user.clone(), open.saturating_sub(1));
    }

    /// Expires `r` if it is `requested` or `accepted` past its deadline: records the miss and
    /// emits the event. Returns whether it expired. The caller stores `r`.
    fn expire_if_overdue(&mut self, r: &mut Redemption) -> bool {
        let now = now_ms();
        let miss = match r.status {
            RedemptionStatus::Requested if now > r.accept_deadline_ms => Miss::Accept,
            RedemptionStatus::Accepted if now > r.fulfil_deadline_ms.unwrap_or(u64::MAX) => {
                Miss::Fulfil
            }
            _ => return false,
        };
        r.status = RedemptionStatus::Expired;
        r.miss = Some(miss);
        r.resolved_ms = Some(now);
        self.bump_reliability(&r.issuer_id, |c| {
            c.expired += 1;
            match miss {
                Miss::Accept => c.accept_misses += 1,
                Miss::Fulfil => c.fulfil_misses += 1,
            }
            c.last_miss_ms = Some(now);
        });
        RedemptionEvent::RedemptionExpired {
            id: r.id,
            miss,
            timestamp_ms: now,
        }
        .emit();
        true
    }
}
