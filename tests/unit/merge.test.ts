import { describe, expect, it } from 'vitest'
import { type Rec, changesBetween, merge3, recordsOf, sameSnapshot, snapshotOf } from '../../src/persistence/merge'

const rec = (id: string, extra: Record<string, unknown> = {}): Rec => ({ id, updatedAt: null, ...extra })
const snap = (...records: Rec[]) => snapshotOf(records)
const ids = (snapshot: ReturnType<typeof snap>) => recordsOf(snapshot).map((record) => record.id)
const merged = (base: Rec[], mine: Rec[], theirs: Rec[]) =>
  recordsOf(merge3(snap(...base), snap(...mine), snap(...theirs)))

describe('snapshots', () => {
  it('compare records and not their order or the order of their keys', () => {
    const one = snap(rec('a', { x: 1, y: 2 }), rec('b'))
    const two = snap(rec('b'), { y: 2, x: 1, updatedAt: null, id: 'a' })
    expect(sameSnapshot(one, two)).toBe(true)
    expect(sameSnapshot(one, snap(rec('a', { x: 1, y: 3 }), rec('b')))).toBe(false)
    expect(sameSnapshot(one, snap(rec('a', { x: 1, y: 2 })))).toBe(false)
    expect(sameSnapshot(snap(), snap())).toBe(true)
  })
})

describe('merge3', () => {
  it('keeps the change of this page and the change of another page, when they are on different records', () => {
    const base = [rec('a', { n: 0 }), rec('b', { n: 0 })]
    const result = merged(base, [rec('a', { n: 1 }), rec('b', { n: 0 })], [rec('a', { n: 0 }), rec('b', { n: 2 })])
    expect(result).toEqual([rec('a', { n: 1 }), rec('b', { n: 2 })])
  })

  it('takes what the storage holds for a record this page did not change', () => {
    const base = [rec('a', { n: 0 })]
    expect(merged(base, base, [rec('a', { n: 5 })])).toEqual([rec('a', { n: 5 })])
  })

  it('keeps what this page changed when the storage still holds the base', () => {
    const base = [rec('a', { n: 0 })]
    expect(merged(base, [rec('a', { n: 5 })], base)).toEqual([rec('a', { n: 5 })])
  })

  it('adds the records either side made, without doubling them', () => {
    const base = [rec('a')]
    const result = merged(base, [rec('a'), rec('mine')], [rec('a'), rec('theirs')])
    expect(result.map((record) => record.id).sort()).toEqual(['a', 'mine', 'theirs'])
    // Made the same on both sides: kept once.
    expect(merged([], [rec('same', { n: 1 })], [rec('same', { n: 1 })])).toEqual([rec('same', { n: 1 })])
  })

  it('removes a record that either side removed and the other left alone', () => {
    const base = [rec('a'), rec('b')]
    expect(ids(merge3(snap(...base), snap(rec('a')), snap(...base)))).toEqual(['a'])
    expect(ids(merge3(snap(...base), snap(...base), snap(rec('b'))))).toEqual(['b'])
    expect(ids(merge3(snap(...base), snap(rec('a')), snap(rec('a'))))).toEqual(['a'])
    expect(ids(merge3(snap(...base), snap(), snap()))).toEqual([])
  })

  it('lets the record changed last win when both changed it, and this page when it is a tie', () => {
    const base = [rec('a', { n: 0, updatedAt: '2026-10-01T00:00:00.000Z' })]
    const mine = [rec('a', { n: 1, updatedAt: '2026-10-02T00:00:00.000Z' })]
    const later = [rec('a', { n: 2, updatedAt: '2026-10-03T00:00:00.000Z' })]
    const sameMoment = [rec('a', { n: 3, updatedAt: '2026-10-02T00:00:00.000Z' })]
    expect(merged(base, mine, later)).toEqual(later)
    expect(merged(base, later, mine)).toEqual(later)
    expect(merged(base, mine, sameMoment)).toEqual(mine)
    // Never stamped on either side: this page wins.
    expect(merged([rec('a', { n: 0 })], [rec('a', { n: 1 })], [rec('a', { n: 2 })])).toEqual([rec('a', { n: 1 })])
  })

  it('does not lose a record to a removal that meets a change', () => {
    const base = [rec('a', { n: 0 })]
    // This page removed it, another changed it: it stays, as changed.
    expect(merged(base, [], [rec('a', { n: 9 })])).toEqual([rec('a', { n: 9 })])
    // Another removed it, this page changed it: it stays, as changed.
    expect(merged(base, [rec('a', { n: 7 })], [])).toEqual([rec('a', { n: 7 })])
  })

  it('puts the records in the order of the storage, then the ones only this page has', () => {
    const result = merged([], [rec('m1'), rec('c')], [rec('c'), rec('t1'), rec('t2')])
    expect(result.map((record) => record.id)).toEqual(['c', 't1', 't2', 'm1'])
  })

  it('merges nothing with nothing, and a first write into an empty storage', () => {
    expect(merged([], [], [])).toEqual([])
    expect(merged([], [rec('a')], [])).toEqual([rec('a')])
  })
})

describe('changesBetween', () => {
  it('says what to put and what to remove to go from one state to another', () => {
    const from = snap(rec('a', { n: 1 }), rec('b'), rec('c'))
    const to = snap(rec('a', { n: 2 }), rec('c'), rec('d'))
    const { put, remove } = changesBetween(from, to)
    expect(put.map((record) => record.id).sort()).toEqual(['a', 'd'])
    expect(remove).toEqual(['b'])
    expect(changesBetween(to, to)).toEqual({ put: [], remove: [] })
  })
})
