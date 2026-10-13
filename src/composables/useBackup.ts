import { computed, ref } from 'vue'
import { backupToFile, browserEnvironment, createBackup } from '../services/backup'
import { makeCheck, matchesCheck, validPassphrase } from '../services/encryption'
import { sessionPassphrase } from '../services/passphrase'
import { todayIn } from '../utils/time'
import { useApp } from './useApp'
import { useFormat } from './useFormat'

// The backup to a file, with or without a passphrase, for the options and for the reminder of the board.
export function useBackup() {
  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  const message = ref('')
  const failed = ref(false)

  // The passphrase is wanted, and the page does not have it yet: to set (there is no check yet) or to type again.
  const needs = computed<'setup' | 'unlock' | null>(() => {
    if (!settings.backupProtect || null !== sessionPassphrase.value) {
      return null
    }
    return null === settings.backupPassphraseCheck ? 'setup' : 'unlock'
  })

  function say(text: string, error = false) {
    message.value = text
    failed.value = error
  }

  async function protect(on: boolean) {
    if (!on) {
      sessionPassphrase.value = null
    }
    await updateSettings({ backupProtect: on, ...(on ? {} : { backupPassphraseCheck: null }) })
  }

  // Sets the passphrase: typed twice. Returns whether it was set.
  async function setup(passphrase: string, again: string): Promise<boolean> {
    if (!validPassphrase(passphrase)) {
      say(t('backup.tooShort'), true)
      return false
    }
    if (passphrase !== again) {
      say(t('backup.notTheSame'), true)
      return false
    }
    await updateSettings({ backupPassphraseCheck: await makeCheck(passphrase) })
    sessionPassphrase.value = passphrase
    say(t('backup.isSet'))
    return true
  }

  // Types the passphrase again: it has to be the one that was set.
  async function unlock(passphrase: string): Promise<boolean> {
    const check = settings.backupPassphraseCheck
    if (check && (await matchesCheck(passphrase, check))) {
      sessionPassphrase.value = passphrase
      say('')
      return true
    }
    say(t('backup.notThePassphrase'), true)
    return false
  }

  // Writes the backup. Returns the name of the file, or null when nothing was written.
  async function backup(forceChoice = false): Promise<string | null> {
    if (null !== needs.value) {
      say(t('backup.needsPassphrase'), true)
      return null
    }
    const protectedFile = settings.backupProtect
    const text = await createBackup(settings, protectedFile ? sessionPassphrase.value : null)
    const result = await backupToFile(text, todayIn(format.timeZone.value), browserEnvironment(), {
      forceChoice,
      protectedFile,
    })
    if (!result.done) {
      return null
    }
    await updateSettings({ lastBackupAt: new Date().toISOString() })
    return result.name
  }

  return { message, failed, needs, say, protect, setup, unlock, backup }
}
