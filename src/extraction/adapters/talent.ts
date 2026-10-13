import type { ReadOffer } from '../jobPosting'
import type { PageSnapshot } from '../page'

// Talent.com publishes no JobPosting data, but its pages follow a pattern that stays the same from one offer to the next:
//
//   title        "Job title – Company – Job offer, contract Place, Region"
//   description  "Apply for the job of « Job title » (contract). Company is hiring (Place, Region). ..."
//
// so the company comes from the title, and the place from the parentheses after "recrute"/"is hiring". The page itself does not
// need to be read, only its title and its tags. The words are the ones of the language of the site (French for now).

const DASH = /\s+[–—]\s+/
const HIRING = /(?:recrute|is hiring|recrutement)\s*\(([^()]+)\)/i

export function readTalent(snapshot: PageSnapshot): ReadOffer {
  const offer: ReadOffer = {}
  const title = (snapshot.meta['og:title'] ?? snapshot.title).trim()
  const parts = title.split(DASH).map((part) => part.trim())
  // "Title – Company – Job offer …": the first part is the title, the second the company.
  if (3 <= parts.length && parts[0] && parts[1]) {
    offer.title = parts[0]
    offer.companyName = parts[1]
  }
  const place = HIRING.exec(snapshot.meta['og:description'] ?? snapshot.meta.description ?? '')?.[1]
  if (place) {
    offer.location = place.trim()
  }
  return offer
}
