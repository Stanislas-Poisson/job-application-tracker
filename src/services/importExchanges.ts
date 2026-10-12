import { useRepo } from 'pinia-orm'
import { type Contact, type ContactMethod, Interaction } from '../models'
import { CHANNELS, type Channel, DIRECTIONS, type Direction, type Origin } from '../models/Interaction'
import { csvRecords } from '../utils/csv'
import { type ParsedMessage, parseEml } from '../utils/eml'
import { isInstant, zonedToUtc } from '../utils/time'
import { addInteraction } from './interactions'

// What an import understood of one exchange, before anything is saved. The user sees it, corrects it and decides.
export interface ExchangeDraft {
  channel: Channel | null
  direction: Direction | null
  subject: string | null
  body: string | null
  // In UTC, or null when the date was missing or could not be read.
  occurredAt: string | null
  // Who it was with, as the source wrote it.
  counterpart: string | null
  // Their email address, when there is one: it is what finds the contact.
  address: string | null
  contactId: string | null
  externalRef: string | null
  durationMinutes: number | null
  origin: Origin
}

export type DraftIssue = 'channel' | 'direction' | 'date' | 'content' | 'duration'

export interface ImportContext {
  // The time zone that a date without a zone is read in.
  timeZone: string
  // The addresses of the user, to tell a message that was sent from one that was received.
  ownAddresses: string[]
}

// What is missing or wrong in a draft, so that the preview can say it and the import can skip it.
export function issuesOf(draft: ExchangeDraft): DraftIssue[] {
  const issues: DraftIssue[] = []
  if (null === draft.channel) {
    issues.push('channel')
  }
  if (null === draft.direction) {
    issues.push('direction')
  }
  if (null === draft.occurredAt || !isInstant(draft.occurredAt)) {
    issues.push('date')
  }
  const hasText = (value: string | null) => null !== value && '' !== value.trim()
  if (!hasText(draft.subject) && !hasText(draft.body)) {
    issues.push('content')
  }
  if (null !== draft.durationMinutes && (!Number.isInteger(draft.durationMinutes) || 0 > draft.durationMinutes)) {
    issues.push('duration')
  }
  return issues
}

const blank = (origin: Origin): ExchangeDraft => ({
  channel: null,
  direction: null,
  subject: null,
  body: null,
  occurredAt: null,
  counterpart: null,
  address: null,
  contactId: null,
  externalRef: null,
  durationMinutes: null,
  origin,
})

const label = (name: string, address: string) => ('' === name ? address : `${name} <${address}>`)

// An email, as a draft. It is sent when it comes from one of the addresses of the user, received otherwise. The other
// person is the sender of a received message, or the first person it was sent to.
export function draftFromMessage(message: ParsedMessage, context: Pick<ImportContext, 'ownAddresses'>): ExchangeDraft {
  const own = context.ownAddresses.map((address) => address.toLowerCase())
  const sent = null !== message.from && own.includes(message.from.address)
  const other = sent ? message.to.find((candidate) => !own.includes(candidate.address)) : message.from

  return {
    ...blank('eml'),
    channel: 'email',
    // With no address of the user, the direction is not guessed: the preview asks.
    direction: 0 === own.length ? null : sent ? 'outbound' : 'inbound',
    subject: message.subject || null,
    body: message.body || null,
    occurredAt: message.date,
    counterpart: other ? label(other.name, other.address) : null,
    address: other?.address ?? null,
    externalRef: message.messageId,
  }
}

export function draftFromEml(raw: string, context: Pick<ImportContext, 'ownAddresses'>): ExchangeDraft {
  return draftFromMessage(parseEml(raw), context)
}

// Pasted text. When it begins like an email (From:, Subject:, Date:) it is read as one; otherwise it is the text itself,
// and what the user chose in the form tells the rest.
export function draftFromText(
  text: string,
  chosen: { channel: Channel; direction: Direction; occurredAt: string | null; counterpart?: string | null },
  context: Pick<ImportContext, 'ownAddresses'>
): ExchangeDraft {
  const head = text.split('\n').slice(0, 12).join('\n')
  if (/^(from|subject|date):/im.test(head) && /^from:/im.test(head)) {
    const fromEmail = draftFromEml(text, context)
    return {
      ...fromEmail,
      origin: 'paste',
      channel: chosen.channel,
      direction: fromEmail.direction ?? chosen.direction,
      occurredAt: fromEmail.occurredAt ?? chosen.occurredAt,
    }
  }
  return {
    ...blank('paste'),
    channel: chosen.channel,
    direction: chosen.direction,
    body: text.trim() || null,
    occurredAt: chosen.occurredAt,
    counterpart: chosen.counterpart ?? null,
  }
}

const DIRECTION_WORDS: Record<string, Direction> = {
  inbound: 'inbound',
  in: 'inbound',
  received: 'inbound',
  receive: 'inbound',
  incoming: 'inbound',
  outbound: 'outbound',
  out: 'outbound',
  sent: 'outbound',
  send: 'outbound',
  outgoing: 'outbound',
}

const CHANNEL_WORDS: Record<string, Channel> = {
  email: 'email',
  mail: 'email',
  'e-mail': 'email',
  linkedin: 'linkedin',
  phone: 'phone',
  call: 'phone',
  telephone: 'phone',
  sms: 'sms',
  text: 'sms',
  whatsapp: 'whatsapp',
  video: 'video',
  visio: 'video',
  meeting: 'in_person',
  in_person: 'in_person',
  inperson: 'in_person',
  other: 'other',
}

