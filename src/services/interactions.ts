import { useRepo } from 'pinia-orm'
import { Application, Contact, Interaction } from '../models'
import { CHANNELS, type Channel, DIRECTIONS, type Direction, ORIGINS, type Origin } from '../models/Interaction'
import { isInstant } from '../utils/time'

export interface InteractionInput {
  applicationId?: string | null
  contactId?: string | null
  counterpart?: string | null
  channel: Channel
  direction: Direction
  subject?: string | null
  body?: string | null
  // In UTC, ending with Z. A page turns what the user typed in their time zone into this before it calls.
  occurredAt: string
  durationMinutes?: number | null
  externalRef?: string | null
  origin?: Origin
}

// An exchange that cannot be saved. The code is the key of the message to show.
export class InteractionError extends Error {
  constructor(
    public readonly code: 'content' | 'date' | 'channel' | 'direction' | 'duration' | 'application' | 'contact'
  ) {
    super(code)
  }
}

const filled = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim()
  return '' === text ? null : text
}

// Saves an exchange. It needs a subject or a text, a moment in UTC, a channel and a direction. An exchange that has the
// same external reference as one already kept for the same application is not added again: the one that exists is returned.
export function addInteraction(input: InteractionInput): Interaction {
  if (!(CHANNELS as readonly string[]).includes(input.channel)) {
    throw new InteractionError('channel')
  }
  if (!(DIRECTIONS as readonly string[]).includes(input.direction)) {
    throw new InteractionError('direction')
  }
  if (!isInstant(input.occurredAt)) {
    throw new InteractionError('date')
  }
  const subject = filled(input.subject)
  const body = filled(input.body)
  if (null === subject && null === body) {
    throw new InteractionError('content')
  }
  const duration = input.durationMinutes ?? null
  if (null !== duration && (!Number.isInteger(duration) || 0 > duration)) {
    throw new InteractionError('duration')
  }

  const applicationId = input.applicationId ?? null
  if (null !== applicationId && !useRepo(Application).find(applicationId)) {
    throw new InteractionError('application')
  }
  const contactId = input.contactId ?? null
  if (null !== contactId && !useRepo(Contact).find(contactId)) {
    throw new InteractionError('contact')
  }

  const externalRef = filled(input.externalRef)
  if (null !== externalRef) {
    const same = useRepo(Interaction).where('externalRef', externalRef).where('applicationId', applicationId).first()
    if (same) {
      return same
    }
  }

  const origin = input.origin ?? 'manual'
  const interaction = useRepo(Interaction).save({
    applicationId,
    contactId,
    counterpart: filled(input.counterpart),
    channel: input.channel,
    direction: input.direction,
    subject,
    body,
    occurredAt: input.occurredAt,
    durationMinutes: duration,
    externalRef,
    origin: (ORIGINS as readonly string[]).includes(origin) ? origin : 'manual',
  })

  if (null !== applicationId) {
    useRepo(Application).where('id', applicationId).update({ updatedAt: new Date().toISOString() })
  }
  return interaction
}

export function removeInteraction(interactionId: string) {
  useRepo(Interaction).destroy(interactionId)
}
