import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Contact, Interaction } from '../../src/models'
import { addContact, captureOffer } from '../../src/services/applications'
import {
  type ExchangeDraft,
  type ImportContext,
  draftFromEml,
  draftFromRecord,
  draftFromText,
  draftsFromCsv,
  draftsFromJson,
  importDrafts,
  issuesOf,
  matchContacts,
  readDate,
} from '../../src/services/importExchanges'
import { normalizeEmails } from '../../src/settings'
import { freshStore } from './helpers'

const context: ImportContext = { timeZone: 'Europe/Paris', ownAddresses: ['me@example.com'] }

const EML = [
  'From: Ada Lovelace <ada@example.com>',
  'To: Me <me@example.com>',
  'Subject: Interview on Monday',
  'Date: Mon, 12 Oct 2026 16:30:00 +0200',
  'Message-ID: <m1@example.com>',
  '',
  'Are you free at 10?',
].join('\n')

describe('an email', () => {
  it('is a received email when it comes from someone else', () => {
    expect(draftFromEml(EML, context)).toMatchObject({
      channel: 'email',
      direction: 'inbound',
      subject: 'Interview on Monday',
      body: 'Are you free at 10?',
      occurredAt: '2026-10-12T14:30:00.000Z',
      counterpart: 'Ada Lovelace <ada@example.com>',
      address: 'ada@example.com',
      externalRef: '<m1@example.com>',
      origin: 'eml',
    })
  })

  it('is a sent email when it comes from an address of the user, and the other person is who it was sent to', () => {
    const sent = EML.replace('From: Ada Lovelace <ada@example.com>', 'From: Me <ME@example.com>').replace(
      'To: Me <me@example.com>',
      'To: Ada <ada@example.com>'
    )

    expect(draftFromEml(sent, context)).toMatchObject({ direction: 'outbound', address: 'ada@example.com' })
  })

  it('does not guess the direction when the user gave no address', () => {
    expect(draftFromEml(EML, { ownAddresses: [] }).direction).toBeNull()
  })
})

describe('pasted text', () => {
  const chosen = { channel: 'linkedin', direction: 'inbound', occurredAt: '2026-10-12T14:30:00.000Z' } as const

  it('is the text itself, with what the user chose', () => {
    expect(draftFromText('Hello, are you available?', { ...chosen, counterpart: 'Ada' }, context)).toMatchObject({
      channel: 'linkedin',
      direction: 'inbound',
      body: 'Hello, are you available?',
      occurredAt: '2026-10-12T14:30:00.000Z',
      counterpart: 'Ada',
      origin: 'paste',
    })
  })

  it('is read as an email when it begins like one, and the email gives the date and the subject', () => {
    const draft = draftFromText(EML, { ...chosen, channel: 'email', occurredAt: null }, context)

    expect(draft).toMatchObject({
      subject: 'Interview on Monday',
      occurredAt: '2026-10-12T14:30:00.000Z',
      origin: 'paste',
      channel: 'email',
    })
  })

  it('has no text when nothing was pasted', () => {
    expect(issuesOf(draftFromText('   ', chosen, context))).toContain('content')
  })
})

describe('what a file says', () => {
  it('reads a date as it is when it has a zone, and in the time zone of the user when it has none', () => {
    expect(readDate('2026-10-12T14:30:00Z', 'Europe/Paris')).toBe('2026-10-12T14:30:00.000Z')
    expect(readDate('2026-10-12T16:30:00+02:00', 'America/New_York')).toBe('2026-10-12T14:30:00.000Z')
    expect(readDate('2026-10-12 16:30', 'Europe/Paris')).toBe('2026-10-12T14:30:00.000Z')
    expect(readDate('2026-10-12', 'Europe/Paris')).toBe('2026-10-12T07:00:00.000Z')
    expect(readDate('next week', 'Europe/Paris')).toBeNull()
    expect(readDate(null, 'Europe/Paris')).toBeNull()
  })

  it('reads a record with the usual names, in a few spellings', () => {
    const draft = draftFromRecord(
      {
        type: 'Call',
        sens: 'Sent',
        when: '2026-10-12 09:00',
        objet: 'Screening',
        duration: '25',
        email: 'Ada@Example.com',
      },
      context
    )

    expect(draft).toMatchObject({
      channel: 'phone',
      direction: 'outbound',
      subject: 'Screening',
      occurredAt: '2026-10-12T07:00:00.000Z',
      durationMinutes: 25,
      address: 'ada@example.com',
      counterpart: 'ada@example.com',
      origin: 'file',
    })
  })

  it('says what is missing in a draft', () => {
    expect(issuesOf(draftFromRecord({ subject: 'x' }, context)).sort()).toEqual(['channel', 'date', 'direction'])
    expect(
      issuesOf(draftFromRecord({ channel: 'email', direction: 'in', date: '2026-10-12T10:00:00Z' }, context))
    ).toEqual(['content'])
    expect(
      issuesOf(
        draftFromRecord(
          { channel: 'email', direction: 'in', date: '2026-10-12T10:00:00Z', subject: 'x', duration: 'abc' },
          context
        )
      )
    ).toEqual(['duration'])
  })

  it('reads a JSON list, or an object with a list of exchanges', () => {
    const record = { channel: 'email', direction: 'received', date: '2026-10-12T10:00:00Z', subject: 'Hi' }

    expect(draftsFromJson(JSON.stringify([record, record]), context).drafts).toHaveLength(2)
    expect(draftsFromJson(JSON.stringify({ exchanges: [record] }), context).drafts).toHaveLength(1)
  })

  it('says when a JSON file is not JSON or has no list', () => {
    expect(draftsFromJson('{oops', context)).toEqual({ drafts: [], error: 'json' })
    expect(draftsFromJson('{"a":1}', context)).toEqual({ drafts: [], error: 'format' })
  })

  it('reads a CSV file, with a semicolon too', () => {
    const csv =
      'channel;direction;date;subject;text\nemail;received;2026-10-12 10:00;"Hi, there";"Line 1\nLine 2"\nsms;sent;2026-10-12 11:00;;Ok'
    const { drafts } = draftsFromCsv(csv, context)

    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({ channel: 'email', subject: 'Hi, there', body: 'Line 1\nLine 2' })
    expect(drafts[1]).toMatchObject({ channel: 'sms', direction: 'outbound', subject: null, body: 'Ok' })
    expect(draftsFromCsv('', context)).toEqual({ drafts: [], error: 'format' })
  })
})

