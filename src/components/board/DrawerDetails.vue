<script setup lang="ts">
  import { FormButton, FormInput, FormSelect, FormTextarea } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { type Application, JobOffer, Status } from '../../models'
  import { deleteApplication, findOrCreateCompany, moveApplication, setArchived } from '../../services/applications'

  const props = defineProps<{ application: Application }>()
  const emit = defineEmits<{ deleted: [] }>()

  const { t } = useApp()

  const offer = computed(() => props.application.jobOffer)
  const form = reactive({ title: '', company: '', url: '', location: '', contractType: '', description: '' })

  // The form starts again from the stored values when another application is opened.
  watch(
    () => props.application.id,
    () => {
      Object.assign(form, {
        title: offer.value?.title ?? '',
        company: offer.value?.company?.name ?? '',
        url: offer.value?.url ?? '',
        location: offer.value?.location ?? '',
        contractType: offer.value?.contractType ?? '',
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

  function save() {
    if (!offer.value) {
      return
    }
    useRepo(JobOffer)
      .where('id', offer.value.id)
      .update({
        title: form.title.trim(),
        companyId: '' === form.company.trim() ? null : findOrCreateCompany(form.company).id,
        url: form.url || null,
        location: form.location || null,
        contractType: form.contractType || null,
        description: form.description || null,
      })
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
        @update:model-value="moveApplication(application.id, String($event))"
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
      <FormInput
        v-model="form.contractType"
        name="contractType"
        :label="t('fields.contractType')"
      />
      <FormTextarea
        v-model="form.description"
        name="description"
        :label="t('fields.description')"
        :rows="5"
      />
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
