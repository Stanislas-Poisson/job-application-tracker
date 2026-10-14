// Screenshots for the manual review of the look (docs/manual-validation.md), taken in a real browser with the package of the
// stores. It does not assert anything: it fills a board with realistic data, goes through the looks, the languages, the text
// sizes and the messages, and writes one picture each, with an index.html to browse them.
//
//   npm run zip
//   BROWSER=chrome OUT=/path/to/folder node tests/e2e/review.mjs
//   ONLY=languages node tests/e2e/review.mjs      (only the groups whose name matches)
//
// Without OUT the pictures go to .output/review/<browser>.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { By, Key } from 'selenium-webdriver'

import { launch, openPage, unpack, waitFor, zipFor } from './lib.mjs'

const browser = process.env.BROWSER || 'chrome'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.env.OUT || path.join(root, '.output/review', browser))
const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null
const LANGUAGES = fs
  .readdirSync(path.join(root, 'src/locales/notify'))
  .map((file) => file.replace(/\.ts$/, ''))
  .sort()
// Languages that read right to left, and the scripts that are hardest to lay out.
const RTL = ['ar', 'he']
const HARD = ['ar', 'he', 'ja', 'hi', 'ru']

const shots = []
let driver
let base
let group = ''

const css = (selector) => driver.findElement(By.css(selector))
const all = (selector) => driver.findElements(By.css(selector))
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const on = (name) => !only || only.test(name)

// ---------------------------------------------------------------- the data of the board

function seedRecords() {
  const now = new Date().toISOString()
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString()
  const companies = [
    ['Acme SAS', 'Paris', 'FR'],
    ['Société Générale d’Informatique et de Services Numériques', 'Lyon', 'FR'],
    ['Globex GmbH', 'Berlin', 'DE'],
    ['Plateforme Européenne de Données et de Services Cloud', 'Bruxelles', 'BE'],
    ['株式会社テクノロジー', '東京', 'JP'],
    ['شركة النور للتقنية', 'الرياض', 'SA'],
    ['Donaudampfschifffahrtsgesellschaft GmbH', 'Wien', 'AT'],
    ['Initech Ltd', 'London', 'GB'],
    ['Umbrella Corp.', 'Remote', null],
    ['Hooli', 'San Francisco', 'US'],
  ].map(([name, city, country], index) => ({ id: `c${index}`, updatedAt: now, name, city, country, createdAt: now }))
  // title, status, contract, mode, [min, max, currency, period], favourite, priority, source
  const offers = [
    ['Senior Backend Developer', 'applied', 'permanent', 'hybrid', [55000, 70000, 'EUR', 'year'], false, 2, 'linkedin'],
    [
      'Développeur·se Full Stack (H/F)',
      'to_apply',
      'permanent',
      'onsite',
      [42000, 48000, 'EUR', 'year'],
      false,
      0,
      'apec',
    ],
    ['Lead Frontend Engineer', 'interview', 'permanent', 'remote', [80000, 95000, 'EUR', 'year'], true, 3, 'indeed'],
    [
      'Ingénieur logiciel principal – Plateforme de données en temps réel et de services d’analyse',
      'follow_up',
      'permanent',
      'hybrid',
      [60000, 75000, 'EUR', 'year'],
      false,
      1,
      'welcome_to_the_jungle',
    ],
    [
      'シニアソフトウェアエンジニア',
      'applied',
      'permanent',
      'onsite',
      [8000000, 10000000, 'JPY', 'year'],
      false,
      0,
      'other',
    ],
    ['مهندس برمجيات أول', 'to_apply', 'permanent', 'onsite', [20000, 28000, 'SAR', 'month'], false, 0, 'other'],
    [
      'Arbeitszeitverkürzungsverwaltungssystementwickler',
      'rejected',
      'permanent',
      'onsite',
      [65000, 72000, 'EUR', 'year'],
      false,
      0,
      'other',
    ],
    ['Freelance DevOps', 'offer', 'freelance', 'remote', [650, 700, 'GBP', 'day'], true, 2, 'linkedin'],
    ['Data Engineer', 'applied', 'permanent', 'remote', [50, 60, 'USD', 'hour'], false, 1, 'france_travail'],
    ['Product Designer', 'follow_up', 'permanent', 'hybrid', [120000, 140000, 'USD', 'year'], false, 0, 'linkedin'],
  ]
  const jobOffers = []
  const applications = []
  offers.forEach(([title, status, contract, mode, salary, favourite, priority, source], index) => {
    jobOffers.push({
      id: `o${index}`,
      updatedAt: now,
      companyId: `c${index}`,
      sourceId: `source_${source}`,
      title,
      url: `https://example.com/jobs/${String(index)}`,
      location: companies[index].city,
      country: companies[index].country,
      contractType: contract,
      workMode: mode,
      // Amounts are kept in minor units: cents, except for the yen, which has none.
      salaryMin: salary[0] * ('JPY' === salary[2] ? 1 : 100),
      salaryMax: salary[1] * ('JPY' === salary[2] ? 1 : 100),
      salaryCurrency: salary[2],
      salaryPeriod: salary[3],
      salaryKind: 'gross',
      description: 'A short description of the job, to see how a few lines of text sit in the drawer.',
      postedOn: day(index + 1).slice(0, 10),
      capturedAt: day(index),
    })
    applications.push({
      id: `a${index}`,
      updatedAt: now,
      jobOfferId: `o${index}`,
      statusId: `status_${status}`,
      position: index,
      appliedAt: 'to_apply' === status ? null : day(index + 2),
      archived: false,
      isFavorite: favourite,
      priority,
      createdAt: day(index + 3),
    })
  })
  const tags = [
    ['remote', '#0072b2'],
    ['startup', '#d55e00'],
    ['to-research-before-interview', '#009e73'],
  ].map(([name, color], index) => ({ id: `t${index}`, updatedAt: now, name, color, symbol: null, createdAt: now }))
  const taggables = [
    ['t0', 'a2'],
    ['t1', 'a2'],
    ['t2', 'a2'],
    ['t0', 'a7'],
    ['t1', 'a8'],
  ].map(([tagId, taggableId], index) => ({
    id: `tg${index}`,
    updatedAt: now,
    tagId,
    taggableId,
    taggableType: 'applications',
  }))
  const notes = [
    {
      id: 'n0',
      updatedAt: now,
      noteableId: 'a2',
      noteableType: 'applications',
      body: 'Second interview on Thursday.\nAsk about the team size and the on-call rota.',
      createdAt: now,
    },
  ]
  return { companies, jobOffers, applications, tags, taggables, notes }
}

