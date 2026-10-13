import { Model } from 'pinia-orm'
import JobOffer from './JobOffer'

// The means of one leg of a journey. "transit" is public transport when the user does not say which; "suburban" is the commuter
// train of a big city (RER, S-Bahn, Cercanías…); "wait" is the time spent waiting for the next one.
export const LEG_MODES = [
  'walk',
  'bike',
  'car',
  'bus',
  'tram',
  'metro',
  'train',
  'suburban',
  'transit',
  'ferry',
  'wait',
  'other',
] as const
export type LegMode = (typeof LEG_MODES)[number]

export const DIRECTIONS = ['outbound', 'return'] as const
export type Direction = (typeof DIRECTIONS)[number]

// One part of a journey: how, which line or operator if the user says, how long, and how far if they know.
export interface JourneyLeg {
  mode: LegMode
  line: string
  minutes: number
  meters: number | null
}

// A way to get from home to the workplace of an offer, as the user found it on a map: a list of legs, one after the other, with the
// time of each. The total is the sum of the legs. The extension computes none of it.
export default class Journey extends Model {
  static entity = 'journeys'

  declare id: string
  // When the record last changed (UTC). Set by the persistence; null for a record that was never stamped.
  declare updatedAt: string | null
  declare jobOfferId: string
  declare direction: Direction
  declare name: string | null
  // The one that stands for its direction: the card and the export show it.
  declare preferred: boolean
  declare legs: JourneyLeg[]

  declare jobOffer: JobOffer | null

  static fields() {
    return {
      id: this.uid(),
      updatedAt: this.string(null),
      jobOfferId: this.attr(''),
      direction: this.string('outbound'),
      name: this.string(null),
      preferred: this.boolean(false),
      legs: this.attr(() => []),
      jobOffer: this.belongsTo(JobOffer, 'jobOfferId'),
    }
  }
}
