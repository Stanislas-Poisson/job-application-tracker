// Helpers of the end-to-end tests: the packages under test and the browsers.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Browser, Builder, logging } from 'selenium-webdriver'
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

// Starts the browser with the extension loaded, and returns the driver and the base URL of its pages.
async function launchOnce(browser, { dir, zip }) {
  if (browser === 'firefox') {
    const options = new firefox.Options()
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
      // Chrome for Testing, downloaded by Selenium Manager: the Chrome of the runner ignores --load-extension.
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
  try {
    await driver.manage().setTimeouts({ pageLoad: 30_000, script: 30_000 })
    await driver.get(`${base}popup.html`)
    await driver.executeScript('return document.readyState')
    const end = Date.now() + 30_000
    while (!(await driver.executeScript(`return !!document.querySelector('form')`))) {
      if (Date.now() > end) throw new Error('the popup of the extension did not draw its form in 30s')
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
