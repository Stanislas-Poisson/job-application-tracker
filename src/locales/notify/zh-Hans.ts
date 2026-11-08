import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    other: '有 {count} 个提醒已到期',
  },
  more: '还有 {count} 个',
  title: '提醒',
}

export default notify
