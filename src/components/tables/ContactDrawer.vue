<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { OverlayDrawer } from '@zairakai/vue-components/Overlay'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { useFormat } from '../../composables/useFormat'
  import { notifyUndo } from '../../composables/useNotices'
  import { Company, Contact } from '../../models'
  import { ContactError } from '../../services/contacts'
  import { createContact, deleteContact, updateContact } from '../../services/people'
  import { toggleFavorite } from '../../services/tags'
  import { deleteWithUndo } from '../../services/undo'
  import { countryName, listCountries, resolveCountry } from '../../utils/contact'
  import { listTimeZones } from '../../utils/time'
  import ContactLinks from '../board/ContactLinks.vue'
  import ContactMethods from '../board/ContactMethods.vue'
  import EntityPicker from '../EntityPicker.vue'

  // A person on its own: what it says of itself is edited here, once, and follows everywhere (the applications, the exchanges and
  // the companies point at the person). Its ways to reach it, its companies and its applications are edited as in the drawer of an
  // application. A contact is made here too, with no application, and linked to one afterwards. "new" as the id makes one.
  const props = defineProps<{ contactId: string | null }>()
  const emit = defineEmits<{ close: []; created: [id: string] }>()

  const { t, persistence, settings } = useApp()
  const format = useFormat()

  const creating = computed(() => 'new' === props.contactId)
  const contact = computed(() =>
    props.contactId && !creating.value ? useRepo(Contact).with('methods').with('company').find(props.contactId) : null
  )

  const blank = () => ({
    firstName: '',
    lastName: '',
    role: '',
    country: '',
    timeZone: '',
    languages: '',
    company: '',
    email: '',
    phone: '',
    linkedin: '',
  })
  const form = reactive(blank())
  const problem = ref('')

  const fromContact = (value: Contact | null) =>
    value
      ? {
          ...blank(),
          firstName: value.firstName,
          lastName: value.lastName,
          role: value.role ?? '',
          country: value.country ?? '',
          timeZone: value.timeZone ?? '',
          languages: (value.languages ?? []).join(', '),
        }
      : blank()
  // The form starts again from what is stored when another contact is opened.
  watch(
    () => props.contactId,
    () => {
      Object.assign(form, fromContact(contact.value))
      problem.value = ''
    },
    { immediate: true }
  )
  const dirty = computed(() => {
    if (!contact.value) {
      return false
    }
    const stored = fromContact(contact.value)
    return (['firstName', 'lastName', 'role', 'country', 'timeZone', 'languages'] as const).some(
      (key) => form[key] !== stored[key]
    )
  })

  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })
  const zoneOptions = computed(() => ({
    '': t('drawer.notSet'),
    ...Object.fromEntries(listTimeZones().map((zone) => [zone, zone.replace(/_/g, ' ')])),
  }))
  const companyNames = computed(() =>
    useRepo(Company)
      .all()
      .map((company) => company.name)
  )
  const languageList = () => form.languages.split(/[,;\s]+/).filter(Boolean)

  // What is wrong is said under the form, in words.
  function attempt(action: () => void): boolean {
    problem.value = ''
    try {
      action()
      return true
    } catch (error) {
      if (error instanceof ContactError) {
        problem.value = t(`drawer.contactErrors.${error.code}`)
        return false
      }
      throw error
    }
  }

  function save() {
    if (creating.value) {
      let id = ''
      if (
        attempt(() => {
          id = createContact(
            { ...form, languages: languageList() },
            { defaultCountry: resolveCountry(settings.defaultCountry, navigator.language) }
          ).id
        })
      ) {
        emit('created', id)
      }
      return
    }
    if (
      contact.value &&
      attempt(() => updateContact(contact.value?.id ?? '', { ...form, languages: languageList() }))
    ) {
      Object.assign(form, fromContact(useRepo(Contact).find(contact.value.id)))
    }
  }

  async function remove() {
    const current = contact.value
    if (!current) {
      return
    }
    const name = `${current.firstName} ${current.lastName}`.trim()
    const undo = await deleteWithUndo(persistence, () => deleteContact(current.id))
    emit('close')
    notifyUndo(t('notice.removed', { name }), t('notice.undo'), async () => {
      await undo()
    })
  }
</script>

<template>
  <OverlayDrawer
    :model-value="null !== contactId"
    :title="creating ? t('contactPage.newTitle') : `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim()"
    :close-label="t('drawer.close')"
    @update:model-value="!$event && emit('close')"
  >
    <div
      v-if="creating || contact"
      class="stack drawer-content contact-drawer"
    >
      <section>
        <h3>{{ t('drawer.details') }}</h3>
        <form
          class="stack"
          @submit.prevent="save"
        >
          <FormInput
            v-model="form.firstName"
            name="firstName"
            :label="t('fields.firstName')"
          />
          <FormInput
            v-model="form.lastName"
            name="lastName"
            :label="t('fields.lastName')"
          />
          <FormInput
            v-model="form.role"
            name="role"
            :label="t('fields.role')"
          />
          <EntityPicker
            v-if="creating"
            v-model="form.company"
            name="company"
            :options="companyNames"
            :label="t('fields.company')"
          />
          <template v-if="creating">
            <FormInput
              v-model="form.email"
              name="email"
              type="email"
              :label="t('fields.email')"
            />
            <FormInput
              v-model="form.phone"
              name="phone"
              type="tel"
              :label="t('fields.phone')"
            />
            <FormInput
              v-model="form.linkedin"
              name="linkedin"
              :label="t('fields.linkedin')"
            />
          </template>
          <FormSelect
            v-model="form.country"
            name="country"
            :label="t('fields.country')"
            :options="countryOptions"
          />
          <FormSelect
            v-model="form.timeZone"
            name="timeZone"
            :label="t('fields.timeZone')"
            :options="zoneOptions"
          />
          <FormInput
            v-model="form.languages"
            name="languages"
            :label="t('fields.languages')"
          />
          <p
            v-if="problem"
            class="error"
            role="alert"
          >
            {{ problem }}
          </p>
          <div class="row">
            <FormButton
              type="submit"
              name="save"
              :disabled="!creating && !dirty"
              >{{ creating ? t('contactPage.create') : t('drawer.save') }}</FormButton
            >
            <span
              v-if="dirty"
              class="muted"
              role="status"
              >{{ t('dirty.unsaved') }}</span
            >
          </div>
        </form>
      </section>

      <template v-if="contact">
        <section>
          <h3>{{ t('labels.favorite') }}</h3>
          <button
            type="button"
            class="favorite"
            name="favorite"
            :aria-pressed="contact.isFavorite"
            @click="toggleFavorite('contacts', contact.id)"
          >
            <span aria-hidden="true">{{ contact.isFavorite ? '★' : '☆' }}</span>
            {{ t('labels.favorite') }}
          </button>
        </section>

        <section>
          <h3>{{ t('contactPage.reach') }}</h3>
          <ContactMethods :contact="contact" />
        </section>

        <section>
          <ContactLinks
            :contact="contact"
            application-id=""
          />
        </section>

        <section>
          <h3>{{ t('contactPage.delete') }}</h3>
          <FormButton
            type="button"
            name="deleteContact"
            @click="remove"
            >{{ t('contactPage.delete') }}</FormButton
          >
        </section>
      </template>
    </div>
  </OverlayDrawer>
</template>
