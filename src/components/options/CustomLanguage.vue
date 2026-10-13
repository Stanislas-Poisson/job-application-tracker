<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import {
    type LanguageReport,
    MAX_LANGUAGES,
    type StoredLanguage,
    languageTemplate,
    readLanguageFile,
  } from '../../customLanguage'
  import { addCustomLanguage, installed, removeCustomLanguage } from '../../customLanguages'
  import { browserAdapter } from '../../persistence/adapter'

  const { t, tn, settings, updateSettings } = useApp()

  const message = ref('')
  const failed = ref(false)
  // The file that was read and checked, waiting for the answer of the user. Nothing is kept yet.
  const pending = ref<{ language: StoredLanguage; report: LanguageReport } | null>(null)

  function say(text: string, error = false) {
    message.value = text
    failed.value = error
  }

  function download() {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([languageTemplate()], { type: 'application/json' }))
    link.download = 'job-application-tracker-language.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function choose(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    pending.value = null
    say('')
    if (!file) {
      return
    }
    const result = readLanguageFile(await file.text())
    if (result.ok) {
      pending.value = { language: result.language, report: result.report }
    } else {
      say(t(`customLanguage.errors.${result.error}`), true)
    }
  }

  async function keep() {
    if (!pending.value) {
      return
    }
    const { language } = pending.value
    if (await addCustomLanguage(browserAdapter, language)) {
      say(t('customLanguage.added', { name: language.name }))
      pending.value = null
    } else {
      say(t('customLanguage.tooMany', { max: MAX_LANGUAGES }), true)
    }
  }

  async function remove(language: StoredLanguage) {
    if (window.confirm(t('customLanguage.confirmRemove', { name: language.name }))) {
      await removeCustomLanguage(browserAdapter, language.code)
      if (settings.locale === language.code) {
        await updateSettings({ locale: 'auto' })
      }
    }
  }
</script>

<template>
  <h3>{{ t('customLanguage.title') }}</h3>
  <p class="muted">{{ t('customLanguage.hint') }}</p>
  <div class="stack">
    <div class="row wrap">
      <FormButton
        id="language-template"
        type="button"
        @click="download"
        >{{ t('customLanguage.template') }}</FormButton
      >
      <label class="row wrap">
        {{ t('customLanguage.choose') }}
        <input
          id="language-file"
          type="file"
          accept="application/json,.json"
          @change="choose"
        />
      </label>
    </div>

    <section
      v-if="pending"
      id="language-preview"
      class="card stack"
    >
      <p>
        <strong>{{ pending.language.name }}</strong> ({{ pending.language.code }}, {{ pending.language.dir }})
      </p>
      <p>
        {{
          t('customLanguage.summary', {
            translated: pending.report.translated,
            total: pending.report.total,
            missing: pending.report.missing,
          })
        }}
      </p>
      <p
        v-if="0 < pending.report.unknown.length"
        class="muted"
      >
        {{ tn('customLanguage.unknown', pending.report.unknown.length) }}
      </p>
      <div v-if="0 < pending.report.problems.length">
        <p class="error">{{ tn('customLanguage.problems', pending.report.problems.length) }}</p>
        <ul id="language-problems">
          <li
            v-for="problem in pending.report.problems.slice(0, 20)"
            :key="problem.path"
          >
            <code>{{ problem.path }}</code> - {{ t(`customLanguage.reasons.${problem.reason}`) }}
          </li>
        </ul>
      </div>
      <p class="muted">{{ t('customLanguage.safety') }}</p>
      <div class="row">
        <FormButton
          id="language-keep"
          type="button"
          @click="keep"
          >{{ t('customLanguage.keep') }}</FormButton
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

    <ul
      v-if="0 < installed.length"
      id="language-installed"
      class="stack"
    >
      <li
        v-for="language in installed"
        :key="language.code"
        class="row"
      >
        <span>{{ language.name }} ({{ language.code }})</span>
        <FormButton
          type="button"
          @click="remove(language)"
          >{{ t('options.remove') }}</FormButton
        >
      </li>
    </ul>
  </div>
</template>
