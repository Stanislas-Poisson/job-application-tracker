import { useRepo } from 'pinia-orm'
import { JobOffer, Journey } from '../models'
import { DIRECTIONS, type Direction, type JourneyLeg, LEG_MODES, type LegMode } from '../models/Journey'

// A journey that cannot be saved. The code is the key of the message to show.
export class JourneyError extends Error {
  constructor(public readonly code: 'offer' | 'direction' | 'legs' | 'mode' | 'minutes' | 'meters' | 'line' | 'long') {
    super(code)
  }
}

// A day is the longest a journey to work can be.
export const MAX_MINUTES = 24 * 60

// How long a journey takes: the sum of its legs, waiting included.
export const totalMinutes = (legs: readonly JourneyLeg[]): number => legs.reduce((total, leg) => total + leg.minutes, 0)

// How far it is, when the user gave the distance of the legs: the sum of those that have one, or null when none does.
export function totalMeters(legs: readonly JourneyLeg[]): number | null {
  const known = legs.filter((leg) => null !== leg.meters)
  return 0 === known.length ? null : known.reduce((total, leg) => total + (leg.meters ?? 0), 0)
}

// "35 min", "1 h00", "2 h23".
export const formatDuration = (minutes: number): string =>
  60 > minutes
    ? `${String(minutes)} min`
    : `${String(Math.floor(minutes / 60))} h${String(minutes % 60).padStart(2, '0')}`

/**
 * The legs of a journey, checked and put in their canonical form: a known means, a whole number of minutes (0 for a leg whose
 * time is not known), a distance in metres or none, a line of at most 60 characters. A journey has at least one leg and takes no
 * more than a day. Throws a JourneyError for the first fault.
 */
export function normalizeLegs(input: unknown): JourneyLeg[] {
  const list = Array.isArray(input) ? (input as Record<string, unknown>[]) : []
  if (0 === list.length) {
    throw new JourneyError('legs')
  }
  const legs = list.map((raw): JourneyLeg => {
    if (!(LEG_MODES as readonly string[]).includes(String(raw.mode))) {
      throw new JourneyError('mode')
    }
    const minutes = raw.minutes
    if ('number' !== typeof minutes || !Number.isInteger(minutes) || 0 > minutes || MAX_MINUTES < minutes) {
      throw new JourneyError('minutes')
    }
    const meters = raw.meters ?? null
    if (null !== meters && ('number' !== typeof meters || !Number.isFinite(meters) || 0 > meters)) {
      throw new JourneyError('meters')
    }
    const line = 'string' === typeof raw.line ? raw.line.trim() : ''
    if (60 < line.length) {
      throw new JourneyError('line')
    }
    return { mode: raw.mode as LegMode, line, minutes, meters: null === meters ? null : Math.round(meters) }
  })
  if (MAX_MINUTES < totalMinutes(legs)) {
    throw new JourneyError('long')
  }
  return legs
}

export interface JourneyInput {
  jobOfferId: string
  direction: string
  name?: string | null
  legs: unknown
}

const sameWay = (offerId: string, direction: Direction) =>
  useRepo(Journey).where('jobOfferId', offerId).where('direction', direction)

// The journeys of an offer: the outbound ones first, in each the preferred one then the shortest.
export function journeysOf(offerId: string): Journey[] {
  const order = (journey: Journey) => DIRECTIONS.indexOf(journey.direction)
  return useRepo(Journey)
    .where('jobOfferId', offerId)
    .get()
    .sort(
      (a, b) =>
        order(a) - order(b) || Number(b.preferred) - Number(a.preferred) || totalMinutes(a.legs) - totalMinutes(b.legs)
    )
}

// The journey that stands for a direction (the one the card shows): the preferred one, or the shortest when none is marked.
export function preferredJourney(offerId: string, direction: Direction = 'outbound'): Journey | null {
  return preferredOf(journeysOf(offerId), direction)
}

