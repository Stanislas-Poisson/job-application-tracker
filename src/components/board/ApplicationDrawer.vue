<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { OverlayDrawer } from '@zairakai/vue-components/Overlay'
  import { useRepo } from 'pinia-orm'
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { provideCardDraft } from '../../composables/useCardDraft'
  import { chooseAction, confirmAction } from '../../composables/useConfirm'
  import { anyDirty, useDirtyGuard } from '../../composables/useDirty'
  import { provideDrawerMode } from '../../composables/useDrawerMode'
  import { Application } from '../../models'
  import DrawerCompany from './DrawerCompany.vue'
  import DrawerContacts from './DrawerContacts.vue'
  import DrawerDetails from './DrawerDetails.vue'
  import DrawerInteractions from './DrawerInteractions.vue'
  import DrawerJourneys from './DrawerJourneys.vue'
  import DrawerLabels from './DrawerLabels.vue'
  import DrawerNetPay from './DrawerNetPay.vue'
  import DrawerNotes from './DrawerNotes.vue'
  import DrawerPlace from './DrawerPlace.vue'
  import DrawerReminders from './DrawerReminders.vue'
  import DrawerTimeline from './DrawerTimeline.vue'

  const props = defineProps<{ applicationId: string | null }>()
  const emit = defineEmits<{ close: [] }>()

  const { t } = useApp()

  const application = computed(() =>
    props.applicationId
      ? useRepo(Application)
          .with('jobOffer', (query) => query.with('company').with('source'))
          .with('status')
          .with('contacts', (query) => query.with('methods'))
          .with('notes')
          .with('activities')
          .with('interactions')
          .with('tags')
          .with('reminders')
          .find(props.applicationId)
      : null
  )

  // The card opens to be read; editing is a step taken on purpose, with the button, and never a key.
  const mode = provideDrawerMode()
  const editing = computed(() => 'edit' === mode.value)
  // Editing the details and the address works on a draft, saved only if it really differs from what is stored.
  const card = provideCardDraft(() => application.value)
  useDirtyGuard(() => card.isDirty.value)
  // Back to reading drops what was typed and not kept: the sections are drawn again, with nothing in their forms.
  const session = ref(0)
  function read() {
    card.end()
    mode.value = 'read'
    session.value += 1
  }
  function edit() {
    card.begin()
    mode.value = 'edit'
  }
  watch(() => props.applicationId, read)

  // Unsaved text asks the user first, and can keep the drawer open. The question cannot wait for an answer inside the event:
  // the drawer stays open while it is asked, and the answer decides.
  function askToDiscard(then: () => void) {
    void confirmAction({ message: t('dirty.confirmClose'), confirmLabel: t('dirty.discard'), danger: true }).then(
      (discard) => discard && then()
    )
  }

  // Leaving with changes to the card that were not saved: save and close, close without saving, or keep editing. A card that
  // cannot be saved (a salary that makes no sense) stays open, and says why. With only text typed in a list and not added, there
  // is nothing to save and the question has two answers.
  function askLeaving(then: () => void) {
    if (!card.isDirty.value) {
      askToDiscard(then)
      return
    }
    void chooseAction({
      title: t('dirty.unsaved'),
      message: t('dirty.leaveMessage'),
      choices: [
        { value: 'keep', label: t('dirty.keepEditing'), initial: true },
        { value: 'discard', label: t('dirty.closeWithoutSaving'), danger: true },
        { value: 'save', label: t('dirty.saveAndClose') },
      ],
    }).then((answer) => {
      if ('discard' === answer || ('save' === answer && card.save())) {
        then()
      }
    })
  }

  // The button of the drawer: from reading to editing, and back. Back with text typed in a list and not added asks first.
  function toggle() {
    if (!editing.value) {
      edit()
    } else if (anyDirty()) {
      askToDiscard(read)
    } else {
      read()
    }
  }

  // Saves the draft, and goes back to reading. If a list below still holds text that was typed and not added, the card stays
  // open for it, from the values just saved.
  async function save() {
    if (!card.save()) {
      return
    }
    card.end()
    await nextTick()
    if (anyDirty()) {
      card.begin()
      return
    }
    read()
  }

  // Escape is told from the close button and a click outside: it steps back from editing to reading when nothing changed.
  let escaped = false
  const markEscape = (event: KeyboardEvent) => {
    if ('Escape' === event.key) {
      escaped = true
      setTimeout(() => (escaped = false))
    }
  }
  onMounted(() => window.addEventListener('keydown', markEscape, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', markEscape, true))

  // Escape, the close button and a click outside ask to close.
  function onCancel(event: Event) {
    if (editing.value && escaped && !anyDirty()) {
      event.preventDefault()
      read()
    } else if (anyDirty()) {
      event.preventDefault()
      askLeaving(() => emit('close'))
    }
  }
</script>

<template>
  <OverlayDrawer
    :model-value="null !== applicationId"
    :title="application?.jobOffer?.title ?? ''"
    :close-label="t('drawer.close')"
    @cancel="onCancel"
    @update:model-value="!$event && emit('close')"
  >
    <div
      v-if="application"
      class="stack drawer-content"
    >
      <div class="drawer-bar">
        <span
          v-if="card.isDirty.value"
          id="offer-unsaved"
          class="muted"
          role="status"
          >{{ t('dirty.unsaved') }}</span
        >
        <template v-if="editing && card.isDirty.value">
          <FormButton
            type="button"
            name="cancel"
            @click="read"
            >{{ t('options.cancel') }}</FormButton
          >
          <FormButton
            type="button"
            name="save"
            @click="save"
            >{{ t('drawer.save') }}</FormButton
          >
        </template>
        <FormButton
          v-else
          type="button"
          name="toggleEdit"
          @click="toggle"
          >{{ editing ? t('drawer.done') : t('drawer.edit') }}</FormButton
        >
      </div>
      <template
        v-for="run in [session]"
        :key="run"
      >
        <DrawerDetails
          :application="application"
          @deleted="emit('close')"
        />
        <DrawerPlace :application="application" />
        <DrawerJourneys :application="application" />
        <DrawerNetPay :application="application" />
        <DrawerCompany :application="application" />
        <DrawerLabels :application="application" />
        <DrawerInteractions :application="application" />
        <DrawerNotes :application="application" />
        <DrawerReminders :application="application" />
        <DrawerContacts :application="application" />
        <DrawerTimeline :application="application" />
      </template>
    </div>
  </OverlayDrawer>
</template>

<style lang="scss">
  dialog.drawer {
    width: min(36rem, 94vw);
    max-width: none;
  }

  // On a wide window the drawer is wider too: the fields that sit side by side (period, gross or net) keep their words.
  @media (width >= 1200px) {
    dialog.drawer {
      width: min(46rem, 94vw);
    }
  }

  .drawer-content {
    gap: 1.5rem;
    min-width: 0;

    // The button that passes from reading to editing stays in reach while the drawer scrolls.
    .drawer-bar {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: flex-end;
      padding-block: 0.25rem;
      background: var(--surface);
    }

    h3 {
      margin: 0 0 0.5rem;
      font-size: 0.9rem;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // The card as it is read: a label and its value, with what is empty left out.
    .facts {
      display: grid;
      gap: 0.6rem;
      margin: 0;
    }

    .fact dt {
      font-size: 0.8rem;
    }

    .fact dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .fact-text {
      white-space: pre-wrap;
    }

    .reading-line {
      margin: 0;
    }

    li {
      padding: 0.4rem 0;
      border-block-end: 1px solid var(--zk-border);
    }
  }
</style>
