// What the persistence needs from a storage. The extension uses browser.storage.local, the tests a plain object.
export interface StorageAdapter {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  clear(keys: string[]): Promise<void>
  // Calls back with the keys that changed, and returns the function that stops listening.
  onChanged(callback: (keys: string[]) => void): () => void
}

export const browserAdapter: StorageAdapter = {
  async get(keys) {
    return browser.storage.local.get(keys)
  },
  async set(items) {
    await browser.storage.local.set(items)
  },
  async clear(keys) {
    await browser.storage.local.remove(keys)
  },
  onChanged(callback) {
    const listener = (changes: Record<string, unknown>, area: string) => {
      if ('local' === area) {
        callback(Object.keys(changes))
      }
    }
    browser.storage.onChanged.addListener(listener)
    return () => browser.storage.onChanged.removeListener(listener)
  },
}

export function memoryAdapter(
  initial: Record<string, unknown> = {}
): StorageAdapter & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial }
  const listeners = new Set<(keys: string[]) => void>()

  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]))
    },
    async set(items) {
      Object.assign(data, structuredClone(items))
      listeners.forEach((listener) => listener(Object.keys(items)))
    },
    async clear(keys) {
      keys.forEach((key) => delete data[key])
      listeners.forEach((listener) => listener(keys))
    },
    onChanged(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}
