import { useRepo } from 'pinia-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Journey } from '../../src/models'
import type { JourneyLeg } from '../../src/models/Journey'
import { captureOffer } from '../../src/services/applications'
import {
  JourneyError,
  MAX_MINUTES,
  deleteJourney,
  describeJourney,
  formatDuration,
  journeysOf,
  normalizeLegs,
  preferredJourney,
  reverseJourney,
  saveJourney,
  setPreferred,
  totalMeters,
  totalMinutes,
} from '../../src/services/journeys'
import { freshStore } from './helpers'

const leg = (mode: JourneyLeg['mode'], minutes: number, line = '', meters: number | null = null): JourneyLeg => ({
  mode,
  line,
  minutes,
  meters,
})
// Tours to Bussy-Saint-Georges: on foot, bus, train, metro, RER, on foot.
const TOURS = [
  leg('walk', 10),
  leg('bus', 25, '12'),
  leg('train', 62, 'TER'),
  leg('metro', 20, '14'),
  leg('suburban', 18, 'RER A'),
  leg('walk', 8),
]

const failsWith = (code: string, action: () => unknown) => {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(JourneyError)
    expect((error as JourneyError).code).toBe(code)
    return
  }
  throw new Error(`Expected a JourneyError (${code}).`)
}

describe('totals', () => {
  it('adds the time of the legs, waiting included, and the distances that are known', () => {
    expect(totalMinutes(TOURS)).toBe(143)
    expect(totalMinutes([])).toBe(0)
    expect(totalMeters(TOURS)).toBeNull()
    expect(totalMeters([leg('walk', 10, '', 800), leg('bus', 25), leg('metro', 20, '', 12_000)])).toBe(12_800)
  })

  it('writes a duration as people say it', () => {
    expect([0, 5, 59, 60, 61, 143, 600, 1440].map(formatDuration)).toEqual([
      '0 min',
      '5 min',
      '59 min',
      '1 h00',
      '1 h01',
      '2 h23',
      '10 h00',
      '24 h00',
    ])
  })

  it('tells a journey in words, with the line when there is one', () => {
    const names: Record<string, string> = {
      walk: 'On foot',
      bus: 'Bus',
      train: 'Train',
      metro: 'Metro',
      suburban: 'RER',
    }
    expect(describeJourney({ legs: TOURS }, (mode) => names[mode] ?? mode)).toBe(
      'On foot 10 min > Bus 12 25 min > Train TER 1 h02 > Metro 14 20 min > RER RER A 18 min > On foot 8 min'
    )
  })
})

describe('normalizeLegs', () => {
  it('keeps good legs, trims the line and rounds the distance', () => {
    expect(normalizeLegs([{ mode: 'bus', line: '  12  ', minutes: 25, meters: 4_200.4 }])).toEqual([
      leg('bus', 25, '12', 4_200),
    ])
    expect(normalizeLegs([{ mode: 'walk', minutes: 0 }])).toEqual([leg('walk', 0)])
  })

  it('refuses no leg, a means nobody knows, a time that is not a whole number of minutes, and a distance that makes no sense', () => {
    failsWith('legs', () => normalizeLegs([]))
    failsWith('legs', () => normalizeLegs(undefined))
    failsWith('mode', () => normalizeLegs([{ mode: 'teleport', minutes: 5 }]))
    failsWith('minutes', () => normalizeLegs([{ mode: 'walk', minutes: 5.5 }]))
    failsWith('minutes', () => normalizeLegs([{ mode: 'walk', minutes: -1 }]))
    failsWith('minutes', () => normalizeLegs([{ mode: 'walk', minutes: '5' }]))
    failsWith('minutes', () => normalizeLegs([{ mode: 'walk', minutes: MAX_MINUTES + 1 }]))
    failsWith('meters', () => normalizeLegs([{ mode: 'walk', minutes: 5, meters: -3 }]))
    failsWith('meters', () => normalizeLegs([{ mode: 'walk', minutes: 5, meters: 'far' }]))
    failsWith('line', () => normalizeLegs([{ mode: 'bus', minutes: 5, line: 'x'.repeat(61) }]))
  })

  it('refuses a journey of more than a day', () => {
    failsWith('long', () =>
      normalizeLegs([
        { mode: 'train', minutes: 1000 },
        { mode: 'bus', minutes: 500 },
      ])
    )
    expect(() =>
      normalizeLegs([
        { mode: 'train', minutes: 1000 },
        { mode: 'bus', minutes: 440 },
      ])
    ).not.toThrow()
  })
})

