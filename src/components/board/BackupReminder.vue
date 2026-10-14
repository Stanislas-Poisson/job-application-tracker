<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useBackup } from '../../composables/useBackup'
  import { backupDelay, hasData } from '../../services/backup'
  import PassphraseForm from '../PassphraseForm.vue'

  const { t, settings } = useApp()
  const { needs, backup: backupToFile } = useBackup()

  // "Later" hides the reminder for as long as the page is open: it comes back on the next visit, until a backup is made.
  const later = ref(false)
  const failed = ref(false)
  const delay = computed(() => (later.value ? null : backupDelay(settings, hasData())))

  async function backup() {
    failed.value = false
    try {
      await backupToFile()
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
    <PassphraseForm
      v-if="needs"
      :mode="needs"
    />
    <p
      v-if="failed"
      class="error"
      role="alert"
    >
      {{ t('board.backupFailed') }}
    </p>
  </section>
</template>

<style lang="scss">
  // The reminder is a line of text and its actions, wrapping when the room is short (the card would stack them otherwise).
  #backup-reminder {
    flex-flow: row wrap;
    margin-block-end: 1rem;
    gap: 0.5rem 0.75rem;
    align-items: center;

    > p {
      flex: 1 1 16rem;
      margin: 0;
    }
  }
</style>
