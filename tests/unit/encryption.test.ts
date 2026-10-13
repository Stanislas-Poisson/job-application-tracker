import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  ENCRYPTION_VERSION,
  type EncryptedFile,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  WrongPassphraseError,
  checkHeader,
  decryptText,
  encryptText,
  isEncryptedFile,
  makeCheck,
  matchesCheck,
  normalizeCheck,
  validPassphrase,
} from '../../src/services/encryption'

// Few iterations: the tests derive a key many times.
const FAST = { iterations: MIN_ITERATIONS }
const PASSPHRASE = 'correct horse battery'

// A protected file written once with fixed values. If this one cannot be opened any more, a backup that someone has
// kept cannot be either: the format must not change without a new version.
const KNOWN: EncryptedFile = {
  app: 'job-application-tracker',
  format: 'encrypted',
  version: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000, salt: 'AAECAwQFBgcICQoLDA0ODw==' },
  cipher: { name: 'AES-GCM', iv: 'ZGVmZ2hpamtsbW5v' },
  data: 'on8WFcx4g5FCzQUvIT2GbMTmT4gez+09oCq11Nf2O8AAliWNjSUTRKipen95L4Q=',
}
const KNOWN_TEXT = '{"hello":"world","accent":"é"}'

const flipByte = (data: string, index: number): string => {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
  bytes[index] = (bytes[index] ?? 0) ^ 1
  return btoa(String.fromCharCode(...bytes))
}

describe('the format', () => {
  it('opens a known file', async () => {
    expect(await decryptText(KNOWN, PASSPHRASE)).toBe(KNOWN_TEXT)
  })

  it('writes the same file from the same values, with a readable header', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index)
    const iv = Uint8Array.from({ length: 12 }, (_, index) => 100 + index)
    const file = await encryptText(KNOWN_TEXT, PASSPHRASE, { iterations: 100_000, salt, iv })

    expect(file).toEqual(KNOWN)
    expect(file.version).toBe(ENCRYPTION_VERSION)
    expect(JSON.stringify(file)).not.toContain('hello')
  })

  it('uses another salt and nonce each time', async () => {
    const one = await encryptText('same text', PASSPHRASE, FAST)
    const two = await encryptText('same text', PASSPHRASE, FAST)
    expect(one.kdf.salt).not.toBe(two.kdf.salt)
    expect(one.cipher.iv).not.toBe(two.cipher.iv)
    expect(one.data).not.toBe(two.data)
    expect(await decryptText(one, PASSPHRASE)).toBe('same text')
    expect(await decryptText(two, PASSPHRASE)).toBe('same text')
  })

  it('asks for a high number of iterations by default', () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })

  it('treats the two ways of typing the same letter as the same passphrase', async () => {
    const file = await encryptText('text', 'passé-phrase-é', FAST)
    // "é" as e and a combining accent.
    expect(await decryptText(file, 'passé-phrase-é')).toBe('text')
  })
})

