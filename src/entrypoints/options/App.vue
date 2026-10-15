<script setup lang="ts">
  import { computed } from 'vue'
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import TabNav from '../../components/TabNav.vue'
  import AppearanceSetting from '../../components/options/AppearanceSetting.vue'
  import DataTools from '../../components/options/DataTools.vue'
  import ExchangeSetting from '../../components/options/ExchangeSetting.vue'
  import FreelanceRate from '../../components/options/FreelanceRate.vue'
  import KeyboardSetting from '../../components/options/KeyboardSetting.vue'
  import LanguageSetting from '../../components/options/LanguageSetting.vue'
  import MapSetting from '../../components/options/MapSetting.vue'
  import MoneySetting from '../../components/options/MoneySetting.vue'
  import PayProfiles from '../../components/options/PayProfiles.vue'
  import RegionalSetting from '../../components/options/RegionalSetting.vue'
  import ReminderSetting from '../../components/options/ReminderSetting.vue'
  import StatusEditor from '../../components/options/StatusEditor.vue'
  import TagEditor from '../../components/options/TagEditor.vue'
  import TrashSetting from '../../components/options/TrashSetting.vue'
  import { useApp } from '../../composables/useApp'
  import { useHashTab } from '../../composables/useHashTab'

  const { t } = useApp()

  // The sections are grouped under tabs, and the tab in use is in the address of the page (#tab=money).
  const TAB_IDS = ['appearance', 'board', 'money', 'places', 'data'] as const
  const tabs = computed(() => TAB_IDS.map((id) => ({ id, label: t(`optionsTabs.${id}`) })))
  const { tab, choose } = useHashTab(TAB_IDS)

  const boardUrl = browser.runtime.getURL('/board.html' as never)
</script>

<template>
  <main
    id="main"
    class="page page-options"
    tabindex="-1"
  >
    <AppHeader :title="t('options.title')">
      <a :href="boardUrl">{{ t('nav.board') }}</a>
      <a href="tables.html">{{ t('nav.tables') }}</a>
    </AppHeader>

    <TabNav
      all
      :tabs="tabs"
      :model-value="tab"
      :label="t('optionsTabs.list')"
      @update:model-value="choose"
    >
      <template #appearance>
        <div class="options-grid">
          <section class="card"><LanguageSetting /></section>
          <section class="card"><AppearanceSetting /></section>
          <section class="card"><RegionalSetting /></section>
        </div>
      </template>
      <template #board>
        <div class="options-grid">
          <section class="card"><StatusEditor /></section>
          <section class="card"><TagEditor /></section>
          <section class="card"><KeyboardSetting /></section>
          <section class="card"><ReminderSetting /></section>
        </div>
      </template>
      <template #money>
        <div class="options-grid">
          <section class="card"><MoneySetting /></section>
          <section class="card"><PayProfiles /></section>
          <section class="card"><FreelanceRate /></section>
        </div>
      </template>
      <template #places>
        <div class="options-grid">
          <section class="card"><MapSetting /></section>
          <section class="card"><ExchangeSetting /></section>
        </div>
      </template>
      <template #data>
        <div class="options-grid">
          <section class="card"><DataTools /></section>
          <section class="card"><TrashSetting /></section>
        </div>
      </template>
    </TabNav>

    <AppFooter />
  </main>
</template>
