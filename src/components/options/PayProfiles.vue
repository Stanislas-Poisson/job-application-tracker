<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useFormat } from '../../composables/useFormat'
  import { notifyUndo, say } from '../../composables/useNotices'
  import { PayProfile } from '../../models'
  import {
    PayProfileError,
    deletePayProfile,
    duplicatePayProfile,
    formatBrackets,
    parseBrackets,
    savePayProfile,
  } from '../../services/netPay'
  import { PAY_EXAMPLES } from '../../services/payExamples'
  import { deleteWithUndo } from '../../services/undo'
  import { countryName, listCountries } from '../../utils/contact'

  const { t, settings, updateSettings, persistence } = useApp()
  const format = useFormat()

  const profiles = computed(() => useRepo(PayProfile).orderBy('name').get())

  interface LineForm {
    label: string
    base: string
    kind: string
    share: string
    rate: string
    brackets: string
  }
  const editing = ref<string | null | undefined>(undefined)
  const form = reactive({ name: '', country: '', status: '', currency: 'EUR', notes: '', lines: [] as LineForm[] })
  const problem = ref('')
  const example = ref('')
  useDirtyGuard(() => undefined !== editing.value && hasText(form.name))

  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })
  const exampleOptions = computed(() => ({
    '': t('payProfiles.chooseExample'),
    ...Object.fromEntries(PAY_EXAMPLES.map((candidate) => [candidate.key, candidate.name])),
  }))
  const baseOptions = computed(() => ({ gross: t('payProfiles.bases.gross'), running: t('payProfiles.bases.running') }))
  const kindOptions = computed(() => ({ rate: t('payProfiles.kinds.rate'), brackets: t('payProfiles.kinds.brackets') }))

  const blankLine = (): LineForm => ({ label: '', base: 'gross', kind: 'rate', share: '', rate: '', brackets: '' })

  function startNew() {
    editing.value = null
    problem.value = ''
    Object.assign(form, { name: '', country: '', status: '', currency: 'EUR', notes: '', lines: [blankLine()] })
  }

  function startEdit(profile: PayProfile) {
    editing.value = profile.id
    problem.value = ''
    Object.assign(form, {
      name: profile.name,
      country: profile.country ?? '',
      status: profile.status ?? '',
      currency: profile.currency,
      notes: profile.notes ?? '',
      lines: profile.lines.map((line) => ({
        label: line.label,
        base: line.base,
        kind: line.kind,
        share: undefined === line.share ? '' : String(line.share),
        rate: undefined === line.rate ? '' : String(line.rate),
        brackets: formatBrackets(line.brackets ?? []),
      })),
    })
  }

  function save() {
    problem.value = ''
    const number = (text: string) => Number(text.trim().replace(',', '.'))
    try {
      savePayProfile(
        {
          ...form,
          lines: form.lines.map((line) => ({
            label: line.label,
            base: line.base,
            kind: line.kind,
            ...('' === line.share.trim() ? {} : { share: number(line.share) }),
            ...('rate' === line.kind ? { rate: number(line.rate) } : { brackets: parseBrackets(line.brackets) }),
          })),
        },
        editing.value ?? undefined
      )
    } catch (error) {
      if (error instanceof PayProfileError) {
        problem.value = t(`payProfiles.errors.${error.code}`)
        return
      }
      throw error
    }
    editing.value = undefined
  }

  // The profile goes to the trash; the message offers to put it back, and to select it again if it was the one in use.
  async function remove(profile: PayProfile) {
    const wasSelected = settings.payProfileId === profile.id
    const undo = await deleteWithUndo(persistence, () => deletePayProfile(profile.id))
    if (wasSelected) {
      void updateSettings({ payProfileId: '' })
    }
    notifyUndo(t('notice.removed', { name: profile.name }), t('notice.undo'), async () => {
      await undo()
      if (wasSelected) {
        void updateSettings({ payProfileId: profile.id })
      }
    })
  }

  function copy(profile: PayProfile) {
    duplicatePayProfile(profile.id, t('payProfiles.copyOf', { name: profile.name }))
  }

  function addExample() {
    const found = PAY_EXAMPLES.find((candidate) => candidate.key === example.value)
    if (found) {
      savePayProfile(found)
      say(t('payProfiles.added', { name: found.name }))
      example.value = ''
    }
  }
</script>

