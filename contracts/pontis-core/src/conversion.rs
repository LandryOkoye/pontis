//! Conversion validation for `ft_on_transfer` (ADR 0007). Every check is synchronous and runs
//! against live state, so quote time and execution time cannot drift: a quote is accepted only
//! if the compatibility version, policy version, fee, statuses, pauses, allowlist, inventory and
//! nonce all still match. The first failing check names the `RejectReason`.

use crate::math::{compute_amounts, Amounts};
use crate::quote::{ConversionMsg, QuoteInput, QUOTE_VERSION};
use crate::route::{RouteRefusal, RouteTerms};
use crate::types::RejectReason;
use crate::{now_ms, Contract};
use near_sdk::json_types::U128;
use near_sdk::{env, serde_json, AccountId};

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