// ---------------------------------------------------------------- the browser

const store = (values) =>
  driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1]; chrome.storage.local.set(arguments[0], () => done(true))`,
    values
  )

// The settings are written in the storage, as the options page does: every page open follows at once.
async function settings(patch) {
  await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1]; const patch = arguments[0];
     chrome.storage.local.get('jat:settings', (stored) => chrome.storage.local.set({ 'jat:settings': { ...(stored['jat:settings'] || {}), motion: 'reduce', ...patch } }, () => done(true)))`,
    patch
  )
  await pause(450)
}

async function openTab(page, ready) {
  await openPage(driver, browser, `${base}${page}.html`)
  await waitFor(async () => (await all(ready)).length > 0, { message: `${page} to load` })
  return driver.getWindowHandle()
}

async function fullPage(file) {
  if ('firefox' === browser) {
    fs.writeFileSync(file, await driver.takeFullPageScreenshot(), 'base64')
    return
  }
  const height = await driver.executeScript(
    `return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)`
  )
  const width = await driver.executeScript(`return document.documentElement.clientWidth`)
  await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', {
    width,
    height: Math.min(height, 8000),
    deviceScaleFactor: 1,
    mobile: false,
  })
  await pause(150)
  const { data } = await driver.sendAndGetDevToolsCommand('Page.captureScreenshot', { format: 'png' })
  await driver.sendDevToolsCommand('Emulation.clearDeviceMetricsOverride', {})
  fs.writeFileSync(file, data, 'base64')
}

