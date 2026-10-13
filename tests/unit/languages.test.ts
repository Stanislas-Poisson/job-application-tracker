import { describe, expect, it } from 'vitest'
import { SUPPORTED } from '../../src/i18n'
import { LANGUAGES, applyLanguage, isRtlScript, languageOf } from '../../src/languages'

describe('languages', () => {
  it('describes every language the extension has, by its code, its own name, its direction and its script', () => {
    expect(LANGUAGES.map((language) => language.code).sort()).toEqual([...SUPPORTED].sort())
    for (const language of LANGUAGES) {
      expect(language.name).not.toBe('')
      expect(['ltr', 'rtl']).toContain(language.dir)
      expect(language.script).toMatch(/^[A-Z][a-z]{3}$/)
    }
    expect(languageOf('fr')?.name).toBe('Français')
    expect(languageOf('xx')).toBeUndefined()
  })

  it('writes lang and dir on the root element', () => {
    const root = document.createElement('html')
    applyLanguage(root, 'fr')
    expect(root.getAttribute('lang')).toBe('fr')
    expect(root.getAttribute('dir')).toBe('ltr')
    // A language the table does not know is written left to right.
    applyLanguage(root, 'xx')
    expect(root.getAttribute('lang')).toBe('xx')
    expect(root.getAttribute('dir')).toBe('ltr')
  })

  it('knows the scripts written from right to left', () => {
    expect(['Arab', 'Hebr', 'Thaa'].every(isRtlScript)).toBe(true)
    expect(['Latn', 'Hans', 'Deva'].some(isRtlScript)).toBe(false)
  })
})
