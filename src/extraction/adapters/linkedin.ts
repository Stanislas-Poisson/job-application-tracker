import { type ReadOffer, htmlToText } from '../jobPosting'
import type { PageSnapshot } from '../page'
import { relativeDay } from '../relativeDate'
import { salaryFromText } from '../salaryText'

// LinkedIn gives its pages no JobPosting data and generated class names, so this reads what stays the same: the title
// of the tab ("Title | Company | LinkedIn"), the line under the title ("Place · Posted 3 days ago · ..."), and the
// block under the heading "About the job". The words are the ones of the languages of the site, French and English.

const ABOUT = /propos de l.offre|about the job/i
const DOT = /\s*·\s*/
const text = (node: Element): string => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

// "Title | Company | LinkedIn" into its two parts. A title may hold a "|" itself, hence the end of the list.
export function titleAndCompany(pageTitle: string): { title?: string; companyName?: string } {
  const parts = pageTitle.split(/\s+\|\s+/)
  if (3 > parts.length || 'linkedin' !== parts.at(-1)?.toLowerCase()) {
    return {}
  }
  return { title: parts.slice(0, -2).join(' | '), companyName: parts.at(-2) }
}

// The line under the title: it has a place and a "posted ... ago", told apart by the dots.
function detailsLine(main: Element, after: Element | null, zone: string, now: Date): Element | null {
  const lines = [...main.querySelectorAll('p')].filter((line) => {
    const content = text(line)
    return (
      300 > content.length &&
      DOT.test(content) &&
      content.split(DOT).some((part) => null !== relativeDay(part, zone, now))
    )
  })
  const below = lines.find((line) => after && Boolean(after.compareDocumentPosition(line) & 4))
  return below ?? lines[0] ?? null
}

// The part of the page that holds the offer itself: the block of the title and of the line under it, without the
// description, the other offers and the company. Its salary is the only one that is the offer's.
function topCard(line: Element): Element {
  let card = line
  while (card.parentElement && 1500 > text(card.parentElement).length && !card.parentElement.querySelector('h2')) {
    card = card.parentElement
  }
  return card
}

export function readLinkedIn(doc: Document, snapshot: PageSnapshot, zone: string, now: Date): ReadOffer {
  const offer: ReadOffer = titleAndCompany(snapshot.title)
  const root = doc.querySelector('main') ?? doc.body
  const titleLine = offer.title
    ? ([...root.querySelectorAll('p')].find((line) => text(line).startsWith(offer.title ?? '')) ?? null)
    : null

  const line = detailsLine(root, titleLine, zone, now)
  if (line) {
    const parts = text(line).split(DOT)
    offer.location = '' === parts[0] ? undefined : parts[0]
    offer.postedOn = parts.map((part) => relativeDay(part, zone, now)).find((day) => null !== day) ?? undefined

    const card = topCard(line)
    for (const candidate of card.querySelectorAll('p, span')) {
      const content = text(candidate)
      const salary = 80 > content.length ? salaryFromText(content) : null
      if (salary) {
        offer.salary = salary
        break
      }
    }
  }

  const heading = [...root.querySelectorAll('h2')].find((h2) => ABOUT.test(text(h2)))
  const block = heading?.parentElement?.nextElementSibling
  if (block) {
    offer.description = htmlToText(block.innerHTML) || undefined
  }

  return Object.fromEntries(Object.entries(offer).filter(([, value]) => undefined !== value)) as ReadOffer
}
