import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Status } from '../../src/models'
import { captureOffer } from '../../src/services/applications'
import { EXPORT_APP, exportData, importData, wipeData } from '../../src/services/data'
import { freshStore } from './helpers'

describe('export and import', () => {
  beforeEach(() => {
    freshStore()
  })

  it('exports every model and imports it back into an empty store', () => {
    captureOffer({ title: 'One', companyName: 'Acme', statusKey: 'applied' })
    const file = JSON.parse(JSON.stringify(exportData()))

    expect(file.app).toBe(EXPORT_APP)
    expect(Object.keys(file.data)).toHaveLength(14)

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
