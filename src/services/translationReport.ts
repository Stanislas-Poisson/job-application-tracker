import { ISSUES_URL } from '../extraction/report'

/**
 * The address of a new issue to tell of a mistake in a translation. It is a link the user opens and sends by hand with
 * their own account: the extension sends nothing. It holds the code of the language, and nothing of the user's data.
 */
export function translationReportUrl(code: string): string {
  const query = new URLSearchParams({
    template: 'translation.yml',
    title: `[Translation] ${code}`,
    language: code,
  })
  return `${ISSUES_URL}?${query.toString()}`
}
