// The keys of the board, set by the user. A key is a place on the keyboard (`KeyboardEvent.code`), not a letter: the A of a
// QWERTY keyboard is the Q of an AZERTY one, and a hand that knows where the keys are keeps them when the layout changes.
// What the key says (its letter) is only for showing it, and it comes from the layout the browser reports (`getLayoutMap`),
// or from the key the user pressed to set it. Where neither is known, no key is suggested and the defaults are not in use.

export const KEY_ACTIONS = ['search', 'up', 'down', 'left', 'right', 'moveLeft', 'moveRight'] as const
export type KeyAction = (typeof KEY_ACTIONS)[number]

export interface KeyBinding {
  // The place of the key: "KeyF", "KeyW"…
  code: string
  // Held with Shift.
  shift: boolean
  // The letter the key had on the keyboard of the user when they chose it: to show it where the layout is not known.
  label: string
}

// What the user chose, by action. An action that is not in it keeps its default; null is "no key".
export type ShortcutKeys = Partial<Record<KeyAction, KeyBinding | null>>

// The defaults are drawn on the QWERTY keyboard: W A S D to move and F to find, Shift with A and D to move the card.
export const DEFAULT_KEYS: Record<KeyAction, { code: string; shift: boolean }> = {
  search: { code: 'KeyF', shift: false },
  up: { code: 'KeyW', shift: false },
  down: { code: 'KeyS', shift: false },
  left: { code: 'KeyA', shift: false },
  right: { code: 'KeyD', shift: false },
  moveLeft: { code: 'KeyA', shift: true },
  moveRight: { code: 'KeyD', shift: true },
}

// The arrows have the same place everywhere: they always work, and are not set.
const ARROWS: Record<string, { plain?: KeyAction; shifted?: KeyAction }> = {
  ArrowUp: { plain: 'up' },
  ArrowDown: { plain: 'down' },
  ArrowLeft: { plain: 'left', shifted: 'moveLeft' },
  ArrowRight: { plain: 'right', shifted: 'moveRight' },
}

// Keys that are not offered: those that move around the page and press its buttons, the arrows (they work already), the keys
// that only change another key, and Backspace (it edits).
const FORBIDDEN = new Set([
  'Tab',
  'Enter',
  'NumpadEnter',
  'Space',
  'Escape',
  'Backspace',
  'CapsLock',
  'ContextMenu',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  ...Object.keys(ARROWS),
])

const CODE = /^[A-Za-z][A-Za-z0-9]{1,19}$/

export const isKeyCode = (code: unknown): code is string =>
  'string' === typeof code && CODE.test(code) && !FORBIDDEN.has(code)

const isBinding = (value: unknown): value is KeyBinding => {
  const binding = value as Partial<KeyBinding> | null
  return (
    'object' === typeof binding &&
    null !== binding &&
    isKeyCode(binding.code) &&
    'boolean' === typeof binding.shift &&
    'string' === typeof binding.label &&
    24 >= binding.label.length
  )
}

// What is stored, kept only where it is a key or a null for a known action.
export function normalizeShortcutKeys(value: unknown): ShortcutKeys {
  const found: ShortcutKeys = {}
  if ('object' !== typeof value || null === value) {
    return found
  }
  for (const action of KEY_ACTIONS) {
    const stored = (value as Record<string, unknown>)[action]
    if (null === stored) {
      found[action] = null
    } else if (isBinding(stored)) {
      found[action] = { code: stored.code, shift: stored.shift, label: stored.label }
    }
  }
  return found
}

export interface PressedKey {
  code: string
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

export type Recorded = { binding: KeyBinding } | { problem: 'forbidden' }

// The key a person pressed to choose a key. Control, Alt and Meta are the keys of the browser and of the screen reader: a key
// held with them is refused, as are the ones listed above. Shift is allowed, as in Shift and A.
export function bindingFromEvent(event: PressedKey): Recorded {
  if (event.ctrlKey || event.altKey || event.metaKey || !isKeyCode(event.code)) {
    return { problem: 'forbidden' }
  }
  const label = 1 === [...event.key].length ? event.key.toLowerCase() : event.code
  return { binding: { code: event.code, shift: event.shiftKey, label } }
}

// The key of each action: the one chosen, or the default where the layout is known. Without a layout there is no default: the
// person could not tell which keys they are, so they are not in use until the person sets them.
export function keysInUse(keys: ShortcutKeys, layoutKnown: boolean): Record<KeyAction, KeyBinding | null> {
  const table = {} as Record<KeyAction, KeyBinding | null>
  for (const action of KEY_ACTIONS) {
    const chosen = keys[action]
    table[action] =
      undefined !== chosen
        ? chosen
        : layoutKnown
          ? { code: DEFAULT_KEYS[action].code, shift: DEFAULT_KEYS[action].shift, label: '' }
          : null
  }
  return table
}

// The action a key press is for, or null. The arrows come first, and are the same for everyone.
export function actionOfKey(event: PressedKey, keys: ShortcutKeys, layoutKnown: boolean): KeyAction | null {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null
  }
  const arrow = ARROWS[event.code]
  if (arrow) {
    return (event.shiftKey ? arrow.shifted : arrow.plain) ?? null
  }
  const table = keysInUse(keys, layoutKnown)
  return (
    KEY_ACTIONS.find((action) => table[action]?.code === event.code && table[action]?.shift === event.shiftKey) ?? null
  )
}

// The actions that have the same key, in groups: a key can do one thing.
export function conflicts(table: Record<KeyAction, KeyBinding | null>): KeyAction[][] {
  const groups = new Map<string, KeyAction[]>()
  for (const action of KEY_ACTIONS) {
    const binding = table[action]
    if (binding) {
      const id = `${binding.shift ? 'Shift+' : ''}${binding.code}`
      groups.set(id, [...(groups.get(id) ?? []), action])
    }
  }
  return [...groups.values()].filter((actions) => 1 < actions.length)
}

// How a key shows: the letter of the keyboard the person has, when the browser tells it, else the one they pressed.
export function describeKey(binding: KeyBinding, letterOf: (code: string) => string | undefined): string {
  const letter = letterOf(binding.code) ?? ('' !== binding.label ? binding.label : undefined)
  const name = (letter ?? binding.code.replace(/^Key|^Digit/, '')).toUpperCase()
  return binding.shift ? `Shift + ${name}` : name
}
