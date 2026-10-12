// End-to-end tests: the built package (the zip of the stores) is loaded in a real browser.
//
//   BROWSER=chrome|edge|firefox npm test      (default: chrome)
//
// 1. install: the pages of the extension load, with the version and the footer.
// 2. options: the language, and the columns of the board.
// 3. flow: an offer is saved in the popup, seen on the board, noted and moved, and it is still there after a reload.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { By } from 'selenium-webdriver'

import { launch, openPage, unpack, version, waitFor, zipFor } from './lib.mjs'

const browser = process.env.BROWSER || 'chrome'

const REPOSITORY = 'https://github.com/Stanislas-Poisson/job-application-tracker'

describe(`extension in ${browser}`, { timeout: 300_000 }, () => {
  let driver
  let base

  before(async () => {
    const zip = zipFor(browser)
    const dir = unpack(zip)
    ;({ driver, base } = await launch(browser, { dir, zip }))
  })
  after(async () => driver?.quit())

  const css = (selector) => driver.findElement(By.css(selector))
  const all = (selector) => driver.findElements(By.css(selector))
  const texts = async (selector) => Promise.all((await all(selector)).map((element) => element.getText()))

  // Sets a field the way a user does, so that the page sees the change.
  const type = async (selector, value) => {
    const element = await css(selector)
    await element.clear()
    await element.sendKeys(value)
  }
  const choose = (selector, value) =>
    driver.executeScript(
      `const select = document.querySelector(arguments[0]);
       select.value = arguments[1];
       select.dispatchEvent(new Event('change', { bubbles: true }));`,
      selector,
      value
    )

  // Opens a page in a tab and waits for its content.
  const open = async (page, ready) => {
    const handle = await openPage(driver, browser, `${base}${page}.html`)
    await waitFor(async () => (await all(ready)).length > 0, { message: `${page} to load` })
    return handle
  }

  // The footer is the same on every page: the links of the project and the pills of the author.
  const checkFooter = async () => {
    const links = await Promise.all((await all('footer .links a')).map((link) => link.getAttribute('href')))
    assert.deepEqual(links, [REPOSITORY, `${REPOSITORY}/issues`, `${REPOSITORY}/blob/main/PRIVACY.md`])
    assert.deepEqual(await texts('footer .pills a'), [
      'GitHub',
      'GitLab',
      'LinkedIn',
      'Twitch',
      'Linktree',
      'Support the stream',
    ])
    assert.match(await text('footer .made-by'), /Stanislas Poisson \(Zairakai\)/)
  }
  const text = async (selector) => (await css(selector)).getText()

  describe('install', () => {
    for (const page of ['popup', 'options', 'board']) {
      test(`the ${page} page loads, with the version and the footer`, async () => {
        await open(page, '#version')

        assert.equal(await text('#version'), `v${version()}`)
        await checkFooter()
      })
    }
  })

  describe('options', () => {
    test('the board has the default columns', async () => {
      await open('options', '.status-list li')

      assert.equal((await all('.status-list li')).length, 6)
    })

    test('the language changes the texts of the page at once', async () => {
      await open('options', 'select[name=language]')
      assert.equal(await text('header nav a'), 'Board')

      await choose('select[name=language]', 'fr')
      await waitFor(async () => (await text('header nav a')) === 'Tableau', { message: 'the page in French' })

      await choose('select[name=language]', 'en')
      await waitFor(async () => (await text('header nav a')) === 'Board', { message: 'the page in English' })
    })

    test('the appearance applies at once, and to a page that is open elsewhere', async () => {
      const root = (name) => driver.executeScript(`return document.documentElement.getAttribute('${name}')`)
      const boardTab = await open('board', '.column')
      await open('options', 'select[name=theme]')

      await choose('select[name=theme]', 'dark')
      await css('button[data-accent-choice=purple]').then((swatch) => swatch.click())
      await choose('select[name=vision]', 'red-green')
      await waitFor(async () => (await root('data-theme')) === 'dark' && (await root('data-vision')) === 'red-green', {
        message: 'the appearance of the options page',
      })
      assert.equal(await root('data-accent'), 'purple')

      // The board, open in another tab, follows without a reload: dark, and a shape on each column.
      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await root('data-theme')) === 'dark', { message: 'the board in the dark theme' })
      assert.equal(await root('data-accent'), 'purple')
      const shapes = await texts('.column h2 .shape')
      assert.equal(shapes.length, 6)
      assert.equal(new Set(shapes).size, 6)
      const [red] = (await driver.executeScript('return getComputedStyle(document.body).backgroundColor')).match(/\d+/)
      assert.ok(Number(red) < 80, 'the background is dark')

      // Back to the defaults, for the tests that follow.
      await driver.switchTo().window(await driver.getAllWindowHandles().then((handles) => handles[handles.length - 1]))
      await choose('select[name=theme]', 'auto')
      await css('button[data-accent-choice=slate]').then((swatch) => swatch.click())
      await choose('select[name=vision]', 'standard')
      await waitFor(async () => (await root('data-vision')) === 'standard', { message: 'the standard appearance' })
    })

    test('a column is renamed, and the board shows its new name', async () => {
      const optionsTab = await open('options', 'input[name^=label-]')
      const boardTab = await open('board', '.column')

      await driver.switchTo().window(optionsTab)
      await type('input[name^=label-]', 'Backlog')
      await driver.switchTo().window(boardTab)
      await waitFor(async () => /Backlog/.test(await text('.column:first-child h2')), {
        message: 'the new name on the board',
      })

      // An empty name is not kept: the column keeps the last one.
      await driver.switchTo().window(optionsTab)
      await type('input[name^=label-]', 'To apply')
      await driver.switchTo().window(boardTab)
      await waitFor(async () => /To apply/.test(await text('.column:first-child h2')), { message: 'the old name back' })
    })

    test('a column is added, and removed when it is empty', async () => {
      await open('options', '.status-list li')

      await type('input[name=newStatus]', 'Phone screen')
      await (await all('form button[type=submit]'))[0].click()
      await waitFor(async () => (await all('.status-list li')).length === 7, { message: 'the new column' })

      const buttons = await all('.status-list li:last-child button')
      await buttons[buttons.length - 1].click()
      await waitFor(async () => (await all('.status-list li')).length === 6, { message: 'the column to be removed' })
    })
  })

  describe('flow', () => {
    let boardTab
    let popupTab

    test('the board is empty to begin with, with a column for each status', async () => {
      boardTab = await open('board', '.column')

      assert.equal((await all('.column')).length, 6)
      assert.equal((await all('.application-card')).length, 0)
      assert.match(await text('h2 + p, main > p.card'), /Nothing here yet/)
    })

    test('an offer saved in the popup shows on the board that is open, with no reload', async () => {
      popupTab = await open('popup', 'form')

      await type('input[name=title]', 'Backend developer')
      await type('input[name=company]', 'Acme')
      await type('input[name=location]', 'Paris')
      await type('textarea[name=note]', "Found on a friend's advice")
      await css('form button[type=submit]').then((button) => button.click())
      await waitFor(async () => (await all('.success')).length > 0, { message: 'the offer to be saved' })

      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await all('.application-card')).length === 1, { message: 'the card on the board' })

      const card = await text('.application-card')
      assert.match(card, /Backend developer/)
      assert.match(card, /Acme/)
      assert.match(card, /Paris/)
      assert.match(await text('.column:first-child h2'), /To apply\s*1/)
    })

    test('the card opens its details, takes a note, and moves to another column', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('textarea[name=newNote]')).length > 0, { message: 'the drawer' })

      // The note typed in the popup is the first one.
      assert.match(await text('.note-body'), /friend's advice/)

      await type('textarea[name=newNote]', 'Call back on Monday')
      const addNote = (await all('.drawer-content form button[type=submit]'))[1]
      await addNote.click()
      await waitFor(async () => (await all('.note-body')).length === 2, { message: 'the second note' })

      const applied = await driver.executeScript(
        `return [...document.querySelectorAll('select[name=status] option')].find((option) => option.textContent.trim() === 'Applied').value`
      )
      await choose('select[name=status]', applied)
      await waitFor(async () => (await texts('.drawer-content ul li strong')).includes('Moved to'), {
        message: 'the move in the timeline',
      })
    })

    test('everything is still there after a reload', async () => {
      await driver.switchTo().window(boardTab)
      // The change of column is written before the page is reloaded, as a user who goes away right after would do.
      await waitFor(
        async () => {
          const activities = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:activities', (items) => done(items['jat:activities'] || []));
          `)
          return activities.some((activity) => 'status_changed' === activity.type)
        },
        { message: 'the move to be stored' }
      )
      await driver.navigate().refresh()
      await waitFor(async () => (await all('.application-card')).length === 1, { message: 'the card after the reload' })

      assert.match(await text('.column:nth-child(2) h2'), /Applied\s*1/)
      assert.match(await text('.column:nth-child(2) .application-card'), /Backend developer/)
      assert.match(await text('.column:first-child h2'), /To apply\s*0/)
    })

    test('a salary in a foreign currency shows on the card, and in the home currency once a rate is given', async () => {
      // The home currency and the rate are set in the options, in the language of the page.
      const optionsTab = await open('options', 'select[name=homeCurrency]')
      await choose('select[name=homeCurrency]', 'EUR')

      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('input[name=salaryMin]')).length > 0, { message: 'the salary fields' })
      await type('input[name=salaryMin]', '4000')
      await type('input[name=salaryMax]', '5000')
      await choose('select[name=salaryCurrency]', 'USD')
      await choose('select[name=salaryPeriod]', 'month')
      await choose('select[name=salaryKind]', 'gross')
      await driver.executeScript(
        `document.querySelector('input[name=salaryMin]').closest('form').querySelector('button[type=submit]').click()`
      )

      // The card shows the range, the period and the kind, with the dollar as the language writes it.
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await waitFor(
        async () =>
          (await texts('.application-card .salary-line')).some((line) => /4,000.*5,000.*month.*gross/.test(line)),
        {
          message: 'the salary on the card',
        }
      )

      // With a rate of 0.9 EUR for 1 USD, the middle of 4 000 - 5 000 a month is 4 500 x 12 x 0.9 = 48 600 EUR a year.
      await driver.switchTo().window(optionsTab)
      await waitFor(async () => (await all('input[name=rate-USD]')).length > 0, { message: 'the rate of the dollar' })
      await type('input[name=rate-USD]', '0.9')
      await driver.switchTo().window(boardTab)
      await waitFor(
        async () =>
          /48,600/.test((await css('.application-card .salary-line').then((line) => line.getAttribute('title'))) ?? ''),
        {
          message: 'the salary in the home currency',
        }
      )

      // Back to no home currency, for the tests that follow.
      await driver.switchTo().window(optionsTab)
      await choose('select[name=homeCurrency]', '')
    })

    test('a reminder typed in the time zone of the settings is stored in UTC and shown in that zone', async () => {
      // Kiritimati is UTC+14: 09:00 on the 24th there is 19:00 on the 23rd in UTC.
      const optionsTab = await open('options', 'select[name=timeZone]')
      await choose('select[name=timeZone]', 'Pacific/Kiritimati')

      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('input[name=reminderDue]')).length > 0, { message: 'the reminder form' })

      await type('input[name=reminderTitle]', 'Follow up')
      await driver.executeScript(`
        const due = document.querySelector('input[name=reminderDue]');
        due.value = '2026-12-24T09:00';
        due.dispatchEvent(new Event('input', { bubbles: true }));
        due.closest('form').querySelector('button[type=submit]').click();
      `)

      const reminders = await waitFor(
        async () => {
          const stored = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:reminders', (items) => done(items['jat:reminders'] || []));
          `)
          return stored.length > 0 && stored
        },
        { message: 'the reminder to be stored' }
      )
      assert.equal(reminders[0].dueAt, '2026-12-23T19:00:00.000Z')

      // It is shown again in the zone it was typed in: the 24th, at 9.
      const shown = await waitFor(
        async () => (await texts('.drawer-content li')).find((line) => line.includes('Follow up')),
        {
          message: 'the reminder in the list',
        }
      )
      assert.match(shown, /24/)
      assert.match(shown, /9:00/)

      await driver.switchTo().window(optionsTab)
      await choose('select[name=timeZone]', 'auto')
    })
  })
})
