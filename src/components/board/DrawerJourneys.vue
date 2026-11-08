<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { notifyUndo } from '../../composables/useNotices'
  import { type Application, Journey } from '../../models'
  import { DIRECTIONS, LEG_MODES, type LegMode } from '../../models/Journey'
  import {
    JourneyError,
    deleteJourney,
    describeJourney,
    formatDuration,
    journeysOf,
    reverseJourney,
    saveJourney,
    setPreferred,
    totalMeters,
    totalMinutes,
  } from '../../services/journeys'
  import { deleteWithUndo } from '../../services/undo'

  const props = defineProps<{ application: Application }>()

  const { t, persistence } = useApp()
  const { isEditing } = useDrawerMode()

  const offerId = computed(() => props.application.jobOfferId ?? '')
  // Reading the journeys makes the list follow every change, in this page and in the others.
  const journeys = computed(() => (useRepo(Journey).all(), journeysOf(offerId.value)))

  const modeName = (mode: LegMode) => t(`journeys.modes.${mode}`)
  // The time of a leg, and its distance if the user gave it: "25 min", "1 h02 · 3.2 km".
  const legTime = (leg: { minutes: number; meters: number | null }) =>
    null === leg.meters
      ? formatDuration(leg.minutes)
      : `${formatDuration(leg.minutes)} · ${String(leg.meters / 1000)} km`
  const modeOptions = computed(() => Object.fromEntries(LEG_MODES.map((mode) => [mode, modeName(mode)])))
  const directionOptions = computed(() =>
    Object.fromEntries(DIRECTIONS.map((direction) => [direction, t(`journeys.directions.${direction}`)]))
  )

  interface LegForm {
    mode: string
    line: string
    minutes: string
    km: string
  }
  const editing = ref<string | null | undefined>(undefined)
  const form = reactive({ direction: 'outbound', name: '', legs: [] as LegForm[] })
  const problem = ref('')
  const blankLeg = (): LegForm => ({ mode: 'walk', line: '', minutes: '', km: '' })
  useDirtyGuard(
    () =>
      undefined !== editing.value &&
      (hasText(form.name) || form.legs.some((leg) => hasText(leg.line, leg.minutes, leg.km)))
  )

  function startNew(direction = 'outbound') {
    editing.value = null
    problem.value = ''
    Object.assign(form, { direction, name: '', legs: [blankLeg()] })
  }

  function startEdit(journey: Journey) {
    editing.value = journey.id
    problem.value = ''
    Object.assign(form, {
      direction: journey.direction,
      name: journey.name ?? '',
      legs: journey.legs.map((leg) => ({
        mode: leg.mode,
        line: leg.line,
        minutes: String(leg.minutes),
        km: null === leg.meters ? '' : String(leg.meters / 1000),
      })),
    })
  }

  const number = (text: string): number => Number(text.trim().replace(',', '.'))

  // The legs as the service wants them: a blank time is not a time (the service refuses it), a blank distance is none.
  const legsOf = () =>
    form.legs.map((leg) => ({
      mode: leg.mode,
      line: leg.line,
      minutes: '' === leg.minutes.trim() ? Number.NaN : number(leg.minutes),
      meters: '' === leg.km.trim() ? null : Math.round(number(leg.km) * 1000),
    }))

  // The total of what is typed, shown as it is typed.
  const typedTotal = computed(() => {
    const total = legsOf().reduce((sum, leg) => sum + (Number.isFinite(leg.minutes) ? leg.minutes : 0), 0)
    return formatDuration(total)
  })

  function save() {
    problem.value = ''
    try {
      saveJourney(
        { jobOfferId: offerId.value, direction: form.direction, name: form.name, legs: legsOf() },
        editing.value ?? undefined
      )
    } catch (error) {
      if (error instanceof JourneyError) {
        problem.value = t(`journeys.errors.${error.code}`)
        return
      }
      throw error
    }
    editing.value = undefined
  }

  const move = (index: number, by: number) => {
    const target = index + by
    if (0 <= target && target < form.legs.length) {
      const [leg] = form.legs.splice(index, 1)
      if (leg) {
        form.legs.splice(target, 0, leg)
      }
    }
  }

  async function remove(journey: Journey) {
    const undo = await deleteWithUndo(persistence, () => deleteJourney(journey.id))
    notifyUndo(t('journeys.removed'), t('notice.undo'), async () => {
      await undo()
    })
  }
</script>

