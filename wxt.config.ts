import { defineConfig } from 'wxt'

// The source lives in src/: the pages in src/entrypoints, the rest of the code beside it.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser }) => ({
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
