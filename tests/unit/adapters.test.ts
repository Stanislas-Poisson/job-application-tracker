import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adapterFor } from '../../src/extraction/adapters'
import { readLinkedIn, titleAndCompany } from '../../src/extraction/adapters/linkedin'
import { readTalent } from '../../src/extraction/adapters/talent'
import type { PageSnapshot } from '../../src/extraction/page'
import { readSnapshot } from '../../src/extraction/read'
import { relativeDay } from '../../src/extraction/relativeDate'
import { salaryFromText } from '../../src/extraction/salaryText'

const PARIS = 'Europe/Paris'
// Noon on 2026-10-13 in Paris.
const NOW = new Date('2026-10-13T10:00:00Z')
const fixture = (name: string) => readFileSync(`tests/fixtures/linkedin/${name}`, 'utf8')
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const snapshot = (title: string, body: string): PageSnapshot => ({
  url: 'https://www.linkedin.com/jobs/view/4382092103/',
  title,
  jsonLd: [],
  meta: {},
  body,
})

describe('relativeDay', () => {
  it.each([
    ['Republication il y a 1 jour', '2026-10-12'],
    ['il y a 3 jours', '2026-10-10'],
    ['il y a 2 semaines', '2026-09-29'],
    ['il y a 1 mois', '2026-09-13'],
    ['il y a 5 heures', '2026-10-13'],
    ['il y a 15 heures', '2026-10-12'],
    ['Posted 2 weeks ago', '2026-09-29'],
    ['1 day ago', '2026-10-12'],
    ['il y a 1 an', '2025-10-13'],
    ["à l'instant", '2026-10-13'],
  ])('%s is %s', (text, day) => {
    expect(relativeDay(text, PARIS, NOW)).toBe(day)
  })

  it('counts the day in the time zone of the user', () => {
    // 22:30 UTC is already the next day in Paris and still the same day in New York.
    const late = new Date('2026-10-13T22:30:00Z')
    expect(relativeDay('il y a 1 jour', PARIS, late)).toBe('2026-10-13')
    expect(relativeDay('il y a 1 jour', 'America/New_York', late)).toBe('2026-10-12')
  })

  it('gives null for what is not a relative date', () => {
    expect(relativeDay('Paris, France', PARIS, NOW)).toBeNull()
    expect(relativeDay('il y a des jours', PARIS, NOW)).toBeNull()
    expect(relativeDay('3 days', PARIS, NOW)).toBeNull()
  })
})

describe('salaryFromText', () => {
  it('reads the range of LinkedIn, with its non-breaking spaces', () => {
    expect(salaryFromText('40K € par yr - 60K € par yr')).toEqual({
      min: 4_000_000,
      max: 6_000_000,
      currency: 'EUR',
      period: 'year',
      kind: null,
    })
  })

  it('reads other writings', () => {
    expect(salaryFromText('45 000 € - 55 000 €/an')).toMatchObject({ min: 4_500_000, max: 5_500_000, period: 'year' })
    expect(salaryFromText('$90,000/yr')).toMatchObject({
      min: 9_000_000,
      max: 9_000_000,
      currency: 'USD',
      period: 'year',
    })
    expect(salaryFromText('£400 per day')).toMatchObject({ min: 40_000, currency: 'GBP', period: 'day' })
    expect(salaryFromText('3,5K € par mois')).toMatchObject({ min: 350_000, period: 'month' })
    expect(salaryFromText('55K € - 40K €')).toMatchObject({ min: 4_000_000, max: 5_500_000 })
  })

  it('leaves the period empty when it is not said, and gives null when there is no amount', () => {
    expect(salaryFromText('50K €')?.period).toBeNull()
    expect(salaryFromText('Paris, France')).toBeNull()
    expect(salaryFromText('3 ans d’expérience')).toBeNull()
  })
})

describe('adapterFor', () => {
  it('knows LinkedIn job pages only', () => {
    expect(adapterFor('https://www.linkedin.com/jobs/view/4382092103/?trk=x')?.name).toBe('linkedin')
    expect(adapterFor('https://www.linkedin.com/jobs/search-results/?currentJobId=1')?.name).toBe('linkedin')
    expect(adapterFor('https://fr.linkedin.com/jobs/view/1')?.name).toBe('linkedin')
    expect(adapterFor('https://www.linkedin.com/in/someone')).toBeNull()
    expect(adapterFor('https://notlinkedin.com/jobs/view/1')).toBeNull()
    expect(adapterFor('nope')).toBeNull()
  })
})

describe('titleAndCompany', () => {
  it('splits the title of the tab', () => {
    expect(titleAndCompany('Full Stack (Python / React) | Scaleway | LinkedIn')).toEqual({
      title: 'Full Stack (Python / React)',
      companyName: 'Scaleway',
    })
    expect(titleAndCompany('Dev | Part | Acme | LinkedIn')).toEqual({ title: 'Dev | Part', companyName: 'Acme' })
    expect(titleAndCompany('Acme hiring Dev in Rouen | LinkedIn')).toEqual({})
  })
})

