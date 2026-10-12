<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'
  import { CHANNELS, DIRECTIONS } from '../../models/Interaction'
  import { InteractionError, addInteraction, removeInteraction } from '../../services/interactions'
  import { utcToZonedInput, zonedToUtc } from '../../utils/time'
  import ImportExchanges from './ImportExchanges.vue'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()
  const format = useFormat()

  const now = () => utcToZonedInput(new Date().toISOString(), format.timeZone.value)
  const empty = () => ({
    channel: 'email',
    direction: 'inbound',
    contactId: '',
    when: now(),
    subject: '',
    body: '',
    duration: '' as string | number,
  })
  const form = reactive(empty())
  const problem = ref('')

  const channelOptions = computed(() =>
    Object.fromEntries(CHANNELS.map((channel) => [channel, t(`interactions.channels.${channel}`)]))
  )
  const directionOptions = computed(() =>
    Object.fromEntries(DIRECTIONS.map((direction) => [direction, t(`interactions.directions.${direction}`)]))
  )
  const contactOptions = computed(() => ({
    '': t('interactions.nobody'),
    ...Object.fromEntries(
      (props.application.contacts ?? []).map((contact) => [
        contact.id,
        `${contact.firstName} ${contact.lastName}`.trim(),
      ])
    ),
  }))

  // A call, a video call and a meeting last some time.
  const hasDuration = computed(() => ['phone', 'video', 'in_person'].includes(form.channel))

  const exchanges = computed(() =>
    [...(props.application.interactions ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  )

  const who = (exchange: Application['interactions'][number]) => {
    const contact = (props.application.contacts ?? []).find((candidate) => candidate.id === exchange.contactId)
    return contact ? `${contact.firstName} ${contact.lastName}`.trim() : (exchange.counterpart ?? '')
  }

  function add() {
    problem.value = ''
    try {
      addInteraction({
        applicationId: props.application.id,
        contactId: '' === form.contactId ? null : form.contactId,
        channel: form.channel as (typeof CHANNELS)[number],
        direction: form.direction as (typeof DIRECTIONS)[number],
        subject: form.subject,
        body: form.body,
        occurredAt: '' === form.when ? '' : zonedToUtc(form.when, format.timeZone.value),
        durationMinutes: hasDuration.value && '' !== String(form.duration) ? Number(form.duration) : null,
      })
    } catch (error) {
      if (error instanceof InteractionError) {
        problem.value = t(`interactions.errors.${error.code}`)
        return
      }
      throw error
    }
    Object.assign(form, { ...empty(), channel: form.channel, direction: form.direction, contactId: form.contactId })
  }
</script>

<template>
  <section>
    <h3>{{ t('interactions.title') }}</h3>
    <form
      class="stack"
      @submit.prevent="add"
    >
      <div class="row">
        <FormSelect
          v-model="form.channel"
          name="channel"
          :label="t('interactions.channel')"
          :options="channelOptions"
        />
        <FormSelect
          v-model="form.direction"
          name="direction"
          :label="t('interactions.direction')"
          :options="directionOptions"
        />
      </div>
      <FormSelect
        v-model="form.contactId"
        name="interactionContact"
        :label="t('interactions.contact')"
        :options="contactOptions"
      />
      <FormInput
        v-model="form.when"
        name="interactionWhen"
        type="datetime-local"
        :label="t('interactions.when')"
      />
      <p class="muted">{{ t('drawer.timeZoneHint', { zone: format.timeZone.value }) }}</p>
      <FormInput
        v-if="hasDuration"
        v-model="form.duration"
        name="interactionDuration"
        type="number"
        min="0"
        step="1"
        :label="t('interactions.duration')"
      />
      <FormInput
        v-model="form.subject"
        name="interactionSubject"
        :label="t('interactions.subject')"
      />
      <FormTextarea
        v-model="form.body"
        name="interactionBody"
        :label="t('interactions.body')"
        :rows="5"
      />
      <p
        v-if="problem"
        class="error"
      >
        {{ problem }}
      </p>
      <FormButton type="submit">{{ t('interactions.add') }}</FormButton>
    </form>

    <ImportExchanges :application="application" />

    <ul>
      <li
        v-for="exchange in exchanges"
        :key="exchange.id"
        class="exchange"
      >
        <div class="row">
          <strong>{{ t(`interactions.channels.${exchange.channel}`) }}</strong>
          <span class="muted">{{ t(`interactions.directions.${exchange.direction}`) }}</span>
          <span
            v-if="who(exchange)"
            dir="auto"
            >{{ who(exchange) }}</span
          >
          <small class="muted">{{ format.instant(exchange.occurredAt) }}</small>
          <small
            v-if="null !== exchange.durationMinutes"
            class="muted"
            >{{ t('interactions.minutes', { count: exchange.durationMinutes }) }}</small
          >
          <FormButton
            type="button"
            @click="removeInteraction(exchange.id)"
          >
            {{ t('interactions.remove') }}
          </FormButton>
        </div>
        <p
          v-if="exchange.subject"
          class="exchange-subject"
          dir="auto"
        >
          {{ exchange.subject }}
        </p>
        <details v-if="exchange.body">
          <summary>{{ t('interactions.showText') }}</summary>
          <p
            class="exchange-body"
            dir="auto"
          >
            {{ exchange.body }}
          </p>
        </details>
      </li>
    </ul>
  </section>
</template>

<style lang="scss">
  .exchange-subject {
    margin: 0.25rem 0 0;
    font-weight: 600;
  }

  .exchange-body {
    margin: 0.4rem 0 0;
    white-space: pre-wrap;
  }
</style>
