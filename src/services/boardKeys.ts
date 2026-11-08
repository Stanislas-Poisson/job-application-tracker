// The keys of the board, on what the page draws: the cards are the buttons that open them, in the columns, side by side. They are
// found in the page itself, so that what the keys do is what is on the screen (a filter, a search, a sort) and nothing else.

import type { KeyAction } from './shortcutKeys'

const CARD = '.application-card .card-open'
// What takes the keys of a person who types or chooses: the fields, the editable parts (also in their plain-text form) and what
// plays the role of a field. A key pressed there is for it, not for the page.
const EDITABLE =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="spinbutton"]'

export type Move = 'up' | 'down' | 'previous' | 'next'

// An action says where on the screen, so in a language read from right to left the previous column is on the right.
export function moveOfAction(action: KeyAction, rtl: boolean): Move | null {
  if ('up' === action || 'down' === action) {
    return action
  }
  if ('left' === action || 'right' === action || 'moveLeft' === action || 'moveRight' === action) {
    const towardsStart = rtl ? 'right' === action || 'moveRight' === action : 'left' === action || 'moveLeft' === action
    return towardsStart ? 'previous' : 'next'
  }
  return null
}

// The actions that move the card itself, and not the focus.
export const movesCard = (action: KeyAction): boolean => 'moveLeft' === action || 'moveRight' === action

// A person typing, or choosing in a list: the keys belong to the field, not to the page.
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.matches(EDITABLE) || null !== target.closest('[contenteditable]:not([contenteditable="false"])'))
  )
}

const columnsOf = (board: ParentNode): HTMLElement[] => [...board.querySelectorAll<HTMLElement>('section.column')]
const cardsOf = (column: Element): HTMLElement[] => [...column.querySelectorAll<HTMLElement>(CARD)]

// The card to go to from the one that has the focus. Up and down stay in the column; the sides go to the nearest column that has
// a card, at the same height, or the last one it has. Nothing: the edge of the board, where the focus stays.
export function neighbour(card: Element, move: Move, board: ParentNode = document): HTMLElement | null {
  const column = card.closest('section.column')
  if (!column) {
    return null
  }
  const here = cardsOf(column)
  const index = here.indexOf(card as HTMLElement)
  if ('up' === move || 'down' === move) {
    return here[index + ('up' === move ? -1 : 1)] ?? null
  }
  const columns = columnsOf(board)
  const step = 'next' === move ? 1 : -1
  for (let at = columns.indexOf(column as HTMLElement) + step; 0 <= at && at < columns.length; at += step) {
    const cards = cardsOf(columns[at] as HTMLElement)
    if (0 < cards.length) {
      return cards[Math.min(index, cards.length - 1)] ?? null
    }
  }
  return null
}

// The column a card goes to with the same keys held with Shift: the next one, whether it has cards or not.
export function neighbourColumn(
  card: Element,
  move: 'previous' | 'next',
  board: ParentNode = document
): HTMLElement | null {
  const column = card.closest('section.column')
  const columns = columnsOf(board)
  const at = column ? columns.indexOf(column as HTMLElement) : -1
  return -1 === at ? null : (columns[at + ('next' === move ? 1 : -1)] ?? null)
}

export const cardOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? (target.closest(CARD) as HTMLElement | null) : null

export const applicationIdOf = (card: Element): string | null =>
  card.closest<HTMLElement>('.application-card')?.dataset.application ?? null
