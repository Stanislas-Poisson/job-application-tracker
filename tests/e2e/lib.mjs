// Helpers of the end-to-end tests: the packages under test and the browsers.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Browser, Builder, By, logging } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import edge from 'selenium-webdriver/edge.js'
import firefox from 'selenium-webdriver/firefox.js'

import * as diag from './diagnostics.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const FIREFOX_ID = 'job-application-tracker@stanislas-poisson.fr'
export const FIREFOX_UUID = 'b2c3d4e5-0000-4000-8000-000000000002'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits until check() returns something truthy, and returns it. A wait that lasts says so every 15 s with the last
// error it saw, and a wait that fails leaves the state of the browser in the diagnostics.
export async function waitFor(check, { timeout = 90_000, interval = 250, message = 'condition' } = {}) {
  const start = Date.now()
  const end = start + timeout
  let last
  let reported = start
  while (Date.now() < end) {
    try {
      last = await check()
      if (last) return last
    } catch (error) {
      last = error
    }
    if (Date.now() - reported >= 15_000) {
      reported = Date.now()
      diag.log(
        `still waiting for ${message} after ${Math.round((reported - start) / 1000)}s${last instanceof Error ? ` (${last.message})` : ''}`
      )
    }
    await sleep(interval)
  }
  await diag.capture(`timeout waiting for ${message}`)
  throw new Error(`Timed out waiting for ${message}${last instanceof Error ? ` (${last.message})` : ''}`)
}

// ---------------------------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------------------------

export function version() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
}

// The zip made by "wxt zip", which is the package that goes to the stores.
export function zipFor(browser) {
  const name =
    browser === 'firefox'
      ? `job-application-tracker-${version()}-firefox.zip`
      : `job-application-tracker-${version()}-chrome.zip`
  const zip = path.join(root, '.output', name)
  if (!fs.existsSync(zip)) {
    execFileSync('npm', ['run', browser === 'firefox' ? 'zip:firefox' : 'zip'], { cwd: root, stdio: 'inherit' })
  }
  return zip
}

// Unzips a package in a temporary folder, for --load-extension.
export function unpack(zip) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jat-ext-')))
  execFileSync('unzip', ['-q', zip, '-d', dir])
  return dir
}

// ---------------------------------------------------------------------------------------------
// Browsers
// ---------------------------------------------------------------------------------------------

// The id Chromium gives to an unpacked extension: the hash of its path, written with the letters a-p.
function chromiumId(dir) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32)
  return [...hash].map((char) => String.fromCharCode('a'.charCodeAt(0) + parseInt(char, 16))).join('')
}

// chromedriver starts the browser with --disable-extensions by default: excludeSwitches removes it.
// The browser also writes its own log (crashes, extension loading), next to the one of the driver.
const CHROMIUM_ARGS = (dir, browser) => [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--window-size=1280,900',
  `--load-extension=${dir}`,
  // Recent Chrome and Edge ignore --load-extension unless this feature is disabled.
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
  '--enable-logging',
  '--v=1',
  `--log-file=${diag.file(`${browser}-browser.log`)}`,
]

// Chrome and Edge as the vendors ship them can ignore --load-extension, and say so in their own log: only Chrome for Testing
// and Chromium take it. Named here because the symptom, a popup that never draws, points nowhere.
function refusesExtensions(browser) {
  try {
    const log = fs.readFileSync(diag.file(`${browser}-browser.log`), 'utf8')
    return log.includes('--load-extension is not allowed')
      ? ` (the browser refuses --load-extension: it is not Chrome for Testing; set SE_FORCE_BROWSER_DOWNLOAD=true so that Selenium Manager uses its own)`
      : ''
  } catch {
    return ''
  }
}

// The version that really runs, written in the timeline: a result is read against it.
async function logBrowser(driver, browser) {
  try {
    const capabilities = await driver.getCapabilities()
    diag.log(`${browser} ${capabilities.get('browserVersion')} on ${capabilities.get('platformName')}`)
  } catch (error) {
    diag.log(`the version of ${browser} is not known: ${error.message}`)
  }
}

