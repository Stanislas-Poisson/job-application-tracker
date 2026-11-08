import { describe, expect, it } from 'vitest'
import { chooseAction, pendingChoice } from '../../src/composables/useConfirm'

const choices = [
  { value: 'keep', label: 'Keep editing', initial: true },
  { value: 'discard', label: 'Close without saving', danger: true },
  { value: 'save', label: 'Save and close' },
]

describe('a question with several answers', () => {
  it('is pending while it waits, and gives the value of the choice', async () => {
    const answer = chooseAction({ message: 'Something changed.', choices })
    expect(pendingChoice.value?.choices.map((choice) => choice.value)).toEqual(['keep', 'discard', 'save'])
    pendingChoice.value?.answer('save')
    expect(await answer).toBe('save')
    expect(pendingChoice.value).toBeNull()
  })

  it('gives nothing when it is dismissed (Escape)', async () => {
    const answer = chooseAction({ message: 'Something changed.', choices })
    pendingChoice.value?.answer(null)
    expect(await answer).toBeNull()
  })

  it('is answered with nothing when another question takes its place', async () => {
    const first = chooseAction({ message: 'First.', choices })
    const second = chooseAction({ message: 'Second.', choices })
    expect(await first).toBeNull()
    expect(pendingChoice.value?.message).toBe('Second.')
    pendingChoice.value?.answer('discard')
    expect(await second).toBe('discard')
  })
})
