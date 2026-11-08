import { type ReadOffer, htmlToText } from '../jobPosting'
import { salaryFromText } from '../salaryText'

// Glassdoor gives its pages no JobPosting data, and the names of its classes end with a code that changes. What stays the same
// are the `data-test` attributes of the header of the offer that is open (title, place, pay), the heading of the company in it,
// and the beginning of the class of the description. A page with no such header (a list of offers) says nothing.

const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

export function readGlassdoor(doc: Document): ReadOffer {
  const header = doc.querySelector('[data-test="job-details-header"]')
  if (!header) {
    return {}
  }
  const offer: ReadOffer = {}
  const title = text(header.querySelector('h1'))
  const company = text(header.querySelector('[class*="EmployerProfile_employerNameHeading"]'))
  const place = text(header.querySelector('[data-test="location"]'))
  if ('' !== title) {
    offer.title = title
  }
  if ('' !== company) {
    offer.companyName = company
  }
  if ('' !== place) {
    offer.location = place
  }
  // "42 k € - 92 k € (fourni par l’employeur)": the range, with no period said.
  const pay = header.querySelector('[data-test="detailSalary"]')
  const salary = pay && 80 > text(pay).length ? salaryFromText(text(pay)) : null
  if (salary) {
    offer.salary = salary
  }
  const description = doc.querySelector('[class*="JobDetails_jobDescription"]')
  const body = description ? htmlToText(description.innerHTML) : ''
  if ('' !== body) {
    offer.description = body
  }
  return offer
}
