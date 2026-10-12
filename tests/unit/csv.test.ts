import { describe, expect, it } from 'vitest'
import { csvRecords, parseCsv } from '../../src/utils/csv'

describe('csv', () => {
  it('reads rows with a comma', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('finds a semicolon, as a spreadsheet writes it in many countries, or a tab', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a quoted field with a separator, a quote and a line break inside', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ])
  })

  it('reads Windows line ends, a missing last line end and a byte order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('skips the lines that have nothing in them, and keeps an empty field', () => {
    expect(parseCsv('a,b\n\n1,\n,\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('gives records by the names of the first row, whatever their case, spaces or dashes', () => {
    expect(csvRecords('Occurred At,Contact_Email, Subject \n2026-10-12,ada@example.com,Hi')).toEqual([
      { occurredat: '2026-10-12', contactemail: 'ada@example.com', subject: 'Hi' },
    ])
  })

  it('has no record for an empty text', () => {
    expect(csvRecords('')).toEqual([])
  })
})
