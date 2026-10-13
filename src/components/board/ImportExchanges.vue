<script setup lang="ts">
  import { FormButton, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, Contact } from '../../models'
  import { CHANNELS, DIRECTIONS, type Direction } from '../../models/Interaction'
  import {
    type ExchangeDraft,
    draftFromEml,
    draftFromText,
    draftsFromCsv,
    draftsFromJson,
    importDrafts,
    issuesOf,
    matchContacts,
  } from '../../services/importExchanges'
  import { utcToZonedInput, zonedToUtc } from '../../utils/time'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()

  interface Row {
    draft: ExchangeDraft
    selected: boolean
    // What the user types for a date the file did not have, in their time zone.
    when: string
  }

  const mode = ref<'paste' | 'files'>('paste')
  const pasted = reactive({
    channel: 'email',
    direction: 'inbound',
    when: utcToZonedInput(new Date().toISOString(), format.timeZone.value),
    text: '',
  })
  const rows = ref<Row[]>([])
  useDirtyGuard(() => hasText(pasted.text))
  const message = ref('')
  const failed = ref(false)

  const context = () => ({ timeZone: format.timeZone.value, ownAddresses: settings.ownEmails })

  const channelOptions = computed(() =>
    Object.fromEntries(CHANNELS.map((channel) => [channel, t(`interactions.channels.${channel}`)]))
  )
  const directionOptions = computed(() => ({
    '': t('import.chooseDirection'),
    ...Object.fromEntries(DIRECTIONS.map((direction) => [direction, t(`interactions.directions.${direction}`)])),
  }))
  const contacts = computed(() =>
    (props.application.contacts ?? []).map((contact) => ({
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
    }))
  )
  const contactOptions = computed(() => ({
    '': t('interactions.nobody'),
    ...Object.fromEntries(contacts.value.map((contact) => [contact.id, contact.name])),
  }))

  // Every draft is matched to the contacts of the application first, then to the others.
  function show(drafts: ExchangeDraft[]) {
    const known = useRepo(Contact).with('methods').get() as never
    rows.value = matchContacts(drafts, known).map((draft) => ({
      draft,
      selected: 0 === issuesOf(draft).length,
      when: '',
    }))
    message.value = ''
  }

  function preview() {
    const occurredAt = '' === pasted.when ? null : zonedToUtc(pasted.when, format.timeZone.value)
    show([
      draftFromText(
        pasted.text,
        {
          channel: pasted.channel as (typeof CHANNELS)[number],
          direction: pasted.direction as (typeof DIRECTIONS)[number],
          occurredAt,
        },
        context()
      ),
    ])
  }

  async function readFiles(event: Event) {
    const input = event.target as HTMLInputElement
    const drafts: ExchangeDraft[] = []
    failed.value = false
    for (const file of Array.from(input.files ?? [])) {
      const text = await file.text()
      const name = file.name.toLowerCase()
      if (name.endsWith('.eml')) {
        drafts.push(draftFromEml(text, context()))
      } else if (name.endsWith('.json') || name.endsWith('.csv')) {
        const parsed = name.endsWith('.json') ? draftsFromJson(text, context()) : draftsFromCsv(text, context())
        if (null !== parsed.error) {
          failed.value = true
          message.value = t(`import.errors.${parsed.error}`, { file: file.name })
          input.value = ''
          return
        }
        drafts.push(...parsed.drafts)
      }
    }
    input.value = ''
    show(drafts)
    if (0 === drafts.length) {
      failed.value = true
      message.value = t('import.nothing')
    }
  }

  type Option = string | number | unknown[] | undefined

  function setDirection(row: Row, value: Option) {
    row.draft.direction = '' === value ? null : (value as Direction)
    row.selected = 0 === issuesOf(row.draft).length
  }

  function setContact(row: Row, value: Option) {
    row.draft.contactId = '' === value ? null : String(value)
  }

  function setWhen(row: Row, value: string) {
    row.when = value
    row.draft.occurredAt = '' === value ? null : zonedToUtc(value, format.timeZone.value)
    row.selected = 0 === issuesOf(row.draft).length
  }

  const importable = computed(() => rows.value.filter((row) => row.selected && 0 === issuesOf(row.draft).length))

  function commit() {
    const result = importDrafts(
      importable.value.map((row) => row.draft),
      props.application.id
    )
    failed.value = false
    message.value = t('import.done', { added: result.added, duplicates: result.duplicates, skipped: result.skipped })
    rows.value = []
    pasted.text = ''
  }
