import type { CountryCode } from 'libphonenumber-js/min'
import type { MethodType } from '../models/ContactMethod'
import {
  normalizeCountry,
  normalizeEmail,
  normalizeLanguage,
  normalizeLinkedIn,
  normalizePhone,
  normalizeWebsite,
} from '../utils/contact'
import { isValidTimeZone } from '../utils/time'

// One way to reach a person, as a form gives it.
export interface MethodInput {
  type: MethodType
  value: string
  label?: string | null
  primary?: boolean
}

// What a form gives about a person: texts, empty when not set. The email, the phone and the LinkedIn page are shortcuts
// for the most common ways: each one becomes a way to reach the person, the main one of its type.
export interface ContactInput {
  firstName: string
  lastName: string
  role?: string | null
  email?: string | null
  phone?: string | null
  linkedin?: string | null
  methods?: MethodInput[]
  country?: string | null
  timeZone?: string | null
  languages?: string[]
}

export interface NormalizedMethod {
  type: MethodType
  value: string
  label: string | null
  isPrimary: boolean
}

export interface ContactFields {
  firstName: string
  lastName: string
  role: string | null
  country: string | null
  timeZone: string | null
  languages: string[]
}

export type ContactErrorCode =
  'name' | 'email' | 'phone' | 'linkedin' | 'website' | 'method' | 'country' | 'timeZone' | 'language'

// A form that cannot become a contact. The code is the key of the message to show.
export class ContactError extends Error {
  constructor(public readonly code: ContactErrorCode) {
    super(code)
  }
}

interface Context {
  // The country a phone number without a country code is read in: the one of the person, else this one.
  defaultCountry?: CountryCode
  country?: CountryCode | null
}

const filled = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim()
  return '' === text ? null : text
}

// A way to reach a person in the canonical form of its type: the phone in E.164, the email in lower case, the LinkedIn page
// and the website as an address. Throws a ContactError when the value is not one.
export function normalizeMethod(input: MethodInput, context: Context = {}): NormalizedMethod {
  const raw = input.value.trim()
  let value: string | null
  let code: ContactErrorCode
  switch (input.type) {
    case 'email':
      value = normalizeEmail(raw)
      code = 'email'
      break
    case 'phone':
      value = normalizePhone(raw, context.country ?? context.defaultCountry)?.e164 ?? null
      code = 'phone'
      break
    case 'linkedin':
      value = normalizeLinkedIn(raw)
      code = 'linkedin'
      break
    case 'website':
      value = normalizeWebsite(raw)
      code = 'website'
      break
    default:
      value = '' === raw ? null : raw
      code = 'method'
  }
  if (null === value) {
    throw new ContactError(code)
  }
  return { type: input.type, value, label: filled(input.label), isPrimary: Boolean(input.primary) }
}

// One main way per type: the first that is marked, or the first of the type when none is.
export function withPrimaries(methods: NormalizedMethod[]): NormalizedMethod[] {
  const main = new Map<MethodType, number>()
  methods.forEach((method, index) => {
    if (method.isPrimary && !main.has(method.type)) {
      main.set(method.type, index)
    }
  })
  methods.forEach((method, index) => {
    if (!main.has(method.type)) {
      main.set(method.type, index)
    }
  })
  return methods.map((method, index) => ({ ...method, isPrimary: main.get(method.type) === index }))
}

// The same value of the same type twice is kept once, with the label and the main mark of the first.
const withoutDuplicates = (methods: NormalizedMethod[]): NormalizedMethod[] =>
  methods.filter(
    (method, index) =>
      index === methods.findIndex((other) => other.type === method.type && other.value === method.value)
  )

export interface NormalizedContact {
  fields: ContactFields
  methods: NormalizedMethod[]
}

// A contact in the forms it is stored in. Throws a ContactError for the first thing that is wrong, and nothing is saved.
export function normalizeContactInput(
  input: ContactInput,
  { defaultCountry }: { defaultCountry?: CountryCode } = {}
): NormalizedContact {
  const firstName = (input.firstName ?? '').trim()
  const lastName = (input.lastName ?? '').trim()
  if ('' === firstName && '' === lastName) {
    throw new ContactError('name')
  }

  const countryText = filled(input.country)
  const country = null === countryText ? null : normalizeCountry(countryText)
  if (null !== countryText && null === country) {
    throw new ContactError('country')
  }

  const timeZone = filled(input.timeZone)
  if (null !== timeZone && !isValidTimeZone(timeZone)) {
    throw new ContactError('timeZone')
  }

  const languages: string[] = []
  for (const tag of input.languages ?? []) {
    if ('' === tag.trim()) {
      continue
    }
    const language = normalizeLanguage(tag)
    if (null === language) {
      throw new ContactError('language')
    }
    if (!languages.includes(language)) {
      languages.push(language)
    }
  }

  const shortcuts: MethodInput[] = []
  for (const [type, value] of [
    ['email', input.email],
    ['phone', input.phone],
    ['linkedin', input.linkedin],
  ] as const) {
    if (null !== filled(value)) {
      shortcuts.push({ type, value: value ?? '', primary: true })
    }
  }
  const methods = withPrimaries(
    withoutDuplicates(
      [...shortcuts, ...(input.methods ?? []).filter((method) => '' !== method.value.trim())].map((method) =>
        normalizeMethod(method, { defaultCountry, country })
      )
    )
  )

  return { fields: { firstName, lastName, role: filled(input.role), country, timeZone, languages }, methods }
}
