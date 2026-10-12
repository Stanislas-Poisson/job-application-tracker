import type { CountryCode } from 'libphonenumber-js/min'
import {
  normalizeCountry,
  normalizeEmail,
  normalizeLanguage,
  normalizeLinkedIn,
  normalizePhone,
} from '../utils/contact'
import { isValidTimeZone } from '../utils/time'

// What a form gives about a person: texts, empty when not set.
export interface ContactInput {
  firstName: string
  lastName: string
  role?: string | null
  email?: string | null
  phone?: string | null
  linkedin?: string | null
  country?: string | null
  timeZone?: string | null
  languages?: string[]
}

export interface ContactFields {
  firstName: string
  lastName: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin: string | null
  country: string | null
  timeZone: string | null
  languages: string[]
}

// A form that cannot become a contact. The code is the key of the message to show.
export class ContactError extends Error {
  constructor(public readonly code: 'name' | 'email' | 'phone' | 'linkedin' | 'country' | 'timeZone' | 'language') {
    super(code)
  }
}

const filled = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim()
  return '' === text ? null : text
}

// The fields of a contact in the forms they are stored in: the phone in E.164, the email in lower case, the LinkedIn page
// as its canonical address, the country as an ISO code. A phone number without a country code is read in the country of
// the person, or in the default country when the person has none. Throws a ContactError for the first thing that is wrong.
export function normalizeContactInput(
  input: ContactInput,
  { defaultCountry }: { defaultCountry?: CountryCode } = {}
): ContactFields {
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

  const emailText = filled(input.email)
  const email = null === emailText ? null : normalizeEmail(emailText)
  if (null !== emailText && null === email) {
    throw new ContactError('email')
  }

  const phoneText = filled(input.phone)
  const phone = null === phoneText ? null : (normalizePhone(phoneText, country ?? defaultCountry)?.e164 ?? null)
  if (null !== phoneText && null === phone) {
    throw new ContactError('phone')
  }

  const linkedinText = filled(input.linkedin)
  const linkedin = null === linkedinText ? null : normalizeLinkedIn(linkedinText)
  if (null !== linkedinText && null === linkedin) {
    throw new ContactError('linkedin')
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

  return {
    firstName,
    lastName,
    role: filled(input.role),
    email,
    phone,
    linkedin,
    country,
    timeZone,
    languages,
  }
}
