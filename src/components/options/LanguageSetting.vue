<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { useApp } from '../../composables/useApp'
  import type { Locale } from '../../settings'

  const { t, settings, updateSettings } = useApp()

  const options = { auto: 'Auto', en: 'English', fr: 'Français' }
</script>

<template>
  <h2>{{ t('options.language') }}</h2>
  <FormSelect
    :model-value="settings.locale"
    name="language"
    :options="options"
    @update:model-value="updateSettings({ locale: String($event) as Locale })"
  />
</template>
