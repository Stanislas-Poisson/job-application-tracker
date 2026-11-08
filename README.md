<div align="center">

<img src="public/icon/128.png" width="96" alt="Job Application Tracker icon" />

# Job Application Tracker

**Keep the job offers you saw and follow each application. Everything stays in your browser.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](wxt.config.ts)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white)](package.json)
[![CI](https://img.shields.io/github/actions/workflow/status/Stanislas-Poisson/job-application-tracker/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Stanislas-Poisson/job-application-tracker/actions/workflows/ci.yml)

</div>

---

A browser extension for people who look for a job. You save an offer from the page you are reading, and the extension keeps it with its company, the contacts you meet, your notes, your reminders and the history of the application, on a board with one column per step.

There is no server and no account: the data is stored in the browser, and you can export it as a JSON file.

## What it does

- **Popup** - saves the offer you are reading in a few seconds, without leaving the page. The title and the address are filled from the page.
- **Board** - one column per status (to apply, applied, follow-up, interview, offer, rejected). Drag a card to move it, search, archive. A card opens its details: the offer, notes, reminders, contacts and the timeline.
- **Options** - the language (English or French), the appearance (light, dark, accent colours, colour-blind modes, no-colour mode, contrast that follows the system or is chosen), your own columns (name, colour, order), the export and the import of your data.

## Install

The extension is not on the stores yet. To try it, download the zip of your browser from the [releases](../../releases) page, unzip it, then:

- **Chrome, Edge, Brave** - open `chrome://extensions` (`edge://extensions`), enable **Developer mode** and choose **Load unpacked** on the unzipped folder.
- **Firefox** - open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on** on the Firefox zip.

## Develop

Node.js 24 or later is required.

```sh
npm ci
npm run dev            # Chrome, with reload
npm run dev:firefox    # Firefox
npm run quality        # types, lint, format, styles, markdown and unit tests
npm run zip            # the zip of Chrome, Edge and Opera in .output/
npm run zip:firefox    # the zip of Firefox, and the sources it needs
```

The browser tests load the built zips in real browsers: see [CONTRIBUTING.md](CONTRIBUTING.md).

## How it is made

The extension is built with [WXT](https://wxt.dev), Vue 3, Pinia and [pinia-orm](https://pinia-orm.codedredd.de), with the components of [`@zairakai/vue-components`](https://www.npmjs.com/package/@zairakai/vue-components), the styles of [`@zairakai/mithril-scss`](https://www.npmjs.com/package/@zairakai/mithril-scss), and the helpers of `@zairakai/js-utils` and `@zairakai/js-i18n`.

The data is split into models, so that each piece of information has one place:

| Model | What it is |
| :--- | :--- |
| `Company` | A company that publishes offers or employs contacts. |
| `Source` | Where an offer was seen: LinkedIn, Indeed, a company site. |
| `JobOffer` | An offer as it was published. |
| `Application` | The follow-up of one candidacy to one offer. |
| `Status` | A column of the board, set by the user. |
| `Contact` | A person met during the search. |
| `ApplicationContact` | The link between an application and a contact, with the role of the contact. |
| `Note` | A free note, on an application, a company or a contact. |
| `Activity` | One line of the timeline of an application. |
| `Reminder` | Something to do for an application, by a date. |

Each page of the extension has its own store. The one truth is `chrome.storage.local`: a page saves what it changed, and the other pages load it when the storage tells it changed. The code of the persistence is in `src/persistence`, the rules of the application in `src/services`.

## Privacy

Nothing leaves your browser, except if you turn on the optional automatic exchange rates (off by default, see [PRIVACY.md](PRIVACY.md)). The extension asks for four permissions: `storage`, to keep your data, `alarms`, to wake up when a reminder comes due, and `activeTab` with `scripting`, to read the page you are on, only when you open the popup on it. The notifications of the reminders are an optional permission, asked only if you turn them on. See [PRIVACY.md](PRIVACY.md).

## To do

- Read the offer from the page: the `JobPosting` data that most job sites embed, then adapters for the sites that need them.
- Reminders that notify when they are due.
- Export of the board as a spreadsheet.
- Link the contacts of a company to its other applications.

## License

MIT - see [LICENSE](LICENSE).

---

<div align="center">

<img src="https://avatars.githubusercontent.com/u/3681410" width="80" height="80" style="border-radius:50%" alt="Stanislas Poisson" />

### Stanislas Poisson - Zairakai

[![GitHub](https://img.shields.io/badge/GitHub-Stanislas--Poisson-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Stanislas-Poisson)
[![GitLab](https://img.shields.io/badge/GitLab-Stanislas--Poisson-FC6D26?style=flat-square&logo=gitlab&logoColor=white)](https://gitlab.com/Stanislas-Poisson)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-stanislasp-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/stanislasp/)
[![Twitch](https://img.shields.io/badge/Twitch-zairakai-9146FF?style=flat-square&logo=twitch&logoColor=white)](https://twitch.tv/zairakai)
[![Linktree](https://img.shields.io/badge/Linktree-Zairakai-43E55E?style=flat-square&logo=linktree&logoColor=white)](https://linktr.ee/Zairakai)
[![Support the stream](https://img.shields.io/badge/Support-the_stream-FF5A5F?style=flat-square)](https://pots.lydia.me/collect/pots?id=18363-dons-stream)

</div>
