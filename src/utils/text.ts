// Typed text: how it is stored, compared, searched and sorted, whatever the language.

// One form of Unicode for what is stored: "é" typed as one character or as an "e" and an accent is the same text.
export const nfc = (value: string): string => value.normalize('NFC')

// Text to compare or search in: lower case (by the rules of Unicode, not of a language), with no accent, one space between
// the words. "Éléonore" and "eleonore" are the same.
export const fold = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

// Two texts that differ only by the case, the accents or the spaces around.
export const sameText = (a: string, b: string): boolean => fold(a) === fold(b)

// The order of words in a language: "é" after "e" in French, "ä" after "z" in Swedish, "10" after "9".
export const collatorFor = (locale: string): Intl.Collator =>
  new Intl.Collator(locale, { sensitivity: 'base', numeric: true })

// The scripts that put no space between words.
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/**
 * The words of what is searched. Words are cut at the spaces; a text in a script with no spaces (Chinese, Japanese, Thai…)
 * is cut by the rules of the language (`Intl.Segmenter`) where the browser has them, else it stays whole.
 */
export function searchWords(query: string, locale: string): string[] {
  const folded = fold(query)
  if (!UNSPACED.test(folded) || 'function' !== typeof Intl.Segmenter) {
    return folded.split(' ').filter(Boolean)
  }
  const words: string[] = []
  for (const part of folded.split(' ')) {
    if (!UNSPACED.test(part)) {
      words.push(part)
      continue
    }
    for (const { segment, isWordLike } of new Intl.Segmenter(locale, { granularity: 'word' }).segment(part)) {
      if (isWordLike) {
        words.push(segment)
      }
    }
  }
  return words.filter(Boolean)
}
