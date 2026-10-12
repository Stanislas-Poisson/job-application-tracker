<script setup lang="ts">
  import { dayjs } from '@zairakai/js-utils/datetime'
  import { FormButton, FormTextarea } from '@zairakai/vue-components/Form'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import type { Application } from '../../models'
  import { addNote } from '../../services/applications'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()

  const body = ref('')

  // The newest note first.
  const notes = computed(() =>
    [...(props.application.notes ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )

  function add() {
    if ('' !== body.value.trim()) {
      addNote('applications', props.application.id, body.value)
      body.value = ''
    }
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.notes') }}</h3>
    <form
      class="stack"
      @submit.prevent="add"
    >
      <FormTextarea
        v-model="body"
        name="newNote"
        :placeholder="t('drawer.notePlaceholder')"
        :rows="3"
      />
      <FormButton type="submit">{{ t('drawer.addNote') }}</FormButton>
    </form>
    <ul>
      <li
        v-for="note in notes"
        :key="note.id"
      >
        <p class="note-body">{{ note.body }}</p>
        <small class="muted">{{ dayjs(note.createdAt).format('YYYY-MM-DD HH:mm') }}</small>
      </li>
    </ul>
  </section>
</template>

<style lang="scss">
  .note-body {
    margin: 0 0 0.2rem;
    white-space: pre-wrap;
  }
</style>
