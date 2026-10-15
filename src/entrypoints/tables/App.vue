<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import ApplicationDrawer from '../../components/board/ApplicationDrawer.vue'
  import ApplicationsTable from '../../components/tables/ApplicationsTable.vue'
  import CompaniesTable from '../../components/tables/CompaniesTable.vue'
  import CompanyDrawer from '../../components/tables/CompanyDrawer.vue'
  import ContactDrawer from '../../components/tables/ContactDrawer.vue'
  import ContactsTable from '../../components/tables/ContactsTable.vue'
  import TabNav from '../../components/TabNav.vue'
  import { useApp } from '../../composables/useApp'
  import { useHashTab } from '../../composables/useHashTab'

  const { t } = useApp()

  // One tab for each table. The tab in use is in the address of the page.
  const TAB_IDS = ['applications', 'companies', 'contacts'] as const
  const tabs = computed(() => [
    { id: 'applications', label: t('tables.applications') },
    { id: 'companies', label: t('tables.companies') },
    { id: 'contacts', label: t('tables.contacts') },
  ])
  const { tab, choose } = useHashTab(TAB_IDS)

  // The drawer is the one of the board: a row opens the application as a card does.
  const openId = ref<string | null>(null)
  // The drawer of a company, and the offers it lists open the drawer of the application.
  const companyId = ref<string | null>(null)
  // The drawer of a contact; "new" makes one, and the one that was made is opened.
  const contactId = ref<string | null>(null)
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
      <template #contacts>
        <div class="table-actions">
          <FormButton
            type="button"
            name="addContact"
            @click="contactId = 'new'"
            >{{ t('contactPage.add') }}</FormButton
          >
        </div>
        <ContactsTable @open="contactId = $event" />
      </template>
    </TabNav>

    <ApplicationDrawer
      :application-id="openId"
      @close="openId = null"
    />
    <ContactDrawer
      :contact-id="contactId"
      @close="contactId = null"
      @created="contactId = $event"
    />
    <CompanyDrawer
      :company-id="companyId"
      @close="companyId = null"
      @open-application="openApplication"
    />
    <AppFooter />
  </main>
</template>

<style lang="scss">
  .table-actions {
    display: flex;
    justify-content: flex-end;
    margin-block-end: 0.75rem;
  }
</style>
