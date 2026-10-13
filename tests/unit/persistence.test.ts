import { useRepo } from 'pinia-orm'
import { describe, expect, it, vi } from 'vitest'
import { Application, Company, Status, Trash } from '../../src/models'
import { SCHEMA_KEY, SCHEMA_VERSION, createPersistence, keyOf } from '../../src/persistence'
import { memoryAdapter } from '../../src/persistence/adapter'
import { captureOffer } from '../../src/services/applications'
import { freshStore } from './helpers'

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('persistence', () => {
  it('loads an empty storage, seeds the defaults and saves them', async () => {
    const adapter = memoryAdapter()
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, adapter, { delay: 5 })
    await persistence.ready

    expect(useRepo(Status).all()).toHaveLength(6)
    expect(adapter.data[SCHEMA_KEY]).toBe(SCHEMA_VERSION)
    expect((adapter.data[keyOf('statuses')] as unknown[]).length).toBe(6)
    persistence.stop()
  })

  it('saves a change after the delay, and only the models that changed', async () => {
    const adapter = memoryAdapter()
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, adapter, { delay: 5 })
    await persistence.ready
    const sourcesBefore = JSON.stringify(adapter.data[keyOf('sources')])

    captureOffer({ title: 'One', companyName: 'Acme' })
    await tick()

    expect((adapter.data[keyOf('applications')] as unknown[]).length).toBe(1)
    expect((adapter.data[keyOf('companies')] as unknown[]).length).toBe(1)
    expect(JSON.stringify(adapter.data[keyOf('sources')])).toBe(sourcesBefore)
    persistence.stop()
  })

  it('writes at once on flush', async () => {
    const adapter = memoryAdapter()
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, adapter, { delay: 60_000 })
    await persistence.ready

    captureOffer({ title: 'One', companyName: 'Acme' })
    await persistence.flush()

    expect((adapter.data[keyOf('applications')] as unknown[]).length).toBe(1)
    persistence.stop()
  })

  it('gives the saved data to a page that opens later', async () => {
    const adapter = memoryAdapter()
    const popup = freshStore({ seed: false })
    const first = createPersistence(popup, adapter, { delay: 5 })
    await first.ready
    captureOffer({ title: 'One', companyName: 'Acme' })
    await first.flush()

    const board = freshStore({ seed: false })
    const second = createPersistence(board, adapter, { delay: 5 })
    await second.ready

    expect(useRepo(Application, board).all()).toHaveLength(1)
    expect(useRepo(Status, board).all()).toHaveLength(6)
    first.stop()
    second.stop()
  })

  it('updates a page that is open when another page saves', async () => {
    const adapter = memoryAdapter()
    const board = freshStore({ seed: false })
    const boardPersistence = createPersistence(board, adapter, { delay: 5 })
    await boardPersistence.ready

    const popup = freshStore({ seed: false })
    const popupPersistence = createPersistence(popup, adapter, { delay: 5 })
    await popupPersistence.ready
    captureOffer({ title: 'One', companyName: 'Acme' })
    await popupPersistence.flush()
    await tick()

    expect(useRepo(Application, board).all()).toHaveLength(1)
    boardPersistence.stop()
    popupPersistence.stop()
  })

  it('does not write back what it just loaded', async () => {
    const adapter = memoryAdapter()
    const a = freshStore({ seed: false })
    const pa = createPersistence(a, adapter, { delay: 5 })
    await pa.ready
    captureOffer({ title: 'One', companyName: 'Acme' })
    await pa.flush()

    const b = freshStore({ seed: false })
    const pb = createPersistence(b, adapter, { delay: 5 })
    await pb.ready

    let writes = 0
    const set = adapter.set
    adapter.set = async (items) => {
      writes += 1
      return set(items)
    }
    await tick()
    await tick()

    expect(writes).toBe(0)
    pa.stop()
    pb.stop()
  })
})

describe('writing at once', () => {
  it('writes a change without waiting for a flush, as soon as the turn is over', async () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter)
    await persistence.ready

    captureOffer({ title: 'One', companyName: 'Acme' })
    // Not yet: the turn of the action is not over.
    expect((adapter.data[keyOf('applications')] as unknown[] | undefined) ?? []).toHaveLength(0)
    await vi.waitFor(() => expect((adapter.data[keyOf('applications')] as unknown[] | undefined)?.length).toBe(1))
    persistence.stop()
  })

  it('writes what one action changes in one write', async () => {
    const adapter = memoryAdapter()
    const set = adapter.set.bind(adapter)
    let writes = 0
    adapter.set = async (items) => {
      writes++
      return set(items)
    }
    const persistence = createPersistence(freshStore({ seed: false }), adapter)
    await persistence.ready
    writes = 0

    // An application, its offer, its company and its history, in a single action.
    captureOffer({ title: 'One', companyName: 'Acme' })
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(writes).toBe(1)
    persistence.stop()
  })

  it('writes a creation, a change and a deletion, each when it happens', async () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter)
    await persistence.ready
    const stored = () => adapter.data[keyOf('companies')] as { name: string }[]

    const company = useRepo(Company).save({ name: 'Acme' })
    await vi.waitFor(() => expect(stored().map((record) => record.name)).toEqual(['Acme']))

    useRepo(Company).where('id', company.id).update({ name: 'Acme 2' })
    await vi.waitFor(() => expect(stored().map((record) => record.name)).toEqual(['Acme 2']))

    useRepo(Company).destroy(company.id)
    await vi.waitFor(() => expect(stored()).toEqual([]))
    persistence.stop()
  })
})

