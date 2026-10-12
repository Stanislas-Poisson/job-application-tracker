// A reader for email files (.eml, RFC 5322 with MIME), for what the extension needs: who wrote to whom, when, about what,
// and the text. It reads the headers (folded lines, encoded words), the quoted-printable and base64 bodies in their
// character set, and the multipart messages (the plain text is taken, the HTML is turned into text when there is none).
// Attachments are ignored.

export interface Address {
  name: string
  address: string
}

export interface ParsedMessage {
  from: Address | null
  to: Address[]
  cc: Address[]
  subject: string
  // A moment in UTC, or null when the message has no date or an unreadable one.
  date: string | null
  messageId: string | null
  body: string
}

const decoderFor = (charset: string | undefined): TextDecoder => {
  try {
    return new TextDecoder((charset ?? 'utf-8').trim().toLowerCase() || 'utf-8')
  } catch {
    return new TextDecoder('utf-8')
  }
}

const decode = (bytes: Uint8Array, charset?: string): string => decoderFor(charset).decode(bytes)

function bytesFromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/[^A-Za-z0-9+/=]/g, ''))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// Quoted-printable: =XX is a byte, a line that ends with = continues on the next one.
function bytesFromQuotedPrintable(text: string): Uint8Array {
  const source = text.replace(/=\n/g, '')
  const bytes: number[] = []
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? ''
    const hex = /^=([0-9A-Fa-f]{2})/.exec(source.slice(index, index + 3))
    if ('=' === char && hex?.[1]) {
      bytes.push(Number.parseInt(hex[1], 16))
      index += 2
    } else {
      bytes.push(...new TextEncoder().encode(char))
    }
  }
  return Uint8Array.from(bytes)
}

// "=?UTF-8?B?...?=" and "=?ISO-8859-1?Q?...?=" in a header. Words that follow each other are joined.
function decodeWords(value: string): string {
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, text: string) => {
      try {
        const bytes =
          'b' === encoding.toLowerCase()
            ? bytesFromBase64(text)
            : bytesFromQuotedPrintable(text.replace(/_/g, ' ').replace(/\n/g, ''))
        return decode(bytes, charset)
      } catch {
        return text
      }
    })
}

function splitHeadersAndBody(raw: string): { headers: Record<string, string>; body: string } {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\u{FEFF}/u, '')
  const cut = text.startsWith('\n') ? 0 : text.indexOf('\n\n')
  const head = 0 > cut ? text : text.slice(0, cut)
  const body = 0 > cut ? '' : text.slice(cut + 2)

  const headers: Record<string, string> = {}
  // A line that starts with a space or a tab continues the one before.
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const colon = line.indexOf(':')
    if (0 < colon) {
      const name = line.slice(0, colon).trim().toLowerCase()
      headers[name] ??= line.slice(colon + 1).trim()
    }
  }
  return { headers, body }
}

interface ContentType {
  type: string
  params: Record<string, string>
}

function parseContentType(value: string | undefined): ContentType {
  const [type = 'text/plain', ...rest] = (value ?? 'text/plain').split(';')
  const params: Record<string, string> = {}
  for (const part of rest) {
    const match = /^\s*([\w-]+)\s*=\s*"?([^"]*)"?\s*$/.exec(part)
    if (match?.[1]) {
      params[match[1].toLowerCase()] = match[2] ?? ''
    }
  }
  return { type: type.trim().toLowerCase(), params }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const code = 'x' === entity[1]?.toLowerCase() ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      return ENTITIES[entity.toLowerCase()] ?? match
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Part {
  plain: string | null
  html: string | null
}

// The text of a part, decoded from its transfer encoding and its character set.
function partText(headers: Record<string, string>, body: string, charset: string | undefined): string {
  const encoding = (headers['content-transfer-encoding'] ?? '').trim().toLowerCase()
  try {
    if ('base64' === encoding) {
      return decode(bytesFromBase64(body), charset)
    }
    if ('quoted-printable' === encoding) {
      return decode(bytesFromQuotedPrintable(body), charset)
    }
  } catch {
    return body
  }
  return body
}

function collect(headers: Record<string, string>, body: string): Part {
  const contentType = parseContentType(headers['content-type'])
  if (/attachment/i.test(headers['content-disposition'] ?? '')) {
    return { plain: null, html: null }
  }

  if (contentType.type.startsWith('multipart/') && contentType.params.boundary) {
    const boundary = contentType.params.boundary
    const pieces = body.split(new RegExp(`^--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*$`, 'm'))
    const result: Part = { plain: null, html: null }
    // The first piece is the preamble, the last the epilogue.
    for (const piece of pieces.slice(1)) {
      const parsed = splitHeadersAndBody(piece.replace(/^\n/, ''))
      const inner = collect(parsed.headers, parsed.body)
      result.plain ??= inner.plain
      result.html ??= inner.html
    }
    return result
  }

  const text = partText(headers, body, contentType.params.charset)
  if ('text/html' === contentType.type) {
    return { plain: null, html: text }
  }
  return 'text/plain' === contentType.type ? { plain: text, html: null } : { plain: null, html: null }
}

// "Ada Lovelace <ada@example.com>, bob@example.com" into addresses. Commas inside quotes or angle brackets do not split.
export function parseAddresses(value: string | undefined): Address[] {
  if (!value) {
    return []
  }
  const parts: string[] = []
  let current = ''
  let quoted = false
  let angled = false
  for (const char of decodeWords(value)) {
    if ('"' === char) {
      quoted = !quoted
    } else if (!quoted && '<' === char) {
      angled = true
    } else if (!quoted && '>' === char) {
      angled = false
    }
    if (',' === char && !quoted && !angled) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)

  const addresses: Address[] = []
  for (const part of parts) {
    const angle = /^(.*)<([^>]+)>\s*$/.exec(part.trim())
    if (angle?.[2]) {
      addresses.push({
        name: (angle[1] ?? '').trim().replace(/^"|"$/g, '').trim(),
        address: angle[2].trim().toLowerCase(),
      })
    } else if (part.includes('@')) {
      addresses.push({ name: '', address: part.trim().replace(/[<>]/g, '').toLowerCase() })
    }
  }
  return addresses
}

// The date of a message as a moment in UTC. Comments such as "(CEST)" are ignored. Null when it cannot be read.
export function parseMessageDate(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const time = Date.parse(value.replace(/\([^)]*\)/g, '').trim())
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

export function parseEml(raw: string): ParsedMessage {
  const { headers, body } = splitHeadersAndBody(raw)
  const content = collect(headers, body)
  const text = (content.plain ?? (content.html ? htmlToText(content.html) : '')).replace(/\r\n?/g, '\n').trim()
  const messageId = /<([^>]+)>/.exec(headers['message-id'] ?? '')?.[1]

  return {
    from: parseAddresses(headers.from)[0] ?? null,
    to: parseAddresses(headers.to),
    cc: parseAddresses(headers.cc),
    subject: decodeWords(headers.subject ?? '').trim(),
    date: parseMessageDate(headers.date),
    messageId: messageId ? `<${messageId}>` : null,
    body: text,
  }
}