describe('a wrong passphrase, or a file that was changed', () => {
  it('fails cleanly with a wrong passphrase', async () => {
    await expect(decryptText(KNOWN, 'correct horse batterz')).rejects.toBeInstanceOf(WrongPassphraseError)
    await expect(decryptText(KNOWN, '')).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('fails when one byte of the content is changed', async () => {
    await expect(decryptText({ ...KNOWN, data: flipByte(KNOWN.data, 3) }, PASSPHRASE)).rejects.toBeInstanceOf(
      WrongPassphraseError
    )
    // Even the last byte, which is part of the authentication tag.
    const last = Uint8Array.from(atob(KNOWN.data), (c) => c.charCodeAt(0)).length - 1
    await expect(decryptText({ ...KNOWN, data: flipByte(KNOWN.data, last) }, PASSPHRASE)).rejects.toBeInstanceOf(
      WrongPassphraseError
    )
  })

  it('fails when the content is cut off, or empty, or not base64', async () => {
    await expect(decryptText({ ...KNOWN, data: KNOWN.data.slice(0, 20) }, PASSPHRASE)).rejects.toBeInstanceOf(
      WrongPassphraseError
    )
    await expect(decryptText({ ...KNOWN, data: '' }, PASSPHRASE)).rejects.toBeInstanceOf(WrongPassphraseError)
    await expect(decryptText({ ...KNOWN, data: '***' }, PASSPHRASE)).rejects.toBeInstanceOf(WrongPassphraseError)
  })

  it('fails when the header is changed, because it is authenticated with the content', async () => {
    await expect(
      decryptText({ ...KNOWN, cipher: { ...KNOWN.cipher, iv: 'ZGVmZ2hpamtsbW5w' } }, PASSPHRASE)
    ).rejects.toBeInstanceOf(WrongPassphraseError)
    await expect(
      decryptText({ ...KNOWN, kdf: { ...KNOWN.kdf, salt: 'AAECAwQFBgcICQoLDA0ODg==' } }, PASSPHRASE)
    ).rejects.toBeInstanceOf(WrongPassphraseError)
  })
})

describe('the header of a protected file', () => {
  it('is recognised without the passphrase', () => {
    expect(isEncryptedFile(KNOWN)).toBe(true)
    expect(isEncryptedFile({ app: 'job-application-tracker', schema: 2, data: {} })).toBe(false)
    expect(isEncryptedFile({ ...KNOWN, app: 'other' })).toBe(false)
    expect(isEncryptedFile(null)).toBe(false)
    expect(isEncryptedFile('text')).toBe(false)
  })

  it('refuses a version that is newer, and a header that makes no sense, before deriving anything', async () => {
    expect(() => checkHeader({ ...KNOWN, version: 2 })).toThrow(/newer version/)
    expect(() => checkHeader({ ...KNOWN, version: 0 })).toThrow(/not valid/)
    expect(() => checkHeader({ ...KNOWN, kdf: { ...KNOWN.kdf, iterations: 1 } })).toThrow(/not valid/)
    expect(() => checkHeader({ ...KNOWN, kdf: { ...KNOWN.kdf, iterations: 1e12 } })).toThrow(/not valid/)
    expect(() => checkHeader({ ...KNOWN, kdf: { ...KNOWN.kdf, iterations: MAX_ITERATIONS + 1 } })).toThrow(/not valid/)
    expect(() => checkHeader({ ...KNOWN, kdf: { ...KNOWN.kdf, hash: 'SHA-1' } as never })).toThrow(/not valid/)
    expect(() => checkHeader({ ...KNOWN, cipher: { name: 'AES-CBC', iv: 'x' } as never })).toThrow(/not valid/)
    await expect(decryptText({ ...KNOWN, version: 2 }, PASSPHRASE)).rejects.toThrow(/newer version/)
  })
})

describe('the passphrase', () => {
  it('needs at least eight characters', async () => {
    expect(validPassphrase('1234567')).toBe(false)
    expect(validPassphrase('12345678')).toBe(true)
    await expect(encryptText('text', 'short', FAST)).rejects.toThrow(/at least 8/)
  })

  it('does not accept a number of iterations out of range', async () => {
    await expect(encryptText('text', PASSPHRASE, { iterations: 1000 })).rejects.toThrow(/out of range/)
    await expect(encryptText('text', PASSPHRASE, { iterations: MAX_ITERATIONS + 1 })).rejects.toThrow(/out of range/)
  })

  it('is checked later against a check that does not hold it', async () => {
    const check = await makeCheck(PASSPHRASE, FAST)
    expect(JSON.stringify(check)).not.toContain('horse')
    expect(await matchesCheck(PASSPHRASE, check)).toBe(true)
    expect(await matchesCheck('correct horse batterz', check)).toBe(false)
    expect(await matchesCheck('', check)).toBe(false)
  })

  it('reads a check from the storage only when it is well formed', async () => {
    const check = await makeCheck(PASSPHRASE, FAST)
    expect(normalizeCheck(check)).toEqual(check)
    expect(normalizeCheck(null)).toBeNull()
    expect(normalizeCheck({ ...check, iterations: 5 })).toBeNull()
    expect(normalizeCheck({ ...check, salt: 1 })).toBeNull()
    expect(normalizeCheck({ iterations: 100_000 })).toBeNull()
    expect(await matchesCheck(PASSPHRASE, { ...check, data: 'broken' })).toBe(false)
  })
})
