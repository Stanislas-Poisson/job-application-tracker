<script setup lang="ts">
  import { OverlayDialog } from '@zairakai/vue-components/Overlay'
  import { useApp } from '../composables/useApp'
  import { pendingConfirm } from '../composables/useConfirm'

  const { t } = useApp()
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
</template>
