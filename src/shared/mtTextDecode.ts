/**
 * Decode MetaTrader export files that may be UTF-8, UTF-16 LE/BE,
 * with or without BOM (MT5 "Unicode" saves are common).
 *
 * Works on `Uint8Array` so CSV workers can decode without Node's `Buffer`.
 */
export function decodeMtTextBytes(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return ''

  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeUtf8(bytes.subarray(3))
  }

  // UTF-16 LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeUtf16Le(bytes.subarray(2))
  }

  // UTF-16 BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.subarray(2))
  }

  if (looksLikeUtf16Le(bytes)) {
    return decodeUtf16Le(bytes)
  }

  if (looksLikeUtf16Be(bytes)) {
    return decodeUtf16Be(bytes)
  }

  const utf8 = decodeUtf8(bytes)
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

export function decodeMtTextBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return ''
  return decodeMtTextBytes(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength))
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function decodeUtf16Le(bytes: Uint8Array): string {
  return new TextDecoder('utf-16le').decode(alignUtf16(bytes))
}

function decodeUtf16Be(bytes: Uint8Array): string {
  return new TextDecoder('utf-16be').decode(alignUtf16(bytes))
}

function alignUtf16(bytes: Uint8Array): Uint8Array {
  return bytes.length % 2 === 0 ? bytes : bytes.subarray(0, bytes.length - 1)
}

/** ASCII/Latin text in UTF-16 LE has 0x00 on odd bytes. */
function looksLikeUtf16Le(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length, 400)
  if (sample < 8) return false
  let nulOdd = 0
  let pairs = 0
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1
    if (bytes[i + 1] === 0x00) nulOdd += 1
  }
  return pairs > 0 && nulOdd / pairs >= 0.7
}

/** ASCII/Latin text in UTF-16 BE has 0x00 on even bytes. */
function looksLikeUtf16Be(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length, 400)
  if (sample < 8) return false
  let nulEven = 0
  let pairs = 0
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1
    if (bytes[i] === 0x00) nulEven += 1
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
