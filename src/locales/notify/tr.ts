import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    one: '{count} hatırlatmanın zamanı geldi',
    other: '{count} hatırlatmanın zamanı geldi',
  },
  more: 've {count} tane daha',
  title: 'Hatırlatma',
}

export default notify
