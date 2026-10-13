# Translating Job Application Tracker

A language is a small file of texts, shipped in the extension. Nothing is downloaded when the extension runs: a new language reaches
everyone with the next version, like a fix.

## What a translator does

1. Copy `src/locales/en.ts` to `src/locales/<code>.ts` (`es`, `de`, `pt-BR`…) and translate the texts. The keys do not change.
2. Keep every `{placeholder}` as it is, in the order your language needs: `{count}`, `{date}`, `{name}`… A test checks that each
   language has the same keys and the same placeholders as English.
3. A text that depends on a number has a form for each plural category of the language (`zero`, `one`, `two`, `few`, `many`,
   `other`). `other` is always there. English and French have `one` and `other`; Russian needs `one`, `few`, `many` and `other`; Arabic
   all six. The categories of a language are listed by `new Intl.PluralRules('<code>').resolvedOptions().pluralCategories`.
4. Add the language to the table in `src/languages.ts` (its code, its name in itself, `ltr` or `rtl`, its script), to `LOCALES` in
   `src/settings.ts` and to `src/i18n.ts`.
5. Translate the name and the description of the store listing in `public/_locales/<code>/messages.json` (the description is 132
   characters at most).
6. Open a pull request into `develop`, with the three checks green (`npm run quality`).

## What to keep in mind

- Texts are read by people with a screen reader: write full sentences, not fragments glued together.
- Do not translate the names of services or file formats (CSV, JSON, WCAG).
- Texts get longer in some languages (30% more in German): do not count on a fixed width.
- Dates, numbers and money are written by the browser for the language: do not write them in a text.
