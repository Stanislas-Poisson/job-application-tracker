<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { installed } from '../../customLanguages'
  import { resolveLocale } from '../../i18n'
  import { LANGUAGES, languageOf } from '../../languages'
  import { translationReportUrl } from '../../services/translationReport'
  import type { Locale } from '../../settings'
  import CustomLanguage from './CustomLanguage.vue'

  const { t, settings, updateSettings } = useApp()

  // Each language is named in itself.
  const options = computed(() => ({
    auto: t('options.languageAuto'),
    ...Object.fromEntries(LANGUAGES.map((language) => [language.code, language.name])),
    ...Object.fromEntries(installed.value.map((language) => [language.code, language.name])),
  }))

  // The language in use, when it is one the extension comes with and nobody who speaks it has checked it yet.
  const unreviewed = computed(() => {
    const language = languageOf(resolveLocale(settings.locale, navigator.language))
    return language && !language.reviewed ? language : null
  })
</script>

<template>
  <h2>{{ t('options.language') }}</h2>
  <FormSelect
    :model-value="settings.locale"
    name="language"
    :data-label="t('options.language')"
    :options="options"
    @update:model-value="updateSettings({ locale: String($event) as Locale })"
  />
  <p
    v-if="unreviewed"
    id="language-unreviewed"
    class="muted"
  >
    {{ t('options.languageUnreviewed') }}
    <a
      :href="translationReportUrl(unreviewed.code)"
      target="_blank"
      rel="noopener"
      >{{ t('options.languageReport') }}</a
    >
  </p>
  <CustomLanguage />
</template>
