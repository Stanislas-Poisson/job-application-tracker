<script setup lang="ts">
  import { OverlayDrawer } from '@zairakai/vue-components/Overlay'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { Application } from '../../models'
  import DrawerContacts from './DrawerContacts.vue'
  import DrawerDetails from './DrawerDetails.vue'
  import DrawerNotes from './DrawerNotes.vue'
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
          .with('reminders')
          .find(props.applicationId)
      : null
  )
</script>

<template>
  <OverlayDrawer
    :model-value="null !== applicationId"
    :title="application?.jobOffer?.title ?? ''"
    :close-label="t('drawer.close')"
    @update:model-value="!$event && emit('close')"
  >
    <div
      v-if="application"
      class="stack drawer-content"
    >
      <DrawerDetails
        :application="application"
        @deleted="emit('close')"
      />
      <DrawerNotes :application="application" />
      <DrawerReminders :application="application" />
      <DrawerContacts :application="application" />
      <DrawerTimeline :application="application" />
    </div>
  </OverlayDrawer>
</template>

<style lang="scss">
  dialog.drawer {
    width: min(32rem, 94vw);
    max-width: none;
  }

  .drawer-content {
    gap: 1.5rem;
    min-width: 0;

    h3 {
      margin: 0 0 0.5rem;
      font-size: 0.9rem;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      padding: 0.4rem 0;
      border-bottom: 1px solid var(--zk-border);
    }
  }
</style>
