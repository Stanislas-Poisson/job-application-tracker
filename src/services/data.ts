import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { MODELS } from '../models'
import { SCHEMA_VERSION } from '../persistence'
import { seedDefaults } from './seed'

export const EXPORT_APP = 'job-application-tracker'

export interface ExportFile {
  app: typeof EXPORT_APP
  schema: number
  exportedAt: string
  data: Record<string, unknown[]>
}

// Everything the user stored, as one object that can be written to a JSON file.
export function exportData(pinia?: Pinia): ExportFile {
  return {
    app: EXPORT_APP,
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
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

// Replaces what is stored by the content of an export. Throws, and changes nothing, when the file is not one.
export function importData(file: unknown, pinia?: Pinia) {
  const candidate = file as Partial<ExportFile> | null
  if (EXPORT_APP !== candidate?.app || 'object' !== typeof candidate.data) {
    throw new Error('This file is not an export of Job Application Tracker.')
  }
  if ('number' !== typeof candidate.schema || SCHEMA_VERSION < candidate.schema) {
    throw new Error('This export comes from a newer version of the extension.')
  }

  const data = candidate.data as Record<string, unknown>
  for (const model of MODELS) {
    if (undefined !== data[model.entity] && !Array.isArray(data[model.entity])) {
      throw new Error(`The data of ${model.entity} is not a list.`)
    }
  }

  for (const model of MODELS) {
    useRepo(model, pinia).fresh((data[model.entity] as never[] | undefined) ?? [])
  }
  seedDefaults(pinia)
}

// Removes everything, then puts the defaults back.
export function wipeData(pinia?: Pinia) {
  for (const model of MODELS) {
    useRepo(model, pinia).flush()
  }
  seedDefaults(pinia)
}
