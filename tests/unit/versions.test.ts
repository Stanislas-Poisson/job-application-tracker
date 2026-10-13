import { useRepo } from 'pinia-orm'
import { describe, expect, it } from 'vitest'
import { Application, Company, Contact, Note, Source, Trash } from '../../src/models'
import { TRASH_DAYS, createPersistence, keyOf } from '../../src/persistence'
import { memoryAdapter } from '../../src/persistence/adapter'
import { MIGRATIONS, SCHEMA_KEY, SCHEMA_VERSION, isKnownVersion, migrate } from '../../src/persistence/schema'
import { addNote, captureOffer, deleteApplication } from '../../src/services/applications'
import { EXPORT_APP, exportData, importData, planRestore, readExport } from '../../src/services/data'
import { emptyTrash, listTrash, restoreFromTrash } from '../../src/services/trash'
import { freshStore } from './helpers'

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('the version of the structure', () => {
  it('is a number of its own, with a migration for every step up to it', () => {
    expect(SCHEMA_VERSION).toBe(4)
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      expect(MIGRATIONS[version]).toBeTypeOf('function')
    }
  })

  it('knows the versions from 1 to the current one', () => {
    expect([0, 1, SCHEMA_VERSION, SCHEMA_VERSION + 1, 1.5, '1', null].map(isKnownVersion)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('brings version 1 up to version 2 without touching what it was given', () => {
    const old = {
      companies: [{ id: 'c1', name: 'Acme' }],
      applications: [{ id: 'a1', updatedAt: '2026-10-01T00:00:00.000Z' }],
    }
    const next = migrate(old, 1)

    expect(next.companies).toEqual([{ id: 'c1', name: 'Acme', updatedAt: null }])
    expect(next.applications).toEqual([{ id: 'a1', updatedAt: '2026-10-01T00:00:00.000Z' }])
    expect(next.trash).toEqual([])
    expect(old.companies[0]).toEqual({ id: 'c1', name: 'Acme' })
    expect(migrate(next, SCHEMA_VERSION)).toEqual(next)
  })

  it('goes from version 2 to version 3 by adding the relations between companies, and keeps the rest', () => {
    const v2 = { companies: [{ id: 'c1', name: 'Acme', updatedAt: null }], trash: [] }
    const v3 = migrate(v2, 2)
    expect(v3.companyRelations).toEqual([])
    expect(v3.companies).toEqual(v2.companies)
    expect(migrate({ ...v2, companyRelations: [{ id: 'x' }] }, 2).companyRelations).toEqual([{ id: 'x' }])
    // From version 1, every step is taken.
    expect(migrate({ companies: [] }, 1)).toMatchObject({ trash: [], companyRelations: [], contactCompanies: [] })
  })

  it('goes from version 3 to version 4: the company of a contact becomes a first link, once', () => {
    const v3 = {
      contacts: [
        { id: 'p1', companyId: 'c1', role: 'Recruiter' },
        { id: 'p2', companyId: null, role: null },
        { id: 'p3', companyId: '', role: 'x' },
      ],
    }
    const v4 = migrate(v3, 3)
    expect(v4.contactCompanies).toEqual([
      {
        id: 'cc_p1',
        updatedAt: null,
        contactId: 'p1',
        companyId: 'c1',
        title: 'Recruiter',
        startedOn: null,
        endedOn: null,
      },
    ])
    expect(v4.contacts).toEqual(v3.contacts)
    // Run again on its own result: nothing is made twice.
    expect(migrate(v4, 3).contactCompanies).toHaveLength(1)
    expect(migrate({}, 3).contactCompanies).toEqual([])
  })

  it('refuses a newer version and one that makes no sense', () => {
    expect(() => migrate({}, SCHEMA_VERSION + 1)).toThrow(/newer version/)
    expect(() => migrate({}, 0)).toThrow(/not known/)
    expect(() => migrate({}, 'two')).toThrow(/not known/)
    expect(() => migrate({}, undefined)).toThrow(/not known/)
  })
})

describe('an old or newer storage', () => {
  const v1 = () => ({
    [keyOf('companies')]: [{ id: 'c1', name: 'Acme', createdAt: '2026-09-01T00:00:00.000Z' }],
    [keyOf('contacts')]: [{ id: 'p1', firstName: 'Ada', lastName: 'Lovelace' }],
  })

  it('brings a storage with no version (version 1) up to date and saves it with the new version', async () => {
    const adapter = memoryAdapter(v1())
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await persistence.ready

    expect(persistence.newer).toBe(false)
    expect(adapter.data[SCHEMA_KEY]).toBe(SCHEMA_VERSION)
    const [company] = adapter.data[keyOf('companies')] as { name: string; updatedAt: string }[]
    expect(company?.name).toBe('Acme')
    // Never stamped before: it is stamped when it is first written by this version.
    expect(company?.updatedAt).toMatch(/Z$/)
    expect(useRepo(Contact).all()[0]?.lastName).toBe('Lovelace')
    persistence.stop()
  })

  it('brings a storage of version 1 up to date, the same way', async () => {
    const adapter = memoryAdapter({ [SCHEMA_KEY]: 1, ...v1() })
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await persistence.ready

    expect(adapter.data[SCHEMA_KEY]).toBe(SCHEMA_VERSION)
    expect(useRepo(Company).all()).toHaveLength(1)
    persistence.stop()
  })

  it('leaves a storage of a newer version exactly as it is', async () => {
    const stored = { [SCHEMA_KEY]: SCHEMA_VERSION + 1, ...v1() }
    const adapter = memoryAdapter(stored)
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await persistence.ready

    expect(persistence.newer).toBe(true)
    expect(useRepo(Company).all()).toHaveLength(0)

    // Even a change made by the page (and a flush) writes nothing.
    useRepo(Company).save({ name: 'Intruder' })
    await persistence.flush()
    await tick()
    expect(adapter.data).toEqual(stored)
    persistence.stop()
  })
})

describe('the moment of the last change', () => {
  it('stamps a new record and a changed one, and only those', async () => {
    let clock = new Date('2026-10-13T10:00:00Z')
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 5, now: () => clock })
    await persistence.ready

    const company = useRepo(Company).save({ name: 'Acme' })
    useRepo(Contact).save({ firstName: 'Ada' })
    await persistence.flush()
    expect(useRepo(Company).find(company.id)?.updatedAt).toBe('2026-10-13T10:00:00.000Z')

    clock = new Date('2026-10-13T11:00:00Z')
    useRepo(Company).where('id', company.id).update({ name: 'Acme 2' })
    await persistence.flush()
    expect(useRepo(Company).find(company.id)?.updatedAt).toBe('2026-10-13T11:00:00.000Z')
    // The contact did not change: it keeps its moment.
    expect(useRepo(Contact).all()[0]?.updatedAt).toBe('2026-10-13T10:00:00.000Z')

    // Nothing changed: nothing is stamped again.
    clock = new Date('2026-10-13T12:00:00Z')
    await persistence.flush()
    expect(useRepo(Company).find(company.id)?.updatedAt).toBe('2026-10-13T11:00:00.000Z')
    persistence.stop()
  })

  it('keeps a stamp set by the caller, as an import brings the stamps of its backup', async () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter, {
      delay: 5,
      now: () => new Date('2026-10-13T10:00:00Z'),
    })
    await persistence.ready

    useRepo(Company).save({ name: 'Old', updatedAt: '2026-01-02T03:04:05.000Z' })
    await persistence.flush()
    expect(useRepo(Company).all()[0]?.updatedAt).toBe('2026-01-02T03:04:05.000Z')
    persistence.stop()
  })

  it('does not take the stamp for a change of the record', async () => {
    const adapter = memoryAdapter()
    const persistence = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await persistence.ready
    const first = JSON.stringify(adapter.data[keyOf('sources')])
    await persistence.flush()
    await tick()
    expect(JSON.stringify(adapter.data[keyOf('sources')])).toBe(first)
    expect(useRepo(Source).all()).toHaveLength(6)
    persistence.stop()
  })
})

