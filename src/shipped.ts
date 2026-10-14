import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders, one small file per language. Every language the extension comes with has
// one, so their names tell which languages there are, without reading the texts of the pages.
const files = import.meta.glob<TranslationObject>('./locales/notify/*.ts', { eager: true, import: 'default' })

export const NOTIFY: Readonly<Record<string, TranslationObject>> = Object.fromEntries(
  Object.entries(files).map(([path, texts]) => [path.replace(/^.*\/(.+)\.ts$/, '$1'), texts])
)

// The languages the extension has: a file cannot take their place. English first.
export const SHIPPED: readonly string[] = [
  'en',
  ...Object.keys(NOTIFY)
    .filter((code) => 'en' !== code)
    .sort(),
]
