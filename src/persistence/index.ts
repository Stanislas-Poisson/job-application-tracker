import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS } from '../models'
import { seedDefaults } from '../services/seed'
import type { StorageAdapter } from './adapter'

const PREFIX = 'jat:'

// The version of the stored data. A later version of the extension reads it to migrate older data.
export const SCHEMA_VERSION = 1
export const SCHEMA_KEY = `${PREFIX}schema`

export const keyOf = (entity: string) => `${PREFIX}${entity}`
export const ALL_KEYS = [SCHEMA_KEY, ...MODELS.map((model) => keyOf(model.entity))]

export interface Persistence {
  // Resolves when the data is loaded into the store.
  ready: Promise<void>
  // Writes at once what was changed and not saved yet.
  flush(): Promise<void>
  stop(): void
}

/**
 * Keeps the Pinia ORM store and the storage the same, in both ways.
 *
 * An extension has several pages (popup, options, board), each with its own store. The storage is the one
 * truth: a page saves what it changed, and the other pages load it when the storage tells it changed.
 */
export function createPersistence(pinia: Pinia, adapter: StorageAdapter, { delay = 150 } = {}): Persistence {
  // What each model looked like when it was last loaded or saved, to save only the models that changed
  // and to ignore the echo of our own writes.
  const known = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let loading = false

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

  const save = async () => {
    timer = undefined
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
    if (loading) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void save(), delay)
  }

  const ready = (async () => {
    await load(MODELS)
    seedDefaults(pinia)
    // The defaults just created are saved like any change.
    await save()
  })()

  const stopListening = adapter.onChanged((keys) => {
    const changed = MODELS.filter((model) => keys.includes(keyOf(model.entity)))
    if (0 < changed.length) {
      void ready.then(() => load(changed))
    }
  })

  // The store of each model tells when its records change.
  void ready.then(() => {
    for (const model of MODELS) {
      useRepo(model, pinia).piniaStore().$subscribe(schedule)
    }
  })

  return {
    ready,
    async flush() {
      await ready
      clearTimeout(timer)
      await save()
    },
    stop() {
      clearTimeout(timer)
      stopListening()
    },
  }
}
