import { describe, expect, it } from 'vitest'
import { captureOffer } from '../../src/services/applications'
import { backupText } from '../../src/services/backup'
import { importData } from '../../src/services/data'
import { DEFAULT_SETTINGS } from '../../src/settings'
import { canonicalJson, checksumOf, sha256Hex, verifyChecksum, withChecksum } from '../../src/utils/checksum'
import { freshStore } from './helpers'

describe('the checksum', () => {
  it('computes SHA-256 as everybody does', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('writes JSON with the keys in order, at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}'
    )
  })

  it('is the same whatever the order of the keys or the indentation, and ignores the checksum it carries', async () => {
    const one = { app: 'x', data: { a: [1, 2], b: 'text' } }
    const other = { data: { b: 'text', a: [1, 2] }, app: 'x' }
    expect(await checksumOf(one)).toBe(await checksumOf(other))
    expect(await checksumOf({ ...one, checksum: 'sha256:anything' })).toBe(await checksumOf(one))
    expect(await checksumOf(one)).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('verifies a file, however it was written down and read back', async () => {
    const file = await withChecksum({ app: 'x', data: { a: [1, 2] } })
    expect(await verifyChecksum(file)).toBe('valid')
    expect(await verifyChecksum(JSON.parse(JSON.stringify(file, null, 4)))).toBe('valid')
    expect(await verifyChecksum({ checksum: file.checksum, data: { a: [1, 2] }, app: 'x' })).toBe('valid')
  })

  it('catches a change of one character, a record added, and a checksum that is not one', async () => {
    const file = await withChecksum({ app: 'x', data: { a: [1, 2], name: 'Acme' } })
    expect(await verifyChecksum({ ...file, data: { a: [1, 2], name: 'Acne' } })).toBe('invalid')
    expect(await verifyChecksum({ ...file, data: { a: [1, 2, 3], name: 'Acme' } })).toBe('invalid')
    expect(await verifyChecksum({ ...file, checksum: `sha256:${'0'.repeat(64)}` })).toBe('invalid')
    expect(await verifyChecksum({ ...file, checksum: 42 })).toBe('invalid')
  })

  it('says missing for a file that has none, and for what is not a file', async () => {
    expect(await verifyChecksum({ app: 'x' })).toBe('missing')
    expect(await verifyChecksum(null)).toBe('missing')
    expect(await verifyChecksum('text')).toBe('missing')
  })
})

describe('the checksum of a backup', () => {
  it('is in the backup file, and a backup that was not touched is valid', async () => {
    freshStore()
    captureOffer({ title: 'One', companyName: 'Acme' })
    const text = await backupText(DEFAULT_SETTINGS)
    const file = JSON.parse(text) as { checksum: string; data: { companies: { name: string }[] } }

    expect(file.checksum).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(await verifyChecksum(file)).toBe('valid')
    // Read in an editor and saved again with another indentation: still the same file.
    expect(await verifyChecksum(JSON.parse(JSON.stringify(file)))).toBe('valid')

    // A stray edit in the data is caught.
    file.data.companies.splice(0, 1, { name: 'Acne' })
    expect(await verifyChecksum(file)).toBe('invalid')
  })

  it('is not in the way of importing the file', async () => {
    freshStore()
    captureOffer({ title: 'One', companyName: 'Acme' })
    const file: unknown = JSON.parse(await backupText(DEFAULT_SETTINGS))
    freshStore({ seed: false })
    expect(() => importData(file)).not.toThrow()
  })
})
