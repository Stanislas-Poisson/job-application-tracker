import type { TranslationObject } from '@zairakai/js-i18n'

// The texts of the notification of the reminders: the only ones the background of the extension needs, kept apart so that it
// does not carry the texts of the pages.
const notify: TranslationObject = {
  many: {
    one: '{count} lembrete venceu',
    other: '{count} lembretes venceram',
  },
  more: 'e mais {count}',
  title: 'Lembrete',
}

export default notify
