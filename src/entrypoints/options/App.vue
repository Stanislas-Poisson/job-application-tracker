<script setup lang="ts">
  import AppFooter from '../../components/AppFooter.vue'
  import AppHeader from '../../components/AppHeader.vue'
  import AppearanceSetting from '../../components/options/AppearanceSetting.vue'
  import DataTools from '../../components/options/DataTools.vue'
  import ExchangeSetting from '../../components/options/ExchangeSetting.vue'
  import LanguageSetting from '../../components/options/LanguageSetting.vue'
  import MoneySetting from '../../components/options/MoneySetting.vue'
  import RegionalSetting from '../../components/options/RegionalSetting.vue'
  import StatusEditor from '../../components/options/StatusEditor.vue'
  import TagEditor from '../../components/options/TagEditor.vue'
  import TrashSetting from '../../components/options/TrashSetting.vue'
  import { useApp } from '../../composables/useApp'

  const { t } = useApp()

  const boardUrl = browser.runtime.getURL('/board.html' as never)
</script>

<template>
  <main class="page page-narrow">
    <AppHeader :title="t('options.title')">
      <a :href="boardUrl">{{ t('nav.board') }}</a>
    </AppHeader>

    <div class="stack">
      <section class="card"><LanguageSetting /></section>
      <section class="card"><AppearanceSetting /></section>
      <section class="card"><RegionalSetting /></section>
      <section class="card"><MoneySetting /></section>
      <section class="card"><ExchangeSetting /></section>
      <section class="card"><StatusEditor /></section>
      <section class="card"><TagEditor /></section>
      <section class="card"><DataTools /></section>
      <section class="card"><TrashSetting /></section>
    </div>

    <AppFooter />
  </main>
</template>
