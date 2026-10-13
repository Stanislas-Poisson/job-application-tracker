<script setup lang="ts">
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { backupText, backupToFile, browserEnvironment } from '../../services/backup'
  import { importData, settingsFromExport, wipeData } from '../../services/data'
  import { todayIn } from '../../utils/time'

  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  const message = ref('')
  const failed = ref(false)
  // Choosing a file is only offered by the browsers that can write to a file again later.
  const canChoose = 'function' === typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker

  function say(text: string, error = false) {
    message.value = text
    failed.value = error
  }

  async function backup(forceChoice = false) {
    try {
      const text = backupText(settings)
      const result = await backupToFile(text, todayIn(format.timeZone.value), browserEnvironment(), { forceChoice })
      if (result.done) {
        await updateSettings({ lastBackupAt: new Date().toISOString() })
        say(t('options.backedUp', { name: result.name }))
      }
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
  }

  async function upload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !window.confirm(t('options.confirmImport'))) {
      input.value = ''
      return
    }
    try {
      const content: unknown = JSON.parse(await file.text())
      importData(content)
      // The settings of the backup come back with the data.
      const restored = settingsFromExport(content)
      if (restored) {
        await updateSettings(restored)
      }
      say(t('options.imported'))
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
    input.value = ''
  }

  function setReminder(text: string) {
    const value = Number(text.trim())
    if (Number.isInteger(value) && 0 <= value && 365 >= value) {
      void updateSettings({ backupReminderDays: value })
    }
  }

  function wipe() {
    if (window.confirm(t('options.confirmWipe'))) {
      wipeData()
      say(t('options.wiped'))
    }
  }
</script>

<template>
  <h2>{{ t('options.data') }}</h2>
  <p class="muted">{{ t('options.dataHint') }}</p>

  <h3>{{ t('options.backup') }}</h3>
  <p class="muted">{{ t('options.backupHint') }}</p>
  <p id="last-backup">
    {{
      settings.lastBackupAt
        ? t('options.lastBackup', { date: format.instant(settings.lastBackupAt) })
        : t('options.neverBackedUp')
    }}
  </p>
  <div class="row">
    <FormButton
      id="backup-now"
      type="button"
      @click="backup()"
      >{{ t('options.backupNow') }}</FormButton
    >
    <FormButton
      v-if="canChoose"
      type="button"
      @click="backup(true)"
      >{{ t('options.backupElsewhere') }}</FormButton
    >
  </div>
  <FormInput
    :model-value="settings.backupReminderDays"
    name="backupReminderDays"
    type="number"
    min="0"
    max="365"
    :label="t('options.reminderDays')"
    @update:model-value="setReminder(String($event))"
  />
  <p class="muted">{{ t('options.reminderHint') }}</p>

  <h3>{{ t('options.restore') }}</h3>
  <div class="row">
    <label class="row">
      {{ t('options.import') }}
      <input
        type="file"
        accept="application/json,.json"
        @change="upload"
      />
    </label>
    <FormButton
      type="button"
      @click="wipe"
      >{{ t('options.wipe') }}</FormButton
    >
  </div>
  <p
    v-if="message"
    :class="failed ? 'error' : 'success'"
  >
    {{ message }}
  </p>
</template>
