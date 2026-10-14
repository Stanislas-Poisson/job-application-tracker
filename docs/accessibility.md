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
- **Messages.** An error is `role="alert"`, a confirmation or a state `role="status"`: a screen reader says them when they appear.
- **The board.** Each column is a region named by its heading. A card is an article with one button (its title); the card as a whole
  opens with a click. A card can be dragged, and the same move is done without dragging from the status field of the drawer
  (WCAG 2.5.7). The star of a favourite is an image with a name, the shape of a colour-blind mode is hidden from screen readers.
- **The drawer** is a native `dialog` opened as a modal: the page behind is inert, Escape closes it and the focus comes back.
- **Targets.** A checkbox or a radio button is 20 pixels with 3 around it, which is 24 (WCAG 2.5.8).
- **Colour.** The text of the pills of the footer is the text colour of the page; only their icons take the colour of the pill. A
  custom theme is checked for contrast as the user chooses it (`docs/formats.md`).
- **Motion and text.** Movement follows the system and can be reduced; the text can be made larger and more spaced (up to 200%
  and the spacing of WCAG 1.4.12) and the pages hold.

## Layout

| Window | Board | Options | Drawer |
| :--- | :--- | :--- | :--- |
| 1024 px (smallest) | Columns of at least 12 rem; the board scrolls sideways beyond what fits | One column of 52 rem | 36 rem |
| 1280 px (usual) | The six columns of the extension, side by side | Two columns | 46 rem |
| 1920 px | Up to 120 rem wide, columns share the width | Two columns of up to 88 rem | 46 rem |
