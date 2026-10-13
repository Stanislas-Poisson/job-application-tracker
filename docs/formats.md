# Formats

How the extension stores and shows what it keeps, so that a piece of information means the same everywhere. The rule is always the same: **store one canonical form, show it in the way of the user**.

## Time

| What | Stored as | Shown as |
| :--- | :--- | :--- |
| A moment (a message, a reminder, when an application was saved) | UTC, an ISO 8601 string that ends with `Z`: `2026-12-23T19:00:00.000Z` | In the time zone of the settings (the one of the browser by default), in the language of the settings. |
| A calendar date with no hour (the day an offer was published) | A plain date: `2026-12-24` | The same day for everybody. It is never turned into a moment, so no time zone can move it. |

The day an offer was published is read from a page by `postedDay` (see _Reading a page_ below): the **time zone of the user is the default** whenever the page does not say which one it uses.
| A time zone (of the user, of a contact) | A name of the IANA database: `Europe/Paris` | The name, and the time it is there now. |

The rules, in `src/utils/time.ts`:

- A moment is checked on the way in: a reminder with an offset (`+01:00`) or with no time zone is refused.
- A time typed in a form (`datetime-local`) is read in the time zone of the settings and turned into UTC.
- When the clocks go back, an hour happens twice: the first one is taken. When they go forward, an hour does not exist: the time is moved forward by the length of the jump.
- A page shows a date again when the language or the time zone changes, with no reload.

## Money

| What | Stored as | Shown as |
| :--- | :--- | :--- |
| An amount | An integer in the minor units of its currency (cents for the euro, nothing for the yen, three digits for the Kuwaiti dinar). | With the symbol, its place, the separators and the digits of the language: `€45,000`, `45 000 €`, `45.000 €`. |
| A currency | Its ISO 4217 code: `EUR`, `USD`, `JPY`. | The symbol by default, or the short symbol, the code or the name, as the user chose. The dollars of several countries are told apart where the language needs it (`CA$`, `A$`). |
| A salary | A range (`salaryMin`, `salaryMax`, either may be missing), a currency, a period (year, month, week, day, hour) and gross or net. | `€45,000 – €55,000 / year (gross)`, `from $90,000 / year`, `up to £400 / day`. |

The rules, in `src/utils/money.ts`:

- Nothing is stored as a decimal. A typed amount is read by its text, so that `1.005` does not become `1.00` through floating point.
- A salary needs a currency as soon as it has an amount. A lowest amount above the highest is refused.
- **Comparing** offers turns a salary into an amount per year, then into the home currency:
  - a month is 12, a week is 52, a day is the working days of a year (220 by default), an hour is the hours of a day (7 by default) times that. The user can change both numbers;
  - the rates are typed by the user, one unit of a currency in the home currency. A currency with no rate is not converted: it is not guessed;
  - an option, off by default, fetches the rates the user did not type from Frankfurter (the reference rates of the European Central Bank, no key, no cookie): once a day at most, for the home currency only, with an optional permission asked when the switch goes on. A rate typed by the user always wins, and if the service cannot be reached the last rates stay;
  - a range is compared by its middle, or by its one end when the other is missing.
- The converted amount is shown as "about", never in place of the amount of the offer.

## People

| What | Stored as | Shown as |
| :--- | :--- | :--- |
| A way to reach a person (an email, a phone number, a LinkedIn page, a website, other) | One record per way: its type, its value in the canonical form of the type, a label ("work"), and whether it is the main one of its type. | Grouped by type, the main one first, as a link (`mailto:`, `tel:`, the address). |
| A phone number | E.164: `+33612345678` | International (`+33 6 12 34 56 78`) by default, and as a `tel:` link. The national format is kept for later. |
| An email | Lower case: `ada@example.com` | As it is, as a `mailto:` link. |
| A LinkedIn page | The canonical address: `https://www.linkedin.com/in/ada-lovelace` | A link. `fr.linkedin.com/in/Ada-Lovelace/?trk=x` and `ada-lovelace` give the same address. |
| A country | ISO 3166-1 alpha-2: `FR` | Its name in the language of the user: France, Allemagne, Germany. |
| A time zone | IANA: `Europe/Paris` | "Local time there: 14:35 UTC+2". |
| A language | BCP 47: `fr-CA` | Its name in the language of the user. |

The rules, in `src/utils/contact.ts` and `src/services/contacts.ts`:

- A phone number typed without its country code is read in the country of the person, and when there is none in the **default country** of the options (the country of the language of the browser by default). A number that is not valid for that country is refused, with the message to add the code. Nothing is kept as typed.
- Every field is checked before anything is saved: one invalid field saves nothing and says which one.
- The phone numbers are checked with the metadata of libphonenumber (the "min" set), so a number that looks right but does not exist for its country is refused.

