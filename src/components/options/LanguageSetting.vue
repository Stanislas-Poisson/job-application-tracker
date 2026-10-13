<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { useApp } from '../../composables/useApp'
  import { LANGUAGES } from '../../languages'
  import type { Locale } from '../../settings'

  const { t, settings, updateSettings } = useApp()

  // Each language is named in itself.
  const options = {
    auto: t('options.languageAuto'),
    ...Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])),
  }
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
