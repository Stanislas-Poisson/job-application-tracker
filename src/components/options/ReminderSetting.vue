<script setup lang="ts">
  import { FormInput } from '@zairakai/vue-components/Form'
  import { ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { dropNotifications, requestNotifications } from '../../services/notifications'

  const { t, settings, updateSettings } = useApp()

  // The browser refused the permission: the switch stays off, and the page says why.
  const denied = ref(false)

  function setFollowUp(text: string) {
    const value = Number(text.trim())
    if (Number.isInteger(value) && 1 <= value && 60 >= value) {
      void updateSettings({ followUpDays: value })
    }
  }

  // The notifications are an optional permission: asked when the switch goes on, given up when it goes off.
  async function setNotify(event: Event) {
    const box = event.target as HTMLInputElement
    denied.value = false
    if (box.checked) {
      if (!(await requestNotifications())) {
        box.checked = false
        denied.value = true
        return
      }
      await updateSettings({ notifyReminders: true })
    } else {
      await updateSettings({ notifyReminders: false })
      await dropNotifications()
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

  <label class="row">
    <input
      id="notify-reminders"
      type="checkbox"
      :checked="settings.notifyReminders"
      @change="setNotify"
    />
    {{ t('reminders.notify') }}
  </label>
  <p class="muted">{{ t('reminders.notifyHint') }}</p>
  <p
    v-if="denied"
    id="notify-denied"
    class="error"
  >
    {{ t('reminders.denied') }}
  </p>
  <label
    v-if="settings.notifyReminders"
    class="row"
  >
    <input
      id="notify-persistent"
      type="checkbox"
      :checked="settings.notifyPersistent"
      @change="updateSettings({ notifyPersistent: ($event.target as HTMLInputElement).checked })"
    />
    {{ t('reminders.persistent') }}
  </label>
  <p class="muted">{{ t('reminders.badgeHint') }}</p>
</template>
