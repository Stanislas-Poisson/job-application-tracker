# Accessibility and layout

## What is checked, and how

The end-to-end suite `tests/e2e/accessibility.test.mjs` runs in Chrome and in Firefox, on the package of the stores:

```sh
npm run zip && npm run zip:firefox
BROWSER=chrome node tests/e2e/accessibility.test.mjs
BROWSER=firefox node tests/e2e/accessibility.test.mjs
```

- **axe-core** scans the popup, the options, the board and the drawer of an application, in the light and the dark look, with an own
  theme open, and in the three vision modes, for what a machine can tell of WCAG 2.2 AA and of the best practices: names of the
  controls, roles, contrast, landmarks, headings, target size. The suite fails on any finding.
- **The keyboard**: the title of a card is a button; Enter opens the drawer, Escape closes it, and the focus comes back to the title.
- **The size of the window**: 1024 pixels is the smallest, 1280 the usual one and 1920 the largest it is made for. At each, no page
  scrolls sideways; from 1200 pixels of page (a window of 1280 minus its frame) the six columns that come with the extension are all seen, and the
  sections of the options are in two columns (one below).

A machine finds about a third of the problems: it does not replace a read with a screen reader and a use with the keyboard alone.

## How the pages are made

- **Controls.** The form components of the library draw a label whose `for` does not point at the control, and a select has none.
  `src/app/fieldAccessibility.ts` gives every `FormInput`, `FormSelect` and `FormTextarea` an `id` its label points at. Where the page
  shows no label, the field takes `data-label="…"` (translated) and the control gets it as its `aria-label`.
- **A link that skips the header** is the first stop of the keyboard on every page; it puts the focus on the `main` element.
- **Errors tied to their field.** A message of error (`role="alert"` with the class `error`) is also tied to the field it is about:
  `src/app/fieldErrors.ts` gives that field `aria-describedby` and `aria-invalid`, and takes them back when the message goes. The
  pages show the message where the error is, so the field is the last control that had the focus in the same block, else the one
  just before the message.
- **Messages.** An error is `role="alert"`, a confirmation or a state `role="status"`: a screen reader says them when they appear.
- **The board.** Each column is a region named by its heading. A card is an article with one button (its title); the card as a whole
  opens with a click. A card can be dragged, and the same move is done without dragging from the status field of the drawer
  (WCAG 2.5.7). The star of a favourite is an image with a name, the shape of a colour-blind mode is hidden from screen readers.
- **The drawer** is a native `dialog` opened as a modal: the page behind is inert, Escape closes it and the focus comes back.
- **Targets.** A checkbox or a radio button is 20 pixels with 3 around it, which is 24 (WCAG 2.5.8).
- **Colour.** The text of the pills of the footer is the text colour of the page; only their icons take the colour of the pill. A
  custom theme is checked for contrast as the user chooses it (`docs/formats.md`).
- **Vision and contrast** are two settings that combine. The vision (`data-vision`) is standard, red-green, blue-yellow or monochrome
  (no colour). The contrast (`data-contrast`) is `auto` (default), `standard` or `high`: `auto` takes the high contrast when the
  system asks for more (`prefers-contrast: more`) or forces its colours (`forced-colors: active`). It is done in the style sheet
  alone, with no script to listen to the system. The colours of the high contrast are `!important`, so that a custom theme does
  not take them back: a need comes before a taste.
- **Colours checked, not guessed.** The colours of the messages (success, warning, error, information) of each look and each
  vision keep 4.5:1 against their surface, and the ones of the columns 3:1 against the light and the dark surface; the colours
  of a colour-blind mode were chosen to stay apart under the simulation of protanopia, deuteranopia and tritanopia (Machado et
  al., 2009). The unit tests read the style sheet and fail under those ratios.
- **Forced colours.** The background of a badge is gone, so it gets a line; the cards and columns do too. The grey of what is
  disabled and of the hint of a field is the one of the system.
- **Keys.** Two kinds, both left to the user. The keys of the browser are commands of the extension (`commands` of the manifest):
  Alt+Shift+J saves the offer of the page (opens the popup) and Alt+Shift+L opens the board; they are suggested, never forced, and
  changed in the shortcuts of the browser. The keys of the pages are in `src/composables/useBoardShortcuts.ts`; they are off by default (a key made of one
  character can clash with a screen reader or the keyboard of the user) and the setting "Keyboard shortcuts in the pages" turns
  them on and off (WCAG 2.1.4). The arrows always work: they go from card to card and column to column (by what is on the
  screen, so reversed from right to left), and Shift with left or right moves the card to the neighbour column and says it.
  The other keys are set by the user in the options (`src/services/shortcutKeys.ts`), eight actions: the search, up, down, left,
  right, to open the card, and the move of the card to the left or to the right. They do nothing while someone types or chooses in a field (also an editable part or what plays the role of a field), while a word is being composed with an input method, while
  the drawer or a question is open, or with Control, Alt or Meta held, which are the keys of the browser and of the screen reader.
- **A key is a place on the keyboard.** It is kept as `KeyboardEvent.code`, not as a letter: the A of a QWERTY keyboard is the Q of an
  AZERTY one, and the key stays where the hand has it when the layout changes. The defaults are drawn on QWERTY (F to find, W A S D to
  move, E to open the card, Shift with A or D to move it). A key shows the letter the keyboard of the person has, from `navigator.keyboard.getLayoutMap()`,
  which Chrome and Edge have and Firefox and Safari do not. Where the layout is not known there is no default key and none in use,
  since nobody could tell which keys they are: the person sets their own by pressing them, and the letter they pressed is kept to show.
- **Changing keys never blocks.** The options keep a draft: a key can be given to an action that has it already, to swap two keys
  one after the other; the clash is said and marked, and nothing is saved until it is put right, or the changes are discarded. A key the page
  keeps (Tab, Enter, Space, Escape, Backspace, the arrows, a key held with Control, Alt or Meta) is refused when pressed.
- **Colour is never alone.** A column has a shape in every vision mode but the standard, and always when the system forces its
  colours (the dot of the column draws its shape); a message of error or success has a sign (⚠, ✓) in the same cases. The sign
  has an empty alternative text, since the role of the message already tells it to a screen reader.
- **The spacing of letters** (WCAG 1.4.12) is left out in the scripts where it breaks the word: Arabic and the scripts written like
  it, and the Indic and South-East Asian scripts. The spacing of the words and of the lines stays. The page chooses by the language
  on its root element (`:lang()`).
- **Motion and text.** Movement follows the system and can be reduced; the text can be made larger and more spaced (up to 200%
  and the spacing of WCAG 1.4.12) and the pages hold.

## Layout

| Window | Board | Options | Drawer |
| :--- | :--- | :--- | :--- |
| 1024 px (smallest) | Columns of at least 12 rem; the board scrolls sideways beyond what fits | One column of 52 rem | 36 rem |
| 1280 px (usual) | The six columns of the extension, side by side | Two columns | 46 rem |
| 1920 px | Up to 120 rem wide, columns share the width | Two columns of up to 88 rem | 46 rem |
