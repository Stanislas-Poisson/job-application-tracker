// A checksum tells that a backup file is as it was saved. It catches a file that was cut off, saved again by a tool or
// edited by hand without meaning to. It is not a protection against someone who changes the file on purpose: they can
// compute it again. (A backup protected by a passphrase is authenticated by its encryption.)
//
// It is computed on the canonical form of the file, with the keys in order and without the checksum itself, so that a new
// indentation or another order of keys does not break it.

export const CHECKSUM_PREFIX = 'sha256:'

export type ChecksumStatus = 'valid' | 'invalid' | 'missing'

// JSON with the keys of every object in alphabetical order, on one line.
export function canonicalJson(value: unknown): string {
  const sorted = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sorted)
      : 'object' === typeof item && null !== item
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([key, inner]) => [key, sorted(inner)])
          )
        : item
  return JSON.stringify(sorted(value))
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// "sha256:…" of a file, whatever checksum it carries.
export async function checksumOf(file: object): Promise<string> {
  const { checksum: _carried, ...rest } = file as Record<string, unknown>
  return `${CHECKSUM_PREFIX}${await sha256Hex(canonicalJson(rest))}`
}

export async function withChecksum<T extends object>(file: T): Promise<T & { checksum: string }> {
  return { ...file, checksum: await checksumOf(file) }
}

// Whether the checksum of a file matches its content: missing when the file has none (an older backup).
export async function verifyChecksum(file: unknown): Promise<ChecksumStatus> {
  if ('object' !== typeof file || null === file) {
    return 'missing'
  }
  const carried = (file as { checksum?: unknown }).checksum
  if (undefined === carried) {
    return 'missing'
  }
  return carried === (await checksumOf(file)) ? 'valid' : 'invalid'
}
