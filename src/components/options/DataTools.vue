<script setup lang="ts">
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { backupText, backupToFile, browserEnvironment } from '../../services/backup'
  import { type RestorePlan, importData, planRestore, settingsFromExport, wipeData } from '../../services/data'
  import { emptyTrash } from '../../services/trash'
  import { todayIn } from '../../utils/time'

  const { t, settings, updateSettings, persistence } = useApp()
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

  // The backup the user chose, read and compared with what is stored, waiting for the answer. Nothing is applied yet.
  const pending = ref<{ content: unknown; plan: RestorePlan } | null>(null)

  async function choose(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    pending.value = null
    if (!file) {
      return
    }
    try {
      const content: unknown = JSON.parse(await file.text())
      pending.value = { content, plan: planRestore(content) }
      message.value = ''
    } catch (error) {
      say(
        error instanceof SyntaxError ? t('options.notJson') : error instanceof Error ? error.message : String(error),
        true
      )
    }
  }

  async function restore() {
    if (!pending.value) {
      return
    }
    try {
      importData(pending.value.content)
      // The settings of the backup come back with the data.
      const restored = settingsFromExport(pending.value.content)
      if (restored) {
        await updateSettings(restored)
      }
      pending.value = null
      say(t('options.imported'))
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), true)
    }
  }

  // The kinds of data the restore touches, with their counts.
  const rows = computed(
    () =>
      pending.value?.plan.models.filter(
        (model) => 'trash' !== model.entity && (0 < model.incoming || 0 < model.lost)
      ) ?? []
  )
  const sum = (key: 'added' | 'changed' | 'same' | 'lost') => rows.value.reduce((total, row) => total + row[key], 0)

  function setReminder(text: string) {
    const value = Number(text.trim())
    if (Number.isInteger(value) && 0 <= value && 365 >= value) {
      void updateSettings({ backupReminderDays: value })
    }
  }

  async function wipe() {
    if (window.confirm(t('options.confirmWipe'))) {
      // Deleting everything leaves nothing behind: not even in the trash.
      await persistence.forget(() => {
        wipeData()
        emptyTrash()
      })
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
  <p class="muted">{{ t('options.restoreHint') }}</p>
  <div class="row">
    <label class="row">
      {{ t('options.import') }}
      <input
        type="file"
        accept="application/json,.json"
        @change="choose"
      />
    </label>
    <FormButton
      type="button"
      @click="wipe"
      >{{ t('options.wipe') }}</FormButton
    >
  </div>

  <section
    v-if="pending"
    id="restore-preview"
    class="card stack"
  >
    <p>
      <strong>{{
        pending.plan.exportedAt
          ? t('options.backupOf', { date: format.instant(pending.plan.exportedAt) })
          : t('options.backupOfUnknown')
      }}</strong>
      · {{ pending.plan.hasSettings ? t('options.withSettings') : t('options.withoutSettings') }}
    </p>
    <p
      v-if="pending.plan.outdated"
      class="muted"
    >
      {{ t('options.outdated', { version: pending.plan.schema }) }}
    </p>
    <table>
      <thead>
        <tr>
          <th>{{ t('options.colData') }}</th>
          <th>{{ t('options.colBackup') }}</th>
          <th>{{ t('options.colNew') }}</th>
          <th>{{ t('options.colDifferent') }}</th>
          <th>{{ t('options.colSame') }}</th>
          <th>{{ t('options.colLost') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.entity"
        >
          <td>{{ t(`options.entities.${row.entity}`) }}</td>
          <td>{{ row.incoming }}</td>
          <td>{{ row.added }}</td>
          <td>{{ row.changed }}</td>
          <td>{{ row.same }}</td>
          <td :class="{ error: 0 < row.lost }">{{ row.lost }}</td>
        </tr>
      </tbody>
    </table>
    <p>{{ t('options.restoreSummary', { added: sum('added'), changed: sum('changed'), lost: sum('lost') }) }}</p>
    <p class="muted">{{ t('options.restoreWarning') }}</p>
    <div class="row">
      <FormButton
        id="restore-apply"
        type="button"
        @click="restore"
        >{{ t('options.restoreApply') }}</FormButton
      >
      <FormButton
        type="button"
        @click="pending = null"
        >{{ t('options.cancel') }}</FormButton
      >
    </div>
  </section>
  <p
    v-if="message"
    :class="failed ? 'error' : 'success'"
  >
    {{ message }}
  </p>
</template>
