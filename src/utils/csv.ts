// A reader for CSV (RFC 4180): fields in quotes, a quote written twice inside a field, line breaks inside a quoted field.
// The separator is found from the first line: a comma, a semicolon (what a spreadsheet writes in many countries) or a tab.

function detectSeparator(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t'].map((separator) => [separator, first.split(separator).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0] && 0 < counts[0][1] ? counts[0][0] : ','
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\u{FEFF}/u, '')
  const separator = detectSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (quoted) {
      if ('"' === char && '"' === text[index + 1]) {
        field += '"'
        index += 1
      } else if ('"' === char) {
        quoted = false
      } else {
        field += char
      }
    } else if ('"' === char && '' === field) {
      quoted = true
    } else if (char === separator) {
      row.push(field)
      field = ''
    } else if ('\n' === char || '\r' === char) {
      if ('\r' === char && '\n' === text[index + 1]) {
        index += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if ('' !== field || 0 < row.length) {
    row.push(field)
    rows.push(row)
  }
  // A line with nothing in it is not a record.
  return rows.filter((cells) => cells.some((cell) => '' !== cell.trim()))
}

// The rows as records, by the names of the first row (in lower case, with no space).
export function csvRecords(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input)
  if (!header) {
    return []
  }
  const names = header.map((name) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
  )
  return rows.map((cells) => Object.fromEntries(names.map((name, index) => [name, (cells[index] ?? '').trim()])))
}
