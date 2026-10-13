import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { JobOffer, MODELS, Trash } from '../models'

// What is shown first for records deleted together: the application before its notes.
const MAIN_FIRST = ['applications', 'contacts', 'companies', 'jobOffers', 'interactions', 'tags', 'statuses']

export interface TrashGroup {
  batch: string
  deletedAt: string
  // The record that tells what was deleted, and how many others went with it.
  entity: string
  label: string
  related: number
  ids: string[]
}

type Json = Record<string, unknown>

const text = (value: unknown): string => ('string' === typeof value ? value.trim() : '')

// A few words that tell a deleted record, from its fields. An application has none of its own: it is its offer.
function describe(entity: string, record: Json, pinia?: Pinia): string {
  if ('applications' === entity) {
    const offer = useRepo(JobOffer, pinia).find(text(record.jobOfferId))
    if (offer) {
      return offer.title
    }
  }
  const name = [record.firstName, record.lastName].map(text).filter(Boolean).join(' ')
  return (
    [record.title, record.name, record.label, record.subject, name, record.value, record.text, record.key]
      .map(text)
      .find((candidate) => '' !== candidate)
      ?.slice(0, 80) ?? ''
  )
}

// The deleted records, grouped by the moment they were deleted together, the latest first.
export function listTrash(pinia?: Pinia): TrashGroup[] {
  const groups = new Map<string, Trash[]>()
  for (const entry of useRepo(Trash, pinia).all()) {
    groups.set(entry.batch, [...(groups.get(entry.batch) ?? []), entry])
  }
  return [...groups.entries()]
    .map(([batch, entries]) => {
      const rank = (entry: Trash) => {
        const index = MAIN_FIRST.indexOf(entry.entity)
        return -1 === index ? MAIN_FIRST.length : index
      }
      const main = [...entries].sort((a, b) => rank(a) - rank(b))[0] as Trash
      return {
        batch,
        deletedAt: main.deletedAt,
        entity: main.entity,
        label: describe(main.entity, main.record, pinia),
        related: entries.length - 1,
        ids: entries.map((entry) => entry.id),
      }
    })
    .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
}

/**
 * Puts back the records deleted together, as they were, and takes them out of the trash. Their moment of last change
 * is the moment they come back. Returns how many records came back.
 */
export function restoreFromTrash(batch: string, pinia?: Pinia): number {
  const trash = useRepo(Trash, pinia)
  const entries = trash.all().filter((entry) => entry.batch === batch)
  for (const entry of entries) {
    const model = MODELS.find((candidate) => candidate.entity === entry.entity)
    if (model) {
      const { updatedAt: _old, ...record } = entry.record
      useRepo(model, pinia).save(record as never)
    }
    trash.destroy(entry.id)
  }
  return entries.length
}

export function emptyTrash(pinia?: Pinia) {
  useRepo(Trash, pinia).flush()
}
