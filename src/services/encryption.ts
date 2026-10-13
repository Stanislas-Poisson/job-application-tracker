import { canonicalJson } from '../utils/checksum'
import { EXPORT_APP } from './data'

// A backup protected by a passphrase. The file is still JSON, with a small readable header that says how it was
// encrypted, so that the way of encrypting can change later without losing the old files:
//
//   { app, format: "encrypted", version, kdf: { name, hash, iterations, salt }, cipher: { name, iv }, data }
//
// The key comes from the passphrase with PBKDF2 (SHA-256, a high number of iterations, a random salt), and the content is
// encrypted with AES-GCM (256 bits, a random nonce). GCM also authenticates: a changed byte, a wrong passphrase or a
// changed header makes the decryption fail, and the header is part of what is authenticated.
// The passphrase is never kept: not in the file, not in the storage.

export const ENCRYPTED_FORMAT = 'encrypted'
export const ENCRYPTION_VERSION = 1
// 600 000 is what OWASP advises for PBKDF2-SHA256 (2023).
export const DEFAULT_ITERATIONS = 600_000
// What a file may ask for: a file cannot make the browser compute for hours, nor use a weak derivation.
export const MIN_ITERATIONS = 100_000
export const MAX_ITERATIONS = 5_000_000
export const MIN_PASSPHRASE = 8

export interface EncryptedFile {
  app: typeof EXPORT_APP
  format: typeof ENCRYPTED_FORMAT
  version: number
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  data: string
}

// Thrown when the passphrase is wrong or the file was changed: the two cannot be told apart, and must not be.
export class WrongPassphraseError extends Error {
  constructor() {
    super('The passphrase is wrong, or the file was changed.')
  }
}

const bytesToBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const base64ToBytes = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0))

// "é" typed with one key and "é" typed with two are the same passphrase.
const normalize = (passphrase: string): string => passphrase.normalize('NFKC')

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalize(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// The header as text, which is what is authenticated with the content.
const headerOf = (
  file: Pick<EncryptedFile, 'app' | 'format' | 'version' | 'kdf' | 'cipher'>
): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    canonicalJson({ app: file.app, format: file.format, version: file.version, kdf: file.kdf, cipher: file.cipher })
  )

export interface EncryptOptions {
  iterations?: number
  // Fixed values, for a test that needs the same file twice.
  salt?: Uint8Array<ArrayBuffer>
  iv?: Uint8Array<ArrayBuffer>
}

export function validPassphrase(passphrase: string): boolean {
  return MIN_PASSPHRASE <= normalize(passphrase).length
}

export async function encryptText(
  plaintext: string,
  passphrase: string,
  { iterations = DEFAULT_ITERATIONS, salt, iv }: EncryptOptions = {}
): Promise<EncryptedFile> {
  if (!validPassphrase(passphrase)) {
    throw new Error(`The passphrase needs at least ${MIN_PASSPHRASE} characters.`)
  }
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('The number of iterations is out of range.')
  }
  const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(16))
  const ivBytes = iv ?? crypto.getRandomValues(new Uint8Array(12))
  const header = {
    app: EXPORT_APP,
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTION_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(saltBytes) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(ivBytes) },
  } as const
  const key = await deriveKey(passphrase, saltBytes, iterations)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes, additionalData: headerOf(header) },
    key,
    new TextEncoder().encode(plaintext)
  )
  return { ...header, data: bytesToBase64(new Uint8Array(encrypted)) }
}

// Whether a parsed file is a protected backup of a version this one can open. It does not need the passphrase.
export function isEncryptedFile(value: unknown): value is EncryptedFile {
  const file = value as Partial<EncryptedFile> | null
  return (
    'object' === typeof file &&
    null !== file &&
    EXPORT_APP === file.app &&
    ENCRYPTED_FORMAT === file.format &&
    'string' === typeof file.data
  )
}

// Checks the header of a protected file, and says why it cannot be opened. Throws an Error with a message for the user.
export function checkHeader(file: EncryptedFile): void {
  if ('number' !== typeof file.version || file.version > ENCRYPTION_VERSION) {
    throw new Error('This backup was protected by a newer version of the extension.')
  }
  const { kdf, cipher } = file
  const ok =
    1 === file.version &&
    'PBKDF2' === kdf?.name &&
    'SHA-256' === kdf.hash &&
    Number.isInteger(kdf.iterations) &&
    kdf.iterations >= MIN_ITERATIONS &&
    kdf.iterations <= MAX_ITERATIONS &&
    'string' === typeof kdf.salt &&
    'AES-GCM' === cipher?.name &&
    'string' === typeof cipher.iv
  if (!ok) {
    throw new Error('The header of this protected backup is not valid.')
  }
}

export async function decryptText(file: EncryptedFile, passphrase: string): Promise<string> {
  checkHeader(file)
  try {
    const key = await deriveKey(passphrase, base64ToBytes(file.kdf.salt), file.kdf.iterations)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(file.cipher.iv), additionalData: headerOf(file) },
      key,
      base64ToBytes(file.data)
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new WrongPassphraseError()
  }
}

// What is kept to check a passphrase typed later, without keeping the passphrase: a known text, encrypted with it. It is
// as hard to guess the passphrase from this as from a backup.
export interface PassphraseCheck {
  iterations: number
  salt: string
  iv: string
  data: string
}

const CHECK_TEXT = 'job-application-tracker'

export async function makeCheck(passphrase: string, options: EncryptOptions = {}): Promise<PassphraseCheck> {
  const file = await encryptText(CHECK_TEXT, passphrase, options)
  return { iterations: file.kdf.iterations, salt: file.kdf.salt, iv: file.cipher.iv, data: file.data }
}

export async function matchesCheck(passphrase: string, check: PassphraseCheck): Promise<boolean> {
  try {
    const file: EncryptedFile = {
      app: EXPORT_APP,
      format: ENCRYPTED_FORMAT,
      version: ENCRYPTION_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: check.iterations, salt: check.salt },
      cipher: { name: 'AES-GCM', iv: check.iv },
      data: check.data,
    }
    return CHECK_TEXT === (await decryptText(file, passphrase))
  } catch {
    return false
  }
}

// A check read from the storage: anything that is not a well formed check is no check.
export function normalizeCheck(value: unknown): PassphraseCheck | null {
  const source = value as Partial<PassphraseCheck> | null
  if (
    'object' !== typeof source ||
    null === source ||
    !Number.isInteger(source.iterations) ||
    (source.iterations as number) < MIN_ITERATIONS ||
    (source.iterations as number) > MAX_ITERATIONS ||
    'string' !== typeof source.salt ||
    'string' !== typeof source.iv ||
    'string' !== typeof source.data
  ) {
    return null
  }
  return { iterations: source.iterations as number, salt: source.salt, iv: source.iv, data: source.data }
}
