//! Conversion validation for `ft_on_transfer` (ADR 0007). Every check is synchronous and runs
//! against live state, so quote time and execution time cannot drift: a quote is accepted only
//! if the compatibility version, policy version, fee, statuses, pauses, allowlist, inventory and
//! nonce all still match. The first failing check names the `RejectReason`.

use crate::events::CoreEvent;
use crate::math::{compute_amounts, Amounts};
use crate::quote::{ConversionMsg, QuoteInput, QUOTE_VERSION};
use crate::route::{RouteRefusal, RouteTerms};
use crate::types::{Ratio, RejectReason};
use crate::vault::{ext_ft, GAS_CALLBACK, GAS_FT_TRANSFER};
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, serde_json, AccountId, NearToken, PromiseError, PromiseOrValue};

/// A validated conversion, ready to execute.
#[derive(Clone, Debug)]
pub struct ConversionPlan {
    pub from_id: String,
    pub to_id: String,
    pub user: AccountId,
    pub nonce: [u8; 16],
    pub quote: QuoteInput,
    pub amounts: Amounts,
    pub terms: RouteTerms,
}

/// A refused transfer. `nonce` is set once the quote was readable and its signature valid.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rejection {
    pub reason: RejectReason,
    pub nonce: Option<String>,
}

fn reject(reason: RejectReason) -> Rejection {
    Rejection {
        reason,
        nonce: None,
    }
}

fn route_reason(refusal: RouteRefusal) -> RejectReason {
    match refusal {
        RouteRefusal::RelationshipSuspended => RejectReason::RelationshipSuspended,
        RouteRefusal::AssetPaused | RouteRefusal::AssetNotActive => RejectReason::AssetPaused,
        _ => RejectReason::NotDirectEquivalent,
    }
}

impl Contract {
    /// Validates a conversion `msg` received from `token` on behalf of `sender` for `amount`.
    pub fn validate_conversion(
        &self,
        token: &AccountId,
        sender: &AccountId,
        amount: U128,
        msg: &str,
    ) -> Result<ConversionPlan, Rejection> {
        let from_id = self
            .representation_by_account
            .get(token)
            .ok_or(reject(RejectReason::UnknownToken))?;
        let msg: ConversionMsg =
            serde_json::from_str(msg).map_err(|_| reject(RejectReason::InvalidMsg))?;
        let nonce = self.verify_quote(&msg).map_err(reject)?;
        let q = &msg.quote;
        let fail = |reason| Rejection {
            reason,
            nonce: Some(q.nonce.clone()),
        };

        if q.version != QUOTE_VERSION {
            return Err(fail(RejectReason::UnsupportedVersion));
        }
        if q.contract != env::current_account_id() {
            return Err(fail(RejectReason::ContractMismatch));
        }
        if now_ms() >= q.expires_at_ms {
            return Err(fail(RejectReason::QuoteExpired));
        }
        if *sender != q.user {
            return Err(fail(RejectReason::WrongSender));
        }
        if *token != q.token_in {
            return Err(fail(RejectReason::WrongToken));
        }
        let to_id = self
            .representation_by_account
            .get(&q.token_out)
            .ok_or(fail(RejectReason::UnknownToken))?;
        if amount != q.amount_in {
            return Err(fail(RejectReason::AmountMismatch));
        }

        let terms = self
            .check_route(from_id, to_id)
            .map_err(|r| fail(route_reason(r)))?;
        if terms.compatibility_version != q.compatibility_version {
            return Err(fail(RejectReason::CompatibilityChanged));
        }
        if terms.policy_version != q.policy_version {
            return Err(fail(RejectReason::PolicyChanged));
        }
        if self.fee_bps != q.fee_bps {
            return Err(fail(RejectReason::FeeChanged));
        }
        for rep in [from_id, to_id] {
            if !self.is_allowed(rep.clone(), sender.clone()) {
                return Err(fail(RejectReason::NotEligible));
            }
        }

        let amounts = compute_amounts(amount.0, terms.ratio, self.fee_bps)
            .ok_or(fail(RejectReason::OutputMismatch))?;
        if (amounts.gross, amounts.fee, amounts.net)
            != (q.amount_out_gross.0, q.fee.0, q.amount_out.0)
        {
            return Err(fail(RejectReason::OutputMismatch));
        }
        if amounts.net == 0 {
            return Err(fail(RejectReason::AmountTooSmall));
        }
        if self.get_inventory(to_id.clone()).0 < amounts.net {
            return Err(fail(RejectReason::InsufficientInventory));
        }
        if self.used_nonces.contains(&nonce) {
            return Err(fail(RejectReason::NonceUsed));
        }
        Ok(ConversionPlan {
            from_id: from_id.clone(),
            to_id: to_id.clone(),
            user: q.user.clone(),
            nonce,
            quote: msg.quote,
            amounts,
            terms,
        })
    }
}