- A person has as many ways to be reached as needed. **One of each type is the main one**: the first that is added, or the one the user marks. The same value of the same type is kept once. Removing the main one gives its place to the oldest that is left.
- The email, the phone and the LinkedIn fields of the form are shortcuts: each becomes a way to reach the person, the main one of its type.

## Exchanges

An exchange is what was said with someone, kept as it was.

| What | Stored as |
| :--- | :--- |
| The channel | `email`, `linkedin`, `phone`, `sms`, `whatsapp`, `video`, `in_person` or `other`. |
| The direction | `inbound` (received) or `outbound` (sent). |
| When | A moment in UTC. The page reads what the user types in their time zone and converts it. |
| What | A subject, a text, or both: one of them is needed. The text is not rewritten. |
| With whom | A contact when the person is known, else the name or the address as the message gave it (`counterpart`). |
| Its identity | An external reference when the exchange comes from somewhere (the `Message-ID` of an email): an exchange that comes twice is kept once. |

The timeline of an application is the activities the extension recorded and the exchanges, in one list, the most recent first.

### Importing exchanges

An import never saves at once: it shows what it understood, and the user decides.

| Source | What is read |
| :--- | :--- |
| Pasted text | The text as the body. When it begins with email headers (`From:`, `Subject:`, `Date:`) it is read as an email. The channel, the direction and the date are chosen in the form. |
| An email file (`.eml`) | The sender, the recipients, the subject, the date, the `Message-ID`, and the text: folded headers, encoded words (`=?UTF-8?B?...?=`), quoted-printable and base64 bodies in their character set, multipart messages (the plain text, or the HTML turned into text), attachments ignored. |
| A JSON file | A list of exchanges, or an object with an `exchanges` list. |
| A CSV file | One exchange per row, with a header row. The separator is found (comma, semicolon, tab). |

The fields of a JSON record or a CSV column (the names are not case sensitive, a few spellings are accepted):

| Field | Meaning |
| :--- | :--- |
| `channel` | `email`, `linkedin`, `phone` (or `call`), `sms`, `whatsapp`, `video`, `meeting`, `other`. |
| `direction` | `received` / `inbound` / `in`, or `sent` / `outbound` / `out`. |
| `date` (or `occurredAt`, `when`) | With a zone (`2026-10-12T14:30:00Z`, `...+02:00`) it is read as it is. Without one (`2026-10-12 16:30`) it is a wall clock in the time zone of the user. A date alone is read at 09:00. |
| `subject`, `text` (or `body`) | At least one of them. |
| `email`, `contact`, `counterpart` | Who it was with. The email address finds the contact first, then the name. |
| `id` (or `externalRef`, `messageId`) | What identifies the exchange where it comes from. |
| `duration` | Minutes, for a call or a meeting. |

- A received email and a sent email are told apart by the addresses of the user (in the options). Without any, the direction is asked in the preview.
- A row with something wrong (no channel, no direction, a date that cannot be read, no subject and no text) is shown with the reason and cannot be imported until it is fixed. A missing date can be typed in the preview.
- An exchange is identified by its `Message-ID` or `id` for one application: importing the same file twice adds nothing the second time.

## Tags, favourites and priority

| What | Stored as |
| :--- | :--- |
| A tag | A name and a colour (`#rrggbb`). Two names that differ only by the case, the accents or the spaces around are one tag. |
| Putting a tag on something | A link record (`taggables`) with the tag, the id and the kind of the thing: `applications`, `companies`, `contacts` or `interactions`. A tag can be on many things, a thing can have many tags. |
| A favourite | A flag (`isFavorite`) on an application, a company or a contact. |
| A priority | A whole number on an application: 0 none, 1 low, 2 medium, 3 high. |

- The colour of a tag is a help to the eye: its name is always written, and a new tag takes the next colour of the palette of Okabe and Ito.
- Removing a tag removes the links that put it on things; the things stay. Deleting an application removes its links and those of its exchanges.

## The board

| What | How |
| :--- | :--- |
| Search | Case, accents and extra spaces do not matter (`Éléonore` finds `eleonore`). Every word has to be found, in any order, in the title, the company, the place, the source, the tags or the people of the application. |
| Filters | Tags (the application must have all of them), favourites, source, company, a lowest priority, applications with a late reminder, and archived or not. The summary says how many are shown out of how many. |
| Sort | By the order of the board (what the user dragged), the last change, the date added, the priority, the company, the job title, or the salary per year in the home currency. |
| Direction | `asc` is from the oldest, the lowest or A to Z; each sort starts the way a person wants it first (the newest, the most important and the best paid first, a name from A to Z). |
| Names | Compared with `Intl.Collator` in the language of the page: accents are not letters apart, and `Dev 2` comes before `Dev 10`. |
| What cannot be compared | An application without a salary, or whose currency has no rate, goes last whichever the direction. |
| The view | Kept in the browser, so the board opens as it was left. |

