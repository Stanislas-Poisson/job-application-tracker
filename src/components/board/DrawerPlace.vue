<script setup lang="ts">
  import { FormButton, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, nextTick, reactive, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, JobOffer, type JobOffer as Offer } from '../../models'
  import { type AddressParts, emptyAddress, formatAddress, normalizeAddress } from '../../services/address'
  import { offerAddressFields } from '../../services/applications'
  import { TRAVEL_MODES, type TravelMode, placeFrom, placeLink, routeIssue, routeLink } from '../../services/maps'
  import AddressFields from '../AddressFields.vue'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()
  const { isEditing } = useDrawerMode()

  const offer = computed(() => props.application.jobOffer)

  // The address of an offer as fields.
  const addressOf = (source: Offer | null | undefined): AddressParts =>
    normalizeAddress({
      line1: source?.addressLine1,
      line2: source?.addressLine2,
      line3: source?.addressLine3,
      postalCode: source?.postalCode,
      city: source?.city,
      region: source?.region,
      country: source?.country,
      latitude: source?.latitude,
      longitude: source?.longitude,
    })

  const stored = computed(() => ({ address: addressOf(offer.value) }))
  // How the route is asked for: the setting, unless the user chooses another way for this offer. It is not kept.
  const form = reactive({ address: emptyAddress(), mode: '' })
  const load = () => Object.assign(form, { address: { ...stored.value.address } })
  watch(() => props.application.id, load, { immediate: true })

  const dirty = computed(() => JSON.stringify(normalizeAddress(form.address)) !== JSON.stringify(stored.value.address))
  useDirtyGuard(() => dirty.value)

  const modeOptions = computed(() => ({
    '': t('place.modeNone'),
    ...Object.fromEntries(TRAVEL_MODES.map((mode) => [mode, t(`place.modes.${mode}`)])),
  }))

  // The links use what is typed, saved or not, so that an address can be tried before it is kept. With no postal address the
  // place the offer names (the city, as the offer says it) is what is shown.
  const choice = computed(() => ({
    provider: settings.mapProvider,
    customTemplate: settings.mapCustomTemplate,
    mode: ('' === form.mode ? settings.travelMode : form.mode) as TravelMode,
  }))
  const destination = computed(() =>
    placeFrom(normalizeAddress(form.address), format.locale.value, offer.value?.location ?? '')
  )
  const origin = computed(() => placeFrom(normalizeAddress(settings.home), format.locale.value))
  const place = computed(() => placeLink(destination.value, choice.value))
  const route = computed(() => routeLink(origin.value, destination.value, choice.value))
  const issue = computed(() => routeIssue(origin.value, destination.value, choice.value))
  // What is said about the route: nothing when there is one, nothing when there is no destination yet.
  const routeNote = computed(() => (null === issue.value || 'destination' === issue.value ? '' : issue.value))
  const oneLine = computed(() => formatAddress(normalizeAddress(form.address), format.locale.value))

  async function save() {
    if (!offer.value) {
      return
    }
    const address = normalizeAddress(form.address)
    useRepo(JobOffer)
      .where('id', offer.value.id)
      .update({
        ...offerAddressFields(address),
        country: '' === address.country ? null : address.country,
      })
    // The form shows what was kept, once the drawer has the new values.
    await nextTick()
    load()
  }
</script>

<template>
  <section
    v-if="isEditing || '' !== oneLine"
    id="place"
  >
    <h3>{{ t('place.title') }}</h3>
    <form
      v-if="isEditing"
      class="stack"
      @submit.prevent="save"
    >
      <AddressFields
        v-model="form.address"
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
        v-model="form.mode"
        name="routeMode"
        :label="t('place.routeMode')"
        :options="modeOptions"
      />
      <div class="row">
        <FormButton
          type="submit"
          :disabled="!dirty"
          >{{ t('place.save') }}</FormButton
        >
        <span
          v-if="dirty"
          class="muted"
          role="status"
          >{{ t('dirty.unsaved') }}</span
        >
      </div>
    </form>
    <div
      v-else
      class="stack"
    >
      <p
        id="address-line"
        dir="auto"
      >
        {{ oneLine }}
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
