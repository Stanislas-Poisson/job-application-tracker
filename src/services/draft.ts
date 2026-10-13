import type { StorageAdapter } from '../persistence/adapter'

// What was typed in the popup and not saved. A popup closes on a click elsewhere and cannot warn: it keeps a draft and gives
// it back the next time it is opened on the same page. A draft of another page is not given back, so that two offers are
// never mixed, and an old draft is dropped.
export const DRAFT_KEY = 'jat:draft'
export const DRAFT_DAYS = 7

export interface Draft {
  url: string
  title: string
  company: string
  location: string
  note: string
  statusKey: string
  savedAt: string
}

const text = (value: unknown): string => ('string' === typeof value ? value : '')

// A draft read from the storage: anything that is not a draft is no draft.
export function normalizeDraft(value: unknown): Draft | null {
  const source = value as Record<string, unknown> | null
  if ('object' !== typeof source || null === source || 'string' !== typeof source.savedAt) {
    return null
  }
  return {
    url: text(source.url),
    title: text(source.title),
    company: text(source.company),
    location: text(source.location),
    note: text(source.note),
    statusKey: text(source.statusKey),
    savedAt: source.savedAt,
  }
}

// The draft for that page, when there is one that is recent enough.
export function draftFor(draft: Draft | null, url: string, now: Date = new Date()): Draft | null {
  const found = draft?.url === url ? draft : null
  if (null === found) {
    return null
  }
  const age = now.getTime() - Date.parse(found.savedAt)
  return Number.isNaN(age) || age > DRAFT_DAYS * 86_400_000 ? null : found
}

export async function loadDraft(adapter: StorageAdapter): Promise<Draft | null> {
  return normalizeDraft((await adapter.get([DRAFT_KEY]))[DRAFT_KEY])
}

export async function saveDraft(adapter: StorageAdapter, draft: Omit<Draft, 'savedAt'>, now: Date = new Date()) {
  await adapter.set({ [DRAFT_KEY]: { ...draft, savedAt: now.toISOString() } })
}

export async function clearDraft(adapter: StorageAdapter) {
  await adapter.clear([DRAFT_KEY])
}
