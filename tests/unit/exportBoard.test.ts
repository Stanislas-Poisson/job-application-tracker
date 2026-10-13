import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, JobOffer, Reminder } from '../../src/models'
import { emptyAddress } from '../../src/services/address'
import { addContact, addReminder, captureOffer } from '../../src/services/applications'
import {
  COLUMNS,
  type ExportContext,
  boardCsv,
  boardRows,
  decimalAmount,
  exportFileName,
} from '../../src/services/exportBoard'
import { saveJourney } from '../../src/services/journeys'
import { setPriority, tagEntityByName, toggleFavorite } from '../../src/services/tags'
import { UTF8_BOM, parseCsv, plainCell, toCsv } from '../../src/utils/csv'
import { freshStore } from './helpers'

const labels: ExportContext['labels'] = {
  columns: Object.fromEntries(COLUMNS.map((column) => [column, `col:${column}`])) as ExportContext['labels']['columns'],
  yes: 'yes',
  no: 'no',
  priorities: { '0': 'None', '1': 'Low', '2': 'Medium', '3': 'High' },
  periods: { year: 'year', month: 'month', week: 'week', day: 'day', hour: 'hour' },
  kinds: { gross: 'gross', net: 'net' },
  legModes: {
    walk: 'On foot',
    bike: 'Bicycle',
    car: 'Car',
    bus: 'Bus',
    tram: 'Tram',
    metro: 'Metro',
    train: 'Train',
    suburban: 'RER',
    transit: 'Public transport',
    ferry: 'Ferry',
    wait: 'Waiting',
    other: 'Other',
  },
}

const context = (changes: Partial<ExportContext> = {}): ExportContext => ({
  locale: 'en',
  labels,
  conversion: {
    home: 'EUR',
    rates: { USD: 0.9 },
    assumptions: { workingDaysPerYear: 220, hoursPerDay: 7 },
  },
  netEstimate: () => null,
  finalClients: () => [],
  statusLabel: (id) => (id ? 'Applied' : ''),
  sourceLabel: (source) => source.label,
  decimal: '.',
  ...changes,
})

const rowsOf = (...applications: Application[]) => boardRows(applications, context())
const cell = (row: string[], column: (typeof COLUMNS)[number]): string => row[COLUMNS.indexOf(column)] ?? ''
const everything = () =>
  useRepo(Application)
    .with('jobOffer', (query) => query.with('company').with('source').with('journeys'))
    .with('reminders')
    .with('tags')
    .with('contacts')
    .get()

describe('toCsv', () => {
  it('quotes what needs it and ends the lines like a spreadsheet', () => {
    expect(toCsv([['a', 'b,c', 'd"e', 'f\ng']])).toBe('a,"b,c","d""e","f\ng"\r\n')
    expect(toCsv([['a;b', 'c']], ';')).toBe('"a;b";c\r\n')
    expect(toCsv([['a,b', 'c']], ';')).toBe('a,b;c\r\n')
  })

  it('is read back by the reader of the imports', () => {
    const rows = [
      ['Title', 'Place'],
      ['Dev, "senior"', 'Paris\nFrance'],
      ['', 'é — ü'],
    ]
    for (const separator of [',', ';']) {
      expect(parseCsv(UTF8_BOM + toCsv(rows, separator))).toEqual(rows)
    }
  })
})

describe('plainCell', () => {
  it('makes a text that would run as a formula plain, and leaves the others', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@x', '\tx', '\rx', '=HYPERLINK("http://evil","x")']) {
      expect(plainCell(bad)).toBe(`'${bad}`)
    }
    for (const good of ['Developer', '2026-10-13', 'a=b', '', 'Dev - senior', "'quoted"]) {
      expect(plainCell(good)).toBe(good)
    }
  })
})

