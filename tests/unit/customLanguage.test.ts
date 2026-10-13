import { beforeEach, describe, expect, it } from 'vitest'
import {
  LANGUAGE_FILE,
  MAX_FILE_CHARS,
  MAX_LANGUAGES,
  MAX_TEXT,
  languageTemplate,
  normalizeStoredLanguages,
  readLanguageFile,
  validateLanguage,
} from '../../src/customLanguage'
import {
  LANGUAGES_KEY,
  addCustomLanguage,
  installed,
  loadCustomLanguages,
  removeCustomLanguage,
} from '../../src/customLanguages'
import { createTranslator, ensureLocale, resolveLocale } from '../../src/i18n'
import { applyLanguage } from '../../src/languages'
import { memoryAdapter } from '../../src/persistence/adapter'

type Tree = Record<string, unknown>

// A file as a person would make it from the template: the code, the name and the direction filled, some texts translated.
const file = (messages: Tree, extra: Tree = {}): Tree => ({
  app: LANGUAGE_FILE,
  code: 'sv',
  name: 'Svenska',
  dir: 'ltr',
  messages,
  ...extra,
})
const ok = (raw: unknown) => {
  const result = validateLanguage(raw)
  if (!result.ok) throw new Error(`refused: ${result.error}`)
  return result
}
const refused = (raw: unknown) => {
  const result = validateLanguage(raw)
  return result.ok ? 'accepted' : result.error
}
const reasons = (messages: Tree, extra: Tree = {}) =>
  Object.fromEntries(
    ok(file({ dirty: { unsaved: 'Cambios sin guardar' }, ...messages }, extra)).report.problems.map((p) => [
      p.path,
      p.reason,
    ])
  )

beforeEach(() => {
  installed.value = []
})

describe('the file to translate', () => {
  it('is English with the fields to fill, and comes back as a language once they are filled', () => {
    const template = JSON.parse(languageTemplate()) as Tree
    expect(template).toMatchObject({ app: LANGUAGE_FILE, code: '', name: '', dir: 'ltr' })
    expect(refused(template)).toBe('code')
    const filled = ok({ ...template, code: 'sv', name: 'Svenska' })
    // Nothing translated yet: every text is the English one, valid, and kept.
    expect(filled.report.translated).toBe(filled.report.total)
    expect(filled.report.problems).toEqual([])
    expect(filled.report.unknown).toEqual([])
  })

  it('is read from text, with its size and its JSON checked', () => {
    expect(readLanguageFile('nope')).toEqual({ ok: false, error: 'json' })
    expect(readLanguageFile(' '.repeat(MAX_FILE_CHARS + 1))).toEqual({ ok: false, error: 'too-big' })
    expect(readLanguageFile(JSON.stringify(file({ nav: { board: 'Tablero' } }))).ok).toBe(true)
  })
})

describe('what refuses the whole file', () => {
  it('is not a language file, a code that is not valid, a language the extension has, a bad name, a bad direction, no texts', () => {
    expect(refused(null)).toBe('not-a-language')
    expect(refused({ app: 'other' })).toBe('not-a-language')
    expect(refused(file({}, { code: 'ES' }))).toBe('code')
    expect(refused(file({}, { code: 'e' }))).toBe('code')
    expect(refused(file({}, { code: 'zz-<script>' }))).toBe('code')
    expect(refused(file({ nav: { board: 'x' } }, { code: 'fr' }))).toBe('shipped')
    expect(refused(file({ nav: { board: 'x' } }, { code: 'en' }))).toBe('shipped')
    expect(refused(file({ nav: { board: 'x' } }, { name: '' }))).toBe('name')
    expect(refused(file({ nav: { board: 'x' } }, { name: 'x'.repeat(41) }))).toBe('name')
    expect(refused(file({ nav: { board: 'x' } }, { name: '<b>x</b>' }))).toBe('name')
    expect(refused(file({ nav: { board: 'x' } }, { name: 'a‮b' }))).toBe('name')
    expect(refused(file({ nav: { board: 'x' } }, { dir: 'up' }))).toBe('dir')
    expect(refused(file('texts' as never))).toBe('messages')
    expect(refused(file({}))).toBe('empty')
    expect(refused(file({ nope: { nothing: 'x' } }))).toBe('empty')
  })

  it('accepts a variant of a language the extension has', () => {
    expect(ok(file({ nav: { board: 'Tableau' } }, { code: 'fr-CA', name: 'Français (Canada)' })).language.code).toBe(
      'fr-CA'
    )
  })
})

