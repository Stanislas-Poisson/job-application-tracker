import { describe, expect, it } from 'vitest'
import { htmlToText, parseAddresses, parseEml, parseMessageDate } from '../../src/utils/eml'

const crlf = (lines: string[]) => lines.join('\r\n')

describe('the headers of an email', () => {
  it('reads who wrote to whom, when and about what', () => {
    const message = parseEml(
      crlf([
        'From: Ada Lovelace <Ada@Example.com>',
        'To: Bob <bob@example.com>, carol@example.com',
        'Cc: Dan <dan@example.com>',
        'Subject: Interview on Monday',
        'Date: Mon, 12 Oct 2026 16:30:00 +0200',
        'Message-ID: <abc123@example.com>',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Are you free at 10?',
        '',
      ])
    )

    expect(message.from).toEqual({ name: 'Ada Lovelace', address: 'ada@example.com' })
    expect(message.to).toEqual([
      { name: 'Bob', address: 'bob@example.com' },
      { name: '', address: 'carol@example.com' },
    ])
    expect(message.cc).toEqual([{ name: 'Dan', address: 'dan@example.com' }])
    expect(message.subject).toBe('Interview on Monday')
    expect(message.date).toBe('2026-10-12T14:30:00.000Z')
    expect(message.messageId).toBe('<abc123@example.com>')
    expect(message.body).toBe('Are you free at 10?')
  })

  it('joins a header that is folded on several lines', () => {
    const message = parseEml('Subject: A very long\n subject that goes\n\ton three lines\nFrom: a@b.co\n\nbody')

    expect(message.subject).toBe('A very long subject that goes on three lines')
  })

  it('reads the words that are encoded, in base64 and in quoted-printable, in their character set', () => {
    const message = parseEml(
      [
        'From: =?UTF-8?B?w4lsw6lvbm9yZSBEdXB1aXM=?= <eleonore@example.com>',
        'Subject: =?ISO-8859-1?Q?Entretien_d=E9but_octobre?=',
        '',
        'x',
      ].join('\n')
    )

    expect(message.from?.name).toBe('Éléonore Dupuis')
    expect(message.subject).toBe('Entretien début octobre')
  })

  it('joins encoded words that follow each other', () => {
    const message = parseEml('Subject: =?UTF-8?Q?Caf=C3=A9?= =?UTF-8?Q?_au_lait?=\n\nx')

    expect(message.subject).toBe('Café au lait')
  })

  it('does not split an address list at a comma inside a name', () => {
    expect(parseAddresses('"Lovelace, Ada" <ada@example.com>, bob@example.com')).toEqual([
      { name: 'Lovelace, Ada', address: 'ada@example.com' },
      { name: '', address: 'bob@example.com' },
    ])
  })

  it('reads a date with a comment, and gives null for one that cannot be read', () => {
    expect(parseMessageDate('Mon, 12 Oct 2026 16:30:00 +0200 (CEST)')).toBe('2026-10-12T14:30:00.000Z')
    expect(parseMessageDate('Tue, 13 Oct 2026 01:00:00 -0500')).toBe('2026-10-13T06:00:00.000Z')
    expect(parseMessageDate('yesterday')).toBeNull()
    expect(parseMessageDate(undefined)).toBeNull()
  })

  it('has no date, no subject and no address when the message has none', () => {
    const message = parseEml('X-Other: 1\n\nJust a body')

    expect(message).toMatchObject({ from: null, to: [], subject: '', date: null, messageId: null, body: 'Just a body' })
  })
})

describe('the body of an email', () => {
  it('decodes quoted-printable in the character set of the message', () => {
    const message = parseEml(
      [
        'Content-Type: text/plain; charset=iso-8859-1',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'Caf=E9 au lait,=',
        ' et un croissant =E0 9=80.',
      ].join('\n')
    )

    // Browsers read iso-8859-1 as windows-1252 (the web standard), where the byte 0x80 is the euro sign.
    expect(message.body).toBe('Café au lait, et un croissant à 9€.')
  })

  it('decodes quoted-printable in UTF-8', () => {
    const message = parseEml(
      [
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'Caf=C3=A9 =E2=80=94 =C3=A0 bient=C3=B4t',
      ].join('\n')
    )

    expect(message.body).toBe('Café — à bientôt')
  })

  it('decodes base64', () => {
    const message = parseEml(
      [
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        'Q2Fmw6kg4oCUIMOgIGJpZW50w7R0',
        '',
      ].join('\n')
    )

    expect(message.body).toBe('Café — à bientôt')
  })

  it('takes the plain text of a message that has a plain text and an HTML version', () => {
    const message = parseEml(
      [
        'Subject: Hello',
        'Content-Type: multipart/alternative; boundary="b1"',
        '',
        'This is a multi-part message.',
        '--b1',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Plain version',
        '--b1',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>HTML <b>version</b></p>',
        '--b1--',
        '',
      ].join('\n')
    )

    expect(message.body).toBe('Plain version')
  })

  it('turns the HTML into text when there is no plain text', () => {
    const message = parseEml(
      [
        'Content-Type: text/html; charset=utf-8',
        '',
        '<html><head><style>p{color:red}</style></head><body><p>Hello&nbsp;Ada,</p><p>Tom &amp; Jerry&#39;s <b>offer</b> &lt;3<br>Bye</p></body></html>',
      ].join('\n')
    )

    expect(message.body).toBe("Hello Ada,\nTom & Jerry's offer <3\nBye")
  })

  it('ignores an attachment and finds the text in a mixed message', () => {
    const message = parseEml(
      [
        'Content-Type: multipart/mixed; boundary="outer"',
        '',
        '--outer',
        'Content-Type: multipart/alternative; boundary="inner"',
        '',
        '--inner',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'The text',
        '--inner--',
        '--outer',
        'Content-Type: text/plain; name="cv.txt"',
        'Content-Disposition: attachment; filename="cv.txt"',
        '',
        'Not the text',
        '--outer--',
      ].join('\n')
    )

    expect(message.body).toBe('The text')
  })

  it('has an empty body for a message with only an attachment', () => {
    const message = parseEml(
      [
        'Content-Type: multipart/mixed; boundary="x"',
        '',
        '--x',
        'Content-Type: application/pdf',
        'Content-Disposition: attachment',
        '',
        'JVBERi0=',
        '--x--',
      ].join('\n')
    )

    expect(message.body).toBe('')
  })

  it('reads a message with Windows line ends the same as one with Unix line ends', () => {
    const lines = ['From: a@b.co', 'Subject: Hi', '', 'Line 1', 'Line 2']

    expect(parseEml(lines.join('\r\n'))).toEqual(parseEml(lines.join('\n')))
  })
})

describe('turning HTML into text', () => {
  it('keeps the numeric and named entities', () => {
    expect(htmlToText('&#8364;5 &#x20AC;6 &euro; &copy;')).toBe('€5 €6 &euro; &copy;')
  })
})
