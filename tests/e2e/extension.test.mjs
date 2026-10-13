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

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

    test('a contact is saved with its phone in the international format', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
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
      await waitFor(async () => /1 added/.test(await text('details.import [role=status]')), { message: 'the result' })

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
      await waitFor(async () => /1 already there/.test(await text('details.import [role=status]')), {
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
      await waitFor(async () => /1 added/.test(await text('details.import [role=status]')), {
        message: 'the result of the file',
      })
      fs.rmSync(file)

      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
    })

    test('a tag, a favourite and a priority show on the card, and a tag is renamed from the options', async () => {
      await driver.switchTo().window(boardTab)
      await css('.application-card').then((card) => card.click())
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
        throw new Error(`${error.message}; stored applications: ${JSON.stringify(stored)}`)
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

      await open('options', 'input[type=file]')
      await css('input[type=file]').then((input) => input.sendKeys(file))
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
      await open('options', 'input[type=file]')
      await css('input[type=file]').then((input) => input.sendKeys(file))
      await waitFor(async () => (await all('.error')).length > 0, { message: 'the error' })
      assert.match(await text('.error'), /not an export/)
      assert.equal((await all('#restore-preview')).length, 0)
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
        await open('options', 'input[type=file]')
        await css('input[type=file]').then((input) => input.sendKeys(file))
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
      assert.ok(file.kdf.iterations >= 600000)
      assert.ok(!written.includes('Backend developer'))
      assert.ok(!written.includes('Acme'))

      // Restoring: the passphrase is asked, a wrong one changes nothing, the right one shows the preview.
      const protectedFile = path.join(os.tmpdir(), `jat-protected-${Date.now()}.json`)
      fs.writeFileSync(protectedFile, written)
      await open('options', 'input[type=file]')
      await css('input[type=file]').then((input) => input.sendKeys(protectedFile))
      await waitFor(async () => (await all('#restore-locked')).length > 0, { message: 'the passphrase prompt' })

      await type('#restore-passphrase', 'a wrong passphrase')
      await driver.executeScript(`document.querySelector('#restore-locked').requestSubmit()`)
      await waitFor(async () => (await all('.error')).length > 0, { message: 'the error' })
      assert.match(await text('.error'), /wrong/)
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

    test('unsaved text asks before the drawer is closed, and the offer form says it has changes', async () => {
      await open('board', '.application-card')
      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })

      // The form of the offer is not dirty, and its button has nothing to save.
      const save = await css('.drawer-content form button[type=submit]')
      assert.equal(await save.isEnabled(), false)
      assert.equal((await all('#offer-unsaved')).length, 0)

      await type('.drawer-content input[name=location]', 'Somewhere else')
      await waitFor(async () => (await all('#offer-unsaved')).length > 0, { message: 'the unsaved mark' })
      assert.equal(await save.isEnabled(), true)

      // Closing asks first. Declining cancels the closing: the drawer stays, with what was typed.
      const cancelled = await driver.executeScript(`
        window.__asked = 0;
        window.confirm = () => { window.__asked++; return false };
        const event = new Event('cancel', { cancelable: true });
        document.querySelector('dialog[open]').dispatchEvent(event);
        return [window.__asked, event.defaultPrevented];
      `)
      assert.deepEqual(cancelled, [1, true])
      assert.equal((await all('dialog[open]')).length, 1)
      assert.equal(
        await css('.drawer-content input[name=location]').then((input) => input.getAttribute('value')),
        'Somewhere else'
      )

      // Accepting lets it close.
      const accepted = await driver.executeScript(`
        window.confirm = () => true;
        const event = new Event('cancel', { cancelable: true });
        document.querySelector('dialog[open]').dispatchEvent(event);
        return event.defaultPrevented;
      `)
      assert.equal(accepted, false)

      // Saving makes the form clean again.
      await save.click()
      await waitFor(async () => (await all('#offer-unsaved')).length === 0, { message: 'the mark to go' })
      assert.equal(await save.isEnabled(), false)
      await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)
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

    test('a deleted application goes to the trash, and comes back from it', async () => {
      await open('board', '.application-card')
      const before = (await all('.application-card')).length

      await css('.application-card').then((card) => card.click())
      await waitFor(async () => (await all('.drawer-content')).length > 0, { message: 'the drawer' })
      await driver.executeScript('window.confirm = () => true')
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
  })
})
