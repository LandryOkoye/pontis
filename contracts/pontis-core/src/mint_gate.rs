//! Mint gating (ADR 0020 section 6). The core is the only account that can create supply of a
//! gated token (the token's `minter`), and it reserves the amount in `pending_mint` before the
//! token call, so headroom is exact under concurrency. The caller is a test account listed in
//! the representation's issuer `controlled_accounts` (an unproven registrar claim, ADR 0019).

use crate::custody_events::CustodyEvent;
use crate::custody_types::*;
use crate::mint_types::*;
use crate::token_calls::{ext_token, GAS_TOKEN_CALL, GAS_TOKEN_CALLBACK};
use crate::types::{check, Status};
use crate::{now_ms, Contract, ContractExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, NearToken, PromiseError, PromiseOrValue};

pub const MAX_REFERENCE_LEN: usize = 64;

#[near]
impl Contract {
    /// Issuer account only. Records the intent; nothing is minted yet. Returns the request id.
    #[payable]
    pub fn request_mint(
        &mut self,
        representation_id: String,
        recipient: AccountId,
        amount: U128,
        reference: String,
    ) -> u64 {
        let caller = self.assert_issuer_account(&representation_id);
        check(amount.0 > 0, "amount must be positive");
        check(
            reference.len() <= MAX_REFERENCE_LEN,
            "reference is at most 64 bytes",
        );
        let id = self.mint_seq + 1;
        self.mint_seq = id;
        let now = now_ms();
        self.mint_requests.insert(
            id,
            MintRequest {
                id,
                representation_id: representation_id.clone(),
                recipient: recipient.clone(),
                amount,
                reference: reference.clone(),
                status: MintStatus::Requested,
                requested_by: caller.clone(),
                requested_ms: now,
                resolved_ms: None,
                failure: None,
            },
        );
        let mut ids = self
            .mint_by_rep
            .get(&representation_id)
            .cloned()
            .unwrap_or_default();
        ids.push(id);
        self.mint_by_rep.insert(representation_id.clone(), ids);
        CustodyEvent::MintRequested {
            id,
            representation_id,
            recipient,
            amount,
            reference,
            requested_by: caller,
            timestamp_ms: now,
        }
        .emit();
        id
    }

