import type { ReadOffer } from '../jobPosting'
import type { PageSnapshot } from '../page'
import { readLinkedIn } from './linkedin'

// A site that needs more than the JobPosting data and the OpenGraph tags.
export interface Adapter {
  name: string
  read: (doc: Document, snapshot: PageSnapshot, zone: string, now: Date) => ReadOffer
}

const LINKEDIN: Adapter = { name: 'linkedin', read: readLinkedIn }

// The adapter of a page, found from its address. Null when the generic reading is all there is.
export function adapterFor(url: string): Adapter | null {
  let address: URL
  try {
    address = new URL(url)
  } catch {
    return null
  }
  const host = address.hostname.toLowerCase()
  if (('linkedin.com' === host || host.endsWith('.linkedin.com')) && address.pathname.startsWith('/jobs/')) {
    return LINKEDIN
  }
  return null
}
