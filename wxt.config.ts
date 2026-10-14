import { defineConfig } from 'wxt'

// The source lives in src/: the pages in src/entrypoints, the rest of the code beside it.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser, manifestVersion }) => ({
    // The name and the description of the store listing are in public/_locales, one folder per language.
    default_locale: 'en',
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    homepage_url: 'https://github.com/Stanislas-Poisson/job-application-tracker',
    // storage: the data. activeTab: the page the user is looking at, only when the popup opens on it. scripting: to read
    // that one page (its JobPosting data) at that moment. Nothing is read in the background.
    // alarms: to wake up when a reminder comes due.
    permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
    // Asked only when the user turns on the notifications of the reminders, and dropped when they turn them off.
    optional_permissions: ['notifications'],
    // Asked only when the user turns on the automatic exchange rates, and dropped when it is turned off.
    optional_host_permissions: ['https://api.frankfurter.dev/*'],
    // The keys of the browser, that the user can change in the shortcuts of the browser (the page of the extensions in Chrome and
    // Edge, the manager of the shortcuts of the add-ons in Firefox). A key that another program of the browser holds is left
    // free: it is suggested, never forced. Alt+Shift+B is the bookmarks bar of Chrome, so the board takes L, for the list.
    commands: {
      [3 === manifestVersion ? '_execute_action' : '_execute_browser_action']: {
        suggested_key: { default: 'Alt+Shift+J' },
        description: '__MSG_commandPopup__',
      },
      'open-board': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: '__MSG_commandBoard__',
      },
    },
    ...('firefox' === browser
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'job-application-tracker@stanislas-poisson.fr',
              strict_min_version: '142.0',
              // Everything stays in the browser: nothing is collected or sent.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
})
