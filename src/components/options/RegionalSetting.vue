<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { countryName, listCountries, resolveCountry } from '../../utils/contact'
  import { browserTimeZone, formatInstant, listTimeZones } from '../../utils/time'

  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  // "Auto" shows the zone it stands for. The zones are the ones of the browser, by name.
  const zones = computed(() => ({
    auto: t('regional.timeZoneAuto', { zone: browserTimeZone() }),
    ...Object.fromEntries(listTimeZones().map((zone) => [zone, zone.replace(/_/g, ' ')])),
  }))

  // "Auto" shows the country it stands for.
  const countries = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    const automatic = resolveCountry('auto', navigator.language)
    return {
      auto: t('regional.countryAuto', { country: automatic ? countryName(automatic, format.locale.value) : '-' }),
      ...Object.fromEntries(names.sort((a, b) => collator.compare(a[1], b[1]))),
    }
  })

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
    <FormSelect
      :model-value="settings.defaultCountry"
      name="defaultCountry"
      :label="t('regional.defaultCountry')"
      :options="countries"
      @update:model-value="updateSettings({ defaultCountry: String($event) })"
    />
    <p class="muted">{{ t('regional.defaultCountryHint') }}</p>
  </div>
</template>
