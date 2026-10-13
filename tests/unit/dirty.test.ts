import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { anyDirty, hasText, useDirtyGuard, warnBeforeLeaving } from '../../src/composables/useDirty'
import { memoryAdapter } from '../../src/persistence/adapter'
import {
  DRAFT_DAYS,
  DRAFT_KEY,
  clearDraft,
  draftFor,
  loadDraft,
  normalizeDraft,
  saveDraft,
} from '../../src/services/draft'

// A form that says it is unsaved while its field holds text.
function mountForm() {
  const text = ref('')
  const app = createApp(
    defineComponent({
      setup() {
        useDirtyGuard(() => hasText(text.value))
        return () => h('div')
      },
    })
  )
  app.mount(document.createElement('div'))
  return { text, app }
}

describe('unsaved text', () => {
  it('is only text that holds something', () => {
    expect(hasText('')).toBe(false)
    expect(hasText('   ', '\n')).toBe(false)
    expect(hasText('', ' a ')).toBe(true)
    expect(hasText(undefined, null)).toBe(false)
  })

  it('is asked of every form that is on the page, and only while it is', async () => {
    expect(anyDirty()).toBe(false)
    const one = mountForm()
    const two = mountForm()
    await nextTick()
    expect(anyDirty()).toBe(false)

    two.text.value = 'a note'
    expect(anyDirty()).toBe(true)
    two.text.value = ''
    expect(anyDirty()).toBe(false)

    one.text.value = 'typed'
    expect(anyDirty()).toBe(true)
    // A form that goes away (the drawer closes) no longer holds anything unsaved.
    one.app.unmount()
    expect(anyDirty()).toBe(false)
    two.app.unmount()
  })

  it('stops the page from closing without asking, only while something is unsaved', () => {
    const stop = warnBeforeLeaving()
    const form = mountForm()
    const event = (): BeforeUnloadEvent => {
      const created = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
      window.dispatchEvent(created)
      return created
    }

    expect(event().defaultPrevented).toBe(false)
    form.text.value = 'typed'
    expect(event().defaultPrevented).toBe(true)
    stop()
    expect(event().defaultPrevented).toBe(false)
    form.app.unmount()
  })
})

describe('the draft of the popup', () => {
  const draft = {
    url: 'https://jobs.example.com/offer/1',
    title: 'Dev',
    company: 'Acme',
    location: 'Paris',
    note: 'to call',
    statusKey: 'to_apply',
  }
  const NOW = new Date('2026-10-13T10:00:00Z')

  it('is kept and read back', async () => {
    const adapter = memoryAdapter()
    expect(await loadDraft(adapter)).toBeNull()
    await saveDraft(adapter, draft, NOW)
    expect(await loadDraft(adapter)).toEqual({ ...draft, savedAt: NOW.toISOString() })
    await clearDraft(adapter)
    expect(await loadDraft(adapter)).toBeNull()
    expect(adapter.data[DRAFT_KEY]).toBeUndefined()
  })

  it('is given back for the same page only, and while it is recent', () => {
    const saved = { ...draft, savedAt: NOW.toISOString() }
    expect(draftFor(saved, draft.url, NOW)).toEqual(saved)
    expect(draftFor(saved, 'https://jobs.example.com/offer/2', NOW)).toBeNull()
    expect(draftFor(null, draft.url, NOW)).toBeNull()
    const later = new Date(NOW.getTime() + (DRAFT_DAYS * 86_400_000 + 1))
    expect(draftFor(saved, draft.url, later)).toBeNull()
  })

  it('reads only what is a draft', () => {
    expect(normalizeDraft(null)).toBeNull()
    expect(normalizeDraft({ title: 'x' })).toBeNull()
    expect(normalizeDraft({ savedAt: 12 })).toBeNull()
    expect(normalizeDraft({ savedAt: NOW.toISOString(), title: 5, note: 'n' })).toMatchObject({ title: '', note: 'n' })
  })
})
