import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    one: '{count} रिमाइंडर का समय हो गया है',
    other: '{count} रिमाइंडर का समय हो गया है',
  },
  more: 'और {count}',
  title: 'रिमाइंडर',
}

export default notify