</script>

<template>
  <details class="import">
    <summary>{{ t('import.title') }}</summary>
    <div class="stack">
      <p class="muted">{{ t('import.hint') }}</p>
      <div
        class="row"
        role="radiogroup"
        :aria-label="t('import.title')"
      >
        <label class="row"
          ><input
            v-model="mode"
            type="radio"
            name="importMode"
            value="paste"
          />
          {{ t('import.modePaste') }}</label
        >
        <label class="row"
          ><input
            v-model="mode"
            type="radio"
            name="importMode"
            value="files"
          />
          {{ t('import.modeFiles') }}</label
        >
      </div>

      <form
        v-if="'paste' === mode"
        class="stack"
        @submit.prevent="preview"
      >
        <div class="row">
          <FormSelect
            v-model="pasted.channel"
            name="importChannel"
            :label="t('interactions.channel')"
            :options="channelOptions"
          />
          <FormSelect
            v-model="pasted.direction"
            name="importDirection"
            :label="t('interactions.direction')"
            :options="{
              inbound: t('interactions.directions.inbound'),
              outbound: t('interactions.directions.outbound'),
            }"
          />
        </div>
        <label class="field">
          <span>{{ t('interactions.when') }}</span>
          <input
            v-model="pasted.when"
            name="importWhen"
            type="datetime-local"
          />
        </label>
        <FormTextarea
          v-model="pasted.text"
          name="importText"
          :label="t('import.paste')"
          :rows="6"
        />
        <FormButton type="submit">{{ t('import.preview') }}</FormButton>
      </form>

      <label
        v-else
        class="field"
      >
        <span>{{ t('import.files') }}</span>
        <input
          name="importFiles"
          type="file"
          multiple
          accept=".eml,.json,.csv,message/rfc822,application/json,text/csv"
          @change="readFiles"
        />
      </label>

      <p
        v-if="message"
        :class="failed ? 'error' : 'success'"
        role="status"
      >
        {{ message }}
      </p>

      <ul
        v-if="rows.length"
        class="import-rows"
      >
        <li
          v-for="(row, index) in rows"
          :key="index"
          class="import-row"
        >
          <label class="row">
            <input
              v-model="row.selected"
              type="checkbox"
              :disabled="0 < issuesOf(row.draft).length"
            />
            <strong dir="auto">{{ row.draft.subject ?? row.draft.body?.slice(0, 60) ?? '' }}</strong>
          </label>
          <div class="row import-fields">
            <FormSelect
              v-model="row.draft.channel"
              :name="`rowChannel${index}`"
              :options="channelOptions"
              :aria-label="t('interactions.channel')"
              :field="false"
            />
            <FormSelect
              :model-value="row.draft.direction ?? ''"
              :name="`rowDirection${index}`"
              :options="directionOptions"
              :aria-label="t('interactions.direction')"
              :field="false"
              @update:model-value="setDirection(row, $event)"
            />
            <FormSelect
              :model-value="row.draft.contactId ?? ''"
              :name="`rowContact${index}`"
              :options="contactOptions"
              :aria-label="t('interactions.contact')"
              :field="false"
              @update:model-value="setContact(row, $event)"
            />
          </div>
          <p class="muted import-meta">
            <span
              v-if="row.draft.counterpart"
              dir="auto"
              >{{ row.draft.counterpart }}</span
            >
            <span v-if="row.draft.occurredAt">{{ format.instant(row.draft.occurredAt) }}</span>
            <input
              v-else
              type="datetime-local"
              :value="row.when"
              :aria-label="t('interactions.when')"
              @input="setWhen(row, ($event.target as HTMLInputElement).value)"
            />
          </p>
          <p
            v-if="issuesOf(row.draft).length"
            class="error"
          >
            {{
              issuesOf(row.draft)
                .map((issue) => t(`import.issues.${issue}`))
                .join(' ')
            }}
          </p>
        </li>
      </ul>
      <FormButton
        v-if="rows.length"
        type="button"
        :disabled="0 === importable.length"
        @click="commit"
      >
        {{ t('import.commit', { count: importable.length }) }}
      </FormButton>
    </div>
  </details>
</template>

<style lang="scss">
  .import {
    margin-block: 1rem;
  }

  .import-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .import-row {
    padding-block: 0.5rem;
  }

  .import-fields {
    flex-wrap: wrap;
  }

  .import-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0;
    font-size: 0.82rem;
  }
</style>