describe('readLinkedIn', () => {
  it('reads an offer of the French interface', () => {
    const title = 'Full Stack Software Engineer (Python / React) | Scaleway | LinkedIn'
    const offer = readLinkedIn(parse(fixture('job-fr.html')), snapshot(title, ''), PARIS, NOW)
    expect(offer).toEqual({
      title: 'Full Stack Software Engineer (Python / React)',
      companyName: 'Scaleway',
      location: 'Paris, Île-de-France, France',
      postedOn: '2026-10-12',
      description:
        'OUR STORY:\nJoin Scaleway and shape the sovereign cloud of tomorrow !\n\nSince 1999, we have been designing secure infrastructures.\n\nYOUR MISSION\nBuild things.',
    })
  })

  it('does not take the salary of another offer of the page', () => {
    const title = 'Full Stack Software Engineer (Python / React) | Scaleway | LinkedIn'
    expect(readLinkedIn(parse(fixture('job-fr.html')), snapshot(title, ''), PARIS, NOW).salary).toBeUndefined()
  })

  it('reads an offer of the English interface, with its salary', () => {
    const offer = readLinkedIn(
      parse(fixture('job-en-salary.html')),
      snapshot('Backend Developer | Acme | LinkedIn', ''),
      PARIS,
      NOW
    )
    expect(offer).toMatchObject({
      title: 'Backend Developer',
      companyName: 'Acme',
      location: 'Berlin, Germany',
      postedOn: '2026-09-29',
      description: 'Build & ship.\nDaily.',
      salary: { min: 5_500_000, max: 7_000_000, currency: 'EUR', period: 'year', kind: null },
    })
  })

  it('gives what it can for a page that does not look as expected', () => {
    expect(
      readLinkedIn(parse('<main><p>Nothing</p></main>'), snapshot('Dev | Acme | LinkedIn', ''), PARIS, NOW)
    ).toEqual({
      title: 'Dev',
      companyName: 'Acme',
    })
    expect(readLinkedIn(parse(''), snapshot('Home', ''), PARIS, NOW)).toEqual({})
  })
})

describe('readSnapshot with an adapter', () => {
  it('uses the adapter for a LinkedIn page and keeps the JobPosting data first', () => {
    const title = 'Full Stack Software Engineer (Python / React) | Scaleway | LinkedIn'
    const page = snapshot(title, fixture('job-fr.html'))
    expect(readSnapshot(page, PARIS, NOW)).toMatchObject({ companyName: 'Scaleway', postedOn: '2026-10-12' })

    const withPosting = {
      ...page,
      jsonLd: [JSON.stringify({ '@type': 'JobPosting', title: 'Exact title', datePosted: '2026-01-02' })],
    }
    expect(readSnapshot(withPosting, PARIS, NOW)).toMatchObject({
      title: 'Exact title',
      postedOn: '2026-01-02',
      companyName: 'Scaleway',
    })
  })

  it('ignores a body for a site with no adapter', () => {
    const page = { ...snapshot('Dev | Site', fixture('job-fr.html')), url: 'https://example.com/job' }
    expect(readSnapshot(page, PARIS, NOW)).toEqual({ title: 'Dev' })
  })
})

// The page saved by hand, kept out of the repository: this runs on the machine that has it.
const SAVED = '/home/zairakai/code/datas/pages/linkedin-offre-unique-inspecteur.html'
describe.skipIf(!existsSync(SAVED))('the saved LinkedIn page', () => {
  it('is read as the offer it shows', () => {
    // The iframes of the page would try to load their address.
    const html = readFileSync(SAVED, 'utf8').replace(/<iframe\b[^>]*>(?:[\s\S]*?<\/iframe>)?/g, '')
    const doc = parse(html)
    const offer = readLinkedIn(doc, snapshot(doc.title, ''), PARIS, NOW)
    expect(offer.title).toBe('Full Stack Software Engineer (Python / React)')
    expect(offer.companyName).toBe('Scaleway')
    expect(offer.location).toBe('Paris, Île-de-France, France')
    expect(offer.postedOn).toBe('2026-10-12')
    expect(offer.description?.startsWith('OUR STORY:')).toBe(true)
    // The salaries on this page are the ones of other offers.
    expect(offer.salary).toBeUndefined()
  })
})

