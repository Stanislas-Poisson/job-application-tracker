<script setup lang="ts">
  import { OverlayDialog, OverlayModal } from '@zairakai/vue-components/Overlay'
  import { ref } from 'vue'
  import { useApp } from '../composables/useApp'
  import { pendingChoice, pendingConfirm } from '../composables/useConfirm'

  const { t } = useApp()

  // The buttons of a <form method="dialog"> close the dialog and give their value as the result: the question with several
  // answers is the same dialog as the one with two, with its own buttons.
  const modal = ref<{ close: (result?: string) => void } | null>(null)
  function onSubmit(event: SubmitEvent) {
    modal.value?.close((event.submitter as HTMLButtonElement | null)?.value ?? '')
  }
  // Escape gives no value: nothing is chosen.
  function onClose(result: unknown) {
    pendingChoice.value?.answer('string' === typeof result && '' !== result ? result : null)
  }
</script>

<template>
  <OverlayDialog
    v-if="pendingConfirm"
    id="confirm-dialog"
    :class="pendingConfirm.danger ? 'confirm-danger' : ''"
    :model-value="true"
    :title="pendingConfirm.title ?? t('confirm.title')"
    :message="pendingConfirm.message"
    :confirm-label="pendingConfirm.confirmLabel ?? t('confirm.ok')"
    :cancel-label="pendingConfirm.cancelLabel ?? t('options.cancel')"
    @confirm="pendingConfirm.answer(true)"
    @cancel="pendingConfirm.answer(false)"
  />
  <OverlayModal
    v-if="pendingChoice"
    id="choice-dialog"
    ref="modal"
    class="dialog"
    :model-value="true"
    :title="pendingChoice.title ?? t('confirm.title')"
    :close-button="false"
    closedby="closerequest"
    @close="onClose"
  >
    <p class="dialog-message">{{ pendingChoice.message }}</p>
    <template #footer>
      <form
        method="dialog"
        class="dialog-actions"
        @submit.prevent="onSubmit"
      >
        <button
          v-for="choice in pendingChoice.choices"
          :key="choice.value"
          type="submit"
          :value="choice.value"
          :class="{ 'choice-danger': choice.danger }"
          :autofocus="choice.initial"
          formnovalidate
        >
          {{ choice.label }}
        </button>
      </form>
    </template>
  </OverlayModal>
</template>
