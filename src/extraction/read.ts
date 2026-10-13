import { type ReadOffer, findJobPostings, offerFromJobPosting } from './jobPosting'
import type { PageSnapshot } from './page'

// The offer a page describes: its JobPosting data when it has some. An empty object when the page says nothing.
export function readSnapshot(snapshot: PageSnapshot, zone: string): ReadOffer {
  const [posting] = findJobPostings(snapshot.jsonLd)
  return posting ? offerFromJobPosting(posting, zone) : {}
}
