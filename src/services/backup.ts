import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { Application, Contact } from '../models'
import { loadBackupHandle, saveBackupHandle } from '../persistence/fileHandle'
import type { Settings } from '../settings'
import { exportData } from './data'

export const BACKUP_PREFIX = 'job-application-tracker'

// "job-application-tracker-2026-10-12.json"
export const backupFileName = (day: string): string => `${BACKUP_PREFIX}-${day}.json`

// The text of the backup: a readable JSON file, the data and the settings.
export function backupText(settings: Settings, pinia?: Pinia): string {
  return JSON.stringify(exportData(pinia, settings), null, 2)
}

// Whether there is anything worth saving: a backup of nothing is no reason to remind.
export function hasData(pinia?: Pinia): boolean {
  return 0 < useRepo(Application, pinia).all().length || 0 < useRepo(Contact, pinia).all().length
}

/**
 * How late the backup is. Null when the reminder is off, when there is nothing to save, or when the last backup is
 * recent enough. Otherwise the number of days since the last backup, or Infinity when there never was one.
 */
export function backupDelay(settings: Settings, data: boolean, now: Date = new Date()): number | null {
  if (0 === settings.backupReminderDays || !data) {
    return null
  }
  if (null === settings.lastBackupAt) {
    return Number.POSITIVE_INFINITY
  }
  const days = Math.floor((now.getTime() - new Date(settings.lastBackupAt).getTime()) / 86_400_000)
  return days >= settings.backupReminderDays ? days : null
}

// What a backup needs from the browser. Passed in, so that a test does not need one.
export interface BackupEnvironment {
  showSaveFilePicker?: (options: { suggestedName: string; types: unknown[] }) => Promise<FileSystemFileHandle>
  loadHandle: () => Promise<FileSystemFileHandle | null>
  saveHandle: (handle: FileSystemFileHandle | null) => Promise<void>
  download: (name: string, text: string) => void
}

export type BackupResult = { done: true; method: 'file' | 'download'; name: string } | { done: false }

const JSON_TYPE = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]

async function write(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

// The remembered file, when the browser lets the page write to it again. The permission may need the click of the user:
// this runs from one.
async function usableHandle(environment: BackupEnvironment): Promise<FileSystemFileHandle | null> {
  const handle = await environment.loadHandle()
  if (!handle) {
    return null
  }
  // queryPermission and requestPermission are in the browsers that have the API, but not in the TypeScript types.
  const guarded = handle as FileSystemFileHandle & {
    queryPermission: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  const mode = { mode: 'readwrite' } as const
  try {
    if ('granted' === (await guarded.queryPermission(mode)) || 'granted' === (await guarded.requestPermission(mode))) {
      return handle
    }
  } catch {
    // The file is gone or the handle is not valid any more: another one is asked for.
  }
  return null
}

/**
 * Writes the backup. In order: the file chosen before, a file chosen now (when the browser has the file system API),
 * a download. `forceChoice` skips the first, to let the user pick another file.
 * A user who closes the file picker cancels the backup: nothing is written and nothing is said to have been.
 */
export async function backupToFile(
  text: string,
  day: string,
  environment: BackupEnvironment,
  { forceChoice = false } = {}
): Promise<BackupResult> {
  const name = backupFileName(day)

  if (!forceChoice) {
    const known = await usableHandle(environment)
    if (known) {
      try {
        await write(known, text)
        return { done: true, method: 'file', name: known.name }
      } catch {
        // The file cannot be written any more (moved, locked): a new one is asked for below.
      }
    }
  }

  if (environment.showSaveFilePicker) {
    let handle: FileSystemFileHandle
    try {
      handle = await environment.showSaveFilePicker({ suggestedName: name, types: JSON_TYPE })
    } catch (error) {
      if (error instanceof DOMException && 'AbortError' === error.name) {
        return { done: false }
      }
      throw error
    }
    await write(handle, text)
    await environment.saveHandle(handle)
    return { done: true, method: 'file', name: handle.name }
  }

  environment.download(name, text)
  return { done: true, method: 'download', name }
}

// Forgets the remembered file: the next backup asks for one.
export const forgetBackupFile = (environment: Pick<BackupEnvironment, 'saveHandle'>) => environment.saveHandle(null)

function downloadText(name: string, text: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

// The browser the page runs in.
export function browserEnvironment(): BackupEnvironment {
  const picker = (window as { showSaveFilePicker?: BackupEnvironment['showSaveFilePicker'] }).showSaveFilePicker
  return {
    showSaveFilePicker: picker ? picker.bind(window) : undefined,
    loadHandle: loadBackupHandle,
    saveHandle: saveBackupHandle,
    download: downloadText,
  }
}
