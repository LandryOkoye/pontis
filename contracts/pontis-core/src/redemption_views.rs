//! Redemption views (ADR 0020 section 7): a request by id, by user and by representation (the
//! issuer queue), the escrow ledger and the issuer reliability counters.

use crate::custody_types::{page_limit, Page};
use crate::redemption::default_reliability;
use crate::redemption_types::*;
use crate::{Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// Whether a record in this state still holds its escrow (settling ones included).
fn holds_escrow(r: &Redemption) -> bool {
    match r.status {
        RedemptionStatus::Requested
        | RedemptionStatus::Accepted
        | RedemptionStatus::Rejected
        | RedemptionStatus::Expired => true,
        RedemptionStatus::Fulfilled | RedemptionStatus::Reclaimed => r.settling,
    }
}

#[near]
impl Contract {
    pub fn get_redemption(&self, id: u64) -> Option<Redemption> {
        self.redemptions.get(&id).cloned()
    }

    pub fn get_redemptions_by_user(
        &self,
        account_id: AccountId,
        from_index: u64,
        limit: u64,
    ) -> Page<Redemption> {
        self.redemption_page(self.redemptions_by_user.get(&account_id), from_index, limit)
    }

    /// The issuer queue: every request of a representation, oldest first.
    pub fn get_redemptions_by_representation(
        &self,
        representation_id: String,
        from_index: u64,
        limit: u64,
    ) -> Page<Redemption> {
        self.redemption_page(
            self.redemptions_by_rep.get(&representation_id),
            from_index,
            limit,
        )
    }

    /// Tokens in, burned, returned and held, and the sum over requests that still hold escrow;
    /// `held` and `open_amount` agree.
    pub fn get_escrow_ledger(&self, representation_id: String) -> EscrowLedger {
        let t = self
            .escrow_totals
            .get(&representation_id)
            .copied()
            .unwrap_or_default();
        let open: u128 = self
            .redemptions_by_rep
            .get(&representation_id)
            .into_iter()
            .flatten()
            .filter_map(|id| self.redemptions.get(id))
            .filter(|r| holds_escrow(r))
            .map(|r| r.amount.0)
            .sum();
        EscrowLedger {
            escrowed_in: U128(t.escrowed_in),
            burned: U128(t.burned),
            returned: U128(t.returned),
            held: U128(t.escrowed_in - t.burned - t.returned),
            open_amount: U128(open),
        }
    }

    pub fn get_issuer_reliability(&self, issuer_id: String) -> IssuerReliability {
        self.issuer_reliability
            .get(&issuer_id)
            .cloned()
            .unwrap_or_else(|| default_reliability(&issuer_id))
    }
}

impl Contract {
    fn redemption_page(
        &self,
        ids: Option<&Vec<u64>>,
        from_index: u64,
        limit: u64,
    ) -> Page<Redemption> {
        let items = ids
            .into_iter()
            .flatten()
            .skip(from_index as usize)
            .take(page_limit(limit))
            .filter_map(|id| self.redemptions.get(id).cloned())
            .collect();
        Page {
            items,
            total: ids.map_or(0, |v| v.len() as u64),
        }
    }
}
