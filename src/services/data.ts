import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS } from '../models'
import { SCHEMA_VERSION } from '../persistence'
import { type RawData, migrate } from '../persistence/schema'
import { type Settings, normalizeSettings } from '../settings'
import { canonicalJson } from '../utils/checksum'
import { seedDefaults } from './seed'

export const EXPORT_APP = 'job-application-tracker'

export interface ExportFile {
  app: typeof EXPORT_APP
  schema: number
  exportedAt: string
  // The settings of the user, without what is a cache or a state (see backupSettings). Missing in older files.
  settings?: Partial<Settings>
  data: Record<string, unknown[]>
}

// The settings that go in a backup. The rates fetched by the service are a cache and the date of the last backup is a
// state of this browser: neither is something to restore. There is no secret in the settings.
export function backupSettings(settings: Settings): Partial<Settings> {
  const { autoRatesData: _cache, lastBackupAt: _state, ...kept } = settings
  return JSON.parse(JSON.stringify(kept)) as Partial<Settings>
}

// The settings of a backup, checked like any stored settings. Null for a file that has none (an older one).
// The cache and the state stay the ones of this browser, so they are not part of what comes back.
export function settingsFromExport(file: unknown): Partial<Settings> | null {
  const stored = (file as Partial<ExportFile> | null)?.settings
  if ('object' !== typeof stored || null === stored) {
    return null
  }
  const { autoRatesData: _cache, lastBackupAt: _state, ...kept } = normalizeSettings(stored)
  return kept
}

// Everything the user stored, as one object that can be written to a JSON file.
export function exportData(pinia?: Pinia, settings?: Settings): ExportFile {
  return {
    app: EXPORT_APP,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...(settings ? { settings: backupSettings(settings) } : {}),
    data: Object.fromEntries(
      MODELS.map((model) => [
        model.entity,
        useRepo(model, pinia)
          .all()
          .map((record) => record.$toJson()),
      ])
    ),
  }
}

// The export in a file, checked and brought up to the current structure of the data. Throws, and touches nothing, when
// the file is not an export of this extension, or comes from a newer version, or from a version nobody knows.
// `fromSchema` is the version the file was written with.
export function readExport(file: unknown): ExportFile & { fromSchema: number } {
  const candidate = file as Partial<ExportFile> | null
  if (EXPORT_APP !== candidate?.app || 'object' !== typeof candidate.data || null === candidate.data) {
    throw new Error('This file is not an export of Job Application Tracker.')
  }
  if ('number' === typeof candidate.schema && SCHEMA_VERSION < candidate.schema) {
    throw new Error('This export comes from a newer version of the extension.')
  }

  const data = candidate.data as Record<string, unknown>
  for (const model of MODELS) {
    if (undefined !== data[model.entity] && !Array.isArray(data[model.entity])) {
      throw new Error(`The data of ${model.entity} is not a list.`)
    }
  }
  let migrated: RawData
  try {
    const raw: RawData = {}
    for (const model of MODELS) {
      raw[model.entity] = (data[model.entity] as Record<string, unknown>[] | undefined) ?? []
    }
    migrated = migrate(raw, candidate.schema)
  } catch {
    throw new Error('The version of this export is not known.')
  }
  return {
    ...(candidate as ExportFile),
    schema: SCHEMA_VERSION,
    fromSchema: candidate.schema as number,
    data: migrated,
  }
}

// Replaces what is stored by the content of an export. Throws, and changes nothing, when the file is not one.
export function importData(file: unknown, pinia?: Pinia) {
  const { data } = readExport(file)
  for (const model of MODELS) {
    useRepo(model, pinia).fresh((data[model.entity] as never[] | undefined) ?? [])
  }
  seedDefaults(pinia)
}

// What a restore would do to one kind of data.
export interface ModelDiff {
  entity: string
  // In the backup.
  incoming: number
  // In the backup and not stored here.
  added: number
  // In both, and different.
  changed: number
  // In both, and the same.
  same: number
  // Stored here and not in the backup: the restore removes them.
  lost: number
}

export interface RestorePlan {
  // The version of the structure the backup was written with, and whether it is older than the current one: it is then
  // brought up to date when it is restored.
  schema: number
  outdated: boolean
  exportedAt: string | null
  hasSettings: boolean
  models: ModelDiff[]
}

/**
 * What restoring a backup would change, kind of data by kind of data, before anything is applied. Nothing is written.
 * A record of the backup is read like a stored one (the fields an older backup lacks get their defaults), so that
 * only a real difference counts.
 */
export function planRestore(file: unknown, pinia?: Pinia): RestorePlan {
  const { data, exportedAt, settings, fromSchema } = readExport(file)
  const models = MODELS.map((model): ModelDiff => {
    const repo = useRepo(model, pinia)
    const storedJson = new Map(
      repo
        .all()
        .map((record) => [
          String((record as unknown as { id: unknown }).id),
          JSON.parse(JSON.stringify(record.$toJson())) as Record<string, unknown>,
        ])
    )
    const incoming = (data[model.entity] ?? []).map(
      (record) => repo.make(record as never) as unknown as { id: unknown; $toJson: () => Record<string, unknown> }
    )
    const diff: ModelDiff = { entity: model.entity, incoming: incoming.length, added: 0, changed: 0, same: 0, lost: 0 }
    const seen = new Set<string>()
    for (const record of incoming) {
      const id = String(record.id)
      seen.add(id)
      const before = storedJson.get(id)
      if (undefined === before) {
        diff.added++
        continue
      }
      // A made record also holds its (empty) relations and pivot keys: only the fields a stored record has are compared.
      const fields = Object.fromEntries(
        Object.entries(JSON.parse(JSON.stringify(record.$toJson())) as Record<string, unknown>).filter(
          ([key]) => key in before
        )
      )
      if (canonicalJson(before) === canonicalJson(fields)) {
        diff.same++
      } else {
        diff.changed++
      }
    }
    diff.lost = [...storedJson.keys()].filter((id) => !seen.has(id)).length
    return diff
  })
  return {
    schema: fromSchema,
    outdated: SCHEMA_VERSION > fromSchema,
    exportedAt: 'string' === typeof exportedAt ? exportedAt : null,
    hasSettings: undefined !== settings,
    models,
  }
}

// Removes everything, then puts the defaults back.
export function wipeData(pinia?: Pinia) {
  for (const model of MODELS) {
    useRepo(model, pinia).flush()
  }
  seedDefaults(pinia)
}
