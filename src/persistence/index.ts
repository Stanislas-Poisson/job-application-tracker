import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS, Trash } from '../models'
import { seedDefaults } from '../services/seed'
import type { StorageAdapter } from './adapter'
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
 * An extension has several pages (popup, options, board), each with its own store. The storage is the one
 * truth: a page saves what it changed, and the other pages load it when the storage tells it changed.
 *
 * On the way out it also keeps two things that the rest of the code does not have to think about: the moment each record
 * last changed (`updatedAt`), and a copy of each record that was removed, in the trash.
 */
export function createPersistence(
  pinia: Pinia,
  adapter: StorageAdapter,
  { delay = 0, now = () => new Date() }: PersistenceOptions = {}
): Persistence {
  // What each model looked like when it was last loaded or saved, to save only the models that changed
  // and to ignore the echo of our own writes.
  const known = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let loading = false
  let newer = false
  let forgetting = false

  const dump = (model: (typeof MODELS)[number]) =>
    JSON.stringify(
      useRepo(model, pinia)
        .all()
        .map((record) => record.$toJson())
    )

  const load = async (models: typeof MODELS) => {
    const stored = await adapter.get(models.map((model) => keyOf(model.entity)))
    loading = true
    try {
      for (const model of models) {
        const records = (stored[keyOf(model.entity)] as unknown[] | undefined) ?? []
        useRepo(model, pinia).fresh(records as never[])
        known.set(model.entity, dump(model))
      }
    } finally {
      loading = false
    }
  }

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
        useRepo(model, pinia).fresh((ready[model.entity] ?? []) as never[])
        // Nothing is known as saved yet when the structure changed: the save writes everything once.
        known.set(model.entity, version === SCHEMA_VERSION ? dump(model) : '[]')
      }
    } finally {
      loading = false
    }
  }

  // Looks at what changed in a model since the last save: the records removed go to the trash, and the records that
  // changed get the moment of the change. A stamp set by the caller (an import brings the stamps of its backup) is
  // kept: it is the caller who knows the real moment.
  const track = (model: (typeof MODELS)[number], moment: string, batch: string) => {
    const before = new Map<string, Record<string, unknown>>()
    for (const record of JSON.parse(known.get(model.entity) ?? '[]') as Record<string, unknown>[]) {
      before.set(String(record.id), record)
    }
    const repo = useRepo(model, pinia)
    const current = new Set<string>()
    for (const record of repo.all()) {
      const json = JSON.parse(JSON.stringify(record.$toJson())) as Record<string, unknown>
      const id = String(json.id)
      current.add(id)
      const old = before.get(id)
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
    for (const [id, record] of before) {
      if (!current.has(id)) {
        trash.save({ entity: model.entity, recordId: id, record, deletedAt: moment, batch })
      }
    }
  }

  const purgeTrash = (moment: Date) => {
    const limit = new Date(moment.getTime() - TRASH_DAYS * 86_400_000).toISOString()
    useRepo(Trash, pinia)
      .all()
      .filter((entry) => entry.deletedAt < limit)
      .forEach((entry) => useRepo(Trash, pinia).destroy(entry.id))
  }

  const save = async () => {
    timer = undefined
    if (newer) {
      return
    }
    const moment = now()
    const stamp = moment.toISOString()
    for (const model of MODELS) {
      if (model !== Trash) {
        track(model, stamp, stamp)
      }
    }
    purgeTrash(moment)

    const items: Record<string, unknown> = {}
    for (const model of MODELS) {
      const current = dump(model)
      if (current !== known.get(model.entity)) {
        known.set(model.entity, current)
        items[keyOf(model.entity)] = JSON.parse(current)
      }
    }
    if (0 < Object.keys(items).length) {
      await adapter.set({ [SCHEMA_KEY]: SCHEMA_VERSION, ...items })
    }
  }

  const schedule = () => {
    if (loading || newer) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void save(), delay)
  }

  const ready = (async () => {
    await loadAll()
    if (newer) {
      return
    }
    seedDefaults(pinia)
    // The defaults just created, and data just brought up to the current structure, are saved like any change.
    await save()
  })()

  const stopListening = adapter.onChanged((keys) => {
    const changed = MODELS.filter((model) => keys.includes(keyOf(model.entity)))
    if (0 < changed.length) {
      void ready.then(() => (newer ? undefined : load(changed)))
    }
  })

  // The store of each model tells when its records change.
  void ready.then(() => {
    if (newer) {
      return
    }
    for (const model of MODELS) {
      useRepo(model, pinia).piniaStore().$subscribe(schedule)
    }
  })

  return {
    ready,
    get newer() {
      return newer
    },
    async flush() {
      await ready
      clearTimeout(timer)
      await save()
    },
    async forget(change) {
      await ready
      clearTimeout(timer)
      // What was waiting is saved first, as the change that follows must be the only one to leave no trace.
      await save()
      forgetting = true
      try {
        change()
        await save()
      } finally {
        forgetting = false
      }
    },
    stop() {
      clearTimeout(timer)
      stopListening()
    },
  }
}
