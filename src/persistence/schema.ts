// The version of the structure of the data: the fields of the records and the way they are stored. It has nothing to do
// with the version of the extension. A backup file and the storage both carry it, so that data written by an older
// structure can be brought up to date, and data written by a newer one is never read wrongly or overwritten.
//
// How to change the structure: add a function to MIGRATIONS that turns the data of version N into the data of N + 1,
// raise SCHEMA_VERSION to N + 1, and add a test with a file of version N. The functions only ever go up one step.

export const SCHEMA_VERSION = 2
export const SCHEMA_KEY = 'jat:schema'

// The records of every kind of data, by entity name, as they are stored.
export type RawData = Record<string, Record<string, unknown>[]>

type Migration = (data: RawData) => RawData

export const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2: every record has the moment of its last change (null: never stamped), and the deleted records are kept in
  // the trash.
  1: (data) => {
    const next: RawData = {}
    for (const [entity, records] of Object.entries(data)) {
      next[entity] = records.map((record) => ({ updatedAt: null, ...record }))
    }
    next.trash ??= []
    return next
  },
}

// Whether data of that version can be read: a number from 1 to the current version.
export const isKnownVersion = (version: unknown): version is number =>
  'number' === typeof version && Number.isInteger(version) && 1 <= version && SCHEMA_VERSION >= version

/**
 * The data brought up to the current version, one step at a time. It does not change what it is given.
 * Throws for a version that is newer than this one or that makes no sense: the data is left alone.
 */
export function migrate(data: RawData, from: unknown): RawData {
  if (!isKnownVersion(from)) {
    throw new Error(
      'number' === typeof from && from > SCHEMA_VERSION
        ? 'This data comes from a newer version of the extension.'
        : 'The version of this data is not known.'
    )
  }
  let current: RawData = structuredClone(data)
  for (let version = from; version < SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version]
    if (!step) {
      throw new Error(`There is no way to bring data of version ${version} up to date.`)
    }
    current = step(current)
  }
  return current
}
