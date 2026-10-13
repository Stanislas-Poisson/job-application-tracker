import { HEX, LARGE_RATIO, TEXT_RATIO, contrastRatio } from './utils/contrast'

// The colours of a custom theme: one set for the light look and one for the dark look.
export const THEME_COLORS = [
  'background',
  'surface',
  'text',
  'primary',
  'onPrimary',
  'success',
  'warning',
  'error',
  'border',
  // The colours of the columns of the board, in the order of the columns (the eighth is used again for the ninth...).
  'column1',
  'column2',
  'column3',
  'column4',
  'column5',
  'column6',
  'column7',
  'column8',
] as const
export type ThemeColor = (typeof THEME_COLORS)[number]
export const COLUMN_COLORS = THEME_COLORS.filter((name) => name.startsWith('column'))
export const COLUMN_COUNT = COLUMN_COLORS.length
export type ThemeColors = Record<ThemeColor, string>

export interface CustomTheme {
  id: string
  name: string
  light: ThemeColors
  dark: ThemeColors
}

export const MAX_THEMES = 20
export const MAX_NAME = 60

export const DEFAULT_LIGHT: ThemeColors = {
  background: '#ffffff',
  surface: '#f8fafc',
  text: '#0f172a',
  primary: '#2563eb',
  onPrimary: '#ffffff',
  success: '#15803d',
  warning: '#b45309',
  error: '#b91c1c',
  border: '#8896a8',
  column1: '#0072b2',
  column2: '#b35c00',
  column3: '#007a5a',
  column4: '#a8467f',
  column5: '#1a6fa8',
  column6: '#c04a00',
  column7: '#8a7a00',
  column8: '#334155',
}

export const DEFAULT_DARK: ThemeColors = {
  background: '#0b1220',
  surface: '#111a2e',
  text: '#e5e7eb',
  primary: '#60a5fa',
  onPrimary: '#0b1220',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  border: '#64748b',
  column1: '#56b4e9',
  column2: '#e69f00',
  column3: '#2fc29a',
  column4: '#e08cba',
  column5: '#7fb8ff',
  column6: '#ff8a4c',
  column7: '#f0e442',
  column8: '#cbd5e1',
}

// A set of colours: each one is a colour of six hexadecimal digits, else the default for that colour.
function normalizeColors(raw: unknown, defaults: ThemeColors): ThemeColors {
  const source = 'object' === typeof raw && null !== raw ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(
    THEME_COLORS.map((color) => {
      const value = source[color]
      return [color, 'string' === typeof value && HEX.test(value) ? value.toLowerCase() : defaults[color]]
    })
  ) as ThemeColors
}

// A theme as it is stored: null for what is not one. The name is trimmed and kept short.
export function normalizeTheme(raw: unknown): CustomTheme | null {
  if ('object' !== typeof raw || null === raw) {
    return null
  }
  const source = raw as Record<string, unknown>
  const id = 'string' === typeof source.id ? source.id.trim() : ''
  const name = 'string' === typeof source.name ? source.name.trim().slice(0, MAX_NAME) : ''
  if ('' === id || 64 < id.length || '' === name) {
    return null
  }
  return {
    id,
    name,
    light: normalizeColors(source.light, DEFAULT_LIGHT),
    dark: normalizeColors(source.dark, DEFAULT_DARK),
  }
}

// The themes of the settings: what is not a theme is dropped, an id that comes twice is kept once, and there are not more than MAX_THEMES.
export function normalizeThemes(raw: unknown): CustomTheme[] {
  const seen = new Set<string>()
  const themes: CustomTheme[] = []
  for (const candidate of Array.isArray(raw) ? raw : []) {
    const theme = normalizeTheme(candidate)
    if (theme && !seen.has(theme.id)) {
      seen.add(theme.id)
      themes.push(theme)
    }
  }
  return themes.slice(0, MAX_THEMES)
}

