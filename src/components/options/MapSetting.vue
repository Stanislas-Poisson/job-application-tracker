<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { PROVIDERS, TRAVEL_MODES, isValidTemplate } from '../../services/maps'
  import AddressFields from '../AddressFields.vue'

  const { t, settings, updateSettings } = useApp()

  const providerOptions = computed(() =>
    Object.fromEntries(PROVIDERS.map((provider) => [provider, t(`map.providers.${provider}`)]))
  )
  const modeOptions = computed(() => Object.fromEntries(TRAVEL_MODES.map((mode) => [mode, t(`place.modes.${mode}`)])))
  const templateProblem = computed(
    () =>
      'custom' === settings.mapProvider &&
      '' !== settings.mapCustomTemplate &&
      !isValidTemplate(settings.mapCustomTemplate)
  )
</script>

<template>
  <h2>{{ t('map.title') }}</h2>
  <p class="muted">{{ t('map.hint') }}</p>
  <FormSelect
    :model-value="settings.mapProvider"
    name="mapProvider"
    :label="t('map.provider')"
    :options="providerOptions"
    @update:model-value="updateSettings({ mapProvider: $event as never })"
  />
  <p
    v-if="'osm' === settings.mapProvider"
    class="muted"
  >
    {{ t('map.osmNote') }}
  </p>
  <template v-if="'custom' === settings.mapProvider">
    <FormInput
      :model-value="settings.mapCustomTemplate"
      name="mapCustomTemplate"
      :label="t('map.custom')"
      @update:model-value="updateSettings({ mapCustomTemplate: String($event).trim() })"
    />
    <p class="muted">{{ t('map.customHint') }}</p>
    <p
      v-if="templateProblem"
      class="error"
    >
      {{ t('map.customProblem') }}
    </p>
  </template>
  <h3>{{ t('map.home') }}</h3>
  <p class="muted">{{ t('map.homeHint') }}</p>
  <AddressFields
    :model-value="settings.home"
    prefix="home"
    @update:model-value="updateSettings({ home: $event })"
  />
  <FormSelect
    :model-value="settings.travelMode"
    name="travelMode"
    :label="t('map.mode')"
    :options="modeOptions"
    @update:model-value="updateSettings({ travelMode: $event as never })"
  />
</template>
