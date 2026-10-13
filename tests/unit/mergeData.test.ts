import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Application, Company, Source, Status, Trash } from '../../src/models'
import { captureOffer } from '../../src/services/applications'
import { exportData } from '../../src/services/data'
import { mergeData, planMerge } from '../../src/services/mergeData'
import { freshStore } from './helpers'

// The other computer's file: its default columns and sources have other ids (random on each install, in old versions).
function otherComputer(build: () => void) {
  freshStore()
  build()
  const file = exportData()
  file.data.statuses ??= []
  file.data.sources ??= []
  const rename = (list: unknown[], map: Record<string, string>) =>
    (list as Record<string, unknown>[]).map((record) => ({ ...record, id: map[String(record.id)] ?? record.id }))
  const statusIds = Object.fromEntries(
    file.data.statuses.map((s) => [(s as { id: string }).id, `rnd_${(s as { id: string }).id}`])
  )
  const sourceIds = Object.fromEntries(
    file.data.sources.map((s) => [(s as { id: string }).id, `rnd_${(s as { id: string }).id}`])
  )
  file.data.statuses = rename(file.data.statuses, statusIds)
  file.data.sources = rename(file.data.sources, sourceIds)
  file.data.applications = (file.data.applications as Record<string, unknown>[]).map((a) => ({
    ...a,
    statusId: statusIds[String(a.statusId)] ?? a.statusId,
  }))
  file.data.jobOffers = (file.data.jobOffers as Record<string, unknown>[]).map((o) => ({
    ...o,
    sourceId: sourceIds[String(o.sourceId)] ?? o.sourceId,
  }))
  return file
}

describe('merge of two computers', () => {
  let file: ReturnType<typeof exportData>

  beforeEach(() => {
    file = otherComputer(() => {
      captureOffer({ title: 'Remote job', companyName: 'Globex' })
    })
    freshStore()
  })

  it('adds what is missing, matches the default columns by key and makes the records follow', () => {
    captureOffer({ title: 'Local job', companyName: 'Acme' })
    const plan = planMerge(file)
    const row = (entity: string) => plan.models.find((model) => model.entity === entity)
    expect(row('applications')).toMatchObject({ incoming: 1, added: 1 })
    expect(row('statuses')).toMatchObject({ incoming: 6, matched: 6, added: 0 })
    expect(row('sources')).toMatchObject({ matched: 6, added: 0 })

    mergeData(file)
    expect(useRepo(Application).all()).toHaveLength(2)
    // No second set of columns, and the application points to the column that exists here.
    expect(useRepo(Status).all()).toHaveLength(6)
    expect(useRepo(Source).all()).toHaveLength(6)
    const remote = useRepo(Application)
      .all()
      .find((a) => 'Remote job' === useRepo(Application).with('jobOffer').find(a.id)?.jobOffer?.title)
    expect(remote?.statusId).toMatch(/^status_/)
  })

  it('changes nothing in the plan, and applying twice adds nothing more', () => {
    mergeData(file)
    const again = mergeData(file)
    expect(again.models.find((m) => 'applications' === m.entity)).toMatchObject({ added: 0, same: 1 })
    expect(useRepo(Application).all()).toHaveLength(1)
  })

  it('keeps the most recent version of a record that is on both sides', () => {
    mergeData(file)
    const id = useRepo(Company).all()[0]?.id ?? ''
    useRepo(Company).where('id', id).update({ updatedAt: '2025-01-01T00:00:00.000Z' })
    const older = JSON.parse(JSON.stringify(file))
    const newer = JSON.parse(JSON.stringify(file))
    ;(older.data.companies as Record<string, unknown>[])[0] = {
      ...(older.data.companies as Record<string, unknown>[])[0],
      name: 'Older',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }
    ;(newer.data.companies as Record<string, unknown>[])[0] = {
      ...(newer.data.companies as Record<string, unknown>[])[0],
      name: 'Newer',
      updatedAt: '2999-01-01T00:00:00.000Z',
    }
    expect(planMerge(older).models.find((m) => 'companies' === m.entity)).toMatchObject({ kept: 1, updated: 0 })
    mergeData(older)
    expect(useRepo(Company).find(id)?.name).not.toBe('Older')
    expect(planMerge(newer).models.find((m) => 'companies' === m.entity)).toMatchObject({ updated: 1 })
    mergeData(newer)
    expect(useRepo(Company).find(id)?.name).toBe('Newer')
  })

  it('never deletes, and does not bring back what was deleted here', () => {
    mergeData(file)
    const application = useRepo(Application).all()[0]
    const id = application?.id ?? ''
    useRepo(Application).destroy(id)
    useRepo(Trash).save({
      entity: 'applications',
      recordId: id,
      record: {},
      batch: 'b',
      deletedAt: '2026-01-01T00:00:00.000Z',
    })
    const plan = mergeData(file)
    expect(plan.models.find((m) => 'applications' === m.entity)).toMatchObject({ deleted: 1, added: 0 })
    expect(useRepo(Application).find(id)).toBeNull()
    // Records only stored here stay.
    captureOffer({ title: 'Only here', companyName: 'Initech' })
    mergeData(file)
    expect(
      useRepo(Company)
        .all()
        .some((c) => 'Initech' === c.name)
    ).toBe(true)
  })

  it('warns about possible duplicates: the same company or offer under another id', () => {
    const same = otherComputer(() => {
      captureOffer({ title: 'Dup', companyName: 'Acme', url: 'https://x.test/job/1' })
    })
    freshStore()
    captureOffer({ title: 'Dup', companyName: 'ACME ', url: 'https://x.test/job/1' })
    const plan = planMerge(same)
    expect(plan.duplicates.companies).toBe(1)
    expect(plan.duplicates.jobOffers).toBe(1)
  })

  it('refuses a file that is not an export, and a newer one, and touches nothing', () => {
    expect(() => mergeData({ foo: 1 })).toThrow(/not an export/)
    expect(() => planMerge({ app: 'job-application-tracker', schema: 999, data: {} })).toThrow(/newer/)
    expect(useRepo(Application).all()).toHaveLength(0)
  })
})
