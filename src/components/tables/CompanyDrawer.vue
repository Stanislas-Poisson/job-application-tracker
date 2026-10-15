<script setup lang="ts">
  import { FormButton, FormInput, FormSelect } from '@zairakai/vue-components/Form'
  import { OverlayDrawer } from '@zairakai/vue-components/Overlay'
  import { useRepo } from 'pinia-orm'
  import { computed, reactive, ref, watch } from 'vue'
  import { useApp } from '../../composables/useApp'
  import { confirmAction } from '../../composables/useConfirm'
  import { useFormat } from '../../composables/useFormat'
  import { notifySuccess, notifyUndo } from '../../composables/useNotices'
  import { Company, ContactCompany } from '../../models'
  import { formatAddress, normalizeAddress } from '../../services/address'
  import {
    CompanyError,
    type CompanyInput,
    companyInput,
    deleteCompany,
    mergeCompanies,
    offersOf,
    updateCompany,
  } from '../../services/companies'
  import { type TravelMode, placeFrom, placeLink } from '../../services/maps'
  import { deleteWithUndo } from '../../services/undo'
  import { countryName, listCountries } from '../../utils/contact'
  import DrawerCompany from '../board/DrawerCompany.vue'

  // A company on its own: what it says of itself is edited here, once, and follows everywhere (the offers and the people point at
  // the company, not at a text). Its offers, its people and the addresses of its offers are listed; two companies that are the same
  // are merged, and one with no offer is deleted.
  const props = defineProps<{ companyId: string | null }>()
  const emit = defineEmits<{ close: []; openApplication: [id: string] }>()

  const { t, persistence, settings, statusName } = useApp()
  const format = useFormat()

  const company = computed(() => (props.companyId ? useRepo(Company).find(props.companyId) : null))
  const form = reactive<CompanyInput>({ name: '', website: '', city: '', country: '', sector: '' })
  const problem = ref('')
  // The form starts again from what is stored when another company is opened.
  watch(
    () => props.companyId,
    () => {
      Object.assign(
        form,
        company.value ? companyInput(company.value) : { name: '', website: '', city: '', country: '', sector: '' }
      )
      problem.value = ''
      mergeTarget.value = ''
    },
    { immediate: true }
  )
  const stored = computed(() => (company.value ? companyInput(company.value) : null))
  const dirty = computed(
    () =>
      null !== stored.value &&
      (Object.keys(form) as (keyof CompanyInput)[]).some((key) => form[key] !== stored.value?.[key])
  )

  const countryOptions = computed(() => {
    const collator = new Intl.Collator(format.locale.value)
    const names = listCountries().map((code) => [code, countryName(code, format.locale.value)] as const)
    return Object.fromEntries([['', t('drawer.notSet')], ...names.sort((a, b) => collator.compare(a[1], b[1]))])
  })

  // What is wrong is said under the form, in words.
  function attempt(action: () => void): boolean {
    problem.value = ''
    try {
      action()
      return true
    } catch (error) {
      if (error instanceof CompanyError) {
        problem.value = t(`companyPage.errors.${error.code}`)
        return false
      }
      throw error
    }
  }

  function save() {
    if (company.value && attempt(() => updateCompany(company.value?.id ?? '', form))) {
      Object.assign(form, companyInput(useRepo(Company).find(company.value.id) as Company))
    }
  }

  const offers = computed(() => (company.value ? (useRepo(ContactCompany).all(), offersOf(company.value.id)) : []))
  const offerApplications = computed(() => offers.value.flatMap((offer) => offer.applications ?? []))

  const contacts = computed(() =>
    company.value ? useRepo(ContactCompany).with('contact').where('companyId', company.value.id).get() : []
  )

  // The place of each offer: its address in one line (or the place it names), and the link that opens it on the map chosen.
  const places = computed(() =>
    offers.value
      .map((offer) => {
        const address = normalizeAddress({
          line1: offer.addressLine1,
          line2: offer.addressLine2,
          line3: offer.addressLine3,
          postalCode: offer.postalCode,
          city: offer.city,
          region: offer.region,
          country: offer.country,
          latitude: offer.latitude,
          longitude: offer.longitude,
        })
        const line = formatAddress(address, format.locale.value)
        const link = placeLink(placeFrom(address, format.locale.value, offer.location ?? ''), {
          provider: settings.mapProvider,
          customTemplate: settings.mapCustomTemplate,
          mode: settings.travelMode as TravelMode,
        })
        return { id: offer.id, title: offer.title, line: '' === line ? (offer.location ?? '') : line, link }
      })
      .filter((place) => '' !== place.line)
  )

  const mergeTarget = ref('')
  const others = computed(() =>
    Object.fromEntries(
      useRepo(Company)
        .orderBy('name')
        .get()
        .filter((other) => other.id !== props.companyId)
        .map((other) => [other.id, other.name])
    )
  )

  async function merge() {
    const keep = useRepo(Company).find(mergeTarget.value)
    const drop = company.value
    if (!keep || !drop) {
      return
    }
    const confirmed = await confirmAction({
      message: t('companyPage.mergeAsk', { from: drop.name, into: keep.name }),
      confirmLabel: t('companyPage.mergeButton'),
      danger: true,
    })
    if (confirmed && attempt(() => mergeCompanies(keep.id, drop.id))) {
      await persistence.flush()
      emit('close')
      notifySuccess(t('companyPage.merged', { into: keep.name }))
    }
  }

  async function remove() {
    const current = company.value
    if (!current) {
      return
    }
    const name = current.name
    let undo: (() => Promise<number>) | null = null
    try {
      undo = await deleteWithUndo(persistence, () => deleteCompany(current.id))
    } catch (error) {
      if (error instanceof CompanyError) {
        problem.value = t(`companyPage.errors.${error.code}`)
        return
      }
      throw error
    }
    emit('close')
    notifyUndo(t('notice.removed', { name }), t('notice.undo'), async () => {
      await undo?.()
    })
  }
