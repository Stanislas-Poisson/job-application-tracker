import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import {
  applicationIdOf,
  cardOf,
  isTyping,
  moveOfAction,
  movesCard,
  neighbour,
  neighbourColumn,
} from '../services/boardKeys'
import { type ShortcutKeys, actionOfKey } from '../services/shortcutKeys'

interface Deps {
  // Whether the keys are on (the setting), read at each key.
  enabled: () => boolean
  // The keys the user chose, and whether the layout of their keyboard is known (without it the defaults are not in use).
  keys: () => ShortcutKeys
  layoutKnown: () => boolean
  // Moves a card to a column and saves it.
  drop: (applicationId: string, statusId: string) => Promise<void>
  // The words that tell a card went to a column, said to a screen reader and shown.
  moved: (statusId: string) => void
}

// The keys of the board, for the ones who work with the keyboard. The arrows always work; the others are set in the options (by
// default F to find and W A S D to move, where the layout of the keyboard is known):
//   search             the search;
//   up down left right from a card to the next, the previous, and to the neighbour column;
//   Shift and left or right   the card moves to the neighbour column (the same move as the field "status" of its drawer).
// A key does nothing while the drawer or a question is open, while someone types, or with Control, Alt or Meta held: those are
// the keys of the browser and of the screen reader. The setting turns all of them off.
export function useBoardShortcuts({ enabled, keys, layoutKnown, drop, moved }: Deps) {
  async function onKeydown(event: KeyboardEvent) {
    if (!enabled() || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) {
      return
    }
    if (document.querySelector('dialog[open]') || isTyping(event.target)) {
      return
    }
    const action = actionOfKey(event, keys(), layoutKnown())
    if (!action) {
      return
    }
    if ('search' === action) {
      const search = document.querySelector<HTMLInputElement>('input[name=search]')
      if (search) {
        event.preventDefault()
        search.focus()
      }
      return
    }
    const card = cardOf(event.target)
    const move = card ? moveOfAction(action, 'rtl' === document.documentElement.dir) : null
    if (!card || !move) {
      return
    }
    event.preventDefault()
    if (!movesCard(action)) {
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
