<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { countryName, listCountries, resolveCountry } from '../../utils/contact'
  import {
    DATE_FORMATS,
    type DateFormat,
    MAX_PATTERN,
    RELATIVE_MODES,
    TIME_FORMATS,
    formatPlainDate,
    formatTime,
    isPattern,
  } from '../../utils/dateFormat'
  import { browserTimeZone, listTimeZones } from '../../utils/time'

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

  const now = computed(() => format.absolute(new Date().toISOString()))

  // Each choice shows how it writes today, in the language and the time zone in use.
  const sample = computed(() => new Date().toISOString())
  const example = (date: DateFormat) =>
    formatPlainDate(sample.value.slice(0, 10), { ...format.style.value, date, relative: 'off' })
  const dateOptions = computed(() =>
    Object.fromEntries(
      DATE_FORMATS.map((value) => [value, t(`regional.dateFormats.${value}`, { example: example(value) })])
    )
  )
  const timeOptions = computed(() =>
    Object.fromEntries(
      TIME_FORMATS.map((value) => [
        value,
        t(`regional.timeFormats.${value}`, {
          example: formatTime(sample.value, { ...format.style.value, time: value }),
        }),
      ])
    )
  )
  const relativeOptions = computed(() =>
    Object.fromEntries(RELATIVE_MODES.map((value) => [value, t(`regional.relatives.${value}`)]))
  )
  const patternProblem = computed(() => !isPattern(settings.dateCustom))
  const preview = computed(() => format.instant(sample.value))

  // The pattern is kept only while it is valid: the setting never holds an empty or a too long one.
  function setPattern(value: string) {
    if (isPattern(value)) {
      void updateSettings({ dateCustom: value })
    }
  }
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

    <h3>{{ t('regional.datesTitle') }}</h3>
    <FormSelect
      :model-value="settings.dateFormat"
      name="dateFormat"
      :label="t('regional.dateFormat')"
      :options="dateOptions"
      @update:model-value="updateSettings({ dateFormat: String($event) as DateFormat })"
    />
    <template v-if="'custom' === settings.dateFormat">
      <FormInput
        :model-value="settings.dateCustom"
        name="dateCustom"
        :label="t('regional.dateCustom')"
        :maxlength="MAX_PATTERN"
        @update:model-value="setPattern(String($event))"
      />
      <p class="muted">{{ t('regional.dateCustomHint') }}</p>
      <p
        v-if="patternProblem"
        class="error"
      >
        {{ t('regional.dateCustomProblem', { max: MAX_PATTERN }) }}
      </p>
    </template>
    <FormSelect
      :model-value="settings.timeFormat"
      name="timeFormat"
      :label="t('regional.timeFormat')"
      :options="timeOptions"
      @update:model-value="updateSettings({ timeFormat: String($event) as never })"
    />
    <FormSelect
      :model-value="settings.relativeDates"
      name="relativeDates"
      :label="t('regional.relative')"
      :options="relativeOptions"
      @update:model-value="updateSettings({ relativeDates: String($event) as never })"
    />
    <p
      id="date-preview"
      class="muted"
    >
      {{ t('regional.datePreview', { example: preview }) }}
    </p>
  </div>
</template>
