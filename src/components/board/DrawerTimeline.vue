<script setup lang="ts">
  import { dayjs } from '@zairakai/js-utils/datetime'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import type { Application } from '../../models'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()

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
        <small class="muted">{{ dayjs(activity.occurredAt).format('YYYY-MM-DD HH:mm') }}</small>
      </li>
    </ul>
  </section>
</template>