<template>
  <section
    v-if="isEditing || 0 < journeys.length"
    id="journeys"
  >
    <h3>{{ t('journeys.title') }}</h3>
    <p
      v-if="isEditing"
      class="muted"
    >
      {{ t('journeys.hint') }}
    </p>

    <ul
      v-if="0 < journeys.length"
      class="journey-list stack"
    >
      <li
        v-for="journey in journeys"
        :key="journey.id"
        class="journey card stack"
        :data-direction="journey.direction"
      >
        <div class="row">
          <strong>
            {{ t(`journeys.directions.${journey.direction}`) }}
            <template v-if="journey.name"> - {{ journey.name }}</template>
          </strong>
          <span class="journey-total">{{ formatDuration(totalMinutes(journey.legs)) }}</span>
          <small
            v-if="null !== totalMeters(journey.legs)"
            class="muted"
            >{{ (totalMeters(journey.legs) ?? 0) / 1000 }} km</small
          >
          <span
            v-if="journey.preferred"
            class="journey-preferred"
            >{{ t('journeys.preferred') }}</span
          >
        </div>
        <ol class="journey-legs">
          <li
            v-for="(leg, index) in journey.legs"
            :key="index"
          >
            <strong>{{ modeName(leg.mode) }}</strong>
            <template v-if="leg.line">{{ ` ${leg.line}` }}</template>
            <span class="muted">{{ ` ${legTime(leg)}` }}</span>
          </li>
        </ol>
        <p class="sr-only">{{ describeJourney(journey, modeName) }}</p>
        <div
          v-if="isEditing"
          class="row"
        >
          <FormButton
            type="button"
            @click="startEdit(journey)"
            >{{ t('journeys.edit') }}</FormButton
          >
          <FormButton
            v-if="!journey.preferred"
            type="button"
            class="journey-prefer"
            @click="setPreferred(journey.id)"
            >{{ t('journeys.prefer') }}</FormButton
          >
          <FormButton
            type="button"
            class="journey-reverse"
            @click="reverseJourney(journey.id)"
            >{{ 'outbound' === journey.direction ? t('journeys.addReturn') : t('journeys.addOutbound') }}</FormButton
          >
          <FormButton
            type="button"
            @click="remove(journey)"
            >{{ t('journeys.delete') }}</FormButton
          >
        </div>
      </li>
    </ul>
    <p
      v-else
      class="muted"
    >
      {{ t('journeys.none') }}
    </p>

    <FormButton
      v-if="isEditing"
      id="new-journey"
      type="button"
      @click="startNew()"
      >{{ t('journeys.new') }}</FormButton
    >

    <form
      v-if="isEditing && undefined !== editing"
      id="journey-form"
      class="card stack"
      @submit.prevent="save"
    >
      <div class="row">
        <FormSelect
          v-model="form.direction"
          name="journeyDirection"
          :label="t('journeys.direction')"
          :options="directionOptions"
        />
        <FormInput
          v-model="form.name"
          name="journeyName"
          :label="t('journeys.name')"
          :placeholder="t('journeys.nameHint')"
        />
      </div>
      <div
        v-for="(leg, index) in form.legs"
        :key="index"
        class="journey-leg row"
      >
        <FormSelect
          v-model="leg.mode"
          :name="`legMode${index}`"
          :label="t('journeys.mode')"
          :options="modeOptions"
        />
        <FormInput
          v-model="leg.line"
          :name="`legLine${index}`"
          :label="t('journeys.line')"
          :placeholder="t('journeys.lineHint')"
        />
        <FormInput
          v-model="leg.minutes"
          :name="`legMinutes${index}`"
          :label="t('journeys.minutes')"
        />
        <FormInput
          v-model="leg.km"
          :name="`legKm${index}`"
          :label="t('journeys.km')"
        />
        <button
          type="button"
          class="leg-up"
          :aria-label="t('journeys.up')"
          :disabled="0 === index"
          @click="move(index, -1)"
        >
          &uarr;
        </button>
        <button
          type="button"
          class="leg-down"
          :aria-label="t('journeys.down')"
          :disabled="index === form.legs.length - 1"
          @click="move(index, 1)"
        >
          &darr;
        </button>
        <button
          type="button"
          class="leg-remove"
          :aria-label="t('journeys.removeLeg')"
          :disabled="1 === form.legs.length"
          @click="form.legs.splice(index, 1)"
        >
          &times;
        </button>
      </div>
      <FormButton
        type="button"
        @click="form.legs.push(blankLeg())"
        >{{ t('journeys.addLeg') }}</FormButton
      >
      <p>
        <strong id="journey-typed-total">{{ t('journeys.total', { time: typedTotal }) }}</strong>
      </p>
      <p
        v-if="problem"
        class="error"
        role="alert"
      >
        {{ problem }}
      </p>
      <div class="row">
        <FormButton type="submit">{{ t('journeys.save') }}</FormButton>
        <FormButton
          type="button"
          @click="editing = undefined"
          >{{ t('options.cancel') }}</FormButton
        >
      </div>
    </form>
  </section>
</template>
