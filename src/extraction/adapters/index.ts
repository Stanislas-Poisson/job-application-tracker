import type { ReadOffer } from '../jobPosting'
import type { PageSnapshot } from '../page'
import { readGlassdoor } from './glassdoor'
import { readLinkedIn } from './linkedin'
import { readTalent } from './talent'

// A site that needs more than the JobPosting data and the OpenGraph tags.
export interface Adapter {
  name: string
  // Whether it reads the body of the page. One that only needs the title and the tags does not: the body is then not taken.
  needsBody: boolean
  read: (doc: Document, snapshot: PageSnapshot, zone: string, now: Date) => ReadOffer
}

const LINKEDIN: Adapter = { name: 'linkedin', needsBody: true, read: readLinkedIn }
const GLASSDOOR: Adapter = { name: 'glassdoor', needsBody: true, read: (doc) => readGlassdoor(doc) }
const TALENT: Adapter = { name: 'talent', needsBody: false, read: (_doc, snapshot) => readTalent(snapshot) }

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
  if (('talent.com' === host || host.endsWith('.talent.com')) && address.pathname.startsWith('/view')) {
    return TALENT
  }
  if (/(^|\.)glassdoor\.[a-z.]+$/.test(host)) {
    return GLASSDOOR
  }
  return null
}
