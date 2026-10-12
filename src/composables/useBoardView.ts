import { type InjectionKey, inject, onMounted, onUnmounted, provide, reactive, watch } from 'vue'
import { browserAdapter } from '../persistence/adapter'
import { type BoardView, DEFAULT_VIEW, normalizeView } from '../services/boardQuery'

export const VIEW_KEY = 'jat:view'
const VIEW_INJECTION: InjectionKey<BoardView> = Symbol('board-view')

// The view of the board, for a component that sits under it.
export function useProvidedView(): BoardView {
  const view = inject(VIEW_INJECTION)
  if (!view) {
    throw new Error('The board view is not provided: call useBoardView() in the page.')
  }
  return view
}

// What the user chose to see on the board. It is kept in the browser, so that the board opens as it was left.
export function useBoardView() {
  const view = reactive<BoardView>({ ...DEFAULT_VIEW })
  provide(VIEW_INJECTION, view)
  let loaded = false
  let timer: ReturnType<typeof setTimeout> | undefined

  onMounted(async () => {
    const stored = await browserAdapter.get([VIEW_KEY])
    Object.assign(view, normalizeView(stored[VIEW_KEY]))
    loaded = true
  })

  const save = () => {
    clearTimeout(timer)
    void browserAdapter.set({ [VIEW_KEY]: JSON.parse(JSON.stringify(view)) as BoardView })
  }

  // The view is written a moment after the last change, and as plain data (a browser cannot store a proxy). A page that
  // is left or reloaded writes it at once.
  watch(
    view,
    () => {
      if (loaded) {
        clearTimeout(timer)
        timer = setTimeout(save, 300)
      }
    },
    { deep: true }
  )
  const leave = () => loaded && save()
  window.addEventListener('pagehide', leave)
  onUnmounted(() => window.removeEventListener('pagehide', leave))

  // Turns every filter off. The sort and the archive switch stay as they are.
  function clearFilters() {
    Object.assign(view, {
      ...DEFAULT_VIEW,
      showArchived: view.showArchived,
      sort: view.sort,
      direction: view.direction,
    })
  }

  return { view, clearFilters }
}
