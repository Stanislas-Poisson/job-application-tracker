import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    zero: 'لا تذكيرات مستحقة',
    one: 'تذكير واحد مستحق',
    two: 'تذكيران مستحقان',
    few: '{count} تذكيرات مستحقة',
    many: '{count} تذكيرًا مستحقًا',
    other: '{count} تذكير مستحق',
  },
  more: 'و{count} أخرى',
  title: 'تذكير',
}

export default notify
