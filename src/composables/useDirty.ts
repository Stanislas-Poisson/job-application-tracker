import { onBeforeUnmount, onMounted, reactive } from 'vue'

// What is typed in a form and not saved yet. Every form that can hold unsaved text says so with `useDirtyGuard`, and the
// page asks `anyDirty()` before it lets the user lose it: the drawer when it is closed, the browser when the page is.
// (Data is written as soon as it changes, so this is only about text that was typed and never sent.)
const guards = reactive(new Set<() => boolean>())

export function useDirtyGuard(isDirty: () => boolean) {
  onMounted(() => guards.add(isDirty))
  onBeforeUnmount(() => guards.delete(isDirty))
}

export function anyDirty(): boolean {
  for (const guard of guards) {
    if (guard()) {
      return true
    }
  }
  return false
}

// The browser asks the user before the page goes away, only while something is unsaved.
export function warnBeforeLeaving(): () => void {
  const listener = (event: BeforeUnloadEvent) => {
    if (anyDirty()) {
      event.preventDefault()
      // Some browsers want a value to show their dialog.
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', listener)
  return () => window.removeEventListener('beforeunload', listener)
}

// A form with text fields: it is unsaved as soon as one of them holds something.
export const hasText = (...values: (string | null | undefined)[]): boolean =>
  values.some((value) => '' !== (value ?? '').trim())
