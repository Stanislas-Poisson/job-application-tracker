<script setup lang="ts">
  import { FormInput } from '@zairakai/vue-components/Form'
  import { useApp } from '../../composables/useApp'

  const { t, settings, updateSettings } = useApp()

  function setFollowUp(text: string) {
    const value = Number(text.trim())
    if (Number.isInteger(value) && 1 <= value && 60 >= value) {
      void updateSettings({ followUpDays: value })
    }
  }
</script>

<template>
  <h2>{{ t('reminders.title') }}</h2>
  <FormInput
    :model-value="settings.followUpDays"
    name="followUpDays"
    type="number"
    min="1"
    max="60"
    :label="t('reminders.followUpDays')"
    @update:model-value="setFollowUp(String($event))"
  />
  <p class="muted">{{ t('reminders.followUpHint') }}</p>
</template>
