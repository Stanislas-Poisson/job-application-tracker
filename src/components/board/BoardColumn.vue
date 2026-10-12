<script setup lang="ts">
  import { ref } from 'vue'
  import type { Application, Status } from '../../models'
  import ApplicationCard from './ApplicationCard.vue'

  defineProps<{ status: Status; applications: Application[] }>()
  const emit = defineEmits<{ open: [id: string]; dropApplication: [id: string] }>()

  const over = ref(false)

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
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <h2 :style="{ '--status': status.color }">
      <span class="dot" />
      {{ status.label }}
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
      margin-left: auto;
      color: var(--zk-muted);
      font-weight: 400;
    }
  }
</style>
