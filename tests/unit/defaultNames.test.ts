import { describe, expect, it } from 'vitest'
import en from '../../src/locales/en'
import fr from '../../src/locales/fr'
import { defaultNamePath } from '../../src/services/defaultNames'
import { DEFAULT_STATUSES } from '../../src/services/seed'

const names = (locale: unknown) => (locale as { defaults: { statuses: Record<string, string> } }).defaults.statuses

describe('defaultNamePath', () => {
  it('translates a column that still has the name it came with', () => {
    expect(defaultNamePath('statuses', { key: 'applied', label: 'Applied' })).toBe('defaults.statuses.applied')
  })

  it('leaves a column the user renamed, or created, as it is', () => {
    expect(defaultNamePath('statuses', { key: 'applied', label: 'Sent' })).toBeNull()
    expect(defaultNamePath('statuses', { key: 'custom', label: 'Applied' })).toBeNull()
  })

  it('translates only "Other" among the sources, a brand is the same everywhere', () => {
    expect(defaultNamePath('sources', { key: 'other', label: 'Other' })).toBe('defaults.sourceOther')
    expect(defaultNamePath('sources', { key: 'linkedin', label: 'LinkedIn' })).toBeNull()
  })

  it('has a text in every language for every column that comes with the extension', () => {
    for (const status of DEFAULT_STATUSES) {
      expect(names(en)).toHaveProperty(status.key)
      expect(names(fr)).toHaveProperty(status.key)
    }
  })
})
