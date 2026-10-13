import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Application } from '../../src/models'
import { captureOffer } from '../../src/services/applications'
import {
  type BackupEnvironment,
  backupDelay,
  backupFileName,
  backupText,
  backupToFile,
  createBackup,
  forgetBackupFile,
  hasData,
} from '../../src/services/backup'
import { exportData, importData, settingsFromExport } from '../../src/services/data'
import {
  type EncryptedFile,
  WrongPassphraseError,
  decryptText,
  isEncryptedFile,
  makeCheck,
} from '../../src/services/encryption'
import { DEFAULT_SETTINGS, type Settings, normalizeSettings } from '../../src/settings'
import { verifyChecksum } from '../../src/utils/checksum'
import { freshStore } from './helpers'

const settings = (changes: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...changes })
const NOW = new Date('2026-10-13T10:00:00Z')

describe('the settings of the backup', () => {
  it('keeps a valid reminder and a valid date, and drops the others', () => {
    expect(normalizeSettings({ backupReminderDays: 7, lastBackupAt: '2026-10-01T08:00:00.000Z' })).toMatchObject({
      backupReminderDays: 7,
      lastBackupAt: '2026-10-01T08:00:00.000Z',
    })
    expect(normalizeSettings({ backupReminderDays: 0 }).backupReminderDays).toBe(0)
    expect(normalizeSettings({ backupReminderDays: -1 }).backupReminderDays).toBe(30)
    expect(normalizeSettings({ backupReminderDays: 2.5 }).backupReminderDays).toBe(30)
    expect(normalizeSettings({ backupReminderDays: 999 }).backupReminderDays).toBe(30)
    expect(normalizeSettings({ lastBackupAt: '2026-10-01' }).lastBackupAt).toBeNull()
    expect(normalizeSettings({}).lastBackupAt).toBeNull()
  })
})

