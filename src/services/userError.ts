// An error the user is told about. The message is in English, for the logs and the tests; the page writes the text of `code`
// in its own language (problems.<code>), with the `params` in it.
export class UserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly params: Record<string, string | number> = {}
  ) {
    super(message)
    this.name = 'UserError'
  }
}

// What to show for an error caught in a page: the text of a problem we know, or the message of any other one.
export function problemText(
  error: unknown,
  t: (path: string, replacements?: Record<string, string | number>) => string
): string {
  if (error instanceof UserError) {
    return t(`problems.${error.code}`, error.params)
  }
  return t('problems.other', { message: error instanceof Error ? error.message : String(error) })
}
