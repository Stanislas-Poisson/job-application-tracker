import { describe, expect, it } from 'vitest'
import { isDrawable, normalizeSymbol, symbolToShow } from '../../src/services/symbol'

describe('normalizeSymbol', () => {
  it('keeps one character: a letter, a sign, an emoji', () => {
    expect(normalizeSymbol('★')).toBe('★')
    expect(normalizeSymbol('A')).toBe('A')
    expect(normalizeSymbol('🚀')).toBe('🚀')
    expect(normalizeSymbol('  ✔ ')).toBe('✔')
  })

  it('keeps an emoji made of several characters whole, and drops what follows the first character', () => {
    expect(normalizeSymbol('👩‍💻')).toBe('👩‍💻')
    expect(normalizeSymbol('🇫🇷')).toBe('🇫🇷')
    expect(normalizeSymbol('é')).toBe('é')
    expect(normalizeSymbol('ab')).toBe('a')
    expect(normalizeSymbol('★ star')).toBe('★')
  })

  it('is none for nothing, spaces and what is not text', () => {
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('   ')).toBeNull()
    expect(normalizeSymbol(null)).toBeNull()
    expect(normalizeSymbol(42)).toBeNull()
  })
})

describe('symbolToShow', () => {
  it('shows the symbol of the user, else the fallback', () => {
    expect(symbolToShow('★', '●')).toBe('★')
    expect(symbolToShow(null, '●')).toBe('●')
    expect(symbolToShow('', '●')).toBe('●')
    expect(symbolToShow(undefined)).toBe('')
  })

  it('keeps a symbol where nothing can be measured', () => {
    expect(isDrawable('★')).toBe(true)
  })
})
