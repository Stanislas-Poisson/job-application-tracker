# Privacy Policy - Job Application Tracker

Last updated: 2026-10-12

**Job Application Tracker does not collect, transmit, or share any user data of any kind.** Everything you save stays in your own browser. The only network request is an option that is off by default: the exchange rates (see below).

## What the extension does

It keeps the job offers you save, the companies, the contacts, your notes, your reminders and the history of your applications, and shows them on a board.

## What it stores

Everything is in `chrome.storage.local` (never synced, never transmitted, removed if you remove the extension):

- the offers, companies, contacts, applications, notes, reminders and the timeline you create;
- your columns (statuses) and sources;
- your settings: the language.

You can export all of it as a JSON file from the options page, import it back, or delete it.

## What it does not do

- It does not send your data anywhere: there is no server, no account, no analytics, no tracker and no remote code.
- It does not read the pages you visit. It reads the title and the address of the page you are on once, when you open the popup, so that the form is filled; you can change both before saving.

## Permissions used

- **`storage`** - to keep your data in the browser.
- **`https://api.frankfurter.dev/*`** (optional) - only if you turn on the automatic exchange rates.
- **`activeTab`** - to read the title and the address of the tab you are on, when you open the popup. The permission is given by your click on the extension button, for that tab only.

## Exchange rates (optional, off by default)

If you turn on "Update the rates by itself" in the options, the extension asks the browser for the permission to reach `https://api.frankfurter.dev` and fetches the reference rates of the European Central Bank, once a day at most. The request names your home currency and nothing else: no cookie, no identifier, no referrer, none of your data. Turning the option off drops the permission. The rates you type yourself always win over the fetched ones.

## Source code

The full source is public and MIT-licensed:
<https://github.com/Stanislas-Poisson/job-application-tracker>

## Contact

Questions or concerns: open an issue at
<https://github.com/Stanislas-Poisson/job-application-tracker/issues>