describe('backupDelay', () => {
  it('is null when the reminder is off, when there is nothing to save, or when the backup is recent', () => {
    expect(backupDelay(settings({ backupReminderDays: 0 }), true, NOW)).toBeNull()
    expect(backupDelay(settings(), false, NOW)).toBeNull()
    expect(backupDelay(settings({ lastBackupAt: '2026-10-05T10:00:00.000Z' }), true, NOW)).toBeNull()
  })

  it('counts the days once the delay is reached', () => {
    expect(backupDelay(settings({ lastBackupAt: '2026-09-13T10:00:00.000Z' }), true, NOW)).toBe(30)
    expect(backupDelay(settings({ lastBackupAt: '2026-08-01T10:00:00.000Z' }), true, NOW)).toBe(73)
  })

  it('is infinite when there never was a backup', () => {
    expect(backupDelay(settings(), true, NOW)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('what is in a backup', () => {
  beforeEach(() => {
    freshStore()
  })

  it('has a readable name with the day', () => {
    expect(backupFileName('2026-10-12')).toBe('job-application-tracker-2026-10-12.json')
  })

  it('says whether there is anything to save', () => {
    expect(hasData()).toBe(false)
    captureOffer({ title: 'One', companyName: 'Acme' })
    expect(hasData()).toBe(true)
  })

  it('holds the settings but neither the cache of the rates nor the date of the last backup', async () => {
    const chosen = settings({
      theme: 'dark',
      homeCurrency: 'EUR',
      rates: { USD: 0.9 },
      ownEmails: ['me@example.com'],
      lastBackupAt: '2026-10-01T08:00:00.000Z',
      autoRatesData: { home: 'EUR', date: '2026-10-12', fetchedAt: '2026-10-12T08:00:00.000Z', rates: { USD: 0.9 } },
    })
    const file = JSON.parse(await backupText(chosen)) as { settings: Record<string, unknown> }

    expect(file.settings).toMatchObject({
      theme: 'dark',
      homeCurrency: 'EUR',
      rates: { USD: 0.9 },
      ownEmails: ['me@example.com'],
    })
    expect(file.settings).not.toHaveProperty('autoRatesData')
    expect(file.settings).not.toHaveProperty('lastBackupAt')
  })

  it('is plain, indented JSON that can be imported back with its settings', async () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    const text = await backupText(settings({ accent: 'teal', backupReminderDays: 7 }))
    expect(text).toContain('\n  "app"')

    freshStore({ seed: false })
    const file: unknown = JSON.parse(text)
    importData(file)
    expect(settingsFromExport(file)).toMatchObject({ accent: 'teal', backupReminderDays: 7 })
    expect(settingsFromExport(file)).not.toHaveProperty('lastBackupAt')
  })

  it('reads an older file with no settings, and checks the settings of a file edited by hand', () => {
    expect(settingsFromExport(exportData())).toBeNull()
    expect(settingsFromExport(null)).toBeNull()
    const edited = { settings: { theme: 'neon', accent: 'blue' } }
    expect(settingsFromExport(edited)).toMatchObject({ theme: 'auto', accent: 'blue' })
  })
})

describe('backupToFile', () => {
  const handle = (name = 'backup.json', permission: PermissionState = 'granted') => {
    const written: string[] = []
    const file = {
      name,
      written,
      queryPermission: vi.fn(async () => permission),
      requestPermission: vi.fn(async () => permission),
      createWritable: vi.fn(async () => ({
        write: async (text: string) => void written.push(text),
        close: async () => undefined,
      })),
    }
    return file as unknown as FileSystemFileHandle & typeof file
  }

  const environment = (changes: Partial<BackupEnvironment> = {}): BackupEnvironment & { downloads: string[][] } => {
    const downloads: string[][] = []
    return {
      downloads,
      loadHandle: async () => null,
      saveHandle: vi.fn(async () => undefined),
      download: (name, text) => void downloads.push([name, text]),
      ...changes,
    }
  }

  it('writes again to the file chosen before, without asking for another', async () => {
    const known = handle('mine.json')
    const picker = vi.fn()
    const env = environment({ loadHandle: async () => known, showSaveFilePicker: picker })

    expect(await backupToFile('TEXT', '2026-10-13', env)).toEqual({ done: true, method: 'file', name: 'mine.json' })
    expect(known.written).toEqual(['TEXT'])
    expect(picker).not.toHaveBeenCalled()
  })

  it('asks for a file the first time, and remembers it', async () => {
    const chosen = handle('new.json')
    const picker = vi.fn(async () => chosen)
    const env = environment({ showSaveFilePicker: picker })

    expect(await backupToFile('TEXT', '2026-10-13', env)).toEqual({ done: true, method: 'file', name: 'new.json' })
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'job-application-tracker-2026-10-13.json' })
    )
    expect(chosen.written).toEqual(['TEXT'])
    expect(env.saveHandle).toHaveBeenCalledWith(chosen)
  })

  it('asks again when the permission is refused, or the file cannot be written', async () => {
    const refused = handle('old.json', 'denied')
    const fresh = handle('fresh.json')
    const env = environment({ loadHandle: async () => refused, showSaveFilePicker: async () => fresh })
    expect((await backupToFile('TEXT', '2026-10-13', env)) as { name: string }).toMatchObject({ name: 'fresh.json' })
    expect(refused.written).toEqual([])

    const broken = handle('broken.json')
    broken.createWritable.mockRejectedValueOnce(new Error('locked'))
    const second = environment({ loadHandle: async () => broken, showSaveFilePicker: async () => handle('other.json') })
    expect((await backupToFile('TEXT', '2026-10-13', second)) as { name: string }).toMatchObject({ name: 'other.json' })
  })

  it('lets the user choose another file when asked to', async () => {
    const known = handle('mine.json')
    const other = handle('other.json')
    const env = environment({ loadHandle: async () => known, showSaveFilePicker: async () => other })

    await backupToFile('TEXT', '2026-10-13', env, { forceChoice: true })
    expect(known.written).toEqual([])
    expect(other.written).toEqual(['TEXT'])
  })

  it('writes nothing, and says so, when the user closes the picker', async () => {
    const env = environment({
      showSaveFilePicker: async () => {
        throw new DOMException('closed', 'AbortError')
      },
    })
    expect(await backupToFile('TEXT', '2026-10-13', env)).toEqual({ done: false })
    expect(env.downloads).toEqual([])
  })

  it('does not hide another error of the picker', async () => {
    const env = environment({
      showSaveFilePicker: async () => {
        throw new Error('disk full')
      },
    })
    await expect(backupToFile('TEXT', '2026-10-13', env)).rejects.toThrow('disk full')
  })

  it('downloads the file when the browser has no file system API', async () => {
    const env = environment()
    expect(await backupToFile('TEXT', '2026-10-13', env)).toEqual({
      done: true,
      method: 'download',
      name: 'job-application-tracker-2026-10-13.json',
    })
    expect(env.downloads).toEqual([['job-application-tracker-2026-10-13.json', 'TEXT']])
  })

  it('forgets the remembered file', async () => {
    const env = environment()
    await forgetBackupFile(env)
    expect(env.saveHandle).toHaveBeenCalledWith(null)
  })
})

describe('a backup protected by a passphrase', () => {
  const PASSPHRASE = 'correct horse battery'

  beforeEach(() => {
    freshStore()
  })

  it('is named differently, and is plain without a passphrase', async () => {
    expect(backupFileName('2026-10-13', true)).toBe('job-application-tracker-2026-10-13.protected.json')
    expect(backupFileName('2026-10-13')).toBe('job-application-tracker-2026-10-13.json')
    captureOffer({ title: 'One', companyName: 'Acme' })
    expect(await createBackup(settings(), null)).toContain('"Acme"')
  })

  it('hides the data, and gives it back with the passphrase, checksum included', async () => {
    captureOffer({ title: 'Secret job', companyName: 'Acme' })
    const text = await createBackup(settings({ theme: 'dark' }), PASSPHRASE)

    expect(text).not.toContain('Acme')
    expect(text).not.toContain('Secret job')
    const file: unknown = JSON.parse(text)
    expect(isEncryptedFile(file)).toBe(true)

    const plain: unknown = JSON.parse(await decryptText(file as EncryptedFile, PASSPHRASE))
    expect(await verifyChecksum(plain)).toBe('valid')
    expect(settingsFromExport(plain)).toMatchObject({ theme: 'dark' })

    freshStore({ seed: false })
    importData(plain)
    expect(useRepo(Application).all()).toHaveLength(1)
  })

  it('cannot be opened with another passphrase', async () => {
    const file = JSON.parse(await createBackup(settings(), PASSPHRASE)) as EncryptedFile
    await expect(decryptText(file, 'another passphrase')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('keeps the check of the passphrase in the settings, and nothing that holds the passphrase', async () => {
    const check = await makeCheck(PASSPHRASE, { iterations: 100_000 })
    const kept = normalizeSettings({ backupProtect: true, backupPassphraseCheck: check })
    expect(kept).toMatchObject({ backupProtect: true, backupPassphraseCheck: check })
    expect(JSON.stringify(kept)).not.toContain('horse')
    expect(normalizeSettings({ backupProtect: 'yes', backupPassphraseCheck: { nope: 1 } })).toMatchObject({
      backupProtect: false,
      backupPassphraseCheck: null,
    })
    // It goes with the settings of a backup, so that a new browser asks for the same passphrase.
    expect(JSON.parse(await backupText(kept)).settings.backupPassphraseCheck).toEqual(check)
  })
})
