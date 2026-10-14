import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    one: '{count} rappel est échu',
    other: '{count} rappels sont échus',
  },
  more: 'et {count} de plus',
  title: 'Rappel',
}

export default notify
