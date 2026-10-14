<script setup lang="ts">
  import { FormButton } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { confirmAction } from '../../composables/useConfirm'
  import { useFormat } from '../../composables/useFormat'
  import { say } from '../../composables/useNotices'
  import { Trash } from '../../models'
  import { TRASH_DAYS } from '../../persistence'
  import { emptyTrash, listTrash, restoreFromTrash } from '../../services/trash'

  const { t, tn, persistence } = useApp()
  const format = useFormat()

  // Reading the repository makes the list follow every change, in this page and in the others.
  const groups = computed(() => (useRepo(Trash).all(), listTrash()))

  async function restore(batch: string) {
    const count = restoreFromTrash(batch)
    await persistence.flush()
    say(tn('trash.restored', count))
  }

  async function empty() {
    if (await confirmAction({ message: t('trash.confirmEmpty'), danger: true })) {
      await persistence.forget(() => emptyTrash())
      say(t('trash.emptied'))
    }
  }
</script>

<template>
  <h2>{{ t('trash.title') }}</h2>
  <p class="muted">{{ t('trash.hint', { days: TRASH_DAYS }) }}</p>
  <p
    v-if="0 === groups.length"
    id="trash-empty"
    class="muted"
  >
    {{ t('trash.none') }}
  </p>
  <ul
    v-else
    id="trash-list"
    class="stack"
  >
    <li
      v-for="group in groups"
      :key="group.batch"
      class="row"
    >
      <span>
        <strong>{{ t(`options.entities.${group.entity}`) }}</strong>
        <template v-if="'' !== group.label"> · {{ group.label }}</template>
        <template v-if="0 < group.related"> · {{ tn('trash.related', group.related) }}</template>
        <span class="muted"> · {{ format.instant(group.deletedAt) }}</span>
      </span>
      <FormButton
        type="button"
        @click="restore(group.batch)"
        >{{ t('trash.restore') }}</FormButton
      >
    </li>
  </ul>
  <FormButton
    v-if="0 < groups.length"
    type="button"
    @click="empty"
    >{{ t('trash.empty') }}</FormButton
  >
</template>
