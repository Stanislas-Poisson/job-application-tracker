import { createPinia } from 'pinia'
import { createORM } from 'pinia-orm'
import { type Component, createApp, reactive } from 'vue'
import '../assets/main.scss'
import { createTranslator } from '../i18n'
import { createPersistence } from '../persistence'
import { browserAdapter } from '../persistence/adapter'
import { loadSettings } from '../settings'
import { CONTEXT_KEY } from './context'

// Starts a page of the extension: the store loaded from the storage, the language, then the page itself.
export async function mountApp(root: Component, selector = '#app') {
  const pinia = createPinia().use(createORM())
  const settings = await loadSettings(browserAdapter)
  const persistence = createPersistence(pinia, browserAdapter)
  await persistence.ready

  const app = createApp(root)
  app.use(pinia)
  app.provide(CONTEXT_KEY, {
    translator: createTranslator(settings.locale),
    persistence,
    locale: reactive({ value: settings.locale }),
  })
  app.mount(selector)

  // A page that closes can leave a change that is not saved yet.
  window.addEventListener('pagehide', () => void persistence.flush())
}
