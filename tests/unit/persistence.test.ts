import { useRepo } from 'pinia-orm'
import { describe, expect, it } from 'vitest'
import { Application, Status } from '../../src/models'
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
