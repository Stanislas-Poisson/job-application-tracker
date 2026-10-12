import { createPinia } from 'pinia'
import { createORM } from 'pinia-orm'
import { type Component, createApp, reactive, watchEffect } from 'vue'
import { applyAppearance } from '../appearance'
import '../assets/main.scss'
import { createTranslator } from '../i18n'
import { createPersistence } from '../persistence'
import { browserAdapter } from '../persistence/adapter'
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

  // A setting changed in another page changes this one too.
  browserAdapter.onChanged((keys) => {
    if (keys.includes(SETTINGS_KEY)) {
      void loadSettings(browserAdapter).then((fresh) => Object.assign(settings, fresh))
    }
  })

  const app = createApp(root)
  app.use(pinia)
  app.provide(CONTEXT_KEY, {
    translator: createTranslator(settings.locale),
    persistence,
    settings,
    async updateSettings(changes) {
      Object.assign(settings, changes)
      await saveSettings(browserAdapter, { ...settings })
    },
  })
  app.mount(selector)

  // A page that closes can leave a change that is not saved yet.
  window.addEventListener('pagehide', () => void persistence.flush())
}
