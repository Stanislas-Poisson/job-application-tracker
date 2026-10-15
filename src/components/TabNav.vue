<script setup lang="ts">
  import { nextTick, ref, useId } from 'vue'

  // Tabs as the WAI-ARIA pattern has them: one tab in the order of the keyboard, the arrows (mirrored in right to left), Home and
  // End to move between them, and the panel of the tab in use below. The page gives a slot named after each tab.
  const props = defineProps<{ tabs: { id: string; label: string }[]; modelValue: string; label: string }>()
  const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

  const prefix = useId()
  const tabId = (id: string) => `${prefix}-tab-${id}`
  const panelId = (id: string) => `${prefix}-panel-${id}`
  const list = ref<HTMLElement | null>(null)

  function select(id: string, focus = false) {
    emit('update:modelValue', id)
    if (focus) {
      void nextTick(() => document.getElementById(tabId(id))?.focus())
    }
  }

  function onKey(event: KeyboardEvent, index: number) {
    const rtl = 'rtl' === getComputedStyle(list.value ?? document.body).direction
    const last = props.tabs.length - 1
    const target =
      'Home' === event.key
        ? 0
        : 'End' === event.key
          ? last
          : 'ArrowRight' === event.key
            ? rtl
              ? index - 1
              : index + 1
            : 'ArrowLeft' === event.key
              ? rtl
                ? index + 1
                : index - 1
              : null
    if (null === target) {
      return
    }
    event.preventDefault()
    // From the last tab the arrow goes round to the first, and the other way.
    const next = props.tabs[(target + props.tabs.length) % props.tabs.length]
    if (next) {
      select(next.id, true)
    }
  }
</script>

<template>
  <div class="tabs">
    <div
      ref="list"
      role="tablist"
      class="tablist"
      :aria-label="label"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab"
        :data-tab="tab.id"
        :aria-selected="tab.id === modelValue"
        :aria-controls="panelId(tab.id)"
        :tabindex="tab.id === modelValue ? 0 : -1"
        @click="select(tab.id)"
        @keydown="onKey($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      :id="panelId(modelValue)"
      role="tabpanel"
      class="tabpanel"
      tabindex="0"
      :aria-labelledby="tabId(modelValue)"
    >
      <slot :name="modelValue" />
    </div>
  </div>
</template>

<style lang="scss">
  .tablist {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-end: 1rem;
    border-block-end: 1px solid var(--zk-border);
  }

  .tab {
    padding: 0.5rem 0.9rem;
    margin-block-end: -1px;
    color: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--zk-radius) var(--zk-radius) 0 0;
    cursor: pointer;

    // The tab in use is told by its line and its weight, not by its colour alone.
    &[aria-selected='true'] {
      font-weight: 700;
      background: var(--surface);
      border-color: var(--zk-border);
      border-block-end-color: var(--surface);
      box-shadow: inset 0 3px 0 var(--primary);
    }
  }

  .tabpanel:focus-visible {
    outline-offset: 4px;
  }
</style>