// One picture: the group, a name for the file, and a line that says what is looked at.
async function shot(name, caption, { whole = true } = {}) {
  const dir = path.join(out, group)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}.png`)
  await pause(250)
  if (whole) {
    await fullPage(file)
  } else {
    fs.writeFileSync(file, await driver.takeScreenshot(), 'base64')
  }
  shots.push({ group, name, caption, file: path.relative(out, file) })
}

let tabs = {}
async function use(page) {
  await driver.switchTo().window(tabs[page])
  await pause(150)
}

async function reload(page) {
  await use(page)
  await driver.navigate().refresh()
  await waitFor(async () => (await all('footer')).length > 0, { message: `${page} to reload` })
}

async function openDrawer() {
  await use('board')
  await css('.application-card .card-open').then((button) => button.click())
  await waitFor(async () => (await all('dialog[open] textarea[name=newNote]')).length > 0, { message: 'the drawer' })
  await pause(300)
}

async function closeDrawer() {
  const pending = await all('dialog[open] textarea[name=newNote]')
  if (0 < pending.length) {
    await driver.actions().sendKeys(Key.ESCAPE).perform()
    await waitFor(async () => (await all('dialog[open]')).length === 0, { message: 'the drawer to close' })
  }
}

// The three pages and the drawer in the look now set.
async function pages(label, { drawer = true, popup = true } = {}) {
  const tag = label.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()
  await use('board')
  await shot(`${tag}-board`, `${label}: the board`)
  if (popup) {
    await use('popup')
    await shot(`${tag}-popup`, `${label}: the popup`)
  }
  await use('options')
  await shot(`${tag}-options`, `${label}: the options`)
  if (drawer) {
    await openDrawer()
    await shot(`${tag}-drawer`, `${label}: the drawer of an application`, { whole: false })
    await closeDrawer()
  }
}

// ---------------------------------------------------------------- the groups

async function looks() {
  group = '1-looks'
  for (const theme of ['light', 'dark']) {
    for (const vision of ['standard', 'red-green', 'blue-yellow', 'monochrome']) {
      for (const contrast of ['standard', 'high']) {
        await settings({ locale: 'en', theme, vision, contrast })
        await pages(`${theme} ${vision} ${contrast}`)
      }
    }
  }
}

async function system() {
  if ('firefox' === browser) {
    return
  }
  group = '2-system'
  await settings({ locale: 'en', vision: 'standard', contrast: 'auto' })
  for (const theme of ['light', 'dark']) {
    await settings({ theme })
    for (const [name, features] of [
      ['more-contrast', [{ name: 'prefers-contrast', value: 'more' }]],
      ['forced-colors', [{ name: 'forced-colors', value: 'active' }]],
    ]) {
      for (const page of ['board', 'options']) {
        await use(page)
        await driver.sendDevToolsCommand('Emulation.setEmulatedMedia', { features })
        await pause(300)
        await shot(`${theme}-${name}-${page}`, `${theme}, system asks for ${name}: the ${page}`)
        await driver.sendDevToolsCommand('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-contrast', value: '' },
            { name: 'forced-colors', value: '' },
          ],
        })
      }
    }
  }
}

async function customTheme() {
  group = '3-custom-theme'
  await settings({ locale: 'en', theme: 'light', vision: 'standard', contrast: 'standard' })
  await use('options')
  const name = await css('input[name=newTheme]')
  await name.clear()
  await name.sendKeys('Review')
  await driver.executeScript(`document.querySelector('input[name=newTheme]').closest('form').requestSubmit()`)
  await waitFor(async () => (await all('#theme-editor')).length > 0, { message: 'the theme editor' })
  for (const theme of ['light', 'dark']) {
    await settings({ theme })
    await pages(`custom theme ${theme}`, { popup: true })
    await settings({ contrast: 'high' })
    await pages(`custom theme ${theme} high contrast`, { drawer: false, popup: false })
    await settings({ contrast: 'standard' })
  }
  await settings({ customThemes: [], customThemeId: '' })
}

async function languages() {
  group = '4-languages'
  await settings({ theme: 'light', vision: 'standard', contrast: 'standard', textScale: 100, textSpacing: 'default' })
  for (const locale of LANGUAGES) {
    await settings({ locale })
    await pages(`language ${locale}`)
    if (RTL.includes(locale)) {
      await settings({ theme: 'dark' })
      await pages(`language ${locale} dark`, { popup: false })
      await settings({ theme: 'light' })
    }
  }
  await settings({ locale: 'en' })
}

async function text() {
  group = '5-text'
  await settings({ theme: 'light', vision: 'standard', contrast: 'standard' })
  for (const locale of HARD.concat('en').reverse()) {
    await settings({ locale, textScale: 200, textSpacing: 'widest' })
    await pages(`text 200 percent and widest spacing, language ${locale}`, { popup: false })
  }
  await settings({ locale: 'en', textScale: 100, textSpacing: 'default' })
  for (const fontFamily of ['serif', 'mono']) {
    await settings({ fontFamily })
    await pages(`font ${fontFamily}`, { popup: false, drawer: false })
  }
  await settings({ fontFamily: 'system', density: 'compact' })
  await pages('compact density', { popup: false, drawer: false })
  await settings({ density: 'comfortable' })
}

async function messages() {
  group = '6-messages'
  await settings({ theme: 'light', vision: 'standard', contrast: 'standard', textScale: 100 })
  for (const [locale, theme, scale] of [
    ['en', 'light', 100],
    ['en', 'dark', 100],
    ['ar', 'light', 100],
    ['he', 'dark', 100],
    ['en', 'light', 200],
  ]) {
    await settings({ locale, theme, textScale: scale })
    const label = `${locale} ${theme} ${String(scale)} percent`
    const tag = label.replaceAll(/[^a-z0-9]+/gi, '-')

    // The toast with the button to undo, from the removal of a tag.
    await use('options')
    await driver.executeScript(
      `document.querySelector('input[name^=tag-]').closest('li').querySelector('button').click()`
    )
    await waitFor(async () => (await all('.toast')).length > 0, { message: 'the toast' })
    await shot(`toast-${tag}`, `${label}: the message with its Undo button`, { whole: false })
    // Put the tag back for the next round.
    await driver.executeScript(`document.querySelector('.toast .notice-action')?.click()`)
    await pause(500)

    // The confirmation over the drawer, from a note typed and not saved.
    await openDrawer()
    await css('dialog[open] textarea[name=newNote]').then((field) => field.sendKeys('A note that is not saved'))
    await driver.actions().sendKeys(Key.ESCAPE).perform()
    await waitFor(async () => (await all('#confirm-dialog[open], dialog#confirm-dialog')).length > 0, {
      message: 'the confirmation',
    })
    await shot(`confirm-${tag}`, `${label}: the confirmation over the drawer`, { whole: false })
    // Keep the text: the confirmation, then the drawer, then leave without a trace.
    await driver.executeScript(`document.querySelector('#confirm-dialog button:not([value=confirm])')?.click()`)
    await pause(300)
    await driver.executeScript(
      `const field = document.querySelector('dialog[open] textarea[name=newNote]'); if (field) { field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })) }`
    )
    await closeDrawer()
  }
  await settings({ locale: 'en', theme: 'light', textScale: 100 })
}

async function sizes() {
  group = '7-sizes'
  await settings({ locale: 'en', theme: 'light', vision: 'standard', contrast: 'standard' })
  await use('board')
  for (const [width, height] of [
    [1024, 768],
    [1280, 800],
    [1920, 1080],
  ]) {
    await driver.manage().window().setRect({ width, height })
    await pause(300)
    for (const page of ['board', 'options']) {
      await use(page)
      await shot(`${String(width)}-${page}`, `${String(width)} pixels wide: the ${page}`)
    }
  }
  await driver.manage().window().setRect({ width: 1280, height: 900 })
}

// ---------------------------------------------------------------- the index

function indexPage() {
  const groups = [...new Set(shots.map((entry) => entry.group))]
  const body = groups
    .map((name) => {
      const figures = shots
        .filter((entry) => entry.group === name)
        .map(
          (entry) =>
            `<figure><a href="${entry.file}"><img loading="lazy" src="${entry.file}" alt=""></a><figcaption>${entry.caption.replaceAll('<', '&lt;')}</figcaption></figure>`
        )
        .join('\n')
      return `<h2>${name}</h2>\n<div class="grid">\n${figures}\n</div>`
    })
    .join('\n')
  fs.writeFileSync(
    path.join(out, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual review: ${browser}</title>
<style>body{font:15px system-ui,sans-serif;margin:1rem;background:#f4f4f4;color:#111}h1,h2{margin:1.2rem 0 .6rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.8rem}
figure{margin:0;background:#fff;border:1px solid #ccc;padding:.4rem}img{width:100%;height:220px;object-fit:cover;object-position:top;display:block}
figcaption{font-size:13px;padding-top:.3rem}</style></head><body>
<h1>Manual review: ${browser}, ${new Date().toISOString().slice(0, 10)}</h1>
<p>${String(shots.length)} pictures. Click one to see it whole. What to look for: <code>docs/manual-validation.md</code>.</p>
${body}
</body></html>`
  )
}

