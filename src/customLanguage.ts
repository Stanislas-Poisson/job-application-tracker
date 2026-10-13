import en from './locales/en'

// A language of the user's own: a file with the texts, checked against English before it is kept. The texts are shown by the
// page as text (never as markup), but the file still comes from outside, so everything in it is checked: its size, its
// shape, the characters it holds, the {placeholders} each text must keep, and the keys English has. What does not pass is
// left out and English is shown in its place.

export const LANGUAGE_FILE = 'job-application-tracker-language'
export const MAX_FILE_CHARS = 1_000_000
export const MAX_TEXT = 2000
export const MAX_NAME = 40
export const MAX_DEPTH = 6
export const MAX_LANGUAGES = 5

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/
const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other']
const PLACEHOLDER = /\{(\w+)\}/g
// Control characters (a tab and a new line are allowed), the marks that change the direction of the text around them
// (they can make a text read differently from how it is written), and the byte order mark.
const FORBIDDEN = new RegExp(String.raw`[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufeff]`)
// What looks like markup, an entity or a link that runs code.
const MARKUP = /<\s*[a-zA-Z/!?]|&#?\w+;|javascript:/i
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export type Messages = Record<string, unknown>

export interface StoredLanguage {
  code: string
  name: string
  dir: 'ltr' | 'rtl'
  messages: Messages
}

export type LanguageError =
  'too-big' | 'json' | 'not-a-language' | 'code' | 'shipped' | 'name' | 'dir' | 'messages' | 'empty'

export interface Problem {
  path: string
  reason: 'type' | 'empty' | 'long' | 'characters' | 'markup' | 'placeholders' | 'braces' | 'plural' | 'key'
}

export interface LanguageReport {
  // The texts English has, the ones this file translates, and the ones it leaves to English.
  total: number
  translated: number
  missing: number
  // The keys of the file that English does not have: ignored.
  unknown: string[]
  // The texts that were refused: English is shown for them.
  problems: Problem[]
}

export type LanguageResult =
  { ok: true; language: StoredLanguage; report: LanguageReport } | { ok: false; error: LanguageError }

const isObject = (value: unknown): value is Record<string, unknown> =>
  'object' === typeof value && null !== value && !Array.isArray(value)

// A text with plural forms: an object with an "other" form and only the categories of the plural rules.
export const isPluralObject = (value: unknown): value is Record<string, string> =>
  isObject(value) &&
  'other' in value &&
  Object.keys(value).every((key) => CATEGORIES.includes(key)) &&
  Object.values(value).every((text) => 'string' === typeof text)

// The leaves of a tree of texts: a text, or a text with plural forms, by its dotted path.
// `texts` are the paths English has a text at: an object found there is that text, whatever its shape, and is judged as such.
function leaves(
  tree: unknown,
  texts: ReadonlySet<string> = new Set(),
  prefix = '',
  depth = 0,
  into = new Map<string, unknown>()
): Map<string, unknown> {
  if (isObject(tree)) {
    for (const [key, value] of Object.entries(tree)) {
      const path = '' === prefix ? key : `${prefix}.${key}`
      if (
        isPluralObject(value) ||
        texts.has(path) ||
        'string' === typeof value ||
        !isObject(value) ||
        MAX_DEPTH <= depth
      ) {
        into.set(path, value)
      } else {
        leaves(value, texts, path, depth + 1, into)
      }
    }
  }
  return into
}

const ENGLISH = leaves(en)
const ENGLISH_PATHS: ReadonlySet<string> = new Set(ENGLISH.keys())

const placeholdersOf = (text: string): string[] =>
  [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))].sort()
const strayBraces = (text: string): boolean => /[{}]/.test(text.replace(PLACEHOLDER, ''))

// Why a text is refused, or null when it can be kept. `allowed` are the placeholders English has for this text.
function textProblem(text: unknown, allowed: string[], exact: boolean): Problem['reason'] | null {
  if ('string' !== typeof text) {
    return 'type'
  }
  if ('' === text.trim()) {
    return 'empty'
  }
  if (MAX_TEXT < text.length) {
    return 'long'
  }
  if (FORBIDDEN.test(text)) {
    return 'characters'
  }
  if (MARKUP.test(text)) {
    return 'markup'
  }
  const found = placeholdersOf(text)
  if (strayBraces(text)) {
    return 'braces'
  }
  const sameSet = found.length === allowed.length && found.every((name, index) => name === allowed[index])
  return (exact ? sameSet : found.every((name) => allowed.includes(name))) ? null : 'placeholders'
}

// The languages the extension has: a file cannot take their place.
export const SHIPPED = ['en', 'fr']

