# Contributing to Job Application Tracker

Thank you for contributing! This project is a browser extension (Manifest V3) built with WXT, Vue 3, Pinia and pinia-orm.

## Git Workflow

- **Base Branch:** Always create your branches off of and target `develop` for your pull requests.
- **Branch Naming:** One branch per issue, for example `feature/#12-short-name`.
- **Pull requests:** The `ci` check must be green to merge. Merges use a merge commit.
- **Commit Format:** Use the format `type(scope): #ticket subject`:
  - Example: `feat(board): #12 add a filter by company`

## Set up

Node.js 24 or later is required.

```sh
npm ci
npm run dev            # Chrome, with reload
npm run dev:firefox    # Firefox
```

## Quality

```sh
npm run quality
```

It runs, in order, the type check (`vue-tsc`), ESLint, Prettier, Stylelint, markdownlint and the unit tests (Vitest). The configurations extend [`@stanislas-poisson/js-dev-tools`](https://github.com/Stanislas-Poisson/js-dev-tools): the code style follows it, including the Yoda conditions (`0 === count`).

## Where things are

| Folder | Content |
| :--- | :--- |
| `src/entrypoints` | The pages of the extension: popup, board, options. |
| `src/models` | The pinia-orm models. |
| `src/services` | The rules of the application: capture, move, notes, export. They do not know the pages. |
| `src/persistence` | The link between the stores and `chrome.storage.local`. |
| `src/components` | The Vue components shared by the pages. |
| `src/locales` | The texts, English and French. A key must exist in both: a test checks it. |
| `tests/unit` | The unit tests. |
| `tests/e2e` | The browser tests. |

Every page has the same footer (the component `AppFooter`) and shows the version of the extension in its header.

## Test in the browsers

The CI loads the zips in Chrome, Edge and Firefox and plays the flow: the pages and their footer, the language, the columns, then an offer saved in the popup, seen on the board, noted, moved, and still there after a reload. To run it on your machine:

```sh
npm run zip           # and npm run zip:firefox for Firefox
cd tests/e2e
npm ci
BROWSER=chrome npm test      # or edge, or firefox
```

The tests run on the **current stable version** of each browser, downloaded by Selenium Manager, and never on the one that happens to be installed: on the CI runner that one is whatever the image of the day holds, and the Chrome of the runner even ignores `--load-extension`, so the extension would never be loaded. The CI sets `SE_FORCE_BROWSER_DOWNLOAD=true`; set it on your machine to test the same browsers as the CI. The version that ran is the first line of `tests/e2e/.diagnostics/<browser>/timeline.log`, and the CI keeps that folder as an artifact.

The extension aims at browsers that are recent and still maintained, as [browser-update.org](https://browser-update.org) counts them: Chrome and Firefox at most three versions behind the latest, Edge at most four (it also warns about versions with severe security problems). That is why the tests do not pin an old version: they follow the stable one, and a release that breaks the extension shows in the CI at once.

## Build the packages

```sh
npm run zip
npm run zip:firefox
```

The zips are written in `.output/`, named after the version in `package.json`. The Firefox one comes with the zip of the sources, which Mozilla asks for.

## Release

1. Set the version in `package.json` and write its section at the top of `CHANGELOG.md`: the CI checks that they match.
2. Merge `develop` into `main` with a pull request.
3. Tag `main` with the version, without `v` (`0.2.0`), signed. The tag publishes the release with the zips and their checksums.
