//! Redemption requests (ADR 0020 section 7): the `redeem:` message of `ft_on_transfer`, the
//! escrow ledger, issuer reliability counters and the views. The transitions after a request are
//! in `redemption_flow`.

use crate::hexa;
use crate::redemption_events::RedemptionEvent;
use crate::redemption_types::*;
use crate::types::Status;
use crate::{now_ms, Contract};
use near_sdk::json_types::U128;
use near_sdk::AccountId;

/// `redeem:{terms_hash}:{payout_instruction_hash}`, both 64 lowercase hex characters.
pub(crate) fn parse_msg(msg: &str) -> Option<(String, String)> {
    let rest = msg.strip_prefix(REDEEM_PREFIX)?;
    let (terms, payout) = rest.split_once(':')?;
    hexa::decode32(terms)?;
    hexa::decode32(payout)?;
    Some((terms.to_string(), payout.to_string()))
}

impl Contract {
    /// Escrows `amount` of `token` for `sender` if the message and the terms allow it. Returns
    /// the new redemption id. The caller returns the whole amount on `Err`.
    pub(crate) fn try_redeem(
        &mut self,
        token: &AccountId,
        sender: &AccountId,
        amount: U128,
        msg: &str,
    ) -> Result<u64, RedeemRefusal> {
        let rep_id = self
            .representation_by_account
            .get(token)
            .cloned()
            .ok_or(RedeemRefusal::UnknownToken)?;
        let (terms_hash, payout_hash) = parse_msg(msg).ok_or(RedeemRefusal::InvalidMsg)?;
        if self.paused {
            return Err(RedeemRefusal::Paused);
        }
        let rep = self
            .representations
            .get(&rep_id)
            .ok_or(RedeemRefusal::UnknownToken)?;
        if !matches!(rep.status, Status::Active | Status::Restricted) {
            return Err(RedeemRefusal::AssetNotRedeemable);
        }
        let issuer_id = rep.issuer_id.clone();
        let record = self
            .redemption_terms
            .get(&rep_id)
            .cloned()
            .ok_or(RedeemRefusal::TermsMissing)?;
        if record.terms_hash != terms_hash {
            return Err(RedeemRefusal::TermsChanged);
        }
        let t = &record.terms;
        let now = now_ms();
        if amount.0 < t.min_amount.0 {
            return Err(RedeemRefusal::BelowMin);
        }
        if t.max_amount.0 != 0 && amount.0 > t.max_amount.0 {
            return Err(RedeemRefusal::AboveMax);
        }
        if !t.window_open(now) {
            return Err(RedeemRefusal::WindowClosed);
        }
        if self.redemption_open.get(sender).copied().unwrap_or(0) as usize >= MAX_OPEN_PER_USER {
            return Err(RedeemRefusal::TooManyOpen);
        }
        let totals = self.escrow_totals.get(&rep_id).copied().unwrap_or_default();
        let escrowed_in = totals
            .escrowed_in
            .checked_add(amount.0)
            .ok_or(RedeemRefusal::AboveMax)?;
        let fee = t.fee_units(amount.0).ok_or(RedeemRefusal::AboveMax)?;

        self.redemption_seq += 1;
        let id = self.redemption_seq;
        let redemption = Redemption {
            id,
            user: sender.clone(),
            representation_id: rep_id.clone(),
            issuer_id: issuer_id.clone(),
            amount,
            fee_bps: t.fee_bps,
            fee_units: U128(fee),
            net_units: U128(amount.0 - fee),
            terms_hash,
            terms_version: record.version,
            payout_instruction_hash: payout_hash.clone(),
            status: RedemptionStatus::Requested,
            created_ms: now,
            accept_deadline_ms: now.saturating_add(t.accept_within_ms),
            accepted_ms: None,
            fulfil_deadline_ms: None,
            resolved_ms: None,
            fulfilment_evidence_hash: None,
            reject_reason: None,
            miss: None,
            settlement_days: t.settlement_days,
            settling: false,
        };
        self.escrow_totals.insert(
            rep_id.clone(),
            EscrowTotals {
                escrowed_in,
                ..totals
            },
        );
        let mut by_user = self
            .redemptions_by_user
            .get(sender)
            .cloned()
            .unwrap_or_default();
        by_user.push(id);
        self.redemptions_by_user.insert(sender.clone(), by_user);
        let mut by_rep = self
            .redemptions_by_rep
            .get(&rep_id)
            .cloned()
            .unwrap_or_default();
        by_rep.push(id);
        self.redemptions_by_rep.insert(rep_id.clone(), by_rep);
        let open = self.redemption_open.get(sender).copied().unwrap_or(0);
        self.redemption_open.insert(sender.clone(), open + 1);
        self.bump_reliability(&issuer_id, |r| r.requested += 1);
        RedemptionEvent::RedemptionRequested {
            id,
            user: sender.clone(),
            representation_id: rep_id,
            issuer_id,
            amount,
            fee_bps: redemption.fee_bps,
            fee_units: redemption.fee_units,
            terms_hash: redemption.terms_hash.clone(),
            terms_version: redemption.terms_version,
            payout_instruction_hash: payout_hash,
            accept_deadline_ms: redemption.accept_deadline_ms,
            timestamp_ms: now,
        }
        .emit();
        self.redemptions.insert(id, redemption);
        Ok(id)
    }

    pub(crate) fn refuse_redemption(
        &self,
        reason: RedeemRefusal,
        sender_id: AccountId,
        token: AccountId,
        amount: U128,
    ) {
        RedemptionEvent::RedemptionRefused {
            reason,
            sender_id,
            token,
            amount,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    /// Applies `change` to the issuer's counters and stores them.
    pub(crate) fn bump_reliability(
        &mut self,
        issuer_id: &str,
        change: impl FnOnce(&mut IssuerReliability),
    ) {
        let mut r = self
            .issuer_reliability
            .get(issuer_id)
            .cloned()
            .unwrap_or_else(|| default_reliability(issuer_id));
        change(&mut r);
        self.issuer_reliability.insert(issuer_id.to_string(), r);
    }

    pub(crate) fn redemption_or_panic(&self, id: u64) -> Redemption {
        self.redemptions
            .get(&id)
            .cloned()
            .unwrap_or_else(|| near_sdk::env::panic_str("redemption not found"))
    }
}

pub(crate) fn default_reliability(issuer_id: &str) -> IssuerReliability {
    IssuerReliability {
        issuer_id: issuer_id.to_string(),
        simulated: true,
        ..Default::default()
    }
}