    /// Issuer account only. Mints through the token's `minter_mint` if the amount is within the
    /// attested headroom; otherwise it panics and nothing changes.
    #[payable]
    pub fn execute_mint(&mut self, request_id: u64) -> PromiseOrValue<()> {
        let mut request = self.get_mint_request_or_panic(request_id);
        self.assert_issuer_account(&request.representation_id);
        check(
            request.status == MintStatus::Requested,
            "request is not open",
        );
        let rep_id = request.representation_id.clone();
        let rep = self
            .representations
            .get(&rep_id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        check(rep.status == Status::Active, "representation is not active");
        let token = rep.account_id.clone();
        check(
            self.reserve_policies.contains_key(&rep_id),
            "no reserve policy for this representation",
        );
        let status = self.compute_reserve_status(&rep_id, now_ms());
        check(!status.mint_paused, "mint is paused by the reserve action");
        check(
            request.amount.0 <= status.headroom_units.0,
            "exceeds reserve headroom",
        );
        self.assert_supply_room(&rep_id, request.amount.0);
        let pending = self.pending_mint.get(&rep_id).copied().unwrap_or(0);
        self.pending_mint.insert(rep_id, pending + request.amount.0);
        request.status = MintStatus::Minting;
        self.mint_requests.insert(request_id, request.clone());
        ext_token::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_TOKEN_CALL)
            .minter_mint(request.recipient, request.amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_TOKEN_CALLBACK)
                    .on_mint_resolved(request_id),
            )
            .into()
    }

    /// Callback of `execute_mint`, run once per request.
    #[private]
    pub fn on_mint_resolved(
        &mut self,
        request_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let mut request = self.get_mint_request_or_panic(request_id);
        check(
            request.status == MintStatus::Minting,
            "request is not minting",
        );
        let rep_id = request.representation_id.clone();
        let pending = self.pending_mint.get(&rep_id).copied().unwrap_or(0);
        self.pending_mint
            .insert(rep_id.clone(), pending.saturating_sub(request.amount.0));
        let now = now_ms();
        request.resolved_ms = Some(now);
        if result.is_ok() {
            let ledger = self.supply_ledger.get(&rep_id).copied().unwrap_or(0);
            self.supply_ledger
                .insert(rep_id.clone(), ledger.saturating_add(request.amount.0));
            request.status = MintStatus::Minted;
            let status = self.compute_reserve_status(&rep_id, now);
            CustodyEvent::MintCompleted {
                id: request_id,
                representation_id: rep_id.clone(),
                recipient: request.recipient.clone(),
                amount: request.amount,
                circulating_units: status.circulating_units,
                headroom_units: status.headroom_units,
                timestamp_ms: now,
            }
            .emit();
        } else {
            request.status = MintStatus::Failed;
            request.failure = Some("token mint failed".to_string());
            CustodyEvent::MintFailed {
                id: request_id,
                representation_id: rep_id.clone(),
                reason: "token mint failed".to_string(),
                timestamp_ms: now,
            }
            .emit();
        }
        self.mint_requests.insert(request_id, request);
        self.refresh_reserve_state(&rep_id);
    }

    /// The requester or any issuer account of the representation, while the request is open.
    #[payable]
    pub fn cancel_mint_request(&mut self, request_id: u64) {
        let mut request = self.get_mint_request_or_panic(request_id);
        let caller = self.assert_issuer_account(&request.representation_id);
        check(
            request.status == MintStatus::Requested,
            "request is not open",
        );
        request.status = MintStatus::Cancelled;
        request.resolved_ms = Some(now_ms());
        self.mint_requests.insert(request_id, request);
        CustodyEvent::MintCancelled {
            id: request_id,
            by: caller,
            timestamp_ms: now_ms(),
        }
        .emit();
    }

    pub fn get_mint_request(&self, id: u64) -> Option<MintRequest> {
        self.mint_requests.get(&id).cloned()
    }

    pub fn get_mint_requests(
        &self,
        representation_id: String,
        from_index: u64,
        limit: u64,
    ) -> Page<MintRequest> {
        let ids = self.mint_by_rep.get(&representation_id);
        let total = ids.map_or(0, |v| v.len() as u64);
        let items = ids
            .into_iter()
            .flatten()
            .skip(from_index as usize)
            .take(page_limit(limit))
            .filter_map(|id| self.mint_requests.get(id).cloned())
            .collect();
        Page { items, total }
    }

    pub fn get_mint_headroom(&self, representation_id: String) -> MintHeadroom {
        let s = self.compute_reserve_status(&representation_id, now_ms());
        MintHeadroom {
            headroom_units: s.headroom_units,
            circulating_units: s.circulating_units,
            attested_units: s.attested_units,
            state: s.state,
            mint_paused: s.mint_paused,
        }
    }
}

impl Contract {
    fn get_mint_request_or_panic(&self, id: u64) -> MintRequest {
        self.mint_requests
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("mint request not found"))
    }

    /// Requires 1 yocto, no global pause and a caller listed in the `controlled_accounts` of the
    /// active issuer of the representation. Returns the caller.
    pub(crate) fn assert_issuer_account(&self, representation_id: &str) -> AccountId {
        near_sdk::assert_one_yocto();
        self.assert_not_paused();
        let caller = env::predecessor_account_id();
        let rep = self
            .representations
            .get(representation_id)
            .unwrap_or_else(|| env::panic_str("representation not found"));
        let issuer = self
            .issuers
            .get(&rep.issuer_id)
            .unwrap_or_else(|| env::panic_str("issuer not found"));
        check(issuer.status == Status::Active, "issuer is not active");
        check(
            issuer.controlled_accounts.contains(&caller),
            "caller is not an account of the representation's issuer",
        );
        caller
    }
}