// Starts the browser with the extension loaded, and returns the driver and the base URL of its pages.
async function launchOnce(browser, { dir, zip }) {
  if (browser === 'firefox') {
    // The current stable Firefox: with SE_FORCE_BROWSER_DOWNLOAD (the CI sets it) Selenium Manager downloads it, whatever is installed.
    const options = new firefox.Options()
      .setBrowserVersion('stable')
      .addArguments('-headless')
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [FIREFOX_ID]: FIREFOX_UUID }))
    // geckodriver needs --allow-system-access to open the pages of the extension from the browser interface.
    const out = fs.openSync(diag.file('geckodriver.log'), 'a')
    const service = new firefox.ServiceBuilder()
      .addArguments('--allow-system-access', '--log', 'trace')
      .setStdio(['ignore', out, out])
    const driver = await new Builder()
      .forBrowser(Browser.FIREFOX)
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build()
    await driver.manage().setTimeouts({ pageLoad: 60_000, script: 60_000 })
    await driver.installAddon(zip, true)
    diag.attach(driver, browser)
    await logBrowser(driver, browser)
    return { driver, base: `moz-extension://${FIREFOX_UUID}/` }
  }

  const builder = new Builder()
  const prefs = new logging.Preferences()
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL)
  prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL)
  const chromium = CHROMIUM_ARGS(dir, browser)
  if (browser === 'edge') {
    const options = new edge.Options()
      .addArguments(...chromium)
      .excludeSwitches('disable-extensions')
      .setLoggingPrefs(prefs)
    builder.setEdgeService(new edge.ServiceBuilder().loggingTo(diag.file('edgedriver.log')).enableVerboseLogging())
    // Selenium Manager downloads its own build, as it does on a machine without Edge.
    options.setBrowserVersion('stable')
    builder.forBrowser(Browser.EDGE).setEdgeOptions(options)
  } else {
    const options = new chrome.Options()
      .addArguments(...chromium)
      .excludeSwitches('disable-extensions')
      .setLoggingPrefs(prefs)
    builder.setChromeService(
      new chrome.ServiceBuilder().loggingTo(diag.file('chromedriver.log')).enableVerboseLogging()
    )
    if (process.env.BROWSER_BINARY) {
      options.setChromeBinaryPath(process.env.BROWSER_BINARY)
    } else {
      // Chrome for Testing, downloaded by Selenium Manager: the Chrome of the runner can ignore --load-extension.
      options.setBrowserVersion('stable')
    }
    builder.forBrowser(Browser.CHROME).setChromeOptions(options)
  }
  const driver = await builder.build()
  const base = `chrome-extension://${chromiumId(dir)}/`

  // The renderer of a freshly started Chromium can be stuck on its first page, mostly Edge on a runner.
  // The first page is loaded here, with a short limit, so that the caller starts the browser again if it fails.
  // It must also be the extension that answers: the form of the popup is drawn by its code, and a browser that
  // loaded the page without running the extension would let every test wait for its limit.
  diag.attach(driver, browser)
  await logBrowser(driver, browser)
  try {
    await driver.manage().setTimeouts({ pageLoad: 30_000, script: 30_000 })
    await driver.get(`${base}popup.html`)
    await driver.executeScript('return document.readyState')
    const end = Date.now() + 30_000
    while (!(await driver.executeScript(`return !!document.querySelector('form')`))) {
      if (Date.now() > end)
        throw new Error(`the popup of the extension did not draw its form in 30s${refusesExtensions(browser)}`)
      await sleep(250)
    }
  } catch (error) {
    await diag.capture(`start of ${browser}: ${error.message}`)
    diag.detach(driver)
    await driver.quit().catch(() => {})
    throw error
  }
  await diag.drainBrowserLogs('start')

  await driver.manage().setTimeouts({ pageLoad: 60_000, script: 60_000 })
  return { driver, base }
}

// The tests open a tab for each page and keep it. Firefox does not close with a hundred of them (the quit order is given, the
// process stays), so every tab but one is closed first.
async function closeExtraWindows(driver) {
  try {
    const handles = await driver.getAllWindowHandles()
    for (const handle of handles.slice(1)) {
      await driver.switchTo().window(handle)
      await driver.close()
    }
    await driver.switchTo().window(handles[0])
    diag.log(`${handles.length - 1} tabs closed before the browser`)
  } catch (error) {
    diag.log(`the tabs could not be closed: ${error.message}`)
  }
}

