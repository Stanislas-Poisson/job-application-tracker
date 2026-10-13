// The version of the structure of the data: the fields of the records and the way they are stored. It has nothing to do
// with the version of the extension. A backup file and the storage both carry it, so that data written by an older
// structure can be brought up to date, and data written by a newer one is never read wrongly or overwritten.
//
// How to change the structure: add a function to MIGRATIONS that turns the data of version N into the data of N + 1,
// raise SCHEMA_VERSION to N + 1, and add a test with a file of version N. The functions only ever go up one step.

export const SCHEMA_VERSION = 8
export const SCHEMA_KEY = 'jat:schema'

// The records of every kind of data, by entity name, as they are stored.
export type RawData = Record<string, Record<string, unknown>[]>

type Migration = (data: RawData) => RawData

export const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2: every record has the moment of its last change (null: never stamped), and the deleted records are kept in
  // the trash.
  1: (data) => {
    const next: RawData = {}
    for (const [entity, records] of Object.entries(data)) {
      next[entity] = records.map((record) => ({ updatedAt: null, ...record }))
    }
    next.trash ??= []
    return next
  },
  // 2 -> 3: companies can be tied to one another (a recruitment firm and the final client, a subsidiary and its parent).
  2: (data) => ({ ...data, companyRelations: data.companyRelations ?? [] }),
  // 3 -> 4: a person can work for several companies. The company a contact had becomes a first link, with the title the
  // contact had; its id comes from the contact, so that running the step twice makes no second one.
  3: (data) => {
    const existing = data.contactCompanies ?? []
    const have = new Set(existing.map((link) => String(link.id)))
    const made = (data.contacts ?? [])
      .filter((contact) => 'string' === typeof contact.companyId && '' !== contact.companyId)
      .map((contact) => ({
        id: `cc_${String(contact.id)}`,
        updatedAt: null,
        contactId: contact.id,
        companyId: contact.companyId,
        title: contact.role ?? null,
        startedOn: null,
        endedOn: null,
      }))
      .filter((link) => !have.has(link.id))
    return { ...data, contactCompanies: [...existing, ...made] }
  },
  // 4 -> 5: pay profiles, to estimate the net pay of a gross pay.
  4: (data) => ({ ...data, payProfiles: data.payProfiles ?? [] }),
  // 5 -> 6: an offer has the address of its workplace, and what the user found about the way there.
  5: (data) => ({
    ...data,
    jobOffers: (data.jobOffers ?? []).map((offer) => ({
      address: null,
      commuteMeters: null,
      commuteMinutes: null,
      commuteMode: null,
      ...offer,
    })),
  }),
  // 6 -> 7: the address of an offer is in fields. The one that was kept as a line becomes the first line: nothing is guessed
  // from it. The coordinates start empty.
  6: (data) => ({
    ...data,
    jobOffers: (data.jobOffers ?? []).map((offer) => {
      const { address, ...rest } = offer
      return {
        addressLine1: 'string' === typeof address && '' !== address.trim() ? address : null,
        addressLine2: null,
        addressLine3: null,
        postalCode: null,
        city: null,
        region: null,
        latitude: null,
        longitude: null,
        ...rest,
      }
    }),
  }),
  // 7 -> 8: the way to the workplace is a journey in legs. What was kept as a distance, a time and a means becomes a journey of one
  // leg, the preferred outbound one; its id comes from the offer, so that running the step twice makes no second one.
  7: (data) => {
    const existing = data.journeys ?? []
    const have = new Set(existing.map((journey) => String(journey.id)))
    const made: Record<string, unknown>[] = []
    const jobOffers = (data.jobOffers ?? []).map((offer) => {
      const { commuteMeters, commuteMinutes, commuteMode, ...rest } = offer
      const minutes = 'number' === typeof commuteMinutes ? commuteMinutes : null
      const meters = 'number' === typeof commuteMeters ? commuteMeters : null
      const id = `jy_${String(offer.id)}`
      if ((null !== minutes || null !== meters) && !have.has(id)) {
        const mode = ['car', 'bike', 'walk', 'transit'].includes(String(commuteMode)) ? commuteMode : 'other'
        made.push({
          id,
          updatedAt: null,
          jobOfferId: offer.id,
          direction: 'outbound',
          name: null,
          preferred: true,
          legs: [{ mode, line: '', minutes: minutes ?? 0, meters }],
        })
      }
      return rest
    })
    return { ...data, jobOffers, journeys: [...existing, ...made] }
  },
}

// Whether data of that version can be read: a number from 1 to the current version.
export const isKnownVersion = (version: unknown): version is number =>
  'number' === typeof version && Number.isInteger(version) && 1 <= version && SCHEMA_VERSION >= version

/**
 * The data brought up to the current version, one step at a time. It does not change what it is given.
 * Throws for a version that is newer than this one or that makes no sense: the data is left alone.
 */
export function migrate(data: RawData, from: unknown): RawData {
  if (!isKnownVersion(from)) {
    throw new Error(
      'number' === typeof from && from > SCHEMA_VERSION
        ? 'This data comes from a newer version of the extension.'
        : 'The version of this data is not known.'
    )
  }
  let current: RawData = structuredClone(data)
  for (let version = from; version < SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version]
    if (!step) {
      throw new Error(`There is no way to bring data of version ${version} up to date.`)
    }
    current = step(current)
  }
  return current
}
