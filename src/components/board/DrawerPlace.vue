<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useDirtyGuard } from '../../composables/useDirty'
  import { type Application, JobOffer } from '../../models'
  import { TRAVEL_MODES, type TravelMode, canRoute, formatCommute, placeLink, routeLink } from '../../services/maps'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()

  const offer = computed(() => props.application.jobOffer)

  // The way there is kept in metres and minutes; the form shows kilometres and minutes.
  const kilometres = (meters: number | null | undefined) => (null == meters ? '' : String(meters / 1000))
  const stored = computed(() => ({
    address: offer.value?.address ?? '',
    km: kilometres(offer.value?.commuteMeters),
    minutes: null == offer.value?.commuteMinutes ? '' : String(offer.value.commuteMinutes),
    mode: offer.value?.commuteMode ?? '',
  }))
  const form = reactive({ address: '', km: '', minutes: '', mode: '' })
  watch(
    () => props.application.id,
    () => Object.assign(form, stored.value),
    { immediate: true }
  )

  const dirty = computed(() =>
    (Object.keys(stored.value) as (keyof typeof form)[]).some((key) => form[key] !== stored.value[key])
  )
  useDirtyGuard(() => dirty.value)
  const problem = ref('')

  const modeOptions = computed(() => ({
    '': t('place.modeNone'),
    ...Object.fromEntries(TRAVEL_MODES.map((mode) => [mode, t(`place.modes.${mode}`)])),
  }))

  // The links use what is typed, saved or not, so that an address can be tried before it is kept.
  const choice = computed(() => ({
    provider: settings.mapProvider,
    customTemplate: settings.mapCustomTemplate,
    mode: ('' === form.mode ? settings.travelMode : form.mode) as TravelMode,
  }))
  const place = computed(() => placeLink(form.address, choice.value))
  const route = computed(() => routeLink(settings.homeAddress, form.address, choice.value))
  const routeNote = computed<'' | 'osm' | 'home'>(() => {
    if ('' === form.address.trim()) {
      return ''
    }
    if (!canRoute(choice.value)) {
      return 'osm'
    }
    return '' === settings.homeAddress.trim() ? 'home' : ''
  })

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
    useRepo(JobOffer)
      .where('id', offer.value.id)
      .update({
        address: '' === form.address.trim() ? null : form.address.trim(),
        commuteMeters: null === km ? null : Math.round(km * 1000),
        commuteMinutes: minutes,
        commuteMode: '' === form.mode ? null : form.mode,
      })
    // The form shows what was kept, once the drawer has the new values.
    await nextTick()
    Object.assign(form, stored.value)
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
      <FormInput
        v-model="form.address"
        name="address"
        :label="t('place.address')"
        :placeholder="t('place.addressHint')"
      />
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
