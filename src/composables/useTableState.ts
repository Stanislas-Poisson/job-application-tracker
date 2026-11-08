import { onMounted, reactive, watch } from 'vue'
import { browserAdapter } from '../persistence/adapter'

// What the user chose for a table, kept in the browser so that it opens as it was left: the column it is sorted by, the way, and
// the columns hidden. One entry for each table, under one key.
export const TABLES_KEY = 'jat:tables'

export interface TableState {
  sort: string | null
  direction: 'asc' | 'desc'
  hidden: string[]
}

const normalize = (value: unknown, fallback: TableState): TableState => {
  const source = ('object' === typeof value && null !== value ? value : {}) as Record<string, unknown>
  return {
    sort: 'string' === typeof source.sort || null === source.sort ? (source.sort as string | null) : fallback.sort,
    direction: 'asc' === source.direction || 'desc' === source.direction ? source.direction : fallback.direction,
    hidden: Array.isArray(source.hidden) ? source.hidden.filter((key): key is string => 'string' === typeof key) : [],
  }
}

export function useTableState(id: string, fallback: TableState) {
  const state = reactive<TableState>({ ...fallback, hidden: [...fallback.hidden] })
  let loaded = false

  onMounted(async () => {
    const stored = (await browserAdapter.get([TABLES_KEY]))[TABLES_KEY] as Record<string, unknown> | undefined
    if (stored && id in stored) {
      Object.assign(state, normalize(stored[id], fallback))
    }
    loaded = true
  })

  // Written as soon as it changes, as plain data, next to what the other tables chose.
  watch(
    state,
    async () => {
      if (!loaded) {
        return
      }
      const stored = ((await browserAdapter.get([TABLES_KEY]))[TABLES_KEY] ?? {}) as Record<string, unknown>
      await browserAdapter.set({ [TABLES_KEY]: { ...stored, [id]: JSON.parse(JSON.stringify(state)) as TableState } })
    },
    { deep: true }
  )

  return state
}
