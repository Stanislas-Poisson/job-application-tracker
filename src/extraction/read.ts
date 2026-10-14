import { adapterFor } from './adapters'
import { type ReadOffer, findJobPostings, htmlToText, offerFromJobPosting } from './jobPosting'
import type { PageSnapshot } from './page'
import { completeSalary } from './salaryGuess'

const clean = (value: string | undefined): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim()
  return '' === text ? undefined : text
}

// "Senior developer - Acme | LinkedIn" into the title alone: what follows the last " | " is the name of the site.
export function titleFromPage(title: string): string | undefined {
  const [first] = title.split(/\s+[|·•]\s+/)
  return clean(first)
}

// What the OpenGraph tags and the title of the page give. Much less than JobPosting data, and never a company
// that the page did not name.
export function readOpenGraph(snapshot: PageSnapshot): ReadOffer {
  const { meta } = snapshot
  const offer: ReadOffer = {
    title: clean(meta['og:title']) ?? titleFromPage(snapshot.title),
    companyName: clean(meta['og:site_name']),
    description: clean(htmlToText(meta['og:description'] ?? meta.description ?? '')),
  }
  return Object.fromEntries(Object.entries(offer).filter(([, value]) => undefined !== value)) as ReadOffer
}

// The offer a page describes. The JobPosting data comes first, then the adapter of the site if it has one, then
// OpenGraph and the title of the page for what is still missing. An empty object when the page says nothing.
export function readSnapshot(snapshot: PageSnapshot, zone: string, now: Date = new Date()): ReadOffer {
  const [posting] = findJobPostings(snapshot.jsonLd)
  const fromPosting = posting ? offerFromJobPosting(posting, zone) : {}
  // The site name is not the company of an offer that has no JobPosting: it is left out of the fallback.
  const { companyName: _site, ...fallback } = readOpenGraph(snapshot)
  const found = adapterFor(snapshot.url)
  // An adapter that reads the body needs it; one that reads the title and the tags does not.
  const adapter = found && (!found.needsBody || snapshot.body) ? found : null
  const fromSite = adapter
    ? adapter.read(new DOMParser().parseFromString(snapshot.body ?? '', 'text/html'), snapshot, zone, now)
    : {}
  const offer = { ...fallback, ...fromSite, ...fromPosting }
  // Gross or net and the period, from the words around the same amount in the text, then a year unless the figure says otherwise.
  return offer.salary ? { ...offer, salary: completeSalary(offer.salary, offer.description) } : offer
}
