import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS, Trash } from '../models'
import { canonicalJson } from '../utils/checksum'
import { readExport } from './data'

type Json = Record<string, unknown>

// Where the id of a default column or source is stored in other records. The defaults get the same key on every install, so
// they are matched by their key and the records that point to them follow.
const STATUS_REFERENCES: Record<string, string[]> = {
  applications: ['statusId'],
  activities: ['fromStatusId', 'toStatusId'],
}
const SOURCE_REFERENCES: Record<string, string[]> = { jobOffers: ['sourceId'] }

// What a merge does to one kind of data.
export interface MergeDiff {
  entity: string
  // In the other computer's file.
  incoming: number
  // Not stored here: added.
  added: number
  // Stored here, and changed more recently in the file: replaced by it.
  updated: number
  // Stored here and different, but this one is the most recent (or the file does not say): kept as it is.
  kept: number
  // The same on both sides.
  same: number
  // Deleted here (it is in the trash): not brought back.
  deleted: number
  // A default column or source that already exists here under the same key: matched, not doubled.
  matched: number
}

export interface MergePlan {
  schema: number
  outdated: boolean
  exportedAt: string | null
  models: MergeDiff[]
  // Records added that look like one already stored here under another id (same name, same address…): possible duplicates.
  duplicates: { companies: number; contacts: number; jobOffers: number }
}

interface Computed {
  plan: MergePlan
  save: Map<string, Json[]>
}

const norm = (value: unknown): string => ('string' === typeof value ? value.trim().toLowerCase() : '')
const stamp = (record: Json): string | null => ('string' === typeof record.updatedAt ? record.updatedAt : null)

function compute(file: unknown, pinia?: Pinia): Computed {
  const { data, exportedAt, fromSchema, schema } = readExport(file)
  const stored = (entity: string): Json[] => {
    const model = MODELS.find((candidate) => candidate.entity === entity)
    return model
      ? useRepo(model, pinia)
          .all()
          .map((record) => JSON.parse(JSON.stringify(record.$toJson())) as Json)
      : []
  }

  // The ids of the other computer's default columns and sources, replaced by the ones stored here under the same key.
  const remap = new Map<string, string>()
  for (const entity of ['statuses', 'sources']) {
    const keys = new Map(stored(entity).map((record) => [String(record.key), String(record.id)]))
    for (const record of (data[entity] ?? []) as Json[]) {
      const local = keys.get(String(record.key))
      if (undefined !== local && local !== String(record.id) && '' !== String(record.key)) {
        remap.set(String(record.id), local)
      }
    }
  }
  const references: Record<string, string[]> = { ...STATUS_REFERENCES }
  for (const [entity, fields] of Object.entries(SOURCE_REFERENCES)) {
    references[entity] = [...(references[entity] ?? []), ...fields]
  }

  const trashed = new Set(stored('trash').map((entry) => `${String(entry.entity)}:${String(entry.recordId)}`))
  const save = new Map<string, Json[]>()
  const duplicates = { companies: 0, contacts: 0, jobOffers: 0 }

  const models = MODELS.filter((model) => Trash !== model).map((model): MergeDiff => {
    const entity = model.entity
    const local = new Map(stored(entity).map((record) => [String(record.id), record]))
    const diff: MergeDiff = { entity, incoming: 0, added: 0, updated: 0, kept: 0, same: 0, deleted: 0, matched: 0 }
    const out: Json[] = []
    const repo = useRepo(model, pinia)
    for (const raw of (data[entity] ?? []) as Json[]) {
      diff.incoming++
      if (remap.has(String(raw.id))) {
        diff.matched++
        continue
      }
      // Read like a stored record (the fields an older file lacks get their defaults), with the references brought here.
      const record = JSON.parse(
        JSON.stringify((repo.make(raw as never) as unknown as { $toJson: () => Json }).$toJson())
      ) as Json
      for (const field of references[entity] ?? []) {
        const target = remap.get(String(record[field]))
        if (undefined !== target) {
          record[field] = target
        }
      }
      const id = String(record.id)
      if (trashed.has(`${entity}:${id}`)) {
        diff.deleted++
        continue
      }
      const before = local.get(id)
      if (undefined === before) {
        diff.added++
        out.push(record)
        continue
      }
      const fields = Object.fromEntries(Object.entries(record).filter(([key]) => key in before))
      if (canonicalJson(before) === canonicalJson(fields)) {
        diff.same++
      } else if (null !== stamp(record) && (null === stamp(before) || (stamp(record) ?? '') > (stamp(before) ?? ''))) {
        diff.updated++
        out.push(record)
      } else {
        diff.kept++
      }
    }
    // Possible duplicates among what is added: same name (company), same name (contact), same address (offer).
    const key = (candidate: Json): string =>
      'companies' === entity
        ? norm(candidate.name)
        : 'contacts' === entity
          ? `${norm(candidate.firstName)} ${norm(candidate.lastName)}`.trim()
          : norm(candidate.url)
    if (['companies', 'contacts', 'jobOffers'].includes(entity)) {
      const names = new Set([...local.values()].map(key).filter(Boolean))
      duplicates[entity as keyof typeof duplicates] += out.filter(
        (record) => !local.has(String(record.id)) && names.has(key(record))
      ).length
    }
    save.set(entity, out)
    return diff
  })

  return {
    plan: {
      schema: fromSchema,
      outdated: schema > fromSchema,
      exportedAt: 'string' === typeof exportedAt ? exportedAt : null,
      models,
      duplicates,
    },
    save,
  }
}

/**
 * What bringing the data of another computer together with this one would do, before anything is applied. Nothing is
 * written. It never deletes: a record missing from one side is not a deletion, and what was deleted here stays deleted.
 */
export function planMerge(file: unknown, pinia?: Pinia): MergePlan {
  return compute(file, pinia).plan
}

// Applies the merge: adds the records that are not here, and replaces those the file changed more recently. Throws, and
// changes nothing, when the file is not an export. Returns what was done.
export function mergeData(file: unknown, pinia?: Pinia): MergePlan {
  const { plan, save } = compute(file, pinia)
  for (const model of MODELS) {
    const records = save.get(model.entity) ?? []
    if (0 < records.length) {
      useRepo(model, pinia).save(records as never[])
    }
  }
  return plan
}
