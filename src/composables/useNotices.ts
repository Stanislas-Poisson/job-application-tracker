import { shallowRef } from 'vue'

// Short messages that tell the result of what was just done (saved, imported, restored…), shown over the page for a few
// seconds, and the ones that offer to undo it. The state is shared by the whole page; NoticeHost.vue draws it.

export type NoticeKind = 'success' | 'info' | 'error'

export interface NoticeAction {
  label: string
  run: () => void | Promise<void>
}

export interface Notice {
  id: number
  kind: NoticeKind
  text: string
  action?: NoticeAction
  // Milliseconds before it goes by itself; 0 keeps it until it is closed.
  duration: number
}

// How long a message stays: long enough to be read, longer when there is something to press. An error stays until it is closed.
export const DURATIONS = { success: 6000, info: 6000, undo: 10000, error: 0 } as const
// More than this at once and the oldest goes: a pile of messages is not read.
export const MAX_NOTICES = 4

export const notices = shallowRef<readonly Notice[]>([])

interface Timer {
  handle: ReturnType<typeof setTimeout> | undefined
  startedAt: number
  left: number
}
const timers = new Map<number, Timer>()
let next = 1

function start(id: number, left: number) {
  if (0 >= left) {
    return
  }
  timers.set(id, { handle: setTimeout(() => dismiss(id), left), startedAt: Date.now(), left })
}

export function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer.handle)
    timers.delete(id)
  }
  notices.value = notices.value.filter((notice) => notice.id !== id)
}

// The countdown stops while the pointer or the focus is on a message (a person reading or reaching for the button).
export function pause(id: number) {
  const timer = timers.get(id)
  if (timer?.handle !== undefined) {
    clearTimeout(timer.handle)
    timer.left = Math.max(1000, timer.left - (Date.now() - timer.startedAt))
    timer.handle = undefined
  }
}

export function resume(id: number) {
  const timer = timers.get(id)
  if (timer && timer.handle === undefined) {
    start(id, timer.left)
  }
}

export function clearNotices() {
  for (const notice of notices.value) {
    dismiss(notice.id)
  }
}

function add(kind: NoticeKind, text: string, duration: number, action?: NoticeAction): number {
  // The same message again is not stacked: the one that is there starts over.
  const same = notices.value.find((notice) => notice.kind === kind && notice.text === text && !notice.action && !action)
  if (same) {
    dismiss(same.id)
  }
  const id = next++
  const kept = notices.value.slice(-(MAX_NOTICES - 1))
  for (const dropped of notices.value.filter((notice) => !kept.includes(notice))) {
    dismiss(dropped.id)
  }
  notices.value = [...kept, { id, kind, text, duration, ...(action ? { action } : {}) }]
  start(id, duration)
  return id
}

export const notifySuccess = (text: string): number => add('success', text, DURATIONS.success)
export const notifyInfo = (text: string): number => add('info', text, DURATIONS.info)
export const notifyError = (text: string): number => add('error', text, DURATIONS.error)

// A message with a button that undoes what was done. The button closes the message and runs.
export function notifyUndo(text: string, label: string, run: () => void | Promise<void>): number {
  const id = next
  return add('success', text, DURATIONS.undo, {
    label,
    run: async () => {
      dismiss(id)
      await run()
    },
  })
}

export const useNotices = () => ({
  notices,
  success: notifySuccess,
  info: notifyInfo,
  error: notifyError,
  undo: notifyUndo,
  dismiss,
  pause,
  resume,
  clear: clearNotices,
})

// The result of an action, in the way every page tells it: a message over the page. Nothing is shown for an empty text.
export function say(text: string, error = false): void {
  if ('' !== text) {
    error ? notifyError(text) : notifySuccess(text)
  }
}
