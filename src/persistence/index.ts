import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS, Trash } from '../models'
import { seedDefaults } from '../services/seed'
import type { StorageAdapter } from './adapter'
import { type Snapshot, changesBetween, merge3, recordsOf, sameSnapshot, snapshotOf } from './merge'
import { type RawData, SCHEMA_KEY, SCHEMA_VERSION, migrate } from './schema'

export { SCHEMA_KEY, SCHEMA_VERSION } from './schema'

const PREFIX = 'jat:'

export const keyOf = (entity: string) => `${PREFIX}${entity}`
export const ALL_KEYS = [SCHEMA_KEY, ...MODELS.map((model) => keyOf(model.entity))]

// How long a deleted record stays in the trash.
export const TRASH_DAYS = 30

// A record as text, in the same order of keys, without the moment of its last change: two records are the same when
// only that differs.
export function withoutStamp(record: Record<string, unknown>): string {
  const { updatedAt: _stamp, ...rest } = record
  return JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([a], [b]) => (a < b ? -1 : 1))))
}

export interface Persistence {
  // Resolves when the data is loaded into the store.
  ready: Promise<void>
  // Set when the storage holds data of a newer structure than this version knows: nothing is loaded and nothing is
  // written, so that the data is left as it is. Known once `ready` has resolved.
  readonly newer: boolean
  // The last things the persistence did (what it wrote, what it read, and whether it kept it), for finding out why two
  // pages ended up with different data. It holds counts and short fingerprints, none of the data.
  readonly events: readonly string[]
  // Writes at once what was changed and not saved yet.
  flush(): Promise<void>
  // Runs a change that must leave nothing behind, and saves it at once: what it removes does not go to the trash.
  forget(change: () => void): Promise<void>
  stop(): void
}

export interface PersistenceOptions {
  // How long to wait for more changes before writing. 0 (the default) writes at the end of the current turn of the event
  // loop: what one action changes goes out in one write, and nothing waits on a timer that a closing page could cut short.
  delay?: number
  // The moment it is now, for the tests.
  now?: () => Date
}

/**
 * Keeps the Pinia ORM store and the storage the same, in both ways.
 *
 * An extension has several pages (popup, options, board), each with its own store, all writing to one storage. A page does
 * not replace what the storage holds by its own copy, which may be behind: that would erase what another page wrote and this
 * one did not see yet. It brings its changes to what the storage holds **now**, record by record (see merge3), and takes in
 * what the other pages did.
 *
 *   base    what this page and the storage last agreed on;
 *   mine    the store of this page;
 *   theirs  what the storage holds when this page reads it.
 *
 * Writing and reading happen one after the other in a queue, so that two of them never overlap in a page.
 *
 * On the way out it also keeps two things that the rest of the code does not have to think about: the moment each record
 * last changed (`updatedAt`), and a copy of each record that was removed, in the trash.
 */
