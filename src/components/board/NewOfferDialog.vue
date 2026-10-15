<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { OverlayModal } from '@zairakai/vue-components/Overlay'
  import { useRepo } from 'pinia-orm'
  import { reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { confirmAction } from '../../composables/useConfirm'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { notifyAction } from '../../composables/useNotices'
  import { Status } from '../../models'
  import { type OfferForm, captureFromForm } from '../../services/applications'
  import OfferFields from '../OfferFields.vue'

  // An offer added from the board, for the ones that were not found in a browser page (a mail, a phone call, a paper): the form of
  // the popup without its reading of the page. The column it starts in is the one the button was in.
  const props = defineProps<{ open: boolean; statusKey: string }>()
  const emit = defineEmits<{ close: []; added: [id: string] }>()

  const { t, persistence } = useApp()

  const blank = (): OfferForm => ({ title: '', company: '', url: '', location: '', statusKey: '', note: '' })
  const form = reactive<OfferForm>(blank())
  const problem = ref('')

  // Each time it opens it starts empty, in the column asked for (the first one when none was).
  watch(
    () => props.open,
    (open) => {
      if (open) {
        Object.assign(form, blank(), {
          statusKey: props.statusKey || (useRepo(Status).orderBy('order').first()?.key ?? ''),
        })
        problem.value = ''
      }
    },
    { immediate: true }
  )

  const typed = () => hasText(form.title, form.company, form.url, form.location, form.note)
  useDirtyGuard(() => props.open && typed())

  // Leaving with something typed asks first; with nothing typed the dialog just closes.
  function leave() {
    if (!typed()) {
      emit('close')
      return
    }
    void confirmAction({ message: t('dirty.confirmClose'), confirmLabel: t('dirty.discard'), danger: true }).then(
      (discard) => discard && emit('close')
    )
  }

  // Escape, a click outside and the close button: the dialog stays open while the question is asked.
  function onCancel(event: Event) {
    if (typed()) {
      event.preventDefault()
      leave()
    }
  }

  async function save() {
    problem.value = ''
    if ('' === form.title.trim() || '' === form.company.trim()) {
      problem.value = t('popup.required')
      return
    }
    const application = captureFromForm(form)
    const name = form.title.trim()
    // The data is written before the dialog goes: closing the tab right after must not lose it.
    await persistence.flush()
    emit('close')
    notifyAction(t('board.offerAdded', { name }), t('board.openAdded'), () => emit('added', application.id))
  }
</script>

<template>
  <OverlayModal
    id="new-offer-dialog"
    :model-value="open"
    :title="t('board.addOffer')"
    :close-label="t('drawer.close')"
    @cancel="onCancel"
    @update:model-value="!$event && emit('close')"
  >
    <!-- Only while it is open: a closed dialog has no fields, so that none is found twice on the page. -->
    <form
      v-if="open"
      class="stack"
      @submit.prevent="save"
    >
      <OfferFields v-model="form" />
      <p
        v-if="problem"
        class="error"
        role="alert"
      >
        {{ problem }}
      </p>
      <div class="row">
        <FormButton
          type="button"
          name="cancel"
          @click="leave"
          >{{ t('options.cancel') }}</FormButton
        >
        <FormButton type="submit">{{ t('board.addOffer') }}</FormButton>
      </div>
    </form>
  </OverlayModal>
</template>

<style lang="scss">
  // The dialog that adds an offer is as roomy as the fields in it need, and more on a wide window.
  dialog#new-offer-dialog {
    width: min(44rem, 94vw);
    max-width: none;
  }
</style>