describe('decimalAmount', () => {
  it('writes the minor units as a decimal number, with the digits of the currency', () => {
    expect(decimalAmount(4500050, 'EUR', '.')).toBe('45000.50')
    expect(decimalAmount(4500050, 'EUR', ',')).toBe('45000,50')
    expect(decimalAmount(5_000_000, 'JPY', '.')).toBe('5000000')
    expect(decimalAmount(null, 'EUR', '.')).toBe('')
    expect(decimalAmount(100, null, '.')).toBe('')
  })
})

describe('boardRows', () => {
  beforeEach(() => {
    freshStore()
  })

  it('has a head with the words of the language, then a row per application', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    captureOffer({ title: 'Two', companyName: 'Globex' })
    const rows = boardRows(everything(), context())

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(COLUMNS.map((column) => `col:${column}`))
    expect(rows.every((row) => row.length === COLUMNS.length)).toBe(true)
    expect(
      rows
        .slice(1)
        .map((row) => cell(row, 'title'))
        .sort()
    ).toEqual(['One', 'Two'])
  })

  it('gives an empty file with a head for no application', () => {
    expect(boardRows([], context())).toEqual([COLUMNS.map((column) => `col:${column}`)])
  })

  it('writes the offer, the dates in UTC and the day published as a plain date', () => {
    const application = captureOffer({
      title: 'Backend developer',
      companyName: 'Acme',
      url: 'https://www.linkedin.com/jobs/view/1',
      location: 'Paris',
      country: 'FR',
      contractType: 'CDI',
      workMode: 'remote',
      postedOn: '2026-10-12',
      statusKey: 'applied',
    })
    const row = rowsOf(...everything().filter((candidate) => candidate.id === application.id))[1] ?? []

    expect(cell(row, 'title')).toBe('Backend developer')
    expect(cell(row, 'company')).toBe('Acme')
    expect(cell(row, 'place')).toBe('Paris')
    expect(cell(row, 'country')).toBe('FR')
    expect(cell(row, 'contract')).toBe('CDI')
    expect(cell(row, 'workMode')).toBe('remote')
    expect(cell(row, 'source')).toBe('LinkedIn')
    expect(cell(row, 'url')).toBe('https://www.linkedin.com/jobs/view/1')
    expect(cell(row, 'published')).toBe('2026-10-12')
    expect(cell(row, 'status')).toBe('Applied')
    expect(cell(row, 'appliedAt')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(cell(row, 'createdAt')).toMatch(/Z$/)
    expect(cell(row, 'updatedAt')).toMatch(/Z$/)
    expect(cell(row, 'archived')).toBe('no')
  })

  it('writes the estimate of the net pay, with the profile that made it', () => {
    captureOffer({
      title: 'Dev',
      companyName: 'Acme',
      salary: { min: 4_000_000, max: 5_000_000, currency: 'EUR', period: 'year', kind: 'gross' },
    })
    const row =
      boardRows(
        everything(),
        context({ netEstimate: () => ({ amount: 3_375_000, currency: 'EUR', profile: 'My profile' }) })
      )[1] ?? []
    expect(cell(row, 'netPerYear')).toBe('33750.00')
    expect(cell(row, 'netProfile')).toBe('My profile')
    const none = boardRows(everything(), context())[1] ?? []
    expect(cell(none, 'netPerYear')).toBe('')
    expect(cell(none, 'netProfile')).toBe('')
  })

  it('writes the address of the workplace and the journeys to work', () => {
    const application = captureOffer({
      title: 'Dev',
      companyName: 'Acme',
      address: {
        ...emptyAddress(),
        line1: '1 rue X',
        postalCode: '75001',
        city: 'Paris',
        country: 'FR',
        latitude: 48.86,
        longitude: 2.34,
      },
    })
    const offerId = application.jobOfferId ?? ''
    saveJourney({
      jobOfferId: offerId,
      direction: 'outbound',
      legs: [
        { mode: 'walk', line: '', minutes: 10, meters: 800 },
        { mode: 'suburban', line: 'RER A', minutes: 40, meters: 24_000 },
        { mode: 'walk', line: '', minutes: 8, meters: null },
      ],
    })
    saveJourney({
      jobOfferId: offerId,
      direction: 'outbound',
      legs: [{ mode: 'car', line: '', minutes: 70, meters: null }],
    })
    saveJourney({
      jobOfferId: offerId,
      direction: 'return',
      legs: [{ mode: 'suburban', line: 'RER A', minutes: 45, meters: null }],
    })

    const dot = rowsOf(...everything())[1] ?? []
    expect(cell(dot, 'postalAddress')).toBe('1 rue X, 75001 Paris, France')
    expect(['postalCode', 'city', 'latitude', 'longitude'].map((column) => cell(dot, column as never))).toEqual([
      '75001',
      'Paris',
      '48.86',
      '2.34',
    ])
    // The first journey of a direction is the preferred one: 58 minutes, 24.8 km, told in words.
    expect(cell(dot, 'commuteMinutes')).toBe('58')
    expect(cell(dot, 'commuteKm')).toBe('24.8')
    expect(cell(dot, 'journey')).toBe('On foot 10 min > RER RER A 40 min > On foot 8 min')
    expect(cell(dot, 'returnMinutes')).toBe('45')
    // The decimal mark follows the file, like the amounts.
    expect(cell(boardRows(everything(), context({ decimal: ',' }))[1] ?? [], 'commuteKm')).toBe('24,8')
  })

  it('leaves the way there empty when nothing was kept', () => {
    captureOffer({ title: 'Dev', companyName: 'Acme' })
    const row = rowsOf(...everything())[1] ?? []
    expect(
      ['postalAddress', 'postalCode', 'city', 'latitude', 'commuteKm', 'commuteMinutes', 'commuteMode'].map((column) =>
        cell(row, column as never)
      )
    ).toEqual(['', '', '', '', '', '', ''])
  })

  it('writes the final clients of a recruitment firm', () => {
    captureOffer({ title: 'Dev', companyName: 'Hire Co' })
    const [loaded] = everything()
    const firmId = loaded?.jobOffer?.company?.id
    const row =
      boardRows(
        everything(),
        context({ finalClients: (companyId) => (companyId === firmId ? ['Client A', 'Client B'] : []) })
      )[1] ?? []
    expect(cell(row, 'finalClient')).toBe('Client A; Client B')
    expect(cell(rowsOf(...everything())[1] ?? [], 'finalClient')).toBe('')
  })

  it('writes the salary as stated, and per year in the home currency', () => {
    const application = captureOffer({
      title: 'Dev',
      companyName: 'Acme',
      salary: { min: 4_000_000, max: 5_000_000, currency: 'USD', period: 'year', kind: 'gross' },
    })
    const row = rowsOf(...everything().filter((candidate) => candidate.id === application.id))[1] ?? []

    expect(cell(row, 'salaryMin')).toBe('40000.00')
    expect(cell(row, 'salaryMax')).toBe('50000.00')
    expect(cell(row, 'salaryCurrency')).toBe('USD')
    expect(cell(row, 'salaryPeriod')).toBe('year')
    expect(cell(row, 'salaryKind')).toBe('gross')
    // The middle (45 000 USD) at 0.9 is 40 500 EUR.
    expect(cell(row, 'homeCurrency')).toBe('EUR')
    expect(cell(row, 'salaryPerYearHome')).toBe('40500.00')
  })

  it('leaves the home columns empty when the salary cannot be converted, and the salary empty without one', () => {
    captureOffer({
      title: 'Dev',
      companyName: 'Acme',
      salary: { min: 100, max: 100, currency: 'CHF', period: 'year', kind: null },
    })
    captureOffer({ title: 'No salary', companyName: 'Acme' })
    const rows = boardRows(everything(), context()).slice(1)

    for (const row of rows) {
      expect(cell(row, 'homeCurrency')).toBe('')
      expect(cell(row, 'salaryPerYearHome')).toBe('')
    }
    const none = rows.find((row) => 'No salary' === cell(row, 'title')) ?? []
    expect(
      ['salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod', 'salaryKind'].map((c) => cell(none, c as never))
    ).toEqual(['', '', '', '', ''])
  })

  it('writes the priority, the favourite, the tags, the contacts and the reminders', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Acme' })
    setPriority(application.id, 3)
    toggleFavorite('applications', application.id)
    tagEntityByName('applications', application.id, 'remote')
    tagEntityByName('applications', application.id, 'laravel')
    addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    addReminder(application.id, 'Later', '2026-12-01T08:00:00.000Z')
    addReminder(application.id, 'Sooner', '2026-11-01T08:00:00.000Z')
    const done = addReminder(application.id, 'Done', '2026-10-01T08:00:00.000Z')
    useRepo(Reminder).where('id', done.id).update({ doneAt: '2026-10-02T08:00:00.000Z' })

    const row = boardRows(everything(), context())[1] ?? []
    expect(cell(row, 'priority')).toBe('High')
    expect(cell(row, 'favourite')).toBe('yes')
    expect(cell(row, 'tags').split('; ').sort()).toEqual(['laravel', 'remote'])
    expect(cell(row, 'contacts')).toBe('Ada Lovelace')
    expect(cell(row, 'openReminders')).toBe('2')
    expect(cell(row, 'nextReminder')).toBe('2026-11-01T08:00:00.000Z')
  })

  it('makes a title that would run as a formula plain text', () => {
    captureOffer({ title: '=HYPERLINK("http://evil.example","Click")', companyName: '+cmd|calc' })
    const row = boardRows(everything(), context())[1] ?? []
    expect(cell(row, 'title')).toBe('\'=HYPERLINK("http://evil.example","Click")')
    expect(cell(row, 'company')).toBe("'+cmd|calc")
  })

  it('copes with an application whose offer is gone', () => {
    const application = captureOffer({ title: 'Dev', companyName: 'Acme' })
    useRepo(JobOffer).destroy(application.jobOfferId ?? '')
    const row = boardRows(everything(), context())[1] ?? []
    expect(cell(row, 'title')).toBe('')
    expect(row).toHaveLength(COLUMNS.length)
  })
})