const pick = (record: Record<string, unknown>, ...names: string[]): string | null => {
  for (const name of names) {
    const value = record[name]
    if (('string' === typeof value || 'number' === typeof value) && '' !== String(value).trim()) {
      return String(value).trim()
    }
  }
  return null
}

// A date as a file gives it. With a zone (Z or +02:00) it is read as it is; without one it is a wall clock in the time
// zone of the user, which is what a person typing in a spreadsheet means.
export function readDate(text: string | null, timeZone: string): string | null {
  if (null === text) {
    return null
  }
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/.exec(text)
  if (local?.[1] && local[2]) {
    return zonedToUtc(`${local[1]}T${local[2]}`, timeZone)
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text)
  if (dateOnly) {
    return zonedToUtc(`${text}T09:00`, timeZone)
  }
  const time = Date.parse(text)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

// One record of a JSON or CSV file, as a draft. The names of the fields are the usual ones, in a few spellings.
export function draftFromRecord(record: Record<string, unknown>, context: ImportContext): ExchangeDraft {
  const channelText = pick(record, 'channel', 'type', 'canal')?.toLowerCase() ?? null
  const directionText = pick(record, 'direction', 'sens')?.toLowerCase() ?? null
  const duration = pick(record, 'durationminutes', 'durationMinutes', 'duration')
  const address = pick(record, 'contactemail', 'contactEmail', 'email', 'address')?.toLowerCase() ?? null
  const counterpart = pick(record, 'counterpart', 'with', 'name', 'contact')

  return {
    ...blank('file'),
    channel: null === channelText ? null : (CHANNEL_WORDS[channelText] ?? null),
    direction: null === directionText ? null : (DIRECTION_WORDS[directionText] ?? null),
    subject: pick(record, 'subject', 'objet', 'title'),
    body: pick(record, 'body', 'text', 'message', 'content'),
    occurredAt: readDate(pick(record, 'occurredat', 'occurredAt', 'date', 'when', 'sentat'), context.timeZone),
    counterpart: counterpart ?? address,
    address,
    externalRef: pick(record, 'externalref', 'externalRef', 'messageid', 'messageId', 'id'),
    durationMinutes: null === duration ? null : Number(duration),
  }
}

export type FileParse = { drafts: ExchangeDraft[]; error: null } | { drafts: []; error: 'json' | 'format' }

export function draftsFromJson(text: string, context: ImportContext): FileParse {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { drafts: [], error: 'json' }
  }
  const list = Array.isArray(data) ? data : (data as { exchanges?: unknown } | null)?.exchanges
  if (!Array.isArray(list)) {
    return { drafts: [], error: 'format' }
  }
  const drafts = list
    .filter((item): item is Record<string, unknown> => 'object' === typeof item && null !== item)
    .map((item) => draftFromRecord(item, context))
  return { drafts, error: null }
}

export function draftsFromCsv(text: string, context: ImportContext): FileParse {
  const records = csvRecords(text)
  return 0 === records.length
    ? { drafts: [], error: 'format' }
    : { drafts: records.map((record) => draftFromRecord(record, context)), error: null }
}

// Finds the person of each draft among the contacts: by the email address first, then by the name. A draft that has no
// match keeps the name as the source wrote it.
export function matchContacts(
  drafts: ExchangeDraft[],
  contacts: (Contact & { methods: ContactMethod[] })[]
): ExchangeDraft[] {
  const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
  return drafts.map((draft) => {
    if (null !== draft.contactId) {
      return draft
    }
    const byAddress = draft.address
      ? contacts.find((contact) =>
          contact.methods?.some((method) => 'email' === method.type && method.value === draft.address)
        )
      : undefined
    const wanted = normalized((draft.counterpart ?? '').replace(/<[^>]*>/g, ''))
    const byName =
      '' === wanted
        ? undefined
        : contacts.find((contact) => normalized(`${contact.firstName} ${contact.lastName}`) === wanted)
    const match = byAddress ?? byName
    return match ? { ...draft, contactId: match.id } : draft
  })
}

export interface ImportResult {
  added: number
  // Already kept: the same external reference for the same application.
  duplicates: number
  // Drafts with something wrong in them.
  skipped: number
}

// Saves the drafts that have nothing wrong in them, to an application.
export function importDrafts(drafts: ExchangeDraft[], applicationId: string | null): ImportResult {
  const result: ImportResult = { added: 0, duplicates: 0, skipped: 0 }
  for (const draft of drafts) {
    if (0 < issuesOf(draft).length) {
      result.skipped += 1
      continue
    }
    const known =
      null !== draft.externalRef &&
      null !==
        useRepo(Interaction).where('externalRef', draft.externalRef).where('applicationId', applicationId).first()
    addInteraction({
      applicationId,
      contactId: draft.contactId,
      counterpart: draft.counterpart,
      channel: draft.channel as Channel,
      direction: draft.direction as Direction,
      subject: draft.subject,
      body: draft.body,
      occurredAt: draft.occurredAt as string,
      durationMinutes: draft.durationMinutes,
      externalRef: draft.externalRef,
      origin: draft.origin,
    })
    if (known) {
      result.duplicates += 1
    } else {
      result.added += 1
    }
  }
  return result
}

export { CHANNELS, DIRECTIONS }
