import type { ReadOffer } from './jobPosting'

export const ISSUES_URL = 'https://github.com/Stanislas-Poisson/job-application-tracker/issues/new'

// Where a report goes by e-mail, for someone with no GitHub account. A placeholder until a dedicated address exists.
export const REPORT_EMAIL = 'reports@job-application-tracker.invalid'

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
function reportParts(pageUrl: string, read: ReadOffer, version: string) {
  let host = 'unknown'
  try {
    host = new URL(pageUrl).hostname
  } catch {
    // An address that cannot be read: the report says the site is unknown.
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
  return { title: `Reading broke on ${host}`, body }
}

export function reportUrl(pageUrl: string, read: ReadOffer, version: string): string {
  const { title, body } = reportParts(pageUrl, read, version)
  return `${ISSUES_URL}?${new URLSearchParams({ title, body, labels: 'bug' }).toString()}`
}

// The same report as an e-mail. Spaces are %20, as a mailto: link wants (URLSearchParams would write "+").
export function reportMailto(pageUrl: string, read: ReadOffer, version: string): string {
  const { title, body } = reportParts(pageUrl, read, version)
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}
