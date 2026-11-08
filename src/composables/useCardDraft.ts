import { useRepo } from 'pinia-orm'
import { type InjectionKey, computed, inject, provide, reactive, ref } from 'vue'
import type { Application } from '../models'
import { JobOffer } from '../models'
import { type AddressParts, emptyAddress, normalizeAddress } from '../services/address'
import { findOrCreateCompany, offerAddressFields } from '../services/applications'
import { SalaryError, salaryFromForm } from '../services/salary'
import { minorToInput } from '../utils/money'
import { useApp } from './useApp'

// What the card lets the user change in one go: the details of the offer and its address. Editing works on a copy of the model
// (the draft); nothing is written until the user saves, and the card is "changed" only while the draft really differs from what
// is stored: it is not any more when everything is put back. The lists around it (notes, contacts, reminders…) are actions that
// write at once, and are not part of the draft.

export interface DetailsDraft {
  title: string
  company: string
  url: string
  location: string
  country: string
  contractType: string
  postedOn: string
  salaryMin: string
  salaryMax: string
  salaryCurrency: string
  salaryPeriod: string
  salaryKind: string
  description: string
}

const emptyDetails = (): DetailsDraft => ({
  title: '',
  company: '',
  url: '',
  location: '',
  country: '',
  contractType: '',
  postedOn: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: '',
  salaryPeriod: '',
  salaryKind: '',
  description: '',
})

type Offer = Application['jobOffer']

// The values of the offer as the form shows them.
const detailsOf = (offer: Offer): DetailsDraft => ({
  title: offer?.title ?? '',
  company: offer?.company?.name ?? '',
  url: offer?.url ?? '',
  location: offer?.location ?? '',
  country: offer?.country ?? '',
  contractType: offer?.contractType ?? '',
  postedOn: offer?.postedOn ?? '',
  salaryMin: minorToInput(offer?.salaryMin ?? null, offer?.salaryCurrency ?? null),
  salaryMax: minorToInput(offer?.salaryMax ?? null, offer?.salaryCurrency ?? null),
  salaryCurrency: offer?.salaryCurrency ?? '',
  salaryPeriod: offer?.salaryPeriod ?? '',
  salaryKind: offer?.salaryKind ?? '',
  description: offer?.description ?? '',
})

const addressOf = (offer: Offer): AddressParts =>
  normalizeAddress({
    line1: offer?.addressLine1,
    line2: offer?.addressLine2,
    line3: offer?.addressLine3,
    postalCode: offer?.postalCode,
    city: offer?.city,
    region: offer?.region,
    country: offer?.country,
    latitude: offer?.latitude,
    longitude: offer?.longitude,
  })

// Two drafts of the details are the same when their texts are (a number field can hold a number, hence the texts).
const sameDetails = (a: DetailsDraft, b: DetailsDraft): boolean =>
  (Object.keys(a) as (keyof DetailsDraft)[]).every((key) => String(a[key] ?? '') === String(b[key] ?? ''))

const sameAddress = (a: AddressParts, b: AddressParts): boolean =>
  JSON.stringify(normalizeAddress(a)) === JSON.stringify(normalizeAddress(b))

// `t` says what is wrong with the salary; the page gives its own, so that the draft can be made with no page around it.
export function createCardDraft(application: () => Application | null | undefined, t: (path: string) => string) {
  const draft = reactive({ details: emptyDetails(), address: emptyAddress() })
  // What is wrong with the draft, shown under the form (the salary).
  const problem = ref('')
  // The draft is only followed while the card is edited: while it is read, what is stored changes and nobody has a draft.
  const active = ref(false)

  const offer = computed(() => application()?.jobOffer ?? null)
  const stored = computed(() => ({ details: detailsOf(offer.value), address: addressOf(offer.value) }))

  // True as soon as one value differs from what is stored, and false again when they are all put back.
  const isDirty = computed(
    () =>
      active.value &&
      (!sameDetails(draft.details, stored.value.details) || !sameAddress(draft.address, stored.value.address))
  )

  // The draft is a copy of the model, made when editing starts.
  function begin() {
    Object.assign(draft.details, stored.value.details)
    Object.assign(draft.address, stored.value.address)
    problem.value = ''
    active.value = true
  }

  function end() {
    active.value = false
    problem.value = ''
  }

  // Writes the draft to the offer. False when something is wrong with it (the reason is in `problem`) and nothing was written.
  function save(): boolean {
    const current = offer.value
    if (!current) {
      return false
    }
    problem.value = ''
    const { details } = draft
    let salary
    try {
      salary = salaryFromForm({
        min: details.salaryMin,
        max: details.salaryMax,
        currency: details.salaryCurrency,
        period: details.salaryPeriod,
        kind: details.salaryKind,
      })
    } catch (error) {
      if (error instanceof SalaryError) {
        problem.value = t(`drawer.salaryErrors.${error.code}`)
        return false
      }
      throw error
    }
    const address = normalizeAddress(draft.address)
    // The offer has one country, which both the details and the address can say: the address wins only if it is what changed.
    const country = address.country !== stored.value.address.country ? address.country : details.country
    useRepo(JobOffer)
      .where('id', current.id)
      .update({
        title: details.title.trim(),
        companyId: '' === details.company.trim() ? null : findOrCreateCompany(details.company).id,
        url: details.url || null,
        location: details.location || null,
        contractType: details.contractType || null,
        postedOn: details.postedOn || null,
        ...salary,
        description: details.description || null,
        ...offerAddressFields(address),
        country: '' === country ? null : country,
      })
    return true
  }

  return { draft, stored, problem, isDirty, begin, end, save }
}

export type CardDraft = ReturnType<typeof createCardDraft>

const key: InjectionKey<CardDraft> = Symbol('card-draft')

export const provideCardDraft = (application: () => Application | null | undefined): CardDraft => {
  const { t } = useApp()
  const value = createCardDraft(application, t)
  provide(key, value)
  return value
}

export function useCardDraft(): CardDraft {
  const value = inject(key)
  if (!value) {
    throw new Error('useCardDraft is used inside the drawer of an application')
  }
  return value
}
