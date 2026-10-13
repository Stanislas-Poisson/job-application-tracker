<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed, onMounted, onUnmounted, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import BackupReminder from '../../components/board/BackupReminder.vue'
  import BoardColumn from '../../components/board/BoardColumn.vue'
  import BoardFilters from '../../components/board/BoardFilters.vue'
  import { useApp } from '../../composables/useApp'
  import { useBoardView } from '../../composables/useBoardView'
  import { useFormat } from '../../composables/useFormat'
  import { Application, Status } from '../../models'
  import { moveApplication } from '../../services/applications'
  import { queryApplications } from '../../services/boardQuery'

  const { t, persistence } = useApp()
  const format = useFormat()
  const { view, clearFilters } = useBoardView()

  const openId = ref<string | null>(null)

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
      .with('jobOffer', (query) => query.with('company').with('source'))
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

  async function drop(applicationId: string, statusId: string) {
    moveApplication(applicationId, statusId)
    await persistence.flush()
  }
</script>

<template>
  <main class="page">
    <AppHeader :title="t('board.title')">
      <a
        href="#"
        @click.prevent="browser.runtime.openOptionsPage()"
        >{{ t('nav.options') }}</a
      >
    </AppHeader>

    <BackupReminder />

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

    <div class="board">
      <BoardColumn
        v-for="(column, index) in columns"
        :key="column.status.id"
        :index="index"
        :status="column.status"
        :applications="column.applications"
        @open="openId = $event"
        @drop-application="drop($event, column.status.id)"
      />
    </div>

    <ApplicationDrawer
      :application-id="openId"
      @close="close"
    />
    <AppFooter />
  </main>
</template>

<style lang="scss">
  .toolbar {
    margin-bottom: 1rem;
  }

  .board {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 1fr);
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }
</style>
