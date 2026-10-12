<script setup lang="ts">
  import { dayjs } from '@zairakai/js-utils/datetime'
  import { FormButton } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { exportData, importData, wipeData } from '../../services/data'

  const { t } = useApp()

  const message = ref('')
  const failed = ref(false)

  function download() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `job-application-tracker-${dayjs().format('YYYY-MM-DD')}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function upload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !window.confirm(t('options.confirmImport'))) {
      input.value = ''
      return
    }
    try {
      importData(JSON.parse(await file.text()))
      failed.value = false
      message.value = t('options.imported')
    } catch (error) {
      failed.value = true
      message.value = error instanceof Error ? error.message : String(error)
    }
    input.value = ''
  }

  function wipe() {
    if (window.confirm(t('options.confirmWipe'))) {
      wipeData()
      failed.value = false
      message.value = t('options.wiped')
    }
  }
</script>

<template>
  <h2>{{ t('options.data') }}</h2>
  <p class="muted">{{ t('options.dataHint') }}</p>
  <div class="row">
    <FormButton
      type="button"
      @click="download"
      >{{ t('options.export') }}</FormButton
    >
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
