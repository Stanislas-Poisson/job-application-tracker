// The file chosen for the backups. A browser lets a page write to a file again only if it keeps the handle of that file,
// and a handle can only be kept in IndexedDB (it cannot go in chrome.storage).

const DB = 'jat-files'
const STORE = 'handles'
const KEY = 'backup'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available.'))
  })
}

async function run(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const db = await open()
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed.'))
    })
  } finally {
    db.close()
  }
}

export async function loadBackupHandle(): Promise<FileSystemFileHandle | null> {
  try {
    return ((await run('readonly', (store) => store.get(KEY))) as FileSystemFileHandle | undefined) ?? null
  } catch {
    // No IndexedDB (a private window): the user is asked for a file each time.
    return null
  }
}

export async function saveBackupHandle(handle: FileSystemFileHandle | null): Promise<void> {
  try {
    await run('readwrite', (store) => (null === handle ? store.delete(KEY) : store.put(handle, KEY)))
  } catch {
    // The file is not remembered: the next backup asks for it again.
  }
}
