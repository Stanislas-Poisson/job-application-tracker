// Accessibility and layout, in a real browser, with the package of the stores:
//
//   BROWSER=chrome|firefox node tests/e2e/accessibility.test.mjs
//
// axe-core scans each page for what a machine can tell of WCAG 2.2 AA (names of controls, roles, contrast, landmarks…), in the
// light and the dark look, with a drawer open. The pages are also measured at 1024, 1280 and 1920 pixels wide: nothing scrolls
// sideways, and the board uses the width it is given.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, afterEach, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { By } from 'selenium-webdriver'

import { afterTest } from './diagnostics.mjs'
import { launch, openPage, quitBrowser, showTabOf, startEditing, unpack, waitFor, zipFor } from './lib.mjs'

const browser = process.env.BROWSER || 'chrome'
const AXE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/axe-core/axe.min.js'),
  'utf8'
)
// The languages of the extension, read from its table: a language that is added is tested without a line here.
const LANGUAGE_CODES = [
  ...fs
    .readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/languages.ts'), 'utf8')
    .matchAll(/^\s+\{ code: '([^']+)'/gm),
].map((match) => match[1])
// 640 pixels of page is what a window of 1280 comes to at 200 % of zoom.
const ZOOMED = [640, 450]
const SIZES = [
  [1024, 768],
  [1280, 800],
  [1920, 1080],
]

