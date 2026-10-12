<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { browserTimeZone, formatInstant, listTimeZones } from '../../utils/time'

  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  // "Auto" shows the zone it stands for. The zones are the ones of the browser, by name.
  const zones = computed(() => ({
    auto: t('regional.timeZoneAuto', { zone: browserTimeZone() }),
    ...Object.fromEntries(listTimeZones().map((zone) => [zone, zone.replace(/_/g, ' ')])),
  }))

  const now = computed(() =>
    formatInstant(new Date().toISOString(), { locale: format.locale.value, timeZone: format.timeZone.value })
  )
</script>

<template>
  <h2>{{ t('regional.title') }}</h2>
  <div class="stack">
    <FormSelect
      :model-value="settings.timeZone"
      name="timeZone"
      :label="t('regional.timeZone')"
      :options="zones"
      @update:model-value="updateSettings({ timeZone: String($event) })"
    />
    <p class="muted">{{ t('regional.timeZoneHint', { now }) }}</p>
  </div>
</template>
