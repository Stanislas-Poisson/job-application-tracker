<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { useApp } from '../../composables/useApp'
  import { browserAdapter } from '../../persistence/adapter'
  import { type Locale, saveSettings } from '../../settings'

  const { t, locale } = useApp()

  const options = { auto: 'Auto', en: 'English', fr: 'Francais' }

  async function change(value: string) {
    locale.value = value as Locale
    await saveSettings(browserAdapter, { locale: locale.value })
  }
</script>

<template>
  <h2>{{ t('options.language') }}</h2>
  <FormSelect
    :model-value="locale.value"
    name="language"
    :options="options"
    @update:model-value="change(String($event))"
  />
</template>