// A storage that tells about a write a little after it was made, as a browser does.
function lateEchoAdapter(echoAfter: number) {
  const adapter = memoryAdapter()
  const onChanged = adapter.onChanged.bind(adapter)
  adapter.onChanged = (callback) => onChanged((keys) => void setTimeout(() => callback(keys), echoAfter))
  return adapter
}

describe('the echo of its own writes', () => {
  it('does not take back a change that was made after the write it answers', async () => {
    const adapter = lateEchoAdapter(30)
    // The second change is still waiting to be written when the echo of the first arrives.
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 150 })
    await persistence.ready
    await new Promise((resolve) => setTimeout(resolve, 20))

    useRepo(Company).save({ name: 'A' })
    await persistence.flush()
    // The storage has told the page about its own write; a change is made before the page has read it back.
    useRepo(Company).save({ name: 'B' })
    // Long enough for the echo (30 ms) and for the write that was waiting (150 ms) to both have happened.
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(
      useRepo(Company)
        .all()
        .map((company) => company.name)
        .sort()
    ).toEqual(['A', 'B'])
    expect((adapter.data[keyOf('companies')] as { name: string }[]).map((company) => company.name).sort()).toEqual([
      'A',
      'B',
    ])
    persistence.stop()
  })

  it('still takes a change that another page made', async () => {
    const adapter = memoryAdapter()
    const first = createPersistence(freshStore({ seed: false }), adapter)
    await first.ready
    const other = freshStore({ seed: false })
    const second = createPersistence(other, adapter)
    await second.ready

    useRepo(Company, other).save({ name: 'From the other page' })
    await second.flush()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(
      useRepo(Company)
        .all()
        .map((company) => company.name)
    ).toContain('From the other page')
    first.stop()
    second.stop()
  })
})