describe(`accessibility and layout in ${browser}`, { timeout: 600_000 }, () => {
  let driver
  let base

  before(async () => {
    const zip = zipFor(browser)
    ;({ driver, base } = await launch(browser, { dir: unpack(zip), zip }))
  })
  afterEach(afterTest)
  after(async () => quitBrowser(driver))

  const css = (selector) => driver.findElement(By.css(selector))
  const all = (selector) => driver.findElements(By.css(selector))
  const type = async (selector, value) => {
    const element = await css(selector)
    await element.clear()
    await element.sendKeys(value)
  }
  const open = async (page, ready) => {
    await openPage(driver, browser, `${base}${page}.html`)
    await waitFor(async () => (await all(ready)).length > 0, { message: `${page} to load` })
    await showTabOf(driver, ready)
    await waitFor(async () => (await driver.executeScript(`return document.readyState`)) === 'complete')
  }
  // The options are in tabs: each one is shown in turn, and scanned.
  const OPTION_TABS = ['appearance', 'board', 'money', 'places', 'data']
  const TABLE_TABS = ['applications', 'companies', 'contacts', 'addresses']
  async function scanEachTab(label, ids = OPTION_TABS) {
    for (const id of ids) {
      await css(`.tab[data-tab=${id}]`).then((tab) => tab.click())
      await waitFor(async () => (await all(`[role=tabpanel]:not([hidden])`)).length > 0, {
        message: `the tab ${id}`,
      })
      await scan(`${label}/${id}`)
    }
  }
  const resize = (width, height) => driver.manage().window().setRect({ width, height })

  // What axe finds on the page as it is now, as readable lines.
  async function scan(label) {
    await driver.executeScript(AXE)
    const result = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })
        .then((r) => done(r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\\n').slice(1, 3).join(' ')) }))))
        .catch((e) => done([{ id: 'axe-error', help: String(e), nodes: [] }]));
    `)
    const lines = result.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.join('\n    ')}`)
    assert.deepEqual(lines, [], `\n${lines.join('\n')}`)
  }
  // The look changes at once (no transition running when the page is measured).
  const look = async (theme) => {
    await driver.executeScript(
      `document.documentElement.setAttribute('data-motion', 'reduce'); document.documentElement.setAttribute('data-theme', arguments[0])`,
      theme
    )
    await driver.sleep(300)
  }
  const overflow = () =>
    driver.executeScript(`return document.documentElement.scrollWidth - document.documentElement.clientWidth`)

  test('an offer is saved to have something on the board', async () => {
    await open('popup', 'form')
    await type('input[name=title]', 'Backend developer')
    await type('input[name=company]', 'Acme')
    await type('input[name=location]', 'Paris')
    await css('form button[type=submit]').then((button) => button.click())
    await waitFor(async () => (await all('.success')).length > 0, { message: 'the offer to be saved' })
  })

  for (const theme of ['light', 'dark']) {
    for (const page of ['popup', 'options', 'board', 'tables']) {
      test(`${page} has nothing axe can fault, in the ${theme} look`, async () => {
        await open(page, 'footer')
        await look(theme)
        await ('options' === page
          ? scanEachTab(`options/${theme}`)
          : 'tables' === page
            ? scanEachTab(`tables/${theme}`, TABLE_TABS)
            : scan(`${page}/${theme}`))
      })
    }

    test(`the drawer of an application has nothing axe can fault, in the ${theme} look`, async () => {
      await open('board', '.application-card')
      await look(theme)
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
        message: 'the drawer',
      })
      // The card is read first, then edited.
      await scan(`drawer/read/${theme}`)
      await startEditing(driver)
      await scan(`drawer/edit/${theme}`)
      // A change puts Cancel and Save in the bar, with the mark that something is not kept.
      await type('input[name=location]', 'Elsewhere')
      await waitFor(async () => (await all('dialog[open] button[name=save]')).length > 0, { message: 'Save' })
      await scan(`drawer/changed/${theme}`)
      await css('dialog[open] button[name=cancel]').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
        message: 'back to reading',
      })
    })
  }

  test('the options page has nothing axe can fault with an own theme open, and in the vision modes', async () => {
    await open('options', 'footer')
    await type('input[name=newTheme]', 'Mine')
    await driver.executeScript(`document.querySelector('input[name=newTheme]').closest('form').requestSubmit()`)
    await waitFor(async () => (await all('#theme-editor')).length > 0, { message: 'the theme editor' })
    await look('light')
    await scan('options/theme-editor')
    // Each vision mode in the light and the dark look, and the high contrast alone and with each of them.
    const modes = [
      ['red-green', 'auto'],
      ['blue-yellow', 'auto'],
      ['monochrome', 'auto'],
      ['standard', 'high'],
      ['red-green', 'high'],
      ['monochrome', 'high'],
    ]
    for (const theme of ['light', 'dark']) {
      await look(theme)
      for (const [vision, contrast] of modes) {
        await driver.executeScript(
          `document.documentElement.setAttribute('data-vision', arguments[0]); document.documentElement.setAttribute('data-contrast', arguments[1])`,
          vision,
          contrast
        )
        await driver.sleep(200)
        await scan(`options/${theme}/${vision}/${contrast}`)
      }
    }
  })

  // The system settings are emulated with the protocol of Chrome: Firefox has no such door.
  test(
    'the contrast follows the system: more contrast asked, or the colours forced',
    { skip: 'firefox' === browser && 'emulating the system settings needs the protocol of Chrome' },
    async () => {
      const emulate = (features) => driver.sendDevToolsCommand('Emulation.setEmulatedMedia', { features })
      const colours = () =>
        driver.executeScript(
          `const dot = document.querySelector('.column h2 .dot'); return { body: getComputedStyle(document.body).color, line: getComputedStyle(document.querySelector('.application-card')).borderTopWidth, dot: dot && getComputedStyle(dot, '::before').content }`
        )
      await open('board', '.column')
      await look('light')
      const usual = await colours()
      assert.notEqual(usual.body, 'rgb(0, 0, 0)', 'the usual look is not the pure black of high contrast')
      assert.notEqual(usual.line, '2px', 'the lines of the usual look are not the thick ones of high contrast')
      try {
        await emulate([{ name: 'prefers-contrast', value: 'more' }])
        await waitFor(async () => (await colours()).body === 'rgb(0, 0, 0)', { message: 'more contrast, light' })
        assert.equal((await colours()).line, '2px')
        await look('dark')
        await waitFor(async () => (await colours()).body === 'rgb(255, 255, 255)', { message: 'more contrast, dark' })
        // The choice of the user comes before the system: the standard contrast stays as it was.
        await driver.executeScript(`document.documentElement.setAttribute('data-contrast', 'standard')`)
        await waitFor(async () => (await colours()).body !== 'rgb(255, 255, 255)', {
          message: 'the standard contrast chosen',
        })
        await driver.executeScript(`document.documentElement.setAttribute('data-contrast', 'auto')`)
        await emulate([{ name: 'prefers-contrast', value: 'no-preference' }])
        await waitFor(async () => (await colours()).body !== 'rgb(0, 0, 0)', { message: 'the system asks for nothing' })
        // The system forces its colours: the colour of a column is gone, so its shape is drawn, and a badge gets a line.
        const badge = () =>
          driver.executeScript(`return getComputedStyle(document.querySelector('.badge')).borderTopWidth`)
        const shape = /[●■▲◆★▼]/u
        assert.doesNotMatch(String((await colours()).dot), shape, 'no shape on the dot while the colours are free')
        assert.equal(await badge(), '0px', 'no line on a badge while the colours are free')
        await emulate([{ name: 'forced-colors', value: 'active' }])
        await waitFor(async () => shape.test(String((await colours()).dot)), { message: 'the shape of a column' })
        await waitFor(async () => (await badge()) === '1px', { message: 'a line around a badge' })
      } finally {
        await emulate([
          { name: 'prefers-contrast', value: '' },
          { name: 'forced-colors', value: '' },
        ])
      }
    }
  )

  test('the first stop of the keyboard is a link that skips the header, and it puts the focus on the page', async () => {
    for (const page of ['board', 'options', 'popup']) {
      await open(page, 'main')
      await driver.executeScript(`document.activeElement && document.activeElement.blur()`)
      await driver.actions().sendKeys('\uE004').perform()
      assert.equal(
        await driver.executeScript(`return document.activeElement && document.activeElement.className`),
        'skip-link',
        `the first stop of ${page}`
      )
      await driver.actions().sendKeys('\uE007').perform()
      assert.equal(await driver.executeScript(`return document.activeElement && document.activeElement.id`), 'main')
    }
  })

  test('a message of error is tied to the field it is about', async () => {
    await open('options', 'input[name=newTag]')
    // A tag with no name is refused: the message comes in the block, and the field is the one the user was in.
    await css('input[name=newTag]').then((field) => field.click())
    await driver.executeScript(`document.querySelector('input[name=newTag]').closest('form').requestSubmit()`)
    await waitFor(async () => (await all('[role=alert].error')).length > 0, { message: 'the message of error' })
    const tie = await driver.executeScript(`
      const field = document.querySelector('input[name=newTag]');
      const alert = document.getElementById(field.getAttribute('aria-describedby') || 'none');
      return { invalid: field.getAttribute('aria-invalid'), text: alert ? alert.textContent.trim() : '' }`)
    assert.equal(tie.invalid, 'true')
    assert.notEqual(tie.text, '', 'the field is described by the message')
  })

  // The settings are written in the storage as the options page does: every page open follows at once.
  const setSettings = (patch) =>
    driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1];
       chrome.storage.local.get('jat:settings', (stored) => chrome.storage.local.set({ 'jat:settings': { ...(stored['jat:settings'] || {}), ...arguments[0] } }, () => done(true)))`,
      patch
    )
  const getSettings = () =>
    driver.executeAsyncScript(
      `const done = arguments[arguments.length - 1]; chrome.storage.local.get('jat:settings', (stored) => done(stored['jat:settings'] || {}))`
    )
  const press = (key) => driver.actions().sendKeys(key).perform()
  const arrow = (key) => driver.actions().keyDown('\uE008').sendKeys(key).keyUp('\uE008').perform()
  const activeName = () => driver.executeScript(`return document.activeElement && document.activeElement.name`)

  test('the board is worked with the keys: a key for the search, the arrows, Shift and the arrows to move a card; off by default', async () => {
    const columnOfCard = () =>
      driver.executeScript(
        `const card = document.querySelector('.application-card'); return card && card.closest('.column').dataset.status`
      )
    await setSettings({
      shortcuts: false,
      shortcutKeys: {
        search: { code: 'KeyF', shift: false, label: 'f' },
        open: { code: 'KeyE', shift: false, label: 'e' },
      },
    })
    await open('board', '.application-card')

    // By default the keys are off: nothing happens for the key of the search.
    await driver.executeScript(`document.activeElement && document.activeElement.blur()`)
    await press('f')
    assert.notEqual(await activeName(), 'search')

    await setSettings({ shortcuts: true })
    await driver.sleep(400)
    // The search takes the focus with its key, and the same letter typed in it stays a letter.
    await driver.executeScript(`document.activeElement && document.activeElement.blur()`)
    await press('f')
    assert.equal(await activeName(), 'search')
    await driver.actions().sendKeys('afb').perform()
    assert.equal(await driver.executeScript(`return document.querySelector('input[name=search]').value`), 'afb')
    await driver.executeScript(
      `const search = document.querySelector('input[name=search]'); search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true }))`
    )

    // A card moves to the next column with Shift and an arrow, keeps the focus, and the move is said.
    const first = await columnOfCard()
    await driver.executeScript(`document.querySelector('.application-card .card-open').focus()`)
    await arrow('\uE014')
    await waitFor(async () => (await columnOfCard()) !== first, { message: 'the card in the next column' })
    assert.equal(
      await driver.executeScript(`return document.activeElement && document.activeElement.className`),
      'card-open',
      'the focus stays on the card'
    )
    await waitFor(async () => (await all('.toast')).length > 0, { message: 'the move said' })
    await arrow('\uE012')
    await waitFor(async () => (await columnOfCard()) === first, { message: 'the card back in its column' })

    // The key to open the card opens it; what is typed in the drawer is typed, whatever the keys of the board are.
    await driver.executeScript(`document.querySelector('.application-card .card-open').focus()`)
    await press('e')
    await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
      message: 'the card opened',
    })
    assert.equal((await all('dialog[open] textarea[name=newNote]')).length, 0, 'the card opens to be read')
    await startEditing(driver)
    await css('dialog[open] textarea[name=newNote]').then((field) => field.sendKeys('fewer words, e and f'))
    assert.equal(
      await driver.executeScript(`return document.querySelector('dialog[open] textarea[name=newNote]').value`),
      'fewer words, e and f'
    )
    assert.equal(await columnOfCard(), first, 'the keys typed in the drawer moved nothing')
    await driver.executeScript(`document.querySelector('dialog[open] textarea[name=newNote]').value = ''`)
    await driver.executeScript(
      `document.querySelector('dialog[open] textarea[name=newNote]').dispatchEvent(new Event('input', { bubbles: true }))`
    )
    // Escape steps back from editing to reading when nothing changed, and closes the card from there.
    await driver.actions().sendKeys('\uE00C').perform()
    await waitFor(async () => (await all('dialog[open] textarea[name=newNote]')).length === 0, {
      message: 'the card back to reading',
    })
    assert.equal((await all('dialog[open]')).length, 1, 'the card is still open')
    await driver.actions().sendKeys('\uE00C').perform()
    await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the card closed' })

    // With the setting off, the same keys do nothing.
    await setSettings({ shortcuts: false })
    await driver.sleep(400)
    await driver.executeScript(`document.querySelector('.application-card .card-open').focus()`)
    await arrow('\uE014')
    await driver.sleep(500)
    assert.equal(await columnOfCard(), first, 'no move with the keys off')
    await driver.executeScript(`document.activeElement && document.activeElement.blur()`)
    await press('f')
    assert.notEqual(await activeName(), 'search')
  })

  test('the keys are chosen in the options: a clash holds the save, keys can be swapped, and a key follows its place', async () => {
    await setSettings({ shortcuts: true, shortcutKeys: {} })
    await open('options', 'button[name=key-search]')
    const keyOf = (action) =>
      driver.executeScript(`return document.querySelector('[data-key="${action}"]').textContent.trim()`)
    const choose = async (action, key) => {
      await css(`button[name=key-${action}]`).then((button) => button.click())
      await waitFor(async () => (await all('[role=status]')).length > 0, { message: 'the key is waited for' })
      await press(key)
    }
    const saved = async () => (await getSettings()).shortcutKeys ?? {}

    // A key is chosen by pressing it, and saved.
    await choose('search', 'g')
    await waitFor(async () => (await saved()).search?.code === 'KeyG', { message: 'the key of the search saved' })
    assert.equal((await saved()).search.shift, false)

    // The key of the search is given to another action: they clash, the clash is said, and nothing more is saved.
    await choose('up', 'g')
    await waitFor(async () => (await all('#key-conflict')).length > 0, { message: 'the clash said' })
    assert.equal((await saved()).up, undefined, 'the clashing key is not saved')
    assert.equal(await keyOf('up'), await keyOf('search'))

    // The search takes another key: the clash is gone and both keys are saved.
    await choose('search', 'h')
    await waitFor(async () => (await all('#key-conflict')).length === 0, { message: 'the clash gone' })
    await waitFor(async () => (await saved()).up?.code === 'KeyG' && (await saved()).search?.code === 'KeyH', {
      message: 'both keys saved',
    })

    // A key the page keeps is refused at once, and a key that is removed is a null.
    await choose('down', '\uE004')
    await waitFor(async () => (await all('[role=alert]')).length > 0, { message: 'the refusal said' })
    await press('\uE00C')
    // A key is set, then removed: it is a null, and not an absence.
    await choose('down', 'j')
    await waitFor(async () => (await saved()).down?.code === 'KeyJ', { message: 'the key of down saved' })
    await driver.executeScript(
      `[...document.querySelectorAll('li.row')].find((row) => row.querySelector('[data-key=down]')).querySelectorAll('button')[1].click()`
    )
    await waitFor(async () => (await saved()).down === null, { message: 'the key removed' })

    // The key follows its place: the board answers to the place of the key, whatever letter it has.
    await open('board', '.application-card')
    await driver.executeScript(`document.activeElement && document.activeElement.blur()`)
    await press('h')
    assert.equal(await activeName(), 'search')

    // Back to the defaults.
    await setSettings({ shortcuts: false, shortcutKeys: {} })
  })

  test('the spacing of the letters is left out where the letters join or a syllable is one block', async () => {
    await open('board', '.column')
    const spacing = async (language) => {
      await driver.executeScript(
        `document.documentElement.lang = arguments[0]; document.documentElement.style.setProperty('--jat-letter-spacing', '0.16em')`,
        language
      )
      return driver.executeScript(`return getComputedStyle(document.body).letterSpacing`)
    }
    const none = ['normal', '0px']
    assert.ok(!none.includes(await spacing('en')), 'a Latin text gets the spacing')
    assert.ok(!none.includes(await spacing('he')), 'Hebrew has letters apart and gets it')
    for (const language of ['ar', 'ar-x-mine', 'hi', 'th']) {
      assert.ok(none.includes(await spacing(language)), `${language} does not`)
    }
    await driver.executeScript(`document.documentElement.style.removeProperty('--jat-letter-spacing')`)
  })

  test('the board is used with the keyboard: the title of a card opens it, escape closes it, and the focus comes back', async () => {
    await open('board', '.application-card')
    const opener = await css('.application-card .card-open')
    await opener.sendKeys('\uE007')
    await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, { message: 'the drawer' })
    await driver.actions().sendKeys('\uE00C').perform()
    await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
    assert.equal(
      await driver.executeScript(
        `return document.activeElement && document.activeElement.classList.contains('card-open')`
      ),
      true,
      'the focus is back on the title of the card'
    )
  })

  // What comes and goes: the error of the popup, the notice with its undo, the question before leaving. In both looks, and
  // at the width of a page zoomed to 200 %.
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1280, 800], ZOOMED]) {
      test(`the error, the notice and the question have nothing axe can fault, in the ${theme} look at ${width} pixels`, async () => {
        await resize(width, height)
        try {
          // The error of the popup: an offer with no title.
          await open('popup', 'form')
          await look(theme)
          await driver.executeScript(
            `const form = document.querySelector('form'); form.noValidate = true; form.requestSubmit()`
          )
          await waitFor(async () => (await all('[role=alert].error')).length > 0, { message: 'the error of the popup' })
          await scan(`popup-error/${theme}/${width}`)

          // The notice that offers to undo a deletion, which is then undone so that the next tests find the card.
          await open('board', '.application-card')
          await look(theme)
          await css('.application-card').then((card) => card.click())
          await startEditing(driver)
          await driver.executeScript(
            `[...document.querySelectorAll('dialog[open] form .row button[type=button]')].pop().click()`
          )
          await waitFor(async () => (await all('.toast .notice-action')).length > 0, { message: 'the notice' })
          try {
            await scan(`notice/${theme}/${width}`)
          } finally {
            await css('.toast .notice-action').then((undo) => undo.click())
            await waitFor(async () => (await all('.application-card')).length > 0, { message: 'the card to come back' })
          }

          // The question before leaving, asked because a note was typed and not added.
          await css('.application-card').then((card) => card.click())
          await startEditing(driver)
          await type('textarea[name=newNote]', 'A note that is not added')
          await press('')
          await waitFor(async () => (await all('#confirm-dialog')).length > 0, { message: 'the question' })
          await scan(`confirm/${theme}/${width}`)
          // Leaving anyway: the answer of the danger button closes the drawer and drops the text.
          await css('#confirm-dialog button[value=confirm]').then((leave) => leave.click())
          await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })

          // The dialog that adds an offer from the board.
          await css('button[name=addOffer]').then((button) => button.click())
          await waitFor(async () => (await all('#new-offer-dialog[open]')).length > 0, { message: 'the dialog' })
          await scan(`add/${theme}/${width}`)
          await press('\uE00C')
          await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the dialog to close' })

          // The question of a card that changed has three answers.
          await css('.application-card').then((card) => card.click())
          await startEditing(driver)
          await type('input[name=location]', 'Elsewhere')
          await press('\uE00C')
          await waitFor(async () => (await all('#choice-dialog[open]')).length > 0, { message: 'the three answers' })
          await scan(`choice/${theme}/${width}`)
          await css('#choice-dialog button[value=discard]').then((leave) => leave.click())
          await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
        } finally {
          await resize(1280, 800)
        }
      })
    }
  }

  // Every language, with its own words and its own direction: the popup with its error, then the board with a drawer open
  // at the width of a page zoomed to 200 %, where long words and the right-to-left writing are the most likely to break.
  test(`the pages have nothing axe can fault and hold at 200 % in the ${LANGUAGE_CODES.length} languages`, async () => {
    const before = (await getSettings()).locale
    const failures = []
    try {
      for (const code of LANGUAGE_CODES) {
        await setSettings({ locale: code })
        await resize(1280, 800)
        await open('popup', 'form')
        await driver.executeScript(
          `const form = document.querySelector('form'); form.noValidate = true; form.requestSubmit()`
        )
        await waitFor(async () => (await all('[role=alert].error')).length > 0, {
          message: `the error of the popup in ${code}`,
        })
        await scan(`popup-error/${code}`).catch((error) => failures.push(error.message))

        await resize(...ZOOMED)
        await open('board', '.application-card')
        await css('.application-card').then((card) => card.click())
        await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
          message: `the drawer in ${code}`,
        })
        // The card is read, then edited: the form is where long words and long labels are the most likely to break.
        await scan(`drawer/read/${code}/200%`).catch((error) => failures.push(error.message))
        await startEditing(driver)
        await scan(`drawer/edit/${code}/200%`).catch((error) => failures.push(error.message))
        const wide = await overflow()
        if (wide > 1) failures.push(`drawer/${code}/200%: the page is ${wide}px too wide`)

        // The page of the tables, at the same width: the table scrolls inside its own region, never the page.
        await open('tables', 'tbody tr')
        await scan(`tables/${code}/200%`).catch((error) => failures.push(error.message))
        const tablesWide = await overflow()
        if (tablesWide > 1) failures.push(`tables/${code}/200%: the page is ${tablesWide}px too wide`)
        // The page is in the language that was asked for, and written in its direction.
        const page = await driver.executeScript(
          `return { lang: document.documentElement.getAttribute('lang'), dir: document.documentElement.getAttribute('dir') }`
        )
        assert.equal(page.lang, code, `the page is not in ${code}`)
        assert.equal(page.dir, ['ar', 'he'].includes(code) ? 'rtl' : 'ltr', `${code} is not written in its direction`)
      }
    } finally {
      await resize(1280, 800)
      await setSettings({ locale: before ?? 'auto' })
    }
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`)
  })

  for (const [width, height] of SIZES) {
    test(`the pages hold at ${width} pixels wide`, async () => {
      await resize(width, height)
      for (const page of ['popup', 'options', 'board', 'tables']) {
        await open(page, 'footer')
        const wide = await overflow()
        assert.ok(wide <= 1, `${page} is ${wide}px too wide at ${width}`)
      }
      await open('board', '.application-card')
      // The columns share the width, and none is narrower than a card can be read in.
      const columns = await driver.executeScript(
        `return [...document.querySelectorAll('.column')].map((c) => Math.round(c.getBoundingClientRect().width))`
      )
      assert.ok(
        columns.every((w) => w >= 160),
        `a column is too narrow at ${width}: ${columns.join(', ')}`
      )
      // The window is not the page: what counts is the width of the page itself (the frame of the window takes some).
      const inner = await driver.executeScript(`return window.innerWidth`)
      // From 1200 pixels of page, the six columns that come with the extension are all seen with no sideways scroll of the board.
      if (inner >= 1200) {
        const scrolls = await driver.executeScript(
          `const board = document.querySelector('.board'); return board.scrollWidth - board.clientWidth`
        )
        assert.ok(scrolls <= 1, `the board scrolls sideways at ${width}: ${scrolls}px`)
      }
      // The options come in two columns from 1200 pixels of page, in one below.
      await open('options', 'footer')
      const sections = await driver.executeScript(
        `return new Set([...document.querySelectorAll('.options-grid > .card')].filter((card) => card.offsetParent !== null).map((card) => Math.round(card.getBoundingClientRect().left))).size`
      )
      assert.equal(
        sections,
        inner >= 1200 ? 2 : 1,
        `the sections of the options are in ${sections} columns at ${width}`
      )
    })
  }
})
