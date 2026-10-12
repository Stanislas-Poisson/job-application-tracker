import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Company, JobOffer } from '../../src/models'
import { addContact, addReminder, captureOffer, setReminderDone } from '../../src/services/applications'
import {
  type BoardView,
  DEFAULT_DIRECTION,
  DEFAULT_VIEW,
  activeFilters,
  fold,
  normalizeView,
  queryApplications,
} from '../../src/services/boardQuery'
import { createTag, setPriority, tagEntity, toggleFavorite } from '../../src/services/tags'
import { DEFAULT_ASSUMPTIONS } from '../../src/utils/money'
import { freshStore } from './helpers'

const NOW = new Date('2026-10-12T12:00:00Z')
const context = (conversion: Partial<{ home: string; rates: Record<string, number> }> = {}) => ({
  now: NOW,
  locale: 'en',
  conversion: { home: '', rates: {}, assumptions: DEFAULT_ASSUMPTIONS, ...conversion },
})

const all = () =>
  useRepo(Application)
    .with('jobOffer', (query) => query.with('company').with('source'))
    .with('tags')
    .with('contacts')
    .with('reminders')
    .get()

const view = (overrides: Partial<BoardView> = {}): BoardView => ({ ...DEFAULT_VIEW, ...overrides })
const titles = (list: Application[]) => list.map((application) => application.jobOffer?.title)
const run = (overrides: Partial<BoardView>, conversion = {}) =>
  titles(queryApplications(all(), view(overrides), context(conversion)))

describe('searching', () => {
  it('folds the case, the accents and the spaces', () => {
    expect(fold('  Éléonore   DUPUIS ')).toBe('eleonore dupuis')
    expect(fold('Straße')).toBe('straße')
  })

  describe('on the board', () => {
    beforeEach(() => {
      freshStore()
      captureOffer({
        title: 'Backend developer',
        companyName: 'Acme',
        url: 'https://www.linkedin.com/jobs/1',
        location: 'Paris',
      })
      captureOffer({ title: 'Ingénieur données', companyName: 'Émilie & Fils', location: 'Lyon' })
      captureOffer({ title: 'Frontend developer', companyName: 'Globex', location: 'Remote' })
    })

    it('finds by the title, the company, the place and the source, whatever the case and the accents', () => {
      expect(run({ search: 'BACKEND' })).toEqual(['Backend developer'])
      expect(run({ search: 'emilie' })).toEqual(['Ingénieur données'])
      expect(run({ search: 'ingenieur donnees' })).toEqual(['Ingénieur données'])
      expect(run({ search: 'paris' })).toEqual(['Backend developer'])
      expect(run({ search: 'linkedin' })).toEqual(['Backend developer'])
    })

    it('wants every word, in any order', () => {
      expect(run({ search: 'developer globex' })).toEqual(['Frontend developer'])
      expect(run({ search: 'developer nothing' })).toEqual([])
    })

    it('finds by the tags and by the people', () => {
      const application = all().find((entry) => 'Globex' === entry.jobOffer?.company?.name)
      const tag = createTag('startup')
      tagEntity('applications', application?.id ?? '', tag.id)
      addContact(application?.id ?? '', { firstName: 'Grace', lastName: 'Hopper' })

      expect(run({ search: 'startup' })).toEqual(['Frontend developer'])
      expect(run({ search: 'hopper' })).toEqual(['Frontend developer'])
    })
  })
})

