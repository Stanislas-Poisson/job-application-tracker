<script setup lang="ts">
  import { isPast } from '@zairakai/js-utils/datetime'
  import { strLimit } from '@zairakai/js-utils/formatters'
  import { DisplayBadge } from '@zairakai/vue-components/Display'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'

  const props = defineProps<{ application: Application }>()
  const emit = defineEmits<{ open: [] }>()

  const { t } = useApp()
  const format = useFormat()

  const offer = computed(() => props.application.jobOffer)

  // A reminder that is not done and is past its date.
  const overdue = computed(() =>
    (props.application.reminders ?? []).some((reminder) => !reminder.doneAt && isPast(reminder.dueAt))
  )

  function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('text/plain', props.application.id)
  }
</script>

<template>
  <article
    class="application-card"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click="emit('open')"
    @keydown.enter="emit('open')"
  >
    <h3>{{ strLimit(offer?.title ?? '', 70) }}</h3>
    <p class="muted">
      {{ offer?.company?.name }}<template v-if="offer?.location"> - {{ offer.location }}</template>
    </p>
    <p
      v-if="offer && format.salary(offer)"
      class="muted salary-line"
      :title="format.salaryInHome(offer)"
    >
      {{ format.salary(offer) }}
    </p>
    <div class="row">
      <DisplayBadge
        v-if="offer?.source"
        size="small"
        >{{ offer.source.label }}</DisplayBadge
      >
      <DisplayBadge
        v-if="overdue"
        size="small"
        variant="warning"
        >{{ t('board.overdue') }}</DisplayBadge
      >
    </div>
  </article>
</template>

<style lang="scss">
  .application-card {
    padding: 0.7rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--zk-border);
    border-radius: var(--zk-radius);
    cursor: grab;

    &:hover,
    &:focus-visible {
      border-color: var(--primary);
    }

    h3 {
      margin: 0 0 0.2rem;
      font-size: 0.88rem;
    }

    p {
      margin: 0 0 0.4rem;
      font-size: 0.8rem;
    }
  }
</style>
