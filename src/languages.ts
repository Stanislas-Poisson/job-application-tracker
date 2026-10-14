import { customLanguage } from './customLanguages'

// The languages of the extension. Each is described by its code, its name in its own language (so that a person who cannot
// read the page can still find theirs), the direction of its writing and its script. Adding a language is adding a line here
// and a file of texts.
export interface Language {
  code: string
  name: string
  dir: 'ltr' | 'rtl'
  // The script, as ISO 15924 names it (Latn, Arab, Hebr, Hans…).
  script: string
  // Whether a person who speaks the language has checked the texts. A language that was not checked says so in the options.
  reviewed: boolean
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', dir: 'ltr', script: 'Latn', reviewed: true },
  { code: 'fr', name: 'Français', dir: 'ltr', script: 'Latn', reviewed: true },
  { code: 'es', name: 'Español', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'de', name: 'Deutsch', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'it', name: 'Italiano', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'pt', name: 'Português', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'nl', name: 'Nederlands', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'ar', name: 'العربية', dir: 'rtl', script: 'Arab', reviewed: false },
  { code: 'he', name: 'עברית', dir: 'rtl', script: 'Hebr', reviewed: false },
  { code: 'ja', name: '日本語', dir: 'ltr', script: 'Jpan', reviewed: false },
  { code: 'zh-Hans', name: '简体中文', dir: 'ltr', script: 'Hans', reviewed: false },
  { code: 'zh-Hant', name: '繁體中文', dir: 'ltr', script: 'Hant', reviewed: false },
  { code: 'ko', name: '한국어', dir: 'ltr', script: 'Kore', reviewed: false },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr', script: 'Deva', reviewed: false },
  { code: 'pl', name: 'Polski', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'ru', name: 'Русский', dir: 'ltr', script: 'Cyrl', reviewed: false },
  { code: 'uk', name: 'Українська', dir: 'ltr', script: 'Cyrl', reviewed: false },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', script: 'Latn', reviewed: false },
  { code: 'sv', name: 'Svenska', dir: 'ltr', script: 'Latn', reviewed: false },
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
  root.setAttribute('dir', language?.dir ?? customLanguage(code)?.dir ?? 'ltr')
}