// ---------------------------------------------------------------- the run

const zip = zipFor(browser)
;({ driver, base } = await launch(browser, { dir: unpack(zip), zip }))
try {
  await driver.manage().window().setRect({ width: 1280, height: 900 })
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  // The first page creates the columns and the sources; the data comes after and the pages follow.
  tabs.options = await openTab('options', 'footer')
  const data = seedRecords()
  await store({
    'jat:companies': data.companies,
    'jat:jobOffers': data.jobOffers,
    'jat:applications': data.applications,
    'jat:tags': data.tags,
    'jat:taggables': data.taggables,
    'jat:notes': data.notes,
  })
  tabs.board = await openTab('board', '.application-card')
  tabs.popup = await openTab('popup', 'form')
  await use('options')
  await driver.navigate().refresh()
  await waitFor(async () => (await all('footer')).length > 0, { message: 'options' })

  const groupsToRun = { looks, system, customTheme, languages, text, messages, sizes }
  for (const [name, run] of Object.entries(groupsToRun)) {
    if (on(name)) {
      console.log(`[review] ${name}`)
      await run()
    }
  }
  indexPage()
  console.log(`[review] ${String(shots.length)} pictures in ${out}\n[review] open ${path.join(out, 'index.html')}`)
} finally {
  await driver.quit()
}