describe('filtering', () => {
  let ids: Record<string, string>

  beforeEach(() => {
    freshStore()
    ids = {
      a: captureOffer({ title: 'A', companyName: 'Acme', url: 'https://www.linkedin.com/jobs/1' }).id,
      b: captureOffer({ title: 'B', companyName: 'Globex', url: 'https://www.indeed.com/viewjob' }).id,
      c: captureOffer({ title: 'C', companyName: 'Acme' }).id,
    }
  })

  it('shows everything that is not archived by default, and the archived when asked', () => {
    useRepo(Application)
      .where('id', ids.c ?? '')
      .update({ archived: true })

    expect(run({}).sort()).toEqual(['A', 'B'])
    expect(run({ showArchived: true })).toEqual(['C'])
  })

  it('keeps the favourites', () => {
    toggleFavorite('applications', ids.b ?? '')

    expect(run({ favoritesOnly: true })).toEqual(['B'])
  })

  it('keeps the applications that have every tag asked', () => {
    const remote = createTag('remote')
    const urgent = createTag('urgent')
    tagEntity('applications', ids.a ?? '', remote.id)
    tagEntity('applications', ids.a ?? '', urgent.id)
    tagEntity('applications', ids.b ?? '', remote.id)

    expect(run({ tagIds: [remote.id] }).sort()).toEqual(['A', 'B'])
    expect(run({ tagIds: [remote.id, urgent.id] })).toEqual(['A'])
    expect(run({ tagIds: ['nope'] })).toEqual([])
  })

  it('keeps one source, one company and a lowest priority', () => {
    const linkedin = all().find((entry) => 'A' === entry.jobOffer?.title)?.jobOffer?.sourceId ?? ''
    const globex =
      useRepo(Company)
        .all()
        .find((company) => 'Globex' === company.name)?.id ?? ''
    setPriority(ids.a ?? '', 3)
    setPriority(ids.b ?? '', 1)

    expect(run({ sourceId: linkedin })).toEqual(['A'])
    expect(run({ companyId: globex })).toEqual(['B'])
    expect(run({ minPriority: 2 })).toEqual(['A'])
    expect(run({ minPriority: 1 }).sort()).toEqual(['A', 'B'])
  })

  it('keeps the applications that have a reminder that is late and not done', () => {
    addReminder(ids.a ?? '', 'Follow up', '2026-10-01T09:00:00.000Z')
    addReminder(ids.b ?? '', 'Later', '2026-11-01T09:00:00.000Z')
    // A late reminder that was done does not count.
    setReminderDone(addReminder(ids.c ?? '', 'Done', '2026-10-01T09:00:00.000Z').id, true)

    expect(run({ remindersDue: true })).toEqual(['A'])
  })

  it('combines the filters', () => {
    toggleFavorite('applications', ids.a ?? '')
    toggleFavorite('applications', ids.b ?? '')
    setPriority(ids.b ?? '', 3)

    expect(run({ favoritesOnly: true, minPriority: 2 })).toEqual(['B'])
  })

  it('counts the filters that are on, and not the sort or the archive switch', () => {
    expect(activeFilters(DEFAULT_VIEW)).toBe(0)
    expect(activeFilters(view({ search: ' ', sort: 'title', showArchived: true }))).toBe(0)
    expect(activeFilters(view({ search: 'x', favoritesOnly: true, tagIds: ['t'], minPriority: 2 }))).toBe(4)
  })
})

