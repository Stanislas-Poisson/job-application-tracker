import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findJobPostings, htmlToText, offerFromJobPosting } from '../../src/extraction/jobPosting'
import { readOpenGraph, readSnapshot, titleFromPage } from '../../src/extraction/read'
import { ISSUES_URL, REPORT_EMAIL, reportMailto, reportUrl } from '../../src/extraction/report'
import { postedDay } from '../../src/utils/time'

const PARIS = 'Europe/Paris'

describe('postedDay', () => {
  it('keeps a date with no hour as it is', () => {
    expect(postedDay('2026-10-12', PARIS)).toBe('2026-10-12')
  })

  it('reads a moment with a time zone in the time zone of the user', () => {
    // 23:30 in New York is already the next day in Paris.
    expect(postedDay('2026-10-12T23:30:00-04:00', PARIS)).toBe('2026-10-13')
    expect(postedDay('2026-10-12T23:30:00Z', PARIS)).toBe('2026-10-13')
    expect(postedDay('2026-10-12T23:30:00Z', 'America/New_York')).toBe('2026-10-12')
    expect(postedDay('2026-10-12T23:30:00-0400', PARIS)).toBe('2026-10-13')
    expect(postedDay('2026-10-12T23:30:00-04', PARIS)).toBe('2026-10-13')
  })

  it('reads a moment with no time zone in the time zone of the user: the day written', () => {
    expect(postedDay('2026-10-12T23:30:00', PARIS)).toBe('2026-10-12')
    expect(postedDay('2026-10-12 23:30', 'Asia/Tokyo')).toBe('2026-10-12')
  })

  it('refuses what is not a date', () => {
    expect(postedDay('yesterday', PARIS)).toBeNull()
    expect(postedDay('2026-02-30', PARIS)).toBeNull()
    expect(postedDay('2026-02-30T10:00:00Z', PARIS)).toBeNull()
    expect(postedDay(42, PARIS)).toBeNull()
    expect(postedDay(null, PARIS)).toBeNull()
  })
})

const posting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Senior developer',
  description: '<p>Build things &amp; ship.</p><ul><li>PHP</li><li>Vue</li></ul>',
  datePosted: '2026-10-12T22:30:00Z',
  employmentType: ['FULL_TIME', 'CONTRACTOR'],
  jobLocationType: 'TELECOMMUTE',
  hiringOrganization: { '@type': 'Organization', name: 'Acme' },
  jobLocation: { '@type': 'Place', address: { addressLocality: 'Paris', addressRegion: 'IDF', addressCountry: 'FR' } },
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'EUR',
    value: { '@type': 'QuantitativeValue', minValue: 45000, maxValue: 55000.5, unitText: 'YEAR' },
  },
}

describe('findJobPostings', () => {
  it('finds a posting at the root, in a list and in a graph', () => {
    expect(findJobPostings([JSON.stringify(posting)])).toHaveLength(1)
    expect(findJobPostings([JSON.stringify([{ '@type': 'WebSite' }, posting])])).toHaveLength(1)
    expect(findJobPostings([JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, posting] })])).toHaveLength(1)
    expect(findJobPostings([JSON.stringify({ ...posting, '@type': ['Thing', 'JobPosting'] })])).toHaveLength(1)
  })

  it('skips a script that is not JSON and a page with no posting', () => {
    expect(findJobPostings(['{ nope', '', JSON.stringify({ '@type': 'Article' })])).toEqual([])
  })
})

describe('offerFromJobPosting', () => {
  it('maps a full posting', () => {
    expect(offerFromJobPosting(posting, PARIS)).toEqual({
      title: 'Senior developer',
      companyName: 'Acme',
      location: 'Paris, IDF',
      country: 'FR',
      contractType: 'Full time, Contractor',
      workMode: 'remote',
      description: 'Build things & ship.\n- PHP\n- Vue',
      // 22:30 UTC is 00:30 the next day in Paris.
      postedOn: '2026-10-13',
      salary: { min: 4_500_000, max: 5_500_050, currency: 'EUR', period: 'year', kind: null },
    })
  })

  it('leaves out what the page does not say', () => {
    expect(offerFromJobPosting({ '@type': 'JobPosting', title: 'Dev' }, PARIS)).toEqual({ title: 'Dev' })
  })

  it('reads a single salary value, a plain organization name and a place as text', () => {
    const offer = offerFromJobPosting(
      {
        '@type': 'JobPosting',
        title: 'Dev',
        hiringOrganization: 'Globex',
        jobLocation: { address: 'Lyon' },
        baseSalary: { currency: 'JPY', value: 5_000_000, unitText: 'MONTH' },
      },
      PARIS
    )
    expect(offer.companyName).toBe('Globex')
    expect(offer.location).toBe('Lyon')
    expect(offer.salary).toEqual({ min: 5_000_000, max: 5_000_000, currency: 'JPY', period: 'month', kind: null })
  })

  it('drops a salary with an unknown currency or no amount', () => {
    expect(offerFromJobPosting({ baseSalary: { currency: 'XXX1', value: 10 } }, PARIS).salary).toBeUndefined()
    expect(offerFromJobPosting({ baseSalary: { currency: 'EUR', value: {} } }, PARIS).salary).toBeUndefined()
    expect(offerFromJobPosting({ baseSalary: { currency: 'EUR', value: 'lots' } }, PARIS).salary).toBeUndefined()
  })

  it('does not take a country name for a code', () => {
    const offer = offerFromJobPosting(
      { jobLocation: { address: { addressLocality: 'Berlin', addressCountry: { name: 'Germany' } } } },
      PARIS
    )
    expect(offer.country).toBeUndefined()
    expect(offer.location).toBe('Berlin, Germany')
  })
})

