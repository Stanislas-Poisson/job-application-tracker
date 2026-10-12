<script setup lang="ts">
  import { dayjs, isPast } from '@zairakai/js-utils/datetime'
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { computed, reactive } from 'vue'
  import { useApp } from '../../composables/useApp'
  import type { Application } from '../../models'
  import { addReminder, setReminderDone } from '../../services/applications'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()

  const form = reactive({ title: '', dueOn: dayjs().add(7, 'day').format('YYYY-MM-DD') })

  // What is still to do first, by date, then what is done.
  const reminders = computed(() =>
    [...(props.application.reminders ?? [])].sort(
      (a, b) => Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) || a.dueAt.localeCompare(b.dueAt)
    )
  )

  function add() {
    if ('' !== form.title.trim() && '' !== form.dueOn) {
      addReminder(props.application.id, form.title, dayjs(form.dueOn).toISOString())
      form.title = ''
    }
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.reminders') }}</h3>
    <form
      class="stack"
      @submit.prevent="add"
    >
      <FormInput
        v-model="form.title"
        name="reminderTitle"
        :placeholder="t('drawer.reminderPlaceholder')"
      />
      <FormInput
        v-model="form.dueOn"
        name="reminderDue"
        type="date"
      />
      <FormButton type="submit">{{ t('drawer.addReminder') }}</FormButton>
    </form>
    <ul>
      <li
        v-for="reminder in reminders"
        :key="reminder.id"
        class="row"
      >
        <input
          type="checkbox"
          :checked="Boolean(reminder.doneAt)"
          :aria-label="t('drawer.markDone')"
          @change="setReminderDone(reminder.id, ($event.target as HTMLInputElement).checked)"
        />
        <span :class="{ error: !reminder.doneAt && isPast(reminder.dueAt) }">
          {{ reminder.title }} - {{ dayjs(reminder.dueAt).format('YYYY-MM-DD') }}
        </span>
      </li>
    </ul>
  </section>
</template>
