//! Signed quotes (ADR 0006). The backend signs `b"pontis-quote-v1" ++ borsh(QuotePayload)` with
//! the quote-signer ed25519 key. The user passes the quote fields and the signature as JSON in
//! `ft_transfer_call.msg`; the contract rebuilds the Borsh bytes from the JSON fields, so the
//! TypeScript signer and this verifier share one byte layout, pinned by
//! `test-vectors/quote-signing.json`.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{borsh, near, AccountId};

pub const QUOTE_DOMAIN: &[u8] = b"pontis-quote-v1";
pub const QUOTE_VERSION: u8 = 1;

/// A quote as it appears in `msg`. `nonce` is 32 lowercase hex characters (16 bytes) and doubles
/// as the on-chain operation ID.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct QuoteInput {
    pub version: u8,
    pub contract: AccountId,
    pub user: AccountId,
    pub token_in: AccountId,
    pub token_out: AccountId,
    pub amount_in: U128,
    pub amount_out_gross: U128,
    pub fee: U128,
    pub amount_out: U128,
    pub fee_bps: u16,
    pub expires_at_ms: u64,
    pub nonce: String,
    pub compatibility_version: u64,
    pub policy_version: u64,
}

/// The `ft_transfer_call` message of a conversion.
#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct ConversionMsg {
    pub quote: QuoteInput,
    /// 64-byte ed25519 signature, standard base64.
    pub signature: Base64VecU8,
}

/// Field order is the signed layout. Never reorder.
#[near(serializers = [borsh])]
struct QuotePayload {
    version: u8,
    contract: AccountId,
    user: AccountId,
    token_in: AccountId,
    token_out: AccountId,
    amount_in: u128,
    amount_out_gross: u128,
    fee: u128,
    amount_out: u128,
    fee_bps: u16,
    expires_at_ms: u64,
    nonce: [u8; 16],
    compatibility_version: u64,
    policy_version: u64,
}

/// Decodes the 32-hex-character nonce.
pub fn parse_nonce(hex: &str) -> Option<[u8; 16]> {
    let bytes = hex.as_bytes();
    if bytes.len() != 32 {
        return None;
    }
    let nibble = |b: u8| match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    };
    let mut out = [0u8; 16];
    for (i, pair) in bytes.chunks(2).enumerate() {
        out[i] = nibble(pair[0])? << 4 | nibble(pair[1])?;
    }
    Some(out)
}

impl QuoteInput {
    /// The exact bytes the backend signs.
    pub fn signing_message(&self) -> Option<Vec<u8>> {
        let payload = QuotePayload {
            version: self.version,
            contract: self.contract.clone(),
            user: self.user.clone(),
            token_in: self.token_in.clone(),
            token_out: self.token_out.clone(),
            amount_in: self.amount_in.0,
            amount_out_gross: self.amount_out_gross.0,
            fee: self.fee.0,
            amount_out: self.amount_out.0,
            fee_bps: self.fee_bps,
            expires_at_ms: self.expires_at_ms,
            nonce: parse_nonce(&self.nonce)?,
            compatibility_version: self.compatibility_version,
            policy_version: self.policy_version,
        };
        let mut message = QUOTE_DOMAIN.to_vec();
        message.extend(borsh::to_vec(&payload).ok()?);
        Some(message)
    }
}