describe('htmlToText', () => {
  it('keeps the text and the line breaks', () => {
    expect(htmlToText('<h2>Role</h2><p>One<br>two &nbsp;three</p>')).toBe('Role\nOne\ntwo three')
  })
})

describe('titleFromPage', () => {
  it('drops the name of the site', () => {
    expect(titleFromPage('Senior developer - Acme | LinkedIn')).toBe('Senior developer - Acme')
    expect(titleFromPage('  Dev   PHP ')).toBe('Dev PHP')
    expect(titleFromPage('')).toBeUndefined()
  })
})

describe('readOpenGraph', () => {
  it('takes the title and the description of the tags', () => {
    const offer = readOpenGraph({
      url: 'https://x.test',
      title: 'Ignored | Site',
      jsonLd: [],
      meta: { 'og:title': 'Dev PHP', 'og:description': 'Join <b>us</b>', 'og:site_name': 'Jobboard' },
    })
    expect(offer).toEqual({ title: 'Dev PHP', companyName: 'Jobboard', description: 'Join us' })
  })

  it('falls back on the title of the page and on the plain description', () => {
    const offer = readOpenGraph({
      url: 'https://x.test',
      title: 'Dev PHP | Jobboard',
      jsonLd: [],
      meta: { description: 'A job' },
    })
    expect(offer).toEqual({ title: 'Dev PHP', description: 'A job' })
  })
})

describe('readSnapshot', () => {
  it('reads the first posting of the page', () => {
    const snapshot = { url: 'https://x.test/job', title: 'Job', jsonLd: [JSON.stringify(posting)], meta: {} }
    expect(readSnapshot(snapshot, PARIS).title).toBe('Senior developer')
  })

  it('fills what the posting does not say from OpenGraph, and never the company from the site name', () => {
    const snapshot = {
      url: 'https://x.test/job',
      title: 'Page',
      jsonLd: [JSON.stringify({ '@type': 'JobPosting', title: 'Dev' })],
      meta: { 'og:description': 'Nice job', 'og:site_name': 'Jobboard' },
    }
    expect(readSnapshot(snapshot, PARIS)).toEqual({ title: 'Dev', description: 'Nice job' })
  })

  it('falls back on OpenGraph when there is no posting', () => {
    const snapshot = { url: 'https://x.test', title: 'Home | Site', jsonLd: [], meta: {} }
    expect(readSnapshot(snapshot, PARIS)).toEqual({ title: 'Home' })
  })

  it('gives nothing for a page that says nothing', () => {
    expect(readSnapshot({ url: 'https://x.test', title: '', jsonLd: [], meta: {} }, PARIS)).toEqual({})
  })
})

describe('reportUrl', () => {
  const read = { title: 'Dev', postedOn: '2026-10-12' }

  it('names the site, not the address, and what was and was not read', () => {
    const url = new URL(reportUrl('https://jobs.example.com/offer/12?token=secret', read, '0.1.0'))
    const body = url.searchParams.get('body') ?? ''
    expect(url.origin + url.pathname).toBe(ISSUES_URL)
    expect(url.searchParams.get('title')).toBe('Reading broke on jobs.example.com')
    expect(body).toContain('Site: jobs.example.com')
    expect(body).toContain('Read: title, postedOn')
    expect(body).toContain('Missing: companyName, location, contractType, description, salary')
    expect(url.toString()).not.toContain('secret')
    expect(url.toString()).not.toContain('Dev')
  })

  it('copes with an address that is not one', () => {
    const url = new URL(reportUrl('not a url', {}, '0.1.0'))
    expect(url.searchParams.get('body')).toContain('Site: unknown')
    expect(url.searchParams.get('body')).toContain('Read: nothing')
  })
})

describe('reportMailto', () => {
  it('is the same report as an e-mail, without the address of the page', () => {
    const link = reportMailto('https://jobs.example.com/offer/12?token=secret', { title: 'Dev' }, '0.1.0')
    expect(link.startsWith(`mailto:${REPORT_EMAIL}?subject=`)).toBe(true)
    expect(decodeURIComponent(link)).toContain('Site: jobs.example.com')
    expect(decodeURIComponent(link)).toContain('Read: title')
    expect(link).not.toContain('secret')
    expect(link).not.toContain('+')
  })
})

