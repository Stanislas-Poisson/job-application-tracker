<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { JobOffer } from '../../models'
  import { CURRENCY_DISPLAYS, currencyName, listCurrencies } from '../../utils/money'

  const { t, settings, updateSettings } = useApp()
  const format = useFormat()

  const labelled = (codes: string[]) =>
    Object.fromEntries(codes.map((code) => [code, `${code} - ${currencyName(code, format.locale.value)}`]))

  const homeOptions = computed(() => ({ '': t('money.homeNone'), ...labelled(listCurrencies()) }))
  const displayOptions = computed(() =>
    Object.fromEntries(CURRENCY_DISPLAYS.map((display) => [display, t(`money.displays.${display}`)]))
  )

  // The currencies that need a rate: those of the offers, those that already have one, and those the user adds.
  const added = ref<string[]>([])
  const rows = computed(() => {
    const used = useRepo(JobOffer)
      .all()
      .map((offer) => offer.salaryCurrency)
      .filter((code): code is string => Boolean(code))
    return [...new Set([...used, ...Object.keys(settings.rates), ...added.value])]
      .filter((code) => code !== settings.homeCurrency)
      .sort()
  })
  const addable = computed(() => labelled(listCurrencies().filter((code) => !rows.value.includes(code))))

  function setRate(code: string, text: string) {
    const rates = { ...settings.rates }
    const rate = Number(text.trim().replace(',', '.'))
    if ('' === text.trim()) {
      delete rates[code]
    } else if (Number.isFinite(rate) && 0 < rate) {
      rates[code] = rate
    } else {
      return
    }
    void updateSettings({ rates })
  }

  function setNumber(key: 'workingDaysPerYear' | 'hoursPerDay', text: string, min: number, max: number) {
    const value = Number(text.trim().replace(',', '.'))
    if (Number.isFinite(value) && min <= value && value <= max) {
      void updateSettings({ [key]: value })
    }
  }
</script>

<template>
  <h2>{{ t('money.title') }}</h2>
  <div class="stack">
    <FormSelect
      :model-value="settings.homeCurrency"
      name="homeCurrency"
      :label="t('money.home')"
      :options="homeOptions"
      @update:model-value="updateSettings({ homeCurrency: String($event) })"
    />
    <FormSelect
      :model-value="settings.currencyDisplay"
      name="currencyDisplay"
      :label="t('money.display')"
      :options="displayOptions"
      @update:model-value="updateSettings({ currencyDisplay: String($event) as (typeof CURRENCY_DISPLAYS)[number] })"
    />

    <template v-if="'' !== settings.homeCurrency">
      <h3>{{ t('money.rates') }}</h3>
      <p class="muted">{{ t('money.ratesHint', { home: settings.homeCurrency }) }}</p>
      <p
        v-if="0 === rows.length"
        class="muted"
      >
        {{ t('money.noRates') }}
      </p>
      <ul class="rates">
        <li
          v-for="code in rows"
          :key="code"
          class="row"
        >
          <span class="rate-label">1 {{ code }} =</span>
          <FormInput
            :model-value="settings.rates[code] ?? ''"
            :name="`rate-${code}`"
            type="number"
            step="any"
            min="0"
            :field="false"
            :aria-label="t('money.rateFor', { currency: code })"
            @update:model-value="setRate(code, String($event))"
          />
          <span>{{ settings.homeCurrency }}</span>
        </li>
      </ul>
      <FormSelect
        model-value=""
        name="addRate"
        :label="t('money.addRate')"
        :options="{ '': t('money.pick'), ...addable }"
        @update:model-value="String($event) && added.push(String($event))"
      />
    </template>

    <h3>{{ t('money.assumptions') }}</h3>
    <p class="muted">{{ t('money.assumptionsHint') }}</p>
    <div class="row">
      <FormInput
        :model-value="settings.workingDaysPerYear"
        name="workingDaysPerYear"
        type="number"
        min="1"
        max="366"
        :label="t('money.daysPerYear')"
        @update:model-value="setNumber('workingDaysPerYear', String($event), 1, 366)"
      />
      <FormInput
        :model-value="settings.hoursPerDay"
        name="hoursPerDay"
        type="number"
        step="any"
        min="1"
        max="24"
        :label="t('money.hoursPerDay')"
        @update:model-value="setNumber('hoursPerDay', String($event), 1, 24)"
      />
    </div>
  </div>
</template>

<style lang="scss">
  .rates {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rate-label {
    min-width: 6rem;
  }
</style>
