<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed, ref, watch } from 'vue'
  import { useApp } from '../composables/useApp'
  import { useFormat } from '../composables/useFormat'
  import { type AddressParts, formatCoordinates, parseCoordinates } from '../services/address'
  import { countryName, listCountries } from '../utils/contact'

  // The fields of a postal address: three lines, the postal code, the city, the region, the country and, if known, the position on
  // a map. Used for the workplace of an offer and for the address a route starts from. `prefix` makes the names of the fields.
  const props = defineProps<{ modelValue: AddressParts; prefix: string }>()
  const emit = defineEmits<{ 'update:modelValue': [value: AddressParts] }>()

  const { t } = useApp()
  const format = useFormat()

  const set = (changes: Partial<AddressParts>) => emit('update:modelValue', { ...props.modelValue, ...changes })

  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })

  // The position is typed as a map gives it ("47.39, 0.68"), kept as text while it is being typed, and understood when it can be.
  const coordinates = ref(formatCoordinates(props.modelValue))
  const problem = ref(false)
  watch(
    () => formatCoordinates(props.modelValue),
    (written) => {
      // Another change of the address (a save, a switch of offer) gives the text again; what is being typed is left alone.
      if (!problem.value) {
        coordinates.value = written
      }
    }
  )

  function typed(text: string) {
    coordinates.value = text
    if ('' === text.trim()) {
      problem.value = false
      set({ latitude: null, longitude: null })
      return
    }
    const found = parseCoordinates(text)
    problem.value = null === found
    if (found) {
      set(found)
    }
  }
</script>

<template>
  <div class="stack address-fields">
    <FormInput
      :model-value="modelValue.line1"
      :name="`${prefix}Line1`"
      :label="t('address.line1')"
      autocomplete="address-line1"
      @update:model-value="set({ line1: String($event) })"
    />
    <div class="row">
      <FormInput
        :model-value="modelValue.line2"
        :name="`${prefix}Line2`"
        :label="t('address.line2')"
        autocomplete="address-line2"
        @update:model-value="set({ line2: String($event) })"
      />
      <FormInput
        :model-value="modelValue.line3"
        :name="`${prefix}Line3`"
        :label="t('address.line3')"
        autocomplete="address-line3"
        @update:model-value="set({ line3: String($event) })"
      />
    </div>
    <div class="row">
      <FormInput
        :model-value="modelValue.postalCode"
        :name="`${prefix}PostalCode`"
        :label="t('address.postalCode')"
        autocomplete="postal-code"
        @update:model-value="set({ postalCode: String($event) })"
      />
      <FormInput
        :model-value="modelValue.city"
        :name="`${prefix}City`"
        :label="t('address.city')"
        autocomplete="address-level2"
        @update:model-value="set({ city: String($event) })"
      />
    </div>
    <div class="row">
      <FormInput
        :model-value="modelValue.region"
        :name="`${prefix}Region`"
        :label="t('address.region')"
        autocomplete="address-level1"
        @update:model-value="set({ region: String($event) })"
      />
      <FormSelect
        :model-value="modelValue.country"
        :name="`${prefix}Country`"
        :label="t('fields.country')"
        :options="countryOptions"
        @update:model-value="set({ country: String($event) })"
      />
    </div>
    <FormInput
      :model-value="coordinates"
      :name="`${prefix}Coordinates`"
      :label="t('address.coordinates')"
      :placeholder="t('address.coordinatesHint')"
      @update:model-value="typed(String($event))"
    />
    <p
      v-if="problem"
      class="error"
      role="alert"
    >
      {{ t('address.coordinatesProblem') }}
    </p>
  </div>
</template>