describe('what leaves one text out, and English is shown instead', () => {
  it('is a text with placeholders that are not those of English, or one missing', () => {
    expect(
      reasons({
        trash: { restored: { one: 'x', other: 'x {count} {extra}' } },
        labels: { usage: { one: 'x', other: 'once' } },
      })
    ).toEqual({ 'trash.restored': 'placeholders' })
    expect(reasons({ backup: { ago: 'ya' } })).toEqual({})
  })

  it('is a text that is not a text, an empty one, a long one', () => {
    expect(reasons({ nav: { board: 5 } })).toEqual({ 'nav.board': 'type' })
    expect(reasons({ nav: { board: '   ' } })).toEqual({ 'nav.board': 'empty' })
    expect(reasons({ nav: { board: 'x'.repeat(MAX_TEXT + 1) } })).toEqual({ 'nav.board': 'long' })
  })

  it('is a text with control characters, with marks that change the direction of the text, or a byte order mark', () => {
    for (const bad of ['a\u0000b', 'a\u001bb', 'a‮b', 'a⁦b', '﻿a']) {
      expect(reasons({ nav: { board: bad } }), JSON.stringify(bad)).toEqual({ 'nav.board': 'characters' })
    }
    expect(reasons({ nav: { board: 'a\tb\nc' } })).toEqual({})
  })

  it('is a text that looks like markup, an entity or a link that runs code', () => {
    for (const bad of [
      '<b>x</b>',
      '<script>alert(1)</script>',
      '<img src=x>',
      'a &amp; b',
      'a &#60; b',
      'javascript:alert(1)',
      '< a',
    ]) {
      expect(reasons({ nav: { board: bad } }), bad).toEqual({ 'nav.board': 'markup' })
    }
    expect(reasons({ nav: { board: 'Tablero < 5 y > 2' } })).toEqual({})
  })

  it('is a stray brace, or the keys that could reach the prototype', () => {
    expect(reasons({ nav: { board: 'a {' } })).toEqual({ 'nav.board': 'braces' })
    expect(reasons({ nav: { board: '{{x}}' } })).toEqual({ 'nav.board': 'braces' })
    const hostile = JSON.parse('{"nav":{"board":"ok"},"__proto__":{"polluted":"x"},"constructor":{"x":"y"}}') as Tree
    const result = ok(file(hostile))
    expect(result.report.problems.map((p) => p.reason)).toEqual(['key', 'key'])
    expect(({} as Tree).polluted).toBeUndefined()
    expect(result.language.messages).toEqual({ nav: { board: 'ok' } })
  })

  it('is a text with plural forms that are not those of the language, or without "other"', () => {
    // Spanish has one, many and other; "few" is not one of its forms.
    expect(reasons({ labels: { usage: { one: 'una vez', few: 'pocas', other: '{count} veces' } } })).toEqual({
      'labels.usage': 'plural',
    })
    expect(reasons({ labels: { usage: { one: 'una vez' } } })).toEqual({ 'labels.usage': 'plural' })
    expect(reasons({ labels: { usage: 'once' } })).toEqual({ 'labels.usage': 'plural' })
    expect(reasons({ labels: { usage: { one: 'una vez', other: '{count} veces' } } })).toEqual({})
  })

  it('keys that English does not have are ignored, and counted', () => {
    const result = ok(file({ nav: { board: 'Tablero' }, made: { up: 'x' } }))
    expect(result.report.unknown).toEqual(['made.up'])
    expect(result.language.messages).toEqual({ nav: { board: 'Tablero' } })
  })

  it('counts the texts translated and the ones left to English', () => {
    const { report } = ok(file({ nav: { board: 'Tablero', options: 'Opciones' } }))
    expect(report.translated).toBe(2)
    expect(report.missing).toBe(report.total - 2)
  })
})

