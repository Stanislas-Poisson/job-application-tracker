<script setup lang="ts">
  import { FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed } from 'vue'
  import { useApp } from '../composables/useApp'
  import { Company, Status } from '../models'
  import type { OfferForm } from '../services/applications'
  import EntityPicker from './EntityPicker.vue'

  // The fields of an offer that is saved by hand: the popup (which reads the page and fills some) and the board (which fills
  // none). The company is picked among the ones that exist, or typed: a new one is made when the offer is saved.
  const form = defineModel<OfferForm>({ required: true })

  const { t, statusName } = useApp()
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
        .map((status) => [status.key, statusName(status)])
    )
  )
</script>

<template>
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
    required
  />
  <FormInput
    v-model="form.url"
    name="url"
    type="url"
    :label="t('fields.url')"
  />
  <FormInput
    v-model="form.location"
    name="location"
    :label="t('fields.location')"
  />
  <slot name="after-place" />
  <FormSelect
    v-model="form.statusKey"
    name="status"
    :label="t('fields.status')"
    :options="statusOptions"
  />
  <FormTextarea
    v-model="form.note"
    name="note"
    :label="t('fields.note')"
    :rows="3"
  />
</template>