describe('the contacts of the drafts', () => {
  beforeEach(() => {
    freshStore()
  })

  it('finds a contact by the address first, then by the name', () => {
    const applicationId = captureOffer({ title: 'One', companyName: 'Acme' }).id
    const ada = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' })
    const bob = addContact(applicationId, { firstName: 'Bob', lastName: 'Martin' })

    const contacts = useRepoContacts()
    const drafts = matchContacts(
      [
        { ...draftFromRecord({}, context), address: 'ada@example.com', counterpart: 'Someone else' },
        { ...draftFromRecord({}, context), counterpart: 'bob  MARTIN <bob@elsewhere.com>' },
        { ...draftFromRecord({}, context), counterpart: 'Nobody Known', address: 'x@y.co' },
      ],
      contacts
    )

    expect(drafts.map((draft) => draft.contactId)).toEqual([ada.id, bob.id, null])
  })

  it('keeps a contact that was already chosen', () => {
    const draft: ExchangeDraft = { ...draftFromRecord({}, context), contactId: 'chosen', address: 'ada@example.com' }

    expect(matchContacts([draft], [])[0]?.contactId).toBe('chosen')
  })
})

function useRepoContacts() {
  return useRepo(Contact).with('methods').get() as never
}

describe('saving the drafts', () => {
  let applicationId: string

  beforeEach(() => {
    freshStore()
    applicationId = captureOffer({ title: 'One', companyName: 'Acme' }).id
  })

  const good = (extra: Partial<ExchangeDraft> = {}): ExchangeDraft => ({
    ...draftFromEml(EML, context),
    ...extra,
  })

  it('saves what has nothing wrong and skips the rest', () => {
    const result = importDrafts(
      [good(), good({ externalRef: '<m2>' }), good({ occurredAt: null, externalRef: '<m3>' })],
      applicationId
    )

    expect(result).toEqual({ added: 2, duplicates: 0, skipped: 1 })
    expect(useRepo(Interaction).all()).toHaveLength(2)
  })

  it('does not add an exchange again when it is imported a second time', () => {
    importDrafts([good()], applicationId)
    const second = importDrafts([good()], applicationId)

    expect(second).toEqual({ added: 0, duplicates: 1, skipped: 0 })
    expect(useRepo(Interaction).all()).toHaveLength(1)
  })

  it('keeps what the draft says: the contact, the origin and the moment in UTC', () => {
    const contactId = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace' }).id
    importDrafts([good({ contactId })], applicationId)

    expect(useRepo(Interaction).first()).toMatchObject({
      contactId,
      origin: 'eml',
      occurredAt: '2026-10-12T14:30:00.000Z',
      counterpart: 'Ada Lovelace <ada@example.com>',
    })
  })

  it('imports a whole file', () => {
    const csv =
      'channel,direction,date,subject\nemail,received,2026-10-12T10:00:00Z,One\nphone,sent,2026-10-13T10:00:00Z,Two\nemail,received,,Three'
    const result = importDrafts(draftsFromCsv(csv, context).drafts, applicationId)

    expect(result).toEqual({ added: 2, duplicates: 0, skipped: 1 })
  })
})

describe('the addresses of the user', () => {
  it('keeps the valid ones, in lower case, once each', () => {
    expect(normalizeEmails([' ME@Example.com ', 'me@example.com', 'nope', 3, 'work@example.org'])).toEqual([
      'me@example.com',
      'work@example.org',
    ])
    expect(normalizeEmails('me@example.com')).toEqual([])
    expect(normalizeEmails(undefined)).toEqual([])
  })

  it('keeps twenty at most', () => {
    const many = Array.from({ length: 30 }, (_, index) => `user${index}@example.com`)

    expect(normalizeEmails(many)).toHaveLength(20)
  })
})