## Reading a page

When the popup opens on a page, the extension reads that page once and fills the form. The reading is in `src/extraction`: `page.ts` takes a snapshot of the page (the JSON-LD scripts, the meta tags, the title) and everything else works on that snapshot, so it is tested without a browser.

| What | Read from | Rule |
| :--- | :--- | :--- |
| Title, company | `title` and `hiringOrganization` of the `JobPosting` | The page title is the fallback for the title. |
| Place, country | `jobLocation.address` | "Locality, region, country". The country is kept only when it is a two-letter ISO code. |
| Contract | `employmentType` | As written, a list is joined. |
| Work mode | `jobLocationType` | `TELECOMMUTE` is remote. Nothing else is guessed. |
| Description | `description` | HTML is turned into text, with a line break where a block ends. |
| Salary | `baseSalary` | Minor units of the currency, the period from `unitText`. Gross or net is almost never said: it is left empty for the user. A salary without a valid currency is dropped. |
| Day published | `datePosted` | **A date with no hour is that day. A date with an hour and a time zone (`Z`, `+02:00`) is the day it is in the time zone of the user. A date with an hour and no time zone is read in the time zone of the user: the day written.** |

- When a page has no `JobPosting` data, or leaves a piece out, the OpenGraph tags and the title of the page fill the title (`og:title`, then the page title without the name of the site after a `|`) and the description (`og:description`, then `description`). The name of the site is never taken for the company.
- The data is found at the root of a script, in a list, or in an `@graph`. A script that is not valid JSON is skipped. The first `JobPosting` of the page is used.
- Checked on saved pages of APEC, Cadremploi, Free-Work, HelloWork, JobTeaser, Meteojob, Monster, Welcome to the Jungle and ZipRecruiter. What they showed, and how it is read:
  - `unitText` is written `YEAR`, `YEARLY`, `ANNUAL`, `MONTHLY`, `DAILY`…: all are understood.
  - Amounts come as numbers or as strings (`"80000.00"`), and an empty `QuantitativeValue` is no salary.
  - A site may also write the salary as text (`80 - 85 k€ brut annuel`): it is where gross or net is read from.
  - **A yearly salary under 1 000 (30 for 30 000) is left out**, because the site did not say it is in thousands, and a guess would be a wrong figure. A day rate is not checked this way.
  - The place is the first of the list. A country given as a code (`FR`) is kept apart and shown by its name; one given as a name stays in the text. A region equal to the city is not repeated.
  - The contract of schema.org (`FULL_TIME`, `CONTRACTOR`…) is written readably; the contract of a site (`CDI`) is kept as it is.
  - HTML entities left in a description (`&#233;`) are decoded.
  - **The currency is the one of the page**: a French offer on ZipRecruiter says `USD`. The extension does not correct it, the user can.
- Nothing is invented: a piece the page does not give stays empty, and the user can change every field before saving.
- **Report a reading that broke**: the popup has a link that opens a new issue on GitHub, filled with the host name of the site, the version of the extension, and which pieces were read and which were not. The user reads it and sends it by hand. The same report can be opened as an e-mail for someone with no GitHub account (GitHub cannot turn an e-mail into an issue; `REPORT_EMAIL` in `src/extraction/report.ts` is a placeholder until a dedicated address exists). The extension sends nothing, and the issue holds nothing of the offer (not the address, which may carry a name or a token).

### Sites with an adapter

Some sites publish no `JobPosting` data. For them the extension also takes the main part of the page (`<main>`, only for these sites) and an adapter reads it, in `src/extraction/adapters`. The order is: JobPosting data, then the adapter, then OpenGraph and the page title.

**LinkedIn** (`linkedin.com/jobs/…`, French and English interface). The class names of the site are generated and change, so the adapter relies on what stays:

| What | Read from |
| :--- | :--- |
| Title and company | The title of the tab: `Title \| Company \| LinkedIn`. |
| Place | The first part of the line under the title: `Place · Posted 3 days ago · …`. |
| Day published | The relative date of that line, counted back from today in the time zone of the user. |
| Salary | A salary written in the card of the offer only, never in the cards of the other offers around it. |
| Description | The block under the heading "About the job" / "À propos de l'offre d'emploi". |

- **A relative date is an approximation.** "3 days ago" is the day three days before today; a week is 7 days, a month 30, a year 365. A repost ("Republication") gives the day of the repost. The user can change the date.
- A salary text such as `40K € par yr - 60K € par yr`, `45 000 € - 55 000 €/an` or `$90,000/yr` is read as a range in minor units with its period. Gross or net is not guessed.
- Tests use `tests/fixtures`: a French page reduced from a real saved page (same structure, no class names, short text) and an English page written by hand. Saved pages stay out of the repository: they hold the account of the person who saved them.

