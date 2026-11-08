<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { JobOffer } from '../../models'
  import { formatAddress, hasCoordinates, normalizeAddress } from '../../services/address'
  import { type TravelMode, placeFrom, placeLink } from '../../services/maps'
  import { countryName } from '../../utils/contact'
  import DataTable from '../DataTable.vue'

  // The workplaces of the offers: where each one is, its company and the offer, and the link that opens the place on the map
  // chosen in the options. The row opens the application of the offer, where the address is edited.
  const emit = defineEmits<{ open: [id: string] }>()

  const { t, settings } = useApp()
  const format = useFormat()

  const addressOf = (offer: JobOffer) =>
    normalizeAddress({
      line1: offer.addressLine1,
      line2: offer.addressLine2,
      line3: offer.addressLine3,
      postalCode: offer.postalCode,
      city: offer.city,
      region: offer.region,
      country: offer.country,
      latitude: offer.latitude,
      longitude: offer.longitude,
    })
  // The address in one line, or the place the offer names when it has no address of its own.
  const line = (offer: JobOffer) => {
    const parts = addressOf(offer)
    const hasParts =
      '' !== [parts.line1, parts.line2, parts.line3, parts.postalCode, parts.city, parts.region].join('') ||
      hasCoordinates(parts)
    return hasParts ? formatAddress(parts, format.locale.value) : (offer.location ?? '')
  }
  const link = (offer: JobOffer) =>
    placeLink(placeFrom(addressOf(offer), format.locale.value, offer.location ?? ''), {
      provider: settings.mapProvider,
      customTemplate: settings.mapCustomTemplate,
      mode: settings.travelMode as TravelMode,
    })

  // The offers that have a place, and an application to open (the row opens it).
  const rows = computed(() =>
    useRepo(JobOffer)
      .with('company')
      .with('applications')
      .get()
      .filter((offer) => '' !== line(offer) && 0 < (offer.applications ?? []).length)
  )

  const coordinates = (offer: JobOffer) =>
    null !== offer.latitude && null !== offer.longitude ? `${offer.latitude}, ${offer.longitude}` : ''

  const columns = computed(() => [
    {
      key: 'address',
      label: t('addressPage.address'),
      sortValue: (row: JobOffer) => line(row),
      text: line,
    },
    {
      key: 'city',
      label: t('address.city'),
      sortValue: (row: JobOffer) => row.city,
      text: (row: JobOffer) => row.city ?? '',
    },
    {
      key: 'postalCode',
      label: t('address.postalCode'),
      sortValue: (row: JobOffer) => row.postalCode,
      text: (row: JobOffer) => row.postalCode ?? '',
    },
    {
      key: 'country',
      label: t('fields.country'),
      sortValue: (row: JobOffer) => (row.country ? countryName(row.country, format.locale.value) : null),
      text: (row: JobOffer) => (row.country ? countryName(row.country, format.locale.value) : ''),
    },
    {
      key: 'company',
      label: t('fields.company'),
      sortValue: (row: JobOffer) => row.company?.name ?? null,
      text: (row: JobOffer) => row.company?.name ?? '',
    },
    {
      key: 'offer',
      label: t('fields.title'),
      sortValue: (row: JobOffer) => row.title,
      text: (row: JobOffer) => row.title,
    },
    {
      key: 'map',
      label: t('addressPage.map'),
      sortValue: () => null,
      text: () => '',
    },
    {
      key: 'coordinates',
      label: t('address.coordinates'),
      hidden: true,
      numeric: true,
      sortValue: (row: JobOffer) => row.latitude,
      text: coordinates,
    },
  ])

  const searchText = (row: JobOffer) => [line(row), row.company?.name, row.title, row.postalCode].join(' ')
</script>

<template>
  <DataTable
    id="addresses"
    :caption="t('tables.addresses')"
    :columns="columns"
    :rows="rows"
    :row-key="(row: JobOffer) => row.id"
    :search-text="searchText"
    :default-sort="{ key: 'address', direction: 'asc' }"
    @open="emit('open', $event.applications?.[0]?.id ?? '')"
  >
    <template #cell-map="{ row }">
      <a
        v-if="link(row)"
        :href="link(row) ?? undefined"
        target="_blank"
        rel="noopener noreferrer"
        >{{ t('place.show') }}</a
      >
    </template>
  </DataTable>
</template>
