<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import BackupReminder from '../../components/board/BackupReminder.vue'
  import BoardColumn from '../../components/board/BoardColumn.vue'
  import BoardFilters from '../../components/board/BoardFilters.vue'
  import NewOfferDialog from '../../components/board/NewOfferDialog.vue'
  import { useApp } from '../../composables/useApp'
  import { useBoardShortcuts } from '../../composables/useBoardShortcuts'
  import { useBoardView } from '../../composables/useBoardView'
  import { useFormat } from '../../composables/useFormat'
  import { useKeyboardLayout } from '../../composables/useKeyboardLayout'
  import { say } from '../../composables/useNotices'
  import { Application, CompanyRelation, PayProfile, Status } from '../../models'
  import { LEG_MODES } from '../../models/Journey'
  import { moveApplication } from '../../services/applications'
  import { queryApplications } from '../../services/boardQuery'
  import { finalClientsOf, linksOf } from '../../services/companyRelations'
  import { COLUMNS, boardCsv, csvSeparator, exportFileName } from '../../services/exportBoard'
  import { estimateNet } from '../../services/netEstimate'
  import { downloadText } from '../../utils/download'
  import { todayIn } from '../../utils/time'

  const { t, tn, persistence, settings, statusName, sourceName } = useApp()
  const format = useFormat()
  const { view, clearFilters } = useBoardView()

  const openId = ref<string | null>(null)

  // An offer added from here, in the column of the button that was used (the first one for the general button).
  const adding = ref(false)
  const addingTo = ref('')
  function addOffer(statusKey = '') {
    addingTo.value = statusKey
    adding.value = true
  }

  // A notification opens the board on the application it is about: #application=<id>. An id that is not there opens nothing.
  function openFromAddress() {
    const id = /^#application=(.+)$/.exec(location.hash)?.[1]
    if (undefined !== id && undefined !== useRepo(Application).find(decodeURIComponent(id))) {
      openId.value = decodeURIComponent(id)
    }
  }
  // Closing the drawer takes the address off: a reload must not open it again.
  function close() {
    openId.value = null
    if ('' !== location.hash) {
      history.replaceState(null, '', location.pathname + location.search)
    }
  }
  onMounted(() => {
    openFromAddress()
    window.addEventListener('hashchange', openFromAddress)
  })
  onUnmounted(() => window.removeEventListener('hashchange', openFromAddress))

  const statuses = computed(() => useRepo(Status).orderBy('order').get())

  // Every application, with what the filters and the search look at.
  const everything = computed(() =>
    useRepo(Application)
      .with('jobOffer', (query) => query.with('company').with('source').with('journeys'))
      .with('reminders')
      .with('tags')
      .with('contacts')
      .get()
  )

  // What the user chose to see, in the order chosen.
  const visible = computed(() =>
    queryApplications(everything.value, view, {
      now: new Date(),
      locale: format.locale.value,
      conversion: format.conversion(),
      related: (companyId) => (useRepo(CompanyRelation).all(), linksOf(companyId).map((link) => link.other.name)),
    })
  )

  const columns = computed(() =>
    statuses.value.map((status) => ({
      status,
      applications: visible.value.filter((application) => application.statusId === status.id),
    }))
  )

  // The applications that the archive switch leaves in, to say how many of them the filters keep.
  const inScope = computed(
    () => everything.value.filter((application) => application.archived === view.showArchived).length
  )

  // The applications that are shown, in the order they are shown, as a file for a spreadsheet. A language that writes numbers
  // with a decimal comma (and whose spreadsheets want a semicolon) gets a semicolon.
  function exportCsv() {
    const names = Object.fromEntries(statuses.value.map((status) => [status.id, statusName(status)]))
    const text = boardCsv(
      visible.value,
      {
        locale: format.locale.value,
        labels: {
          columns: Object.fromEntries(COLUMNS.map((column) => [column, t(`export.columns.${column}`)])) as never,
          yes: t('export.yes'),
          no: t('export.no'),
          priorities: Object.fromEntries([0, 1, 2, 3].map((level) => [String(level), t(`labels.priorities.${level}`)])),
          periods: Object.fromEntries(
            ['year', 'month', 'week', 'day', 'hour'].map((p) => [p, t(`salary.per.${p}`)])
          ) as never,
          kinds: { gross: t('salary.kind.gross'), net: t('salary.kind.net') },
          legModes: Object.fromEntries(LEG_MODES.map((mode) => [mode, t(`journeys.modes.${mode}`)])) as never,
        },
        conversion: format.conversion(),
        netEstimate: (salary) => {
          const result = estimateNet(
            salary,
            '' === settings.payProfileId ? null : useRepo(PayProfile).find(settings.payProfileId),
            { workingDaysPerYear: settings.workingDaysPerYear, hoursPerDay: settings.hoursPerDay }
          )
          return 'string' === typeof result
            ? null
            : {
                amount: Math.round((result.low.net + result.high.net) / 2),
                currency: result.currency,
                profile: result.profile,
              }
        },
        finalClients: (companyId) => finalClientsOf(companyId).map((client) => client.name),
        sourceLabel: sourceName,
        statusLabel: (statusId) => (statusId ? (names[statusId] ?? '') : ''),
      },
      csvSeparator(format.locale.value)
    )
    downloadText(exportFileName(todayIn(format.timeZone.value)), text, 'text/csv;charset=utf-8')
  }

  async function drop(applicationId: string, statusId: string) {
    moveApplication(applicationId, statusId)
    await persistence.flush()
  }

  // The keys of the board; a card moved with them is said to be in its new column.
  const layout = useKeyboardLayout()
  useBoardShortcuts({
    enabled: () => settings.shortcuts,
    keys: () => settings.shortcutKeys,
    layoutKnown: () => layout.known.value,
    drop,
    moved(statusId) {
      const status = useRepo(Status).find(statusId)
      if (status) {
        say(t('board.movedTo', { status: statusName(status) }))
      }
    },
  })
