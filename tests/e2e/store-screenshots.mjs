// Takes the screenshots of the store listings from the built package, with invented data.
//
//   npm run zip && cd tests/e2e && node store-screenshots.mjs
//
// The pictures go to store/screenshots/<language>/. Nothing here is real: the companies, the people and the offers are made up.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { By } from 'selenium-webdriver'

import { launch, openPage, unpack, waitFor, zipFor } from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.join(root, 'store', 'screenshots')
const SIZE = { width: 1280, height: 800 }

const COLUMNS = {
  en: {
    to_apply: 'To apply',
    applied: 'Applied',
    follow_up: 'Follow-up',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
  },
  fr: {
    to_apply: 'À postuler',
    applied: 'Postulé',
    follow_up: 'Relance',
    interview: 'Entretien',
    offer: 'Offre',
    rejected: 'Refusé',
  },
}
const COLORS = {
  to_apply: '#64748b',
  applied: '#2563eb',
  follow_up: '#d97706',
  interview: '#7c3aed',
  offer: '#16a34a',
  rejected: '#dc2626',
}

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
const day = (daysAgo) => iso(daysAgo).slice(0, 10)

// Invented companies and offers: [company, title, place, status, salary [min, max] in euros a year, priority, days since seen].
const OFFERS = [
  ['Atelier Lumen', 'Front-end developer', 'Lyon', 'to_apply', [42, 50], 2, 1],
  ['Northwind Labs', 'Full-stack engineer', 'Remote', 'to_apply', [52, 62], 3, 2],
  ['Brasserie Digitale', 'Web developer', 'Nantes', 'applied', [38, 45], 1, 6],
  ['Globex Studio', 'Vue.js developer', 'Paris', 'applied', [48, 56], 3, 8],
  ['Kestrel Software', 'Software engineer', 'Toulouse', 'follow_up', [50, 58], 2, 15],
  ['Initech Services', 'Back-end developer', 'Bordeaux', 'interview', [55, 65], 3, 20],
  ['Umbra Works', 'Lead developer', 'Remote', 'offer', [62, 72], 3, 30],
  ['Vandelay Industries', 'Developer', 'Lille', 'rejected', [40, 46], 1, 40],
]
const TAGS = [
  ['Remote', '#009e73'],
  ['Startup', '#e69f00'],
  ['To prepare', '#0072b2'],
]

function demoData() {
  const companies = OFFERS.map(([name, , place], index) => ({ id: `c${index}`, name, city: place, updatedAt: iso(1) }))
  const jobOffers = OFFERS.map(([, title, place, , [min, max], , ago], index) => ({
    id: `o${index}`,
    companyId: `c${index}`,
    sourceId: `source_${['linkedin', 'indeed', 'welcome_to_the_jungle', 'apec', 'france_travail'][index % 5]}`,
    title,
    location: place,
    country: 'FR',
    city: 'Remote' === place ? null : place,
    contractType: 'permanent',
    workMode: 'Remote' === place ? 'remote' : 'hybrid',
    salaryMin: min * 100_000,
    salaryMax: max * 100_000,
    salaryCurrency: 'EUR',
    salaryPeriod: 'year',
    salaryKind: 'gross',
    postedOn: day(ago + 1),
    capturedAt: iso(ago),
    updatedAt: iso(ago),
  }))
  const applications = OFFERS.map(([, , , status, , priority, ago], index) => ({
    id: `a${index}`,
    jobOfferId: `o${index}`,
    statusId: `status_${status}`,
    position: index,
    appliedAt: 'to_apply' === status ? null : iso(ago),
    priority,
    isFavorite: 2 === index || 6 === index,
    createdAt: iso(ago),
    updatedAt: iso(ago),
  }))
  const tags = TAGS.map(([name, color], index) => ({ id: `t${index}`, name, color, updatedAt: iso(1) }))
  const taggables = [
    ['t0', 1],
    ['t0', 6],
    ['t1', 0],
    ['t1', 3],
    ['t2', 5],
  ].map(([tagId, index]) => ({
    id: `tg${tagId}${index}`,
    tagId,
    taggableId: `a${index}`,
    taggableType: 'applications',
  }))
  const journeys = [
    {
      id: 'j1',
      jobOfferId: 'o0',
      direction: 'outbound',
      name: null,
      preferred: true,
      updatedAt: iso(1),
      legs: [
        { mode: 'walk', line: '', minutes: 8, meters: 600 },
        { mode: 'tram', line: 'T1', minutes: 22, meters: null },
        { mode: 'walk', line: '', minutes: 5, meters: null },
      ],
    },
  ]
  const reminders = [
    { id: 'r1', applicationId: 'a2', title: 'Follow up by email', dueAt: iso(-1), doneAt: null, updatedAt: iso(1) },
    {
      id: 'r2',
      applicationId: 'a5',
      title: 'Prepare the technical interview',
      dueAt: iso(-2),
      doneAt: null,
      updatedAt: iso(1),
    },
  ]
  return { companies, jobOffers, applications, tags, taggables, journeys, reminders }
}

