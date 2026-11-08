import { describe, expect, it } from 'vitest'
import { sortRows } from '../../src/services/tableSort'

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const compare = (a: string, b: string) => collator.compare(a, b)
const rows = [
  { name: 'b10', n: 3 },
  { name: 'B2', n: null },
  { name: 'a', n: 1 },
  { name: 'c', n: 3 },
  { name: 'd', n: null },
]
const names = (list: typeof rows) => list.map((row) => row.name)

describe('the order of the rows of a table', () => {
  it('sorts texts by the language, numbers inside them by their value, and the case does not count', () => {
    expect(names(sortRows(rows, (row) => row.name, 'asc', compare))).toEqual(['a', 'B2', 'b10', 'c', 'd'])
    expect(names(sortRows(rows, (row) => row.name, 'desc', compare))).toEqual(['d', 'c', 'b10', 'B2', 'a'])
  })

  it('sorts numbers by their value, and puts what has no value last, whichever the way', () => {
    expect(names(sortRows(rows, (row) => row.n, 'asc', compare))).toEqual(['a', 'b10', 'c', 'B2', 'd'])
    expect(names(sortRows(rows, (row) => row.n, 'desc', compare))).toEqual(['b10', 'c', 'a', 'B2', 'd'])
  })

  it('keeps the order of equal rows, so that sorting again does not shuffle them', () => {
    const sorted = sortRows(rows, (row) => row.n, 'asc', compare)
    expect(names(sortRows(sorted, (row) => row.n, 'asc', compare))).toEqual(names(sorted))
  })

  it('does not change the rows it was given', () => {
    const before = names(rows)
    sortRows(rows, (row) => row.name, 'desc', compare)
    expect(names(rows)).toEqual(before)
  })
})