## Backup

| What | How |
| :--- | :--- |
| The file | Plain, indented JSON: `app`, `schema`, `exportedAt`, `settings`, `data` (one list per model) and `checksum`. Open it with any editor. Named `job-application-tracker-2026-10-13.json`. |
| Where it is written | With the file system API (Chrome, Edge): the file is chosen once, the browser remembers it, and each backup overwrites it. When the browser refuses the permission or the file is gone, another file is asked for. Without the API (Firefox): a download. |
| Another file | "Back up to another file" lets the user pick a new one. |
| The settings | They are in the file and come back with an import. **There is no secret in them.** The cache of the exchange rates and the date of the last backup are left out: they belong to the browser. A setting that is not valid in a file edited by hand falls back on its default. |
| The reminder | The board shows a banner when the last backup is older than the number of days of the options (30 by default, 0 turns it off), if there is something to save. "Later" hides it until the page is opened again. |

- A user who closes the file picker cancels the backup: nothing is written and the date of the last backup does not change.
- An older file with no `settings` still imports: only the data comes back.
- Protecting the file with a passphrase, and merging the data of two computers, are other tickets.

### Restore

A restore is for a loss (a lost profile, a reinstall, a new computer): it **replaces** what is stored by the backup. It does not add to it. Merging the data of two computers is another process, with its own ticket, and it will have to warn about duplicates.

- The file is read and compared with what is stored, **before anything is applied**. For each kind of data the preview says how many records are in the backup, how many are new here, how many differ, how many are the same, and how many are **only here** (the restore removes them).
- A record of an older backup is read like a stored one (the fields it lacks get their defaults), so that only a real difference counts.
- The user applies the restore or cancels. Cancelling changes nothing. A file that is not a backup, or that comes from a newer version of the extension, says why and changes nothing.
- The settings come back with the data when the file has them.

## Versions of the structure

The structure of the data has a version of its own (`SCHEMA_VERSION`, in `src/persistence/schema.ts`), which has nothing to do with the version of the extension. It is kept in the storage (`jat:schema`) and in every backup file (`schema`). It is **2** now.

| Version | What changed |
| :--- | :--- |
| 1 | The first structure. Data written before the version was kept with it is read as version 1. |
| 2 | Every record has `updatedAt`, the moment of its last change (UTC, null when it was never stamped), and there is a `trash` for deleted records. |

- **Older data is brought up to date.** A migration turns the data of version N into the data of N + 1, one step at a time. It runs on the storage when a page opens (the result is saved with the new version) and on a backup file when it is read, so an old backup can still be restored. The preview says when a backup is old.
- **Newer data is left alone.** If the storage or a file was written by a newer structure than this version knows, nothing is read, nothing is written and nothing is replaced: a page says so, and a restore is refused. A version that makes no sense (0, a word, none in a file) is refused too.
- To change the structure: add a function to `MIGRATIONS`, raise `SCHEMA_VERSION`, and test it with data of the old version.

### The moment of the last change

The persistence puts `updatedAt` on a record when it is saved after a change, and on a new one. A record that did not change keeps its moment, and a moment set by the caller is kept (an import brings the moments of its backup).

### The trash

A record that is deleted (an application and what goes with it, a contact, a tag…) is copied to the trash with `deletedAt`, and removed from the data as before: nothing else in the code has to know about it. The trash is kept **30 days** and then purged on its own.

- The options list it, grouped by what was deleted together (an application with its notes comes back together), with "Put back" and "Empty the trash". What comes back is stamped with the moment it comes back.
- The records a restore removes go to the trash too.
- "Delete everything" leaves nothing behind, the trash included.
- It is part of the backup, and tells a merge of two computers (see the merge ticket) a deletion from a record that is missing.

### Checksum

A backup carries `checksum`: `sha256:` and the SHA-256 of the **canonical form** of the file (the keys of every object in order, on one line, without the checksum itself). Reading the file in an editor and saving it again with another indentation or order of keys does not break it; a changed value, a record added or a cut-off file does.

- A restore checks it and says so in the preview: it **matches**, it is **absent** (an older backup: nothing tells whether it was changed), or it **does not match**. A file that does not match is not refused: the button stays off until the user ticks that they know it was changed and want it anyway (they may have edited it on purpose).
- It catches an edit or damage that nobody meant. It is **not** a protection against a change made on purpose, because whoever changes the file can compute it again. A backup protected by a passphrase is authenticated by its encryption (see the ticket of the passphrase).
