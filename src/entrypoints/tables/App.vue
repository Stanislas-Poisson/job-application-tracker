<script setup lang="ts">
  import { computed, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import ApplicationsTable from '../../components/tables/ApplicationsTable.vue'
  import TabNav from '../../components/TabNav.vue'
  import { useApp } from '../../composables/useApp'
  import { useHashTab } from '../../composables/useHashTab'

  const { t } = useApp()

  // One tab for each table. The tab in use is in the address of the page.
  const tabs = computed(() => [{ id: 'applications', label: t('tables.applications') }])
  const { tab, choose } = useHashTab(['applications'])

  // The drawer is the one of the board: a row opens the application as a card does.
  const openId = ref<string | null>(null)
</script>

<template>
  <main
    id="main"
    class="page page-wide"
    tabindex="-1"
  >
    <AppHeader :title="t('tables.title')">
      <a href="board.html">{{ t('nav.board') }}</a>
      <a
        href="#"
        @click.prevent="browser.runtime.openOptionsPage()"
        >{{ t('nav.options') }}</a
      >
    </AppHeader>

    <TabNav
      :tabs="tabs"
      :model-value="tab"
      :label="t('tables.tablist')"
      @update:model-value="choose"
    >
      <template #applications>
        <ApplicationsTable @open="openId = $event" />
      </template>
    </TabNav>

    <ApplicationDrawer
      :application-id="openId"
      @close="openId = null"
    />
    <AppFooter />
  </main>
</template>