function setPath(tree: Messages, path: string, value: unknown) {
  const keys = path.split('.')
  let node = tree
  for (const key of keys.slice(0, -1)) {
    node[key] = isObject(node[key]) ? node[key] : {}
    node = node[key] as Messages
  }
  node[keys.at(-1) ?? ''] = value
}

/**
 * Checks a language file (already read as JSON) and keeps what can be kept. A fault of the whole file refuses it; a fault in
 * a text leaves that text out, with the reason, and English is shown in its place.
 */
export function validateLanguage(raw: unknown): LanguageResult {
  if (!isObject(raw) || LANGUAGE_FILE !== raw.app) {
    return { ok: false, error: 'not-a-language' }
  }
  const code = 'string' === typeof raw.code ? raw.code.trim() : ''
  if (!CODE.test(code)) {
    return { ok: false, error: 'code' }
  }
  if (SHIPPED.includes(code)) {
    return { ok: false, error: 'shipped' }
  }
  let categories: string[]
  try {
    categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories as string[]
  } catch {
    return { ok: false, error: 'code' }
  }
  const name = 'string' === typeof raw.name ? raw.name.trim() : ''
  if ('' === name || MAX_NAME < name.length || FORBIDDEN.test(name) || MARKUP.test(name) || /[{}]/.test(name)) {
    return { ok: false, error: 'name' }
  }
  if ('ltr' !== raw.dir && 'rtl' !== raw.dir) {
    return { ok: false, error: 'dir' }
  }
  if (!isObject(raw.messages)) {
    return { ok: false, error: 'messages' }
  }

  const messages: Messages = {}
  const problems: Problem[] = []
  const unknown: string[] = []
  let translated = 0
  const given = leaves(raw.messages, ENGLISH_PATHS)
  for (const [path, value] of given) {
    const english = ENGLISH.get(path)
    if (path.split('.').some((key) => DANGEROUS_KEYS.has(key))) {
      problems.push({ path, reason: 'key' })
      continue
    }
    if (undefined === english) {
      unknown.push(path)
      continue
    }
    if (isPluralObject(english)) {
      // A text with forms: the forms of this language, "other" always, each with only the placeholders English has.
      const allowed = [...new Set(Object.values(english).flatMap(placeholdersOf))].sort()
      if (
        !isPluralObject(value) ||
        !Object.keys(value).every((form) => 'other' === form || categories.includes(form))
      ) {
        problems.push({ path, reason: 'plural' })
        continue
      }
      const bad = Object.values(value)
        .map((text) => textProblem(text, allowed, false))
        .find((reason) => null !== reason)
      if (bad) {
        problems.push({ path, reason: bad })
        continue
      }
    } else {
      const bad = textProblem(value, placeholdersOf(english as string), true)
      if (bad) {
        problems.push({ path, reason: bad })
        continue
      }
    }
    setPath(messages, path, value)
    translated += 1
  }
  if (0 === translated) {
    return { ok: false, error: 'empty' }
  }
  return {
    ok: true,
    language: { code, name, dir: raw.dir, messages },
    report: {
      total: ENGLISH.size,
      translated,
      missing: ENGLISH.size - translated - problems.filter((problem) => ENGLISH.has(problem.path)).length,
      unknown,
      problems,
    },
  }
}

// A file as text: its size first, then the JSON.
export function readLanguageFile(text: string): LanguageResult {
  if (MAX_FILE_CHARS < text.length) {
    return { ok: false, error: 'too-big' }
  }
  try {
    return validateLanguage(JSON.parse(text))
  } catch {
    return { ok: false, error: 'json' }
  }
}

// The file to download, to translate: English, with the fields to fill. The user gives it back after translating.
export function languageTemplate(): string {
  return JSON.stringify(
    {
      app: LANGUAGE_FILE,
      help: 'Fill code (for example es or pt-BR), name (the name of the language in itself) and dir (ltr or rtl), then translate the texts of "messages". Keep every {placeholder} as it is. A text with forms (one, other…) has one text for each form the language needs; "other" is always needed. A text you leave in English stays in English. Do not add keys, markup or links.',
      code: '',
      name: '',
      dir: 'ltr',
      messages: en,
    },
    null,
    2
  )
}

// The stored languages, checked again when they are read: what comes out of the storage is not trusted more than a file.
export function normalizeStoredLanguages(raw: unknown): StoredLanguage[] {
  const seen = new Set<string>()
  const list: StoredLanguage[] = []
  for (const candidate of Array.isArray(raw) ? raw : []) {
    const result = validateLanguage(isObject(candidate) ? { ...candidate, app: LANGUAGE_FILE } : null)
    if (result.ok && !seen.has(result.language.code)) {
      seen.add(result.language.code)
      list.push(result.language)
    }
  }
  return list.slice(0, MAX_LANGUAGES)
}