// What real sites publish, seen on saved pages: their quirks are the cases below.
describe('real-world postings', () => {
  const read = (extra: object) => offerFromJobPosting({ '@type': 'JobPosting', title: 'Dev', ...extra }, PARIS)

  it('reads YEARLY, MONTHLY and DAILY as periods', () => {
    const salary = (unitText: string) =>
      read({ baseSalary: { currency: 'EUR', value: { minValue: 5000, unitText } } }).salary?.period
    expect(salary('YEARLY')).toBe('year')
    expect(salary('MONTHLY')).toBe('month')
    expect(salary('DAILY')).toBe('day')
  })

  it('reads a salary given as strings with decimals and says gross from the text', () => {
    const offer = read({
      baseSalary: {
        currency: 'EUR',
        value: { minValue: '80000.00', maxValue: '85000.00', unitText: 'YEAR', value: '80 - 85 k€ brut annuel' },
      },
    })
    expect(offer.salary).toEqual({ min: 8_000_000, max: 8_500_000, currency: 'EUR', period: 'year', kind: 'gross' })
    expect(
      read({ baseSalary: { currency: 'EUR', value: { value: 'about 3000 net', unitText: 'MONTH' } } }).salary
    ).toBeUndefined()
  })

  it('leaves out a yearly salary in thousands that is not said so (30 for 30 000)', () => {
    const baseSalary = { currency: 'EUR', value: { minValue: 30, maxValue: 32, unitText: 'YEARLY' } }
    expect(read({ baseSalary }).salary).toBeUndefined()
    // A day rate of 30 is plausible: only a year is checked.
    expect(
      read({ baseSalary: { ...baseSalary, value: { ...baseSalary.value, unitText: 'DAILY' } } }).salary
    ).toBeDefined()
  })

  it('keeps a lowest salary alone and an empty one out', () => {
    expect(
      read({ baseSalary: { currency: 'EUR', value: { minValue: 55000, maxValue: null, unitText: 'YEARLY' } } }).salary
    ).toMatchObject({
      min: 5_500_000,
      max: null,
      period: 'year',
    })
    expect(read({ baseSalary: { currency: 'EUR', value: { '@type': 'QuantitativeValue' } } }).salary).toBeUndefined()
  })

  it('does not repeat the city as the region, and keeps a country given as a name', () => {
    const place = (address: object) => read({ jobLocation: { address } }).location
    expect(
      place({ addressLocality: 'ST LAURENT BLANGY', addressRegion: 'ST LAURENT BLANGY', addressCountry: 'FR' })
    ).toBe('ST LAURENT BLANGY')
    expect(place({ addressLocality: 'Estrées-Mons', addressRegion: 'Hauts-de-France', addressCountry: 'France' })).toBe(
      'Estrées-Mons, Hauts-de-France, France'
    )
  })

  it('reads a list of places by its first one', () => {
    expect(
      read({ jobLocation: [{ address: { addressLocality: 'Courbevoie' } }, { address: { addressLocality: 'Lyon' } }] })
        .location
    ).toBe('Courbevoie')
  })

  it('decodes the entities left in a description', () => {
    expect(
      read({ description: 'D&#233;veloppeur&#183;se &#x41;ngular &amp; Vue &hellip; &unknown;' }).description
    ).toBe('Développeur·se Angular & Vue … &unknown;')
  })

  it('writes the contract of schema.org readably and keeps the one of a site', () => {
    expect(read({ employmentType: 'FULL_TIME' }).contractType).toBe('Full time')
    expect(read({ employmentType: ['CONTRACTOR'] }).contractType).toBe('Contractor')
    expect(read({ employmentType: 'CDI' }).contractType).toBe('CDI')
  })

  it('reads a date with an offset written with a space (APEC)', () => {
    expect(read({ datePosted: '2026-10-07 21:07:54 +0200' }).postedOn).toBe('2026-10-07')
  })
})

// The pages saved by hand stay out of the repository: this runs on the machine that has them.
const PAGES = '/home/zairakai/code/datas/pages/'
const OFFERS = [
  'apec',
  'cadreemploi',
  'freework',
  'hellowork',
  'jobteaser',
  'meteojob',
  'monster',
  'welcolmetothejungle',
  'ziprecruteur',
]
describe.skipIf(!existsSync(`${PAGES}apec.html`))('the saved pages of real sites', () => {
  it.each(OFFERS)('%s gives at least a title, a company and a description', (site) => {
    const page = readFileSync(`${PAGES}${site}.html`, 'utf8')
    const jsonLd = [...page.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '')
    const offer = readSnapshot({ url: 'https://example.com/', title: '', jsonLd, meta: {} }, PARIS)
    expect(offer.title).toBeTruthy()
    expect(offer.companyName).toBeTruthy()
    expect(offer.description?.length).toBeGreaterThan(100)
    expect(offer.description).not.toMatch(/&#\d+;/)
  })
})