describe('the trash', () => {
  const setup = async (now = () => new Date('2026-10-13T10:00:00Z')) => {
    const adapter = memoryAdapter()
    const pinia = freshStore({ seed: false })
    const persistence = createPersistence(pinia, adapter, { delay: 5, now })
    await persistence.ready
    return { adapter, persistence }
  }

  it('keeps a deleted record, with when it was deleted', async () => {
    const { persistence } = await setup()
    const company = useRepo(Company).save({ name: 'Acme' })
    await persistence.flush()

    useRepo(Company).destroy(company.id)
    await persistence.flush()

    expect(useRepo(Company).all()).toHaveLength(0)
    const [entry] = useRepo(Trash).all()
    expect(entry).toMatchObject({ entity: 'companies', recordId: company.id, deletedAt: '2026-10-13T10:00:00.000Z' })
    expect(entry?.record).toMatchObject({ id: company.id, name: 'Acme' })
    persistence.stop()
  })

  it('groups what is deleted together, and puts it all back together', async () => {
    const { persistence } = await setup()
    const application = captureOffer({ title: 'Backend developer', companyName: 'Acme' })
    addNote('applications', application.id, 'A note')
    await persistence.flush()

    deleteApplication(application.id)
    await persistence.flush()
    expect(useRepo(Application).all()).toHaveLength(0)
    expect(useRepo(Note).all()).toHaveLength(0)

    const groups = listTrash()
    expect(groups).toHaveLength(1)
    // The application comes first, and it is told by the title of its offer. The offer itself stays where it is.
    expect(groups[0]).toMatchObject({ entity: 'applications', label: 'Backend developer' })
    expect(groups[0]?.related).toBeGreaterThanOrEqual(2)

    expect(restoreFromTrash(groups[0]?.batch ?? '')).toBe(groups[0]?.ids.length)
    expect(useRepo(Application).all()).toHaveLength(1)
    expect(useRepo(Note).all()).toHaveLength(1)
    expect(useRepo(Trash).all()).toHaveLength(0)
    await persistence.flush()
    // What came back is not in the trash again.
    expect(useRepo(Trash).all()).toHaveLength(0)
    persistence.stop()
  })

  it('stamps what comes back with the moment it comes back', async () => {
    let clock = new Date('2026-10-13T10:00:00Z')
    const { persistence } = await setup(() => clock)
    const company = useRepo(Company).save({ name: 'Acme' })
    await persistence.flush()
    useRepo(Company).destroy(company.id)
    await persistence.flush()

    clock = new Date('2026-10-14T09:00:00Z')
    restoreFromTrash(listTrash()[0]?.batch ?? '')
    await persistence.flush()
    expect(useRepo(Company).find(company.id)?.updatedAt).toBe('2026-10-14T09:00:00.000Z')
    persistence.stop()
  })

  it(`empties itself after ${TRASH_DAYS} days`, async () => {
    let clock = new Date('2026-10-13T10:00:00Z')
    const { persistence } = await setup(() => clock)
    const company = useRepo(Company).save({ name: 'Acme' })
    await persistence.flush()
    useRepo(Company).destroy(company.id)
    await persistence.flush()
    expect(useRepo(Trash).all()).toHaveLength(1)

    clock = new Date('2026-11-10T10:00:00Z')
    await persistence.flush()
    expect(useRepo(Trash).all()).toHaveLength(1)

    clock = new Date('2026-11-13T10:00:01Z')
    await persistence.flush()
    expect(useRepo(Trash).all()).toHaveLength(0)
    persistence.stop()
  })

  it('leaves nothing behind for a change made with forget(), and can be emptied', async () => {
    const { persistence } = await setup()
    const company = useRepo(Company).save({ name: 'Acme' })
    await persistence.flush()

    await persistence.forget(() => useRepo(Company).destroy(company.id))
    expect(useRepo(Trash).all()).toHaveLength(0)

    const other = useRepo(Company).save({ name: 'Globex' })
    await persistence.flush()
    useRepo(Company).destroy(other.id)
    await persistence.flush()
    expect(useRepo(Trash).all()).toHaveLength(1)
    emptyTrash()
    expect(useRepo(Trash).all()).toHaveLength(0)
    persistence.stop()
  })

  it('does not keep the trash of one page twice when another page loads it', async () => {
    const adapter = memoryAdapter()
    const first = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await first.ready
    const company = useRepo(Company).save({ name: 'Acme' })
    await first.flush()
    useRepo(Company).destroy(company.id)
    await first.flush()
    first.stop()

    const second = createPersistence(freshStore({ seed: false }), adapter, { delay: 5 })
    await second.ready
    await second.flush()
    expect(useRepo(Trash).all()).toHaveLength(1)
    second.stop()
  })
})

