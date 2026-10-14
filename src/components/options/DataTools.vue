<script setup lang="ts">
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useBackup } from '../../composables/useBackup'
  import { useFormat } from '../../composables/useFormat'
  import { type RestorePlan, importData, planRestore, settingsFromExport, wipeData } from '../../services/data'
  import { type EncryptedFile, WrongPassphraseError, decryptText, isEncryptedFile } from '../../services/encryption'
  import { type MergePlan, mergeData, planMerge } from '../../services/mergeData'
  import { emptyTrash } from '../../services/trash'
  import { problemText } from '../../services/userError'
  import { type ChecksumStatus, verifyChecksum } from '../../utils/checksum'
  import PassphraseForm from '../PassphraseForm.vue'

  const { t, tn, settings, updateSettings, persistence } = useApp()
  const format = useFormat()
  const { needs, protect, backup: backupToChosenFile } = useBackup()

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
      const name = await backupToChosenFile(forceChoice)
      if (null !== name) {
        say(t('options.backedUp', { name }))
      }
    } catch (error) {
      say(problemText(error, t), true)
    }
  }

  // The backup the user chose, read and compared with what is stored, waiting for the answer. Nothing is applied yet.
  const pending = ref<{ content: unknown; plan: RestorePlan; checksum: ChecksumStatus } | null>(null)
  // A file whose checksum does not match is restored only when the user says they want it anyway.
  const acknowledged = ref(false)

  // What the file chosen is for: to put back after a loss (replaces what is stored), or to bring together with it.
  const target = ref<'restore' | 'merge'>('restore')
  const merging = ref<{ content: unknown; plan: MergePlan; checksum: ChecksumStatus } | null>(null)
  const understood = ref(false)

  async function choose(event: Event, purpose: 'restore' | 'merge' = 'restore') {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    target.value = purpose
    pending.value = null
    merging.value = null
    locked.value = null
    typed.value = ''
    acknowledged.value = false
    understood.value = false
    if (!file) {
      return
    }
    try {
      const content: unknown = JSON.parse(await file.text())
      if (isEncryptedFile(content)) {
        // A protected backup: the passphrase is asked before anything can be read.
        locked.value = content
        message.value = ''
        return
      }
      await prepare(content)
    } catch (error) {
      say(error instanceof SyntaxError ? t('options.notJson') : problemText(error, t), true)
    }
  }

  // Reads a backup that is not protected, and shows what restoring it would change.
  async function prepare(content: unknown) {
    const checksum = await verifyChecksum(content)
    if ('merge' === target.value) {
      merging.value = { content, plan: planMerge(content), checksum }
    } else {
      pending.value = { content, plan: planRestore(content), checksum }
    }
    message.value = ''
  }

  // A protected backup waits for its passphrase. A wrong one, or a file that was changed, fails and changes nothing.
  const locked = ref<EncryptedFile | null>(null)
  const typed = ref('')

  async function open() {
    if (!locked.value) {
      return
    }
    try {
      const text = await decryptText(locked.value, typed.value)
      const content: unknown = JSON.parse(text)
      await prepare(content)
      locked.value = null
      typed.value = ''
    } catch (error) {
      say(
        error instanceof WrongPassphraseError
          ? t('options.wrongPassphrase')
          : error instanceof SyntaxError
            ? t('options.notJson')
            : problemText(error, t),
        true
      )
    }
  }

  async function restore() {
    if (!pending.value || ('invalid' === pending.value.checksum && !acknowledged.value)) {
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
      say(problemText(error, t), true)
    }
  }

  function merge() {
    if (!merging.value || !understood.value || ('invalid' === merging.value.checksum && !acknowledged.value)) {
      return
    }
    try {
      mergeData(merging.value.content)
      merging.value = null
      say(t('options.merged'))
    } catch (error) {
      say(problemText(error, t), true)
    }
  }

  const mergeRows = computed(
    () => merging.value?.plan.models.filter((model) => 'trash' !== model.entity && 0 < model.incoming) ?? []
  )
  const mergeSum = (key: 'added' | 'updated') => mergeRows.value.reduce((total, row) => total + row[key], 0)
  const duplicateCount = computed(() => {
    const found = merging.value?.plan.duplicates
    return found ? found.companies + found.contacts + found.jobOffers : 0
  })

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
  <label class="row">
    <input
      id="backup-protect"
      type="checkbox"
      :checked="settings.backupProtect"
      @change="protect(($event.target as HTMLInputElement).checked)"
    />
    {{ t('backup.protect') }}
  </label>
  <p
    v-if="settings.backupProtect"
    class="muted"
  >
    {{ t('backup.protectHint') }}
  </p>
  <PassphraseForm
    v-if="needs"
    :mode="needs"
  />
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
        id="restore-file"
        type="file"
        accept="application/json,.json"
        @change="choose($event, 'restore')"
      />
    </label>
    <FormButton
      type="button"
      @click="wipe"
      >{{ t('options.wipe') }}</FormButton
    >
  </div>

  <h3>{{ t('options.merge') }}</h3>
  <p class="muted">{{ t('options.mergeHint') }}</p>
  <label class="row">
    {{ t('options.mergeChoose') }}
    <input
      id="merge-file"
      type="file"
      accept="application/json,.json"
      @change="choose($event, 'merge')"
    />
  </label>

  <section
    v-if="merging"
    id="merge-preview"
    class="card stack"
  >
    <p
      id="merge-checksum"
      :class="'invalid' === merging.checksum ? 'error' : 'muted'"
    >
      {{ t(`options.checksum.${merging.checksum}`) }}
    </p>
    <label
      v-if="'invalid' === merging.checksum"
      class="row"
    >
      <input
        v-model="acknowledged"
        type="checkbox"
      />
      {{ t('options.checksum.acknowledge') }}
    </label>
    <table>
      <thead>
        <tr>
          <th>{{ t('options.colData') }}</th>
          <th>{{ t('options.colBackup') }}</th>
          <th>{{ t('options.colNew') }}</th>
          <th>{{ t('options.mergeUpdated') }}</th>
          <th>{{ t('options.mergeKept') }}</th>
          <th>{{ t('options.colSame') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in mergeRows"
          :key="row.entity"
        >
          <td>{{ t(`options.entities.${row.entity}`) }}</td>
          <td>{{ row.incoming }}</td>
          <td>{{ row.added }}</td>
          <td>{{ row.updated }}</td>
          <td>{{ row.kept + row.deleted + row.matched }}</td>
          <td>{{ row.same }}</td>
        </tr>
      </tbody>
    </table>
    <p>{{ t('options.mergeSummary', { added: mergeSum('added'), updated: mergeSum('updated') }) }}</p>
    <p
      v-if="0 < duplicateCount"
      id="merge-duplicates"
      class="error"
    >
      {{ tn('options.mergeDuplicates', duplicateCount) }}
    </p>
    <p class="muted">{{ t('options.mergeWarning') }}</p>
    <label class="row">
      <input
        id="merge-understood"
        v-model="understood"
        type="checkbox"
      />
      {{ t('options.mergeUnderstood') }}
    </label>
    <div class="row">
      <FormButton
        id="merge-apply"
        type="button"
        :disabled="!understood || ('invalid' === merging.checksum && !acknowledged)"
        @click="merge"
        >{{ t('options.mergeApply') }}</FormButton
      >
      <FormButton
        type="button"
        @click="merging = null"
        >{{ t('options.cancel') }}</FormButton
      >
    </div>
  </section>

  <form
    v-if="locked"
    id="restore-locked"
    class="card stack"
    @submit.prevent="open"
  >
    <p>{{ t('options.protectedBackup') }}</p>
    <label>
      {{ t('backup.passphrase') }}
      <input
        id="restore-passphrase"
        v-model="typed"
        type="password"
        autocomplete="off"
        required
      />
    </label>
    <div class="row">
      <FormButton type="submit">{{ t('options.openBackup') }}</FormButton>
      <FormButton
        type="button"
        @click="locked = null"
        >{{ t('options.cancel') }}</FormButton
      >
    </div>
  </form>

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
      id="restore-checksum"
      :class="'invalid' === pending.checksum ? 'error' : 'muted'"
    >
      {{ t(`options.checksum.${pending.checksum}`) }}
    </p>
    <label
      v-if="'invalid' === pending.checksum"
      class="row"
    >
      <input
        id="restore-acknowledge"
        v-model="acknowledged"
        type="checkbox"
      />
      {{ t('options.checksum.acknowledge') }}
    </label>
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
        :disabled="'invalid' === pending.checksum && !acknowledged"
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
    :role="failed ? 'alert' : 'status'"
  >
    {{ message }}
  </p>
</template>
