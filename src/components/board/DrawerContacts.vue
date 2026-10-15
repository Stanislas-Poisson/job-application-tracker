<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { computed, reactive, ref } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { hasText, useDirtyGuard } from '../../composables/useDirty'
  import { useDrawerMode } from '../../composables/useDrawerMode'
  import { useFormat } from '../../composables/useFormat'
  import type { Application } from '../../models'
  import { addContact, unlinkContact } from '../../services/applications'
  import { ContactError } from '../../services/contacts'
  import { toggleFavorite } from '../../services/tags'
  import { countryName, languageName, listCountries, resolveCountry } from '../../utils/contact'
  import { formatTimeIn, listTimeZones } from '../../utils/time'
  import ContactLinks from './ContactLinks.vue'
  import ContactMethods from './ContactMethods.vue'

  const props = defineProps<{ application: Application }>()

  const { t, settings } = useApp()
  const { isEditing } = useDrawerMode()
  const format = useFormat()

  const empty = () => ({
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    phone: '',
    linkedin: '',
    country: '',
    timeZone: '',
    languages: '',
  })
  const form = reactive(empty())
  useDirtyGuard(() => hasText(form.firstName, form.lastName, form.role, form.email, form.phone, form.linkedin))
  const problem = ref('')

  // The countries by their name in the language of the page, in the order of that language.
  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })
  const zoneOptions = computed(() => ({
    '': t('drawer.notSet'),
    ...Object.fromEntries(listTimeZones().map((zone) => [zone, zone.replace(/_/g, ' ')])),
  }))

  function add() {
    problem.value = ''
    try {
      addContact(
        props.application.id,
        {
          ...form,
          languages: form.languages.split(/[,;\s]+/).filter(Boolean),
        },
        'other',
        { defaultCountry: resolveCountry(settings.defaultCountry, navigator.language) }
      )
    } catch (error) {
      if (error instanceof ContactError) {
        problem.value = t(`drawer.contactErrors.${error.code}`)
        return
      }
      throw error
    }
    Object.assign(form, empty())
  }
</script>

<template>
  <section v-if="isEditing || 0 < application.contacts.length">
    <h3>{{ t('drawer.contacts') }}</h3>
    <form
      v-if="isEditing"
      class="stack"
      @submit.prevent="add"
    >
      <div class="row">
        <FormInput
          v-model="form.firstName"
          name="firstName"
          :placeholder="t('fields.firstName')"
        />
        <FormInput
          v-model="form.lastName"
          name="lastName"
          :placeholder="t('fields.lastName')"
        />
      </div>
      <FormInput
        v-model="form.role"
        name="role"
        :placeholder="t('fields.role')"
      />
      <FormInput
        v-model="form.email"
        name="email"
        type="email"
        :placeholder="t('fields.email')"
      />
      <FormInput
        v-model="form.phone"
        name="phone"
        type="tel"
        :placeholder="t('fields.phone')"
      />
      <FormInput
        v-model="form.linkedin"
        name="linkedin"
        :placeholder="t('fields.linkedin')"
      />
      <FormSelect
        v-model="form.country"
        name="contactCountry"
        :label="t('fields.country')"
        :options="countryOptions"
      />
      <FormSelect
        v-model="form.timeZone"
        name="contactTimeZone"
        :label="t('fields.timeZone')"
        :options="zoneOptions"
      />
      <FormInput
        v-model="form.languages"
        name="languages"
        :placeholder="t('fields.languages')"
      />
      <p
        v-if="problem"
        class="error"
        role="alert"
      >
        {{ problem }}
      </p>
      <FormButton type="submit">{{ t('drawer.addContact') }}</FormButton>
    </form>
    <ul>
      <li
        v-for="contact in application.contacts"
        :key="contact.id"
        class="contact"
      >
        <div class="row">
          <button
            type="button"
            class="favorite favorite-small"
            :aria-pressed="contact.isFavorite"
            :aria-label="t('labels.favorite')"
            @click="toggleFavorite('contacts', contact.id)"
          >
            <span aria-hidden="true">{{ contact.isFavorite ? '\u2605' : '\u2606' }}</span>
          </button>
          <strong>{{ contact.firstName }} {{ contact.lastName }}</strong>
          <small
            v-if="contact.role"
            class="muted"
            >({{ contact.role }})</small
          >
          <FormButton
            v-if="isEditing"
            type="button"
            @click="unlinkContact(application.id, contact.id)"
          >
            {{ t('drawer.unlink') }}
          </FormButton>
        </div>
        <div class="contact-lines muted">
          <span v-if="contact.country">{{ countryName(contact.country, format.locale.value) }}</span>
          <span v-if="contact.timeZone">
            {{ t('drawer.localTime', { time: formatTimeIn(contact.timeZone, format.locale.value) }) }}
          </span>
          <span v-if="contact.languages?.length">
            {{ contact.languages.map((tag) => languageName(tag, format.locale.value)).join(', ') }}
          </span>
        </div>
        <ContactMethods :contact="contact" />
        <ContactLinks
          :contact="contact"
          :application-id="application.id"
        />
      </li>
    </ul>
  </section>
</template>

<style lang="scss">
  .contact-lines {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin-block-start: 0.25rem;
    font-size: 0.82rem;
  }
</style>
