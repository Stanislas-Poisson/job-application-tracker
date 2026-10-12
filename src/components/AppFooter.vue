<script setup lang="ts">
  import { useApp } from '../composables/useApp'
  import { PILLS } from './pills'

  const { t } = useApp()

  const REPOSITORY = 'https://github.com/Stanislas-Poisson/job-application-tracker'
</script>

<template>
  <footer>
    <p class="links">
      <a
        :href="REPOSITORY"
        target="_blank"
        rel="noopener"
        >{{ t('footer.source') }}</a
      >
      &middot;
      <a
        :href="`${REPOSITORY}/issues`"
        target="_blank"
        rel="noopener"
        >{{ t('footer.issues') }}</a
      >
      &middot;
      <a
        :href="`${REPOSITORY}/blob/main/PRIVACY.md`"
        target="_blank"
        rel="noopener"
        >{{ t('footer.privacy') }}</a
      >
    </p>
    <p class="made-by">{{ t('footer.madeBy') }}</p>
    <div class="pills">
      <a
        v-for="pill in PILLS"
        :key="pill.label"
        :style="{ '--pill': pill.color }"
        :href="pill.href"
        target="_blank"
        rel="noopener"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path :d="pill.icon" />
        </svg>
        {{ pill.label }}
      </a>
    </div>
  </footer>
</template>
