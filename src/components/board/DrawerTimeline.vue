<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { type Activity, type Application, Status } from '../../models'
  import { buildTimeline } from '../../services/timeline'

  const props = defineProps<{ application: Application }>()

  const { t, statusName } = useApp()
  const format = useFormat()

  // The column a card was moved to, by its name today and in the language of the page. The text kept with the entry is for a column that is gone.
  function target(activity: Activity): string {
    const status = activity.toStatusId ? useRepo(Status).find(activity.toStatusId) : null
    return 'status_changed' === activity.type && status ? statusName(status) : activity.title
  }

  // What the extension recorded and the exchanges, in one list, the most recent first.
  const entries = computed(() =>
    buildTimeline(props.application.activities ?? [], props.application.interactions ?? [])
  )
</script>

<template>
  <section>
    <h3>{{ t('drawer.timeline') }}</h3>
    <ul>
      <li
        v-for="entry in entries"
        :key="entry.id"
      >
        <template v-if="'interaction' === entry.kind">
          <strong>{{ t(`interactions.channels.${entry.interaction.channel}`) }}</strong>
          <span class="muted"> - {{ t(`interactions.directions.${entry.interaction.direction}`) }}</span>
          <template v-if="entry.interaction.subject"> - {{ entry.interaction.subject }}</template>
        </template>
        <template v-else>
          <strong>{{ t(`activity.${entry.activity.type}`) }}</strong>
          <template v-if="entry.activity.title"> - {{ target(entry.activity) }}</template>
        </template>
        <br />
        <small class="muted">{{ format.instant(entry.at) }}</small>
      </li>
    </ul>
  </section>
</template>
