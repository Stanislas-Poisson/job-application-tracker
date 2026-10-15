<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import { type Application, Tag } from '../../models'
  import { PRIORITIES, TagError, setPriority, tagEntityByName, toggleFavorite, untagEntity } from '../../services/tags'
  import { collatorFor } from '../../utils/text'
  import ItemSymbol from '../ItemSymbol.vue'

  const props = defineProps<{ application: Application }>()

  const { t } = useApp()
  const { isEditing } = useDrawerMode()
  const format = useFormat()

  const name = ref('')
  useDirtyGuard(() => hasText(name.value))
  const problem = ref('')

  const known = computed(() => useRepo(Tag).orderBy('name').get())
  const tags = computed(() =>
    [...(props.application.tags ?? [])].sort((a, b) => collatorFor(format.locale.value).compare(a.name, b.name))
  )
  const priorityOptions = computed(() =>
    Object.fromEntries(PRIORITIES.map((level) => [String(level), t(`labels.priorities.${level}`)]))
  )

  function add() {
    problem.value = ''
    try {
      tagEntityByName('applications', props.application.id, name.value)
    } catch (error) {
      if (error instanceof TagError) {
        problem.value = t(`labels.errors.${error.code}`)
        return
      }
      throw error
    }
    name.value = ''
  }
</script>

<template>
  <section>
    <h3>{{ t('labels.title') }}</h3>
    <div class="stack">
      <div class="row">
        <button
          type="button"
          class="favorite"
          name="favorite"
          :aria-pressed="application.isFavorite"
          @click="toggleFavorite('applications', application.id)"
        >
          <span aria-hidden="true">{{ application.isFavorite ? '★' : '☆' }}</span>
          {{ t('labels.favorite') }}
        </button>
        <FormSelect
          :model-value="String(application.priority)"
          name="priority"
          :label="t('labels.priority')"
          :options="priorityOptions"
          @update:model-value="setPriority(application.id, Number($event))"
        />
      </div>

      <ul class="tag-list">
        <li
          v-for="tag in tags"
          :key="tag.id"
          class="tag-chip"
          :style="{ '--tag': tag.color }"
        >
          <ItemSymbol :symbol="tag.symbol" />
          <span dir="auto">{{ tag.name }}</span>
          <button
            v-if="isEditing"
            type="button"
            class="tag-remove"
            :aria-label="t('labels.remove', { name: tag.name })"
            @click="untagEntity('applications', application.id, tag.id)"
          >
            &times;
          </button>
        </li>
      </ul>

      <form
        v-if="isEditing"
        class="row"
        @submit.prevent="add"
      >
        <FormInput
          v-model="name"
          name="tagName"
          list="known-tags"
          :placeholder="t('labels.add')"
        />
        <datalist id="known-tags">
          <option
            v-for="tag in known"
            :key="tag.id"
            :value="tag.name"
          />
        </datalist>
        <FormButton type="submit">{{ t('labels.addButton') }}</FormButton>
      </form>
      <p
        v-if="problem"
        class="error"
        role="alert"
      >
        {{ problem }}
      </p>
    </div>
  </section>
</template>

<style lang="scss">
  .favorite[aria-pressed='true'] {
    color: var(--primary);
    border-color: var(--primary);
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tag-chip {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    padding: 0.15rem 0.5rem;
    font-size: 0.8rem;
    background: color-mix(in srgb, var(--tag) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--tag) 50%, var(--zk-border));
    border-inline-start: 4px solid var(--tag);
    border-radius: 999px;
  }

  .tag-remove {
    padding: 0 0.25rem;
    line-height: 1;
    background: transparent;
    border: 0;
  }
</style>
