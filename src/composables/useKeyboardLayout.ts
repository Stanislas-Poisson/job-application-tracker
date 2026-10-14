import { computed, onMounted, shallowRef } from 'vue'

// The keyboard API is in Chrome and Edge, not yet in Firefox or Safari: a page asks, and without an answer the layout is unknown.
interface LayoutMap {
  get(code: string): string | undefined
}
type KeyboardApi = { getLayoutMap?: () => Promise<LayoutMap> }

// The layout of the keyboard of the person: what each place of the keyboard says (the key of the QWERTY A says Q on an AZERTY
// keyboard). `known` is false where the browser does not tell, and the keys that depend on a layout are then not in use.
export function useKeyboardLayout() {
  const map = shallowRef<LayoutMap | null>(null)

  onMounted(async () => {
    try {
      const keyboard = (navigator as unknown as { keyboard?: KeyboardApi }).keyboard
      map.value = (await keyboard?.getLayoutMap?.()) ?? null
    } catch {
      // The browser refuses (a page that is not the top one, a policy): the layout is not known.
      map.value = null
    }
  })

  return {
    known: computed(() => null !== map.value),
    letterOf: (code: string): string | undefined => map.value?.get(code),
  }
}