/// What the payout callback needs; JSON so it travels as the callback's arguments.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct ConversionRecord {
    pub nonce: String,
    pub user: AccountId,
    pub from_id: String,
    pub to_id: String,
    pub token_in: AccountId,
    pub token_out: AccountId,
    pub amount_in: U128,
    pub amount_out_gross: U128,
    pub fee: U128,
    pub amount_out: U128,
    pub ratio: Ratio,
    pub fee_bps: u16,
    pub compatibility_version: u64,
    pub policy_version: u64,
}

impl Contract {
    /// Executes a validated conversion: marks the nonce used and moves inventory *before* the
    /// payout promise is created, so no later step can observe stale state.
    pub(crate) fn execute_conversion(&mut self, plan: ConversionPlan) -> PromiseOrValue<U128> {
        let q = &plan.quote;
        let inventory_in = self
            .get_inventory(plan.from_id.clone())
            .0
            .checked_add(q.amount_in.0);
        let Some(inventory_in) = inventory_in else {
            let (user, token, amount) = (plan.user.clone(), q.token_in.clone(), q.amount_in);
            let nonce = Some(q.nonce.clone());
            return self.refuse(RejectReason::InventoryOverflow, nonce, user, token, amount);
        };
        let inventory_out = self.get_inventory(plan.to_id.clone()).0 - plan.amounts.net;
        self.used_nonces.insert(plan.nonce);
        self.inventory.insert(plan.from_id.clone(), inventory_in);
        self.inventory.insert(plan.to_id.clone(), inventory_out);

        let record = ConversionRecord {
            nonce: q.nonce.clone(),
            user: plan.user.clone(),
            from_id: plan.from_id,
            to_id: plan.to_id,
            token_in: q.token_in.clone(),
            token_out: q.token_out.clone(),
            amount_in: q.amount_in,
            amount_out_gross: U128(plan.amounts.gross),
            fee: U128(plan.amounts.fee),
            amount_out: U128(plan.amounts.net),
            ratio: plan.terms.ratio,
            fee_bps: q.fee_bps,
            compatibility_version: plan.terms.compatibility_version,
            policy_version: plan.terms.policy_version,
        };
        ext_ft::ext(q.token_out.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(
                plan.user,
                U128(plan.amounts.net),
                Some("pontis conversion".to_string()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_payout_resolved(record),
            )
            .into()
    }
}

#[near]
impl Contract {
    /// Callback of the payout. Returns the amount of the input to refund: `0` on success, the
    /// whole input if the payout failed (inventory is restored; the nonce stays used).
    #[private]
    pub fn on_payout_resolved(
        &mut self,
        record: ConversionRecord,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> U128 {
        let timestamp_ms = now_ms();
        if result.is_ok() {
            CoreEvent::ConversionCompleted {
                nonce: record.nonce,
                user: record.user,
                from_representation_id: record.from_id,
                to_representation_id: record.to_id,
                token_in: record.token_in,
                token_out: record.token_out,
                amount_in: record.amount_in,
                amount_out_gross: record.amount_out_gross,
                fee: record.fee,
                amount_out: record.amount_out,
                ratio: record.ratio,
                fee_bps: record.fee_bps,
                compatibility_version: record.compatibility_version,
                policy_version: record.policy_version,
                timestamp_ms,
            }
            .emit();
            return U128(0);
        }
        let inventory_in = self.get_inventory(record.from_id.clone()).0;
        self.inventory.insert(
            record.from_id,
            inventory_in.saturating_sub(record.amount_in.0),
        );
        let inventory_out = self.get_inventory(record.to_id.clone()).0;
        self.inventory.insert(
            record.to_id,
            inventory_out.saturating_add(record.amount_out.0),
        );
        CoreEvent::ConversionFailed {
            nonce: record.nonce,
            user: record.user,
            reason: "PAYOUT_FAILED".to_string(),
            amount_in: record.amount_in,
            timestamp_ms,
        }
        .emit();
        record.amount_in
    }
}
