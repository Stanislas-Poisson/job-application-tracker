import { defineConfig } from 'wxt'

// The source lives in src/: the pages in src/entrypoints, the rest of the code beside it.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser }) => ({
    name: 'Job Application Tracker',
    short_name: 'Job Tracker',
    description: 'Keeps the job offers you saw and follows each application. Everything stays in your browser.',
    homepage_url: 'https://github.com/Stanislas-Poisson/job-application-tracker',
    // storage: the data. activeTab: the title and the address of the page the user is looking at, when the popup opens.
    permissions: ['storage', 'activeTab'],
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
