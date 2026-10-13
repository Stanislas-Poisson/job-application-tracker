import { describe, expect, it } from 'vitest'
import { findJobPostings, htmlToText, offerFromJobPosting } from '../../src/extraction/jobPosting'
import { readOpenGraph, readSnapshot, titleFromPage } from '../../src/extraction/read'
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
      location: 'Paris, IDF, FR',
      country: 'FR',
      contractType: 'FULL_TIME, CONTRACTOR',
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
