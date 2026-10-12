import { describe, expect, it } from 'vitest'
import {
  ACCENT_SWATCHES,
  COLOUR_BLIND_PALETTE,
  SHAPES,
  applyAppearance,
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

describe('appearance', () => {
  it('writes the choices on the root element', () => {
    const root = document.createElement('html')
    applyAppearance(root, { theme: 'dark', accent: 'teal', vision: 'high-contrast' })

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.getAttribute('data-accent')).toBe('teal')
    expect(root.getAttribute('data-vision')).toBe('high-contrast')
  })

  it('leaves the theme to the system when it is "auto"', () => {
    const root = document.createElement('html')
    applyAppearance(root, { theme: 'dark', accent: 'blue', vision: 'standard' })
    applyAppearance(root, { theme: 'auto', accent: 'blue', vision: 'standard' })

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
