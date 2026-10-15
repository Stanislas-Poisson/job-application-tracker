<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { salaryOf, useFormat } from '../../composables/useFormat'
  import { Application } from '../../models'
  import { comparableSalary } from '../../utils/money'
  import DataTable from '../DataTable.vue'

  // Every application in a row, sorted by any column. The row opens the same drawer as the card of the board.
  const emit = defineEmits<{ open: [id: string] }>()

  const { t, statusName } = useApp()
  const format = useFormat()

  const rows = computed(() =>
    useRepo(Application)
      .with('jobOffer', (query) => query.with('company'))
      .with('status')
      .with('tags')
      .get()
  )

  const place = (row: Application) => row.jobOffer?.location ?? row.jobOffer?.city ?? ''
  const tagNames = (row: Application) => (row.tags ?? []).map((tag) => tag.name).join(', ')

  const columns = computed(() => [
    {
      key: 'title',
      label: t('fields.title'),
      sortValue: (row: Application) => row.jobOffer?.title ?? null,
      text: (row: Application) => row.jobOffer?.title ?? '',
    },
    {
      key: 'company',
      label: t('fields.company'),
      sortValue: (row: Application) => row.jobOffer?.company?.name ?? null,
      text: (row: Application) => row.jobOffer?.company?.name ?? '',
    },
    {
      key: 'status',
      label: t('fields.status'),
      sortValue: (row: Application) => row.status?.order ?? null,
      text: (row: Application) => (row.status ? statusName(row.status) : ''),
    },
    {
      key: 'place',
      label: t('fields.location'),
      sortValue: (row: Application) => ('' === place(row) ? null : place(row)),
      text: place,
    },
    {
      key: 'salary',
      label: t('drawer.salary'),
      numeric: true,
      // By the middle of the range, a year, in the home currency when the rates allow it; else nothing to compare.
      sortValue: (row: Application) =>
        row.jobOffer ? comparableSalary(salaryOf(row.jobOffer), format.conversion()) : null,
      text: (row: Application) => (row.jobOffer ? format.salary(row.jobOffer) : ''),
    },
    {
      key: 'priority',
      label: t('labels.priority'),
      sortValue: (row: Application) => row.priority,
      text: (row: Application) => (0 < row.priority ? t(`labels.priorities.${row.priority}`) : ''),
    },
    {
      key: 'favorite',
      label: t('labels.favorite'),
      sortValue: (row: Application) => (row.isFavorite ? 1 : 0),
      text: (row: Application) => (row.isFavorite ? t('table.yes') : ''),
    },
    {
      key: 'tags',
      label: t('labels.manage'),
      sortValue: (row: Application) => ('' === tagNames(row) ? null : tagNames(row)),
      text: tagNames,
    },
    {
      key: 'contract',
      label: t('fields.contractType'),
      hidden: true,
      sortValue: (row: Application) => row.jobOffer?.contractType ?? null,
      text: (row: Application) => row.jobOffer?.contractType ?? '',
    },
    {
      key: 'posted',
      label: t('fields.postedOn'),
      hidden: true,
      sortValue: (row: Application) => row.jobOffer?.postedOn ?? null,
      text: (row: Application) => (row.jobOffer?.postedOn ? format.date(row.jobOffer.postedOn) : ''),
    },
    {
      key: 'applied',
      label: t('table.applied'),
      hidden: true,
      sortValue: (row: Application) => row.appliedAt,
      text: (row: Application) => (row.appliedAt ? format.instant(row.appliedAt) : ''),
    },
    {
      key: 'updated',
      label: t('table.updated'),
      hidden: true,
      sortValue: (row: Application) => row.updatedAt,
      text: (row: Application) => format.instant(row.updatedAt),
    },
  ])

  const searchText = (row: Application) =>
    [
      row.jobOffer?.title,
      row.jobOffer?.company?.name,
      place(row),
      row.jobOffer?.contractType,
      row.status ? statusName(row.status) : '',
      tagNames(row),
    ].join(' ')
</script>

<template>
  <DataTable
    id="applications"
    :caption="t('tables.applications')"
    :columns="columns"
    :rows="rows"
    :row-key="(row: Application) => row.id"
    :search-text="searchText"
    :default-sort="{ key: 'title', direction: 'asc' }"
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
