<script setup lang="ts">
  import { computed, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import ApplicationsTable from '../../components/tables/ApplicationsTable.vue'
  import CompaniesTable from '../../components/tables/CompaniesTable.vue'
  import CompanyDrawer from '../../components/tables/CompanyDrawer.vue'
  import TabNav from '../../components/TabNav.vue'
  import { useApp } from '../../composables/useApp'
  import { useHashTab } from '../../composables/useHashTab'

  const { t } = useApp()

  // One tab for each table. The tab in use is in the address of the page.
  const TAB_IDS = ['applications', 'companies'] as const
  const tabs = computed(() => [
    { id: 'applications', label: t('tables.applications') },
    { id: 'companies', label: t('tables.companies') },
  ])
  const { tab, choose } = useHashTab(TAB_IDS)

  // The drawer is the one of the board: a row opens the application as a card does.
  const openId = ref<string | null>(null)
  // The drawer of a company, and the offers it lists open the drawer of the application.
  const companyId = ref<string | null>(null)
  function openApplication(id: string) {
    companyId.value = null
    openId.value = id
  }
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
      <template #companies>
        <CompaniesTable @open="companyId = $event" />
      </template>
    </TabNav>

    <ApplicationDrawer
      :application-id="openId"
      @close="openId = null"
    />
    <CompanyDrawer
      :company-id="companyId"
      @close="companyId = null"
      @open-application="openApplication"
    />
    <AppFooter />
  </main>
</template>
