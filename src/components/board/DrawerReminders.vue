<script setup lang="ts">
  import { isPast } from '@zairakai/js-utils/datetime'
  import { FormButton, FormInput } from '@zairakai/vue-components/Form'
  import { computed, reactive } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'
  import { addReminder, setReminderDone } from '../../services/applications'
  import { suggestFollowUp } from '../../services/followUp'
  import { inDaysAt, zonedToUtc } from '../../utils/time'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()

  // The time is typed in the time zone of the settings, and stored in UTC.
  const form = reactive({ title: '', due: inDaysAt(settings.followUpDays, 9, format.timeZone.value) })
  useDirtyGuard(() => hasText(form.title))

  // What is still to do first, by date, then what is done.
  const reminders = computed(() =>
    [...(props.application.reminders ?? [])].sort(
      (a, b) => Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) || a.dueAt.localeCompare(b.dueAt)
    )
  )

  // A reminder to follow up, some days after applying: offered, never added without the user.
  const suggestion = computed(() => suggestFollowUp(props.application, settings.followUpDays, format.timeZone.value))

  function acceptSuggestion() {
    if (suggestion.value) {
      addReminder(props.application.id, t('drawer.followUp'), suggestion.value.dueAt)
    }
  }

  function add() {
    if ('' !== form.title.trim() && '' !== form.due) {
      addReminder(props.application.id, form.title, zonedToUtc(form.due, format.timeZone.value))
      form.title = ''
    }
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.reminders') }}</h3>
    <div
      v-if="suggestion"
      id="follow-up-suggestion"
      class="row"
    >
      <span>{{
        t('drawer.followUpSuggestion', { days: suggestion.days, date: format.instant(suggestion.dueAt) })
      }}</span>
      <FormButton
        type="button"
        @click="acceptSuggestion"
        >{{ t('drawer.followUpAdd') }}</FormButton
      >
    </div>
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
        v-model="form.due"
        name="reminderDue"
        type="datetime-local"
      />
      <p class="muted">{{ t('drawer.timeZoneHint', { zone: format.timeZone.value }) }}</p>
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
          {{ reminder.title }} - {{ format.instant(reminder.dueAt) }}
        </span>
      </li>
    </ul>
  </section>
</template>
