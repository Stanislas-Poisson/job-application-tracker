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

## Checking that a language fits

The end-to-end suite makes a pseudo-language on each page (every text 40% longer and accented, taller lines), in both directions, and fails when a text is cut or the page grows a side scroll. Run it with `npm run zip` then `BROWSER=chrome npm test` in `tests/e2e`.

## A language of your own, without waiting for an update

In the options, under the language, **"A language of your own"** lets anyone use a language that is not shipped yet (a regional
variant such as `fr-CA`, a small language, personal wording), or try a translation before sending it as a pull request.

1. Download the file to translate: it is English, with `code`, `name` (the language in itself) and `dir` (`ltr` or `rtl`) to fill.
2. Translate the texts in `messages`. Keep every `{placeholder}`. A text with forms (`one`, `other`…) needs the forms of the language.
3. Give the file back. A preview says how many texts are translated, which were refused and why, and which keys were ignored. Nothing
   is kept until the user accepts.

What is checked, and why:

- **The size** of the file (1 million characters at most) and its **shape**: a language file of this extension, nothing else.
- **The code** (`es`, `pt-BR`…) is a valid language tag, and is not one of the languages the extension has.
- **Only the keys of English** are kept. A key that is not in English is ignored; a key that could reach the prototype of an object
  (`__proto__`, `constructor`, `prototype`) is refused.
- **Each text** is at most 2000 characters, with no control character, no mark that changes the direction of the text around it
  (they can make a text read differently from how it is written) and no byte order mark.
- **No markup, no entity and no link that runs code.** The page shows texts as text and never as markup, and this is checked as well.
- **The placeholders are those of the English text**, no more and no fewer, and no stray brace. For a text with plural forms, each
  form may have only the placeholders English has, and only the forms of the language (`other` always).
- A text that does not pass is left out, and the English text is shown in its place.

The languages are kept in `storage.local` under `jat:languages`, are checked again every time they are read, and are not part of the
data or of the backups. Nothing is downloaded and nothing is sent. At most five can be kept. A language that is shipped later with the
same code is used instead of the file.
