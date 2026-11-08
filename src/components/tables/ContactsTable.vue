<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { ApplicationContact, Contact, ContactCompany } from '../../models'
  import { countryName, formatPhone, languageName } from '../../utils/contact'
  import DataTable from '../DataTable.vue'

  // Every person in a row: the role, the companies they work for, the main email and phone, how many applications they are
  // linked to. The row opens the drawer of the contact, where what is shared is edited once.
  const emit = defineEmits<{ open: [id: string] }>()

  const { t } = useApp()
  const format = useFormat()

  const rows = computed(() => useRepo(Contact).with('methods').get())
  const companies = computed(() => {
    const byContact = new Map<string, string[]>()
    for (const link of useRepo(ContactCompany).with('company').get()) {
      byContact.set(link.contactId, [...(byContact.get(link.contactId) ?? []), link.company?.name ?? ''])
    }
    return byContact
  })
  const applicationCounts = computed(() => {
    const counts = new Map<string, number>()
    for (const link of useRepo(ApplicationContact).all()) {
      counts.set(link.contactId, (counts.get(link.contactId) ?? 0) + 1)
    }
    return counts
  })

  const name = (row: Contact) => `${row.firstName} ${row.lastName}`.trim()
  const companyNames = (row: Contact) => (companies.value.get(row.id) ?? []).filter(Boolean).join(', ')
  // The main way of a type, or the first one there is.
  const main = (row: Contact, type: string) => {
    const methods = (row.methods ?? []).filter((method) => method.type === type)
    return (methods.find((method) => method.isPrimary) ?? methods[0])?.value ?? ''
  }
  const phone = (row: Contact) => ('' === main(row, 'phone') ? '' : formatPhone(main(row, 'phone')))
  const languages = (row: Contact) =>
    (row.languages ?? []).map((tag) => languageName(tag, format.locale.value)).join(', ')

  const columns = computed(() => [
    { key: 'name', label: t('contactPage.name'), sortValue: (row: Contact) => name(row), text: name },
    {
      key: 'role',
      label: t('fields.role'),
      sortValue: (row: Contact) => row.role,
      text: (row: Contact) => row.role ?? '',
    },
    {
      key: 'companies',
      label: t('tables.companies'),
      sortValue: (row: Contact) => ('' === companyNames(row) ? null : companyNames(row)),
      text: companyNames,
    },
    {
      key: 'email',
      label: t('fields.email'),
      sortValue: (row: Contact) => ('' === main(row, 'email') ? null : main(row, 'email')),
      text: (row: Contact) => main(row, 'email'),
    },
    {
      key: 'phone',
      label: t('fields.phone'),
      sortValue: (row: Contact) => ('' === phone(row) ? null : phone(row)),
      text: phone,
    },
    {
      key: 'applications',
      label: t('tables.applications'),
      numeric: true,
      sortValue: (row: Contact) => applicationCounts.value.get(row.id) ?? 0,
      text: (row: Contact) => String(applicationCounts.value.get(row.id) ?? 0),
    },
    {
      key: 'favorite',
      label: t('labels.favorite'),
      sortValue: (row: Contact) => (row.isFavorite ? 1 : 0),
      text: (row: Contact) => (row.isFavorite ? t('table.yes') : ''),
    },
    {
      key: 'country',
      label: t('fields.country'),
      hidden: true,
      sortValue: (row: Contact) => (row.country ? countryName(row.country, format.locale.value) : null),
      text: (row: Contact) => (row.country ? countryName(row.country, format.locale.value) : ''),
    },
    {
      key: 'timeZone',
      label: t('fields.timeZone'),
      hidden: true,
      sortValue: (row: Contact) => row.timeZone,
      text: (row: Contact) => row.timeZone ?? '',
    },
    {
      key: 'languages',
      label: t('contactPage.languages'),
      hidden: true,
      sortValue: (row: Contact) => ('' === languages(row) ? null : languages(row)),
      text: languages,
    },
    {
      key: 'linkedin',
      label: t('fields.linkedin'),
      hidden: true,
      sortValue: (row: Contact) => ('' === main(row, 'linkedin') ? null : main(row, 'linkedin')),
      text: (row: Contact) => main(row, 'linkedin'),
    },
  ])

  const searchText = (row: Contact) =>
    [name(row), row.role, companyNames(row), main(row, 'email'), phone(row), languages(row)].join(' ')
</script>

<template>
  <DataTable
    id="contacts"
    :caption="t('tables.contacts')"
    :columns="columns"
    :rows="rows"
    :row-key="(row: Contact) => row.id"
    :search-text="searchText"
    :default-sort="{ key: 'name', direction: 'asc' }"
    @open="emit('open', $event.id)"
  >
    <template #cell-favorite="{ row }">
      <template v-if="row.isFavorite">
        <span aria-hidden="true">★</span>
        <span class="sr-only">{{ t('table.yes') }}</span>
      </template>
    </template>
  </DataTable>
</template>
