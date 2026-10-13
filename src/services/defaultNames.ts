import { DEFAULT_SOURCES, DEFAULT_STATUSES } from './seed'

type Named = { key: string; label: string }

// The text path of a column or source that still has the name it came with, or null once the user renamed it. Such a name
// is stored in English and shown in the language of the page; a name the user chose is shown as it is.
export function defaultNamePath(kind: 'statuses' | 'sources', record: Named): string | null {
  const defaults: Named[] = 'statuses' === kind ? DEFAULT_STATUSES : DEFAULT_SOURCES
  const original = defaults.find((candidate) => candidate.key === record.key)
  // A brand (LinkedIn, Indeed...) is the same in every language: only "Other" has a text.
  if (original?.label !== record.label || ('sources' === kind && 'other' !== record.key)) {
    return null
  }
  return `defaults.${kind}.${record.key}`
}
