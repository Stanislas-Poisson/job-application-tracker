// The symbol of a column or of a tag: one character, an emoji or a letter that the user chose. It is decoration: the name stays
// the text that is read, and the symbol is hidden from a screen reader.

// The longest a symbol may be, in UTF-16 units: an emoji can be a long sequence of joined characters (a family, a flag).
const MAX_LENGTH = 16

// The first thing a person sees as one character in the text, or null when there is none. What follows it is dropped: a
// symbol is one character.
export function normalizeSymbol(text: unknown): string | null {
  if ('string' !== typeof text) {
    return null
  }
  const trimmed = text.trim()
  if ('' === trimmed) {
    return null
  }
  const first =
    'function' === typeof Intl.Segmenter
      ? ([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)][0]?.segment ?? '')
      : (Array.from(trimmed)[0] ?? '')
  return '' === first || MAX_LENGTH < first.length ? null : first
}

const drawn = new Map<string, boolean>()

// Whether the fonts of this computer can draw the symbol. A character no font has is drawn as an empty box, as wide as the
// box of a character that does not exist, which is what is compared. Where nothing can be measured the symbol is kept.
export function isDrawable(symbol: string): boolean {
  const known = drawn.get(symbol)
  if (undefined !== known) {
    return known
  }
  let drawable = true
  try {
    const context = document.createElement('canvas').getContext('2d')
    if (context) {
      context.font = '32px sans-serif'
      const none = context.measureText('\u{10FFFF}').width
      drawable = 0 < context.measureText(symbol).width && context.measureText(symbol).width !== none
    }
  } catch {
    drawable = true
  }
  drawn.set(symbol, drawable)
  return drawable
}

// What to show in front of a name: the symbol of the user if the fonts can draw it, else the fallback (the shape of the
// colour-blind modes, or nothing).
export function symbolToShow(symbol: string | null | undefined, fallback = ''): string {
  return symbol && isDrawable(symbol) ? symbol : fallback
}
