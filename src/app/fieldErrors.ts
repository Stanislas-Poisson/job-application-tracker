// A message of error that the page shows near a field is `role="alert"`: a screen reader says it when it appears. It is also
// tied to the field it is about, so that coming back to the field says it again and the field is marked as invalid. The pages
// show the message where the error is, not with the field, so the field is found from where the user was: the last control
// that had the focus inside the same form or block, else the first control before the message.

const CONTROL =
  'input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="color"], [type="file"]), select, textarea'
const BLOCK = 'form, dialog, .card, li, details, section, main'

let counter = 0
let lastControl: Element | null = null

function targetOf(alert: Element): Element | null {
  const block = alert.closest(BLOCK)
  if (!block) {
    return null
  }
  if (lastControl && block.contains(lastControl) && lastControl.matches(CONTROL)) {
    return lastControl
  }
  const before = [...block.querySelectorAll(CONTROL)].filter(
    (control) => control.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING
  )
  return before[before.length - 1] ?? null
}

function link(alert: Element) {
  if (!alert.matches('[role="alert"].error') || '' !== (alert.getAttribute('data-field-error') ?? '')) {
    return
  }
  const control = targetOf(alert)
  if (!control) {
    return
  }
  counter += 1
  const id = alert.id || `field-error-${String(counter)}`
  alert.id = id
  alert.setAttribute('data-field-error', id)
  const described = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean))
  described.add(id)
  control.setAttribute('aria-describedby', [...described].join(' '))
  control.setAttribute('aria-invalid', 'true')
}

function unlink(alert: Element) {
  const id = alert.getAttribute('data-field-error')
  if (!id) {
    return
  }
  for (const control of document.querySelectorAll(`[aria-describedby~="${id}"]`)) {
    const rest = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((token) => token && token !== id)
    if (0 < rest.length) {
      control.setAttribute('aria-describedby', rest.join(' '))
    } else {
      control.removeAttribute('aria-describedby')
      control.removeAttribute('aria-invalid')
    }
  }
}

const alerts = (node: Node): Element[] =>
  node instanceof Element
    ? [...(node.matches('[role="alert"].error') ? [node] : []), ...node.querySelectorAll('[role="alert"].error')]
    : []

export function installFieldErrors(doc: Document = document) {
  doc.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && event.target.matches(CONTROL)) {
      lastControl = event.target
    }
  })
  new MutationObserver((records) => {
    for (const record of records) {
      record.removedNodes.forEach((node) => alerts(node).forEach(unlink))
      record.addedNodes.forEach((node) => alerts(node).forEach(link))
    }
  }).observe(doc.body, { childList: true, subtree: true })
}
