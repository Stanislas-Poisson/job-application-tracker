<script setup lang="ts" generic="Row">
  import { FormInput } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../composables/useApp'
  import { useFormat } from '../composables/useFormat'
  import { useTableState } from '../composables/useTableState'
  import { sortRows } from '../services/tableSort'
  import { fold } from '../utils/text'

  // A table that every list of the extension uses: columns that sort (a button in the header, said by aria-sort), a search that
  // ignores the case and the accents, the columns that can be hidden, and a row that opens by click and by keyboard (the button
  // of its first cell). What was chosen is kept. The caller gives the rows, and for each column how to sort and how to write it.
  interface Column {
    key: string
    label: string
    // What the rows are sorted by: a text is compared in the language, a number by its value, null goes last.
    sortValue: (row: Row) => string | number | null
    // What the cell says. A column that needs more than text gives a slot named cell-<key>.
    text: (row: Row) => string
    // Numbers and amounts are aligned to the end.
    numeric?: boolean
    // Hidden at first (the user can show it).
    hidden?: boolean
  }

  const props = defineProps<{
    id: string
    caption: string
    columns: Column[]
    rows: Row[]
    rowKey: (row: Row) => string
    // What a search looks at in a row.
    searchText?: (row: Row) => string
    defaultSort?: { key: string; direction: 'asc' | 'desc' }
  }>()
  const emit = defineEmits<{ open: [row: Row] }>()

  const { t } = useApp()
  const format = useFormat()

  const state = useTableState(props.id, {
    sort: props.defaultSort?.key ?? null,
    direction: props.defaultSort?.direction ?? 'asc',
    hidden: props.columns.filter((column) => column.hidden).map((column) => column.key),
  })
  const query = ref('')

  // The first column is the one that opens the row, and is always there.
  const shownColumns = computed(() =>
    props.columns.filter((column, index) => 0 === index || !state.hidden.includes(column.key))
  )

  function toggleSort(key: string) {
    if (state.sort === key) {
      state.direction = 'asc' === state.direction ? 'desc' : 'asc'
    } else {
      state.sort = key
      state.direction = 'asc'
    }
  }

  const collator = computed(() => new Intl.Collator(format.locale.value, { numeric: true, sensitivity: 'base' }))

  const shownRows = computed(() => {
    const needle = fold(query.value.trim())
    const found =
      '' === needle || !props.searchText
        ? props.rows
        : props.rows.filter((row) => fold(props.searchText?.(row) ?? '').includes(needle))
    const column = props.columns.find((candidate) => candidate.key === state.sort)
    if (!column) {
      return found
    }
    return sortRows(found, column.sortValue, state.direction, (a, b) => collator.value.compare(a, b))
  })

  const ariaSort = (key: string): 'ascending' | 'descending' | 'none' =>
    state.sort === key ? ('asc' === state.direction ? 'ascending' : 'descending') : 'none'
</script>

<template>
  <div class="data-table">
    <div class="table-tools row">
      <FormInput
        v-model="query"
        name="tableSearch"
        type="search"
        :label="t('table.search')"
      />
      <details class="table-columns">
        <summary>{{ t('table.columns') }}</summary>
        <ul>
          <li
            v-for="(column, index) in columns"
            :key="column.key"
          >
            <label class="row">
              <input
                type="checkbox"
                :name="`column-${column.key}`"
                :checked="0 === index || !state.hidden.includes(column.key)"
                :disabled="0 === index"
                @change="
                  state.hidden = ($event.target as HTMLInputElement).checked
                    ? state.hidden.filter((key) => key !== column.key)
                    : [...state.hidden, column.key]
                "
              />
              {{ column.label }}
            </label>
          </li>
        </ul>
      </details>
    </div>

    <p
      class="muted table-count"
      role="status"
    >
      {{ t('table.shown', { shown: shownRows.length, total: rows.length }) }}
    </p>

    <!-- It scrolls sideways when the window is narrow or zoomed: it takes the focus, so that the keyboard can scroll it. -->
    <div
      class="table-wrap"
      role="region"
      tabindex="0"
      :aria-label="caption"
    >
      <table>
        <caption class="sr-only">
          {{
            caption
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in shownColumns"
              :key="column.key"
              scope="col"
              :aria-sort="ariaSort(column.key)"
              :class="{ numeric: column.numeric }"
            >
              <button
                type="button"
                class="sort"
                :data-column="column.key"
                @click="toggleSort(column.key)"
              >
                {{ column.label }}
                <span
                  class="sort-mark"
                  aria-hidden="true"
                  >{{ state.sort === column.key ? ('asc' === state.direction ? '▲' : '▼') : '' }}</span
                >
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in shownRows"
            :key="rowKey(row)"
            class="table-row"
            @click="emit('open', row)"
          >
            <td
              v-for="(column, index) in shownColumns"
              :key="column.key"
              :class="{ numeric: column.numeric }"
              :data-column="column.key"
            >
              <button
                v-if="0 === index"
                type="button"
                class="row-open"
                @click.stop="emit('open', row)"
              >
                <slot
                  :name="`cell-${column.key}`"
                  :row="row"
                  >{{ column.text(row) }}</slot
                >
              </button>
              <slot
                v-else
                :name="`cell-${column.key}`"
                :row="row"
                >{{ column.text(row) }}</slot
              >
            </td>
          </tr>
          <tr v-if="0 === shownRows.length">
            <td :colspan="shownColumns.length">{{ t('table.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss">
  .data-table {
    .table-tools {
      align-items: flex-end;
      justify-content: space-between;
    }

    .table-columns {
      margin-block-end: 0.25rem;

      ul {
        margin: 0.5rem 0 0;
        padding: 0;
        list-style: none;
      }
    }

    .table-count {
      margin: 0.5rem 0;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.5rem 0.75rem;
      text-align: start;
      vertical-align: top;
      border-block-end: 1px solid var(--zk-border);
    }

    .numeric {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }

    .sort,
    .row-open {
      padding: 0;
      font: inherit;
      color: inherit;
      text-align: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
    }

    // A header that sorts is told by its mark, and the row that opens by its underline.
    .sort {
      font-weight: 700;
    }

    .row-open {
      text-decoration: underline;
    }

    .table-row:hover {
      background: var(--zk-hover);
      cursor: pointer;
    }
  }
</style>
