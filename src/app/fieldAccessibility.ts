import type { App, ComponentInternalInstance, ComponentPublicInstance } from 'vue'

// The form components of the library draw a label whose `for` does not point at the control it labels (and no `for` at all for a
// select), and give a control that has no visible label no name. This gives every control of those components a real label:
// an `id` that the label points at, or, where the page shows no label, the `aria-label` the page asked for with `data-label`.

const FIELDS = new Set(['FormInput', 'FormSelect', 'FormTextarea'])
const CONTROL = 'input:not([type="hidden"]), select, textarea'

let counter = 0

// The elements a component drew: its root, or all of the nodes of a fragment.
function elementsOf(instance: ComponentInternalInstance): Element[] {
  const { el, anchor } = instance.subTree
  if (el instanceof Element) {
    return [el]
  }
  const found: Element[] = []
  const end = anchor instanceof Node ? anchor : null
  for (let node: Node | null = el instanceof Node ? el : null; node && node !== end; node = node.nextSibling) {
    if (node instanceof Element) {
      found.push(node)
    }
  }
  return found
}

function label(component: ComponentPublicInstance) {
  const elements = elementsOf(component.$)
  const control = elements.flatMap((element) =>
    element.matches(CONTROL) ? [element] : [...element.querySelectorAll(CONTROL)]
  )[0] as HTMLInputElement | undefined
  if (!control) {
    return
  }
  const shown = elements.flatMap((element) =>
    element.matches('label') ? [element] : [...element.querySelectorAll('label')]
  )
  const named = shown.find((candidate) => '' !== (candidate.textContent ?? '').trim()) as HTMLLabelElement | undefined
  if (named) {
    if ('' === control.id) {
      counter += 1
      control.id = `field-${control.name || 'x'}-${String(counter)}`
    }
    named.htmlFor = control.id
    control.removeAttribute('aria-label')
    return
  }
  const text = String(component.$attrs['data-label'] ?? '')
  if ('' !== text) {
    control.setAttribute('aria-label', text)
  }
}

export function installFieldAccessibility(app: App) {
  app.mixin({
    mounted(this: ComponentPublicInstance) {
      if (FIELDS.has(String(this.$options.name))) {
        label(this)
      }
    },
    updated(this: ComponentPublicInstance) {
      if (FIELDS.has(String(this.$options.name))) {
        label(this)
      }
    },
  })
}
