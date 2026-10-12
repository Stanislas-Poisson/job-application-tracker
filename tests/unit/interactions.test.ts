import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Activity, Application, Interaction } from '../../src/models'
import { addContact, captureOffer } from '../../src/services/applications'
import { InteractionError, addInteraction, removeInteraction } from '../../src/services/interactions'
import { buildTimeline } from '../../src/services/timeline'
import { freshStore } from './helpers'

const codeOf = (action: () => unknown) => {
  try {
    action()
  } catch (error) {
    return error instanceof InteractionError ? error.code : 'other'
  }
  return null
}

const AT = '2026-10-12T14:30:00.000Z'

describe('exchanges', () => {
  let applicationId: string
  let contactId: string

  beforeEach(() => {
    freshStore()
    applicationId = captureOffer({ title: 'One', companyName: 'Acme' }).id
    contactId = addContact(applicationId, { firstName: 'Ada', lastName: 'Lovelace' }).id
  })

  it('saves an exchange with its channel, its direction, its contact and its moment in UTC', () => {
    const exchange = addInteraction({
      applicationId,
      contactId,
      channel: 'email',
      direction: 'inbound',
      subject: ' Interview ',
      body: 'Are you free on Monday?',
      occurredAt: AT,
    })

    expect(useRepo(Interaction).find(exchange.id)).toMatchObject({
      applicationId,
      contactId,
      channel: 'email',
      direction: 'inbound',
      subject: 'Interview',
      body: 'Are you free on Monday?',
      occurredAt: AT,
      origin: 'manual',
      durationMinutes: null,
    })
  })

  it('accepts a subject alone, or a text alone, and nothing else', () => {
    expect(
      codeOf(() => addInteraction({ channel: 'phone', direction: 'outbound', occurredAt: AT, subject: 'Call' }))
    ).toBeNull()
    expect(
      codeOf(() => addInteraction({ channel: 'sms', direction: 'inbound', occurredAt: AT, body: 'See you' }))
    ).toBeNull()
    expect(
      codeOf(() => addInteraction({ channel: 'sms', direction: 'inbound', occurredAt: AT, subject: ' ', body: '' }))
    ).toBe('content')
  })

  it('only takes a moment in UTC', () => {
    const input = { channel: 'email', direction: 'inbound', subject: 'Hi' } as const

    expect(codeOf(() => addInteraction({ ...input, occurredAt: '2026-10-12T16:30:00+02:00' }))).toBe('date')
    expect(codeOf(() => addInteraction({ ...input, occurredAt: '2026-10-12' }))).toBe('date')
    expect(codeOf(() => addInteraction({ ...input, occurredAt: '' }))).toBe('date')
  })

  it('refuses a channel or a direction that is not in the lists', () => {
    expect(
      codeOf(() => addInteraction({ channel: 'pigeon' as never, direction: 'inbound', subject: 'Hi', occurredAt: AT }))
    ).toBe('channel')
    expect(
      codeOf(() => addInteraction({ channel: 'email', direction: 'sideways' as never, subject: 'Hi', occurredAt: AT }))
    ).toBe('direction')
  })

  it('wants a whole number of minutes, zero or more', () => {
    const input = { channel: 'phone', direction: 'outbound', subject: 'Call', occurredAt: AT } as const

    expect(addInteraction({ ...input, durationMinutes: 25 }).durationMinutes).toBe(25)
    expect(codeOf(() => addInteraction({ ...input, durationMinutes: -1 }))).toBe('duration')
    expect(codeOf(() => addInteraction({ ...input, durationMinutes: 2.5 }))).toBe('duration')
  })

  it('refuses an application or a contact that does not exist', () => {
    const input = { channel: 'email', direction: 'inbound', subject: 'Hi', occurredAt: AT } as const

    expect(codeOf(() => addInteraction({ ...input, applicationId: 'nope' }))).toBe('application')
    expect(codeOf(() => addInteraction({ ...input, contactId: 'nope' }))).toBe('contact')
    expect(useRepo(Interaction).all()).toHaveLength(0)
  })

  it('keeps an exchange once when it has the same external reference for the same application', () => {
    const input = {
      applicationId,
      channel: 'email',
      direction: 'inbound',
      subject: 'Hi',
      occurredAt: AT,
      externalRef: '<message-1@example.com>',
    } as const
    const first = addInteraction(input)
    const second = addInteraction(input)

    expect(second.id).toBe(first.id)
    expect(useRepo(Interaction).all()).toHaveLength(1)
  })

  it('keeps the same reference for another application', () => {
    const otherId = captureOffer({ title: 'Two', companyName: 'Globex' }).id
    const input = {
      channel: 'email',
      direction: 'inbound',
      subject: 'Hi',
      occurredAt: AT,
      externalRef: '<m@x>',
    } as const
    addInteraction({ ...input, applicationId })
    addInteraction({ ...input, applicationId: otherId })

    expect(useRepo(Interaction).all()).toHaveLength(2)
  })

  it('touches the application, so that the most recent come first', () => {
    const before = useRepo(Application).find(applicationId)?.updatedAt ?? ''
    addInteraction({ applicationId, channel: 'email', direction: 'inbound', subject: 'Hi', occurredAt: AT })

    expect((useRepo(Application).find(applicationId)?.updatedAt ?? '') >= before).toBe(true)
  })

  it('works without an application, for an exchange that is not placed yet', () => {
    expect(
      addInteraction({ channel: 'email', direction: 'inbound', subject: 'Hi', occurredAt: AT }).applicationId
    ).toBeNull()
  })

  it('is removed', () => {
    const exchange = addInteraction({
      applicationId,
      channel: 'email',
      direction: 'inbound',
      subject: 'Hi',
      occurredAt: AT,
    })
    removeInteraction(exchange.id)

    expect(useRepo(Interaction).all()).toHaveLength(0)
  })

  it('shows on the application and on the contact', () => {
    addInteraction({ applicationId, contactId, channel: 'email', direction: 'inbound', subject: 'Hi', occurredAt: AT })

    expect(useRepo(Application).with('interactions').find(applicationId)?.interactions).toHaveLength(1)
  })
})

describe('the timeline', () => {
  it('puts the activities and the exchanges in one list, the most recent first', () => {
    const activity = (id: string, occurredAt: string) => ({ id, occurredAt }) as unknown as Activity
    const exchange = (id: string, occurredAt: string) => ({ id, occurredAt }) as unknown as Interaction

    const entries = buildTimeline(
      [activity('a1', '2026-10-10T09:00:00.000Z'), activity('a2', '2026-10-12T09:00:00.000Z')],
      [exchange('i1', '2026-10-11T09:00:00.000Z'), exchange('i2', '2026-10-13T09:00:00.000Z')]
    )

    expect(entries.map((entry) => entry.id)).toEqual(['i2', 'a2', 'i1', 'a1'])
    expect(entries.map((entry) => entry.kind)).toEqual(['interaction', 'activity', 'interaction', 'activity'])
  })

  it('has nothing for an application with no history', () => {
    expect(buildTimeline([], [])).toEqual([])
  })
})
