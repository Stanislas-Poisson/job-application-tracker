import { COLUMN_COUNT, themeCss } from './customTheme'
import type { Accent, FontFamily, Settings, TextSpacing, Vision } from './settings'

// The colours of an accent are in assets/main.scss. Here is what the pages need to draw their choices.
export const ACCENT_SWATCHES: Record<Accent, string> = {
  slate: '#475569',
  blue: '#2563eb',
  teal: '#0d9488',
  green: '#16a34a',
  purple: '#7c3aed',
  pink: '#db2777',
  orange: '#ea580c',
}

// The palette of Okabe and Ito, made to be told apart by people with the usual kinds of colour blindness.
export const COLOUR_BLIND_PALETTE = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#56b4e9',
  '#d55e00',
  '#f0e442',
  '#000000',
]

// A shape for each column, so that the colour is never the only way to tell them apart.
export const SHAPES = ['●', '■', '▲', '◆', '★', '▼', '⬟', '✚']

// The colour of a column. The one the user chose, or one of the palette in a colour-blind mode.
export function statusColor(chosen: string, index: number, vision: Vision, customTheme = false): string {
  // A custom theme has the colours of its own for the columns, in every mode: the shapes still tell them apart.
  if (customTheme) {
    return `var(--column-${String(index % COLUMN_COUNT)})`
  }
  if ('red-green' === vision || 'blue-yellow' === vision) {
    return COLOUR_BLIND_PALETTE[index % COLOUR_BLIND_PALETTE.length] ?? chosen
  }
  return chosen
}

// The shape of a column, only in the modes that are made for people who cannot rely on the colour.
export function statusShape(index: number, vision: Vision): string {
  return 'standard' === vision ? '' : (SHAPES[index % SHAPES.length] ?? '')
}

// The fonts offered. Each is a first choice, always followed by the system fonts, so that a script the chosen font does not
// have (Arabic, Hebrew, Chinese, Japanese, Korean, Indic…) keeps a font that has its letters.
const SYSTEM_FONTS = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const FONTS: Record<Exclude<FontFamily, 'custom'>, string> = {
  system: SYSTEM_FONTS,
  serif: `Georgia, "Times New Roman", serif, ${SYSTEM_FONTS}`,
  mono: `ui-monospace, "Cascadia Code", Consolas, monospace, ${SYSTEM_FONTS}`,
}

export function fontStack(family: FontFamily, custom: string): string {
  const name = custom.trim()
  return 'custom' === family && '' !== name
    ? `"${name}", ${SYSTEM_FONTS}`
    : FONTS['custom' === family ? 'system' : family]
}

// The spacing of the text, in the terms of WCAG 1.4.12: line height, then letter and word spacing in em. "wcag" is the
// least that criterion asks a page to hold up to.
export const SPACINGS: Record<TextSpacing, { line: number; letter: number; word: number }> = {
  default: { line: 0, letter: 0, word: 0 },
  wide: { line: 1.5, letter: 0.05, word: 0.1 },
  wcag: { line: 1.5, letter: 0.12, word: 0.16 },
  widest: { line: 2, letter: 0.16, word: 0.25 },
}

type Looks = Pick<
  Settings,
  | 'theme'
  | 'accent'
  | 'vision'
  | 'customThemes'
  | 'customThemeId'
  | 'fontFamily'
  | 'fontCustom'
  | 'textScale'
  | 'textSpacing'
  | 'density'
  | 'motion'
>

// The custom theme in use is a style sheet of its own, last in the head, so that it wins over the accent and the vision modes:
// a custom theme comes with its own colours.
export function applyCustomTheme(root: HTMLElement, themes: Settings['customThemes'], id: string) {
  const theme = themes.find((candidate) => candidate.id === id)
  const doc = root.ownerDocument
  let sheet = doc.getElementById('jat-custom-theme')
  if (!theme) {
    root.removeAttribute('data-custom-theme')
    sheet?.remove()
    return
  }
  if (!sheet) {
    sheet = doc.createElement('style')
    sheet.id = 'jat-custom-theme'
    doc.head.append(sheet)
  }
  sheet.textContent = themeCss(theme)
  root.setAttribute('data-custom-theme', theme.id)
}

// Writes the choices on the root element: the style sheet answers to these attributes and custom properties.
export function applyAppearance(root: HTMLElement, settings: Looks) {
  if ('auto' === settings.theme) {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', settings.theme)
  }
  root.setAttribute('data-accent', settings.accent)
  root.setAttribute('data-vision', settings.vision)
  applyCustomTheme(root, settings.customThemes, settings.customThemeId)
  root.setAttribute('data-density', settings.density)
  root.setAttribute('data-motion', settings.motion)
  // The size is a share of the usual one, on the root: every size in rem follows, on top of the zoom of the browser.
  root.style.fontSize = `${String(settings.textScale)}%`
  root.style.setProperty('--jat-font', fontStack(settings.fontFamily, settings.fontCustom))
  const spacing = SPACINGS[settings.textSpacing]
  root.style.setProperty('--jat-line-height', 0 === spacing.line ? 'normal' : String(spacing.line))
  root.style.setProperty('--jat-letter-spacing', `${String(spacing.letter)}em`)
  root.style.setProperty('--jat-word-spacing', `${String(spacing.word)}em`)
}
