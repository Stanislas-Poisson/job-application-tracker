// End-to-end tests: the built package (the zip of the stores) is loaded in a real browser.
//
//   BROWSER=chrome|edge|firefox npm test      (default: chrome)
//
// 1. install: the pages of the extension load, with the version and the footer.
// 2. options: the language, and the columns of the board.
// 3. flow: an offer is saved in the popup, seen on the board, noted and moved, and it is still there after a reload.
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, test } from 'node:test'

import { By } from 'selenium-webdriver'

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterTest } from './diagnostics.mjs'
import {
  launch,
  openPage,
  quitBrowser,
  saveCard,
  showTabOf,
  startEditing,
  unpack,
  version,
  waitFor,
  zipFor,
} from './lib.mjs'

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
  afterEach(afterTest)
  after(async () => quitBrowser(driver))

  const css = (selector) => driver.findElement(By.css(selector))
  const all = (selector) => driver.findElements(By.css(selector))
  const texts = async (selector) => Promise.all((await all(selector)).map((element) => element.getText()))

  // Sets a field the way a user does, so that the page sees the change.
  const type = async (selector, value) => {
    const element = await css(selector)
    await element.clear()
    await element.sendKeys(value)
  }
  // The page is loaded and has drawn something: a script run during a navigation finds no document.
  const loaded = () =>
    waitFor(
      async () =>
        (await driver.executeScript(
          `return document.readyState === 'complete' && !!document.documentElement && !!document.body && document.body.children.length > 0`
        )) === true,
      { message: 'the page to be loaded' }
    )
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
    await showTabOf(driver, ready)
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
      await choose('select[name=contrast]', 'high')
      await waitFor(
        async () =>
          (await root('data-theme')) === 'dark' &&
          (await root('data-vision')) === 'red-green' &&
          (await root('data-contrast')) === 'high',
        { message: 'the appearance of the options page' }
      )
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
      await choose('select[name=contrast]', 'auto')
      await waitFor(
        async () => (await root('data-vision')) === 'standard' && (await root('data-contrast')) === 'auto',
        {
          message: 'the standard appearance',
        }
      )
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
      await driver.executeScript(`document.querySelector('input[name=newStatus]').form.requestSubmit()`)
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
      await startEditing(driver)
      await waitFor(async () => (await all('textarea[name=newNote]')).length > 0, { message: 'the drawer' })

      // The note typed in the popup is the first one.
      assert.match(await text('.note-body'), /friend's advice/)

      await type('textarea[name=newNote]', 'Call back on Monday')
      await driver.executeScript(
        `document.querySelector('textarea[name=newNote]').closest('form').querySelector('button[type=submit]').click()`
      )
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
      await startEditing(driver)
      await waitFor(async () => (await all('input[name=salaryMin]')).length > 0, { message: 'the salary fields' })
      await type('input[name=salaryMin]', '4000')
      await type('input[name=salaryMax]', '5000')
      await choose('select[name=salaryCurrency]', 'USD')
      await choose('select[name=salaryPeriod]', 'month')
      await choose('select[name=salaryKind]', 'gross')
      await saveCard(driver)

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

    test('a contact is saved with its phone in the international format', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('input[name=firstName]')).length > 0, { message: 'the contact form' })

      await type('input[name=firstName]', 'Ada')
      await type('input[name=lastName]', 'Lovelace')
      await type('input[name=email]', 'ADA@Example.com')
      // A number typed the way it is written at home, read in the country chosen.
      await type('input[name=phone]', '06 12 34 56 78')
      await choose('select[name=contactCountry]', 'FR')
      await driver.executeScript(
        `document.querySelector('input[name=firstName]').closest('form').querySelector('button[type=submit]').click()`
      )

      const line = await waitFor(
        async () => (await texts('.drawer-content .contact')).find((entry) => entry.includes('Ada')),
        {
          message: 'the contact in the list',
        }
      )
      assert.match(line, /\+33 6 12 34 56 78/)
      assert.match(line, /ada@example\.com/)
      assert.match(line, /France/)

      // The number is stored in E.164 and the email in lower case, each as a way to reach the person.
      const methods = await waitFor(
        async () => {
          const stored = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:contactMethods', (items) => done(items['jat:contactMethods'] || []));
          `)
          return stored.length >= 2 && stored
        },
        { message: 'the ways to reach the contact to be stored' }
      )
      assert.deepEqual(methods.map((method) => [method.type, method.value, method.isPrimary]).sort(), [
        ['email', 'ada@example.com', true],
        ['phone', '+33612345678', true],
      ])

      // A second email: it is kept, and the first stays the main one until the user changes it.
      await type('input[name=methodValue]', 'Ada@Home.example')
      await type('input[name=methodLabel]', 'home')
      await driver.executeScript(
        `document.querySelector('input[name=methodValue]').closest('form').querySelector('button[type=submit]').click()`
      )
      await waitFor(async () => /ada@home\.example/.test(await text('.drawer-content .contact')), {
        message: 'the second email',
      })
      assert.match(await text('.drawer-content .contact'), /\(home\)/)
      assert.equal((await all('.drawer-content .contact .primary-mark')).length, 2)

      // The second email becomes the main one: its "Make main" button is the one of its line.
      await driver.executeScript(`
        const line = [...document.querySelectorAll('.drawer-content .method')].find((item) => item.textContent.includes('ada@home.example'));
        [...line.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Make main').click();
      `)
      await waitFor(
        async () =>
          driver.executeScript(
            `return [...document.querySelectorAll('.drawer-content .method')].find((item) => item.textContent.includes('ada@home.example'))?.querySelector('.primary-mark') !== undefined`
          ),
        { message: 'the second email to be the main one' }
      )

      // The drawer is closed for the tests that follow.
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('an exchange with a contact is saved in UTC, listed, and shown in the timeline', async () => {
      const optionsTab = await open('options', 'select[name=timeZone]')
      await choose('select[name=timeZone]', 'Pacific/Kiritimati')

      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('input[name=interactionSubject]')).length > 0, {
        message: 'the exchange form',
      })

      await driver.executeScript(`
        const select = document.querySelector('select[name=interactionContact]');
        select.value = [...select.options].find((option) => option.textContent.includes('Ada')).value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const when = document.querySelector('input[name=interactionWhen]');
        when.value = '2026-12-24T09:00';
        when.dispatchEvent(new Event('input', { bubbles: true }));
      `)
      await type('input[name=interactionSubject]', 'Interview on Monday')
      await type('textarea[name=interactionBody]', 'Are you free at 10?')
      await driver.executeScript(
        `document.querySelector('input[name=interactionSubject]').closest('form').querySelector('button[type=submit]').click()`
      )

      const line = await waitFor(
        async () => (await texts('.drawer-content .exchange')).find((entry) => entry.includes('Interview')),
        {
          message: 'the exchange in the list',
        }
      )
      assert.match(line, /Email/)
      assert.match(line, /Received/)
      assert.match(line, /Ada Lovelace/)

      const stored = await waitFor(
        async () => {
          const exchanges = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:interactions', (items) => done(items['jat:interactions'] || []));
          `)
          return exchanges.length > 0 && exchanges
        },
        { message: 'the exchange to be stored' }
      )
      // 09:00 on the 24th in Kiritimati (UTC+14) is 19:00 on the 23rd in UTC.
      assert.equal(stored[0].occurredAt, '2026-12-23T19:00:00.000Z')
      assert.equal(stored[0].body, 'Are you free at 10?')

      // The timeline has it too, with the activities.
      const timeline = await texts('.drawer-content section:last-child li')
      assert.ok(
        timeline.some((entry) => entry.includes('Interview on Monday')),
        timeline.join(' | ')
      )

      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await driver.switchTo().window(optionsTab)
      await choose('select[name=timeZone]', 'auto')
    })

    test('an email pasted as text, and a CSV file, are imported once each, after a preview', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('details.import')).length > 0, { message: 'the import section' })
      await driver.executeScript(`document.querySelector('details.import').open = true`)

      const stored = () =>
        driver.executeAsyncScript(`
          const done = arguments[arguments.length - 1];
          chrome.storage.local.get('jat:interactions', (items) => done(items['jat:interactions'] || []));
        `)
      const before = (await stored()).length

      // An email that was pasted: it is read as one, with its date in UTC.
      const eml = [
        'From: Grace Hopper <grace@example.com>',
        'To: Me <me@example.com>',
        'Subject: Second interview',
        'Date: Mon, 12 Oct 2026 16:30:00 +0200',
        'Message-ID: <import-1@example.com>',
        '',
        'Can we meet on Friday?',
      ].join('\n')
      const paste = async () => {
        await driver.executeScript(
          `const text = document.querySelector('textarea[name=importText]');
           text.value = arguments[0];
           text.dispatchEvent(new Event('input', { bubbles: true }));
           text.closest('form').querySelector('button[type=submit]').click();`,
          eml
        )
        await waitFor(async () => (await all('.import-row')).length > 0, { message: 'the preview' })
      }
      await paste()
      assert.match(await text('.import-row'), /Second interview/)
      assert.match(await text('.import-row'), /Grace Hopper/)
      await driver.executeScript(
        `[...document.querySelectorAll('details.import button')].find((b) => /Import 1/.test(b.textContent)).click()`
      )
      await waitFor(async () => /1 added/.test(await text('#notices')), { message: 'the result' })

      const saved = await waitFor(async () => (await stored()).length > before && (await stored()), {
        message: 'the exchange to be stored',
      })
      const imported = saved.find((exchange) => '<import-1@example.com>' === exchange.externalRef)
      assert.equal(imported.occurredAt, '2026-10-12T14:30:00.000Z')
      assert.equal(imported.origin, 'paste')

      // The same email a second time is not added again.
      await paste()
      await driver.executeScript(
        `[...document.querySelectorAll('details.import button')].find((b) => /Import 1/.test(b.textContent)).click()`
      )
      await waitFor(async () => /1 already there/.test(await text('#notices')), {
        message: 'the duplicate to be seen',
      })

      // A CSV file: one good row, and one without a date, which is shown with its problem and cannot be chosen.
      await driver.executeScript(`document.querySelector('input[name=importMode][value=files]').click()`)
      await waitFor(async () => (await all('input[name=importFiles]')).length > 0, { message: 'the file field' })
      const file = path.join(os.tmpdir(), `exchanges-${Date.now()}.csv`)
      fs.writeFileSync(
        file,
        'channel,direction,date,subject,text\nphone,sent,2026-10-13T08:00:00Z,Call with Grace,25 minutes\nsms,received,,No date,Hello\n'
      )
      await css('input[name=importFiles]').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('.import-row')).length === 2, { message: 'the two rows of the file' })
      assert.match(await text('details.import'), /The date is missing/)
      assert.equal(
        await driver.executeScript(
          `return document.querySelectorAll('.import-row input[type=checkbox]:disabled').length`
        ),
        1
      )
      await driver.executeScript(
        `[...document.querySelectorAll('details.import button')].find((b) => /Import 1/.test(b.textContent)).click()`
      )
      await waitFor(async () => /1 added/.test(await text('#notices')), {
        message: 'the result of the file',
      })
      fs.rmSync(file)

      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('a tag, a favourite and a priority show on the card, and a tag is renamed from the options', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('input[name=tagName]')).length > 0, { message: 'the labels section' })

      await type('input[name=tagName]', 'remote')
      await driver.executeScript(
        `document.querySelector('input[name=tagName]').closest('form').querySelector('button[type=submit]').click()`
      )
      await css('button[name=favorite]').then((button) => button.click())
      await choose('select[name=priority]', '3')
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      await waitFor(async () => /remote/.test(await text('.application-card .tag-chip')), {
        message: 'the tag on the card',
      })
      assert.equal((await all('.application-card .card-star')).length, 1)
      // The priority is a separate change from the tag and the favourite: it is waited for, and if it never comes the test
      // says what the storage holds, to tell a display that is late from a change that was lost.
      try {
        await waitFor(async () => /High/.test(await text('.application-card')), { message: 'the priority on the card' })
      } catch (error) {
        const stored = await driver.executeAsyncScript(`
          const done = arguments[arguments.length - 1];
          chrome.storage.local.get('jat:applications', (items) => done((items['jat:applications'] || []).map((a) => ({ priority: a.priority, isFavorite: a.isFavorite }))));
        `)
        // What every open page did with the storage, to see which one put the old priority back.
        const journals = []
        for (const handle of await driver.getAllWindowHandles()) {
          await driver.switchTo().window(handle)
          const url = await driver.getCurrentUrl()
          const events = await driver.executeScript('return (window.__jat && window.__jat.events) || null')
          journals.push({ page: url.split('/').pop(), events })
        }
        throw new Error(
          `${error.message}; stored applications: ${JSON.stringify(stored)}; journals: ${JSON.stringify(journals)}`
        )
      }

      // The tag is renamed in the options, and the card follows.
      const optionsTab = await open('options', 'input[name^=tag-]')
      await type('input[name^=tag-]', 'télétravail')
      await driver.switchTo().window(boardTab)
      await waitFor(async () => /télétravail/.test(await text('.application-card .tag-chip')), {
        message: 'the new name of the tag',
      })

      // The links are stored once, whatever the tag is called.
      const links = await driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get(['jat:taggables', 'jat:tags'], (items) => done([items['jat:taggables'] || [], items['jat:tags'] || []]));
      `)
      assert.equal(links[0].length, 1)
      assert.equal(links[1][0].name, 'télétravail')

      await driver.switchTo().window(optionsTab)
    })

    test('the symbol of a tag shows with its name, and the option of the tags turns it off and on', async () => {
      // A symbol for the tag, chosen in the options (a letter: every machine can draw it).
      const optionsTab = await open('options', 'input[name^=symbol-]:not([name^=symbol-status])')
      await type('input[name^=symbol-]:not([name^=symbol-status])', 'T')
      await driver.executeScript(
        `document.querySelector('input[name^=symbol-]:not([name^=symbol-status])').dispatchEvent(new Event('change', { bubbles: true }))`
      )
      // It is kept in the storage first, then the card shows it.
      await waitFor(
        async () =>
          driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:tags', (items) => done((items['jat:tags'] || []).some((tag) => tag.symbol === 'T')));
          `),
        { message: 'the symbol to be kept' }
      )
      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await all('.application-card .tag-chip .item-symbol')).length > 0, {
        message: 'the symbol on the card',
      })

      // Turned off in the options: the card follows, and the name and the colour stay.
      await driver.switchTo().window(optionsTab)
      assert.equal(await css('input[name=showTagSymbols]').then((box) => box.isSelected()), true, 'on by default')
      await css('input[name=showTagSymbols]').then((box) => box.click())
      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await all('.application-card .tag-chip .item-symbol')).length === 0, {
        message: 'the symbol to go',
      })
      assert.ok((await all('.application-card .tag-chip')).length > 0, 'the tag is still on the card')

      // The editor of the tags still shows the symbol that was chosen, to be changed or removed.
      await driver.switchTo().window(optionsTab)
      assert.equal(
        await css('input[name^=symbol-]:not([name^=symbol-status])').then((field) => field.getAttribute('value')),
        'T'
      )

      // And turned on again.
      await css('input[name=showTagSymbols]').then((box) => box.click())
      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await all('.application-card .tag-chip .item-symbol')).length > 0, {
        message: 'the symbol to come back',
      })
      await driver.switchTo().window(optionsTab)
    })

    test('the board is searched, filtered and sorted, and keeps the view it was left in', async () => {
      // Two more applications, in the first column.
      for (const [title, company] of [
        ['Zebra engineer', 'Globex'],
        ['Alpha engineer', 'Initech'],
      ]) {
        await open('popup', 'form')
        await type('input[name=title]', title)
        await type('input[name=company]', company)
        await css('form button[type=submit]').then((button) => button.click())
        await waitFor(async () => (await all('.success')).length > 0, { message: `${title} to be saved` })
      }

      await driver.switchTo().window(boardTab)
      await waitFor(async () => (await all('.application-card')).length === 3, { message: 'the three cards' })
      assert.match(await text('.filter-summary'), /3 of 3/)

      // A search ignores the case and the accents, and the summary says how many are shown.
      await type('input[name=search]', 'INITECH')
      await waitFor(async () => (await all('.application-card')).length === 1, {
        message: 'the search to narrow the board',
      })
      assert.match(await text('.application-card'), /Alpha engineer/)
      assert.match(await text('.filter-summary'), /1 of 3/)
      await driver.executeScript(
        `[...document.querySelectorAll('.filter-summary button')].find((b) => /Clear/.test(b.textContent)).click()`
      )
      await waitFor(async () => (await all('.application-card')).length === 3, { message: 'the filters to be cleared' })

      // The favourites: the first application was starred earlier.
      await driver.executeScript(`document.querySelector('details.filter-panel').open = true`)
      await driver.executeScript(`document.querySelector('input[name=filterFavorites]').click()`)
      await waitFor(async () => (await all('.application-card')).length === 1, { message: 'the favourites' })
      assert.match(await text('.application-card'), /Backend developer/)
      await driver.executeScript(`document.querySelector('input[name=filterFavorites]').click()`)

      // A sort by the job title, from A to Z then from Z to A, in the column of the new applications.
      const order = async () => texts('.column:first-child .application-card h3')
      await choose('select[name=sort]', 'title')
      await waitFor(async () => /Alpha/.test((await order())[0] ?? ''), { message: 'A to Z' })
      await css('button[name=direction]').then((button) => button.click())
      await waitFor(async () => /Zebra/.test((await order())[0] ?? ''), { message: 'Z to A' })

      // The view is kept: the board opens with the sort that was chosen.
      await waitFor(
        async () =>
          'title' ===
          (await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:view', (items) => done((items['jat:view'] || {}).sort));
          `)),
        { message: 'the view to be stored' }
      )
      await driver.navigate().refresh()
      await waitFor(async () => (await all('.application-card')).length === 3, {
        message: 'the board after the reload',
      })
      await waitFor(
        async () =>
          (await driver.executeScript(`return document.querySelector('select[name=sort]').value`)) === 'title',
        {
          message: 'the sort to be kept',
        }
      )

      await choose('select[name=sort]', 'manual')
    })

    test('a reminder typed in the time zone of the settings is stored in UTC and shown in that zone', async () => {
      // Kiritimati is UTC+14: 09:00 on the 24th there is 19:00 on the 23rd in UTC.
      const optionsTab = await open('options', 'select[name=timeZone]')
      await choose('select[name=timeZone]', 'Pacific/Kiritimati')

      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
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

    test('the board reminds to back up when there is data and no backup, and "Later" hides the reminder', async () => {
      const tab = await open('board', '.column')

      await waitFor(async () => (await all('#backup-reminder')).length > 0, { message: 'the backup reminder' })
      assert.match(await text('#backup-reminder'), /not backed up your data yet/)

      const buttons = await all('#backup-reminder button')
      assert.equal(buttons.length, 2)
      await buttons[1].click()
      await waitFor(async () => (await all('#backup-reminder')).length === 0, { message: 'the reminder to hide' })

      // The options say the same, and offer the number of days of the reminder.
      await open('options', '#last-backup')
      assert.match(await text('#last-backup'), /No backup yet/)
      assert.equal(await css('input[name=backupReminderDays]').then((input) => input.getAttribute('value')), '30')

      // With the reminder turned off, the board stays quiet.
      await type('input[name=backupReminderDays]', '0')
      await driver.switchTo().window(tab)
      await driver.navigate().refresh()
      await waitFor(async () => (await all('.column')).length > 0, { message: 'the board to reload' })
      assert.equal((await all('#backup-reminder')).length, 0)

      await driver.switchTo().window(await open('options', '#last-backup'))
      await type('input[name=backupReminderDays]', '30')
    })

    test('a backup file is previewed before it replaces the data, and cancelling changes nothing', async () => {
      const file = path.join(os.tmpdir(), `jat-restore-${Date.now()}.json`)
      // A backup of an empty extension: every application stored here would be lost by the restore.
      const empty = { app: 'job-application-tracker', schema: 1, exportedAt: '2026-10-01T08:00:00.000Z', data: {} }
      fs.writeFileSync(file, JSON.stringify(empty))

      await open('options', '#restore-file')
      await css('#restore-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#restore-preview')).length > 0, { message: 'the preview' })

      const preview = await text('#restore-preview')
      assert.match(preview, /Backup of/)
      assert.match(preview, /without the settings/)
      assert.match(preview, /will be removed/)
      assert.match(preview, /Applications/)
      assert.match(preview, /no checksum/)

      // Cancel: the preview goes away and the data is still there.
      const buttons = await all('#restore-preview button')
      await buttons[1].click()
      await waitFor(async () => (await all('#restore-preview')).length === 0, { message: 'the preview to close' })
      await open('board', '.column')
      assert.ok((await all('.application-card')).length > 0)

      // A file that is not a backup says so and changes nothing.
      fs.writeFileSync(file, JSON.stringify({ hello: 'world' }))
      await open('options', '#restore-file')
      await css('#restore-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#notices [data-variant=error]')).length > 0, { message: 'the error' })
      assert.match(await text('#notices [data-variant=error]'), /not an export/)
      assert.equal((await all('#restore-preview')).length, 0)
      fs.unlinkSync(file)
    })

    test('the data of another computer is previewed, needs the risk of duplicates to be accepted, then is added without removing anything', async () => {
      const file = path.join(os.tmpdir(), `jat-merge-${Date.now()}.json`)
      const other = {
        app: 'job-application-tracker',
        schema: 8,
        exportedAt: '2026-10-01T08:00:00.000Z',
        data: { companies: [{ id: 'company_other_computer', name: 'Other Computer Co' }] },
      }
      fs.writeFileSync(file, JSON.stringify(other))
      await open('options', '#merge-file')
      await css('#merge-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#merge-preview')).length > 0, { message: 'the merge preview' })
      assert.match(await text('#merge-preview'), /Companies/)
      assert.match(await text('#merge-preview'), /1 will be added/)
      // The risk is accepted first.
      assert.equal(await css('#merge-apply').then((button) => button.isEnabled()), false)
      await css('#merge-understood').then((box) => box.click())
      await waitFor(async () => css('#merge-apply').then((button) => button.isEnabled()), {
        message: 'the button to be enabled',
      })
      await css('#merge-apply').then((button) => button.click())
      try {
        await waitFor(async () => (await all('#merge-preview')).length === 0, { message: 'the merge to be applied' })
      } catch (error) {
        throw new Error(
          `${error.message} / page says: ${(await all('#notices [data-variant=error]')).length ? await text('#notices [data-variant=error]') : 'nothing'}`
        )
      }

      const names = await waitFor(
        async () => {
          const companies = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get(null, (items) => done(items['jat:companies'] || []));
          `)
          return companies.some((company) => company.name === 'Other Computer Co') && companies
        },
        { message: 'the company of the other computer to be kept' }
      )
      assert.ok(names.length >= 1)
      // Nothing was removed.
      await open('board', '.column')
      assert.ok((await all('.application-card')).length > 0)
      fs.unlinkSync(file)
    })

    test('the text can be as large as 200% with the widest spacing, and the options page still holds', async () => {
      await open('options', 'select[name=textScale]')
      await choose('select[name=textScale]', '200')
      await choose('select[name=textSpacing]', 'widest')
      await choose('select[name=density]', 'compact')
      await waitFor(
        async () =>
          (await driver.executeScript(`return getComputedStyle(document.documentElement).fontSize`)) === '32px',
        { message: 'the size to be applied' }
      )
      assert.equal(await driver.executeScript(`return document.documentElement.dataset.density`), 'compact')
      // Nothing sticks out of the page on the side.
      const overflow = await driver.executeScript(
        `return document.documentElement.scrollWidth - document.documentElement.clientWidth`
      )
      assert.ok(overflow <= 1, `the page is ${overflow}px too wide`)

      // The choice is kept: another page opens with it.
      await open('board', '.column')
      assert.equal(await driver.executeScript(`return getComputedStyle(document.documentElement).fontSize`), '32px')

      // And back to the usual look.
      await open('options', 'select[name=textScale]')
      await choose('select[name=textScale]', '100')
      await choose('select[name=textSpacing]', 'default')
      await choose('select[name=density]', 'comfortable')
      await waitFor(
        async () =>
          (await driver.executeScript(`return getComputedStyle(document.documentElement).fontSize`)) === '16px',
        { message: 'the usual size to be back' }
      )
    })

    test('a column gets a symbol of the user, hidden from screen readers, and one character is kept', async () => {
      const setSymbol = (value) =>
        driver.executeScript(
          `const input = document.querySelector('input[name=symbol-status_applied]'); input.value = arguments[0]; input.dispatchEvent(new Event('change', { bubbles: true }))`,
          value
        )
      await open('options', 'input[name=symbol-status_applied]')
      // What follows the first character is dropped, and the field shows what was kept.
      await setSymbol('ab')
      await waitFor(
        async () =>
          (await driver.executeScript(`return document.querySelector('input[name=symbol-status_applied]').value`)) ===
          'a',
        { message: 'one character kept' }
      )
      await setSymbol('★')
      await waitFor(
        async () =>
          (await driver.executeScript(`return document.querySelector('input[name=symbol-status_applied]').value`)) ===
          '★',
        { message: 'the symbol' }
      )

      await open('board', '.column')
      await waitFor(
        async () =>
          (await driver.executeScript(
            `return [...document.querySelectorAll('.column h2 .shape')].some((s) => s.textContent === '★' && s.getAttribute('aria-hidden') === 'true')`
          )) === true,
        { message: 'the symbol in front of the column' }
      )

      // Back to none: the column has its dot again.
      await open('options', 'input[name=symbol-status_applied]')
      await setSymbol('')
      await open('board', '.column')
      await waitFor(
        async () =>
          (await driver.executeScript(
            `return ![...document.querySelectorAll('.column h2 .shape')].some((s) => s.textContent === '★')`
          )) === true,
        { message: 'the symbol to be gone' }
      )
    })

    test('the page tells its language and direction, and the language list names each language in itself', async () => {
      await open('options', 'select[name=language]')
      const names = await driver.executeScript(
        `return [...document.querySelectorAll('select[name=language] option')].map((o) => o.textContent.trim())`
      )
      assert.ok(names.includes('English') && names.includes('Français'), names.join(', '))
      await choose('select[name=language]', 'fr')
      await waitFor(async () => (await driver.executeScript(`return document.documentElement.lang`)) === 'fr', {
        message: 'lang to be fr',
      })
      assert.equal(await driver.executeScript(`return document.documentElement.dir`), 'ltr')
      await choose('select[name=language]', 'en')
      await waitFor(async () => (await driver.executeScript(`return document.documentElement.lang`)) === 'en', {
        message: 'lang to be en',
      })
    })

    test('the pages hold when the writing runs from right to left', async () => {
      for (const page of ['options', 'popup']) {
        await open(page, 'body')
        await loaded()
        await driver.executeScript(`document.documentElement.dir = 'rtl'`)
        const overflow = await driver.executeScript(
          `return document.documentElement.scrollWidth - document.documentElement.clientWidth`
        )
        assert.ok(overflow <= 1, `${page} is ${overflow}px too wide from right to left`)
      }
      await open('board', '.column')
      await loaded()
      await driver.executeScript(`document.documentElement.dir = 'rtl'`)
      // The first column is at the start of the line, which is now on the right.
      const side = await driver.executeScript(`
        const columns = [...document.querySelectorAll('.column')];
        return columns[0].getBoundingClientRect().left > columns[columns.length - 1].getBoundingClientRect().left;
      `)
      assert.equal(side, true, 'the columns are mirrored')
    })

    test('the pages hold with long accented texts, from right to left, and with tall letters: nothing is cut or sticks out', async () => {
      // A pseudo-language made on the page: every text 40% longer and accented, as German or Finnish can be.
      const stretch = `
        const accents = { a: 'à', e: 'é', i: 'î', o: 'ô', u: 'ü', c: 'ç', n: 'ñ', A: 'Å', E: 'É', O: 'Ö', U: 'Ü' };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const text = node.nodeValue;
          if (!text.trim() || node.parentElement.closest('script, style')) continue;
          const accented = text.replace(/[aeioucnAEOU]/g, (c) => accents[c]);
          const extra = Math.ceil(text.trim().length * 0.4);
          node.nodeValue = accented + ' ' + 'xyzw '.repeat(Math.ceil(extra / 5)).slice(0, extra).trim();
        }
        document.documentElement.style.lineHeight = '1.9';
      `
      // What is cut: an element that hides what does not fit, or that has a fixed width its text goes out of.
      const check = `
        const problems = [];
        const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (page > 1) {
          const wide = [...document.body.querySelectorAll('*')]
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
            .filter((el, _i, all) => !all.some((other) => other !== el && el.contains(other)))
            .slice(0, 4)
            .map((el) => el.tagName + '#' + el.id + '.' + el.className + ' ' + (el.textContent || '').trim().slice(0, 30));
          problems.push('page ' + page + 'px too wide: ' + wide.join(' | '));
        }
        for (const el of document.body.querySelectorAll('*')) {
          const style = getComputedStyle(el);
          // Text made for a screen reader and clipped on purpose is not text that is cut.
          if (style.display === 'none' || !el.textContent.trim() || el.closest('.visually-hidden')) continue;
          const hides = ['hidden', 'clip'].includes(style.overflowX) || style.textOverflow === 'ellipsis';
          if (hides && el.scrollWidth > el.clientWidth + 1 && !el.closest('select, option, input, textarea')) {
            problems.push((el.className || el.tagName) + ' cuts its text (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
          }
        }
        return problems.slice(0, 8);
      `
      // The check sees a text that is cut: a control, made on purpose, must be found.
      await open('options', 'body')
      await loaded()
      await driver.executeScript(`
        const cut = document.createElement('div');
        cut.id = 'cut-control';
        cut.style.cssText = 'width:20px;overflow:hidden;white-space:nowrap';
        cut.textContent = 'a text much longer than twenty pixels';
        document.body.append(cut);
      `)
      const control = await driver.executeScript(check)
      assert.ok(
        control.some((problem) => /cut-control|DIV/.test(problem)),
        `the control was not found: ${control}`
      )
      await driver.executeScript(`document.getElementById('cut-control').remove()`)

      for (const dir of ['ltr', 'rtl']) {
        for (const page of ['options', 'popup', 'board']) {
          await open(page, page === 'board' ? '.column' : 'body')
          await loaded()
          await driver.executeScript(`document.documentElement.dir = '${dir}'`)
          await driver.executeScript(stretch)
          const problems = await driver.executeScript(check)
          assert.deepEqual(
            problems.filter((problem) => !(page === 'board' && /^page /.test(problem))),
            [],
            `${page} (${dir})`
          )
        }
      }
    })

    test('a custom theme changes the colours at once, warns about a contrast that is too low, and corrects it', async () => {
      await open('options', 'select[name=theme]')
      await choose('select[name=theme]', 'light')
      await type('input[name=newTheme]', 'Warm')
      await driver.executeScript(`document.querySelector('input[name=newTheme]').form.requestSubmit()`)
      await waitFor(async () => (await all('#theme-editor')).length > 0, { message: 'the theme editor' })
      const setColor = (name, value) =>
        driver.executeScript(
          `const input = document.querySelector('input[name="' + arguments[0] + '"]'); input.value = arguments[1]; input.dispatchEvent(new Event('change', { bubbles: true }))`,
          name,
          value
        )
      const background = () => driver.executeScript(`return getComputedStyle(document.body).backgroundColor`)

      await setColor('light-background', '#ffeecc')
      await waitFor(async () => (await background()) === 'rgb(255, 238, 204)', {
        message: 'the background of the theme',
      })

      // A text that is too light on that background: a warning, then a correction.
      await setColor('light-text', '#eeeeee')
      await waitFor(async () => (await all('#theme-issues-light')).length > 0, { message: 'the contrast warning' })
      assert.match(await text('#theme-issues-light'), /Text on Background/)
      for (let tries = 0; tries < 4 && (await all('#theme-issues-light')).length > 0; tries++) {
        await driver.executeScript(`document.querySelector('#theme-issues-light .theme-correct').click()`)
        await driver.sleep(150)
      }
      await waitFor(async () => (await all('#theme-issues-light')).length === 0, {
        message: 'the contrast to be corrected',
      })

      // Back to the standard themes: the colours go back.
      await choose('select[name=customTheme]', '')
      await waitFor(async () => (await background()) !== 'rgb(255, 238, 204)', { message: 'the standard colours' })

      // Another page uses the theme too.
      await choose(
        'select[name=customTheme]',
        await driver.executeScript(`return document.querySelector('select[name=customTheme] option:last-child').value`)
      )
      await open('board', '.column')
      assert.equal(await background(), 'rgb(255, 238, 204)')

      // Delete it and leave things as they were.
      await open('options', '#theme-editor')
      await driver.executeScript(
        `[...document.querySelectorAll('#theme-editor button')].find((b) => b.textContent.trim() === 'Delete this theme').click()`
      )
      await waitFor(async () => (await all('#theme-editor')).length === 0, { message: 'the theme to be deleted' })
      await choose('select[name=theme]', 'auto')
    })

    test('the date follows the language, is overridden by the format of the user, and can say how long ago', async () => {
      await open('options', 'select[name=dateFormat]')
      const preview = () => text('#date-preview')
      // By default the language decides: month first in English.
      assert.match(await preview(), /\d{1,2}\/\d{1,2}\/\d{4}/)

      await choose('select[name=dateFormat]', 'ymd')
      await waitFor(async () => /\d{4}-\d{2}-\d{2}/.test(await preview()), { message: 'year-month-day' })
      await choose('select[name=timeFormat]', 'h24')
      await waitFor(async () => /\d{2}:\d{2}$/.test(await preview()), { message: '24 hours' })

      // The language of the page does not change a format the user chose.
      await choose('select[name=language]', 'fr')
      await waitFor(async () => /Affiché ainsi/.test(await preview()), { message: 'the page in French' })
      assert.match(await preview(), /\d{4}-\d{2}-\d{2}/)

      // A format of the user's own, with a text kept as written.
      await choose('select[name=dateFormat]', 'custom')
      const input = await css('input[name=dateCustom]')
      await input.clear()
      await input.sendKeys('dddd D MMMM YYYY [!]')
      await waitFor(async () => /\d{1,2} \p{L}+ \d{4} !/u.test(await preview()), { message: 'the custom format' })

      await choose('select[name=relativeDates]', 'both')
      await waitFor(async () => /·/.test(await preview()), { message: 'the date and how long ago' })

      await choose('select[name=dateFormat]', 'auto')
      await choose('select[name=timeFormat]', 'auto')
      await choose('select[name=relativeDates]', 'off')
      await choose('select[name=language]', 'en')
    })

    test('a language file with the code of a language of the extension is refused, and in the developer mode it is only previewed as a replacement', async () => {
      const file = path.join(os.tmpdir(), `jat-replace-${Date.now()}.json`)
      fs.writeFileSync(
        file,
        JSON.stringify({
          app: 'job-application-tracker-language',
          code: 'es',
          name: 'Español de prueba',
          dir: 'ltr',
          messages: { nav: { board: 'Mi tablero' } },
        })
      )
      await open('options', '#language-file')
      await css('#language-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#notices [data-variant=error]')).length > 0, { message: 'the refusal' })
      assert.match(await text('#notices [data-variant=error]'), /already in the extension/)

      await driver.executeScript(`document.querySelector('input[name=developerMode]').click()`)
      await css('#language-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#language-replaces')).length > 0, { message: 'the replacement notice' })
      assert.match(await text('#language-replaces'), /replaces the language/)
      // Only a preview: nothing is kept until the answer, and cancelling keeps nothing.
      await driver.executeScript(`[...document.querySelectorAll('#language-preview button')].at(-1).click()`)
      assert.equal((await all('#language-installed')).length, 0)
      await driver.executeScript(`document.querySelector('input[name=developerMode]').click()`)
      fs.unlinkSync(file)
    })

    test('each language the extension comes with holds on the pages, tells its direction, and says when nobody who speaks it checked it', async () => {
      const expected = {
        fr: { dir: 'ltr', column: 'À postuler', notice: false },
        es: { dir: 'ltr', column: 'Por enviar', notice: true },
        de: { dir: 'ltr', column: 'Zu bewerben', notice: true },
        ar: { dir: 'rtl', column: 'للتقديم', notice: true },
        en: { dir: 'ltr', column: 'To apply', notice: false },
      }
      for (const [code, want] of Object.entries(expected)) {
        await open('options', 'select[name=language]')
        await choose('select[name=language]', code)
        await waitFor(async () => (await driver.executeScript(`return document.documentElement.lang`)) === code, {
          message: `lang to be ${code}`,
        })
        assert.equal(await driver.executeScript(`return document.documentElement.dir`), want.dir, code)
        const notices = await all('#language-unreviewed')
        assert.equal(notices.length > 0, want.notice, `${code}: notice`)
        if (want.notice) {
          const link = await driver.executeScript(`return document.querySelector('#language-unreviewed a').href`)
          assert.match(link, /issues\/new\?template=translation\.yml/, code)
          assert.match(link, new RegExp(`language=${code}`), code)
        }
        const overflow = await driver.executeScript(
          `return document.documentElement.scrollWidth - document.documentElement.clientWidth`
        )
        assert.ok(overflow <= 1, `${code}: options is ${overflow}px too wide`)
        await open('board', '.column')
        await loaded()
        assert.match(await text('.column'), new RegExp(want.column), code)
        const boardOverflow = await driver.executeScript(
          `return document.documentElement.scrollWidth - document.documentElement.clientWidth`
        )
        assert.ok(boardOverflow <= 1, `${code}: board is ${boardOverflow}px too wide`)
      }
    })

    test('a language of the user is imported from a file, checked before it is kept, used, and removed', async () => {
      const file = path.join(os.tmpdir(), `jat-language-${Date.now()}.json`)
      fs.writeFileSync(
        file,
        JSON.stringify({
          app: 'job-application-tracker-language',
          code: 'eo',
          name: 'Esperanto',
          dir: 'ltr',
          messages: {
            options: { language: 'Språk' },
            // Refused: it looks like markup. Refused: it drops the placeholder of the English text.
            nav: { board: '<img src=x onerror=alert(1)>' },
            trash: { related: { one: '{count} relaterad', other: '{count} {extra}' } },
            made: { up: 'ignored' },
          },
        })
      )
      await open('options', '#language-file')
      // A file that is not a language file is refused with its reason.
      const wrong = path.join(os.tmpdir(), `jat-wrong-${Date.now()}.json`)
      fs.writeFileSync(wrong, JSON.stringify({ hello: 'world' }))
      await css('#language-file').then((input) => input.sendKeys(wrong))
      await waitFor(async () => (await all('#notices [data-variant=error]')).length > 0, { message: 'the error' })
      assert.match(await text('#notices [data-variant=error]'), /not a language file/)
      fs.unlinkSync(wrong)

      await css('#language-file').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('#language-preview')).length > 0, { message: 'the preview' })
      const preview = await text('#language-preview')
      assert.match(preview, /Esperanto/)
      assert.match(preview, /2 texts were refused/)
      assert.match(await text('#language-problems'), /nav\.board/)
      assert.match(await text('#language-problems'), /trash\.related/)
      assert.match(preview, /not in the extension and is ignored/)
      // Nothing is kept before the answer.
      assert.equal((await all('#language-installed')).length, 0)

      await css('#language-keep').then((button) => button.click())
      await waitFor(async () => (await all('#language-installed')).length > 0, { message: 'the language to be kept' })
      await choose('select[name=language]', 'eo')
      await waitFor(async () => (await driver.executeScript(`return document.documentElement.lang`)) === 'eo', {
        message: 'lang to be sv',
      })
      await waitFor(async () => /Språk/.test(await text('main')), { message: 'the translated text' })
      // A text that was refused is English.
      await open('board', '.column')
      assert.match(await text('header, .header'), /Board/)

      // Removing it: the page is back to English.
      await open('options', '#language-installed')
      await driver.executeScript(`document.querySelector('#language-installed button').click()`)
      await waitFor(async () => (await all('#language-installed')).length === 0, {
        message: 'the language to be removed',
      })
      await waitFor(async () => (await driver.executeScript(`return document.documentElement.lang`)) === 'en', {
        message: 'back to English',
      })
      fs.unlinkSync(file)
    })

    test('the checksum of a backup is checked: a file that was changed needs an explicit yes', async () => {
      const canonical = (value) =>
        JSON.stringify(
          (function sort(item) {
            if (Array.isArray(item)) return item.map(sort)
            if (item && typeof item === 'object') {
              return Object.fromEntries(
                Object.entries(item)
                  .sort(([a], [b]) => (a < b ? -1 : 1))
                  .map(([key, inner]) => [key, sort(inner)])
              )
            }
            return item
          })(value)
        )
      const checksum = (file) => `sha256:${crypto.createHash('sha256').update(canonical(file)).digest('hex')}`
      const file = path.join(os.tmpdir(), `jat-checksum-${Date.now()}.json`)
      const backup = { app: 'job-application-tracker', schema: 2, exportedAt: '2026-10-01T08:00:00.000Z', data: {} }
      const pick = async () => {
        await open('options', '#restore-file')
        await css('#restore-file').then((input) => input.sendKeys(file))
        await waitFor(async () => (await all('#restore-preview')).length > 0, { message: 'the preview' })
      }

      // The checksum computed here (Node) matches the one the extension computes (the browser).
      fs.writeFileSync(file, JSON.stringify({ ...backup, checksum: checksum(backup) }, null, 4))
      await pick()
      assert.match(await text('#restore-checksum'), /checksum matches/)
      assert.equal((await all('#restore-acknowledge')).length, 0)

      // One character changed after the checksum was written.
      fs.writeFileSync(
        file,
        JSON.stringify({ ...backup, exportedAt: '2026-10-02T08:00:00.000Z', checksum: checksum(backup) })
      )
      await pick()
      assert.match(await text('#restore-checksum'), /does not match/)
      const apply = await css('#restore-apply')
      assert.equal(await apply.isEnabled(), false)
      await css('#restore-acknowledge').then((box) => box.click())
      assert.equal(await apply.isEnabled(), true)
      fs.unlinkSync(file)
    })

    test('a backup protected by a passphrase hides the data, and is opened with the passphrase only', async () => {
      const PASSPHRASE = 'correct horse battery'
      await open('options', '#backup-protect')
      // The file picker of the system cannot be driven: a fake one keeps what is written.
      await driver.executeScript(`
        window.__written = null;
        window.showSaveFilePicker = async () => ({
          name: 'backup.json',
          createWritable: async () => ({ write: async (text) => { window.__written = text }, close: async () => {} }),
        });
      `)

      await css('#backup-protect').then((box) => box.click())
      await waitFor(async () => (await all('.passphrase-setup')).length > 0, { message: 'the form of the passphrase' })
      assert.match(await text('.passphrase-setup'), /cannot be opened/)

      // Too short, then not the same twice, then good.
      await type('.passphrase-setup input[name=passphrase]', 'short')
      await type('.passphrase-setup input[name=passphraseAgain]', 'short')
      await driver.executeScript(`document.querySelector('.passphrase-setup').requestSubmit()`)
      await waitFor(async () => (await all('.passphrase-setup .error')).length > 0, { message: 'a message' })

      await type('.passphrase-setup input[name=passphrase]', PASSPHRASE)
      await type('.passphrase-setup input[name=passphraseAgain]', `${PASSPHRASE}x`)
      await driver.executeScript(`document.querySelector('.passphrase-setup').requestSubmit()`)
      await waitFor(async () => /not the same/.test(await text('.passphrase-setup .error')), {
        message: 'the mismatch',
      })

      await type('.passphrase-setup input[name=passphraseAgain]', PASSPHRASE)
      await driver.executeScript(`document.querySelector('.passphrase-setup').requestSubmit()`)
      await waitFor(async () => (await all('.passphrase-setup')).length === 0, { message: 'the passphrase to be set' })

      // The backup is written encrypted: the offers saved earlier are not readable in it.
      await css('#backup-now').then((button) => button.click())
      const written = await waitFor(async () => driver.executeScript('return window.__written'), {
        message: 'the backup',
      })
      const file = JSON.parse(written)
      assert.equal(file.format, 'encrypted')
      assert.equal(file.kdf.name, 'PBKDF2')
      assert.ok(file.kdf.iterations >= 600000, `the key is made with ${file.kdf.iterations} iterations`)
      assert.ok(!written.includes('Backend developer'), 'the title of an offer is readable in the protected backup')
      assert.ok(
        !written.includes('Acme'),
        `the name of a company is readable in the protected backup (${written.length} characters)`
      )

      // Restoring: the passphrase is asked, a wrong one changes nothing, the right one shows the preview.
      const protectedFile = path.join(os.tmpdir(), `jat-protected-${Date.now()}.json`)
      fs.writeFileSync(protectedFile, written)
      await open('options', '#restore-file')
      await css('#restore-file').then((input) => input.sendKeys(protectedFile))
      await waitFor(async () => (await all('#restore-locked')).length > 0, { message: 'the passphrase prompt' })

      await type('#restore-passphrase', 'a wrong passphrase')
      await driver.executeScript(`document.querySelector('#restore-locked').requestSubmit()`)
      await waitFor(async () => (await all('#notices [data-variant=error]')).length > 0, { message: 'the error' })
      assert.match(await text('#notices [data-variant=error]'), /wrong/)
      assert.equal((await all('#restore-preview')).length, 0)

      await type('#restore-passphrase', PASSPHRASE)
      await driver.executeScript(`document.querySelector('#restore-locked').requestSubmit()`)
      await waitFor(async () => (await all('#restore-preview')).length > 0, { message: 'the preview' })
      assert.match(await text('#restore-checksum'), /checksum matches/)
      assert.match(await text('#restore-preview'), /Applications/)
      fs.unlinkSync(protectedFile)

      // Back to plain backups for the rest of the tests.
      await open('options', '#backup-protect')
      await css('#backup-protect').then((box) => box.click())
      await waitFor(async () => !(await css('#backup-protect').then((box) => box.isSelected())), {
        message: 'the switch to go off',
      })
    })

    test('the card is read first: the details as text, no form, and the button edits on purpose', async () => {
      await open('board', '.application-card')
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
        message: 'the drawer',
      })

      // Reading: what the card says, with a way to move it, and no field to type in.
      assert.equal(await text('dialog[open] button[name=toggleEdit]'), 'Edit')
      await waitFor(async () => (await all('dialog[open] dl.facts')).length > 0, { message: 'the details as text' })
      assert.equal((await all('dialog[open] input[name=title]')).length, 0, 'no field while reading')
      assert.equal((await all('dialog[open] textarea[name=newNote]')).length, 0, 'no form to add a note while reading')
      assert.equal((await all('dialog[open] select[name=status]')).length, 1, 'the card can still be moved')

      // Editing: the form, and the same button says Done.
      await startEditing(driver)
      assert.equal(await text('dialog[open] button[name=toggleEdit]'), 'Done')
      assert.equal((await all('dialog[open] input[name=title]')).length, 1)

      // Done with nothing changed goes back to reading without a question.
      await css('dialog[open] button[name=toggleEdit]').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] input[name=title]')).length === 0, {
        message: 'back to reading',
      })
      assert.equal((await all('#confirm-dialog')).length, 0)

      // With something typed, Done asks first, and keeping it leaves the form as it was.
      await startEditing(driver)
      await type('textarea[name=newNote]', 'Not added yet')
      await css('dialog[open] button[name=toggleEdit]').then((button) => button.click())
      await waitFor(async () => (await all('#confirm-dialog[open]')).length === 1, { message: 'the question' })
      await driver.executeScript(`document.querySelector('#confirm-dialog button:not([value=confirm])').click()`)
      await waitFor(async () => (await all('#confirm-dialog')).length === 0, { message: 'the question to close' })
      assert.equal(
        await css('textarea[name=newNote]').then((field) => field.getAttribute('value') ?? field.getText()),
        'Not added yet'
      )

      // Discarding goes back to reading and drops the text.
      await css('dialog[open] button[name=toggleEdit]').then((button) => button.click())
      await waitFor(async () => (await all('#confirm-dialog[open]')).length === 1, { message: 'the question again' })
      await driver.executeScript(`document.querySelector('#confirm-dialog button[value=confirm]').click()`)
      await waitFor(async () => (await all('dialog[open] textarea[name=newNote]')).length === 0, {
        message: 'back to reading',
      })
      await startEditing(driver)
      assert.equal(await css('textarea[name=newNote]').then((field) => field.getAttribute('value') ?? ''), '')
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('unsaved text asks before the drawer is closed, and the offer form says it has changes', async () => {
      await open('board', '.application-card')
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })

      // Nothing has changed: the bar of the drawer has nothing to save, only Done.
      assert.equal((await all('dialog[open] button[name=save]')).length, 0)
      assert.equal((await all('#offer-unsaved')).length, 0)

      // A change shows, and puts Save and Cancel in the place of Done.
      const before =
        (await css('.drawer-content input[name=location]').then((input) => input.getAttribute('value'))) ?? ''
      await type('.drawer-content input[name=location]', 'Somewhere else')
      await waitFor(async () => (await all('#offer-unsaved')).length > 0, { message: 'the unsaved mark' })
      assert.equal((await all('dialog[open] button[name=save]')).length, 1)
      assert.equal((await all('dialog[open] button[name=cancel]')).length, 1)
      assert.equal((await all('dialog[open] button[name=toggleEdit]')).length, 0)

      // Putting it back is not a change any more: the mark goes, and Save with it.
      await driver.executeScript(
        `const field = document.querySelector('.drawer-content input[name=location]'); field.value = arguments[0]; field.dispatchEvent(new Event('input', { bubbles: true }))`,
        before
      )
      await waitFor(async () => (await all('#offer-unsaved')).length === 0, { message: 'the mark to go when put back' })
      assert.equal((await all('dialog[open] button[name=save]')).length, 0)
      await type('.drawer-content input[name=location]', 'Somewhere else')
      await waitFor(async () => (await all('#offer-unsaved')).length > 0, { message: 'the mark again' })

      // Closing asks first, in a dialog of the extension. Declining cancels the closing: the drawer stays, with what was typed.
      const cancelled = await driver.executeScript(`
        const event = new Event('cancel', { cancelable: true });
        document.querySelector('dialog[open]:not(#confirm-dialog)').dispatchEvent(event);
        return event.defaultPrevented;
      `)
      assert.equal(cancelled, true)
      await waitFor(async () => (await all('#choice-dialog[open]')).length === 1, { message: 'the question' })
      // Three answers, and the one that loses nothing has the focus.
      assert.deepEqual(
        await driver.executeScript(
          `return [...document.querySelectorAll('#choice-dialog button')].map((button) => button.value)`
        ),
        ['keep', 'discard', 'save']
      )
      assert.equal(await driver.executeScript(`return document.activeElement && document.activeElement.value`), 'keep')
      await driver.executeScript(`document.querySelector('#choice-dialog button[value=keep]').click()`)
      await waitFor(async () => (await all('#choice-dialog')).length === 0, { message: 'the question to go' })
      assert.equal((await all('dialog[open]')).length, 1)
      assert.equal(
        await css('.drawer-content input[name=location]').then((input) => input.getAttribute('value')),
        'Somewhere else'
      )

      // Saving makes the card clean again, and shows it as it is read.
      await saveCard(driver)
      await waitFor(async () => (await all('#offer-unsaved')).length === 0, { message: 'the mark to go' })
      assert.match(await text('dialog[open] dl.facts'), /Somewhere else/)

      // Cancel drops the draft: the card is as it was.
      await startEditing(driver)
      await type('.drawer-content input[name=location]', 'Never kept')
      await waitFor(async () => (await all('dialog[open] button[name=cancel]')).length === 1, { message: 'Cancel' })
      await css('dialog[open] button[name=cancel]').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] input[name=location]')).length === 0, {
        message: 'back to reading',
      })
      assert.doesNotMatch(await text('dialog[open] dl.facts'), /Never kept/)
      await startEditing(driver)
      assert.equal(
        await css('.drawer-content input[name=location]').then((input) => input.getAttribute('value')),
        'Somewhere else'
      )

      // Typing again and closing: accepting lets it close.
      await type('.drawer-content input[name=location]', 'Elsewhere again')
      await waitFor(async () => (await all('#offer-unsaved')).length > 0, { message: 'the unsaved mark again' })
      await driver.executeScript(
        `document.querySelector('dialog[open]:not(#confirm-dialog):not(#choice-dialog)').dispatchEvent(new Event('cancel', { cancelable: true }))`
      )
      await waitFor(async () => (await all('#choice-dialog[open]')).length === 1, { message: 'the question again' })
      await driver.executeScript(`document.querySelector('#choice-dialog button[value=discard]').click()`)
      await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
    })

    test('leaving a card that changed: save and close, close without saving, or keep editing', async () => {
      const askToLeave = async () => {
        await driver.executeScript(
          `document.querySelector('dialog[open]:not(#confirm-dialog):not(#choice-dialog)').dispatchEvent(new Event('cancel', { cancelable: true }))`
        )
        await waitFor(async () => (await all('#choice-dialog[open]')).length === 1, { message: 'the question' })
      }
      const answer = (value) =>
        driver.executeScript(`document.querySelector('#choice-dialog button[value=${value}]').click()`)
      const reopen = async () => {
        await css('.application-card').then((card) => card.click())
        await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
          message: 'the drawer',
        })
      }

      await open('board', '.application-card')
      await reopen()
      await startEditing(driver)

      // Close without saving: the drawer closes and the card is as it was.
      await type('.drawer-content input[name=location]', 'Dropped')
      await askToLeave()
      await answer('discard')
      await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
      await reopen()
      assert.doesNotMatch(await text('dialog[open] dl.facts'), /Dropped/)

      // Save and close: the drawer closes and the card has the change.
      await startEditing(driver)
      await type('.drawer-content input[name=location]', 'Kept on leaving')
      await askToLeave()
      await answer('save')
      await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
      await reopen()
      assert.match(await text('dialog[open] dl.facts'), /Kept on leaving/)

      // A card that cannot be saved stays open, and says why.
      await startEditing(driver)
      await type('.drawer-content input[name=salaryMin]', '5000')
      await type('.drawer-content input[name=salaryMax]', '1000')
      await choose('select[name=salaryCurrency]', 'EUR')
      await askToLeave()
      await answer('save')
      await waitFor(async () => (await all('#choice-dialog')).length === 0, { message: 'the question to go' })
      await waitFor(async () => (await all('.drawer-content form .error')).length > 0, { message: 'the reason' })
      assert.equal((await all('dialog[open]')).length, 1)

      // Escape answers nothing: the card stays open, still being edited.
      await askToLeave()
      await driver.actions().sendKeys('\uE00C').perform()
      await waitFor(async () => (await all('#choice-dialog')).length === 0, { message: 'the question to go' })
      assert.equal((await all('dialog[open]')).length, 1)
      assert.equal((await all('dialog[open] input[name=salaryMin]')).length, 1)

      // Cancel drops it all.
      await css('dialog[open] button[name=cancel]').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] input[name=salaryMin]')).length === 0, {
        message: 'back to reading',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('a company that exists is offered, and a new one is said to be added on saving', async () => {
      await open('popup', 'form')
      const clear = (selector) =>
        driver.executeScript(
          `const field = document.querySelector(arguments[0]); field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true }))`,
          selector
        )
      // The case and the accents do not matter: "acme" is the company Acme.
      await type('input[name=company]', 'acme')
      await waitFor(async () => (await all('.picker-hint[data-state=existing]')).length === 1, {
        message: 'the company to be told as existing',
      })
      assert.match(await text('.picker-hint'), /Acme/)
      // The companies that exist are the ones the field offers.
      assert.ok(
        (
          await driver.executeScript(`return [...document.querySelectorAll('datalist option')].map((o) => o.value)`)
        ).includes('Acme')
      )
      // A name that is not in the list is a new company, and the field says so before the offer is saved.
      await type('input[name=company]', 'Never Heard Of Inc')
      await waitFor(async () => (await all('.picker-hint[data-state=new]')).length === 1, {
        message: 'the company to be told as new',
      })
      // The field is described by the hint, for a screen reader.
      const described = await driver.executeScript(
        `const field = document.querySelector('input[name=company]'); return document.getElementById(field.getAttribute('aria-describedby'))?.textContent.trim()`
      )
      assert.match(described, /Not in your list/)
      // Nothing is left behind for the popup that follows.
      await clear('input[name=company]')
      await waitFor(async () => (await all('.picker-hint')).length === 0, { message: 'the hint to go' })
    })

    test('the popup gives back what was typed and not saved, and forgets it once the offer is saved', async () => {
      await open('popup', 'form')
      await type('input[name=title]', 'A draft title')
      await type('input[name=company]', 'Draft Inc')
      // Wait for the draft to be written: the popup may be closed at any moment.
      await waitFor(
        async () =>
          driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:draft', (items) => done(Boolean(items['jat:draft'] && items['jat:draft'].title === 'A draft title')));
          `),
        { message: 'the draft to be written' }
      )

      // Opened again, it is back.
      await open('popup', 'form')
      await waitFor(
        async () => (await css('input[name=title]').then((input) => input.getAttribute('value'))) === 'A draft title',
        {
          message: 'the draft to come back',
        }
      )
      assert.equal(await css('input[name=company]').then((input) => input.getAttribute('value')), 'Draft Inc')

      // Saved: the draft is gone.
      await css('form button[type=submit]').then((button) => button.click())
      await waitFor(async () => (await all('.success')).length > 0, { message: 'the offer to be saved' })
      const kept = await driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get('jat:draft', (items) => done(items['jat:draft'] ?? null));
      `)
      assert.equal(kept, null)
    })

    test('once applied, a follow-up is suggested after the delay of the options, and added only when accepted', async () => {
      await open('popup', 'form')
      await type('input[name=title]', 'Follow me')
      await type('input[name=company]', 'Followers')
      await choose('select[name=status]', 'applied')
      await css('form button[type=submit]').then((button) => button.click())
      await waitFor(async () => (await all('.success')).length > 0, { message: 'the offer to be saved' })

      await open('board', '.application-card')
      const cards = await all('.application-card')
      const titles = await Promise.all(cards.map((card) => card.getText()))
      await cards[titles.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('#follow-up-suggestion')).length > 0, { message: 'the suggestion' })
      assert.match(await text('#follow-up-suggestion'), /7 days later/)

      // Nothing is added until it is accepted.
      assert.doesNotMatch(await text('.drawer-content'), /Follow up -/)
      await css('#follow-up-suggestion button').then((button) => button.click())
      await waitFor(async () => (await all('#follow-up-suggestion')).length === 0, { message: 'the suggestion to go' })
      assert.match(await text('.drawer-content'), /Follow up -/)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // The delay is a setting.
      await open('options', 'input[name=followUpDays]')
      assert.equal(await css('input[name=followUpDays]').then((input) => input.getAttribute('value')), '7')
    })

    test('the address of a notification opens the application, and closing it takes the address off', async () => {
      await open('board', '.application-card')
      const id = await driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get('jat:applications', (items) => done((items['jat:applications'] || [])[0]?.id ?? null));
      `)
      assert.ok(id, 'there is an application')

      // The tab of the board is told the address of the application, as a click on a notification does.
      await driver.executeScript(`location.hash = 'application=${id}'`)
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer to open' })

      await driver.executeScript(`document.querySelector('dialog[open]').close()`)
      await waitFor(async () => (await driver.executeScript('return location.hash')) === '', {
        message: 'the address to go',
      })

      // An id that is not there opens nothing.
      await driver.executeScript(`location.hash = 'application=nothing-here'`)
      await driver.sleep(300)
      assert.equal((await all('.drawer-content')).length, 0)
      await driver.executeScript(`history.replaceState(null, '', location.pathname)`)
    })

    test('the notifications are off to begin with, and the options for the alert show only when they are on', async () => {
      await open('options', '#notify-reminders')
      assert.equal(await css('#notify-reminders').then((box) => box.isSelected()), false)
      assert.equal((await all('#notify-persistent')).length, 0)
      assert.match(await text('main'), /icon of the extension shows how many reminders are due/)
    })

    test('the icon of the extension shows how many reminders are due, and goes down when one is done', async () => {
      await open('board', '.application-card')
      const badge = async () =>
        Number(
          (await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            (chrome.action || chrome.browserAction).getBadgeText({}, (text) => done(text));
          `)) || 0
        )
      const before = await badge()

      // A reminder that was due long ago.
      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })
      await type('input[name=reminderTitle]', 'Overdue for the badge')
      await driver.executeScript(`
        const input = document.querySelector('input[name=reminderDue]');
        input.value = '2020-01-01T09:00';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.closest('form').querySelector('button[type=submit]').click();
      `)
      await waitFor(async () => (await badge()) === before + 1, { message: 'the number on the icon to go up' })

      // Done: it is not due any more.
      await driver.executeScript(`
        [...document.querySelectorAll('.drawer-content li')]
          .find((li) => li.textContent.includes('Overdue for the badge'))
          .querySelector('input[type=checkbox]').click();
      `)
      await waitFor(async () => (await badge()) === before, { message: 'the number on the icon to go down' })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('the board is exported as a CSV file for a spreadsheet, with what is shown', async () => {
      await open('board', '.application-card')
      const shown = (await all('.application-card')).length

      // The file is kept in the page instead of going to the disk, to be read.
      await driver.executeScript(`
        window.__csv = null;
        URL.createObjectURL = (blob) => { window.__csv = blob; return 'blob:test' };
        HTMLAnchorElement.prototype.click = function () { window.__download = this.download };
      `)
      await css('#export-csv').then((link) => link.click())
      const file = await waitFor(
        async () =>
          driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            if (!window.__csv) return done(null);
            window.__csv.arrayBuffer().then((buffer) => done({ bytes: Array.from(new Uint8Array(buffer).slice(0, 3)), text: new TextDecoder().decode(buffer) }));
          `),
        { message: 'the file' }
      )
      // The mark that makes a spreadsheet read it as UTF-8 (a decoder drops it, hence the bytes).
      assert.deepEqual(file.bytes, [0xef, 0xbb, 0xbf])
      const csv = file.text
      const lines = csv.trim().split('\r\n')
      assert.equal(lines.length, shown + 1, 'a line for each application shown, and the head')
      assert.match(lines[0], /Status,Job title,Company,Final client,Place/)
      assert.match(csv, /Backend developer/)
      assert.match(
        await driver.executeScript('return window.__download'),
        /^job-application-tracker-board-\d{4}-\d{2}-\d{2}\.csv$/
      )
    })

    test('a recruitment firm is tied to its final client: shown on the card, found by the search, refused when it makes no sense', async () => {
      await open('board', '.application-card')
      const cards = await all('.application-card')
      const cardTexts = await Promise.all(cards.map((card) => card.getText()))
      await cards[cardTexts.findIndex((line) => /Backend developer/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('select[name=relationView]')).length > 0, { message: 'the company section' })

      // The firm recruits for Big Client.
      await choose('select[name=relationView]', 'recruits_for')
      await type('input[name=relationCompany]', 'Big Client')
      await driver.executeScript(
        `document.querySelector('input[name=relationCompany]').closest('form').querySelector('button[type=submit]').click()`
      )
      await waitFor(async () => /Big Client/.test(await text('#company-links')), { message: 'the link' })
      assert.match(await text('#company-links'), /Recruits for\s+Big Client/)

      // A company cannot be tied to itself, nor twice.
      await type('input[name=relationCompany]', 'acme')
      await driver.executeScript(
        `document.querySelector('input[name=relationCompany]').closest('form').querySelector('button[type=submit]').click()`
      )
      await waitFor(async () => /itself/.test(await text('.drawer-content .error')), { message: 'the refusal' })
      await type('input[name=relationCompany]', 'Big Client')
      await driver.executeScript(
        `document.querySelector('input[name=relationCompany]').closest('form').querySelector('button[type=submit]').click()`
      )
      await waitFor(async () => /already/.test(await text('.drawer-content .error')), { message: 'the second refusal' })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // The card tells who the offer is for, and the search finds it by the client.
      await waitFor(async () => (await texts('.application-card')).some((line) => /Acme → Big Client/.test(line)), {
        message: 'the client on the card',
      })
      await type('input[type=search]', 'big client')
      await waitFor(async () => (await all('.application-card')).length === 1, { message: 'the search' })
      assert.match(await text('.application-card'), /Backend developer/)
      await driver.executeScript(`
        const input = document.querySelector('input[type=search]');
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `)
      await waitFor(async () => (await all('.application-card')).length > 1, { message: 'the search to clear' })
    })

    test('a person works for several companies and helps with several applications, from either side', async () => {
      await open('board', '.application-card')
      const openCard = async (title) => {
        const cards = await all('.application-card')
        const lines = await Promise.all(cards.map((card) => card.getText()))
        await cards[lines.findIndex((line) => line.includes(title))].click()
        await startEditing(driver)
        await waitFor(async () => (await all('.drawer-content')).length > 0, { message: `the drawer of ${title}` })
      }
      const submit = (selector) =>
        driver.executeScript(
          `document.querySelector('${selector}').closest('form').querySelector('button[type=submit]').click()`
        )

      await openCard('Backend developer')
      await waitFor(async () => (await all('.drawer-content .contact-companies')).length > 0, {
        message: 'the companies of Ada',
      })
      assert.match(await text('.drawer-content .contact-companies'), /Acme/)

      // A second company, with a title and the first day.
      await type('input[name=linkCompany]', 'Talent Bureau')
      await type('input[name=linkTitle]', 'Partner')
      await driver.executeScript(`
        const input = document.querySelector('input[name=linkStartedOn]');
        input.value = '2024-03-01';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      `)
      await submit('input[name=linkCompany]')
      await waitFor(async () => /Talent Bureau/.test(await text('.drawer-content .contact-companies')), {
        message: 'the second company',
      })
      const companies = await text('.drawer-content .contact-companies')
      assert.match(companies, /Partner/)
      assert.match(companies, /Acme/)
      // The one that started last comes first.
      assert.ok(companies.indexOf('Talent Bureau') < companies.indexOf('Acme'))

      // A last day before the first is refused.
      await type('input[name=linkCompany]', 'Backwards Inc')
      await driver.executeScript(`
        for (const [name, value] of [['linkStartedOn', '2024-05-01'], ['linkEndedOn', '2024-04-01']]) {
          const input = document.querySelector('input[name=' + name + ']');
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      `)
      await submit('input[name=linkCompany]')
      await waitFor(async () => /cannot come before/.test(await text('.drawer-content .contact .error')), {
        message: 'the refusal',
      })

      // The same person helps with another application: linked from the person.
      const optionValue = await driver.executeScript(`
        const option = [...document.querySelectorAll('select[name=linkApplication] option')].find((o) => o.textContent.includes('Follow me'));
        return option ? option.value : null;
      `)
      assert.ok(optionValue, 'the other application can be chosen')
      await choose('select[name=linkApplication]', optionValue)
      await driver.executeScript(`
        [...document.querySelectorAll('.drawer-content .contact-links button')].find((b) => b.textContent.trim() === 'Link').click()
      `)
      await waitFor(async () => /Follow me/.test(await text('.drawer-content .contact-applications')), {
        message: 'the other application',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // ... and from the other application, the person is there.
      await openCard('Follow me')
      await waitFor(async () => (await texts('.drawer-content .contact')).some((line) => line.includes('Ada')), {
        message: 'Ada on the other application',
      })
      assert.match(await text('.drawer-content .contact-applications'), /Backend developer/)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('a pay profile estimates the net pay of an offer, and says it is an estimate', async () => {
      const submit = () => driver.executeScript(`document.querySelector('#pay-profile-form').requestSubmit()`)

      await open('options', '#new-pay-profile')
      await css('#new-pay-profile').then((button) => button.click())
      await waitFor(async () => (await all('#pay-profile-form')).length > 0, { message: 'the form of the profile' })

      // A rate out of range is refused, and nothing is saved.
      await type('input[name=payName]', 'Test US')
      await type('input[name=payCurrency]', 'USD')
      await type('input[name=lineLabel0]', 'Tax')
      await type('input[name=lineRate0]', '500')
      await submit()
      await waitFor(async () => /0 to 100/.test(await text('#pay-profile-form .error')), { message: 'the refusal' })
      assert.equal((await all('#pay-profiles')).length, 0)

      // A good one: 20% of the gross.
      await type('input[name=lineRate0]', '20')
      await submit()
      await waitFor(async () => (await all('#pay-profiles')).length > 0, { message: 'the profile in the list' })
      assert.match(await text('#pay-profiles'), /Test US/)

      // It is the one used to compare the offers.
      await driver.executeScript(`
        [...document.querySelectorAll('#pay-profiles li')].find((li) => li.textContent.includes('Test US')).querySelector('input[type=radio]').click()
      `)

      // An example can be added, and is named as an illustration.
      await choose('select[name=payExample]', 'flat')
      await driver.executeScript(
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add this example').click()`
      )
      await waitFor(async () => /Flat rate \(example\)/.test(await text('#pay-profiles')), { message: 'the example' })

      // The offer of the board (4 000 - 5 000 USD a month, gross): 48 000 - 60 000 a year, 20% less.
      await open('board', '.application-card')
      const cards = await all('.application-card')
      const lines = await Promise.all(cards.map((card) => card.getText()))
      await cards[lines.findIndex((line) => /Backend developer/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('#net-estimate')).length > 0, { message: 'the estimate' })
      const estimate = await text('#net-estimate')
      assert.match(estimate, /About \$3,200 - \$4,000 net per month/)
      assert.match(estimate, /Test US/)
      assert.match(estimate, /estimate, not a promise/)

      // The calculation can be shown, line by line.
      await driver.executeScript(`document.querySelector('#net-estimate .link-button').click()`)
      await waitFor(async () => (await all('#net-estimate table')).length > 0, { message: 'the calculation' })
      assert.match(await text('#net-estimate table'), /Tax/)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // Without a profile there is no estimate.
      await open('options', '#pay-profiles')
      await driver.executeScript(`
        [...document.querySelectorAll('#pay-profiles li')].find((li) => li.textContent.includes('No estimate')).querySelector('input[type=radio]').click()
      `)
      await open('board', '.application-card')
      const again = await all('.application-card')
      const texts2 = await Promise.all(again.map((card) => card.getText()))
      await again[texts2.findIndex((line) => /Backend developer/.test(line))].click()
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })
      assert.equal((await all('#net-estimate')).length, 0)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('the freelance helper finds the day rate for an income, and the income of a day rate', async () => {
      await open('options', 'input[name=freelanceIncome]')
      // 36 000 net with 22% of charges on the turnover, 200 days: 36 000 / 0.78 = 46 153.85 a year, 230.77 a day.
      await waitFor(async () => (await all('#freelance-result')).length > 0, { message: 'the result' })
      assert.match(await text('#freelance-result'), /230\.77/)
      assert.match(await text('#freelance-result'), /estimate/i)

      // With the profile of 20% in dollars: 36 000 / 0.8 = 45 000 a year, 225 a day.
      const option = await driver.executeScript(`
        const found = [...document.querySelectorAll('select[name=freelanceProfile] option')].find((o) => o.textContent.includes('Test US'));
        return found ? found.value : null;
      `)
      assert.ok(option, 'the profile is there')
      await choose('select[name=freelanceProfile]', option)
      await waitFor(async () => /Day rate: \$225\b/.test(await text('#freelance-result')), {
        message: 'the rate with the profile',
      })

      // Charges that take everything: no turnover can leave the income.
      await choose('select[name=freelanceProfile]', '')
      await type('input[name=freelanceFlat]', '100')
      await waitFor(async () => (await all('#freelance-impossible')).length > 0, { message: 'the message' })

      // The other way: a day rate of 500 for 200 days with 22% of charges leaves 78 000.
      await type('input[name=freelanceFlat]', '22')
      await choose('select[name=freelanceMode]', 'rate')
      await waitFor(async () => (await all('input[name=freelanceRate]')).length > 0, { message: 'the day rate field' })
      await type('input[name=freelanceRate]', '500')
      await waitFor(async () => /78,000/.test(await text('#freelance-result')), { message: 'the income' })
    })

    test('the address of an offer, in fields, opens in the map service chosen, and what is found there is kept in the offer', async () => {
      // The address the routes start from, in fields, in the options.
      await open('options', 'input[name=homeLine1]')
      await type('input[name=homeLine1]', '10 rue de Rivoli')
      await type('input[name=homePostalCode]', '75001')
      await type('input[name=homeCity]', 'Paris')
      await choose('select[name=homeCountry]', 'FR')
      await choose('select[name=mapProvider]', 'google')
      await choose('select[name=travelMode]', 'transit')

      await open('board', '.application-card')
      const cards = await all('.application-card')
      const lines = await Promise.all(cards.map((card) => card.getText()))
      await cards[lines.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('input[name=addressLine1]')).length > 0, { message: 'the place section' })

      // No address, no link.
      assert.equal((await all('#map-place')).length, 0)
      await type('input[name=addressLine1]', "5 avenue de l'Opéra")
      await type('input[name=addressLine2]', 'Building B')
      await type('input[name=addressPostalCode]', '69001')
      await type('input[name=addressCity]', 'Lyon')
      await choose('select[name=addressCountry]', 'FR')
      await waitFor(async () => (await all('#map-place')).length > 0, { message: 'the link to the place' })
      assert.match(await text('#address-line'), /5 avenue de l'Opéra, Building B, 69001 Lyon, France/)

      // The links carry the address, in the service and the way of travelling chosen. They open a new tab, with no referrer.
      const place = await css('#map-place')
      assert.match(await place.getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
      assert.match(await place.getAttribute('rel'), /noopener/)
      assert.equal(await place.getAttribute('target'), '_blank')
      const route = await css('#map-route').then((link) => link.getAttribute('href'))
      assert.match(route, /origin=10%20rue%20de%20Rivoli%2C%2075001%20Paris%2C%20France/)
      assert.match(
        route,
        /destination=5%20avenue%20de%20l(?:'|%27)Op%C3%A9ra%2C%20Building%20B%2C%2069001%20Lyon%2C%20France/
      )
      assert.match(route, /travelmode=transit/)

      // A position pasted from a map: understood, or refused.
      await type('input[name=addressCoordinates]', 'north, east')
      await waitFor(async () => /Two numbers/.test(await text('#place .error')), {
        message: 'the refusal of the position',
      })
      await type('input[name=addressCoordinates]', '45,7640; 4,8357')
      await waitFor(async () => (await all('#place .address-fields .error')).length === 0, {
        message: 'the position understood',
      })

      // The address is kept in the offer, in fields.
      await saveCard(driver)
      const kept = await waitFor(
        async () => {
          const found = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:jobOffers', (items) => done((items['jat:jobOffers'] || []).find((o) => o.addressLine1)));
          `)
          return found && found.latitude === 45.764 && found
        },
        { message: 'the address to be kept' }
      )
      assert.equal(kept.city, 'Lyon')
      assert.equal(kept.postalCode, '69001')
      assert.equal(kept.country, 'FR')
      assert.equal(kept.longitude, 4.8357)
      assert.equal(kept.addressLine2, 'Building B')
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // OpenStreetMap makes a route only with a position at both ends: give the one of home.
      await open('options', 'select[name=mapProvider]')
      await choose('select[name=mapProvider]', 'osm')
      await type('input[name=homeCoordinates]', '48.8566, 2.3522')
      await open('board', '.application-card')
      const again = await all('.application-card')
      const names = await Promise.all(again.map((card) => card.getText()))
      await again[names.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      // The settings say public transport, for which OpenStreetMap has no route: for this offer, by car, it has one.
      await choose('select[name=routeMode]', 'car')
      await waitFor(async () => (await all('#map-route')).length > 0, { message: 'the route on OpenStreetMap' })
      const osm = await css('#map-route').then((link) => link.getAttribute('href'))
      assert.match(
        osm,
        /openstreetmap\.org\/directions\?engine=fossgis_osrm_car&route=48\.8566%2C2\.3522%3B45\.764%2C4\.8357/
      )
      assert.match(
        await css('#map-place').then((link) => link.getAttribute('href')),
        /openstreetmap\.org\/\?mlat=45\.764&mlon=4\.8357/
      )

      // Public transport has no route on OpenStreetMap, and the page says why.
      await choose('select[name=routeMode]', 'transit')
      await waitFor(async () => (await all('#map-route')).length === 0, { message: 'the route to go' })
      assert.match(await text('#place'), /no route for public transport/)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // Back to the service the other tests expect.
      await open('options', 'select[name=mapProvider]')
      await choose('select[name=mapProvider]', 'google')
    })

    test('journeys to work are kept in legs with a total, as a way there and a way back, one of them preferred', async () => {
      await open('board', '.application-card')
      const cards = await all('.application-card')
      const lines = await Promise.all(cards.map((card) => card.getText()))
      await cards[lines.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('#new-journey')).length > 0, { message: 'the journeys section' })

      // Tours to Bussy-Saint-Georges: on foot, bus, train, metro, suburban train, on foot.
      const legs = [
        ['walk', '', '10'],
        ['bus', '12', '25'],
        ['train', 'TER', '62'],
        ['metro', '14', '20'],
        ['suburban', 'RER A', '18'],
        ['walk', '', '8'],
      ]
      await css('#new-journey').then((button) => button.click())
      await waitFor(async () => (await all('#journey-form')).length > 0, { message: 'the journey form' })
      await type('input[name=journeyName]', 'By train')
      for (let index = 0; index < legs.length; index++) {
        if (index > 0) {
          await driver.executeScript(
            `[...document.querySelectorAll('#journey-form button')].find((b) => b.textContent.trim() === 'Add a leg').click()`
          )
          await waitFor(async () => (await all(`select[name=legMode${index}]`)).length > 0, { message: `leg ${index}` })
        }
        const [mode, line, minutes] = legs[index]
        await choose(`select[name=legMode${index}]`, mode)
        await type(`input[name=legLine${index}]`, line)
        await type(`input[name=legMinutes${index}]`, minutes)
      }
      // The total follows what is typed: 10 + 25 + 62 + 20 + 18 + 8 = 143 minutes.
      await waitFor(async () => /2 h23/.test(await text('#journey-typed-total')), { message: 'the total as typed' })

      // A leg with no time is refused, and nothing is kept.
      await driver.executeScript(
        `[...document.querySelectorAll('#journey-form button')].find((b) => b.textContent.trim() === 'Add a leg').click()`
      )
      await waitFor(async () => (await all('select[name=legMode6]')).length > 0, { message: 'the blank leg' })
      await driver.executeScript(`document.querySelector('#journey-form').requestSubmit()`)
      await waitFor(async () => /whole number of minutes/.test(await text('#journey-form .error')), {
        message: 'the refusal',
      })
      assert.equal((await all('.journey-list')).length, 0)
      await driver.executeScript(
        `[...document.querySelectorAll('#journey-form .journey-leg')].at(-1).querySelector('.leg-remove').click()`
      )

      await driver.executeScript(`document.querySelector('#journey-form').requestSubmit()`)
      await waitFor(async () => (await all('.journey-list .journey')).length > 0, {
        message: 'the journey in the list',
      })
      const journey = await text('.journey-list .journey')
      assert.match(journey, /Going - By train/)
      assert.match(journey, /2 h23/)
      assert.match(journey, /Preferred/)
      assert.match(journey, /Suburban train RER A 18 min/)

      // The card tells the time of the preferred journey.
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await waitFor(async () => (await texts('.application-card .commute-line')).some((line) => /2 h23/.test(line)), {
        message: 'the time on the card',
      })

      // The way back: the same legs in the other order, the preferred one of its direction.
      await open('board', '.application-card')
      const again = await all('.application-card')
      const names = await Promise.all(again.map((card) => card.getText()))
      await again[names.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('.journey-reverse')).length > 0, { message: 'the journeys' })
      await driver.executeScript(`document.querySelector('.journey-reverse').click()`)
      await waitFor(async () => (await all('.journey[data-direction=return]')).length > 0, { message: 'the way back' })
      const back = await text('.journey[data-direction=return]')
      assert.match(back, /Coming back - By train/)
      assert.match(back, /2 h23/)
      assert.ok(back.indexOf('Suburban train') < back.indexOf('Bus'), 'the legs are in the reverse order')
      assert.match(
        await css('.journey[data-direction=return] .journey-legs li').then((leg) => leg.getText()),
        /On foot 8 min/
      )

      // Another way there, shorter or longer: only one is preferred, and the card follows the choice.
      await css('#new-journey').then((button) => button.click())
      await waitFor(async () => (await all('#journey-form')).length > 0, { message: 'the second form' })
      await type('input[name=journeyName]', 'By car')
      await choose('select[name=legMode0]', 'car')
      await type('input[name=legMinutes0]', '95')
      await driver.executeScript(`document.querySelector('#journey-form').requestSubmit()`)
      await waitFor(async () => (await all('.journey[data-direction=outbound]')).length === 2, {
        message: 'two ways there',
      })
      assert.equal((await all('.journey-preferred')).length, 2, 'one preferred for each direction')
      await driver.executeScript(`
        [...document.querySelectorAll('.journey[data-direction=outbound]')].find((j) => j.textContent.includes('By car')).querySelector('.journey-prefer').click()
      `)
      await waitFor(async () => /By car[\s\S]*Preferred/.test(await text('.journey[data-direction=outbound]')), {
        message: 'the car is preferred',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await waitFor(async () => (await texts('.application-card .commute-line')).some((line) => /1 h35/.test(line)), {
        message: 'the card follows the preferred journey',
      })

      // Deleting the preferred one gives its place to the other.
      await open('board', '.application-card')
      const last = await all('.application-card')
      const labels = await Promise.all(last.map((card) => card.getText()))
      await last[labels.findIndex((line) => /Follow me/.test(line))].click()
      await startEditing(driver)
      await waitFor(async () => (await all('.journey[data-direction=outbound]')).length === 2, {
        message: 'the journeys again',
      })
      await driver.executeScript(`
        [...[...document.querySelectorAll('.journey[data-direction=outbound]')].find((j) => j.textContent.includes('By car')).querySelectorAll('.row button')].find((b) => b.textContent.trim() === 'Delete').click()
      `)
      await waitFor(async () => (await all('.journey[data-direction=outbound]')).length === 1, {
        message: 'the car journey deleted',
      })
      assert.match(await text('.journey[data-direction=outbound]'), /By train[\s\S]*Preferred/)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('a deleted application can be undone from the message that tells it was deleted', async () => {
      await open('board', '.application-card')
      const before = (await all('.application-card')).length

      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })
      const buttons = await all('.drawer-content button')
      const labels = await Promise.all(buttons.map((button) => button.getText()))
      await buttons[labels.indexOf('Delete')].click()
      await waitFor(async () => (await all('.application-card')).length === before - 1, { message: 'the card to go' })

      // No question is asked: the message says what was removed and offers to undo it.
      assert.equal((await all('#confirm-dialog')).length, 0)
      await waitFor(async () => (await all('#notices .notice-action')).length > 0, { message: 'the undo button' })
      assert.match(await text('#notices'), /Removed/)
      await css('#notices .notice-action').then((button) => button.click())
      await waitFor(async () => (await all('.application-card')).length === before, {
        message: 'the card to come back',
      })
      assert.equal((await all('#notices .notice-action')).length, 0)
    })

    test('a deleted application goes to the trash, and comes back from it', async () => {
      await open('board', '.application-card')
      const before = (await all('.application-card')).length

      await css('.application-card').then((card) => card.click())
      await startEditing(driver)
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })
      const buttons = await all('.drawer-content button')
      const labels = await Promise.all(buttons.map((button) => button.getText()))
      await buttons[labels.indexOf('Delete')].click()
      await waitFor(async () => (await all('.application-card')).length === before - 1, { message: 'the card to go' })

      // It is in the trash of the options, with the date it was deleted.
      await open('options', '#trash-list')
      await waitFor(async () => /Applications/.test(await text('#trash-list')), {
        message: 'the application in the trash',
      })
      // Other things may be in the trash (the column the options test removed): the row of the application is the one put back.
      const rows = await all('#trash-list li')
      const texts = await Promise.all(rows.map((row) => row.getText()))
      await rows[texts.findIndex((line) => /Applications/.test(line))]
        .findElement(By.css('button'))
        .then((button) => button.click())
      await waitFor(
        async () => !/Applications/.test((await all('#trash-list')).length > 0 ? await text('#trash-list') : ''),
        {
          message: 'the application to leave the trash',
        }
      )

      await open('board', '.application-card')
      assert.equal((await all('.application-card')).length, before)
    })

    test('an offer is added from the board: by the general button, and by the plus of a column', async () => {
      await open('board', '.application-card')
      const count = async () => (await all('.application-card')).length
      const start = await count()
      const dialog = '#new-offer-dialog'

      // The general button: a company that exists is picked, and the offer lands in the first column.
      await css('button[name=addOffer]').then((button) => button.click())
      await waitFor(async () => (await all(`${dialog}[open]`)).length === 1, { message: 'the dialog' })
      await type(`${dialog} input[name=title]`, 'Added by hand')
      await type(`${dialog} input[name=company]`, 'acme')
      await waitFor(async () => (await all(`${dialog} .picker-hint[data-state=existing]`)).length === 1, {
        message: 'the company to be told as existing',
      })
      await css(`${dialog} form button[type=submit]`).then((button) => button.click())
      await waitFor(async () => (await count()) === start + 1, { message: 'the new card' })
      assert.match(await text('.column:first-child'), /Added by hand/)

      // The message offers to open it, and the drawer opens on it.
      await waitFor(async () => (await all('.toast .notice-action')).length > 0, { message: 'the message' })
      await css('.toast .notice-action').then((button) => button.click())
      await waitFor(async () => /Added by hand/.test(await text('dialog[open]')), {
        message: 'the drawer of the new offer',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // The plus of a column starts the offer in that column, and a company that does not exist is made.
      await css('.column:nth-child(2) .column-add').then((button) => button.click())
      await waitFor(async () => (await all(`${dialog}[open]`)).length === 1, { message: 'the dialog again' })
      assert.equal(
        await driver.executeScript(
          `const select = document.querySelector('#new-offer-dialog select[name=status]'); return select.options[select.selectedIndex].text`
        ),
        'Applied'
      )
      await type(`${dialog} input[name=title]`, 'Added to Applied')
      await type(`${dialog} input[name=company]`, 'Brand New Company')
      await waitFor(async () => (await all(`${dialog} .picker-hint[data-state=new]`)).length === 1, {
        message: 'the company to be told as new',
      })
      await css(`${dialog} form button[type=submit]`).then((button) => button.click())
      await waitFor(async () => /Added to Applied/.test(await text('.column:nth-child(2)')), {
        message: 'the card in the column of the plus',
      })
      const companies = await driver.executeAsyncScript(`
        const done = arguments[arguments.length - 1];
        chrome.storage.local.get('jat:companies', (items) => done((items['jat:companies'] || []).map((c) => c.name)));
      `)
      assert.ok(companies.includes('Brand New Company'), 'the new company was made')
      assert.equal(
        companies.filter((name) => /^acme$/i.test(name)).length,
        1,
        'the company that exists was not made again'
      )

      // What was typed is not lost by a stray Escape: the question comes first.
      await css('button[name=addOffer]').then((button) => button.click())
      await waitFor(async () => (await all(`${dialog}[open]`)).length === 1, { message: 'the dialog a third time' })
      await type(`${dialog} input[name=title]`, 'Not finished')
      await driver.actions().sendKeys('\uE00C').perform()
      await waitFor(async () => (await all('#confirm-dialog[open]')).length === 1, { message: 'the question' })
      await driver.executeScript(`document.querySelector('#confirm-dialog button[value=cancel]').click()`)
      await waitFor(async () => (await all('#confirm-dialog')).length === 0, { message: 'the question to go' })
      assert.equal((await all(`${dialog}[open]`)).length, 1, 'the dialog is kept')
      await driver.executeScript(`document.querySelector('#new-offer-dialog')?.close()`)
    })

    test('the applications are read in a table that sorts, searches, opens a row and remembers how it was left', async () => {
      await open('board', '.application-card')
      const total = (await all('.application-card')).length
      await open('tables', 'footer')
      const rows = () => all('tbody tr.table-row')
      await waitFor(async () => (await rows()).length === total, { message: 'a row for each application' })
      const titles = () => texts('tbody tr.table-row td[data-column=title]')
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
      const sortOf = (column) =>
        driver.executeScript(
          `return document.querySelector('th:has(button[data-column=' + arguments[0] + '])').getAttribute('aria-sort')`,
          column
        )

      // It opens sorted by the title, from A to Z, and says so to a screen reader.
      assert.equal(await sortOf('title'), 'ascending')
      const ascending = await titles()
      assert.deepEqual(ascending, [...ascending].sort(collator.compare))

      // The header sorts: again for the other way, and another column for the order of that one.
      await css('th button[data-column=title]').then((button) => button.click())
      await waitFor(async () => 'descending' === (await sortOf('title')), { message: 'the title sorted the other way' })
      assert.deepEqual(await titles(), [...ascending].reverse())
      await css('th button[data-column=company]').then((button) => button.click())
      await waitFor(async () => 'ascending' === (await sortOf('company')), { message: 'the company sorted' })
      assert.equal(await sortOf('title'), 'none')

      // The search ignores the case and the accents, and the count says what is shown.
      await type('input[name=tableSearch]', 'ADDED BY')
      await waitFor(async () => (await rows()).length === 1, { message: 'the search to narrow the table' })
      assert.match(await text('.table-count'), new RegExp(`1 of ${total} shown`))
      await type('input[name=tableSearch]', 'nothing like this')
      await waitFor(async () => (await all('tbody tr.table-row')).length === 0, { message: 'no row' })
      assert.match(await text('tbody'), /Nothing to show/)
      await driver.executeScript(
        `const field = document.querySelector('input[name=tableSearch]'); field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true }))`
      )
      await waitFor(async () => (await rows()).length === total, { message: 'the table to be whole again' })

      // A column can be hidden, and the first one cannot.
      await driver.executeScript(`document.querySelector('details.table-columns').open = true`)
      assert.equal(await css('input[name=column-title]').then((box) => box.isEnabled()), false)
      await css('input[name=column-place]').then((box) => box.click())
      await waitFor(async () => (await all('th button[data-column=place]')).length === 0, {
        message: 'the column to go',
      })

      // A row opens the drawer of the application, by its first cell.
      await css('tbody tr.table-row .row-open').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
        message: 'the drawer',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

      // What was chosen is kept: the sort and the column, when the page is opened again.
      await waitFor(
        async () =>
          driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            chrome.storage.local.get('jat:tables', (items) => {
              const state = (items['jat:tables'] || {}).applications;
              done(Boolean(state && state.sort === 'company' && state.hidden.includes('place')));
            });
          `),
        { message: 'the choice to be kept' }
      )
      await open('tables', 'footer')
      await waitFor(async () => 'ascending' === (await sortOf('company')), { message: 'the sort to come back' })
      assert.equal((await all('th button[data-column=place]')).length, 0, 'the column is still hidden')
    })

    test('the options are in tabs: one panel at a time, the arrows move between the tabs, and the address keeps the place', async () => {
      await open('options', 'footer')
      const selected = () =>
        driver.executeScript(`return document.querySelector('[role=tab][aria-selected=true]')?.dataset.tab`)
      const visiblePanels = async () => (await all('[role=tabpanel]:not([hidden])')).length

      // The first tab is shown, and only one panel at a time.
      assert.equal(await selected(), 'appearance')
      assert.equal(await visiblePanels(), 1)
      assert.equal((await all('[role=tab]')).length, 5)
      // One tab is in the order of the keyboard: the one in use.
      assert.deepEqual(
        await driver.executeScript(`return [...document.querySelectorAll('[role=tab]')].map((tab) => tab.tabIndex)`),
        [0, -1, -1, -1, -1]
      )

      // A tab is chosen with a click: its panel shows, the address says it.
      await css('[role=tab][data-tab=money]').then((tab) => tab.click())
      await waitFor(async () => 'money' === (await selected()), { message: 'the money tab' })
      assert.equal(await visiblePanels(), 1)
      assert.equal(await driver.executeScript(`return location.hash`), '#tab=money')
      assert.ok(await css('select[name=homeCurrency]').then((field) => field.isDisplayed()), 'its section is there')

      // The arrows move between the tabs, round the ends, and Home and End go to the first and the last one.
      await css('[role=tab][data-tab=money]').then((tab) => tab.sendKeys('\uE014'))
      await waitFor(async () => 'places' === (await selected()), { message: 'the next tab' })
      assert.equal(
        await driver.executeScript(`return document.activeElement.dataset.tab`),
        'places',
        'the focus follows'
      )
      await driver.actions().sendKeys('\uE011').perform()
      await waitFor(async () => 'appearance' === (await selected()), { message: 'Home' })
      await driver.actions().sendKeys('\uE010').perform()
      await waitFor(async () => 'data' === (await selected()), { message: 'End' })
      await driver.actions().sendKeys('\uE014').perform()
      await waitFor(async () => 'appearance' === (await selected()), { message: 'round the end' })

      // The address keeps the place: a reload opens the tab that was left, and an unknown tab gives the first one.
      await css('[role=tab][data-tab=board]').then((tab) => tab.click())
      await waitFor(async () => 'board' === (await selected()), { message: 'the board tab' })
      await driver.navigate().refresh()
      await waitFor(async () => 'board' === (await selected()), { message: 'the tab to come back' })
      await driver.executeScript(`location.hash = 'tab=nothing'`)
      await waitFor(async () => 'appearance' === (await selected()), { message: 'the first tab for an unknown one' })
    })

    test('the companies are read in a table, edited once in their drawer, merged when they are the same, and deleted when empty', async () => {
      await open('tables', 'footer')
      await css('[role=tab][data-tab=companies]').then((tab) => tab.click())
      const rows = () => all('tbody tr.table-row')
      await waitFor(async () => (await rows()).length > 1, { message: 'the companies' })
      const names = () => texts('tbody tr.table-row td[data-column=name]')
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
      const sorted = await names()
      assert.deepEqual(sorted, [...sorted].sort(collator.compare), 'sorted by the name')
      assert.ok(sorted.includes('Acme') && sorted.includes('Brand New Company'))
      // The offers are counted in a column that sorts by the number.
      await css('th button[data-column=offers]').then((button) => button.click())
      const counts = (await texts('tbody tr.table-row td[data-column=offers]')).map(Number)
      assert.deepEqual(
        counts,
        [...counts].sort((a, b) => a - b),
        'sorted by the number of offers'
      )

      const openCompany = async (name) => {
        const rowButtons = await all('tbody tr.table-row .row-open')
        const labels = await Promise.all(rowButtons.map((button) => button.getText()))
        await rowButtons[labels.indexOf(name)].click()
        await waitFor(async () => (await all('dialog[open] .company-drawer')).length > 0, {
          message: `the drawer of ${name}`,
        })
      }
      const drawer = 'dialog[open] .company-drawer'

      // A name another company has is refused (the case and the accents do not count), with the way out said.
      await openCompany('Brand New Company')
      await type(`${drawer} input[name=name]`, 'acme')
      await css(`${drawer} button[name=save]`).then((button) => button.click())
      await waitFor(async () => /Another company has this name/.test(await text(`${drawer} .error`)), {
        message: 'the refusal of the duplicate',
      })

      // Renamed once: the offer that names it shows the new name.
      await type(`${drawer} input[name=name]`, 'Brand New Co')
      await type(`${drawer} input[name=city]`, 'Lyon')
      await css(`${drawer} button[name=save]`).then((button) => button.click())
      await waitFor(async () => (await all(`${drawer} .error`)).length === 0, { message: 'the refusal to go' })
      await waitFor(async () => /Brand New Co\b/.test(await text('dialog[open] .modal-title')), {
        message: 'the new title',
      })
      assert.match(await text(drawer), /Added to Applied/, 'its offer is listed')
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await waitFor(async () => (await names()).includes('Brand New Co'), { message: 'the new name in the table' })
      assert.ok(!(await names()).includes('Brand New Company'))

      // Two names for one company: merged. The offer moves, and the company goes.
      await openCompany('Brand New Co')
      await driver.executeScript(
        `const select = document.querySelector('dialog[open] select[name=mergeInto]'); select.value = [...select.options].find((o) => o.text === 'Acme').value; select.dispatchEvent(new Event('change', { bubbles: true }))`
      )
      await css(`${drawer} button[name=merge]`).then((button) => button.click())
      await waitFor(async () => (await all('#confirm-dialog[open]')).length === 1, { message: 'the question' })
      assert.match(await text('#confirm-dialog'), /Merge Brand New Co into Acme/)
      await driver.executeScript(`document.querySelector('#confirm-dialog button[value=confirm]').click()`)
      await waitFor(async () => !(await names()).includes('Brand New Co'), { message: 'the company to go' })
      const acmeRow = (await texts('tbody tr.table-row')).find((line) => /^Acme\b/.test(line)) ?? ''
      assert.match(acmeRow, /Added to Applied|\b[3-9]\b/, 'Acme has the offer now')

      // A company with no offer is deleted, and the message puts it back.
      const empty = (await rows()).length
      const emptyName = await driver.executeScript(`
        const row = [...document.querySelectorAll('tbody tr.table-row')].find((r) => r.querySelector('td[data-column=offers]').textContent.trim() === '0');
        return row ? row.querySelector('.row-open').textContent.trim() : null`)
      assert.ok(emptyName, 'a company with no offer exists')
      await openCompany(emptyName)
      await css(`${drawer} button[name=deleteCompany]`).then((button) => button.click())
      await waitFor(async () => (await rows()).length === empty - 1, { message: 'the company to be deleted' })
      await waitFor(async () => (await all('.toast .notice-action')).length > 0, { message: 'the message' })
      await css('.toast .notice-action').then((button) => button.click())
      await waitFor(async () => (await rows()).length === empty, { message: 'the company to come back' })
      assert.ok((await names()).includes(emptyName))
    })

    test('the contacts are read in a table, made on their own, edited once, and deleted with their undo', async () => {
      await open('tables', 'footer')
      await css('[role=tab][data-tab=contacts]').then((tab) => tab.click())
      const rows = () => all('tbody tr.table-row')
      await waitFor(async () => (await rows()).length > 0, { message: 'the contacts' })
      const start = (await rows()).length
      const names = () => texts('tbody tr.table-row td[data-column=name]')
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
      const sorted = await names()
      assert.deepEqual(sorted, [...sorted].sort(collator.compare), 'sorted by the name')
      const drawer = 'dialog[open] .contact-drawer'
      const title = () => text('dialog[open] .modal-title')

      // A contact is made on its own, with a company that does not exist yet, said to be new before it is made.
      await css('button[name=addContact]').then((button) => button.click())
      await waitFor(async () => (await all(drawer)).length > 0, { message: 'the form of a new contact' })
      assert.match(await title(), /New contact/)
      await css(`${drawer} button[name=save]`).then((button) => button.click())
      await waitFor(async () => /first name or a last name/.test(await text(`${drawer} .error`)), {
        message: 'the refusal of a contact with no name',
      })
      await type(`${drawer} input[name=firstName]`, 'Zed')
      await type(`${drawer} input[name=lastName]`, 'Zebra')
      await type(`${drawer} input[name=company]`, 'Brand New Org')
      await waitFor(async () => (await all(`${drawer} .picker-hint[data-state=new]`)).length === 1, {
        message: 'the company to be told as new',
      })
      await type(`${drawer} input[name=email]`, 'ZED@Example.com')
      await css(`${drawer} button[name=save]`).then((button) => button.click())

      // It opens as a contact that exists: its way to reach it and its company are listed, in canonical forms.
      await waitFor(async () => /Zed Zebra/.test(await title()), { message: 'the contact that was made' })
      await waitFor(async () => /zed@example\.com/.test(await text(drawer)), { message: 'its email' })
      assert.match(await text(drawer), /Brand New Org/)

      // Edited once: the role, and the table shows it.
      await type(`${drawer} input[name=role]`, 'CTO')
      await css(`${drawer} button[name=save]`).then((button) => button.click())
      await waitFor(async () => (await all(`${drawer} .picker-hint`)).length === 0, { message: 'settled' })
      await css(`${drawer} button[name=favorite]`).then((button) => button.click())
      await waitFor(
        async () =>
          'true' === (await css(`${drawer} button[name=favorite]`).then((b) => b.getAttribute('aria-pressed'))),
        {
          message: 'the favourite mark',
        }
      )
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
      await waitFor(async () => (await rows()).length === start + 1, { message: 'the new row' })
      const line = (await texts('tbody tr.table-row')).find((row) => /Zed Zebra/.test(row)) ?? ''
      assert.match(line, /CTO/)
      assert.match(line, /Brand New Org/)
      assert.match(line, /zed@example\.com/)

      // Deleted with the message that puts it back.
      const openContact = async () => {
        const buttons = await all('tbody tr.table-row .row-open')
        const labels = await Promise.all(buttons.map((button) => button.getText()))
        await buttons[labels.indexOf('Zed Zebra')].click()
        await waitFor(async () => (await all(drawer)).length > 0, { message: 'the drawer of the contact' })
      }
      await openContact()
      await css(`${drawer} button[name=deleteContact]`).then((button) => button.click())
      await waitFor(async () => (await rows()).length === start, { message: 'the contact to be deleted' })
      await waitFor(async () => (await all('.toast .notice-action')).length > 0, { message: 'the message' })
      await css('.toast .notice-action').then((button) => button.click())
      await waitFor(async () => (await rows()).length === start + 1, { message: 'the contact to come back' })
      // Left as it was found, for the tests that count what is there.
      await openContact()
      await css(`${drawer} button[name=deleteContact]`).then((button) => button.click())
      await waitFor(async () => (await rows()).length === start, { message: 'the contact to be deleted again' })
    })

    test('the addresses of the offers are read in a table, with the map link, and a row opens the application', async () => {
      await open('tables', 'footer')
      await css('[role=tab][data-tab=addresses]').then((tab) => tab.click())
      const rows = () => all('tbody tr.table-row')
      await waitFor(async () => (await rows()).length > 0, { message: 'the addresses' })
      const lines = () => texts('tbody tr.table-row td[data-column=address]')
      const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
      const sorted = await lines()
      assert.deepEqual(sorted, [...sorted].sort(collator.compare), 'sorted by the address')

      // The address that was given in fields earlier is there, in one line, and found by its postal code.
      await type('input[name=tableSearch]', '69001')
      await waitFor(async () => (await rows()).length >= 1, { message: 'the search by the postal code' })
      assert.match((await lines())[0], /Lyon/)
      assert.match(await text('tbody tr.table-row td[data-column=company]'), /\S/)

      // The link opens the place on the map chosen, in a new tab with no referrer.
      const link = await css('tbody tr.table-row td[data-column=map] a')
      assert.match(await link.getAttribute('href'), /^https:\/\//)
      assert.match(await link.getAttribute('rel'), /noopener/)
      assert.equal(await link.getAttribute('target'), '_blank')

      // The row opens the application, where the address is edited.
      await css('tbody tr.table-row .row-open').then((button) => button.click())
      await waitFor(async () => (await all('dialog[open] button[name=toggleEdit]')).length > 0, {
        message: 'the drawer',
      })
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })
  })
})
