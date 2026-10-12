import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  Activity,
  Application,
  ApplicationContact,
  Company,
  Contact,
  JobOffer,
  Note,
  Reminder,
  Status,
} from '../../src/models'
import {
  addContact,
  addNote,
  addReminder,
  captureOffer,
  deleteApplication,
  moveApplication,
  setArchived,
  setReminderDone,
  sourceFor,
  unlinkContact,
} from '../../src/services/applications'
import { freshStore } from './helpers'

const statusId = (key: string) => {
  const status = useRepo(Status).where('key', key).first()
  if (!status) {
    throw new Error(`No status ${key}`)
  }
  return status.id
}

describe('capturing an offer', () => {
  beforeEach(() => {
    freshStore()
  })

  it('creates the company, the offer, the application and the first line of the timeline', () => {
    const application = captureOffer({
      title: ' Backend developer ',
      companyName: 'Acme',
      url: 'https://www.linkedin.com/jobs/view/1',
      location: 'Paris',
    })

    const loaded = useRepo(Application)
      .with('jobOffer', (query) => query.with('company').with('source'))
      .with('status')
      .with('activities')
      .find(application.id)
    expect(loaded?.jobOffer?.title).toBe('Backend developer')
    expect(loaded?.jobOffer?.company?.name).toBe('Acme')
    expect(loaded?.jobOffer?.source?.key).toBe('linkedin')
    expect(loaded?.status?.key).toBe('to_apply')
    expect(loaded?.activities.map((activity) => activity.type)).toEqual(['created'])
  })

  it('reuses a company that has the same name, whatever its case', () => {
    captureOffer({ title: 'One', companyName: 'Acme' })
    captureOffer({ title: 'Two', companyName: '  ACME ' })

    expect(useRepo(Company).all()).toHaveLength(1)
    expect(useRepo(JobOffer).all()).toHaveLength(2)
  })

  it('starts in the status that is asked for, and sets the date of application when it is "applied"', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme', statusKey: 'applied' })

    expect(application.statusId).toBe(statusId('applied'))
    expect(application.appliedAt).not.toBeNull()
  })

  it('falls back to the first column when the status is unknown', () => {
    expect(captureOffer({ title: 'One', companyName: 'Acme', statusKey: 'nope' }).statusId).toBe(statusId('to_apply'))
  })

  it('puts each new application at the end of its column', () => {
    const first = captureOffer({ title: 'One', companyName: 'Acme' })
    const second = captureOffer({ title: 'Two', companyName: 'Acme' })

    expect(first.position).toBe(0)
    expect(second.position).toBe(1)
  })
})

describe('finding the source of an offer', () => {
  beforeEach(() => {
    freshStore()
  })

  it.each([
    ['https://www.linkedin.com/jobs/view/1', 'linkedin'],
    ['https://fr.indeed.com/viewjob?jk=1', 'indeed'],
    ['https://www.welcometothejungle.com/fr/companies/a/jobs/b', 'welcome_to_the_jungle'],
    ['https://candidat.francetravail.fr/offres/recherche/detail/1', 'france_travail'],
    ['https://cadres.apec.fr/offres', 'apec'],
    ['https://careers.example.com/jobs/1', 'other'],
    ['not an address', 'other'],
  ])('%s is from %s', (url, key) => {
    expect(sourceFor(url)?.key).toBe(key)
  })

  it('does not take a host that only ends with the same letters', () => {
    expect(sourceFor('https://notlinkedin.com/jobs')?.key).toBe('other')
  })
})

describe('following an application', () => {
  beforeEach(() => {
    freshStore()
  })

  it('moves to the end of another column and writes it in the timeline', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    captureOffer({ title: 'Two', companyName: 'Acme', statusKey: 'applied' })

    const moved = moveApplication(application.id, statusId('applied'))

    expect(moved?.statusId).toBe(statusId('applied'))
    expect(moved?.position).toBe(1)
    expect(moved?.appliedAt).not.toBeNull()
    const change = useRepo(Activity).where('type', 'status_changed').first()
    expect(change?.fromStatusId).toBe(statusId('to_apply'))
    expect(change?.toStatusId).toBe(statusId('applied'))
  })

  it('does nothing when the application is dropped on its own column', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    moveApplication(application.id, statusId('to_apply'))

    expect(useRepo(Activity).where('type', 'status_changed').get()).toHaveLength(0)
  })

  it('keeps the first date of application when it moves back and forth', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    const first = moveApplication(application.id, statusId('applied'))?.appliedAt
    moveApplication(application.id, statusId('interview'))
    moveApplication(application.id, statusId('applied'))

    expect(useRepo(Application).find(application.id)?.appliedAt).toBe(first)
  })

  it('adds notes, reminders and contacts, and removes them with the application', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    addNote('applications', application.id, ' call back on Monday ')
    const reminder = addReminder(application.id, 'Follow up', '2026-01-01T00:00:00.000Z')
    setReminderDone(reminder.id, true)
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' }, 'recruiter')

    expect(useRepo(Note).first()?.body).toBe('call back on Monday')
    expect(useRepo(Reminder).first()?.doneAt).not.toBeNull()
    expect(contact.companyId).toBe(useRepo(Company).first()?.id)
    expect(useRepo(Application).with('contacts').find(application.id)?.contacts).toHaveLength(1)

    deleteApplication(application.id)

    expect(useRepo(Application).all()).toHaveLength(0)
    expect(useRepo(Note).all()).toHaveLength(0)
    expect(useRepo(Reminder).all()).toHaveLength(0)
    expect(useRepo(Activity).all()).toHaveLength(0)
    expect(useRepo(ApplicationContact).all()).toHaveLength(0)
    // The offer, the company and the contact stay: they can be used by another application.
    expect(useRepo(JobOffer).all()).toHaveLength(1)
    expect(useRepo(Company).all()).toHaveLength(1)
    expect(useRepo(Contact).all()).toHaveLength(1)
  })

  it('unlinks a contact without deleting it', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    const contact = addContact(application.id, { firstName: 'Ada', lastName: 'Lovelace' })
    unlinkContact(application.id, contact.id)

    expect(useRepo(Application).with('contacts').find(application.id)?.contacts).toHaveLength(0)
    expect(useRepo(Contact).all()).toHaveLength(1)
  })

  it('only takes a reminder at a moment in UTC', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })

    expect(() => addReminder(application.id, 'Follow up', '2026-01-01T09:00:00+01:00')).toThrow(/UTC/)
    expect(() => addReminder(application.id, 'Follow up', '2026-01-01')).toThrow(/UTC/)
    expect(addReminder(application.id, 'Follow up', '2026-01-01T08:00:00.000Z').dueAt).toBe('2026-01-01T08:00:00.000Z')
  })

  it('only takes a publication date that is a plain date', () => {
    expect(captureOffer({ title: 'One', companyName: 'Acme', postedOn: '2026-10-12' }).jobOfferId).not.toBeNull()
    expect(() => captureOffer({ title: 'Two', companyName: 'Acme', postedOn: '2026-10-12T00:00:00Z' })).toThrow(
      /plain date/
    )
    expect(() => captureOffer({ title: 'Two', companyName: 'Acme', postedOn: '2026-02-30' })).toThrow(/plain date/)
  })

  it('archives and restores', () => {
    const application = captureOffer({ title: 'One', companyName: 'Acme' })
    setArchived(application.id, true)
    expect(useRepo(Application).find(application.id)?.archived).toBe(true)
    setArchived(application.id, false)
    expect(useRepo(Application).find(application.id)?.archived).toBe(false)
  })
})
