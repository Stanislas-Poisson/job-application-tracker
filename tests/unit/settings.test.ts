import { describe, expect, it, vi } from 'vitest'
import { memoryAdapter } from '../../src/persistence/adapter'
import {
  DEFAULT_SETTINGS,
  type Settings,
  changeSettings,
  loadSettings,
  saveSettings,
  syncSettings,
} from '../../src/settings'

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

describe('a burst of changes', () => {
  it('is written together, not one write for each letter typed', async () => {
    const adapter = memoryAdapter()
    const set = adapter.set.bind(adapter)
    let writes = 0
    adapter.set = async (items) => {
      writes++
      await new Promise((resolve) => setTimeout(resolve, 10))
      return set(items)
    }
    const text = 'https://example.org/route?from={from}&to={to}'
    const all = [...text].map((_, index) => changeSettings(adapter, { mapCustomTemplate: text.slice(0, index + 1) }))
    await Promise.all(all)

    expect((await loadSettings(adapter)).mapCustomTemplate).toBe(text)
    // The first one goes out alone; the rest wait for it and go out together.
    expect(writes).toBeLessThanOrEqual(3)
  })

  it('keeps every setting of the burst, whichever it is', async () => {
    const adapter = memoryAdapter()
    await Promise.all([
      changeSettings(adapter, { mapCustomTemplate: 'https://a/{to}' }),
      changeSettings(adapter, { travelMode: 'transit' }),
      changeSettings(adapter, { mapProvider: 'apple' }),
      changeSettings(adapter, { mapCustomTemplate: 'https://b/{to}' }),
    ])
    expect(await loadSettings(adapter)).toMatchObject({
      mapCustomTemplate: 'https://b/{to}',
      travelMode: 'transit',
      mapProvider: 'apple',
    })
  })
})

describe('syncSettings', () => {
  const page = (adapter: ReturnType<typeof memoryAdapter>, initial: Partial<Settings> = {}) => {
    const settings = { ...DEFAULT_SETTINGS, ...initial } as Settings
    return { settings, ...syncSettings(adapter, settings) }
  }

  it('changes the setting in the page at once, and writes it', async () => {
    const adapter = memoryAdapter()
    const { settings, update, stop } = page(adapter)
    const pending = update({ accent: 'teal' })
    expect(settings.accent).toBe('teal')
    await pending
    expect((await loadSettings(adapter)).accent).toBe('teal')
    stop()
  })

  it('does not put an older value back over what is being typed, whatever the storage tells late', async () => {
    const inner = memoryAdapter()
    // A storage that tells about a write a little after it is made, as a browser does.
    const adapter = {
      ...inner,
      onChanged: (callback: (keys: string[]) => void) =>
        inner.onChanged((keys) => void setTimeout(() => callback(keys), 15)),
    }
    const { settings, update, stop } = page(adapter as never)

    const text = 'https://example.org/route?from={from}&to={to}'
    for (let index = 0; index < text.length; index++) {
      void update({ mapCustomTemplate: text.slice(0, index + 1) })
      await new Promise((resolve) => setTimeout(resolve, 2))
      // What is typed is never taken back, at any moment of the typing.
      expect(settings.mapCustomTemplate).toBe(text.slice(0, index + 1))
    }
    await vi.waitFor(async () => expect((await loadSettings(adapter as never)).mapCustomTemplate).toBe(text))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(settings.mapCustomTemplate).toBe(text)
    stop()
  })

  it('takes in a setting another page changed', async () => {
    const adapter = memoryAdapter()
    const { settings, stop } = page(adapter)
    await saveSettings(adapter, { ...(await loadSettings(adapter)), timeZone: 'Asia/Tokyo' })
    await vi.waitFor(() => expect(settings.timeZone).toBe('Asia/Tokyo'))
    stop()
  })

  it('takes in what another page changed after its own write, and keeps its own', async () => {
    const adapter = memoryAdapter()
    const { settings, update, stop } = page(adapter)
    await saveSettings(adapter, { ...(await loadSettings(adapter)), timeZone: 'Asia/Tokyo' })
    await update({ accent: 'pink' })
    expect(settings).toMatchObject({ timeZone: 'Asia/Tokyo', accent: 'pink' })
    expect(await loadSettings(adapter)).toMatchObject({ timeZone: 'Asia/Tokyo', accent: 'pink' })
    stop()
  })

  it('stops listening when asked', async () => {
    const adapter = memoryAdapter()
    const { settings, stop } = page(adapter)
    stop()
    await saveSettings(adapter, { ...(await loadSettings(adapter)), timeZone: 'Asia/Tokyo' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(settings.timeZone).toBe('auto')
  })
})
