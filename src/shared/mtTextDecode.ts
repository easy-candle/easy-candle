/**
 * Decode MetaTrader export files that may be UTF-8, UTF-16 LE/BE,
 * with or without BOM (MT5 "Unicode" saves are common).
 */
export function decodeMtTextBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return ''

  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }

  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }

  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16Be(buffer.subarray(2))
  }

  if (looksLikeUtf16Le(buffer)) {
    return buffer.toString('utf16le')
  }

  if (looksLikeUtf16Be(buffer)) {
    return decodeUtf16Be(buffer)
  }

  const utf8 = buffer.toString('utf8')
  if (!hasReplacementChars(utf8) && looksLikeMtText(utf8)) {
    return utf8
  }

  // Last resort: strip NUL padding from a mis-decoded UTF-16-as-latin1 read.
  const stripped = utf8.replace(/\u0000/g, '')
  if (stripped.length > 0 && looksLikeMtText(stripped)) {
    return stripped
  }

  return utf8
}

function decodeUtf16Be(buffer: Buffer): string {
  const len = buffer.length - (buffer.length % 2)
  const swapped = Buffer.alloc(len)
  for (let i = 0; i < len; i += 2) {
    swapped[i] = buffer[i + 1]
    swapped[i + 1] = buffer[i]
  }
  return swapped.toString('utf16le')
}

/** ASCII/Latin text in UTF-16 LE has 0x00 on odd bytes. */
function looksLikeUtf16Le(buffer: Buffer): boolean {
  const sample = Math.min(buffer.length, 400)
  if (sample < 8) return false
  let nulOdd = 0
  let pairs = 0
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1
    if (buffer[i + 1] === 0x00) nulOdd += 1
  }
  return pairs > 0 && nulOdd / pairs >= 0.7
}

/** ASCII/Latin text in UTF-16 BE has 0x00 on even bytes. */
function looksLikeUtf16Be(buffer: Buffer): boolean {
  const sample = Math.min(buffer.length, 400)
  if (sample < 8) return false
  let nulEven = 0
  let pairs = 0
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1
    if (buffer[i] === 0x00) nulEven += 1
  }
  return pairs > 0 && nulEven / pairs >= 0.7
}

function hasReplacementChars(text: string): boolean {
  return text.includes('\uFFFD')
}

function looksLikeMtText(text: string): boolean {
  const sample = text.slice(0, 800)
  if (!sample.trim()) return false
  // Typical MT bar open: 2024.01.02 or 2024-01-02, plus a time and a price-like number.
  return (
    /\d{4}[.\-/]\d{2}[.\-/]\d{2}/.test(sample) &&
    /\d{1,2}:\d{2}/.test(sample) &&
    /\d+[.,]\d+/.test(sample)
  )
}