describe('Talent.com', () => {
  const page = (changes: Partial<PageSnapshot> = {}): PageSnapshot => ({
    url: 'https://fr.talent.com/view?id=639659608588816513',
    title: "Développeur fullstack IA CDI H/F – ALTEN – Offre d'emploi permanent Bezons, IDF",
    jsonLd: [],
    meta: {
      'og:title': "Développeur fullstack IA CDI H/F – ALTEN – Offre d'emploi permanent Bezons, IDF",
      'og:description':
        'Postulez pour le poste de « Développeur fullstack IA CDI H/F » (permanent). ALTEN recrute (Bezons, IDF). Votre prochaine opportunité',
    },
    ...changes,
  })

  it('knows the pages of an offer, and only those', () => {
    expect(adapterFor('https://fr.talent.com/view?id=1')?.name).toBe('talent')
    expect(adapterFor('https://www.talent.com/view?id=1')?.name).toBe('talent')
    expect(adapterFor('https://fr.talent.com/jobs?k=laravel')).toBeNull()
    expect(adapterFor('https://nottalent.com/view?id=1')).toBeNull()
    // It reads the title and the tags, not the body: the body is not taken.
    expect(adapterFor('https://fr.talent.com/view?id=1')?.needsBody).toBe(false)
    expect(adapterFor('https://www.linkedin.com/jobs/view/1')?.needsBody).toBe(true)
  })

  it('reads the title, the company and the place', () => {
    expect(readTalent(page())).toEqual({
      title: 'Développeur fullstack IA CDI H/F',
      companyName: 'ALTEN',
      location: 'Bezons, IDF',
    })
  })

  it('is used by the reading of a page, with no body, and gives way to JobPosting data', () => {
    expect(readSnapshot(page(), PARIS, NOW)).toMatchObject({
      title: 'Développeur fullstack IA CDI H/F',
      companyName: 'ALTEN',
    })
    const withPosting = page({ jsonLd: [JSON.stringify({ '@type': 'JobPosting', title: 'Exact title' })] })
    expect(readSnapshot(withPosting, PARIS, NOW)).toMatchObject({ title: 'Exact title', companyName: 'ALTEN' })
  })

  it('gives what it can for a page that does not follow the pattern', () => {
    expect(readTalent(page({ title: 'Just a title', meta: {} }))).toEqual({})
    expect(readTalent(page({ meta: { 'og:title': 'A – B' } }))).toEqual({})
    expect(
      readTalent(
        page({ meta: { 'og:title': 'Dev – Acme – Job offer Paris', description: 'Acme is hiring (Paris, FR).' } })
      )
    ).toEqual({
      title: 'Dev',
      companyName: 'Acme',
      location: 'Paris, FR',
    })
  })
})

const SAVED_TALENT = '/home/zairakai/code/datas/pages/talent.html'
describe.skipIf(!existsSync(SAVED_TALENT))('the saved Talent.com page', () => {
  it('is read as the offer it shows', () => {
    const html = readFileSync(SAVED_TALENT, 'utf8').replace(/<iframe\b[^>]*>(?:[\s\S]*?<\/iframe>)?/g, '')
    const doc = parse(html)
    const meta: Record<string, string> = {}
    doc.querySelectorAll('meta[content]').forEach((tag) => {
      const key = tag.getAttribute('property') ?? tag.getAttribute('name')
      if (key) meta[key.toLowerCase()] = tag.getAttribute('content') ?? ''
    })
    const offer = readTalent({ url: 'https://fr.talent.com/view?id=1', title: doc.title, jsonLd: [], meta })
    expect(offer).toMatchObject({
      title: 'Développeur fullstack IA CDI H/F',
      companyName: 'ALTEN',
      location: 'Bezons, IDF',
    })
  })
})

describe('Glassdoor', () => {
  const html = readFileSync('tests/fixtures/glassdoor/job-fr.html', 'utf8')

  it('is the adapter of every Glassdoor site, and of no other', () => {
    expect(adapterFor('https://www.glassdoor.fr/Emploi/emplois.htm')?.name).toBe('glassdoor')
    expect(adapterFor('https://www.glassdoor.com/Job/jobs.htm')?.name).toBe('glassdoor')
    expect(adapterFor('https://www.glassdoor.co.uk/Job/x')?.name).toBe('glassdoor')
    expect(adapterFor('https://notglassdoor.fr/Job/x')).toBeNull()
  })

  it('reads the offer that is open: title, company, place, pay range and description', async () => {
    const { readGlassdoor } = await import('../../src/extraction/adapters/glassdoor')
    const offer = readGlassdoor(parse(html))
    expect(offer).toMatchObject({
      title: 'Backend Developer (PHP)',
      companyName: 'Example Corp',
      location: 'Lyon',
      salary: { min: 4_200_000, max: 9_200_000, currency: 'EUR', period: null, kind: null },
    })
    expect(offer.description).toContain('Join the team.')
    expect(offer.description).toContain('PHP')
  })

  it('says nothing for a list of offers, where no offer is open', async () => {
    const { readGlassdoor } = await import('../../src/extraction/adapters/glassdoor')
    expect(readGlassdoor(parse('<body><li data-jobid="1">An offer</li></body>'))).toEqual({})
  })
})
