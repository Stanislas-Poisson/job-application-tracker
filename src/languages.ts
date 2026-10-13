// The languages of the extension. Each is described by its code, its name in its own language (so that a person who cannot
// read the page can still find theirs), the direction of its writing and its script. Adding a language is adding a line here
// and a file of texts.
export interface Language {
  code: string
  name: string
  dir: 'ltr' | 'rtl'
  // The script, as ISO 15924 names it (Latn, Arab, Hebr, Hans…).
  script: string
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', dir: 'ltr', script: 'Latn' },
  { code: 'fr', name: 'Français', dir: 'ltr', script: 'Latn' },
]

// The scripts written from right to left: the direction of a language that is not in the table follows its script.
const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm'])

export const isRtlScript = (script: string): boolean => RTL_SCRIPTS.has(script)

export const languageOf = (code: string): Language | undefined => LANGUAGES.find((language) => language.code === code)

// Writes the language and the direction of the page on the root element: screen readers speak with the right voice, the
// browser breaks lines and hyphenates by the language, and the layout follows the direction.
export function applyLanguage(root: HTMLElement, code: string) {
  const language = languageOf(code)
  root.setAttribute('lang', code)
  root.setAttribute('dir', language?.dir ?? 'ltr')
}