export function createPersistence(
  pinia: Pinia,
  adapter: StorageAdapter,
  { delay = 0, now = () => new Date() }: PersistenceOptions = {}
): Persistence {
  type Model = (typeof MODELS)[number]
  const empty: Snapshot = new Map()

  // The state each kind of data was in when this page last agreed with the storage.
  const base = new Map<string, Snapshot>()
  // The last things this page wrote, by kind of data. The storage tells the page about each of its writes after the fact,
  // and the echo of an older write can come back when the page has written again: it is still the page's own.
  const written = new Map<string, string[]>()
  const WRITTEN_KEPT = 20
  let timer: ReturnType<typeof setTimeout> | undefined
  let loading = false
  let newer = false
  const events: string[] = []
  const note = (message: string) => {
    events.push(`${String(Date.now() % 1_000_000)} ${message}`)
    if (80 < events.length) {
      events.shift()
    }
  }
  // A short fingerprint of a state, to tell two apart in the journal and to recognise a write of this page.
  const fingerprint = (snapshot: Snapshot): string => {
    const text = [...snapshot.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, entry]) => entry.json)
      .join('|')
    let hash = 0
    for (let index = 0; index < text.length; index++) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0
    }
    return `${String(snapshot.size)}:${(hash >>> 0).toString(16)}`
  }
  // What differs between two states of the applications that matters to the journal: the favourites and the priorities.
  const digest = (entity: string, snapshot: Snapshot) =>
    'applications' === entity
      ? recordsOf(snapshot)
          .map((record) => `${String(record.priority)}${record.isFavorite ? 'F' : ''}`)
          .join(',')
      : ''

  const repoOf = (model: Model) => useRepo(model, pinia)
  // The store of this page as a state to compare.
  const local = (model: Model): Snapshot =>
    snapshotOf(
      repoOf(model)
        .all()
        .map((record) => JSON.parse(JSON.stringify(record.$toJson())) as Record<string, unknown>)
    )
  const baseOf = (model: Model): Snapshot => base.get(model.entity) ?? empty
  const dirty = (model: Model) => !sameSnapshot(local(model), baseOf(model))

  // Makes the store of this page hold `to` instead of `from`, touching only the records that differ.
  const apply = (model: Model, from: Snapshot, to: Snapshot) => {
    const { put, remove } = changesBetween(from, to)
    if (0 === put.length && 0 === remove.length) {
      return
    }
    loading = true
    try {
      if (0 < put.length) {
        repoOf(model).insert(put as never[])
      }
      if (0 < remove.length) {
        repoOf(model).destroy(remove as never)
      }
    } finally {
      loading = false
    }
  }

  const readSnapshot = (stored: Record<string, unknown>, model: Model): Snapshot =>
    snapshotOf((stored[keyOf(model.entity)] as Record<string, unknown>[] | undefined) ?? [])

  // The data as it is stored, brought up to the current structure when it was written by an older one. Nothing is
  // written here: the save that follows writes it, with the new version.
  const loadAll = async () => {
    const stored = await adapter.get(ALL_KEYS)
    const version = stored[SCHEMA_KEY]
    const raw: RawData = {}
    for (const model of MODELS) {
      raw[model.entity] = (stored[keyOf(model.entity)] as Record<string, unknown>[] | undefined) ?? []
    }
    if (undefined !== version && 'number' === typeof version && SCHEMA_VERSION < version) {
      newer = true
      return
    }
    // Data with no version is data of version 1, written before the version was kept with it.
    const ready = migrate(raw, undefined === version ? 1 : version)
    loading = true
    try {
      for (const model of MODELS) {
        repoOf(model).fresh((ready[model.entity] ?? []) as never[])
        // Nothing is agreed with the storage yet when the structure changed: the save writes everything once.
        base.set(model.entity, version === SCHEMA_VERSION ? local(model) : empty)
      }
    } finally {
      loading = false
    }
  }

  // Looks at what changed in a kind of data since the last agreement: the records removed go to the trash, and the records
  // that changed get the moment of the change. A stamp set by the caller (an import brings the stamps of its backup) is
  // kept: it is the caller who knows the real moment.
  const track = (model: Model, moment: string, batch: string, forgetting: boolean) => {
    const before = baseOf(model)
    const repo = repoOf(model)
    const current = new Set<string>()
    for (const record of repo.all()) {
      const json = JSON.parse(JSON.stringify(record.$toJson())) as Record<string, unknown>
      const id = String(json.id)
      current.add(id)
      const old = before.get(id)?.rec
      const changed = undefined === old || withoutStamp(old) !== withoutStamp(json)
      const stamped = undefined === old ? null !== (json.updatedAt ?? null) : old.updatedAt !== json.updatedAt
      if (changed && !stamped) {
        repo.where('id' as never, id as never).update({ updatedAt: moment } as never)
      }
    }
    if (forgetting) {
      return
    }
    const trash = useRepo(Trash, pinia)
    for (const [id, entry] of before) {
      if (!current.has(id)) {
        trash.save({ entity: model.entity, recordId: id, record: entry.rec, deletedAt: moment, batch })
      }
    }
  }

  const purgeTrash = (moment: Date) => {
    const limit = new Date(moment.getTime() - TRASH_DAYS * 86_400_000).toISOString()
    const trash = useRepo(Trash, pinia)
    trash
      .all()
      .filter((entry) => entry.deletedAt < limit)
      .forEach((entry) => trash.destroy(entry.id))
  }

  // Everything that runs on the storage runs in this queue, one after the other.
  let chain: Promise<unknown> = Promise.resolve()
  const queue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = chain.then(task)
    chain = result.catch(() => undefined)
    return result
  }

  // Brings the changes of this page to the storage. The storage is read first, and what it holds is merged with the changes:
  // the records another page wrote are kept, and taken into this page.
  const save = async (forgetting = false) => {
    timer = undefined
    if (newer) {
      return
    }
    // The trash empties itself whenever the page looks at its data, changes or not.
    purgeTrash(now())
    const changed = MODELS.filter(dirty)
    if (0 === changed.length) {
      return
    }
    const read = [...new Set([...changed, Trash])]
    const stored = await adapter.get(read.map((model) => keyOf(model.entity)))

    // From here to the write nothing waits: the store of this page cannot change under the merge.
    const moment = now()
    const stamp = moment.toISOString()
    for (const model of changed) {
      if (model !== Trash) {
        track(model, stamp, stamp, forgetting)
      }
    }

    const items: Record<string, unknown> = {}
    for (const model of read) {
      const mine = local(model)
      const agreed = baseOf(model)
      if (sameSnapshot(mine, agreed)) {
        continue
      }
      const theirs = readSnapshot(stored, model)
      const result = merge3(agreed, mine, theirs)
      apply(model, mine, result)
      base.set(model.entity, result)
      if (!sameSnapshot(result, theirs)) {
        const print = fingerprint(result)
        written.set(model.entity, [...(written.get(model.entity) ?? []), print].slice(-WRITTEN_KEPT))
        note(`write ${model.entity} #${print} [${digest(model.entity, result)}] theirs #${fingerprint(theirs)}`)
        items[keyOf(model.entity)] = recordsOf(result)
      } else {
        note(`merge ${model.entity} #${fingerprint(result)} (nothing to write)`)
      }
    }
    if (0 < Object.keys(items).length) {
      await adapter.set({ [SCHEMA_KEY]: SCHEMA_VERSION, ...items })
    }
  }

  // The storage changed (a write of this page coming back, or of another page): takes in what is new. What this page changed
  // since it last wrote is kept, and written by the save that follows.
  const reconcile = async (models: Model[]) => {
    if (newer) {
      return
    }
    const stored = await adapter.get(models.map((model) => keyOf(model.entity)))
    let pending = false
    for (const model of models) {
      const theirs = readSnapshot(stored, model)
      const print = fingerprint(theirs)
      if (sameSnapshot(theirs, baseOf(model)) || written.get(model.entity)?.includes(print)) {
        note(`read ${model.entity} #${print} own [${digest(model.entity, theirs)}]`)
        continue
      }
      note(`read ${model.entity} #${print} FOREIGN [${digest(model.entity, theirs)}]`)
      const mine = local(model)
      const result = merge3(baseOf(model), mine, theirs)
      apply(model, mine, result)
      base.set(model.entity, theirs)
      // What another page wrote is the new truth: older writes of this page must not be mistaken for it again.
      written.delete(model.entity)
      pending ||= !sameSnapshot(result, theirs)
    }
    if (pending) {
      schedule()
    }
  }

  const schedule = () => {
    if (loading || newer) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void queue(() => save()), delay)
  }

  const ready = (async () => {
    await loadAll()
    if (newer) {
      return
    }
    seedDefaults(pinia)
    // The defaults just created, and data just brought up to the current structure, are saved like any change.
    await queue(() => save())
  })()

  const stopListening = adapter.onChanged((keys) => {
    const changed = MODELS.filter((model) => keys.includes(keyOf(model.entity)))
    if (0 < changed.length) {
      void ready.then(() => (newer ? undefined : queue(() => reconcile(changed))))
    }
  })

  // The store of each model tells when its records change.
  void ready.then(() => {
    if (newer) {
      return
    }
    for (const model of MODELS) {
      repoOf(model).piniaStore().$subscribe(schedule)
    }
  })

  return {
    ready,
    get newer() {
      return newer
    },
    events,
    async flush() {
      await ready
      clearTimeout(timer)
      await queue(() => save())
    },
    async forget(change) {
      await ready
      clearTimeout(timer)
      // What was waiting is saved first, as the change that follows must be the only one to leave no trace.
      await queue(() => save())
      change()
      await queue(() => save(true))
    },
    stop() {
      clearTimeout(timer)
      stopListening()
    },
  }
}
