<script setup lang="ts">
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()
  const format = useFormat()

  const activities = computed(() =>
    [...(props.application.activities ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  )
</script>

<template>
  <section>
    <h3>{{ t('drawer.timeline') }}</h3>
    <ul>
      <li
        v-for="activity in activities"
        :key="activity.id"
      >
        <strong>{{ t(`activity.${activity.type}`) }}</strong>
        <template v-if="activity.title"> - {{ activity.title }}</template>
        <br />
        <small class="muted">{{ format.instant(activity.occurredAt) }}</small>
      </li>
    </ul>
  </section>
</template>