<template>
  <h2>{{ t('payProfiles.title') }}</h2>
  <p class="muted">{{ t('payProfiles.hint') }}</p>
  <p class="muted">{{ t('payProfiles.never') }}</p>

  <ul
    v-if="0 < profiles.length"
    id="pay-profiles"
    class="stack"
  >
    <li
      v-for="profile in profiles"
      :key="profile.id"
      class="row"
    >
      <label class="row">
        <input
          type="radio"
          name="payProfile"
          :checked="settings.payProfileId === profile.id"
          @change="updateSettings({ payProfileId: profile.id })"
        />
        <span>
          <strong>{{ profile.name }}</strong>
          <small class="muted">
            {{
              [
                profile.country ? countryName(profile.country, format.locale.value) : '',
                profile.status,
                profile.currency,
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </small>
        </span>
      </label>
      <FormButton
        type="button"
        @click="startEdit(profile)"
        >{{ t('payProfiles.edit') }}</FormButton
      >
      <FormButton
        type="button"
        @click="copy(profile)"
        >{{ t('payProfiles.duplicate') }}</FormButton
      >
      <FormButton
        type="button"
        @click="remove(profile)"
        >{{ t('payProfiles.delete') }}</FormButton
      >
    </li>
    <li>
      <label class="row">
        <input
          type="radio"
          name="payProfile"
          :checked="'' === settings.payProfileId"
          @change="updateSettings({ payProfileId: '' })"
        />
        {{ t('payProfiles.none') }}
      </label>
    </li>
  </ul>
  <p
    v-else
    class="muted"
  >
    {{ t('payProfiles.empty') }}
  </p>

  <div class="row">
    <FormSelect
      v-model="example"
      name="payExample"
      :label="t('payProfiles.example')"
      :options="exampleOptions"
    />
    <FormButton
      type="button"
      :disabled="'' === example"
      @click="addExample"
      >{{ t('payProfiles.addExample') }}</FormButton
    >
    <FormButton
      id="new-pay-profile"
      type="button"
      @click="startNew"
      >{{ t('payProfiles.new') }}</FormButton
    >
  </div>
  <form
    v-if="undefined !== editing"
    id="pay-profile-form"
    class="card stack"
    @submit.prevent="save"
  >
    <FormInput
      v-model="form.name"
      name="payName"
      :label="t('payProfiles.name')"
    />
    <div class="row">
      <FormSelect
        v-model="form.country"
        name="payCountry"
        :label="t('fields.country')"
        :options="countryOptions"
      />
      <FormInput
        v-model="form.status"
        name="payStatus"
        :label="t('payProfiles.status')"
      />
      <FormInput
        v-model="form.currency"
        name="payCurrency"
        :label="t('fields.salaryCurrency')"
      />
    </div>
    <h3>{{ t('payProfiles.lines') }}</h3>
    <p class="muted">{{ t('payProfiles.linesHint') }}</p>
    <div
      v-for="(line, index) in form.lines"
      :key="index"
      class="card stack pay-line"
    >
      <FormInput
        v-model="line.label"
        :name="`lineLabel${index}`"
        :label="t('payProfiles.lineLabel')"
      />
      <div class="row">
        <FormSelect
          v-model="line.base"
          :name="`lineBase${index}`"
          :label="t('payProfiles.base')"
          :options="baseOptions"
        />
        <FormSelect
          v-model="line.kind"
          :name="`lineKind${index}`"
          :label="t('payProfiles.kind')"
          :options="kindOptions"
        />
        <FormInput
          v-model="line.share"
          :name="`lineShare${index}`"
          :label="t('payProfiles.share')"
        />
      </div>
      <FormInput
        v-if="'rate' === line.kind"
        v-model="line.rate"
        :name="`lineRate${index}`"
        :label="t('payProfiles.rate')"
      />
      <FormTextarea
        v-else
        v-model="line.brackets"
        :name="`lineBrackets${index}`"
        :rows="5"
        :label="t('payProfiles.brackets')"
      />
      <FormButton
        type="button"
        @click="form.lines.splice(index, 1)"
        >{{ t('payProfiles.removeLine') }}</FormButton
      >
    </div>
    <FormButton
      type="button"
      @click="form.lines.push(blankLine())"
      >{{ t('payProfiles.addLine') }}</FormButton
    >
    <FormTextarea
      v-model="form.notes"
      name="payNotes"
      :rows="3"
      :label="t('payProfiles.notes')"
    />
    <p
      v-if="problem"
      class="error"
      role="alert"
    >
      {{ problem }}
    </p>
    <div class="row">
      <FormButton type="submit">{{ t('payProfiles.save') }}</FormButton>
      <FormButton
        type="button"
        @click="editing = undefined"
        >{{ t('options.cancel') }}</FormButton
      >
    </div>
  </form>
</template>
