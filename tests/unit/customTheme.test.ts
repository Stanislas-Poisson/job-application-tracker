import { describe, expect, it } from 'vitest'
import { applyAppearance } from '../../src/appearance'
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  MAX_NAME,
  MAX_THEMES,
  THEME_COLORS,
  contrastIssues,
  exportTheme,
  importTheme,
  newTheme,
  normalizeTheme,
  normalizeThemes,
  themeCss,
} from '../../src/customTheme'
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings'
import { contrastRatio } from '../../src/utils/contrast'

describe('custom themes', () => {
  it('keeps a theme, with the colours it has and the default for the ones that are not colours', () => {
    const theme = normalizeTheme({
      id: 't1',
      name: '  Mine  ',
      light: { background: '#FFEEDD', text: 'red', primary: '#123' },
      dark: { surface: '#000000' },
    })
    expect(theme?.name).toBe('Mine')
    expect(theme?.light.background).toBe('#ffeedd')
    expect(theme?.light.text).toBe(DEFAULT_LIGHT.text)
    expect(theme?.light.primary).toBe(DEFAULT_LIGHT.primary)
    expect(theme?.dark.surface).toBe('#000000')
    expect(theme?.dark.background).toBe(DEFAULT_DARK.background)
    expect(Object.keys(theme?.light ?? {}).sort()).toEqual([...THEME_COLORS].sort())
  })

  it('drops what is not a theme, an id met twice, and what is past the limit; the name is kept short', () => {
    expect(normalizeTheme(null)).toBeNull()
    expect(normalizeTheme({ id: '', name: 'x' })).toBeNull()
    expect(normalizeTheme({ id: 'a', name: '   ' })).toBeNull()
    expect(normalizeTheme({ id: 'a', name: 'x'.repeat(200) })?.name).toHaveLength(MAX_NAME)
    expect(normalizeThemes('nope')).toEqual([])
    expect(
      normalizeThemes([{ id: 'a', name: 'One' }, { id: 'a', name: 'Two' }, 3, { id: 'b', name: 'B' }]).map(
        (theme) => theme.name
      )
    ).toEqual(['One', 'B'])
    const many = Array.from({ length: MAX_THEMES + 5 }, (_, index) => ({ id: `t${String(index)}`, name: 'n' }))
    expect(normalizeThemes(many)).toHaveLength(MAX_THEMES)
  })

  it('makes the style sheet: light always, dark when the page is dark, only colours in it', () => {
    const css = themeCss(newTheme('Mine', 'm1'))
    expect(css).toContain(':root[data-custom-theme]{--background:#ffffff')
    expect(css).toContain(':root[data-custom-theme][data-theme="dark"]{--background:#0b1220')
    expect(css).toContain('@media (prefers-color-scheme:dark){:root[data-custom-theme]:not([data-theme="light"])')
    // A value that is not a colour never reaches a style.
    const hostile = themeCss({
      ...newTheme('x', 'x'),
      light: { ...DEFAULT_LIGHT, background: 'red;} body{display:none' },
    })
    expect(hostile).not.toContain('display:none')
    expect(hostile).toContain(`--background:${DEFAULT_LIGHT.background}`)
  })

  it('warns about the pairs of colours that do not stand apart, and says nothing for the defaults', () => {
    expect(contrastIssues(DEFAULT_LIGHT)).toEqual([])
    expect(contrastIssues(DEFAULT_DARK)).toEqual([])
    const issues = contrastIssues({ ...DEFAULT_LIGHT, text: '#cccccc' })
    expect(issues.map((issue) => `${issue.color}/${issue.against}`)).toEqual(['text/background', 'text/surface'])
    expect(issues[0]?.ratio).toBeLessThan(4.5)
    expect(issues[0]?.needed).toBe(4.5)
    expect(contrastRatio(DEFAULT_LIGHT.border, DEFAULT_LIGHT.background)).toBeGreaterThanOrEqual(3)
  })

  it('goes to a file and comes back as a theme with a new id', () => {
    const theme = { ...newTheme('Warm', 'old-id'), light: { ...DEFAULT_LIGHT, primary: '#aa3300' } }
    const file = exportTheme(theme)
    expect(file).not.toContain('old-id')
    const back = importTheme(file, 'new-id')
    expect(back).toMatchObject({ id: 'new-id', name: 'Warm' })
    expect(back.light.primary).toBe('#aa3300')
    expect(() => importTheme('nope')).toThrow('theme-file')
    expect(() => importTheme('{"app":"other","name":"x"}')).toThrow('theme-file')
    expect(() => importTheme('{"app":"job-application-tracker-theme"}')).toThrow('theme-file')
  })

  it('is part of the settings; a theme in use that is gone is none', () => {
    const theme = newTheme('Mine', 'm1')
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, customThemes: [theme], customThemeId: 'm1' }).customThemeId).toBe(
      'm1'
    )
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, customThemes: [theme], customThemeId: 'gone' }).customThemeId).toBe(
      ''
    )
    expect(normalizeSettings({}).customThemes).toEqual([])
  })

  it('is put on the page as a style sheet after the others, and taken off with no theme', () => {
    const theme = newTheme('Mine', 'm1')
    const root = document.documentElement
    const base = { ...DEFAULT_SETTINGS, customThemes: [theme] }
    applyAppearance(root, { ...base, customThemeId: 'm1' })
    expect(root.getAttribute('data-custom-theme')).toBe('m1')
    const sheet = document.getElementById('jat-custom-theme')
    expect(sheet?.textContent).toContain('--primary:#2563eb')
    expect(document.head.lastElementChild).toBe(sheet)
    // Applied again: one sheet, not two.
    applyAppearance(root, { ...base, customThemeId: 'm1' })
    expect(document.querySelectorAll('#jat-custom-theme')).toHaveLength(1)
    applyAppearance(root, { ...base, customThemeId: '' })
    expect(root.hasAttribute('data-custom-theme')).toBe(false)
    expect(document.getElementById('jat-custom-theme')).toBeNull()
  })
})

describe('colours of the columns', () => {
  it('are in the style sheet, one variable per column', () => {
    const css = themeCss(newTheme('x', 'a'))
    expect(css).toContain('--column-0:#0072b2')
    expect(css).toContain('--column-7:#334155')
  })

  it('reach the contrast of the lines on both looks, as they come', () => {
    expect(contrastIssues(DEFAULT_LIGHT)).toEqual([])
    expect(contrastIssues(DEFAULT_DARK)).toEqual([])
  })

  it('are checked against the background like the other colours', () => {
    const issues = contrastIssues({ ...DEFAULT_LIGHT, column3: '#ffff00' })
    expect(issues.map((issue) => issue.color)).toEqual(['column3'])
  })
})
