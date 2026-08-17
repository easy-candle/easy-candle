/// Decode MetaTrader export files that may be UTF-8, UTF-16 LE/BE,
/// with or without BOM (MT5 "Unicode" saves are common).
pub fn decode_mt_text_buffer(buffer: &[u8]) -> String {
    if buffer.is_empty() {
        return String::new();
    }

    // UTF-8 BOM
    if buffer.len() >= 3 && buffer[0] == 0xEF && buffer[1] == 0xBB && buffer[2] == 0xBF {
        return String::from_utf8_lossy(&buffer[3..]).into_owned();
    }

    // UTF-16 LE BOM
    if buffer.len() >= 2 && buffer[0] == 0xFF && buffer[1] == 0xFE {
        return decode_utf16_le(&buffer[2..]);
    }

    // UTF-16 BE BOM
    if buffer.len() >= 2 && buffer[0] == 0xFE && buffer[1] == 0xFF {
        return decode_utf16_be(&buffer[2..]);
    }

    if looks_like_utf16_le(buffer) {
        return decode_utf16_le(buffer);
    }

    if looks_like_utf16_be(buffer) {
        return decode_utf16_be(buffer);
    }

    let utf8 = String::from_utf8_lossy(buffer).into_owned();
    if !has_replacement_chars(&utf8) && looks_like_mt_text(&utf8) {
        return utf8;
    }

    // Last resort: strip NUL padding from a mis-decoded UTF-16-as-latin1 read.
    let stripped = utf8.replace('\0', "");
    if !stripped.is_empty() && looks_like_mt_text(&stripped) {
        return stripped;
    }

    utf8
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

fn decode_utf16_be(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_be_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

/// ASCII/Latin text in UTF-16 LE has 0x00 on odd bytes.
fn looks_like_utf16_le(bytes: &[u8]) -> bool {
    let sample = bytes.len().min(400);
    if sample < 8 {
        return false;
    }
    let mut nul_odd = 0usize;
    let mut pairs = 0usize;
    let mut i = 0;
    while i + 1 < sample {
        pairs += 1;
        if bytes[i + 1] == 0x00 {
            nul_odd += 1;
        }
        i += 2;
    }
    pairs > 0 && (nul_odd as f64 / pairs as f64) >= 0.7
}

/// ASCII/Latin text in UTF-16 BE has 0x00 on even bytes.
fn looks_like_utf16_be(bytes: &[u8]) -> bool {
    let sample = bytes.len().min(400);
    if sample < 8 {
        return false;
    }
    let mut nul_even = 0usize;
    let mut pairs = 0usize;
    let mut i = 0;
    while i + 1 < sample {
        pairs += 1;
        if bytes[i] == 0x00 {
            nul_even += 1;
        }
        i += 2;
    }
    pairs > 0 && (nul_even as f64 / pairs as f64) >= 0.7
}

fn has_replacement_chars(text: &str) -> bool {
    text.contains('\u{FFFD}')
}

fn has_date_pattern(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() < 10 {
        return false;
    }
    for i in 0..=bytes.len() - 10 {
        if bytes[i].is_ascii_digit()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && matches!(bytes[i + 4], b'.' | b'-' | b'/')
            && bytes[i + 5].is_ascii_digit()
            && bytes[i + 6].is_ascii_digit()
            && matches!(bytes[i + 7], b'.' | b'-' | b'/')
            && bytes[i + 8].is_ascii_digit()
            && bytes[i + 9].is_ascii_digit()
        {
            return true;
        }
    }
    false
}

fn has_time_pattern(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() < 4 {
        return false;
    }
    for i in 0..=bytes.len() - 4 {
        let two_digit = bytes[i].is_ascii_digit()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2] == b':'
            && bytes[i + 3].is_ascii_digit()
            && i + 4 < bytes.len()
            && bytes[i + 4].is_ascii_digit();
        let one_digit = bytes[i].is_ascii_digit()
            && bytes[i + 1] == b':'
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit();
        if two_digit || one_digit {
            return true;
        }
    }
    false
}

fn has_price_pattern(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let mut j = i;
            while j < bytes.len() && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j < bytes.len()
                && (bytes[j] == b'.' || bytes[j] == b',')
                && j + 1 < bytes.len()
                && bytes[j + 1].is_ascii_digit()
            {
                return true;
            }
            i = j;
        } else {
            i += 1;
        }
    }
    false
}

/// Typical MT bar open: 2024.01.02 or 2024-01-02, plus a time and a price-like number.
fn looks_like_mt_text(text: &str) -> bool {
    let sample: String = text.chars().take(800).collect();
    if sample.trim().is_empty() {
        return false;
    }
    has_date_pattern(&sample) && has_time_pattern(&sample) && has_price_pattern(&sample)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ascii() -> Vec<u8> {
        b"2024.01.02 00:00,50000.0,51000.0,49900.0,50500.0,12\n2024.01.02 00:01,50500.0,50600.0,50400.0,50450.0,9\n".to_vec()
    }

    #[test]
    fn decodes_utf8_without_bom() {
        let text = decode_mt_text_buffer(&ascii());
        assert!(text.starts_with("2024.01.02 00:00"));
    }

    #[test]
    fn decodes_utf8_bom() {
        let mut buf = vec![0xEF, 0xBB, 0xBF];
        buf.extend(ascii());
        let text = decode_mt_text_buffer(&buf);
        assert!(text.starts_with("2024.01.02 00:00"));
    }

    #[test]
    fn decodes_utf16le_bom() {
        let mut units: Vec<u16> = ascii().iter().map(|b| *b as u16).collect();
        let mut bytes: Vec<u8> = vec![0xFF, 0xFE];
        for u in units.iter_mut() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let text = decode_mt_text_buffer(&bytes);
        assert!(text.starts_with("2024.01.02 00:00"));
    }

    #[test]
    fn decodes_utf16be() {
        let mut units: Vec<u16> = ascii().iter().map(|b| *b as u16).collect();
        let mut bytes: Vec<u8> = vec![0xFE, 0xFF];
        for u in units.iter_mut() {
            bytes.extend_from_slice(&u.to_be_bytes());
        }
        let text = decode_mt_text_buffer(&bytes);
        assert!(text.starts_with("2024.01.02 00:00"));
    }

    #[test]
    fn strips_nul_padding() {
        let text = decode_mt_text_buffer(&ascii());
        assert!(!text.contains('\0'));
    }
}
