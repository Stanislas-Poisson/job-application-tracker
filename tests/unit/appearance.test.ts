import { describe, expect, it } from 'vitest'
import {
  ACCENT_SWATCHES,
  COLOUR_BLIND_PALETTE,
  SHAPES,
  SPACINGS,
  applyAppearance,
  fontStack,
  statusColor,
  statusShape,
} from '../../src/appearance'
import { memoryAdapter } from '../../src/persistence/adapter'
import {
  ACCENTS,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  VISIONS,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '../../src/settings'

describe('settings', () => {
  it('has the defaults when nothing is stored', async () => {
    expect(await loadSettings(memoryAdapter())).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps what is stored and fills what is missing, as when a later version adds a setting', () => {
    expect(normalizeSettings({ locale: 'fr' })).toEqual({ ...DEFAULT_SETTINGS, locale: 'fr' })
  })

  it('falls back on the default for a value that is not allowed, or for a stored value that is not an object', () => {
    expect(normalizeSettings({ theme: 'neon', accent: 'blue', vision: 7 })).toEqual({
      ...DEFAULT_SETTINGS,
      accent: 'blue',
    })
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('dark')).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps a valid time zone, and falls back on "auto" for one that does not exist', () => {
    expect(normalizeSettings({ timeZone: 'Europe/Paris' }).timeZone).toBe('Europe/Paris')
    expect(normalizeSettings({ timeZone: 'Mars/Olympus' }).timeZone).toBe('auto')
    expect(normalizeSettings({ timeZone: 3 }).timeZone).toBe('auto')
  })

  it('saves and loads back', async () => {
    const adapter = memoryAdapter()
    await saveSettings(adapter, { ...DEFAULT_SETTINGS, theme: 'dark', vision: 'red-green' })

    expect(adapter.data[SETTINGS_KEY]).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', vision: 'red-green' })
    expect((await loadSettings(adapter)).theme).toBe('dark')
  })

  it('has a swatch for every accent', () => {
    expect(Object.keys(ACCENT_SWATCHES).sort()).toEqual([...ACCENTS].sort())
  })
})

const LOOKS = {
  customThemes: [] as never[],
  customThemeId: '',
  fontFamily: 'system',
  fontCustom: '',
  textScale: 100,
  textSpacing: 'default',
  density: 'comfortable',
  motion: 'auto',
} as const

describe('text appearance', () => {
  it('writes the size as a share of the usual one, and the spacing in the terms of WCAG', () => {
    const root = document.createElement('html')
    applyAppearance(root, {
      ...LOOKS,
      theme: 'auto',
      accent: 'blue',
      vision: 'standard',
      textScale: 150,
      textSpacing: 'wcag',
    })
    expect(root.style.fontSize).toBe('150%')
    expect(root.style.getPropertyValue('--jat-line-height')).toBe('1.5')
    expect(root.style.getPropertyValue('--jat-letter-spacing')).toBe('0.12em')
    expect(root.style.getPropertyValue('--jat-word-spacing')).toBe('0.16em')
    // The usual spacing leaves the line height to the font.
    applyAppearance(root, { ...LOOKS, theme: 'auto', accent: 'blue', vision: 'standard' })
    expect(root.style.getPropertyValue('--jat-line-height')).toBe('normal')
    expect(SPACINGS.wcag).toEqual({ line: 1.5, letter: 0.12, word: 0.16 })
  })

  it('writes the density and the movement', () => {
    const root = document.createElement('html')
    applyAppearance(root, {
      ...LOOKS,
      theme: 'auto',
      accent: 'blue',
      vision: 'standard',
      density: 'compact',
      motion: 'reduce',
    })
    expect(root.getAttribute('data-density')).toBe('compact')
    expect(root.getAttribute('data-motion')).toBe('reduce')
  })

  it('always follows the chosen font by the system fonts, so that every script keeps its letters', () => {
    expect(fontStack('system', '')).toMatch(/^system-ui/)
    expect(fontStack('serif', '')).toMatch(/^Georgia.*serif.*system-ui/)
    expect(fontStack('mono', '')).toMatch(/monospace.*system-ui/)
    expect(fontStack('custom', ' Lexend ')).toBe('"Lexend", system-ui, -apple-system, "Segoe UI", sans-serif')
    // A custom font with no name is the system font.
    expect(fontStack('custom', '')).toMatch(/^system-ui/)
  })

  it('keeps only valid choices, and a font name that cannot break out of a style', () => {
    const read = (patch: Record<string, unknown>) => normalizeSettings({ ...DEFAULT_SETTINGS, ...patch })
    expect(
      read({ textScale: 175, fontFamily: 'serif', density: 'compact', motion: 'reduce', textSpacing: 'widest' })
    ).toMatchObject({
      textScale: 175,
      fontFamily: 'serif',
      density: 'compact',
      motion: 'reduce',
      textSpacing: 'widest',
    })
    expect(read({ textScale: 133, fontFamily: 'comic', density: 'tiny', motion: 'x', textSpacing: 'y' })).toMatchObject(
      {
        textScale: 100,
        fontFamily: 'system',
        density: 'comfortable',
        motion: 'auto',
        textSpacing: 'default',
      }
    )
    expect(read({ fontCustom: 'Atkinson Hyperlegible' }).fontCustom).toBe('Atkinson Hyperlegible')
    expect(read({ fontCustom: 'x"; } body { display:none' }).fontCustom).toBe('')
    expect(read({ fontCustom: 'a'.repeat(101) }).fontCustom).toBe('')
  })
})

describe('appearance', () => {
  it('writes the choices on the root element', () => {
    const root = document.createElement('html')
    applyAppearance(root, { ...LOOKS, theme: 'dark', accent: 'teal', vision: 'high-contrast' })

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-accent')).toBe('teal')
    expect(root.getAttribute('data-vision')).toBe('high-contrast')
  })

  it('leaves the theme to the system when it is "auto"', () => {
    const root = document.createElement('html')
    applyAppearance(root, { ...LOOKS, theme: 'dark', accent: 'blue', vision: 'standard' })
    applyAppearance(root, { ...LOOKS, theme: 'auto', accent: 'blue', vision: 'standard' })

    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('keeps the colour of the user in the standard and high-contrast modes', () => {
    expect(statusColor('#123456', 2, 'standard')).toBe('#123456')
    expect(statusColor('#123456', 2, 'high-contrast')).toBe('#123456')
  })

  it('takes the colours of the safe palette in the colour-blind modes, and wraps around', () => {
    for (const vision of ['red-green', 'blue-yellow'] as const) {
      expect(statusColor('#123456', 0, vision)).toBe(COLOUR_BLIND_PALETTE[0])
      expect(statusColor('#123456', COLOUR_BLIND_PALETTE.length + 1, vision)).toBe(COLOUR_BLIND_PALETTE[1])
    }
  })

  it('has no two columns with the same colour or the same shape in a colour-blind mode, for the usual six', () => {
    const colours = Array.from({ length: 6 }, (_, index) => statusColor('#000', index, 'red-green'))
    const shapes = Array.from({ length: 6 }, (_, index) => statusShape(index, 'red-green'))

    expect(new Set(colours).size).toBe(6)
    expect(new Set(shapes).size).toBe(6)
    expect(SHAPES.length).toBeGreaterThanOrEqual(6)
  })

  it('shows no shape in the standard mode, and one in every other mode', () => {
    expect(statusShape(0, 'standard')).toBe('')
    for (const vision of VISIONS.filter((candidate) => 'standard' !== candidate)) {
      expect(statusShape(0, vision)).not.toBe('')
    }
  })
})