// A storage that takes some time to apply a write and tells about it once it is applied, as a browser does.
function slowAdapter(applyAfter: number) {
  const inner = memoryAdapter()
  const listeners = new Set<(keys: string[]) => void>()
  return {
    data: inner.data,
    get: inner.get.bind(inner),
    clear: inner.clear.bind(inner),
    async set(items: Record<string, unknown>) {
      await new Promise((resolve) => setTimeout(resolve, applyAfter))
      Object.assign(inner.data, structuredClone(items))
      listeners.forEach((listener) => listener(Object.keys(items)))
    },
    onChanged(callback: (keys: string[]) => void) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}

describe('two writes in a row', () => {
  it('keeps the second change when the echo of the first comes back after the second was made', async () => {
    const adapter = slowAdapter(15)
    const persistence = createPersistence(freshStore({ seed: false }), adapter)
    await persistence.ready
    const company = useRepo(Company).save({ name: 'A' })
    await new Promise((resolve) => setTimeout(resolve, 40))

    // A favourite, then a priority, a moment apart: the first write is still being applied when the second is made.
    useRepo(Company).where('id', company.id).update({ name: 'B' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    useRepo(Company).where('id', company.id).update({ name: 'C' })

    // The echo of the first write arrives while the second is not applied yet. Nothing may go back to 'B'.
    const seen: string[] = []
    const stop = setInterval(() => seen.push(useRepo(Company).find(company.id)?.name ?? ''), 2)
    await new Promise((resolve) => setTimeout(resolve, 80))
    clearInterval(stop)

    expect(seen).not.toContain('B')
    expect(useRepo(Company).find(company.id)?.name).toBe('C')
    expect((adapter.data[keyOf('companies')] as { name: string }[])[0]?.name).toBe('C')
    persistence.stop()
  })
})

describe('several pages on one storage', () => {
  const names = (records: unknown) => (records as { name: string }[]).map((record) => record.name).sort()
  const stored = (adapter: ReturnType<typeof memoryAdapter>) => adapter.data[keyOf('companies')]
  // What another page does: it writes to the storage, which tells every page.
  const otherPage = (
    adapter: ReturnType<typeof memoryAdapter>,
    change: (records: Record<string, unknown>[]) => Record<string, unknown>[]
  ) =>
    adapter.set({
      [keyOf('companies')]: change([
        ...((adapter.data[keyOf('companies')] as Record<string, unknown>[] | undefined) ?? []),
      ]),
    })

  const setup = async () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 20 })
    await persistence.ready
    useRepo(Company).save({ id: 'a', name: 'A' })
    useRepo(Company).save({ id: 'b', name: 'B' })
    await persistence.flush()
    return { adapter, persistence }
  }

  it('does not erase what another page wrote and this one has not seen yet', async () => {
    const { adapter, persistence } = await setup()

    // Another page renames A. The storage holds it, and this page has not read it: nothing told it yet.
    adapter.data[keyOf('companies')] = (adapter.data[keyOf('companies')] as { id: string; name: string }[]).map(
      (record) => ('a' === record.id ? { ...record, name: 'A by the other page' } : record)
    )

    // This page renames B and saves. Its copy still says "A": it must not put it back.
    useRepo(Company).where('id', 'b').update({ name: 'B by this page' })
    await persistence.flush()

    expect(names(stored(adapter))).toEqual(['A by the other page', 'B by this page'])
    // And it has taken in the change of the other page.
    expect(
      useRepo(Company)
        .all()
        .map((company) => company.name)
        .sort()
    ).toEqual(['A by the other page', 'B by this page'])
    persistence.stop()
  })

  it('keeps a record another page made, and one it removed, when this page saves', async () => {
    const { adapter, persistence } = await setup()
    adapter.data[keyOf('companies')] = [
      { id: 'a', name: 'A', updatedAt: null },
      { id: 'c', name: 'C made by the other page', updatedAt: null },
    ]

    useRepo(Company).save({ id: 'd', name: 'D made here' })
    await persistence.flush()

    // B was removed by the other page and not touched here; C is new there; D is new here.
    expect(names(stored(adapter))).toEqual(['A', 'C made by the other page', 'D made here'])
    expect(
      useRepo(Company)
        .all()
        .map((company) => company.name)
        .sort()
    ).toEqual(['A', 'C made by the other page', 'D made here'])
    persistence.stop()
  })

  it('takes in the write of another page when it is told, and keeps what it has changed since its last write', async () => {
    const { adapter, persistence } = await setup()

    // A change here that waits to be written...
    useRepo(Company).where('id', 'b').update({ name: 'B by this page' })
    // ...and, before it goes out, another page writes (the storage tells this one).
    await otherPage(adapter, (records) =>
      records.map((record) => ('a' === record.id ? { ...record, name: 'A by the other page' } : record))
    )
    await vi.waitFor(() => expect(names(stored(adapter))).toEqual(['A by the other page', 'B by this page']))
    await vi.waitFor(() =>
      expect(
        useRepo(Company)
          .all()
          .map((company) => company.name)
          .sort()
      ).toEqual(['A by the other page', 'B by this page'])
    )
    persistence.stop()
  })

  it('removes a record another page removed, when this page did not touch it', async () => {
    const { adapter, persistence } = await setup()
    await otherPage(adapter, (records) => records.filter((record) => 'b' !== record.id))

    await vi.waitFor(() =>
      expect(
        useRepo(Company)
          .all()
          .map((company) => company.name)
      ).toEqual(['A'])
    )
    // It was not this page that removed it: nothing goes to its trash.
    expect(useRepo(Trash).all()).toHaveLength(0)
    persistence.stop()
  })

  it('keeps the change made last when both pages changed the same record', async () => {
    const { adapter, persistence } = await setup()
    const company = useRepo(Company).find('a')
    useRepo(Company).where('id', 'a').update({ name: 'A here', updatedAt: '2026-10-02T00:00:00.000Z' })
    adapter.data[keyOf('companies')] = (adapter.data[keyOf('companies')] as { id: string; name: string }[]).map(
      (record) => ('a' === record.id ? { ...record, name: 'A there', updatedAt: '2026-10-03T00:00:00.000Z' } : record)
    )
    await persistence.flush()
    expect(company).not.toBeNull()

    expect(names(stored(adapter))).toEqual(['A there', 'B'])
    persistence.stop()
  })

  it('does not lose a change to a removal made by another page', async () => {
    const { adapter, persistence } = await setup()
    adapter.data[keyOf('companies')] = (adapter.data[keyOf('companies')] as { id: string }[]).filter(
      (record) => 'a' !== record.id
    )

    useRepo(Company).where('id', 'a').update({ name: 'A changed here' })
    await persistence.flush()

    expect(names(stored(adapter))).toEqual(['A changed here', 'B'])
    persistence.stop()
  })

  it('never writes two things at once: the writes and the reads wait for one another', async () => {
    const adapter = memoryAdapter()
    const set = adapter.set.bind(adapter)
    let running = 0
    let overlapped = false
    adapter.set = async (items) => {
      running++
      overlapped ||= 1 < running
      await new Promise((resolve) => setTimeout(resolve, 15))
      running--
      return set(items)
    }
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 0 })
    await persistence.ready

    for (let index = 0; 5 > index; index++) {
      useRepo(Company).save({ name: `Company ${String(index)}` })
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    await persistence.flush()
    await vi.waitFor(() => expect((stored(adapter) as unknown[]).length).toBe(5))
    expect(overlapped).toBe(false)
    persistence.stop()
  })
})
