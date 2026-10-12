<script setup lang="ts">
  import { useApp } from '../composables/useApp'

  defineProps<{ title: string }>()

  const { t } = useApp()

  // The version of the manifest, so that the page tells which build is installed.
  const version = browser.runtime.getManifest().version
</script>

<template>
  <header class="header">
    <img
      src="/icon/48.png"
      alt=""
    />
    <div>
      <h1>{{ title }}</h1>
      <p>
        {{ t('app.name') }} <span id="version">v{{ version }}</span>
      </p>
    </div>
    <nav><slot /></nav>
  </header>
</template>