describe('an old backup', () => {
  const oldFile = () => ({
    app: EXPORT_APP,
    schema: 1,
    exportedAt: '2026-09-01T08:00:00.000Z',
    data: { companies: [{ id: 'c1', name: 'Acme' }] },
  })

  it('is brought up to date when it is read, and says it was old', () => {
    freshStore()
    const read = readExport(oldFile())
    expect(read.schema).toBe(SCHEMA_VERSION)
    expect(read.fromSchema).toBe(1)
    expect(read.data.companies).toEqual([{ id: 'c1', name: 'Acme', updatedAt: null }])
    expect(read.data.trash).toEqual([])

    expect(planRestore(oldFile())).toMatchObject({ schema: 1, outdated: true })
    expect(planRestore(exportData())).toMatchObject({ schema: SCHEMA_VERSION, outdated: false })
  })

  it('is restored like any other', () => {
    freshStore()
    importData(oldFile())
    expect(
      useRepo(Company)
        .all()
        .map((company) => company.name)
    ).toEqual(['Acme'])
  })

  it('is refused when its version is newer or makes no sense, and changes nothing', () => {
    freshStore()
    captureOffer({ title: 'One', companyName: 'Acme' })
    expect(() => importData({ ...oldFile(), schema: SCHEMA_VERSION + 1 })).toThrow(/newer version/)
    expect(() => importData({ ...oldFile(), schema: 0 })).toThrow(/not known/)
    expect(() => importData({ ...oldFile(), schema: 'one' })).toThrow(/not known/)
    expect(() => importData({ ...oldFile(), schema: undefined })).toThrow(/not known/)
    expect(useRepo(Application).all()).toHaveLength(1)
  })
})
