import {
  ALARM_NEXT,
  ALARM_POLL,
  type BackgroundEnv,
  POLL_MINUTES,
  applicationOfNotification,
  checkReminders,
  sendTestNotification,
} from '../background/reminders'
import { keyOf } from '../persistence'
import { browserAdapter } from '../persistence/adapter'
import { SETTINGS_KEY } from '../settings'

// The background of the extension. It does one thing: tell the user when a reminder comes due, when they asked for it.
// It reads the stored data and writes nothing of it; see src/background/reminders.ts.
export default defineBackground(() => {
  const env: BackgroundEnv = {
    adapter: browserAdapter,
    now: () => new Date(),
    language: navigator.language,
    async notify(id, title, message, persistent) {
      // Without the permission (optional, asked when the user turns the notifications on) there is no such thing.
      if (!browser.notifications) {
        throw new Error('The notifications are not allowed.')
      }
      await browser.notifications.create(id, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon/128.png'),
        title,
        message,
        // An alert: it stays until the user closes it, instead of going away by itself. Firefox does not know the option,
        // and refuses a notification that carries one.
        ...(persistent && 'firefox' !== import.meta.env.BROWSER ? { requireInteraction: true, priority: 2 } : {}),
      })
    },
    async setBadge(count) {
      // The button of the extension: "action" in manifest 3, "browserAction" in manifest 2 (Firefox).
      const button = (browser.action ??
        (browser as unknown as { browserAction: typeof browser.action }).browserAction) as
        typeof browser.action | undefined
      await button?.setBadgeText({ text: 0 < count ? String(Math.min(count, 99)) : '' })
      await button?.setBadgeBackgroundColor({ color: '#dc2626' })
    },
    async scheduleNext(when) {
      await browser.alarms.clear(ALARM_NEXT)
      if (null !== when) {
        browser.alarms.create(ALARM_NEXT, { when })
      }
    },
  }

  // The checks run one after the other: a change and an alarm at the same moment must not tell about a reminder twice.
  let queue: Promise<unknown> = Promise.resolve()
  const check = () => {
    queue = queue.then(() => checkReminders(env)).catch(() => undefined)
  }

  // A click on a notification opens the board on the application, in the tab that is open already if there is one.
  async function openApplication(applicationId: string | null) {
    const board = browser.runtime.getURL('/board.html' as never)
    const target = null === applicationId ? board : `${board}#application=${encodeURIComponent(applicationId)}`
    try {
      const [open] = await browser.tabs.query({ url: `${board}*` })
      if (open?.id !== undefined) {
        await browser.tabs.update(open.id, { url: target, active: true })
        if (open.windowId !== undefined) {
          await browser.windows.update(open.windowId, { focused: true })
        }
        return
      }
    } catch {
      // The tabs cannot be looked at: a new one is opened.
    }
    await browser.tabs.create({ url: target })
  }

  let listening = false
  function listenToClicks() {
    if (listening || !browser.notifications) {
      return
    }
    listening = true
    browser.notifications.onClicked.addListener((id) => {
      // One application, or the board itself for the notification that groups several.
      void openApplication(applicationOfNotification(id))
      void browser.notifications.clear(id)
    })
  }

  // The options ask for a test notification (the developer mode, to see a translation as it shows).
  browser.runtime.onMessage.addListener((message: unknown) => {
    if ('jat:test-notification' !== (message as { type?: string } | null)?.type) {
      return undefined
    }
    return sendTestNotification(env).then(
      () => ({ ok: true }),
      () => ({ ok: false })
    )
  })

  browser.runtime.onInstalled.addListener(check)
  browser.runtime.onStartup.addListener(check)
  browser.alarms.onAlarm.addListener((alarm) => {
    if (ALARM_NEXT === alarm.name || ALARM_POLL === alarm.name) {
      check()
    }
  })
  // The reminders, what they hang on, and the setting: a change of any of them can change what is due and when.
  const watched = new Set([SETTINGS_KEY, ...['reminders', 'applications', 'statuses'].map(keyOf)])
  browser.storage.onChanged.addListener((changes, area) => {
    if ('local' === area && Object.keys(changes).some((key) => watched.has(key))) {
      check()
    }
  })
  // The permission was just given: listen to the clicks, and tell about what is due.
  browser.permissions.onAdded.addListener(() => {
    listenToClicks()
    check()
  })

  listenToClicks()
  browser.alarms.create(ALARM_POLL, { periodInMinutes: POLL_MINUTES })
  check()
})
