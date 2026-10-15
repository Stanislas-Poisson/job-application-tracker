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

  const { t, sourceName, settings } = useApp()
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
    :data-application="application.id"
    draggable="true"
    @dragstart="onDragStart"
    @click="emit('open')"
  >
    <h3>
      <span
        v-if="application.isFavorite"
        class="card-star"
        role="img"
        :aria-label="t('labels.favorite')"
        :title="t('labels.favorite')"
        >&#9733;</span
      >
      <!-- The one control of the card for the keyboard and for a screen reader: the card as a whole opens with a click. -->
      <button
        type="button"
        class="card-open"
        @click.stop="emit('open')"
      >
        {{ strLimit(offer?.title ?? '', 70) }}
      </button>
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
        <ItemSymbol
          v-if="settings.showTagSymbols"
          :symbol="tag.symbol"
        />
        <span dir="auto">{{ tag.name }}</span>
      </li>
    </ul>
    <div class="row">
      <DisplayBadge
        v-if="offer?.source"
        size="small"
        >{{ sourceName(offer.source) }}</DisplayBadge
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

  // A long word (a name, a title in German) breaks where it must, and does not go out of the card.
  .application-card {
    min-inline-size: 0;
    padding: 0.7rem 0.8rem;
    overflow-wrap: anywhere;
    background: var(--surface);
    border: 1px solid var(--zk-border);
    border-radius: var(--zk-radius);
    cursor: grab;

    &:hover,
    &:focus-within {
      border-color: var(--primary);
    }

    .card-open {
      padding: 0;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
      background: none;
      border: 0;
      border-radius: 0;
      transition: none;

      &:hover:not(:disabled) {
        color: inherit;
      }

      &:focus-visible {
        outline: 2px solid var(--zk-focus);
        outline-offset: 2px;
      }
    }

    h3 {
      margin: 0 0 0.2rem;
      font-size: 0.88rem;
    }

    // The badges go to the next line rather than squeeze one another.
    .row {
      flex-wrap: wrap;
    }

    p {
      margin: 0 0 0.4rem;
      font-size: 0.8rem;
    }
  }
</style>
