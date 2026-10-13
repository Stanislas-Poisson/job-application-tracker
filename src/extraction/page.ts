// What is taken from a page, as plain text: the reading itself happens in the extension, where it can be tested.
export interface PageSnapshot {
  url: string
  title: string
  // The text of every JSON-LD script of the page.
  jsonLd: string[]
  // The content of the meta tags, by name or property ("og:title", "description").
  meta: Record<string, string>
}

/**
 * Collects the snapshot. It is injected into the page the user is looking at, so it must stand alone: no import, no
 * reference to anything outside of it.
 */
export function collectSnapshot(): PageSnapshot {
  const meta: Record<string, string> = {}
  document.querySelectorAll('meta[content]').forEach((tag) => {
    const key = tag.getAttribute('property') ?? tag.getAttribute('name')
    const value = tag.getAttribute('content')
    if (key && value && !(key in meta)) {
      meta[key.toLowerCase()] = value
    }
  })
  return {
    url: location.href,
    title: document.title,
    jsonLd: Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
      (script) => script.textContent ?? ''
    ),
    meta,
  }
}
