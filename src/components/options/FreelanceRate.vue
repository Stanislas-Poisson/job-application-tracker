<script setup lang="ts">
  import { FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { PayProfile } from '../../models'
  import { type ChargesOn, netFromTurnover, ratesOf, turnoverForNet } from '../../services/freelanceRate'
  import { formatMoney, isCurrency, toMinor } from '../../utils/money'

  const { t, settings } = useApp()
  const format = useFormat()

  const profiles = computed(() => useRepo(PayProfile).orderBy('name').get())
  const profileOptions = computed(() => ({
    '': t('freelance.flat'),
    ...Object.fromEntries(profiles.value.map((profile) => [profile.id, profile.name])),
  }))

  const form = reactive({
    mode: 'income',
    profileId: '',
    flatRate: '22',
    chargesOn: 'turnover',
    currency: '',
    days: '200',
    hours: String(settings.hoursPerDay),
    costs: '0',
    income: '36000',
    rate: '500',
  })

  const modeOptions = computed(() => ({ income: t('freelance.modes.income'), rate: t('freelance.modes.rate') }))
  const chargesOptions = computed(() => ({
    turnover: t('freelance.chargesOn.turnover'),
    profit: t('freelance.chargesOn.profit'),
  }))

  const profile = computed(() =>
    '' === form.profileId ? null : (profiles.value.find((p) => p.id === form.profileId) ?? null)
  )
  // The currency is the one of the profile, or the one typed, or the home currency of the settings.
  const currency = computed(() => {
    if (profile.value) {
      return profile.value.currency
    }
    const typed = form.currency.trim().toUpperCase()
    return isCurrency(typed) ? typed : isCurrency(settings.homeCurrency) ? settings.homeCurrency : 'EUR'
  })

  const number = (text: string): number | null => {
    const value = Number(text.trim().replace(',', '.'))
    return '' !== text.trim() && Number.isFinite(value) && 0 <= value ? value : null
  }
  const amount = (text: string): number | null => {
    const value = number(text)
    return null === value ? null : toMinor(String(value), currency.value)
  }

  // The result, or why there is none.
  const outcome = computed(() => {
    const days = number(form.days)
    const hours = number(form.hours)
    const costs = amount(form.costs)
    const flat = number(form.flatRate)
    if (
      null === days ||
      0 === days ||
      null === hours ||
      null === costs ||
      (null === profile.value && (null === flat || 100 < flat))
    ) {
      return 'inputs' as const
    }
    const input = {
      currency: currency.value,
      days,
      hoursPerDay: hours,
      costs,
      chargesOn: form.chargesOn as ChargesOn,
      profile: profile.value,
      flatRate: flat ?? 0,
      flatLabel: t('freelance.flatLine'),
    }
    let turnover: number | null
    if ('income' === form.mode) {
      const wanted = amount(form.income)
      if (null === wanted) {
        return 'inputs' as const
      }
      turnover = turnoverForNet(wanted, input)
    } else {
      const rate = amount(form.rate)
      if (null === rate) {
        return 'inputs' as const
      }
      turnover = Math.round(rate * days)
    }
    if (null === turnover) {
      return 'impossible' as const
    }
    return { result: netFromTurnover(turnover, input), rates: ratesOf(turnover, days, hours) }
  })

  const money = (minor: number) => formatMoney(minor, currency.value, format.locale.value, settings.currencyDisplay)
</script>

<template>
  <h2>{{ t('freelance.title') }}</h2>
  <p class="muted">{{ t('freelance.hint') }}</p>
  <div class="stack">
    <FormSelect
      v-model="form.mode"
      name="freelanceMode"
      :label="t('freelance.mode')"
      :options="modeOptions"
    />
    <div class="row">
      <FormSelect
        v-model="form.profileId"
        name="freelanceProfile"
        :label="t('freelance.charges')"
        :options="profileOptions"
      />
      <FormInput
        v-if="null === profile"
        v-model="form.flatRate"
        name="freelanceFlat"
        :label="t('freelance.flatRate')"
      />
      <FormInput
        v-if="null === profile"
        v-model="form.currency"
        name="freelanceCurrency"
        :label="t('fields.salaryCurrency')"
        :placeholder="currency"
      />
    </div>
    <FormSelect
      v-model="form.chargesOn"
      name="freelanceOn"
      :label="t('freelance.on')"
      :options="chargesOptions"
    />
    <div class="row">
      <FormInput
        v-model="form.days"
        name="freelanceDays"
        :label="t('freelance.days')"
      />
      <FormInput
        v-model="form.hours"
        name="freelanceHours"
        :label="t('freelance.hours')"
      />
      <FormInput
        v-model="form.costs"
        name="freelanceCosts"
        :label="t('freelance.costs')"
      />
    </div>
    <FormInput
      v-if="'income' === form.mode"
      v-model="form.income"
      name="freelanceIncome"
      :label="t('freelance.income')"
    />
    <FormInput
      v-else
      v-model="form.rate"
      name="freelanceRate"
      :label="t('freelance.dayRate')"
    />
  </div>

  <p
    v-if="'inputs' === outcome"
    class="muted"
  >
    {{ t('freelance.inputs') }}
  </p>
  <p
    v-else-if="'impossible' === outcome"
    id="freelance-impossible"
    class="error"
  >
    {{ t('freelance.impossible') }}
  </p>
  <div
    v-else
    id="freelance-result"
    class="stack"
  >
    <p>
      <strong>{{ t('freelance.dailyIs', { amount: money(outcome.rates.daily) }) }}</strong>
      <span class="muted"> · {{ t('freelance.hourlyIs', { amount: money(outcome.rates.hourly) }) }}</span>
    </p>
    <table class="net-detail">
      <tbody>
        <tr>
          <td>{{ t('freelance.turnover') }}</td>
          <td>{{ money(outcome.result.turnover) }}</td>
        </tr>
        <tr>
          <td>- {{ t('freelance.costsLine') }}</td>
          <td>{{ money(outcome.result.costs) }}</td>
        </tr>
        <tr
          v-for="line in outcome.result.charges"
          :key="line.label"
        >
          <td>- {{ line.label }}</td>
          <td>{{ money(line.amount) }}</td>
        </tr>
        <tr>
          <th scope="row">{{ t('freelance.net') }}</th>
          <th>
            {{ money(outcome.result.net) }}
            <small class="muted"
              >({{ t('freelance.perMonth', { amount: money(Math.round(outcome.result.net / 12)) }) }})</small
            >
          </th>
        </tr>
      </tbody>
    </table>
    <p class="muted">{{ t('freelance.never') }}</p>
  </div>
</template>
