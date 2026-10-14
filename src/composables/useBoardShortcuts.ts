import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { applicationIdOf, cardOf, isTyping, moveOfKey, neighbour, neighbourColumn } from '../services/boardKeys'

interface Deps {
  // Whether the keys are on (the setting), read at each key.
  enabled: () => boolean
  // Moves a card to a column and saves it.
  drop: (applicationId: string, statusId: string) => Promise<void>
  // The words that tell a card went to a column, said to a screen reader and shown.
  moved: (statusId: string) => void
}

// The keys of the board, for the ones who work with the keyboard:
//   /                  the search;
//   arrows             from a card to the next, the previous, and to the neighbour column;
//   Shift and arrows   the card moves to the neighbour column (the same move as the field "status" of its drawer).
// A key does nothing while the drawer or a question is open, while someone types, or with Control, Alt or Meta held: those are
// the keys of the browser and of the screen reader. The setting turns all of them off.
export function useBoardShortcuts({ enabled, drop, moved }: Deps) {
  async function onKeydown(event: KeyboardEvent) {
    if (!enabled() || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
      return
    }
    if (document.querySelector('dialog[open]')) {
      return
    }
    if ('/' === event.key && !isTyping(event.target)) {
      const search = document.querySelector<HTMLInputElement>('input[name=search]')
      if (search) {
        event.preventDefault()
        search.focus()
      }
      return
    }
    const card = cardOf(event.target)
    const rtl = 'rtl' === document.documentElement.dir
    const move = card ? moveOfKey(event.key, rtl) : null
    if (!card || !move) {
      return
    }
    event.preventDefault()
    if (!event.shiftKey) {
      neighbour(card, move)?.focus()
      return
    }
    if ('previous' !== move && 'next' !== move) {
      return
    }
    const column = neighbourColumn(card, move)
    const applicationId = applicationIdOf(card)
    const statusId = column?.dataset.status
    if (!applicationId || !statusId) {
      return
    }
    await drop(applicationId, statusId)
    // The card is drawn again in its new column: the focus goes back to it.
    await nextTick()
    document.querySelector<HTMLElement>(`[data-application="${applicationId}"] .card-open`)?.focus()
    moved(statusId)
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
