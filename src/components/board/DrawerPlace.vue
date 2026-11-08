<script setup lang="ts">
  import { FormSelect } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useCardDraft } from '../../composables/useCardDraft'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'
  import { formatAddress, hasCoordinates, normalizeAddress } from '../../services/address'
  import { TRAVEL_MODES, type TravelMode, placeFrom, placeLink, routeIssue, routeLink } from '../../services/maps'
  import AddressFields from '../AddressFields.vue'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()
  const { isEditing } = useDrawerMode()

  const offer = computed(() => props.application.jobOffer)

  // The address is part of the draft of the card: the form edits it, and nothing is written until the card is saved.
  const { draft, stored } = useCardDraft()
  // While editing, what is typed, saved or not, so that an address can be tried before it is kept; otherwise what is stored.
  const address = computed(() => (isEditing.value ? draft.address : stored.value.address))
  // How the route is asked for: the setting, unless the user chooses another way for this offer. It is not kept.
  const mode = ref('')

  const modeOptions = computed(() => ({
    '': t('place.modeNone'),
    ...Object.fromEntries(TRAVEL_MODES.map((mode) => [mode, t(`place.modes.${mode}`)])),
  }))

  // The links use what is typed, saved or not, so that an address can be tried before it is kept. With no postal address the
  // place the offer names (the city, as the offer says it) is what is shown.
  const choice = computed(() => ({
    provider: settings.mapProvider,
    customTemplate: settings.mapCustomTemplate,
    mode: ('' === mode.value ? settings.travelMode : mode.value) as TravelMode,
  }))
  const destination = computed(() =>
    placeFrom(normalizeAddress(address.value), format.locale.value, offer.value?.location ?? '')
  )
  const origin = computed(() => placeFrom(normalizeAddress(settings.home), format.locale.value))
  const place = computed(() => placeLink(destination.value, choice.value))
  // A real address is more than the country, which the details already say.
  const hasAddress = computed(() => {
    const parts = normalizeAddress(address.value)
    return (
      '' !== [parts.line1, parts.line2, parts.line3, parts.postalCode, parts.city, parts.region].join('') ||
      hasCoordinates(parts)
    )
  })
  const route = computed(() => routeLink(origin.value, destination.value, choice.value))
  const issue = computed(() => routeIssue(origin.value, destination.value, choice.value))
  // What is said about the route: nothing when there is one, nothing when there is no destination yet.
  const routeNote = computed(() => (null === issue.value || 'destination' === issue.value ? '' : issue.value))
  const oneLine = computed(() => formatAddress(normalizeAddress(address.value), format.locale.value))
</script>

<template>
  <section
    v-if="isEditing || hasAddress || place"
    id="place"
  >
    <h3>{{ t('place.title') }}</h3>
    <form
      v-if="isEditing"
      class="stack"
      @submit.prevent
    >
      <AddressFields
        v-model="draft.address"
        prefix="address"
      />
      <p
        v-if="'' !== oneLine"
        class="muted"
        id="address-line"
      >
        {{ t('address.preview') }}: {{ oneLine }}
      </p>
      <div class="row">
        <a
          v-if="place"
          id="map-place"
          :href="place"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('place.show') }}</a
        >
        <a
          v-if="route"
          id="map-route"
          :href="route"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('place.route') }}</a
        >
      </div>
      <p
        v-if="routeNote"
        class="muted"
      >
        {{ t(`place.notes.${routeNote}`) }}
      </p>
      <p
        v-if="place"
        class="muted"
      >
        {{ t('place.privacy') }}
      </p>
      <FormSelect
        v-model="mode"
        name="routeMode"
        :label="t('place.routeMode')"
        :options="modeOptions"
      />
    </form>
    <div
      v-else
      class="stack"
    >
      <p
        v-if="hasAddress"
        id="address-line"
        class="reading-line"
      >
        <bdi>{{ oneLine }}</bdi>
      </p>
      <div class="row">
        <a
          v-if="place"
          id="map-place"
          :href="place"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('place.show') }}</a
        >
        <a
          v-if="route"
          id="map-route"
          :href="route"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('place.route') }}</a
        >
      </div>
      <p
        v-if="routeNote"
        class="muted"
      >
        {{ t(`place.notes.${routeNote}`) }}
      </p>
    </div>
  </section>
</template>
