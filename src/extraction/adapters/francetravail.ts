import type { Salary, SalaryPeriod } from '../../utils/money'
import { toMinor } from '../../utils/money'
import { type ReadOffer, htmlToText } from '../jobPosting'
import type { PageSnapshot } from '../page'
import { relativeDay } from '../relativeDate'

// France Travail publishes no JobPosting data. The page of an offer says the essentials in its tab and its description tag:
//
//   title        "Offre d'emploi Lead Développeur (H/F) - 16 - ANGOULEME - 214VDDL | France Travail"
//   description  "Offre publiée il y a 8 jours - CDI - 35H/semaine - Salaire : Annuel de 35000.0 Euros à 45000.0 Euros - ... - 214VDDL"
//
// and the rest (the text of the offer, the employer) is inside a component with its own shadow DOM, which the snapshot carries
// as `shadows` when the browser lets it be read. Without it, what the tags say is still read.

const TITLE = /^Offre d.emploi (.+?) - (\d{2,3}|2[AB]) - (.+?) - [A-Z0-9]+ \| France Travail$/
const PERIODS: Record<string, SalaryPeriod> = {
  annuel: 'year',
  mensuel: 'month',
  hebdomadaire: 'week',
  journalier: 'day',
  horaire: 'hour',
}
const AMOUNT = String.raw`([\d\s.,]+?)\s*Euros?`
const SALARY = new RegExp(
  String.raw`(Annuel|Mensuel|Hebdomadaire|Journalier|Horaire)\s+de\s+${AMOUNT}(?:\s+à\s+${AMOUNT})?`,
  'i'
)

const text = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

// "Annuel de 35000.0 Euros à 45000.0 Euros": the range and its period. One amount is both ends.
export function salaryFromFranceTravail(line: string): Salary | null {
  const match = SALARY.exec(line)
  if (!match?.[1] || !match[2]) {
    return null
  }
  const minor = (raw: string) => toMinor(raw.replace(/\s/g, ''), 'EUR')
  try {
    const min = minor(match[2])
    const max = match[3] ? minor(match[3]) : min
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
      currency: 'EUR',
      period: PERIODS[match[1].toLowerCase()] ?? null,
      kind: null,
    }
  } catch {
    return null
  }
}

// The contract is the first thing the line says after the date: "CDI - Contrat travail" is a CDI.
const contractOf = (value: string): string => value.split(/\s+-\s+/)[0]?.trim() ?? ''

export function readFranceTravail(snapshot: PageSnapshot, zone: string, now: Date): ReadOffer {
  const offer: ReadOffer = {}
  const title = TITLE.exec(snapshot.title.trim())
  if (title?.[1]) {
    offer.title = title[1]
    offer.location = `${title[3] ?? ''} (${title[2] ?? ''})`.trim()
  }

  const line = snapshot.meta.description ?? ''
  const published = /Offre publiée (il y a [^-]+?)\s+-\s+([^-]+?)\s+-/.exec(line)
  const day = published?.[1] ? relativeDay(published[1], zone, now) : null
  if (day) {
    offer.postedOn = day
  }
  if (published?.[2]) {
    offer.contractType = contractOf(published[2])
  }
  const salary = salaryFromFranceTravail(line)
  if (salary) {
    offer.salary = salary
  }

  // What the component holds, when it could be read: the exact title, the place, the employer and the text of the offer.
  const shadows = (snapshot.shadows ?? []).join('')
  if ('' !== shadows) {
    const doc = new DOMParser().parseFromString(shadows, 'text/html')
    const named = text(doc.querySelector('.offer-detail-title'))
    const company = text(doc.querySelector('[data-cy="nom-etablissement"]'))
    const place = text(doc.querySelector('[data-cy="lieuTravail"]'))
    const contract = text(doc.querySelector('[data-cy="synthese-contrat"]'))
    const pay = text(doc.querySelector('[data-cy="salaire"] dd'))
    const body = doc.querySelector('.offer-detail-description-left > p')
    if ('' !== named) {
      offer.title = named
    }
    if ('' !== company) {
      offer.companyName = company
    }
    if ('' !== place) {
      offer.location = place
    }
    if ('' !== contract) {
      offer.contractType = contractOf(contract)
    }
    const detailed = '' === pay ? null : salaryFromFranceTravail(pay)
    if (detailed) {
      offer.salary = detailed
    }
    const description = body ? htmlToText(body.innerHTML) : ''
    if ('' !== description) {
      offer.description = description
    }
  }
  return offer
}