describe('journeys of an offer', () => {
  let offerId = ''

  beforeEach(() => {
    freshStore()
    offerId = captureOffer({ title: 'Dev', companyName: 'Acme' }).jobOfferId ?? ''
  })

  const save = (legs: JourneyLeg[], extra: Record<string, unknown> = {}) =>
    saveJourney({ jobOfferId: offerId, direction: 'outbound', legs, ...extra })

  it('keeps a journey in legs, with its total', () => {
    const journey = save(TOURS, { name: ' By train ' })
    expect(journey).toMatchObject({ direction: 'outbound', name: 'By train', preferred: true })
    expect(journey.legs).toEqual(TOURS)
    expect(totalMinutes(journey.legs)).toBe(143)
  })

  it('makes the first journey of a direction the preferred one, and only that one', () => {
    const train = save(TOURS)
    const car = save([leg('car', 95)])
    expect(train.preferred).toBe(true)
    expect(car.preferred).toBe(false)
    expect(preferredJourney(offerId)?.id).toBe(train.id)
    // The first of the other direction is preferred too.
    const back = saveJourney({ jobOfferId: offerId, direction: 'return', legs: [leg('car', 100)] })
    expect(back.preferred).toBe(true)
    expect(preferredJourney(offerId, 'return')?.id).toBe(back.id)
  })

  it('changes which journey is the preferred one of its direction, in one direction only', () => {
    const train = save(TOURS)
    const car = save([leg('car', 95)])
    const back = saveJourney({ jobOfferId: offerId, direction: 'return', legs: [leg('car', 100)] })
    setPreferred(car.id)
    expect(useRepo(Journey).find(train.id)?.preferred).toBe(false)
    expect(useRepo(Journey).find(car.id)?.preferred).toBe(true)
    expect(useRepo(Journey).find(back.id)?.preferred).toBe(true)
  })

  it('changes a journey without changing which one is preferred', () => {
    const train = save(TOURS)
    save([leg('car', 95)])
    saveJourney({ jobOfferId: offerId, direction: 'outbound', legs: [leg('train', 100)], name: 'Changed' }, train.id)
    expect(useRepo(Journey).find(train.id)).toMatchObject({ name: 'Changed', preferred: true })
    expect(useRepo(Journey).all()).toHaveLength(2)
  })

  it('gives the place to the shortest when the preferred one is deleted', () => {
    const train = save(TOURS)
    const car = save([leg('car', 95)])
    const bike = save([leg('bike', 80)])
    deleteJourney(train.id)
    expect(preferredJourney(offerId)?.id).toBe(bike.id)
    expect(useRepo(Journey).find(bike.id)?.preferred).toBe(true)
    expect(useRepo(Journey).find(car.id)?.preferred).toBe(false)
    deleteJourney(bike.id)
    deleteJourney(car.id)
    expect(preferredJourney(offerId)).toBeNull()
    deleteJourney('nothing')
  })

  it('makes the way back of a journey: the same legs, the other way round', () => {
    const train = save(TOURS, { name: 'By train' })
    const back = reverseJourney(train.id)
    expect(back).toMatchObject({ direction: 'return', name: 'By train', preferred: true })
    expect(back?.legs).toEqual([...TOURS].reverse())
    expect(totalMinutes(back?.legs ?? [])).toBe(143)
    // And the way back of the way back is outbound again.
    expect(reverseJourney(back?.id ?? '')?.direction).toBe('outbound')
    expect(reverseJourney('nothing')).toBeNull()
  })

  it('moves a journey to the other direction, and gives its old place to another', () => {
    const train = save(TOURS)
    const car = save([leg('car', 95)])
    saveJourney({ jobOfferId: offerId, direction: 'return', legs: TOURS }, train.id)
    expect(useRepo(Journey).find(train.id)?.direction).toBe('return')
    expect(useRepo(Journey).find(train.id)?.preferred).toBe(true)
    expect(preferredJourney(offerId)?.id).toBe(car.id)
  })

  it('lists the outbound journeys first, the preferred one then the shortest', () => {
    const slow = save([leg('car', 120)])
    const fast = save([leg('bike', 60)])
    const preferred = save([leg('train', 90)])
    setPreferred(preferred.id)
    const back = saveJourney({ jobOfferId: offerId, direction: 'return', legs: [leg('car', 10)] })
    expect(journeysOf(offerId).map((journey) => journey.id)).toEqual([preferred.id, fast.id, slow.id, back.id])
  })

  it('shows the shortest when none is marked', () => {
    save([leg('car', 120)])
    const fast = save([leg('bike', 60)])
    useRepo(Journey)
      .all()
      .forEach((journey) => useRepo(Journey).where('id', journey.id).update({ preferred: false }))
    expect(preferredJourney(offerId)?.id).toBe(fast.id)
  })

  it('refuses a journey for an offer that is not there or a direction nobody knows, and keeps nothing', () => {
    failsWith('offer', () => saveJourney({ jobOfferId: 'nothing', direction: 'outbound', legs: TOURS }))
    failsWith('direction', () => save(TOURS, { direction: 'sideways' }))
    failsWith('legs', () => save([]))
    failsWith('minutes', () => save([{ mode: 'walk', minutes: 1.5, line: '', meters: null }]))
    expect(useRepo(Journey).all()).toHaveLength(0)
  })

  it('gives nothing for an offer that has no journey', () => {
    expect(journeysOf(offerId)).toEqual([])
    expect(preferredJourney(offerId)).toBeNull()
  })
})