// Closes the browser, and says why when it does not: a browser that stays open keeps the run alive until the CI cuts it.
export async function quitBrowser(driver) {
  if (!driver) {
    return
  }
  diag.detach(driver)
  await closeExtraWindows(driver)
  let timer
  try {
    await Promise.race([
      driver.quit(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('the browser did not close in 60s')), 60_000)
      }),
    ])
    diag.log('the browser is closed')
  } catch (error) {
    diag.log(`the browser did not close: ${error.message}`)
    diag.machine('after-quit-failed')
  } finally {
    clearTimeout(timer)
  }
}

// The options are in tabs that all stay in the page, the ones not in use hidden. The tab that holds the element is shown, so that it
// can be used; an element that is in no tab (the footer) changes nothing.
export async function showTabOf(driver, selector) {
  await driver.executeScript(
    `const element = document.querySelector(arguments[0]);
     const panel = element && element.closest('[role=tabpanel]');
     if (panel && panel.hidden) { document.getElementById(panel.getAttribute('aria-labelledby')).click(); }`,
    selector
  )
}

// The drawer of an application opens to be read: the button of the drawer passes to the form.
export async function startEditing(driver) {
  const button = await waitFor(
    async () => {
      const found = await driver.findElements(By.css('dialog[open] button[name=toggleEdit]'))
      return found[0]
    },
    { message: 'the button that edits the card' }
  )
  await button.click()
  await waitFor(async () => (await driver.findElements(By.css('dialog[open] textarea[name=newNote]'))).length > 0, {
    message: 'the form of the card',
  })
}

// Saves the draft of the card with the button of the drawer, which then goes back to reading.
export async function saveCard(driver) {
  const button = await waitFor(
    async () => {
      const found = await driver.findElements(By.css('dialog[open] button[name=save]'))
      return found[0]
    },
    { message: 'the button that saves the card' }
  )
  await button.click()
  await waitFor(async () => (await driver.findElements(By.css('dialog[open] input[name=title]'))).length === 0, {
    message: 'the card back to reading',
  })
}

// Opens a page of the extension in a new tab, selects it and returns its handle. Marionette refuses
// to navigate to a moz-extension address, so Firefox opens the tab from its own interface.
export async function openPage(driver, browser, url) {
  if (browser !== 'firefox') {
    // The first page of a freshly started Chromium can be slow to load: a tab that times out is closed and replaced.
    for (let attempt = 1; ; attempt += 1) {
      const previous = await driver.getWindowHandle()
      await driver.switchTo().newWindow('tab')
      const handle = await driver.getWindowHandle()
      try {
        await driver.get(url)
        return handle
      } catch (error) {
        diag.log(`${url} did not load (attempt ${attempt}/3): ${error.message}`)
        await driver.close().catch(() => {})
        await driver.switchTo().window(previous)
        if (attempt >= 3) throw error
      }
    }
  }

  const known = await driver.getAllWindowHandles()
  await driver.setContext(firefox.Context.CHROME)
  await driver.executeScript(
    `const tab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
     gBrowser.selectedTab = tab;`,
    url
  )
  await driver.setContext(firefox.Context.CONTENT)

  const handle = await waitFor(async () => (await driver.getAllWindowHandles()).find((h) => !known.includes(h)), {
    message: 'the new tab',
  })
  await driver.switchTo().window(handle)
  return handle
}

// A browser sometimes does not start on a busy runner: each attempt has a time limit and a new one follows.
export async function launch(browser, options, { attempts = 3, timeout = 90_000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    diag.log(`starting ${browser} (attempt ${attempt}/${attempts})`)
    diag.machine(`before-start-${attempt}`)
    const started = launchOnce(browser, options)
    let timer
    try {
      const result = await Promise.race([
        started,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${browser} did not start in ${timeout / 1000}s`)), timeout)
        }),
      ])
      diag.log(`${browser} started`)
      return result
    } catch (error) {
      // A browser that starts late is closed.
      started.then(({ driver }) => driver.quit()).catch(() => {})
      diag.log(error.message)
      // A start that timed out has not captured anything itself.
      if (error.message.includes('did not start')) await diag.capture(error.message)
      if (attempt >= attempts) throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