export function newTheme(name: string, id: string = crypto.randomUUID()): CustomTheme {
  return { id, name: name.trim().slice(0, MAX_NAME) || 'Theme', light: { ...DEFAULT_LIGHT }, dark: { ...DEFAULT_DARK } }
}

// The custom properties of the page for one set of colours. Only validated colours reach here, so nothing else can get into a style.
const declarations = (colors: ThemeColors): string =>
  [
    ['--background', colors.background],
    ['--on-background', colors.text],
    ['--surface', colors.surface],
    ['--on-surface', colors.text],
    ['--primary', colors.primary],
    ['--on-primary', colors.onPrimary],
    ['--zk-success', colors.success],
    ['--zk-warning', colors.warning],
    ['--error', colors.error],
    ['--zk-border', colors.border],
    ...COLUMN_COLORS.map((name, index) => [`--column-${String(index)}`, colors[name]]),
  ]
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

/**
 * The style sheet of a theme: the light colours always, the dark ones when the page is dark (chosen, or the system's when
 * the theme is left to the system). The page answers to `data-custom-theme` on the root element.
 */
export function themeCss(theme: CustomTheme): string {
  const light = normalizeColors(theme.light, DEFAULT_LIGHT)
  const dark = normalizeColors(theme.dark, DEFAULT_DARK)
  return [
    `:root[data-custom-theme]{${declarations(light)}}`,
    `:root[data-custom-theme][data-theme="dark"]{${declarations(dark)}}`,
    `@media (prefers-color-scheme:dark){:root[data-custom-theme]:not([data-theme="light"]){${declarations(dark)}}}`,
  ].join('\n')
}

// The pairs of colours that must stand apart, and how much: 4.5 for the text, 3 for the lines and for large things.
export const CONTRAST_PAIRS: readonly { color: ThemeColor; against: ThemeColor; ratio: number }[] = [
  { color: 'text', against: 'background', ratio: TEXT_RATIO },
  { color: 'text', against: 'surface', ratio: TEXT_RATIO },
  { color: 'onPrimary', against: 'primary', ratio: TEXT_RATIO },
  { color: 'error', against: 'background', ratio: TEXT_RATIO },
  { color: 'primary', against: 'background', ratio: LARGE_RATIO },
  { color: 'border', against: 'background', ratio: LARGE_RATIO },
  { color: 'success', against: 'background', ratio: LARGE_RATIO },
  { color: 'warning', against: 'background', ratio: LARGE_RATIO },
  ...COLUMN_COLORS.map((color) => ({ color, against: 'background' as const, ratio: LARGE_RATIO })),
]

export interface ContrastIssue {
  color: ThemeColor
  against: ThemeColor
  ratio: number
  needed: number
}

// What a set of colours does not reach, to warn the user as they choose.
export function contrastIssues(colors: ThemeColors): ContrastIssue[] {
  return CONTRAST_PAIRS.flatMap(({ color, against, ratio: needed }) => {
    const ratio = contrastRatio(colors[color], colors[against])
    return ratio < needed ? [{ color, against, ratio, needed }] : []
  })
}

export const THEME_FILE = 'job-application-tracker-theme'

// A theme in a file to share it: the name and the colours, without the id (the one who imports it gets a new one).
export function exportTheme(theme: CustomTheme): string {
  return JSON.stringify({ app: THEME_FILE, name: theme.name, light: theme.light, dark: theme.dark }, null, 2)
}

// A theme from a file. Throws for what is not one; a colour that is not valid is the default for it, as when stored.
export function importTheme(text: string, id: string = crypto.randomUUID()): CustomTheme {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('theme-file')
  }
  const source = 'object' === typeof raw && null !== raw ? (raw as Record<string, unknown>) : {}
  const theme = THEME_FILE === source.app ? normalizeTheme({ ...source, id }) : null
  if (!theme) {
    throw new Error('theme-file')
  }
  return theme
}
