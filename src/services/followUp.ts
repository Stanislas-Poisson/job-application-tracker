import { inDaysAt, zonedToUtc } from '../utils/time'

// The hour of the day a suggested reminder is set for, in the time zone of the user.
export const FOLLOW_UP_HOUR = 9

export interface FollowUpSubject {
  // When the user applied (UTC), or null when they did not apply yet.
  appliedAt: string | null
  archived: boolean
  status?: { isFinal: boolean } | null
  reminders?: { doneAt: string | null }[] | null
}

export interface FollowUp {
  // The moment of the reminder (UTC), and the delay it comes from.
  dueAt: string
  days: number
}

/**
 * A reminder to follow up, some days after the application. It is only a suggestion: nothing is added until the user
 * accepts it.
 *
 * It is offered once the user has applied, for an application that is not archived and not at the end of its road (an
 * offer, a refusal), and that has no reminder waiting already. The delay is the one of the options, and the reminder is
 * set for the morning in the time zone of the user.
 */
export function suggestFollowUp(
  application: FollowUpSubject,
  days: number,
  zone: string,
  now: Date = new Date()
): FollowUp | null {
  if (null === application.appliedAt || application.archived || application.status?.isFinal) {
    return null
  }
  if ((application.reminders ?? []).some((reminder) => null === reminder.doneAt)) {
    return null
  }
  return { dueAt: zonedToUtc(inDaysAt(days, FOLLOW_UP_HOUR, zone, now), zone), days }
}
