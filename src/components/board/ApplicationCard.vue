<script setup lang="ts">
  import { isPast } from '@zairakai/js-utils/datetime'
  import { strLimit } from '@zairakai/js-utils/formatters'
  import { DisplayBadge } from '@zairakai/vue-components/Display'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, CompanyRelation, Journey } from '../../models'
  import { finalClientsOf } from '../../services/companyRelations'
  import { formatDuration, preferredJourney, totalMinutes } from '../../services/journeys'
  import ItemSymbol from '../ItemSymbol.vue'

  const props = defineProps<{ application: Application }>()
  const emit = defineEmits<{ open: [] }>()

  const { t } = useApp()
  const format = useFormat()

  const offer = computed(() => props.application.jobOffer)

  // The final client of a recruitment firm: the card tells who the offer is really for.
  const clients = computed(() => {
    useRepo(CompanyRelation).all()
    const company = offer.value?.company
    return company ? finalClientsOf(company.id).map((client) => client.name) : []
  })

  // The way there: the time of the preferred journey, when the user kept one.
  const commute = computed(() => {
    useRepo(Journey).all()
    const journey = offer.value ? preferredJourney(offer.value.id) : null
    return journey ? formatDuration(totalMinutes(journey.legs)) : ''
  })

  // A reminder that is not done and is past its date.
  const overdue = computed(() =>
    (props.application.reminders ?? []).some((reminder) => !reminder.doneAt && isPast(reminder.dueAt))
  )

  function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('text/plain', props.application.id)
  }
</script>

<template>
  <article
    class="application-card"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click="emit('open')"
    @keydown.enter="emit('open')"
  >
    <h3>
      <span
        v-if="application.isFavorite"
        class="card-star"
        :title="t('labels.favorite')"
        >&#9733;</span
      >
      {{ strLimit(offer?.title ?? '', 70) }}
    </h3>
    <p class="muted">
      {{ offer?.company?.name }}<template v-if="0 < clients.length"> → {{ clients.join(', ') }}</template
      ><template v-if="offer?.location"> - {{ offer.location }}</template>
    </p>
    <p
      v-if="commute"
      class="muted commute-line"
      :title="t('cardCommute')"
    >
      {{ commute }}
    </p>
    <p
      v-if="offer && format.salary(offer)"
      class="muted salary-line"
      :title="format.salaryInHome(offer)"
    >
      {{ format.salary(offer) }}
    </p>
    <ul
      v-if="application.tags?.length"
      class="tag-list card-tags"
    >
      <li
        v-for="tag in application.tags"
        :key="tag.id"
        class="tag-chip"
        :style="{ '--tag': tag.color }"
      >
        <ItemSymbol :symbol="tag.symbol" />
        <span dir="auto">{{ tag.name }}</span>
      </li>
    </ul>
    <div class="row">
      <DisplayBadge
        v-if="offer?.source"
        size="small"
        >{{ offer.source.label }}</DisplayBadge
      >
      <DisplayBadge
        v-if="0 < application.priority"
        size="small"
        :variant="3 === application.priority ? 'warning' : 'default'"
        >{{ t(`labels.priorities.${application.priority}`) }}</DisplayBadge
      >
      <DisplayBadge
        v-if="overdue"
        size="small"
        variant="warning"
        >{{ t('board.overdue') }}</DisplayBadge
      >
    </div>
  </article>
</template>

<style lang="scss">
  .card-star {
    color: var(--primary);
  }

  .card-tags {
    margin-block-end: 0.4rem;
  }

  .application-card {
    padding: 0.7rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--zk-border);
    border-radius: var(--zk-radius);
    cursor: grab;

    &:hover,
    &:focus-visible {
      border-color: var(--primary);
    }

    h3 {
      margin: 0 0 0.2rem;
      font-size: 0.88rem;
    }

    p {
      margin: 0 0 0.4rem;
      font-size: 0.8rem;
    }
  }
</style>