async function main() {
  const zip = zipFor('chrome')
  const dir = unpack(zip)
  const { driver, base } = await launch('chrome', { dir, zip })
  try {
    await driver
      .manage()
      .window()
      .setRect({ x: 0, y: 0, ...SIZE })
    await openPage(driver, 'chrome', `${base}options.html`)
    // The window is taller than the page by the height of the browser's own bars: the page must be exactly the size asked for.
    const inner = await driver.executeScript('return [window.innerWidth, window.innerHeight]')
    await driver
      .manage()
      .window()
      .setRect({
        x: 0,
        y: 0,
        width: SIZE.width + (SIZE.width - inner[0]),
        height: SIZE.height + (SIZE.height - inner[1]),
      })
    const data = demoData()
    const set = (items) =>
      driver.executeAsyncScript(
        `const done = arguments[arguments.length - 1]; chrome.storage.local.set(arguments[0], () => done(true));`,
        items
      )

    for (const language of ['en', 'fr']) {
      for (const theme of ['light', 'dark']) {
        await set({
          'jat:schema': 9,
          ...Object.fromEntries(Object.entries(data).map(([entity, records]) => [`jat:${entity}`, records])),
          'jat:statuses': Object.keys(COLUMNS.en).map((key, order) => ({
            id: `status_${key}`,
            key,
            label: COLUMNS[language][key],
            order,
            color: COLORS[key],
            isFinal: ['offer', 'rejected'].includes(key),
          })),
          'jat:settings': {
            locale: language,
            theme,
            accent: 'blue',
            homeCurrency: 'EUR',
            lastBackupAt: new Date().toISOString(),
          },
        })
        const folder = path.join(out, language)
        fs.mkdirSync(folder, { recursive: true })
        const shot = async (name) =>
          fs.writeFileSync(path.join(folder, `${name}-${theme}.png`), await driver.takeScreenshot(), 'base64')

        await driver.get(`${base}board.html`)
        await waitFor(async () => (await driver.findElements(By.css('.application-card'))).length >= 7, {
          message: 'the cards',
        })
        await driver.sleep(400)
        await shot('1-board')

        const cards = await driver.findElements(By.css('.application-card'))
        await cards[5].click()
        await waitFor(async () => (await driver.findElements(By.css('dialog[open]'))).length > 0, {
          message: 'the drawer',
        })
        await driver.sleep(500)
        await shot('2-application')
        await driver.executeScript(`document.querySelector('dialog[open]')?.close()`)

        await driver.get(`${base}options.html`)
        await waitFor(async () => (await driver.findElements(By.css('select[name=theme]'))).length > 0, {
          message: 'the options',
        })
        await driver.sleep(400)
        await shot('3-options')
      }
    }
    console.log(`Screenshots in ${out}`)
  } finally {
    await driver.quit()
  }
}

await main()
