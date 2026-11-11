//! Lowercase hex for 32-byte hashes (reserve reports, redemption terms and payout instructions).

pub(crate) fn encode(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 15) as usize] as char);
    }
    out
}

/// Decodes exactly 64 lowercase hex characters; anything else is `None`.
pub(crate) fn decode32(text: &str) -> Option<[u8; 32]> {
    if text.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, pair) in text.as_bytes().chunks(2).enumerate() {
        out[i] = nibble(pair[0])? << 4 | nibble(pair[1])?;
    }
    Some(out)
}

fn nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_refuses_bad_input() {
        let bytes: Vec<u8> = (0..32).map(|i| (i * 8 + 3) as u8).collect();
        let text = encode(&bytes);
        assert_eq!(text.len(), 64);
        assert_eq!(decode32(&text).unwrap().to_vec(), bytes);
        assert!(decode32(&text.to_uppercase()).is_none());
        assert!(decode32(&text[..62]).is_none());
        assert!(decode32(&format!("{}g", &text[..63])).is_none());
    }
}
