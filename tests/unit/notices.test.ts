import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAction, pendingConfirm } from '../../src/composables/useConfirm'
import {
  DURATIONS,
  MAX_NOTICES,
  clearNotices,
  notices,
  notifyError,
  notifySuccess,
  notifyUndo,
  pause,
  resume,
  say,
} from '../../src/composables/useNotices'

describe('the messages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearNotices()
  })
  afterEach(() => {
    clearNotices()
    vi.useRealTimers()
  })

  it('shows a success for a few seconds, and an error until it is closed', () => {
    notifySuccess('Saved')
    const error = notifyError('Broken')
    expect(notices.value.map((notice) => notice.kind)).toEqual(['success', 'error'])

    vi.advanceTimersByTime(DURATIONS.success + 1)
    expect(notices.value.map((notice) => notice.text)).toEqual(['Broken'])

    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(notices.value.map((notice) => notice.id)).toEqual([error])
  })

  it('does not stack the same message, and keeps no more than a few', () => {
    notifySuccess('Saved')
    notifySuccess('Saved')
    expect(notices.value).toHaveLength(1)

    for (let index = 0; index < MAX_NOTICES + 3; index++) {
      notifySuccess(`Message ${index}`)
    }
    expect(notices.value).toHaveLength(MAX_NOTICES)
    expect(notices.value.at(-1)?.text).toBe(`Message ${MAX_NOTICES + 2}`)
  })

  it('stops the countdown while the pointer is on a message, and starts it again after', () => {
    const id = notifySuccess('Saved')
    vi.advanceTimersByTime(DURATIONS.success - 1000)
    pause(id)
    vi.advanceTimersByTime(60 * 1000)
    expect(notices.value).toHaveLength(1)

    resume(id)
    vi.advanceTimersByTime(1500)
    expect(notices.value).toHaveLength(0)
  })

  it('offers to undo, closes the message and runs the undo', async () => {
    const undo = vi.fn()
    notifyUndo('Removed', 'Undo', undo)
    const [notice] = notices.value
    expect(notice?.action?.label).toBe('Undo')
    expect(notice?.duration).toBe(DURATIONS.undo)

    await notice?.action?.run()
    expect(undo).toHaveBeenCalledOnce()
    expect(notices.value).toHaveLength(0)
  })

  it('says nothing for an empty text, and an error for a failure', () => {
    say('')
    expect(notices.value).toHaveLength(0)
    say('Nope', true)
    expect(notices.value[0]?.kind).toBe('error')
  })
})

describe('the question', () => {
  it('resolves with the answer and clears itself', async () => {
    const asked = confirmAction({ message: 'Sure?' })
    expect(pendingConfirm.value?.message).toBe('Sure?')
    pendingConfirm.value?.answer(true)
    await expect(asked).resolves.toBe(true)
    expect(pendingConfirm.value).toBeNull()
  })

  it('answers no to a question that another one replaces', async () => {
    const first = confirmAction({ message: 'One?' })
    const second = confirmAction({ message: 'Two?' })
    await expect(first).resolves.toBe(false)
    expect(pendingConfirm.value?.message).toBe('Two?')
    pendingConfirm.value?.answer(false)
    await expect(second).resolves.toBe(false)
  })
})
