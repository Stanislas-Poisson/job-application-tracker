<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { backupDelay, backupText, backupToFile, browserEnvironment, hasData } from '../../services/backup'
  import { todayIn } from '../../utils/time'

  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  // "Later" hides the reminder for as long as the page is open: it comes back on the next visit, until a backup is made.
  const later = ref(false)
  const failed = ref(false)
  const delay = computed(() => (later.value ? null : backupDelay(settings, hasData())))

  async function backup() {
    failed.value = false
    try {
      const result = await backupToFile(backupText(settings), todayIn(format.timeZone.value), browserEnvironment())
      if (result.done) {
        await updateSettings({ lastBackupAt: new Date().toISOString() })
      }
    } catch {
      failed.value = true
    }
  }
</script>

<template>
  <section
    v-if="null !== delay"
    id="backup-reminder"
    class="card row"
    role="status"
  >
    <p>
      {{ Number.isFinite(delay) ? t('board.backupLate', { days: delay as number }) : t('board.backupNever') }}
    </p>
    <FormButton
      type="button"
      @click="backup"
      >{{ t('options.backupNow') }}</FormButton
    >
    <FormButton
      type="button"
      @click="later = true"
      >{{ t('board.backupLater') }}</FormButton
    >
    <a
      href="#"
      @click.prevent="browser.runtime.openOptionsPage()"
      >{{ t('nav.options') }}</a
    >
    <p
      v-if="failed"
      class="error"
    >
      {{ t('board.backupFailed') }}
    </p>
  </section>
</template>
