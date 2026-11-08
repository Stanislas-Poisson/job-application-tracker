import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYS,
  KEY_ACTIONS,
  type KeyBinding,
  type PressedKey,
  actionOfKey,
  bindingFromEvent,
  conflicts,
  describeKey,
  keysInUse,
  normalizeShortcutKeys,
} from '../../src/services/shortcutKeys'

const press = (code: string, key = '', more: Partial<PressedKey> = {}): PressedKey => ({
  code,
  key,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...more,
})
const binding = (code: string, shift = false, label = ''): KeyBinding => ({ code, shift, label })

describe('the keys in use', () => {
  it('are the defaults where the layout is known', () => {
    const table = keysInUse({}, true)
    for (const action of KEY_ACTIONS) {
      expect(table[action]?.code).toBe(DEFAULT_KEYS[action].code)
      expect(table[action]?.shift).toBe(DEFAULT_KEYS[action].shift)
    }
  })

  it('are none where the layout is not known, since nobody could tell which keys they are', () => {
    for (const action of KEY_ACTIONS) {
      expect(keysInUse({}, false)[action]).toBeNull()
    }
  })

  it('keep what the user chose where the layout is not known, and honour a removed key', () => {
    const table = keysInUse({ search: binding('KeyG', false, 'g'), up: null }, false)
    expect(table.search?.code).toBe('KeyG')
    expect(table.up).toBeNull()
    expect(keysInUse({ up: null }, true).up).toBeNull()
  })
})

describe('the action of a key', () => {
  it('is found by the place of the key, so an AZERTY keyboard that says Q at the place of the A gets the action of the A', () => {
    expect(actionOfKey(press('KeyA', 'q'), {}, true)).toBe('left')
    expect(actionOfKey(press('KeyA', 'q', { shiftKey: true }), {}, true)).toBe('moveLeft')
    expect(actionOfKey(press('KeyF', 'f'), {}, true)).toBe('search')
    expect(actionOfKey(press('KeyE', 'e'), {}, true)).toBe('open')
  })

  it('does nothing for a default where the layout is not known, but the arrows always work', () => {
    expect(actionOfKey(press('KeyF', 'f'), {}, false)).toBeNull()
    expect(actionOfKey(press('ArrowLeft'), {}, false)).toBe('left')
    expect(actionOfKey(press('ArrowRight', '', { shiftKey: true }), {}, false)).toBe('moveRight')
    expect(actionOfKey(press('ArrowUp'), {}, false)).toBe('up')
    expect(actionOfKey(press('ArrowUp', '', { shiftKey: true }), {}, false)).toBeNull()
  })

  it('follows a key the user chose, and no longer the one it replaced', () => {
    const keys = { search: binding('KeyG', false, 'g') }
    expect(actionOfKey(press('KeyG', 'g'), keys, false)).toBe('search')
    expect(actionOfKey(press('KeyF', 'f'), keys, true)).toBeNull()
  })

  it('wants Shift as the key says, and never Control, Alt or Meta', () => {
    expect(actionOfKey(press('KeyD', 'd', { shiftKey: true }), {}, true)).toBe('moveRight')
    expect(actionOfKey(press('KeyD', 'd', { ctrlKey: true }), {}, true)).toBeNull()
    expect(actionOfKey(press('KeyD', 'd', { altKey: true }), {}, true)).toBeNull()
    expect(actionOfKey(press('KeyD', 'd', { metaKey: true }), {}, true)).toBeNull()
  })
})

describe('choosing a key by pressing it', () => {
  it('takes the place, Shift, and the letter the key has on this keyboard', () => {
    expect(bindingFromEvent(press('KeyQ', 'a'))).toEqual({ binding: { code: 'KeyQ', shift: false, label: 'a' } })
    expect(bindingFromEvent(press('KeyG', 'G', { shiftKey: true }))).toEqual({
      binding: { code: 'KeyG', shift: true, label: 'g' },
    })
    expect(bindingFromEvent(press('F5', 'F5'))).toEqual({ binding: { code: 'F5', shift: false, label: 'F5' } })
  })

  it('refuses the keys of the page, the arrows, the keys that only change another, and anything with Control, Alt or Meta', () => {
    for (const code of [
      'Tab',
      'Enter',
      'Space',
      'Escape',
      'Backspace',
      'ShiftLeft',
      'ControlRight',
      'AltLeft',
      'MetaLeft',
      'ArrowUp',
    ]) {
      expect(bindingFromEvent(press(code, code))).toEqual({ problem: 'forbidden' })
    }
    expect(bindingFromEvent(press('KeyG', 'g', { ctrlKey: true }))).toEqual({ problem: 'forbidden' })
    expect(bindingFromEvent(press('KeyG', 'g', { altKey: true }))).toEqual({ problem: 'forbidden' })
    expect(bindingFromEvent(press('KeyG', 'g', { metaKey: true }))).toEqual({ problem: 'forbidden' })
  })
})

describe('the keys that clash', () => {
  it('are two actions on one key, with or without Shift', () => {
    const table = keysInUse({}, true)
    expect(conflicts(table)).toEqual([])
    const clash = { ...table, search: binding('KeyW') }
    expect(conflicts(clash)).toEqual([['search', 'up']])
    // Shift and the same key is another key.
    expect(conflicts({ ...table, search: binding('KeyW', true) })).toEqual([])
  })

  it('let two keys be swapped one after the other: the clash is there between the two steps, and gone at the end', () => {
    const table = keysInUse({}, true)
    const first = { ...table, up: table.down }
    expect(conflicts(first)).toEqual([['up', 'down']])
    const second = { ...first, down: table.up }
    expect(conflicts(second)).toEqual([])
  })
})

describe('showing a key', () => {
  it('uses the letter the browser says for the place, else the one the user pressed, else the name of the place', () => {
    expect(describeKey(binding('KeyA', false, 'a'), (code) => ('KeyA' === code ? 'q' : undefined))).toBe('Q')
    expect(describeKey(binding('KeyA', true, 'a'), () => undefined)).toBe('Shift + A')
    expect(describeKey(binding('KeyF'), () => undefined)).toBe('F')
    expect(describeKey(binding('Digit4'), () => undefined)).toBe('4')
  })
})

describe('what is stored', () => {
  it('keeps the keys that are keys and the nulls, for the actions that exist', () => {
    expect(
      normalizeShortcutKeys({
        search: { code: 'KeyG', shift: false, label: 'g', extra: 1 },
        up: null,
        down: { code: 'Tab', shift: false, label: 'tab' },
        left: { code: 'KeyA', shift: 'yes', label: 'a' },
        nothing: { code: 'KeyZ', shift: false, label: 'z' },
      })
    ).toEqual({ search: { code: 'KeyG', shift: false, label: 'g' }, up: null })
    expect(normalizeShortcutKeys('x')).toEqual({})
    expect(normalizeShortcutKeys(null)).toEqual({})
  })
})