</script>

<template>
  <main
    id="main"
    class="page page-wide"
    tabindex="-1"
  >
    <AppHeader :title="t('board.title')">
      <a href="tables.html">{{ t('nav.tables') }}</a>
      <a
        id="export-csv"
        href="#"
        :title="tn('export.hint', visible.length)"
        @click.prevent="exportCsv"
        >{{ t('export.link') }}</a
      >
      <a
        href="#"
        @click.prevent="browser.runtime.openOptionsPage()"
        >{{ t('nav.options') }}</a
      >
    </AppHeader>

    <BackupReminder />

    <div class="board-actions">
      <FormButton
        type="button"
        name="addOffer"
        @click="addOffer()"
        >{{ t('board.addOffer') }}</FormButton
      >
    </div>

    <BoardFilters
      :shown="visible.length"
      :total="inScope"
      @clear="clearFilters"
    />

    <p
      v-if="0 === everything.length"
      class="card muted"
    >
      {{ t('board.empty') }}
    </p>

    <!-- It scrolls sideways when the window is narrow or zoomed: with no card in it (a new board) the keyboard needs a way in. -->
    <div
      class="board"
      role="region"
      tabindex="0"
      :aria-label="t('board.title')"
    >
      <BoardColumn
        v-for="(column, index) in columns"
        :key="column.status.id"
        :index="index"
        :status="column.status"
        :applications="column.applications"
        @open="openId = $event"
        @add="addOffer"
        @drop-application="drop($event, column.status.id)"
      />
    </div>

    <NewOfferDialog
      :open="adding"
      :status-key="addingTo"
      @close="adding = false"
      @added="openId = $event"
    />

    <ApplicationDrawer
      :application-id="openId"
      @close="close"
    />
    <AppFooter />
  </main>
</template>

<style lang="scss">
  .toolbar {
    margin-block-end: 1rem;
  }

  .board-actions {
    display: flex;
    justify-content: flex-end;
    margin-block-end: 0.75rem;
  }

  .board {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(12rem, 1fr);
    gap: 0.75rem;
    overflow-x: auto;
    padding-block-end: 0.5rem;
  }
</style>
