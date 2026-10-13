import { describe, expect, it } from 'vitest'
import { memoryAdapter } from '../../src/persistence/adapter'
import { changeSettings, loadSettings, saveSettings } from '../../src/settings'

describe('changeSettings', () => {
  it('changes some settings and leaves the others as the storage holds them now', async () => {
    const adapter = memoryAdapter()
    await changeSettings(adapter, { theme: 'dark' })
    // Another page changes the time zone; this page, which still holds the old copy, changes the accent.
    await saveSettings(adapter, { ...(await loadSettings(adapter)), timeZone: 'Asia/Tokyo' })
    await changeSettings(adapter, { accent: 'teal' })

    expect(await loadSettings(adapter)).toMatchObject({ theme: 'dark', accent: 'teal', timeZone: 'Asia/Tokyo' })
  })

  it('applies two changes made together, one after the other', async () => {
    const adapter = memoryAdapter()
    await Promise.all([
      changeSettings(adapter, { accent: 'pink' }),
      changeSettings(adapter, { theme: 'light' }),
      changeSettings(adapter, { locale: 'fr' }),
    ])
    expect(await loadSettings(adapter)).toMatchObject({ accent: 'pink', theme: 'light', locale: 'fr' })
  })

  it('keeps going after a change that failed', async () => {
    const adapter = memoryAdapter()
    const set = adapter.set.bind(adapter)
    let fail = true
    adapter.set = async (items) => {
      if (fail) {
        fail = false
        throw new Error('storage full')
      }
      return set(items)
    }
    await expect(changeSettings(adapter, { accent: 'pink' })).rejects.toThrow('storage full')
    await changeSettings(adapter, { theme: 'dark' })
    expect(await loadSettings(adapter)).toMatchObject({ theme: 'dark' })
  })

  it('does not keep a value that is not allowed', async () => {
    const adapter = memoryAdapter()
    await changeSettings(adapter, { theme: 'neon' as never, accent: 'blue' })
    expect(await loadSettings(adapter)).toMatchObject({ theme: 'auto', accent: 'blue' })
  })
})
