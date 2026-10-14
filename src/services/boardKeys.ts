// The keys of the board, on what the page draws: the cards are the buttons that open them, in the columns, side by side. They are
// found in the page itself, so that what the keys do is what is on the screen (a filter, a search, a sort) and nothing else.

const CARD = '.application-card .card-open'
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

export type Move = 'up' | 'down' | 'previous' | 'next'

const KEYS: Record<string, Move | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

// The key says where on the screen, so in a language read from right to left the previous column is on the right.
export function moveOfKey(key: string, rtl: boolean): Move | null {
  const found = KEYS[key]
  if (!found) {
    return null
  }
  if ('left' !== found && 'right' !== found) {
    return found
  }
  const towardsStart = rtl ? 'right' === found : 'left' === found
  return towardsStart ? 'previous' : 'next'
}

// A person typing, or choosing in a list: the keys belong to the field, not to the page.
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(EDITABLE)
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
