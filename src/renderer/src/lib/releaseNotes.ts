const HTML_TAG_RE =
  /<\/?(?:h[1-6]|p|div|ul|ol|li|br|hr|strong|em|b|i|a|code|pre|blockquote|span|table|thead|tbody|tr|th|td|details|summary)\b/i

const STRIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'IMG',
  'VIDEO',
  'AUDIO',
  'SVG',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT'
])

const ALLOWED_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BR',
  'HR',
  'UL',
  'OL',
  'LI',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'DEL',
  'INS',
  'CODE',
  'PRE',
  'BLOCKQUOTE',
  'A',
  'SPAN',
  'DIV',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'DETAILS',
  'SUMMARY'
])

export function looksLikeHtml(text: string): boolean {
  return HTML_TAG_RE.test(text)
}

function sanitizeHref(raw: string | null): string | null {
  if (!raw) return null
  const href = raw.trim()
  if (!/^https?:\/\//i.test(href)) return null
  try {
    const url = new URL(href)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch {
    return null
  }
  return null
}

function applyAllowedAttributes(el: Element): void {
  const tag = el.tagName
  const href = tag === 'A' ? sanitizeHref(el.getAttribute('href')) : null
  for (const attr of Array.from(el.attributes)) {
    el.removeAttribute(attr.name)
  }
  if (tag !== 'A') return

  if (!href) {
    el.replaceWith(...Array.from(el.childNodes))
    return
  }
  el.setAttribute('href', href)
  el.setAttribute('target', '_blank')
  el.setAttribute('rel', 'noopener noreferrer')
}

function sanitizeElement(el: Element): void {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node)
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const child = node as Element
    const tag = child.tagName
    if (STRIP_TAGS.has(tag)) {
      child.remove()
      continue
    }

    sanitizeElement(child)

    if (!ALLOWED_TAGS.has(tag)) {
      child.replaceWith(...Array.from(child.childNodes))
      continue
    }

    applyAllowedAttributes(child)
  }
}

export function sanitizeReleaseNotesHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  sanitizeElement(doc.body)
  return doc.body.innerHTML.trim()
}

export type ParsedReleaseNotes =
  | { kind: 'html'; html: string }
  | { kind: 'text'; text: string }

export function parseReleaseNotes(notes: string): ParsedReleaseNotes {
  const trimmed = notes.trim()
  if (!looksLikeHtml(trimmed)) {
    return { kind: 'text', text: trimmed }
  }
  const html = sanitizeReleaseNotesHtml(trimmed)
  if (!html) {
    return { kind: 'text', text: trimmed }
  }
  return { kind: 'html', html }
}
