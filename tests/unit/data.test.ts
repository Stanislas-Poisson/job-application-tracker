import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Status } from '../../src/models'
import { captureOffer } from '../../src/services/applications'
import { EXPORT_APP, exportData, importData, planRestore, readExport, wipeData } from '../../src/services/data'
import { freshStore } from './helpers'

describe('export and import', () => {
  beforeEach(() => {
    freshStore()
  })

  it('exports every model and imports it back into an empty store', () => {
    captureOffer({ title: 'One', companyName: 'Acme', statusKey: 'applied' })
    const file = JSON.parse(JSON.stringify(exportData()))

    expect(file.app).toBe(EXPORT_APP)
    expect(Object.keys(file.data)).toHaveLength(17)

    freshStore({ seed: false })
    importData(file)

    expect(useRepo(Application).all()).toHaveLength(1)
    expect(useRepo(Status).all()).toHaveLength(6)
    expect(JSON.parse(JSON.stringify(exportData())).data).toEqual(file.data)
  })

  it('refuses what is not an export, and changes nothing', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })

    expect(() => importData({ foo: 'bar' })).toThrow(/not an export/)
    expect(() => importData(null)).toThrow(/not an export/)
    expect(() => importData({ app: EXPORT_APP, schema: 999, data: {} })).toThrow(/newer version/)
    expect(() => importData({ app: EXPORT_APP, schema: 1, data: { applications: 'no' } })).toThrow(/not a list/)
    expect(useRepo(Application).all()).toHaveLength(1)
  })

  it('wipes everything and puts the defaults back', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    wipeData()

    expect(useRepo(Application).all()).toHaveLength(0)
    expect(useRepo(Status).all()).toHaveLength(6)
  })
})

describe('planRestore', () => {
  beforeEach(() => {
    freshStore()
  })

  const diff = (plan: ReturnType<typeof planRestore>, entity: string) =>
    plan.models.find((model) => model.entity === entity)

  it('shows nothing to change for a backup of the data as it is', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    const plan = planRestore(JSON.parse(JSON.stringify(exportData())))

    expect(plan.models.every((model) => 0 === model.added && 0 === model.changed && 0 === model.lost)).toBe(true)
    expect(diff(plan, 'applications')).toMatchObject({ incoming: 1, same: 1 })
    expect(diff(plan, 'statuses')).toMatchObject({ incoming: 6, same: 6 })
  })

  it('counts what is new, what differs, and what is only stored here', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    const backup = JSON.parse(JSON.stringify(exportData()))

    // After the backup: one more offer, and the first one is moved.
    captureOffer({ title: 'Two', companyName: 'Globex' })
    useRepo(Application).where('id', application.id).update({ position: 9 })
    // And the backup holds an application that is not stored here.
    backup.data.applications.push({ ...backup.data.applications[0], id: 'from-the-backup' })

    const plan = planRestore(backup)
    expect(diff(plan, 'applications')).toEqual({
      entity: 'applications',
      incoming: 2,
      added: 1,
      changed: 1,
      same: 0,
      lost: 1,
    })
    expect(diff(plan, 'companies')).toMatchObject({ incoming: 1, same: 1, lost: 1 })
  })

  it('writes nothing', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    const backup = JSON.parse(JSON.stringify(exportData()))
    wipeData()
    const before = JSON.stringify(exportData().data)

    planRestore(backup)
    expect(JSON.stringify(exportData().data)).toBe(before)
  })

  it('reads a record of an older backup, with fields missing, like a stored one', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    const backup = JSON.parse(JSON.stringify(exportData()))
    // An older version did not know these fields.
    for (const application of backup.data.applications) {
      delete application.isFavorite
      delete application.priority
    }
    expect(diff(planRestore(backup), 'applications')).toMatchObject({ same: 1, changed: 0 })
  })

  it('knows the date of the backup and whether it has settings', () => {
    const backup = JSON.parse(JSON.stringify(exportData()))
    expect(planRestore(backup)).toMatchObject({ exportedAt: backup.exportedAt, hasSettings: false })
    expect(planRestore({ ...backup, settings: { theme: 'dark' } }).hasSettings).toBe(true)
    expect(planRestore({ ...backup, exportedAt: 12 }).exportedAt).toBeNull()
  })

  it('refuses what importData refuses', () => {
    expect(() => planRestore({ foo: 'bar' })).toThrow(/not an export/)
    expect(() => planRestore({ app: EXPORT_APP, schema: 1, data: null })).toThrow(/not an export/)
    expect(() => planRestore({ app: EXPORT_APP, schema: 999, data: {} })).toThrow(/newer version/)
    expect(() => readExport({ app: EXPORT_APP, schema: 1, data: { tags: 'no' } })).toThrow(/not a list/)
  })
})
