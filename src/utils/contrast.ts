// Contrast of colours, as WCAG 2 measures it: the ratio of the luminance of two colours, from 1 (the same) to 21 (black on white).

export const HEX = /^#[0-9a-f]{6}$/i

type Rgb = [number, number, number]

export function parseHex(hex: string): Rgb | null {
  if (!HEX.test(hex)) {
    return null
  }
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as Rgb
}

export const toHex = (rgb: Rgb): string =>
  `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

// Relative luminance (WCAG 2.x), 0 for black and 1 for white.
export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) {
    return 0
  }
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255
    return 0.039_28 >= value ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

// 4.5 for text, 3 for large text, lines and the edges of a control.
export const TEXT_RATIO = 4.5
export const LARGE_RATIO = 3

/**
 * The colour nearest to `color` (the same hue, moved toward black or white) that reaches `ratio` against `against`. It is
 * `color` itself when it already does. Of the two directions, the one that needs the smaller move is kept.
 */
export function nearestAccessible(color: string, against: string, ratio: number): string {
  const rgb = parseHex(color)
  if (!rgb || contrastRatio(color, against) >= ratio) {
    return color
  }
  let best: string | null = null
  for (const target of [0, 255]) {
    for (let step = 1; 100 >= step; step++) {
      const mixed = toHex(rgb.map((channel) => channel + ((target - channel) * step) / 100) as Rgb)
      if (contrastRatio(mixed, against) >= ratio) {
        if (null === best || step < Number(best.split(':')[1])) {
          best = `${mixed}:${String(step)}`
        }
        break
      }
    }
  }
  return null === best ? color : (best.split(':')[0] ?? color)
}
