import { useRepo } from 'pinia-orm'
import { describe, expect, it } from 'vitest'
import { Application, Company, Status } from '../../src/models'
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
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect((adapter.data[keyOf('applications')] as unknown[]).length).toBe(1)
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
    const wait = () => new Promise((resolve) => setTimeout(resolve, 5))
    const stored = () => adapter.data[keyOf('companies')] as { name: string }[]

    const company = useRepo(Company).save({ name: 'Acme' })
    await wait()
    expect(stored().map((record) => record.name)).toEqual(['Acme'])

    useRepo(Company).where('id', company.id).update({ name: 'Acme 2' })
    await wait()
    expect(stored().map((record) => record.name)).toEqual(['Acme 2'])

    useRepo(Company).destroy(company.id)
    await wait()
    expect(stored()).toEqual([])
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
    const adapter = lateEchoAdapter(10)
    // The second change is still waiting to be written when the echo of the first arrives.
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 50 })
    await persistence.ready
    await new Promise((resolve) => setTimeout(resolve, 20))

    useRepo(Company).save({ name: 'A' })
    await persistence.flush()
    // The storage has told the page about its own write; a change is made before the page has read it back.
    useRepo(Company).save({ name: 'B' })
    await new Promise((resolve) => setTimeout(resolve, 120))

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
