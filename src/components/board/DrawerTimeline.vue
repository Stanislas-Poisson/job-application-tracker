<script setup lang="ts">
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'
  import { buildTimeline } from '../../services/timeline'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()
  const format = useFormat()

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
          <template v-if="entry.activity.title"> - {{ entry.activity.title }}</template>
        </template>
        <br />
        <small class="muted">{{ format.instant(entry.at) }}</small>
      </li>
    </ul>
  </section>
</template>
