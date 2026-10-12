<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, JobOffer, Status } from '../../models'
  import { deleteApplication, findOrCreateCompany, moveApplication, setArchived } from '../../services/applications'
  import { SalaryError, salaryFromForm } from '../../services/salary'
  import { countryName, listCountries } from '../../utils/contact'
  import { SALARY_KINDS, SALARY_PERIODS, currencyName, listCurrencies, minorToInput } from '../../utils/money'

  const props = defineProps<{ application: Application }>()
  const emit = defineEmits<{ deleted: [] }>()

  const { t, persistence } = useApp()
  const format = useFormat()
  // What is wrong with the form, shown under it.
  const problem = ref('')

  const offer = computed(() => props.application.jobOffer)
  const form = reactive({
    title: '',
    company: '',
    url: '',
    location: '',
    country: '',
    contractType: '',
    postedOn: '',
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: '',
    salaryPeriod: '',
    salaryKind: '',
    description: '',
  })

  // The form starts again from the stored values when another application is opened.
  watch(
    () => props.application.id,
    () => {
      Object.assign(form, {
        title: offer.value?.title ?? '',
        company: offer.value?.company?.name ?? '',
        url: offer.value?.url ?? '',
        location: offer.value?.location ?? '',
        country: offer.value?.country ?? '',
        contractType: offer.value?.contractType ?? '',
        postedOn: offer.value?.postedOn ?? '',
        salaryMin: minorToInput(offer.value?.salaryMin ?? null, offer.value?.salaryCurrency ?? null),
        salaryMax: minorToInput(offer.value?.salaryMax ?? null, offer.value?.salaryCurrency ?? null),
        salaryCurrency: offer.value?.salaryCurrency ?? '',
        salaryPeriod: offer.value?.salaryPeriod ?? '',
        salaryKind: offer.value?.salaryKind ?? '',
        description: offer.value?.description ?? '',
      })
    },
    { immediate: true }
  )

  const statusOptions = computed(() =>
    Object.fromEntries(
      useRepo(Status)
        .orderBy('order')
        .get()
        .map((status) => [status.id, status.label])
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

  function save() {
    if (!offer.value) {
      return
    }
    problem.value = ''
    let salary
    try {
      salary = salaryFromForm({
        min: form.salaryMin,
        max: form.salaryMax,
        currency: form.salaryCurrency,
        period: form.salaryPeriod,
        kind: form.salaryKind,
      })
    } catch (error) {
      if (error instanceof SalaryError) {
        problem.value = t(`drawer.salaryErrors.${error.code}`)
        return
      }
      throw error
    }
    useRepo(JobOffer)
      .where('id', offer.value.id)
      .update({
        title: form.title.trim(),
        companyId: '' === form.company.trim() ? null : findOrCreateCompany(form.company).id,
        url: form.url || null,
        location: form.location || null,
        country: form.country || null,
        contractType: form.contractType || null,
        postedOn: form.postedOn || null,
        ...salary,
        description: form.description || null,
      })
  }

  // A move is written at once: closing the tab right after must not lose it.
  async function move(statusId: string) {
    moveApplication(props.application.id, statusId)
    await persistence.flush()
  }

  function remove() {
    if (window.confirm(t('drawer.confirmDelete'))) {
      deleteApplication(props.application.id)
      emit('deleted')
    }
  }
</script>

<template>
  <section>
    <h3>{{ t('drawer.details') }}</h3>
    <form
      class="stack"
      @submit.prevent="save"
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
      <FormInput
        v-model="form.company"
        name="company"
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
      >
        {{ problem }}
      </p>
      <div class="row">
        <FormButton type="submit">{{ t('drawer.save') }}</FormButton>
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