describe('the stored languages', () => {
  it('are checked again when they are read, and at most as many as can be kept', () => {
    const good = ok(file({ nav: { board: 'Tablero' } })).language
    const tampered = { ...good, code: 'da', name: '<b>x</b>' }
    const many = Array.from({ length: MAX_LANGUAGES + 2 }, (_, index) => ({
      ...good,
      code: `a${String.fromCharCode(97 + index)}`,
    }))
    expect(normalizeStoredLanguages([good, tampered, 3, null, good]).map((language) => language.code)).toEqual(['sv'])
    expect(normalizeStoredLanguages(many)).toHaveLength(MAX_LANGUAGES)
    expect(normalizeStoredLanguages('nope')).toEqual([])
  })

  it('are kept, replaced by the same code, loaded again and removed', async () => {
    const adapter = memoryAdapter()
    const spanish = ok(file({ nav: { board: 'Tablero' } })).language
    expect(await addCustomLanguage(adapter, spanish)).toBe(true)
    expect(await addCustomLanguage(adapter, { ...spanish, name: 'Español 2' })).toBe(true)
    expect(installed.value.map((language) => language.name)).toEqual(['Español 2'])
    installed.value = []
    expect((await loadCustomLanguages(adapter)).map((language) => language.code)).toEqual(['sv'])
    await removeCustomLanguage(adapter, 'sv')
    expect(installed.value).toEqual([])
    expect(adapter.data[LANGUAGES_KEY]).toEqual([])
  })

  it('refuse one more than the limit', async () => {
    const adapter = memoryAdapter()
    const base = ok(file({ nav: { board: 'x' } })).language
    for (let index = 0; index < MAX_LANGUAGES; index += 1) {
      expect(await addCustomLanguage(adapter, { ...base, code: `b${String.fromCharCode(97 + index)}` })).toBe(true)
    }
    expect(await addCustomLanguage(adapter, { ...base, code: 'zz' })).toBe(false)
  })
})

describe('the language in use', () => {
  it('shows the texts of the file, English for the others, and follows the language of the browser', () => {
    installed.value = [ok(file({ nav: { board: 'Tablero' } })).language]
    expect(resolveLocale('sv', 'en')).toBe('sv')
    expect(resolveLocale('auto', 'sv-SE')).toBe('sv')
    expect(resolveLocale('auto', 'ja-JP')).toBe('en')
    const translator = createTranslator('sv', 'en')
    expect(translator.__('nav.board')).toBe('Tablero')
    expect(translator.__('nav.options')).toBe(createTranslator('en', 'en').__('nav.options'))
  })

  it('is English when the language was removed, and a translator made before gets the texts of one added later', () => {
    expect(resolveLocale('sv', 'en')).toBe('en')
    const early = createTranslator('en', 'en')
    installed.value = [ok(file({ nav: { board: 'Tablero' } })).language]
    ensureLocale(early, 'sv')
    early.setLocale('sv')
    expect(early.__('nav.board')).toBe('Tablero')
  })

  it('writes the direction of the language of the file', () => {
    installed.value = [ok(file({ nav: { board: 'x' } }, { code: 'he', name: 'עברית', dir: 'rtl' })).language]
    const root = document.createElement('html')
    applyLanguage(root, 'he')
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(root.getAttribute('lang')).toBe('he')
  })
})
