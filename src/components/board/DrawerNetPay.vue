<script setup lang="ts">
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { salaryOf, useFormat } from '../../composables/useFormat'
  import { type Application, PayProfile } from '../../models'
  import { estimateNet } from '../../services/netEstimate'
  import { formatMoney } from '../../utils/money'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const format = useFormat()

  const detail = ref(false)

  const profile = computed(() => {
    useRepo(PayProfile).all()
    return '' === settings.payProfileId ? null : useRepo(PayProfile).find(settings.payProfileId)
  })

  const estimate = computed(() => {
    const offer = props.application.jobOffer
    return offer
      ? estimateNet(salaryOf(offer), profile.value, {
          workingDaysPerYear: settings.workingDaysPerYear,
          hoursPerDay: settings.hoursPerDay,
        })
      : 'no-salary'
  })

  const money = (minor: number, currency: string) =>
    formatMoney(minor, currency, format.locale.value, settings.currencyDisplay)

  // "about 2,448 / month", or a range when the offer gives one.
  const perMonth = computed(() => {
    const result = estimate.value
    if ('string' === typeof result) {
      return ''
    }
    const low = Math.round(result.low.net / 12)
    const high = Math.round(result.high.net / 12)
    return low === high
      ? money(low, result.currency)
      : `${money(low, result.currency)} - ${money(high, result.currency)}`
  })
  const perYear = computed(() => {
    const result = estimate.value
    if ('string' === typeof result) {
      return ''
    }
    return result.low.net === result.high.net
      ? money(result.low.net, result.currency)
      : `${money(result.low.net, result.currency)} - ${money(result.high.net, result.currency)}`
  })
</script>

<template>
  <section
    v-if="'no-salary' !== estimate && 'no-profile' !== estimate"
    id="net-estimate"
  >
    <h3>{{ t('netPay.title') }}</h3>
    <p
      v-if="'string' === typeof estimate"
      class="muted"
    >
      {{ t(`netPay.no.${estimate}`) }}
    </p>
    <template v-else>
      <p>
        <strong>{{ t('netPay.perMonth', { amount: perMonth }) }}</strong>
        <span class="muted"> · {{ t('netPay.perYear', { amount: perYear }) }}</span>
      </p>
      <p class="muted">
        {{ t('netPay.by', { profile: estimate.profile }) }}
        <template v-if="estimate.assumedGross"> {{ t('netPay.assumedGross') }}</template>
        {{ t('netPay.never') }}
      </p>
      <button
        type="button"
        class="link-button"
        :aria-expanded="detail"
        @click="detail = !detail"
      >
        {{ detail ? t('netPay.hide') : t('netPay.show') }}
      </button>
      <table
        v-if="detail"
        class="net-detail"
      >
        <tbody>
          <tr>
            <td>{{ t('netPay.gross') }}</td>
            <td>{{ money(estimate.high.gross, estimate.currency) }}</td>
          </tr>
          <tr
            v-for="line in estimate.high.lines"
            :key="line.label"
          >
            <td>- {{ line.label }}</td>
            <td>{{ money(line.amount, estimate.currency) }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t('netPay.net') }}</th>
            <th>{{ money(estimate.high.net, estimate.currency) }}</th>
          </tr>
        </tbody>
      </table>
      <p
        v-if="detail && estimate.low.gross !== estimate.high.gross"
        class="muted"
      >
        {{ t('netPay.detailOfHigh') }}
      </p>
    </template>
  </section>
</template>
