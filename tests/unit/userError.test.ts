import { describe, expect, it } from 'vitest'
import { UserError, problemText } from '../../src/services/userError'

const t = (path: string, replacements?: Record<string, string | number>) => `${path}|${JSON.stringify(replacements)}`

describe('problemText', () => {
  it('writes the text of a known problem, with its values', () => {
    expect(problemText(new UserError('shortPassphrase', 'english', { min: 8 }), t)).toBe(
      'problems.shortPassphrase|{"min":8}'
    )
  })

  it('shows the message of any other error', () => {
    expect(problemText(new Error('disk full'), t)).toBe('problems.other|{"message":"disk full"}')
    expect(problemText('oops', t)).toBe('problems.other|{"message":"oops"}')
  })
})
