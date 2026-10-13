import { describe, expect, it } from 'vitest'
import {
  LARGE_RATIO,
  TEXT_RATIO,
  contrastRatio,
  luminance,
  nearestAccessible,
  parseHex,
  toHex,
} from '../../src/utils/contrast'

describe('contrast', () => {
  it('reads and writes a colour', () => {
    expect(parseHex('#0072b2')).toEqual([0, 114, 178])
    expect(parseHex('#FFF')).toBeNull()
    expect(parseHex('blue')).toBeNull()
    expect(toHex([0, 114, 178])).toBe('#0072b2')
    expect(toHex([300, -4, 15.4])).toBe('#ff000f')
  })

  it('measures the ratio of WCAG: 21 for black on white, 1 for the same colour', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBe(0)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    // The usual reference: #767676 on white is just over 4.5.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.55)
    expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(4.4)
  })

  it('leaves a colour that is already enough', () => {
    expect(nearestAccessible('#000000', '#ffffff', TEXT_RATIO)).toBe('#000000')
  })

  it('moves a colour that is not enough to the nearest one that is, keeping its hue', () => {
    const fixed = nearestAccessible('#9aa5b1', '#ffffff', TEXT_RATIO)
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(TEXT_RATIO)
    // Moved as little as needed: one step lighter would not do.
    const [r, g, b] = parseHex(fixed) ?? [0, 0, 0]
    expect(b).toBeGreaterThanOrEqual(r)
    expect(fixed).not.toBe('#000000')
    // On a dark background the colour goes lighter.
    const light = nearestAccessible('#334155', '#0b1220', LARGE_RATIO)
    expect(contrastRatio(light, '#0b1220')).toBeGreaterThanOrEqual(LARGE_RATIO)
    expect(luminance(light)).toBeGreaterThan(luminance('#334155'))
    expect(g).toBeGreaterThan(0)
  })

  it('leaves a value that is not a colour', () => {
    expect(nearestAccessible('nope', '#ffffff', TEXT_RATIO)).toBe('nope')
  })
})
