import { createPinia } from 'pinia'
import { createORM } from 'pinia-orm'
import { type Component, createApp, h, reactive, watchEffect } from 'vue'
import { applyAppearance } from '../appearance'
import '../assets/main.scss'
import { warnBeforeLeaving } from '../composables/useDirty'
import { LANGUAGES_KEY, loadCustomLanguages } from '../customLanguages'
import { createTranslator, loadLocale, resolveLocale } from '../i18n'
import { applyLanguage } from '../languages'
import { createPersistence } from '../persistence'
import { browserAdapter } from '../persistence/adapter'
import { refreshRates } from '../services/rates'
import { type Settings, loadSettings, syncSettings } from '../settings'
import { CONTEXT_KEY } from './context'
import { installFieldAccessibility } from './fieldAccessibility'
import { shell } from './shell'

// Starts a page of the extension: the settings and the store loaded from the storage, then the page itself.
export async function mountApp(root: Component, selector = '#app') {
  const pinia = createPinia().use(createORM())
  // The languages the user added come before the settings are used: the language in use may be one of them.
  await loadCustomLanguages(browserAdapter)
  browserAdapter.onChanged((keys) => {
    if (keys.includes(LANGUAGES_KEY)) {
      void loadCustomLanguages(browserAdapter)
    }
  })
  const settings = reactive<Settings>(await loadSettings(browserAdapter))

  // The look is on the page before anything is drawn, and follows the settings.
  watchEffect(() => applyAppearance(document.documentElement, settings))
  // The language and the direction of the page follow the language chosen.
  watchEffect(() => applyLanguage(document.documentElement, resolveLocale(settings.locale, navigator.language)))

  const persistence = createPersistence(pinia, browserAdapter)
  await persistence.ready

  // Data written by a newer structure than this version knows is left exactly as it is: nothing is read, nothing is
  // written, and the page says why.
  if (persistence.newer) {
    const translator = createTranslator(settings.locale)
    await loadLocale(translator, resolveLocale(settings.locale, navigator.language))
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

  // A setting changed in another page changes this one too, and a setting changed here is written one by one.
  const { update: updateSettings } = syncSettings(browserAdapter, settings)

  // The language in use is read before the page is drawn, so that it never shows in English first.
  const translator = createTranslator(settings.locale)
  await loadLocale(translator, resolveLocale(settings.locale, navigator.language))

  const app = createApp(shell(root))
  app.use(pinia)
  installFieldAccessibility(app)
  app.provide(CONTEXT_KEY, {
    translator,
    persistence,
    settings,
    updateSettings,
  })
  app.mount(selector)

  // Fresh rates when the switch is on and the last ones are a day old: the page never waits for them.
  void refreshRates(settings, updateSettings)

  // The journal of the persistence, to read from the console or from a test when two pages disagree.
  ;(window as unknown as { __jat?: { events: readonly string[] } }).__jat = { events: persistence.events }

  // The browser asks before a page is closed with text that was typed and not saved.
  warnBeforeLeaving()

  // A page that closes can leave a change that is not saved yet.
  window.addEventListener('pagehide', () => void persistence.flush())
}
