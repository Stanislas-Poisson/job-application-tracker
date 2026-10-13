import { useRepo } from 'pinia-orm'
import { describe, expect, it } from 'vitest'
import { Company, Tag } from '../../src/models'
import { findOrCreateCompany } from '../../src/services/applications'
import { createTag } from '../../src/services/tags'
import { collatorFor, fold, nfc, sameText, searchWords } from '../../src/utils/text'
import { freshStore } from './helpers'

describe('typed text', () => {
  it('stores one form of Unicode: é typed as one character or as e and an accent is the same text', () => {
    const composed = 'é'
    const decomposed = 'é'
    expect(composed).not.toBe(decomposed)
    expect(nfc(decomposed)).toBe(composed)
  })

  it('folds the case, the accents and the spaces', () => {
    expect(fold('  Éléonore   DUPONT ')).toBe('eleonore dupont')
    expect(sameText('Société Générale', 'societe  generale')).toBe(true)
    expect(sameText('Acme', 'Acme Corp')).toBe(false)
    // The same text typed in two forms of Unicode.
    expect(sameText('café', 'café')).toBe(true)
  })

  it('sorts by the rules of the language, numbers by their value, without minding the case or the accents', () => {
    const french = collatorFor('fr')
    expect(['zèbre', 'Zoo', 'élan', 'Eau', 'abri'].sort(french.compare)).toEqual([
      'abri',
      'Eau',
      'élan',
      'zèbre',
      'Zoo',
    ])
    expect(['item 10', 'item 9', 'item 1'].sort(french.compare)).toEqual(['item 1', 'item 9', 'item 10'])
    // In Swedish "ä" comes after "z".
    expect(['ä', 'z', 'a'].sort(collatorFor('sv').compare)).toEqual(['a', 'z', 'ä'])
  })

  it('cuts a search at the spaces', () => {
    expect(searchWords('  Éléonore   Développeur ', 'fr')).toEqual(['eleonore', 'developpeur'])
    expect(searchWords('', 'fr')).toEqual([])
  })

  it('cuts a search in a script with no spaces into words, where the browser knows how', () => {
    const words = searchWords('東京 ソフトウェア開発', 'ja')
    expect(words).toContain('東京')
    expect(words.length).toBeGreaterThan(2)
    expect(words.join('')).toBe('東京ソフトウェア開発')
    // Thai has no spaces between words either.
    expect(searchWords('วิศวกรซอฟต์แวร์', 'th').length).toBeGreaterThan(1)
  })
})

describe('what is stored and matched', () => {
  it('finds the company again whatever the case, the accents and the form of Unicode, and stores the name in one form', () => {
    freshStore()
    const first = findOrCreateCompany('Soci\u00e9t\u00e9 G\u00e9n\u00e9rale')
    expect(findOrCreateCompany('societe generale').id).toBe(first.id)
    expect(findOrCreateCompany('Socie\u0301te\u0301 Ge\u0301ne\u0301rale ').id).toBe(first.id)
    expect(useRepo(Company).all()).toHaveLength(1)
    const decomposed = findOrCreateCompany('Cafe\u0301 Noir')
    expect(decomposed.name).toBe('Caf\u00e9 Noir')
  })

  it('keeps one tag for names that differ by the accents or the form of Unicode', () => {
    freshStore()
    const tag = createTag('R\u00e9sum\u00e9')
    expect(createTag('resume').id).toBe(tag.id)
    expect(createTag('Re\u0301sume\u0301').id).toBe(tag.id)
    expect(useRepo(Tag).all()).toHaveLength(1)
  })
})
