// The order of the rows of a table. A value is a number (compared by its value), a text (compared by the language), or null (no value:
// it goes last, whichever the way). Equal rows keep the order they came in, so that sorting twice does not shuffle them.
export function sortRows<Row>(
  rows: readonly Row[],
  value: (row: Row) => string | number | null,
  direction: 'asc' | 'desc',
  compareText: (a: string, b: string) => number
): Row[] {
  const way = 'asc' === direction ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      if (null === a.value || null === b.value) {
        return null === a.value && null === b.value ? a.index - b.index : null === a.value ? 1 : -1
      }
      const order =
        'number' === typeof a.value && 'number' === typeof b.value
          ? a.value - b.value
          : compareText(String(a.value), String(b.value))
      return 0 === order ? a.index - b.index : order * way
    })
    .map((entry) => entry.row)
}
