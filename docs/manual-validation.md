# Manual review of the look

A machine finds about a third of the problems of a page (`docs/accessibility.md`). Before the extension goes to the stores, a person
looks at it: how it reads in each look, in each language, with large text, with the messages over a drawer. This page says what to
look at, and `tests/e2e/review.mjs` takes the pictures so that nobody goes through the pages one by one.

## Take the pictures

```sh
npm run zip
cd tests/e2e
BROWSER=chrome OUT=/path/to/folder npm run review
```

- `BROWSER` is `chrome`, `edge` or `firefox` (the browser must be installed). The default is Chrome, and the pictures go to
  `.output/review/<browser>` when `OUT` is not set.
- `ONLY=languages` (a pattern on the name of a group) takes one group only: `looks`, `system`, `customTheme`, `languages`, `text`,
  `messages`, `sizes`.
- Open `index.html` in the folder: pictures by group, a click shows one whole.
- The script fills the board with ten applications made to hurt: a very long title, a long German word, Arabic and Japanese
  texts, salaries in six currencies, tags, favourites and priorities. It writes the settings in the storage as the options page
  does, so every page follows at once. It asserts nothing: the verdict is yours.
- The zip is reused if it exists: run `npm run zip` again after a change, or the pictures show the old code.
- The emulation of the settings of the system (more contrast, forced colours) needs the protocol of Chrome and Edge, and is
  skipped in Firefox.

## What to look at

For each picture, in this order of importance.

### Everywhere

- Nothing is cut: no word or number hidden at the edge of a card, a button, a column or a field. A long word wraps or is shortened
  with its full text one click away.
- Nothing overlaps: the text of a button, a count, a tag, a symbol.
- The page does not scroll sideways, except the board between its columns.
- The focus is visible on the one control that has it.
- The text can be read: nothing pale on pale or dark on dark, in the light and in the dark look.
- A control that looks pressable is one, and a text that looks like a text is not.

### 1. Looks (`1-looks`)

Light and dark, each with the standard vision, red-green, blue-yellow and no colour (monochrome), each with the standard contrast
and the high one.

- The colour is never the only sign: each column has a shape outside the standard vision, and each message a sign (⚠ ✓).
- In red-green and blue-yellow, the columns, the messages and the tags can be told apart (the simulation says they can: say if a
  person with that vision would not).
- In monochrome there is no colour left at all, not even an accent.
- In high contrast the lines are thick, the text is black on white (white on black), the links are underlined, the focus is strong.
- The accent is the same on every page.

### 2. The system asks (`2-system`)

More contrast asked by the system, and the colours forced (Chrome and Edge).

- With more contrast, the look is the high contrast of the extension, in the light and the dark.
- With the colours forced, the page uses the colours of the system, every control keeps a visible border, and each column shows
  its shape in place of its colour dot.
- To be sure of a real machine, repeat by hand with a contrast theme of Windows (Settings, Accessibility, Contrast themes) and
  with `prefers-contrast` in Firefox (`about:config`, `layout.css.prefers-contrast.enabled`).

### 3. An own theme (`3-custom-theme`)

- The theme applies to the three pages and the drawer, in the light and the dark look.
- With the high contrast on, the theme gives way (the colours of the contrast win).
- The editor of the theme itself is readable with the colours it is editing.

### 4. Languages (`4-languages`)

Every language: board, popup, options, drawer (read, then edited with the Edit button). Arabic and Hebrew also in the dark look.

- Right to left (Arabic, Hebrew): the page, the drawer (it opens on the side of the start of the line), the columns, the arrows
  and chevrons, the order of the buttons, the numbers, a Latin name inside an Arabic or Hebrew line (company, tag, address).
- Scripts: Japanese, Chinese (simplified and traditional), Korean, Hindi, Arabic, Hebrew, Cyrillic: the right font is used (no
  empty squares), the line height does not cut the tall letters (Devanagari), the lines break in a place that is allowed.
- Text that is longer in a language than in English (German, Russian, Finnish-like words) does not break a button or a column.
- A text that is not translated shows in English, never as a key (`labels.manage`).
- The dates, the numbers and the amounts follow the language.
- Say, for each language, whether the text sounds natural: it was written without a native speaker (`reviewed: false` in
  `src/languages.ts`). Note the ones that need a review.

### 5. Text (`5-text`)

200 percent and the widest spacing in English and in the five hardest scripts, then the serif and monospace fonts, then the
compact density.

- Everything stays reachable: no control pushed out of the window, no text cut, the drawer scrolls inside.
- The board scrolls between its columns and not the page.
- The compact density is not so tight that two lines touch.

### 6. Messages (`6-messages`)

The message with its Undo button (after the removal of a tag), the confirmation over the drawer (a note typed and not saved) and the
three answers over the drawer (a change of the card not saved), in English light and dark, in Arabic, in Hebrew and at 200 percent.

- The message is in a corner, readable, with a button that can be pressed; at 200 percent it still fits.
- The confirmation is above the drawer, the dangerous button is told by more than its colour, the focus is on a button inside it.
- The three answers (keep editing, close without saving, save and close) are told apart by their words, the focus is on keep editing,
  and the buttons still fit side by side at 200 percent or wrap without hiding one.
- In right to left, the message and the confirmation are mirrored.

### 7. Sizes (`7-sizes`)

1024, 1280 and 1920 pixels wide: the six columns at 1280, the board that uses the width at 1920, the options in one or two columns.

## By hand, beyond the pictures

A picture does not show what moves or what is read out. Do these once, on the package of the stores.

- With the keyboard alone: the tab order is the reading order, the drawer opens to be read and the Edit button is reached by Tab, Escape steps back from editing to reading and closes
  the drawer from there (and closes the confirmation), the focus comes back to where it was. (A test checks one path: see `docs/accessibility.md`.)
- With a screen reader (NVDA on Windows, VoiceOver on macOS): add an application, move it, open the drawer, change the language.
  This is the issue #150.
- With the movement reduced in the system: nothing slides or fades.
- In the real popup, opened from the icon of the toolbar, at its real size: the page of the popup in a tab is wider.
- In each browser: Chrome, Edge, Firefox. The fonts and the form controls are not drawn the same way.

## The defects

One line each, in the issue of the review (or a new one per family), with the picture:

| Where | What is wrong | Picture | Decision |
| :--- | :--- | :--- | :--- |
| | | | |

## Done when

- Every picture of every group was looked at, in Chrome, and the groups 1, 4 and 6 in Edge and Firefox too.
- Each defect is fixed or written down with the reason it stays.
- The languages that need a native review are listed in the epic of the languages.
