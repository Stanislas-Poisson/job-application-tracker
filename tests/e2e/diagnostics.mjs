// Evidence of the end-to-end runs. A browser that dies on a runner leaves nothing behind but a timeout: this module
// keeps a timeline, the logs of the drivers and of the browser, and a snapshot of the page and of the machine at each failure.
//
// Everything goes to tests/e2e/.diagnostics/<browser>/ (or E2E_DIAG_DIR), which the CI uploads as an artifact.
// Nothing here may fail a test: every capture is guarded and has a time limit, because the driver is often what is stuck.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

let dir
let driver = null
let browserName = 'browser'
let captures = 0

// The folder of this run, created on first use.
export function folder() {
  if (!dir) {
    dir = process.env.E2E_DIAG_DIR || path.join(here, '.diagnostics', process.env.BROWSER || 'chrome')
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const file = (name) => path.join(folder(), name)

// A line in the timeline, also written to the output of the job.
export function log(message) {
  const line = `${new Date().toISOString()} ${message}`
  console.log(`[e2e] ${message}`)
  try {
    fs.appendFileSync(file('timeline.log'), `${line}\n`)
  } catch {
    // The timeline is a help, not a requirement.
  }
}

// The driver that the next captures look at.
export function attach(nextDriver, browser) {
  driver = nextDriver
  browserName = browser
}

export function detach(closed) {
  if (driver === closed) driver = null
}

// Once a step got no answer the driver is stuck: the following steps of that capture only try for a few seconds.
let stuck = false

// Runs a step with a time limit: a stuck driver must not hold the capture of the rest.
async function guarded(name, step, limit = 15_000) {
  if (stuck) limit = Math.min(limit, 3_000)
  let timer
  try {
    return await Promise.race([
      step(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${limit / 1000}s`)), limit)
      }),
    ])
  } catch (error) {
    if (error.message.startsWith('no answer')) stuck = true
    log(`capture of ${name} failed: ${error.message}`)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    return `${command}: ${error.message}\n`
  }
}

// Memory, shared memory (Chromium crashes when /dev/shm is full), disk, load and the heaviest processes.
export function machine(label) {
  const text = [
    `$ date\n${run('date -u')}`,
    `$ uptime\n${run('uptime')}`,
    `$ free -m\n${run('free -m')}`,
    `$ df -h /dev/shm /tmp\n${run('df -h /dev/shm /tmp')}`,
    `$ ps (by memory)\n${run('ps -eo pid,ppid,rss,pcpu,etime,stat,comm --sort=-rss | head -20')}`,
    `$ chrome-like processes\n${run('pgrep -a -f "chrome|chromium|msedge|firefox|geckodriver|chromedriver" | cut -c1-200 || true')}`,
  ].join('\n')
  fs.writeFileSync(file(`machine-${slug(label)}.txt`), text)
}

// What the browser said since the last call: the console of the pages, and the network for Chromium.
export async function drainBrowserLogs(label) {
  // geckodriver has no such log: the output of the driver is what Firefox leaves.
  if (!driver || browserName === 'firefox') return
  const target = driver
  for (const type of ['browser', 'performance']) {
    const entries = await guarded(`${type} logs`, () => target.manage().logs().get(type), 10_000)
    if (!entries?.length) continue
    const lines = entries.map(
      (entry) => `${new Date(entry.timestamp).toISOString()} ${entry.level?.name ?? ''} ${entry.message}`
    )
    fs.appendFileSync(file(`${type}.log`), `# ${label}\n${lines.join('\n')}\n`)
  }
}

// The state of the browser right now: pages, targets, screenshot, DOM, console. Called when something does not come up.
export async function capture(reason) {
  const target = driver
  captures += 1
  stuck = false
  const name = `${String(captures).padStart(2, '0')}-${slug(reason)}`
  log(`capture ${name}: ${reason}`)
  machine(name)
  if (!target) {
    log('no driver to capture')
    return
  }

  const info = { reason, browser: browserName, at: new Date().toISOString() }

  info.windows = await guarded('windows', async () => {
    const handles = await target.getAllWindowHandles()
    const current = await target.getWindowHandle().catch(() => null)
    const windows = []
    for (const handle of handles) {
      await target.switchTo().window(handle)
      windows.push({
        handle,
        current: handle === current,
        url: await target.getCurrentUrl().catch(() => null),
        title: await target.getTitle().catch(() => null),
      })
    }
    if (current)
      await target
        .switchTo()
        .window(current)
        .catch(() => {})
    return windows
  })

  // Chromium only: the pages and the workers that exist, which tells whether the extension is loaded at all.
  info.targets = await guarded('targets', async () => {
    if (typeof target.sendAndGetDevToolsCommand !== 'function') return undefined
    const { targetInfos } = await target.sendAndGetDevToolsCommand('Target.getTargets', {})
    return targetInfos.map(({ type, url, title, attached }) => ({ type, url, title, attached }))
  })

  info.page = await guarded('page state', () =>
    target.executeScript(`return {
      url: location.href,
      readyState: document.readyState,
      title: document.title,
      bodyLength: document.body ? document.body.innerHTML.length : null,
      appMounted: !!document.querySelector('#app *'),
      forms: document.querySelectorAll('form').length,
      extension: typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.id || null : null,
    }`)
  )

  fs.writeFileSync(file(`${name}.json`), JSON.stringify(info, null, 2))

  const html = await guarded('html', () => target.executeScript('return document.documentElement.outerHTML'))
  if (html) fs.writeFileSync(file(`${name}.html`), html)

  const png = await guarded('screenshot', () => target.takeScreenshot())
  if (png) fs.writeFileSync(file(`${name}.png`), png, 'base64')

  await drainBrowserLogs(name)
}

// For a test hook: the logs of the test, and the state of the page when it failed.
export async function afterTest(context) {
  await drainBrowserLogs(context.name)
  if (context.passed === false) {
    log(`FAILED ${context.name}${context.error ? `: ${context.error.cause?.message ?? context.error.message}` : ''}`)
    await capture(`failed ${context.name}`)
  } else {
    log(`ok ${context.name}`)
  }
}
