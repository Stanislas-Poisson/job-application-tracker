import { useRepo } from 'pinia-orm'
import { describe, expect, it } from 'vitest'
import { Application, Tag, Trash } from '../../src/models'
import { createPersistence } from '../../src/persistence'
import { memoryAdapter } from '../../src/persistence/adapter'
import { captureOffer, deleteApplication } from '../../src/services/applications'
import { deleteWithUndo } from '../../src/services/undo'
import { freshStore } from './helpers'

describe('deleteWithUndo', () => {
  it('puts back what the deletion removed, with what went with it', async () => {
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, memoryAdapter(), { delay: 5 })
    await persistence.ready
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    await persistence.flush()
    const id = application.id

    const undo = await deleteWithUndo(persistence, () => deleteApplication(id))
    expect(useRepo(Application).find(id)).toBeNull()
    expect(useRepo(Trash).all().length).toBeGreaterThan(0)

    expect(await undo()).toBeGreaterThan(0)
    expect(useRepo(Application).find(id)).not.toBeNull()
    expect(useRepo(Trash).all()).toHaveLength(0)
    persistence.stop()
  })

  it('leaves what was in the trash before alone', async () => {
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, memoryAdapter(), { delay: 5 })
    await persistence.ready
    const first = captureOffer({ title: 'One', companyName: 'Acme' })
    const second = captureOffer({ title: 'Two', companyName: 'Beta' })
    await persistence.flush()
    await deleteWithUndo(persistence, () => deleteApplication(first.id))

    const undo = await deleteWithUndo(persistence, () => deleteApplication(second.id))
    await undo()

    expect(useRepo(Application).find(second.id)).not.toBeNull()
    expect(useRepo(Application).find(first.id)).toBeNull()
    expect(useRepo(Tag).all()).toBeDefined()
    persistence.stop()
  })
})