describe('sorting', () => {
  beforeEach(() => {
    freshStore()
  })

  const touch = (title: string, updatedAt: string, createdAt = updatedAt) => {
    const application = all().find((entry) => entry.jobOffer?.title === title)
    useRepo(Application)
      .where('id', application?.id ?? '')
      .update({ updatedAt, createdAt })
  }

  it('keeps the order of the board for the manual sort', () => {
    captureOffer({ title: 'First', companyName: 'Acme' })
    captureOffer({ title: 'Second', companyName: 'Acme' })

    expect(run({ sort: 'manual' })).toEqual(['First', 'Second'])
  })

  it('puts the most recent first, or last', () => {
    captureOffer({ title: 'Old', companyName: 'Acme' })
    captureOffer({ title: 'New', companyName: 'Acme' })
    touch('Old', '2026-01-01T00:00:00.000Z')
    touch('New', '2026-06-01T00:00:00.000Z')

    expect(run({ sort: 'recent', direction: 'desc' })).toEqual(['New', 'Old'])
    expect(run({ sort: 'recent', direction: 'asc' })).toEqual(['Old', 'New'])
  })

  it('sorts by the date of creation', () => {
    captureOffer({ title: 'X', companyName: 'Acme' })
    captureOffer({ title: 'Y', companyName: 'Acme' })
    touch('X', '2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    touch('Y', '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')

    expect(run({ sort: 'created', direction: 'desc' })).toEqual(['Y', 'X'])
  })

  it('sorts by priority, and the most recent first among equals', () => {
    captureOffer({ title: 'Low', companyName: 'Acme' })
    captureOffer({ title: 'High old', companyName: 'Acme' })
    captureOffer({ title: 'High new', companyName: 'Acme' })
    for (const [title, priority] of [
      ['Low', 1],
      ['High old', 3],
      ['High new', 3],
    ] as const) {
      setPriority(all().find((entry) => entry.jobOffer?.title === title)?.id ?? '', priority)
    }
    touch('High old', '2026-01-01T00:00:00.000Z')
    touch('High new', '2026-06-01T00:00:00.000Z')

    expect(run({ sort: 'priority', direction: 'desc' })).toEqual(['High new', 'High old', 'Low'])
  })

  it('sorts the names the way the language does, with the accents and the numbers', () => {
    captureOffer({ title: 'Dev 10', companyName: 'Zoe' })
    captureOffer({ title: 'Dev 2', companyName: 'Émile' })
    captureOffer({ title: 'Dev 1', companyName: 'Adam' })

    expect(run({ sort: 'title', direction: 'asc' })).toEqual(['Dev 1', 'Dev 2', 'Dev 10'])
    expect(run({ sort: 'company', direction: 'asc' })).toEqual(['Dev 1', 'Dev 2', 'Dev 10'])
    expect(run({ sort: 'company', direction: 'desc' })).toEqual(['Dev 10', 'Dev 2', 'Dev 1'])
  })

  it('sorts by the salary per year in the home currency, and puts what cannot be compared last either way', () => {
    const offers = [
      ['Cheap', { min: 3_000_000, currency: 'EUR', period: 'year' }],
      ['Rich', { min: 500_000, currency: 'USD', period: 'month' }],
      ['Daily', { min: 40_000, currency: 'EUR', period: 'day' }],
      ['Unknown', {}],
      ['No rate', { min: 100_000, currency: 'CHF', period: 'month' }],
    ] as const
    for (const [title] of offers) {
      captureOffer({ title, companyName: 'Acme' })
    }
    for (const [title, salary] of offers) {
      const offer = all().find((entry) => entry.jobOffer?.title === title)?.jobOffer
      useRepo(JobOffer)
        .where('id', offer?.id ?? '')
        .update(
          'min' in salary ? { salaryMin: salary.min, salaryCurrency: salary.currency, salaryPeriod: salary.period } : {}
        )
    }
    const conversion = { home: 'EUR', rates: { USD: 0.9 } }

    // Rich: 5 000 USD a month is 60 000 USD a year, 54 000 EUR. Daily: 400 EUR x 220 = 88 000 EUR. Cheap: 30 000 EUR.
    expect(run({ sort: 'salary', direction: 'desc' }, conversion).slice(0, 3)).toEqual(['Daily', 'Rich', 'Cheap'])
    expect(run({ sort: 'salary', direction: 'asc' }, conversion).slice(0, 3)).toEqual(['Cheap', 'Rich', 'Daily'])
    expect(run({ sort: 'salary', direction: 'desc' }, conversion).slice(3).sort()).toEqual(['No rate', 'Unknown'])
    expect(run({ sort: 'salary', direction: 'asc' }, conversion).slice(3).sort()).toEqual(['No rate', 'Unknown'])
  })

  it('starts each sort in the direction a person wants first', () => {
    expect(DEFAULT_DIRECTION.recent).toBe('desc')
    expect(DEFAULT_DIRECTION.salary).toBe('desc')
    expect(DEFAULT_DIRECTION.title).toBe('asc')
  })
})

describe('the saved view', () => {
  it('has the defaults for nothing', () => {
    expect(normalizeView(undefined)).toEqual(DEFAULT_VIEW)
    expect(normalizeView('x')).toEqual(DEFAULT_VIEW)
  })

  it('keeps what is valid and drops the rest', () => {
    expect(
      normalizeView({
        search: 'abc',
        tagIds: ['a', 3, 'b'],
        favoritesOnly: true,
        minPriority: 2,
        sort: 'title',
        direction: 'desc',
      })
    ).toMatchObject({
      search: 'abc',
      tagIds: ['a', 'b'],
      favoritesOnly: true,
      minPriority: 2,
      sort: 'title',
      direction: 'desc',
    })
    expect(normalizeView({ sort: 'random', direction: 'up', minPriority: 9, favoritesOnly: 'yes' })).toMatchObject({
      sort: 'manual',
      direction: 'asc',
      minPriority: 0,
      favoritesOnly: false,
    })
  })
})
