<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useProvidedView } from '../../composables/useBoardView'
  import { Company, Source, Tag } from '../../models'
  import { DEFAULT_DIRECTION, SORTS, type Sort, type SortDirection, activeFilters } from '../../services/boardQuery'
  import ItemSymbol from '../ItemSymbol.vue'

  defineProps<{ shown: number; total: number }>()
  const emit = defineEmits<{ clear: [] }>()

  const { t } = useApp()
  const view = useProvidedView()

  const tags = computed(() => useRepo(Tag).orderBy('name').get())
  const sourceOptions = computed(() => ({
    '': t('filters.anySource'),
    ...Object.fromEntries(
      useRepo(Source)
        .all()
        .map((source) => [source.id, source.label])
    ),
  }))
  const companyOptions = computed(() => ({
    '': t('filters.anyCompany'),
    ...Object.fromEntries(
      useRepo(Company)
        .all()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((company) => [company.id, company.name])
    ),
  }))
  const priorityOptions = computed(() => ({
    '0': t('filters.anyPriority'),
    '1': t('filters.atLeast', { level: t('labels.priorities.1') }),
    '2': t('filters.atLeast', { level: t('labels.priorities.2') }),
    '3': t('filters.atLeast', { level: t('labels.priorities.3') }),
  }))
  const sortOptions = computed(() => Object.fromEntries(SORTS.map((sort) => [sort, t(`filters.sorts.${sort}`)])))

  const count = computed(() => activeFilters(view))

  function toggleTag(id: string) {
    view.tagIds = view.tagIds.includes(id) ? view.tagIds.filter((tagId) => tagId !== id) : [...view.tagIds, id]
  }

  // Choosing a sort starts it the way a person wants it first.
  function chooseSort(sort: string) {
    view.sort = sort as Sort
    view.direction = DEFAULT_DIRECTION[sort as Sort]
  }

  const flip = () => {
    view.direction = 'asc' === view.direction ? ('desc' as SortDirection) : ('asc' as SortDirection)
  }
</script>

<template>
  <div class="filters">
    <div class="row">
      <FormInput
        v-model="view.search"
        name="search"
        type="search"
        :placeholder="t('board.search')"
      />
      <FormSelect
        :model-value="view.sort"
        name="sort"
        :options="sortOptions"
        :label="t('filters.sort')"
        :field="false"
        @update:model-value="chooseSort(String($event))"
      />
      <button
        type="button"
        class="direction"
        name="direction"
        :disabled="'manual' === view.sort"
        :aria-label="'asc' === view.direction ? t('filters.ascending') : t('filters.descending')"
        :title="'asc' === view.direction ? t('filters.ascending') : t('filters.descending')"
        @click="flip"
      >
        <span aria-hidden="true">{{ 'asc' === view.direction ? '↑' : '↓' }}</span>
      </button>
    </div>

    <details class="filter-panel">
      <summary>
        {{ t('filters.title') }}
        <span
          v-if="0 < count"
          class="filter-count"
          >{{ count }}</span
        >
      </summary>
      <div class="stack">
        <div
          v-if="tags.length"
          class="stack"
        >
          <span class="muted">{{ t('filters.tags') }}</span>
          <ul class="tag-list">
            <li
              v-for="tag in tags"
              :key="tag.id"
            >
              <button
                type="button"
                class="tag-chip tag-filter"
                :style="{ '--tag': tag.color }"
                :aria-pressed="view.tagIds.includes(tag.id)"
                @click="toggleTag(tag.id)"
              >
                <ItemSymbol :symbol="tag.symbol" />
                {{ tag.name }}
              </button>
            </li>
          </ul>
        </div>
        <div class="row filter-row">
          <FormSelect
            v-model="view.sourceId"
            name="filterSource"
            :options="sourceOptions"
            :label="t('filters.source')"
          />
          <FormSelect
            v-model="view.companyId"
            name="filterCompany"
            :options="companyOptions"
            :label="t('filters.company')"
          />
          <FormSelect
            :model-value="String(view.minPriority)"
            name="filterPriority"
            :options="priorityOptions"
            :label="t('labels.priority')"
            @update:model-value="view.minPriority = Number($event)"
          />
        </div>
        <label class="row"
          ><input
            v-model="view.favoritesOnly"
            type="checkbox"
            name="filterFavorites"
          />
          {{ t('filters.favoritesOnly') }}</label
        >
        <label class="row"
          ><input
            v-model="view.remindersDue"
            type="checkbox"
            name="filterReminders"
          />
          {{ t('filters.remindersDue') }}</label
        >
        <label class="row"
          ><input
            v-model="view.showArchived"
            type="checkbox"
            name="filterArchived"
          />
          {{ t('board.showArchived') }}</label
        >
      </div>
    </details>

    <p
      class="muted filter-summary"
      role="status"
    >
      {{ t('filters.shown', { shown, total }) }}
      <FormButton
        v-if="0 < count"
        type="button"
        @click="emit('clear')"
      >
        {{ t('filters.clear') }}
      </FormButton>
    </p>
  </div>
</template>

<style lang="scss">
  .filters {
    margin-block-end: 1rem;
  }

  .direction {
    min-width: 2.4rem;
  }

  .filter-panel {
    margin-block: 0.75rem;
  }

  .filter-row {
    flex-wrap: wrap;
  }

  .filter-count {
    display: inline-block;
    min-width: 1.4rem;
    padding: 0 0.4rem;
    margin-inline-start: 0.3rem;
    font-size: 0.75rem;
    text-align: center;
    color: var(--on-primary);
    background: var(--primary);
    border-radius: 999px;
  }

  .filter-summary {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin: 0;
  }

  .tag-filter[aria-pressed='true'] {
    color: var(--on-primary);
    background: var(--tag);
  }
</style>
