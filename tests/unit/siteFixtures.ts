import type { PageSnapshot } from '../../src/extraction/page'
import { collectSnapshot } from '../../src/extraction/page'

// Tools to keep, for each job site, the structure of one page of an offer: a snapshot of the page with the text of the offer
// replaced by placeholders (the structure is the site's, the words are not ours to keep), and what the extension reads from it.
// See docs/sites.md.

// What stays as it is in the data of a page: the names of the fields that are facts of the structure, not words of the offer.
const KEEP = new Set([
  '@context',
  '@type',
  'datePosted',
  'validThrough',
  'dateModified',
  'employmentType',
  'currency',
  'unitText',
  'minValue',
  'maxValue',
  'value',
  'addressCountry',
  'addressLocality',
  'addressRegion',
  'postalCode',
  'jobLocationType',
  'directApply',
  'experienceRequirements',
  'educationRequirements',
  'latitude',
  'longitude',
  'workHours',
  'salaryCurrency',
  'baseSalary',
  'jobLocation',
  'address',
  'geo',
  'hiringOrganization',
])

// The fields whose words are replaced, and by what.
const PLACEHOLDERS: Record<string, string> = {
  title: 'Example job title',
  name: 'Example Corp',
  description: '<p>Example description of the offer.</p><p>Second paragraph.</p>',
  industry: 'Example industry',
  skills: 'Example skill',
  qualifications: 'Example qualification',
  responsibilities: 'Example responsibility',
  occupationalCategory: 'Example category',
  jobBenefits: 'Example benefit',
  // A street is the address of a company: the shape stays, the street does not.
  streetAddress: '1 rue de l’Exemple',
}

const LINK = /^https?:\/\//

// A value of the data of a page, with the words of the offer replaced. Numbers, dates and the shape of the data stay.
export function redactData(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactData(item, key))
  }
  if ('object' === typeof value && null !== value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([name]) => !['image', 'logo', 'sameAs', 'identifier', 'url', 'mainEntityOfPage'].includes(name))
        .map(([name, inner]) => [name, redactData(inner, name)])
    )
  }
  if ('string' !== typeof value) {
    return value
  }
  if (key in PLACEHOLDERS) {
    return '' === value && 'streetAddress' === key ? value : PLACEHOLDERS[key]
  }
  if (KEEP.has(key) || /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value
  }
  return LINK.test(value) ? 'https://example.org/' : 'Example text'
}

// The title of the tab: the words of the offer replaced, the name of the site after the last bar kept.
export function redactTitle(title: string): string {
  const parts = title.split(/\s+[|·•]\s+/)
  return ['Example job title', ...parts.slice(1)].join(' | ')
}

// A page as a snapshot, the way the extension takes it (the real collector, in a document).
export function snapshotOfHtml(html: string, url: string, withBody = false): PageSnapshot {
  ;(window as unknown as { happyDOM: { setURL: (address: string) => void } }).happyDOM.setURL(url)
  document.documentElement.innerHTML = html.replace(/<link[^>]*>|<iframe[^>]*>/g, '')
  return collectSnapshot(withBody)
}

// The snapshot of a page as it is kept: JSON-LD redacted, only the tags the reading uses, with placeholders.
export function redactSnapshot(snapshot: PageSnapshot): PageSnapshot {
  const meta: Record<string, string> = {}
  for (const key of ['og:title', 'og:site_name', 'og:description', 'description']) {
    if (snapshot.meta[key]) {
      meta[key] = 'og:site_name' === key ? snapshot.meta[key] : 'Example text'
    }
  }
  return {
    url: snapshot.url,
    title: redactTitle(snapshot.title),
    jsonLd: snapshot.jsonLd.flatMap((text) => {
      try {
        return [JSON.stringify(redactData(JSON.parse(text)))]
      } catch {
        return []
      }
    }),
    meta,
  }
}

// What the reading found, as a list of the fields it filled: the shape of the reading, which is what breaks when a site changes.
export function shapeOf(offer: object): string[] {
  return Object.keys(offer).sort()
}
