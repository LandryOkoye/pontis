//! Lowercase hex for 32-byte hashes (reserve reports, redemption terms and payout instructions).

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
    fn decodes_exactly_64_lowercase_hex_characters() {
        let text = "00ff".repeat(16);
        let bytes = decode32(&text).unwrap();
        assert_eq!(bytes[..4], [0, 255, 0, 255]);
        assert!(decode32(&text.to_uppercase()).is_none());
        assert!(decode32(&text[..62]).is_none());
        assert!(decode32(&format!("{}g", &text[..63])).is_none());
    }
}
