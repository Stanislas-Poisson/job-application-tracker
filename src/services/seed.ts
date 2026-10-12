import type { Pinia } from 'pinia'
import { useRepo } from 'pinia-orm'
import { Source, Status } from '../models'

export const DEFAULT_STATUSES = [
  { key: 'to_apply', label: 'To apply', color: '#64748b', isFinal: false },
  { key: 'applied', label: 'Applied', color: '#2563eb', isFinal: false },
  { key: 'follow_up', label: 'Follow-up', color: '#d97706', isFinal: false },
  { key: 'interview', label: 'Interview', color: '#7c3aed', isFinal: false },
  { key: 'offer', label: 'Offer', color: '#16a34a', isFinal: true },
  { key: 'rejected', label: 'Rejected', color: '#dc2626', isFinal: true },
]

// The host names that tell where an offer comes from. The user can add sources of their own.
export const DEFAULT_SOURCES = [
  { key: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com' },
  { key: 'indeed', label: 'Indeed', url: 'https://www.indeed.com' },
  { key: 'welcome_to_the_jungle', label: 'Welcome to the Jungle', url: 'https://www.welcometothejungle.com' },
  { key: 'france_travail', label: 'France Travail', url: 'https://candidat.francetravail.fr' },
  { key: 'apec', label: 'APEC', url: 'https://www.apec.fr' },
  { key: 'other', label: 'Other', url: null },
]

// Fills what an empty store needs to be usable. A table that already has records is left alone.
export function seedDefaults(pinia?: Pinia) {
  const statuses = useRepo(Status, pinia)
  if (0 === statuses.all().length) {
    statuses.save(DEFAULT_STATUSES.map((status, order) => ({ ...status, order })))
  }

  const sources = useRepo(Source, pinia)
  if (0 === sources.all().length) {
    sources.save(DEFAULT_SOURCES)
  }
}
