// The languages the extension comes with: one file of texts per language in locales/. English is part of every page (it
// is what a missing text falls back to); each of the others is its own chunk, read from the extension when the language is
// used and never otherwise. Adding a language is adding its file there (and a line in languages.ts).
const loaders = import.meta.glob<{ default: Record<string, unknown> }>(['./locales/*.ts', '!./locales/en.ts'])

const codeOf = (path: string): string => path.replace(/^.*\/(.+)\.ts$/, '$1')

const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = Object.fromEntries(
  Object.entries(loaders).map(([path, load]) => [codeOf(path), load])
)

const reads = new Map<string, Promise<Record<string, unknown>>>()

// The texts of a language the extension comes with, read once. English is not here: it is already in the page.
export function readShipped(code: string): Promise<Record<string, unknown>> | undefined {
  const load = LOADERS[code]
  if (!load) {
    return undefined
  }
  let read = reads.get(code)
  if (!read) {
    read = load().then((module) => module.default)
    reads.set(code, read)
  }
  return read
}
