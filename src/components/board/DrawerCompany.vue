<script setup lang="ts">
  import { FormButton, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { type Application, Company, CompanyRelation } from '../../models'
  import { RELATION_VIEWS, RelationError, addLink, linksOf, removeRelation } from '../../services/companyRelations'
  import EntityPicker from '../EntityPicker.vue'

  // The company of an application, or a company on its own (the drawer of a company).
  const props = defineProps<{ application?: Application; company?: Company | null }>()

  const { t } = useApp()
  const { isEditing } = useDrawerMode()

  const company = computed(() => props.company ?? props.application?.jobOffer?.company ?? null)
  // Reading the relations makes the list follow every change, in this page and in the others.
  const links = computed(() => (useRepo(CompanyRelation).all(), company.value ? linksOf(company.value.id) : []))
  const known = computed(() => useRepo(Company).orderBy('name').get())

  const view = ref<string>('recruits_for')
  const other = ref('')
  const problem = ref('')
  useDirtyGuard(() => hasText(other.value))

  const viewOptions = computed(() =>
    Object.fromEntries(RELATION_VIEWS.map((candidate) => [candidate, t(`company.views.${candidate}`)]))
  )

  function add() {
    problem.value = ''
    if (!company.value) {
      return
    }
    try {
      addLink(company.value.id, view.value, other.value)
    } catch (error) {
      if (error instanceof RelationError) {
        problem.value = t(`company.errors.${error.code}`)
        return
      }
      throw error
    }
    other.value = ''
  }
</script>

<template>
  <section v-if="company && (isEditing || 0 < links.length)">
    <h3>{{ t('company.title', { name: company.name }) }}</h3>
    <ul
      v-if="0 < links.length"
      id="company-links"
    >
      <li
        v-for="link in links"
        :key="link.relationId"
        class="row"
      >
        <span>
          {{ t(`company.links.${link.view}`) }}
          <strong>{{ link.other.name }}</strong>
        </span>
        <button
          v-if="isEditing"
          type="button"
          class="tag-remove"
          :aria-label="t('company.remove', { name: link.other.name })"
          @click="removeRelation(link.relationId)"
        >
          &times;
        </button>
      </li>
    </ul>
    <p
      v-else-if="isEditing"
      class="muted"
    >
      {{ t('company.none') }}
    </p>

    <form
      v-if="isEditing"
      class="stack"
      @submit.prevent="add"
    >
      <p class="muted">{{ t('company.hint') }}</p>
      <div class="row">
        <FormSelect
          v-model="view"
          name="relationView"
          :label="t('company.kind')"
          :options="viewOptions"
        />
        <EntityPicker
          v-model="other"
          name="relationCompany"
          :options="known.map((candidate) => candidate.name)"
          :label="t('company.other')"
        />
      </div>
      <p
        v-if="problem"
        class="error"
        role="alert"
      >
        {{ problem }}
      </p>
      <FormButton type="submit">{{ t('company.add') }}</FormButton>
    </form>
  </section>
</template>
