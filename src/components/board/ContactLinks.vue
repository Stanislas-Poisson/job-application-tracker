<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import { Application, ApplicationContact, Company, type Contact, ContactCompany } from '../../models'
  import { unlinkContact } from '../../services/applications'
  import {
    ContactLinkError,
    addCompanyLink,
    applicationsOfContact,
    companiesOf,
    endCompanyLink,
    linkContact,
    removeCompanyLink,
  } from '../../services/contactLinks'
  import { todayIn } from '../../utils/time'

  const props = defineProps<{ contact: Contact; applicationId: string }>()

  const { t } = useApp()
  const { isEditing } = useDrawerMode()
  const format = useFormat()

  // Reading the links makes the lists follow every change, in this page and in the others.
  const companies = computed(() => (useRepo(ContactCompany).all(), companiesOf(props.contact.id)))
  const applications = computed(() => (useRepo(ApplicationContact).all(), applicationsOfContact(props.contact.id)))
  const known = computed(() => useRepo(Company).orderBy('name').get())

  // The applications this person could be linked to as well.
  const others = computed(() => {
    const linked = new Set(applications.value.map((application) => application.id))
    return useRepo(Application)
      .with('jobOffer', (query) => query.with('company'))
      .get()
      .filter((application) => !linked.has(application.id))
  })
  const otherOptions = computed(() => ({
    '': t('contactLinks.choose'),
    ...Object.fromEntries(others.value.map((application) => [application.id, label(application)])),
  }))

  const label = (application: Application) =>
    [application.jobOffer?.title, application.jobOffer?.company?.name].filter(Boolean).join(' - ')

  const form = reactive({ company: '', title: '', startedOn: '', endedOn: '' })
  useDirtyGuard(() => hasText(form.company, form.title))
  const problem = ref('')
  const target = ref('')

  function fail(error: unknown) {
    if (error instanceof ContactLinkError) {
      problem.value = t(`contactLinks.errors.${error.code}`)
      return
    }
    throw error
  }

  function addCompany() {
    problem.value = ''
    try {
      addCompanyLink(props.contact.id, form.company, form)
    } catch (error) {
      fail(error)
      return
    }
    Object.assign(form, { company: '', title: '', startedOn: '', endedOn: '' })
  }

  function leave(linkId: string) {
    problem.value = ''
    try {
      endCompanyLink(linkId, todayIn(format.timeZone.value))
    } catch (error) {
      fail(error)
    }
  }

  function linkToApplication() {
    problem.value = ''
    if ('' === target.value) {
      return
    }
    try {
      linkContact(target.value, props.contact.id)
    } catch (error) {
      fail(error)
      return
    }
    target.value = ''
  }

  const period = (link: ContactCompany): string => {
    const from = link.startedOn ? format.date(link.startedOn) : ''
    const to = link.endedOn ? format.date(link.endedOn) : ''
    if (from && to) {
      return `${from} - ${to}`
    }
    return from ? t('contactLinks.since', { date: from }) : to ? t('contactLinks.until', { date: to }) : ''
  }
</script>

<template>
  <div
    v-if="isEditing || 0 < companies.length || 1 < applications.length"
    class="contact-links stack"
  >
    <h4 v-if="isEditing || 0 < companies.length">{{ t('contactLinks.companies') }}</h4>
    <ul
      v-if="0 < companies.length"
      class="contact-companies"
    >
      <li
        v-for="link in companies"
        :key="link.id"
        class="row"
      >
        <span>
          <strong>{{ link.company?.name }}</strong>
          <small
            v-if="link.title"
            class="muted"
          >
            ({{ link.title }})</small
          >
          <small
            v-if="period(link)"
            class="muted"
          >
            · {{ period(link) }}</small
          >
        </span>
        <FormButton
          v-if="isEditing && null === link.endedOn"
          type="button"
          @click="leave(link.id)"
          >{{ t('contactLinks.left') }}</FormButton
        >
        <button
          v-if="isEditing"
          type="button"
          class="tag-remove"
          :aria-label="t('contactLinks.removeCompany', { name: link.company?.name ?? '' })"
          @click="removeCompanyLink(link.id)"
        >
          &times;
        </button>
      </li>
    </ul>
    <form
      v-if="isEditing"
      class="stack contact-company-form"
      @submit.prevent="addCompany"
    >
      <div class="row">
        <FormInput
          v-model="form.company"
          name="linkCompany"
          list="contact-company-names"
          :placeholder="t('contactLinks.company')"
        />
        <FormInput
          v-model="form.title"
          name="linkTitle"
          :placeholder="t('contactLinks.title')"
        />
      </div>
      <div class="row">
        <FormInput
          v-model="form.startedOn"
          name="linkStartedOn"
          type="date"
          :label="t('contactLinks.from')"
        />
        <FormInput
          v-model="form.endedOn"
          name="linkEndedOn"
          type="date"
          :label="t('contactLinks.to')"
        />
      </div>
      <datalist id="contact-company-names">
        <option
          v-for="candidate in known"
          :key="candidate.id"
          :value="candidate.name"
        />
      </datalist>
      <FormButton type="submit">{{ t('contactLinks.addCompany') }}</FormButton>
    </form>

    <h4 v-if="isEditing || 1 < applications.length">{{ t('contactLinks.applications') }}</h4>
    <ul
      v-if="isEditing || 1 < applications.length"
      class="contact-applications"
    >
      <li
        v-for="application in applications"
        :key="application.id"
        class="row"
      >
        <span>{{ label(application) }}</span>
        <button
          v-if="isEditing && application.id !== applicationId"
          type="button"
          class="tag-remove"
          :aria-label="t('contactLinks.unlinkApplication', { name: label(application) })"
          @click="unlinkContact(application.id, contact.id)"
        >
          &times;
        </button>
      </li>
    </ul>
    <div
      v-if="isEditing && 0 < others.length"
      class="row"
    >
      <FormSelect
        v-model="target"
        name="linkApplication"
        :label="t('contactLinks.linkTo')"
        :options="otherOptions"
      />
      <FormButton
        type="button"
        @click="linkToApplication"
        >{{ t('contactLinks.link') }}</FormButton
      >
    </div>
    <p
      v-if="problem"
      class="error"
      role="alert"
    >
      {{ problem }}
    </p>
  </div>
</template>
