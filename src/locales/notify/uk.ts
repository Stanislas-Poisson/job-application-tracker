import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    one: 'Настав термін {count} нагадування',
    few: 'Настав термін {count} нагадувань',
    many: 'Настав термін {count} нагадувань',
    other: 'Настав термін {count} нагадувань',
  },
  more: 'і ще {count}',
  title: 'Нагадування',
}

export default notify
