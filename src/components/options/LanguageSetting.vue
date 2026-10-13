<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { installed } from '../../customLanguages'
  import { LANGUAGES } from '../../languages'
  import type { Locale } from '../../settings'
  import CustomLanguage from './CustomLanguage.vue'

  const { t, settings, updateSettings } = useApp()

  // Each language is named in itself.
  const options = computed(() => ({
    auto: t('options.languageAuto'),
    ...Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])),
    ...Object.fromEntries(installed.value.map((language) => [language.code, language.name])),
  }))
</script>

<template>
  <h2>{{ t('options.language') }}</h2>
  <FormSelect
    :model-value="settings.locale"
    name="language"
    :options="options"
    @update:model-value="updateSettings({ locale: String($event) as Locale })"
  />
  <CustomLanguage />
</template>
