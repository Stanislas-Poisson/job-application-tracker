import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    other: '{count} 件のリマインダーの期限が来ました',
  },
  more: 'ほか {count} 件',
  title: 'リマインダー',
}

export default notify
