import type { ReadOffer } from './jobPosting'

export const ISSUES_URL = 'https://github.com/Stanislas-Poisson/job-application-tracker/issues/new'

const PARTS: (keyof ReadOffer)[] = [
  'title',
  'companyName',
  'location',
  'contractType',
  'description',
  'postedOn',
  'salary',
]

/**
 * The address of a new issue that says a reading did not work. It is a link the user opens and sends by hand: nothing
 * is sent by the extension. It names the site (the host, not the address, which may hold a name or a token) and tells
 * which pieces were found and which were not. It holds nothing of the offer.
 */
export function reportUrl(pageUrl: string, read: ReadOffer, version: string): string {
  let host = 'unknown'
  try {
    host = new URL(pageUrl).hostname
  } catch {
    // An address that cannot be read: the issue says the site is unknown.
  }
  const found = PARTS.filter((part) => undefined !== read[part])
  const missing = PARTS.filter((part) => undefined === read[part])
  const body = [
    `Site: ${host}`,
    `Extension: ${version}`,
    `Read: ${found.join(', ') || 'nothing'}`,
    `Missing: ${missing.join(', ') || 'nothing'}`,
    '',
    'What I expected (add the address of an offer, if it is public):',
  ].join('\n')
  const query = new URLSearchParams({ title: `Reading broke on ${host}`, body, labels: 'bug' })
  return `${ISSUES_URL}?${query.toString()}`
}
