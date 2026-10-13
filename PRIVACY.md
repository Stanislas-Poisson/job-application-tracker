# Privacy Policy - Job Application Tracker

Last updated: 2026-10-13

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
- **`activeTab`** - to reach the tab you are on, when you open the popup. The permission is given by your click on the extension button, for that tab only.
- **`alarms`** - to wake up when a reminder comes due, and now and then to catch up. It gives access to nothing.
- **`scripting`** - to read that one tab at that moment: its title, its address and the data about the offer that the page itself publishes (the `JobPosting` data that job sites give to search engines). For a site that publishes no such data (LinkedIn), the main part of the page you are looking at is read as well. Nothing is read in the background, from another tab or from a page you did not open the popup on, and what is read goes nowhere: it only fills the form of the popup, which you can change before saving.

## Exchange rates (optional, off by default)

If you turn on "Update the rates by itself" in the options, the extension asks the browser for the permission to reach `https://api.frankfurter.dev` and fetches the reference rates of the European Central Bank, once a day at most. The request names your home currency and nothing else: no cookie, no identifier, no referrer, none of your data. Turning the option off drops the permission. The rates you type yourself always win over the fetched ones.

## Source code

The full source is public and MIT-licensed:
<https://github.com/Stanislas-Poisson/job-application-tracker>

## Contact

Questions or concerns: open an issue at
<https://github.com/Stanislas-Poisson/job-application-tracker/issues>

## Backups protected by a passphrase

If you turn on "Protect the backups with a passphrase", the backup file is encrypted in your browser (AES-GCM, key from PBKDF2) before it is written. **The passphrase is never stored and never leaves your browser.** Only a check is kept in the settings, to tell whether a passphrase you type later is the one you set. Nobody, including the author, can recover a lost passphrase or open a protected backup without it.

## Notifications of the reminders

If you turn on "Notify me when a reminder is due", the extension asks the browser for the permission to show notifications, and gives it back when you turn the option off. A notification is made on your computer from your own data (the title of the reminder, the offer and the company) and shown by your system. Nothing is sent anywhere. The number on the icon of the extension is computed the same way, and needs no permission.

## Addresses and maps

An offer can keep the address of its workplace (in fields, with its position on a map if the page gave it or you typed it), the journeys you found to get there (the means, the line and the time of each leg), and the settings can hold the address you leave from. They stay in your browser, with your backups. The extension looks nothing up and computes no route: you search on the map, and keep the result. The extension never sends them anywhere by itself. A link such as "Show on the map" or "Route from home" is built from them, and **only when you click it** your browser opens the map service you chose (Google Maps, OpenStreetMap, Apple Maps or a link of your own) with the address (or the position) in the link. What that service does with it is governed by its own policy.

## Bringing two computers together

The merge reads a backup file you choose, on your computer, and adds its content to the data stored in your browser. Nothing is sent anywhere, and nothing is deleted.

## Your look

The font, the size and spacing of the text, your colours and your own themes are settings. They stay in your browser, with your backups. A font you name is one installed on your computer: nothing is downloaded.
