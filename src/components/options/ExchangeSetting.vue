<script setup lang="ts">
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { normalizeEmails } from '../../settings'

  const { t, settings, updateSettings } = useApp()

  const text = ref(settings.ownEmails.join('\n'))

  // The list is cleaned when the field is left, not while it is typed: a half-typed address is not an address yet.
  function save() {
    const emails = normalizeEmails(text.value.split(/[\s,;]+/).filter(Boolean))
    text.value = emails.join('\n')
    void updateSettings({ ownEmails: emails })
  }
</script>

<template>
  <h2>{{ t('exchangeSettings.title') }}</h2>
  <div class="stack">
    <label class="field">
      <span>{{ t('exchangeSettings.ownEmails') }}</span>
      <textarea
        v-model="text"
        name="ownEmails"
        rows="3"
        dir="ltr"
        @change="save"
      />
    </label>
    <p class="muted">{{ t('exchangeSettings.ownEmailsHint') }}</p>
  </div>
</template>