</script>

<template>
  <OverlayDrawer
    :model-value="null !== companyId"
    :title="company?.name ?? ''"
    :close-label="t('drawer.close')"
    @update:model-value="!$event && emit('close')"
  >
    <div
      v-if="company"
      class="stack drawer-content company-drawer"
    >
      <section>
        <h3>{{ t('drawer.details') }}</h3>
        <form
          class="stack"
          @submit.prevent="save"
        >
          <FormInput
            v-model="form.name"
            name="name"
            :label="t('companyPage.name')"
            required
          />
          <FormInput
            v-model="form.website"
            name="website"
            :label="t('companyPage.website')"
          />
          <FormInput
            v-model="form.city"
            name="city"
            :label="t('address.city')"
          />
          <FormSelect
            v-model="form.country"
            name="country"
            :label="t('fields.country')"
            :options="countryOptions"
          />
          <FormInput
            v-model="form.sector"
            name="sector"
            :label="t('companyPage.sector')"
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
              :disabled="!dirty"
              >{{ t('drawer.save') }}</FormButton
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

      <section>
        <h3>{{ t('companyPage.offers') }}</h3>
        <p
          v-if="0 === offerApplications.length"
          class="muted"
        >
          {{ t('companyPage.noOffers') }}
        </p>
        <ul v-else>
          <li
            v-for="application in offerApplications"
            :key="application.id"
            class="row"
          >
            <span>
              <strong>{{ offers.find((offer) => offer.id === application.jobOfferId)?.title }}</strong>
              <span class="muted">{{ application.status ? ` - ${statusName(application.status)}` : '' }}</span>
            </span>
            <FormButton
              type="button"
              class="open-application"
              @click="emit('openApplication', application.id)"
              >{{ t('companyPage.open') }}</FormButton
            >
          </li>
        </ul>
      </section>

      <section>
        <h3>{{ t('drawer.contacts') }}</h3>
        <p
          v-if="0 === contacts.length"
          class="muted"
        >
          {{ t('company.none') }}
        </p>
        <ul v-else>
          <li
            v-for="link in contacts"
            :key="link.id"
          >
            <strong>{{ link.contact?.firstName }} {{ link.contact?.lastName }}</strong>
            <small
              v-if="link.title"
              class="muted"
            >
              ({{ link.title }})</small
            >
          </li>
        </ul>
      </section>

      <section>
        <h3>{{ t('companyPage.addresses') }}</h3>
        <p
          v-if="0 === places.length"
          class="muted"
        >
          {{ t('companyPage.noAddresses') }}
        </p>
        <ul v-else>
          <li
            v-for="place in places"
            :key="place.id"
          >
            <bdi>{{ place.line }}</bdi>
            <a
              v-if="place.link"
              :href="place.link"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t('place.show') }}</a
            >
          </li>
        </ul>
      </section>

      <DrawerCompany :company="company" />

      <section>
        <h3>{{ t('companyPage.mergeButton') }}</h3>
        <p class="muted">{{ t('companyPage.mergeHint') }}</p>
        <p
          v-if="0 === Object.keys(others).length"
          class="muted"
        >
          {{ t('companyPage.mergeNone') }}
        </p>
        <div
          v-else
          class="row"
        >
          <FormSelect
            v-model="mergeTarget"
            name="mergeInto"
            :label="t('companyPage.mergeInto')"
            :options="{ '': t('drawer.notSet'), ...others }"
          />
          <FormButton
            type="button"
            name="merge"
            :disabled="'' === mergeTarget"
            @click="merge"
            >{{ t('companyPage.mergeButton') }}</FormButton
          >
        </div>
      </section>

      <section>
        <h3>{{ t('companyPage.delete') }}</h3>
        <p
          v-if="0 < offerApplications.length"
          class="muted"
        >
          {{ t('companyPage.deleteBlocked') }}
        </p>
        <FormButton
          type="button"
          name="deleteCompany"
          :disabled="0 < offerApplications.length"
          @click="remove"
          >{{ t('companyPage.delete') }}</FormButton
        >
      </section>
    </div>
  </OverlayDrawer>
</template>