describe('boardCsv', () => {
  beforeEach(() => {
    freshStore()
    captureOffer({
      title: 'Dev, "senior"',
      companyName: 'Acme',
      location: 'Lyon',
      salary: { min: 4_500_050, max: null, currency: 'EUR', period: 'year', kind: null },
    })
  })

  it('starts with the mark of UTF-8 and is read back by a reader of CSV', () => {
    const text = boardCsv(everything(), context(), ',')
    expect(text.startsWith(UTF8_BOM)).toBe(true)
    const rows = parseCsv(text)
    expect(rows).toHaveLength(2)
    expect(cell(rows[1] ?? [], 'title')).toBe('Dev, "senior"')
    expect(cell(rows[1] ?? [], 'salaryMin')).toBe('45000.50')
  })

  it('uses the semicolon and the decimal comma together, for the spreadsheets of the countries that write so', () => {
    const text = boardCsv(everything(), context(), ';')
    const rows = parseCsv(text)
    expect(rows[0]).toHaveLength(COLUMNS.length)
    expect(cell(rows[1] ?? [], 'salaryMin')).toBe('45000,50')
    expect(cell(rows[1] ?? [], 'title')).toBe('Dev, "senior"')
  })

  it('has the day in the name of the file', () => {
    expect(exportFileName('2026-10-13')).toBe('job-application-tracker-board-2026-10-13.csv')
  })
})

describe('csvSeparator', () => {
  it('uses a semicolon where the decimal mark is a comma', async () => {
    const { csvSeparator } = await import('../../src/services/exportBoard')
    expect(['fr', 'de', 'es', 'it', 'pt', 'nl'].map((locale) => csvSeparator(locale))).toEqual(Array(6).fill(';'))
    expect(['en', 'ja'].map((locale) => csvSeparator(locale))).toEqual([',', ','])
  })
})
