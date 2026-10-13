import type { Application } from '../models'
import { type Conversion, type Salary, comparableSalary } from '../utils/money'
import { collatorFor, fold, searchWords } from '../utils/text'

export const SORTS = ['manual', 'recent', 'created', 'salary', 'priority', 'company', 'title'] as const
export const DIRECTIONS = ['asc', 'desc'] as const

export type Sort = (typeof SORTS)[number]
export type SortDirection = (typeof DIRECTIONS)[number]

// What the user chose to see on the board, and in which order.
export interface BoardView {
  search: string
  // The tags an application must all have.
  tagIds: string[]
  favoritesOnly: boolean
  sourceId: string
  companyId: string
  // The lowest priority shown: 0 is every one.
  minPriority: number
  // Only the applications that have a reminder that is not done and is late.
  remindersDue: boolean
  showArchived: boolean
  sort: Sort
  direction: SortDirection
}

// The direction a sort starts with when it is chosen: what a person wants first. The newest, the most important and the
// best paid first; a name from A to Z.
export const DEFAULT_DIRECTION: Record<Sort, SortDirection> = {
  manual: 'asc',
  recent: 'desc',
  created: 'desc',
  salary: 'desc',
  priority: 'desc',
  company: 'asc',
  title: 'asc',
}

export const DEFAULT_VIEW: BoardView = {
  search: '',
  tagIds: [],
  favoritesOnly: false,
  sourceId: '',
  companyId: '',
  minPriority: 0,
  remindersDue: false,
  showArchived: false,
  sort: 'manual',
  direction: 'asc',
}

// What was stored, with the defaults for what is missing or not allowed.
export function normalizeView(stored: unknown): BoardView {
  const source = 'object' === typeof stored && null !== stored ? (stored as Record<string, unknown>) : {}
  const text = (key: keyof BoardView) => ('string' === typeof source[key] ? (source[key] as string) : '')
  return {
    search: text('search'),
    tagIds: Array.isArray(source.tagIds) ? source.tagIds.filter((id): id is string => 'string' === typeof id) : [],
    favoritesOnly: true === source.favoritesOnly,
    sourceId: text('sourceId'),
    companyId: text('companyId'),
    minPriority: [0, 1, 2, 3].includes(source.minPriority as number) ? (source.minPriority as number) : 0,
    remindersDue: true === source.remindersDue,
    showArchived: true === source.showArchived,
    sort: (SORTS as readonly unknown[]).includes(source.sort) ? (source.sort as Sort) : 'manual',
    direction: (DIRECTIONS as readonly unknown[]).includes(source.direction)
      ? (source.direction as SortDirection)
      : 'asc',
  }
}

// How many filters are on: what is shown is narrowed by each of them. The sort and the archive switch are not filters.
export function activeFilters(view: BoardView): number {
  return [
    '' !== view.search.trim(),
    0 < view.tagIds.length,
    view.favoritesOnly,
    '' !== view.sourceId,
    '' !== view.companyId,
    0 < view.minPriority,
    view.remindersDue,
  ].filter(Boolean).length
}

export { fold }

// Everything a search can find in an application: the offer, the company, the place, the source, the tags and the people.
export function searchableText(application: Application, related: (companyId: string) => string[] = () => []): string {
  const offer = application.jobOffer
  return fold(
    [
      offer?.title,
      offer?.company?.name,
      ...(offer?.company ? related(offer.company.id) : []),
      offer?.location,
      offer?.source?.label,
      ...(application.tags ?? []).map((tag) => tag.name),
      ...(application.contacts ?? []).map((contact) => `${contact.firstName} ${contact.lastName}`),
    ]
      .filter(Boolean)
      .join(' ')
  )
}

export interface QueryContext {
  // The current moment, for the reminders that are late.
  now: Date
  locale: string
  conversion: Conversion
  // The names of the companies a company is tied to (its final clients, its parent…), found by the search.
  related?: (companyId: string) => string[]
}

const isLate = (application: Application, now: Date): boolean =>
  (application.reminders ?? []).some((reminder) => !reminder.doneAt && new Date(reminder.dueAt) < now)

export function filterApplications(applications: Application[], view: BoardView, context: QueryContext): Application[] {
  const words = searchWords(view.search, context.locale)
  return applications.filter((application) => {
    if (application.archived !== view.showArchived) {
      return false
    }
    if (view.favoritesOnly && !application.isFavorite) {
      return false
    }
    if (application.priority < view.minPriority) {
      return false
    }
    if ('' !== view.sourceId && application.jobOffer?.sourceId !== view.sourceId) {
      return false
    }
    if ('' !== view.companyId && application.jobOffer?.companyId !== view.companyId) {
      return false
    }
    if (view.remindersDue && !isLate(application, context.now)) {
      return false
    }
    if (0 < view.tagIds.length) {
      const ids = new Set((application.tags ?? []).map((tag) => tag.id))
      if (!view.tagIds.every((id) => ids.has(id))) {
        return false
      }
    }
    if (0 < words.length) {
      const text = searchableText(application, context.related)
      return words.every((word) => text.includes(word))
    }
    return true
  })
}

const salaryOf = (application: Application): Salary | null => {
  const offer = application.jobOffer
  return offer
    ? {
        min: offer.salaryMin ?? null,
        max: offer.salaryMax ?? null,
        currency: offer.salaryCurrency ?? null,
        period: offer.salaryPeriod ?? null,
        kind: offer.salaryKind ?? null,
      }
    : null
}

// The applications in the order chosen. The sort is stable and a tie falls back on the most recent. An application with
// nothing to sort by (no salary, or one that cannot be compared) goes last, whichever the direction.
export function sortApplications(applications: Application[], view: BoardView, context: QueryContext): Application[] {
  const collator = collatorFor(context.locale)
  const sign = 'asc' === view.direction ? 1 : -1
  const recent = (a: Application, b: Application) => b.updatedAt.localeCompare(a.updatedAt)

  const compare = (a: Application, b: Application): number => {
    switch (view.sort) {
      case 'manual':
        return a.position - b.position
      case 'recent':
        return sign * a.updatedAt.localeCompare(b.updatedAt)
      case 'created':
        return sign * a.createdAt.localeCompare(b.createdAt)
      case 'priority':
        return sign * (a.priority - b.priority) || recent(a, b)
      case 'company':
        return sign * collator.compare(a.jobOffer?.company?.name ?? '', b.jobOffer?.company?.name ?? '') || recent(a, b)
      case 'title':
        return sign * collator.compare(a.jobOffer?.title ?? '', b.jobOffer?.title ?? '') || recent(a, b)
      case 'salary': {
        const left = salaryOf(a)
        const right = salaryOf(b)
        const x = left ? comparableSalary(left, context.conversion) : null
        const y = right ? comparableSalary(right, context.conversion) : null
        if (null === x || null === y) {
          return null === x && null === y ? recent(a, b) : null === x ? 1 : -1
        }
        return sign * (x - y) || recent(a, b)
      }
    }
  }

  return [...applications].sort(compare)
}

// Filtered, then sorted.
export function queryApplications(applications: Application[], view: BoardView, context: QueryContext): Application[] {
  return sortApplications(filterApplications(applications, view, context), view, context)
}
