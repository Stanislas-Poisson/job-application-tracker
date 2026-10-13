import { createPinia } from 'pinia'
import { createORM } from 'pinia-orm'
import { type Component, createApp, h, reactive, watchEffect } from 'vue'
import { applyAppearance } from '../appearance'
import '../assets/main.scss'
import { warnBeforeLeaving } from '../composables/useDirty'
import { createTranslator, resolveLocale } from '../i18n'
import { createPersistence } from '../persistence'
import { browserAdapter } from '../persistence/adapter'
import { refreshRates } from '../services/rates'
import { SETTINGS_KEY, type Settings, loadSettings, saveSettings } from '../settings'
import { CONTEXT_KEY } from './context'

// Starts a page of the extension: the settings and the store loaded from the storage, then the page itself.
export async function mountApp(root: Component, selector = '#app') {
  const pinia = createPinia().use(createORM())
  const settings = reactive<Settings>(await loadSettings(browserAdapter))

  // The look is on the page before anything is drawn, and follows the settings.
  watchEffect(() => applyAppearance(document.documentElement, settings))

  const persistence = createPersistence(pinia, browserAdapter)
  await persistence.ready

  // Data written by a newer structure than this version knows is left exactly as it is: nothing is read, nothing is
  // written, and the page says why.
  if (persistence.newer) {
    const translator = createTranslator(settings.locale)
    translator.setLocale(resolveLocale(settings.locale, navigator.language))
    createApp({
      render: () =>
        h('main', { class: 'page', id: 'newer-data' }, [
          h('h1', translator.__('schema.newerTitle')),
          h('p', translator.__('schema.newerBody')),
        ]),
    }).mount(selector)
    return
  }

  // A setting changed in another page changes this one too.
  browserAdapter.onChanged((keys) => {
    if (keys.includes(SETTINGS_KEY)) {
      void loadSettings(browserAdapter).then((fresh) => Object.assign(settings, fresh))
    }
  })

  const app = createApp(root)
  app.use(pinia)
  const updateSettings = async (changes: Partial<Settings>) => {
    Object.assign(settings, changes)
    await saveSettings(browserAdapter, { ...settings })
  }
  app.provide(CONTEXT_KEY, {
    translator: createTranslator(settings.locale),
    persistence,
    settings,
    updateSettings,
  })
  app.mount(selector)

  // Fresh rates when the switch is on and the last ones are a day old: the page never waits for them.
  void refreshRates(settings, updateSettings)

  // The browser asks before a page is closed with text that was typed and not saved.
  warnBeforeLeaving()

  // A page that closes can leave a change that is not saved yet.
  window.addEventListener('pagehide', () => void persistence.flush())
}
