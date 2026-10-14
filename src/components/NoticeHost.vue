<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useApp } from '../composables/useApp'
  import { dismiss, notices, pause, resume } from '../composables/useNotices'

  const { t } = useApp()
  const root = ref<HTMLElement | null>(null)

  // The top layer, like a modal dialog: a message shown while the drawer is open stays above it.
  onMounted(() => root.value?.showPopover?.())
</script>

<template>
  <section
    id="notices"
    ref="root"
    class="toast-container"
    popover="manual"
    :aria-label="t('notice.region')"
  >
    <!-- Two regions that are always there: a message added to a region that already exists is read out. -->
    <div
      class="notice-list"
      aria-live="polite"
    >
      <div
        v-for="notice in notices.filter((entry) => 'error' !== entry.kind)"
        :key="notice.id"
        class="toast notice"
        :data-variant="notice.kind"
        @mouseenter="pause(notice.id)"
        @mouseleave="resume(notice.id)"
        @focusin="pause(notice.id)"
        @focusout="resume(notice.id)"
      >
        <p class="toast-message">{{ notice.text }}</p>
        <button
          v-if="notice.action"
          type="button"
          class="notice-action"
          @click="notice.action.run()"
        >
          {{ notice.action.label }}
        </button>
        <button
          type="button"
          class="toast-close"
          :aria-label="t('notice.close')"
          @click="dismiss(notice.id)"
        >
          &times;
        </button>
      </div>
    </div>
    <div
      class="notice-list"
      aria-live="assertive"
      role="alert"
    >
      <div
        v-for="notice in notices.filter((entry) => 'error' === entry.kind)"
        :key="notice.id"
        class="toast notice"
        data-variant="error"
      >
        <p class="toast-message">{{ notice.text }}</p>
        <button
          type="button"
          class="toast-close"
          :aria-label="t('notice.close')"
          @click="dismiss(notice.id)"
        >
          &times;
        </button>
      </div>
    </div>
  </section>
</template>
