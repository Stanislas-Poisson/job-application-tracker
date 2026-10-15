<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { Company, CompanyRelation, ContactCompany } from '../../models'
  import { linksOf } from '../../services/companyRelations'
  import { countryName } from '../../utils/contact'
  import DataTable from '../DataTable.vue'

  // Every company in a row: how many offers it has and in which state, where it is, the people who work there, and its links with
  // other companies. The row opens the drawer of the company, where what is shared is edited once.
  const emit = defineEmits<{ open: [id: string] }>()

  const { t, statusName } = useApp()
  const format = useFormat()

  const rows = computed(() => {
    // Reading the links makes the table follow them.
    useRepo(CompanyRelation).all()
    return useRepo(Company)
      .with('offers', (query) => query.with('applications', (applications) => applications.with('status')))
      .get()
  })
  const people = computed(() => {
    const byCompany = new Map<string, Set<string>>()
    for (const link of useRepo(ContactCompany).all()) {
      byCompany.set(link.companyId, (byCompany.get(link.companyId) ?? new Set()).add(link.contactId))
    }
    return byCompany
  })

  const applicationsOf = (company: Company) => (company.offers ?? []).flatMap((offer) => offer.applications ?? [])
  // "Applied 2, Rejected 1": the state of the applications, in the order of the columns of the board.
  const states = (company: Company): string => {
    const counts = new Map<string, { order: number; name: string; count: number }>()
    for (const application of applicationsOf(company)) {
      if (application.status) {
        const entry = counts.get(application.status.id) ?? {
          order: application.status.order,
          name: statusName(application.status),
          count: 0,
        }
        entry.count += 1
        counts.set(application.status.id, entry)
      }
    }
    return [...counts.values()]
      .sort((a, b) => a.order - b.order)
      .map((entry) => `${entry.name} ${entry.count}`)
      .join(', ')
  }
  const links = (company: Company): string =>
    linksOf(company.id)
      .map((link) => `${t(`company.links.${link.view}`)} ${link.other.name}`)
      .join(', ')
  const peopleCount = (company: Company) => people.value.get(company.id)?.size ?? 0

  const columns = computed(() => [
    {
      key: 'name',
      label: t('fields.company'),
      sortValue: (row: Company) => row.name,
      text: (row: Company) => row.name,
    },
    {
      key: 'offers',
      label: t('companyPage.offers'),
      numeric: true,
      sortValue: (row: Company) => (row.offers ?? []).length,
      text: (row: Company) => String((row.offers ?? []).length),
    },
    {
      key: 'states',
      label: t('companyPage.states'),
      sortValue: (row: Company) => ('' === states(row) ? null : states(row)),
      text: states,
    },
    {
      key: 'city',
      label: t('address.city'),
      sortValue: (row: Company) => row.city,
      text: (row: Company) => row.city ?? '',
    },
    {
      key: 'people',
      label: t('drawer.contacts'),
      numeric: true,
      sortValue: peopleCount,
      text: (row: Company) => String(peopleCount(row)),
    },
    {
      key: 'links',
      label: t('companyPage.links'),
      sortValue: (row: Company) => ('' === links(row) ? null : links(row)),
      text: links,
    },
    {
      key: 'country',
      label: t('fields.country'),
      hidden: true,
      sortValue: (row: Company) => (row.country ? countryName(row.country, format.locale.value) : null),
      text: (row: Company) => (row.country ? countryName(row.country, format.locale.value) : ''),
    },
    {
      key: 'sector',
      label: t('companyPage.sector'),
      hidden: true,
      sortValue: (row: Company) => row.sector,
      text: (row: Company) => row.sector ?? '',
    },
    {
      key: 'website',
      label: t('companyPage.website'),
      hidden: true,
      sortValue: (row: Company) => row.website,
      text: (row: Company) => row.website ?? '',
    },
  ])

  const searchText = (row: Company) => [row.name, row.city, row.sector, row.website, states(row), links(row)].join(' ')
</script>

<template>
  <DataTable
    id="companies"
    :caption="t('tables.companies')"
    :columns="columns"
    :rows="rows"
    :row-key="(row: Company) => row.id"
    :search-text="searchText"
    :default-sort="{ key: 'name', direction: 'asc' }"
    @open="emit('open', $event.id)"
  />
</template>
