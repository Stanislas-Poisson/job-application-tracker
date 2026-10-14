<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { notifyUndo, say } from '../../composables/useNotices'
  import {
    type LanguageReport,
    MAX_LANGUAGES,
    SHIPPED,
    type StoredLanguage,
    languageTemplate,
    readLanguageFile,
  } from '../../customLanguage'
  import { addCustomLanguage, installed, removeCustomLanguage } from '../../customLanguages'
  import { browserAdapter } from '../../persistence/adapter'

  const { t, tn, settings, updateSettings } = useApp()

  // The file that was read and checked, waiting for the answer of the user. Nothing is kept yet.
  const pending = ref<{ language: StoredLanguage; report: LanguageReport } | null>(null)

  // The developer mode: a notification with every text of the notifications in the language in use, to see a translation as
  // it shows. The background is the one that shows it, with the file that was added.
  async function sendTest() {
    const sent = await browser.runtime.sendMessage({ type: 'jat:test-notification' }).then(
      (answer: { ok?: boolean } | undefined) => true === answer?.ok,
      () => false
    )
    say(t(sent ? 'customLanguage.testNotificationSent' : 'customLanguage.testNotificationFailed'), !sent)
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
    if (!file) {
      return
    }
    const result = readLanguageFile(await file.text(), { developer: settings.developerMode })
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
    const wasInUse = settings.locale === language.code
    await removeCustomLanguage(browserAdapter, language.code)
    if (wasInUse) {
      await updateSettings({ locale: 'auto' })
    }
    // A language kept only on this computer is not in the trash: the message puts it back from what was just read.
    notifyUndo(t('notice.removed', { name: language.name }), t('notice.undo'), async () => {
      await addCustomLanguage(browserAdapter, language)
      if (wasInUse) {
        await updateSettings({ locale: language.code })
      }
    })
  }
</script>

<template>
  <h3>{{ t('customLanguage.title') }}</h3>
  <p class="muted">{{ t('customLanguage.hint') }}</p>
  <div class="stack">
    <label class="row">
      <input
        type="checkbox"
        name="developerMode"
        :checked="settings.developerMode"
        @change="updateSettings({ developerMode: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('customLanguage.developer') }}
    </label>
    <p class="muted">{{ t('customLanguage.developerHint') }}</p>
    <div class="row wrap">
      <FormButton
        id="language-template"
        type="button"
        @click="download"
        >{{ t('customLanguage.template') }}</FormButton
      >
      <FormButton
        v-if="settings.developerMode"
        id="language-test-notification"
        type="button"
        @click="sendTest"
        >{{ t('customLanguage.testNotification') }}</FormButton
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
      <p
        v-if="SHIPPED.includes(pending.language.code)"
        id="language-replaces"
        class="error"
        role="alert"
      >
        {{ t('customLanguage.replaces', { name: pending.language.code }) }}
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
        <p
          class="error"
          role="alert"
        >
          {{ tn('customLanguage.problems', pending.report.problems.length) }}
        </p>
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
