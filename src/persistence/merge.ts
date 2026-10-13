import { canonicalJson } from '../utils/checksum'

// A stored record: an object with an id, and the moment of its last change (UTC, null when it was never stamped).
export type Rec = Record<string, unknown> & { id: string }

// The records of a kind of data by id, with each in a canonical text for comparing.
export type Snapshot = Map<string, { rec: Rec; json: string }>

export function snapshotOf(records: readonly Record<string, unknown>[]): Snapshot {
  const snapshot: Snapshot = new Map()
  for (const record of records) {
    const rec = record as Rec
    snapshot.set(String(rec.id), { rec, json: canonicalJson(rec) })
  }
  return snapshot
}

export const recordsOf = (snapshot: Snapshot): Rec[] => [...snapshot.values()].map((entry) => entry.rec)

// Whether two snapshots hold the same records (the order does not matter).
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const [id, entry] of a) {
    if (b.get(id)?.json !== entry.json) {
      return false
    }
  }
  return true
}

const stampOf = (rec: Rec): string => ('string' === typeof rec.updatedAt ? rec.updatedAt : '')

/**
 * Brings two sets of changes together. `base` is the state both sides started from (what the page last agreed with the
 * storage), `mine` is the state of this page, `theirs` is what the storage holds now (other pages may have written to it).
 *
 * Record by record, by id:
 * - only one side changed it (made, changed or removed): that side's version stands;
 * - both changed it: the one changed last (`updatedAt`) stands, mine when they are equal;
 * - one removed it and the other changed it: the record stays. A removal does not win against an edit: nothing is lost.
 * The order is the one of `theirs`, with the records only `mine` has after them.
 */
export function merge3(base: Snapshot, mine: Snapshot, theirs: Snapshot): Snapshot {
  const result: Snapshot = new Map()
  const decide = (id: string): { rec: Rec; json: string } | undefined => {
    const before = base.get(id)
    const own = mine.get(id)
    const other = theirs.get(id)
    const ownChanged = before?.json !== own?.json
    const otherChanged = before?.json !== other?.json
    if (!ownChanged) {
      return other
    }
    if (!otherChanged) {
      return own
    }
    // Both changed it.
    if (undefined === own || undefined === other) {
      return own ?? other
    }
    return stampOf(other.rec) > stampOf(own.rec) ? other : own
  }
  for (const id of theirs.keys()) {
    const kept = decide(id)
    if (kept) {
      result.set(id, kept)
    }
  }
  for (const id of mine.keys()) {
    if (!theirs.has(id)) {
      const kept = decide(id)
      if (kept) {
        result.set(id, kept)
      }
    }
  }
  return result
}

// What to do to a store that holds `from` to make it hold `to`: the records to put (new or different) and the ids to remove.
export function changesBetween(from: Snapshot, to: Snapshot): { put: Rec[]; remove: string[] } {
  const put: Rec[] = []
  for (const [id, entry] of to) {
    if (from.get(id)?.json !== entry.json) {
      put.push(entry.rec)
    }
  }
  const remove = [...from.keys()].filter((id) => !to.has(id))
  return { put, remove }
}
