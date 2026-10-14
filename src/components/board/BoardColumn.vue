<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { columnShape, statusColor, statusShape } from '../../appearance'
  import { useApp } from '../../composables/useApp'
  import type { Application, Status } from '../../models'
  import { symbolToShow } from '../../services/symbol'
  import ApplicationCard from './ApplicationCard.vue'

  const props = defineProps<{ status: Status; applications: Application[]; index: number }>()
  const emit = defineEmits<{ open: [id: string]; dropApplication: [id: string] }>()

  const { settings, statusName } = useApp()

  const over = ref(false)
  // A custom theme in use brings the colours of the columns.
  const inUse = computed(() => settings.customThemes.some((theme) => theme.id === settings.customThemeId))
  // In a colour-blind mode the colour comes from a safe palette and a shape goes with it.
  const color = computed(() => statusColor(props.status.color, props.index, settings.vision, inUse.value))
  // The symbol of the user, or else the shape of the colour-blind modes.
  const shape = computed(() => symbolToShow(props.status.symbol, statusShape(props.index, settings.vision)))

  function onDrop(event: DragEvent) {
    over.value = false
    const id = event.dataTransfer?.getData('text/plain')
    if (id) {
      emit('dropApplication', id)
    }
  }
</script>

<template>
  <section
    class="column"
    :class="{ over }"
    :aria-labelledby="`column-${status.id}`"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <h2
      :id="`column-${status.id}`"
      :style="{ '--status': color }"
    >
      <span
        v-if="shape"
        class="shape"
        aria-hidden="true"
        >{{ shape }}</span
      >
      <span
        v-else
        class="dot"
        :data-shape="columnShape(index)"
      />
      {{ statusName(status) }}
      <span class="count">{{ applications.length }}</span>
    </h2>
    <ApplicationCard
      v-for="application in applications"
      :key="application.id"
      :application="application"
      @open="emit('open', application.id)"
    />
  </section>
</template>

<style lang="scss">
  .column {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 12rem;
    padding: 0.6rem;
    background: var(--zk-hover);
    border: 1px dashed transparent;
    border-radius: var(--zk-radius-lg);

    &.over {
      border-color: var(--primary);
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 0.2rem;
      font-size: 0.85rem;
    }

    .dot {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background: var(--status);
    }

    .count {
      margin-inline-start: auto;
      color: var(--zk-muted);
      font-weight: 400;
    }
  }
</style>
