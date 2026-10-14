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
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { By } from 'selenium-webdriver'

import { launch, openPage, unpack, waitFor, zipFor } from './lib.mjs'

const browser = process.env.BROWSER || 'chrome'
const AXE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/axe-core/axe.min.js'),
  'utf8'
)
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
  after(async () => driver?.quit())

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
    await waitFor(async () => (await driver.executeScript(`return document.readyState`)) === 'complete')
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
    for (const page of ['popup', 'options', 'board']) {
      test(`${page} has nothing axe can fault, in the ${theme} look`, async () => {
        await open(page, 'footer')
        await look(theme)
        await scan(`${page}/${theme}`)
      })
    }

    test(`the drawer of an application has nothing axe can fault, in the ${theme} look`, async () => {
      await open('board', '.application-card')
      await look(theme)
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('textarea[name=newNote]')).length > 0, { message: 'the drawer' })
      await scan(`drawer/${theme}`)
    })
  }

  test('the options page has nothing axe can fault with an own theme open, and in the vision modes', async () => {
    await open('options', 'footer')
    await type('input[name=newTheme]', 'Mine')
    await driver.executeScript(`document.querySelector('input[name=newTheme]').closest('form').requestSubmit()`)
    await waitFor(async () => (await all('#theme-editor')).length > 0, { message: 'the theme editor' })
    await look('light')
    await scan('options/theme-editor')
    for (const vision of ['red-green', 'blue-yellow', 'high-contrast']) {
      await driver.executeScript(`document.documentElement.setAttribute('data-vision', arguments[0])`, vision)
      await driver.sleep(200)
      await scan(`options/${vision}`)
    }
  })

  test('the board is used with the keyboard: the title of a card opens it, escape closes it, and the focus comes back', async () => {
    await open('board', '.application-card')
    const opener = await css('.application-card .card-open')
    await opener.sendKeys('\uE007')
    await waitFor(async () => (await all('dialog[open] textarea[name=newNote]')).length > 0, { message: 'the drawer' })
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

  for (const [width, height] of SIZES) {
    test(`the pages hold at ${width} pixels wide`, async () => {
      await resize(width, height)
      for (const page of ['popup', 'options', 'board']) {
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
      // From 1280 pixels, the six columns that come with the extension are all seen with no sideways scroll of the board.
      if (width >= 1280) {
        const scrolls = await driver.executeScript(
          `const board = document.querySelector('.board'); return board.scrollWidth - board.clientWidth`
        )
        assert.ok(scrolls <= 1, `the board scrolls sideways at ${width}: ${scrolls}px`)
      }
      // The options come in two columns from 1280 pixels, in one below.
      await open('options', 'footer')
      const sections = await driver.executeScript(
        `return new Set([...document.querySelectorAll('.options-grid > .card')].map((card) => Math.round(card.getBoundingClientRect().left))).size`
      )
      assert.equal(
        sections,
        width >= 1280 ? 2 : 1,
        `the sections of the options are in ${sections} columns at ${width}`
      )
    })
  }
})
