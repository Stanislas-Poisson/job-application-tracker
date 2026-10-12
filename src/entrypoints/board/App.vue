<script setup lang="ts">
  import { FormInput } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import BoardColumn from '../../components/board/BoardColumn.vue'
  import { useApp } from '../../composables/useApp'
  import { Application, Status } from '../../models'
  import { moveApplication } from '../../services/applications'

  const { t, persistence } = useApp()

  const search = ref('')
  const showArchived = ref(false)
  const openId = ref<string | null>(null)

  const statuses = computed(() => useRepo(Status).orderBy('order').get())

  const applications = computed(() =>
    useRepo(Application)
      .with('jobOffer', (query) => query.with('company').with('source'))
      .with('reminders')
      .where('archived', showArchived.value)
      .get()
  )

  // The text typed in the search box is looked for in the title, the company and the place.
  const visible = computed(() => {
    const wanted = search.value.trim().toLowerCase()
    if ('' === wanted) {
      return applications.value
    }
    return applications.value.filter((application) =>
      [application.jobOffer?.title, application.jobOffer?.company?.name, application.jobOffer?.location]
        .join(' ')
        .toLowerCase()
        .includes(wanted)
    )
  })

  const columns = computed(() =>
    statuses.value.map((status) => ({
      status,
      applications: visible.value
        .filter((application) => application.statusId === status.id)
        .sort((a, b) => a.position - b.position),
    }))
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

    <div class="row toolbar">
      <FormInput
        v-model="search"
        name="search"
        type="search"
        :placeholder="t('board.search')"
      />
      <label class="row">
        <input
          v-model="showArchived"
          type="checkbox"
        />
        {{ t('board.showArchived') }}
      </label>
    </div>

    <p
      v-if="0 === applications.length"
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
      @close="openId = null"
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