// The same from journeys already in hand (an offer loaded with its journeys).
export function preferredOf<T extends Pick<Journey, 'direction' | 'preferred' | 'legs'>>(
  journeys: readonly T[],
  direction: Direction = 'outbound'
): T | null {
  const ways = journeys.filter((journey) => journey.direction === direction)
  return (
    ways.find((journey) => journey.preferred) ??
    [...ways].sort((a, b) => totalMinutes(a.legs) - totalMinutes(b.legs))[0] ??
    null
  )
}

function markPreferred(journey: Journey) {
  sameWay(journey.jobOfferId, journey.direction)
    .get()
    .forEach((other) => {
      if (other.preferred !== (other.id === journey.id)) {
        useRepo(Journey)
          .where('id', other.id)
          .update({ preferred: other.id === journey.id })
      }
    })
}

/**
 * Keeps a journey (a new one, or the one with `id`). The first journey of a direction is the preferred one. Nothing is saved
 * when it is refused.
 */
export function saveJourney(input: JourneyInput, id?: string): Journey {
  if (!useRepo(JobOffer).find(input.jobOfferId)) {
    throw new JourneyError('offer')
  }
  if (!(DIRECTIONS as readonly string[]).includes(input.direction)) {
    throw new JourneyError('direction')
  }
  const direction = input.direction as Direction
  const legs = normalizeLegs(input.legs)
  const name = (input.name ?? '').trim()
  const existing = undefined === id ? null : useRepo(Journey).find(id)
  const alone =
    0 ===
    sameWay(input.jobOfferId, direction)
      .get()
      .filter((journey) => journey.id !== id).length
  const saved = useRepo(Journey).save({
    ...(existing ? { id: existing.id } : {}),
    jobOfferId: input.jobOfferId,
    direction,
    name: '' === name ? null : name,
    legs,
    preferred: existing?.direction === direction ? existing.preferred : alone,
  })
  // A journey that changed direction leaves the other direction without its preferred one: the shortest takes the place.
  if (existing && existing.direction !== direction) {
    promote(existing.jobOfferId, existing.direction)
  }
  return saved
}

function promote(offerId: string, direction: Direction) {
  const ways = sameWay(offerId, direction).get()
  if (0 < ways.length && !ways.some((journey) => journey.preferred)) {
    const shortest = ways.sort((a, b) => totalMinutes(a.legs) - totalMinutes(b.legs))[0]
    if (shortest) {
      useRepo(Journey).where('id', shortest.id).update({ preferred: true })
    }
  }
}

// Makes this journey the one that stands for its direction.
export function setPreferred(id: string) {
  const journey = useRepo(Journey).find(id)
  if (journey) {
    markPreferred(journey)
  }
}

// Removes a journey. If it was the preferred one the shortest of the same direction takes its place.
export function deleteJourney(id: string) {
  const journey = useRepo(Journey).find(id)
  if (!journey) {
    return
  }
  useRepo(Journey).destroy(id)
  promote(journey.jobOfferId, journey.direction)
}

/**
 * The way back of a journey: the same legs in the reverse order, in the other direction. It is the preferred one of its
 * direction when there is none yet. A journey back is made from an outbound one and the other way round.
 */
export function reverseJourney(id: string): Journey | null {
  const journey = useRepo(Journey).find(id)
  if (!journey) {
    return null
  }
  return saveJourney({
    jobOfferId: journey.jobOfferId,
    direction: 'outbound' === journey.direction ? 'return' : 'outbound',
    name: journey.name,
    legs: [...journey.legs].reverse(),
  })
}

// A journey in words: "On foot 10 min > Bus (12) 25 min > RER A 18 min", the means written by `modeName`.
export function describeJourney(journey: Pick<Journey, 'legs'>, modeName: (mode: LegMode) => string): string {
  return journey.legs
    .map(
      (leg) => `${leg.line ? `${modeName(leg.mode)} ${leg.line}` : modeName(leg.mode)} ${formatDuration(leg.minutes)}`
    )
    .join(' > ')
}
