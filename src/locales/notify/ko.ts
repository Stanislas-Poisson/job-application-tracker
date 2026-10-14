import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    other: '알림 {count}개의 기한이 되었습니다',
  },
  more: '외 {count}개',
  title: '알림',
}

export default notify
