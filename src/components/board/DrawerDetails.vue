<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useCardDraft } from '../../composables/useCardDraft'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import { notifyUndo } from '../../composables/useNotices'
  import { type Application, Company, Status } from '../../models'
  import { deleteApplication, moveApplication, setArchived } from '../../services/applications'
  import { deleteWithUndo } from '../../services/undo'
  import { countryName, listCountries } from '../../utils/contact'
  import { SALARY_KINDS, SALARY_PERIODS, currencyName, listCurrencies } from '../../utils/money'
  import EntityPicker from '../EntityPicker.vue'

  const props = defineProps<{ application: Application }>()
  const emit = defineEmits<{ deleted: [] }>()

  const { t, persistence, statusName } = useApp()
  const format = useFormat()
  const { isEditing } = useDrawerMode()
  const offer = computed(() => props.application.jobOffer)
  // The form works on the draft of the card: nothing is written until the card is saved.
  const { draft, problem } = useCardDraft()
  const form = draft.details

  // What the card says when it is read: the order of the form, with what is empty left out.
  const facts = computed(() => {
    const source = offer.value
    if (!source) {
      return []
    }
    return [
      { key: 'company', label: t('fields.company'), value: source.company?.name ?? '' },
      { key: 'location', label: t('fields.location'), value: source.location ?? '' },
      {
        key: 'country',
        label: t('fields.country'),
        value: source.country ? countryName(source.country, format.locale.value) : '',
      },
      { key: 'contractType', label: t('fields.contractType'), value: source.contractType ?? '' },
      { key: 'postedOn', label: t('fields.postedOn'), value: source.postedOn ? format.date(source.postedOn) : '' },
      { key: 'salary', label: t('drawer.salary'), value: format.salary(source) },
      { key: 'description', label: t('fields.description'), value: source.description ?? '' },
    ].filter((fact) => '' !== fact.value)
  })

  // The companies that exist, offered to the field of the company.
  const companyNames = computed(() =>
    useRepo(Company)
      .all()
      .map((company) => company.name)
  )

  const statusOptions = computed(() =>
    Object.fromEntries(
      useRepo(Status)
        .orderBy('order')
        .get()
        .map((status) => [status.id, statusName(status)])
    )
  )

  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })

  const currencyOptions = computed(() => ({
    '': t('drawer.noCurrency'),
    ...Object.fromEntries(
      listCurrencies().map((code) => [code, `${code} - ${currencyName(code, format.locale.value)}`])
    ),
  }))
  const periodOptions = computed(() => ({
    '': t('drawer.noPeriod'),
    ...Object.fromEntries(SALARY_PERIODS.map((period) => [period, t(`salary.per.${period}`)])),
  }))
  const kindOptions = computed(() => ({
    '': t('drawer.noKind'),
    ...Object.fromEntries(SALARY_KINDS.map((kind) => [kind, t(`salary.kind.${kind}`)])),
  }))

  // A move is written at once: closing the tab right after must not lose it.
  async function move(statusId: string) {
    moveApplication(props.application.id, statusId)
    await persistence.flush()
  }

  // A deletion is written at once: closing the tab right after must not bring the application back. It goes to the trash, and
  // the message offers to put it back, with what went with it.
  async function remove() {
    const title = props.application.jobOffer?.title ?? ''
    const id = props.application.id
    emit('deleted')
    const undo = await deleteWithUndo(persistence, () => deleteApplication(id))
    notifyUndo(t('notice.removed', { name: title }), t('notice.undo'), async () => {
      await undo()
    })
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.details') }}</h3>
    <form
      v-if="isEditing"
      class="stack"
      @submit.prevent
    >
      <FormSelect
        :model-value="application.statusId ?? ''"
        name="status"
        :label="t('fields.status')"
        :options="statusOptions"
        @update:model-value="move(String($event))"
      />
      <FormInput
        v-model="form.title"
        name="title"
        :label="t('fields.title')"
        required
      />
      <EntityPicker
        v-model="form.company"
        name="company"
        :options="companyNames"
        :label="t('fields.company')"
      />
      <FormInput
        v-model="form.url"
        name="url"
        type="url"
        :label="t('fields.url')"
      />
      <a
        v-if="offer?.url"
        :href="offer.url"
        target="_blank"
        rel="noopener"
        >{{ t('drawer.openOffer') }}</a
      >
      <FormInput
        v-model="form.location"
        name="location"
        :label="t('fields.location')"
      />
      <FormSelect
        v-model="form.country"
        name="country"
        :label="t('fields.country')"
        :options="countryOptions"
      />
      <FormInput
        v-model="form.contractType"
        name="contractType"
        :label="t('fields.contractType')"
      />
      <FormInput
        v-model="form.postedOn"
        name="postedOn"
        type="date"
        :label="t('fields.postedOn')"
      />
      <fieldset class="salary">
        <legend>{{ t('drawer.salary') }}</legend>
        <div class="row">
          <FormInput
            v-model="form.salaryMin"
            name="salaryMin"
            type="number"
            step="any"
            min="0"
            :label="t('fields.salaryMin')"
          />
          <FormInput
            v-model="form.salaryMax"
            name="salaryMax"
            type="number"
            step="any"
            min="0"
            :label="t('fields.salaryMax')"
          />
        </div>
        <FormSelect
          v-model="form.salaryCurrency"
          name="salaryCurrency"
          :label="t('fields.salaryCurrency')"
          :options="currencyOptions"
        />
        <div class="row">
          <FormSelect
            v-model="form.salaryPeriod"
            name="salaryPeriod"
            :label="t('fields.salaryPeriod')"
            :options="periodOptions"
          />
          <FormSelect
            v-model="form.salaryKind"
            name="salaryKind"
            :label="t('fields.salaryKind')"
            :options="kindOptions"
          />
        </div>
        <p
          v-if="offer && format.salaryInHome(offer)"
          class="muted"
        >
          {{ format.salaryInHome(offer) }}
        </p>
      </fieldset>

      <FormTextarea
        v-model="form.description"
        name="description"
        :label="t('fields.description')"
        :rows="5"
      />
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
          @click="setArchived(application.id, !application.archived)"
        >
          {{ application.archived ? t('drawer.unarchive') : t('drawer.archive') }}
        </FormButton>
        <FormButton
          type="button"
          @click="remove"
          >{{ t('drawer.delete') }}</FormButton
        >
      </div>
    </form>
    <div
      v-else
      class="stack"
    >
      <!-- Moving the card to another column is an action of the day: it stays in reach while reading. -->
      <FormSelect
        :model-value="application.statusId ?? ''"
        name="status"
        :label="t('fields.status')"
        :options="statusOptions"
        @update:model-value="move(String($event))"
      />
      <a
        v-if="offer?.url"
        :href="offer.url"
        target="_blank"
        rel="noopener"
        >{{ t('drawer.openOffer') }}</a
      >
      <dl class="facts">
        <div
          v-for="fact in facts"
          :key="fact.key"
          class="fact"
        >
          <dt class="muted">{{ fact.label }}</dt>
          <!-- bdi: the text keeps its own direction, and the line follows the one of the page, so that a column of values lines up. -->
          <dd :class="{ 'fact-text': 'description' === fact.key }">
            <bdi>{{ fact.value }}</bdi>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style lang="scss">
  .salary {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--zk-border);
    border-radius: var(--zk-radius);

    legend {
      padding-inline: 0.4rem;
      font-size: 0.82rem;
      color: var(--zk-muted);
    }
  }
</style>
