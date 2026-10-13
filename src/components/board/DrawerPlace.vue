<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useDirtyGuard } from '../../composables/useDirty'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, JobOffer, type JobOffer as Offer } from '../../models'
  import { type AddressParts, emptyAddress, formatAddress, normalizeAddress } from '../../services/address'
  import { offerAddressFields } from '../../services/applications'
  import {
    TRAVEL_MODES,
    type TravelMode,
    formatCommute,
    placeFrom,
    placeLink,
    routeIssue,
    routeLink,
  } from '../../services/maps'
  import AddressFields from '../AddressFields.vue'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()

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

  // The way there is kept in metres and minutes; the form shows kilometres and minutes.
  const kilometres = (meters: number | null | undefined) => (null == meters ? '' : String(meters / 1000))
  const stored = computed(() => ({
    address: addressOf(offer.value),
    km: kilometres(offer.value?.commuteMeters),
    minutes: null == offer.value?.commuteMinutes ? '' : String(offer.value.commuteMinutes),
    mode: offer.value?.commuteMode ?? '',
  }))
  const form = reactive({ address: emptyAddress(), km: '', minutes: '', mode: '' })
  const load = () => Object.assign(form, { ...stored.value, address: { ...stored.value.address } })
  watch(() => props.application.id, load, { immediate: true })

  const dirty = computed(
    () =>
      JSON.stringify(normalizeAddress(form.address)) !== JSON.stringify(stored.value.address) ||
      form.km !== stored.value.km ||
      form.minutes !== stored.value.minutes ||
      form.mode !== stored.value.mode
  )
  useDirtyGuard(() => dirty.value)
  const problem = ref('')

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

  const number = (text: string): number | null => {
    const value = Number(text.trim().replace(',', '.'))
    return '' !== text.trim() && Number.isFinite(value) && 0 <= value ? value : null
  }

  async function save() {
    problem.value = ''
    const km = '' === form.km.trim() ? null : number(form.km)
    const minutes = '' === form.minutes.trim() ? null : number(form.minutes)
    if (
      ('' !== form.km.trim() && null === km) ||
      ('' !== form.minutes.trim() && (null === minutes || !Number.isInteger(minutes)))
    ) {
      problem.value = t('place.errors.number')
      return
    }
    if (null !== minutes && 24 * 60 < minutes) {
      problem.value = t('place.errors.long')
      return
    }
    if (!offer.value) {
      return
    }
    const address = normalizeAddress(form.address)
    useRepo(JobOffer)
      .where('id', offer.value.id)
      .update({
        ...offerAddressFields(address),
        country: '' === address.country ? null : address.country,
        commuteMeters: null === km ? null : Math.round(km * 1000),
        commuteMinutes: minutes,
        commuteMode: '' === form.mode ? null : form.mode,
      })
    // The form shows what was kept, once the drawer has the new values.
    await nextTick()
    load()
  }

  const saved = computed(() => formatCommute(offer.value?.commuteMeters ?? null, offer.value?.commuteMinutes ?? null))
</script>

<template>
  <section id="place">
    <h3>{{ t('place.title') }}</h3>
    <form
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
      <h4>{{ t('place.found') }}</h4>
      <div class="row">
        <FormInput
          v-model="form.km"
          name="commuteKm"
          :label="t('place.km')"
        />
        <FormInput
          v-model="form.minutes"
          name="commuteMinutes"
          :label="t('place.minutes')"
        />
        <FormSelect
          v-model="form.mode"
          name="commuteMode"
          :label="t('place.mode')"
          :options="modeOptions"
        />
      </div>
      <p
        v-if="problem"
        class="error"
      >
        {{ problem }}
      </p>
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
        <strong
          v-else-if="saved"
          id="commute-saved"
          >{{ saved }}</strong
        >
      </div>
    </form>
  </section>
</template>
