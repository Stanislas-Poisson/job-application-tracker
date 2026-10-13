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
**Talent.com** (`/view` pages). No JobPosting data, but a title that follows a pattern, so this adapter reads only the title and the tags of the page (the body is not taken): the title and the company from `Title – Company – Job offer …`, and the place from the parentheses of `Company recrute (Place)` in the description. The salary and the date are not read: the page does not give them in a form that stays the same.

**Codeur.com** is not given an adapter: its pages are requests for a quote for a project, with no employer and no job offer; the generic reading (the title and the description) is all there is.

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

The structure of the data has a version of its own (`SCHEMA_VERSION`, in `src/persistence/schema.ts`), which has nothing to do with the version of the extension. It is kept in the storage (`jat:schema`) and in every backup file (`schema`). It is **9** now.

| Version | What changed |
| :--- | :--- |
| 1 | The first structure. Data written before the version was kept with it is read as version 1. |
| 2 | Every record has `updatedAt`, the moment of its last change (UTC, null when it was never stamped), and there is a `trash` for deleted records. |
| 3 | Companies can be tied to one another (`companyRelations`). |
| 4 | A person can work for several companies (`contactCompanies`). The company a contact had becomes a first link. |
| 5 | Pay profiles to estimate the net pay (`payProfiles`). |
| 6 | An offer has the address of its workplace and the way there (`address`, `commuteMeters`, `commuteMinutes`, `commuteMode`). |
| 9 | A column (`statuses`) and a tag (`tags`) have a `symbol` (one character, or null). |
| 8 | The way to work is a list of journeys in legs (`journeys`); the distance, the time and the means kept in an offer become a journey of one leg. |
| 7 | The address is in fields (lines 1 to 3, postal code, city, region, position). The line that was kept becomes the first line; nothing is guessed from it. |

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

### Protecting a backup with a passphrase

A switch in the options ("Protect the backups with a passphrase") encrypts the backup in the browser before it is written. It is offered, never forced.

The protected file is still JSON, with a small readable header, so that the way of encrypting can change later without losing the old files:

```json
{
  "app": "job-application-tracker",
  "format": "encrypted",
  "version": 1,
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "…" },
  "cipher": { "name": "AES-GCM", "iv": "…" },
  "data": "…"
}
```

- **Key:** PBKDF2 with SHA-256, 600 000 iterations (what OWASP advises) and a random salt of 16 bytes, giving a 256-bit key. The passphrase is normalised (NFKC), so `é` typed with one key or two is the same passphrase.
- **Encryption:** AES-GCM with a random 12-byte nonce, on the whole backup (its checksum included). GCM also authenticates: **a changed byte, a changed header or a wrong passphrase makes the decryption fail**, and the header is part of what is authenticated. The two causes cannot be told apart, and are not.
- **A file cannot ask for anything:** a header with fewer than 100 000 or more than 5 000 000 iterations, another algorithm or a newer version is refused before anything is computed, so a file cannot make the browser compute for hours or use a weak derivation.
- **The passphrase is never kept.** It is typed twice when set, with the warning that a lost passphrase cannot be recovered, by anyone. It stays in the memory of the page until it is closed, and is asked again in the next page. What is kept in the settings is only a **check**: a known text encrypted with the passphrase, to tell whether a passphrase typed later is the one that was set, so that a typing mistake does not produce a backup nobody can open. It is no easier to attack than a backup file.
- A protected backup is named `…-2026-10-13.protected.json`. Restoring one asks for the passphrase first; a wrong passphrase, or a file that was changed, fails and changes nothing. Once opened it goes through the same preview and checksum as any backup.
- Turning the switch off forgets the check and the passphrase of the page. The backups already written keep the passphrase they were written with.
- A format test opens a file written once with fixed values: if it cannot be opened any more, a backup somebody kept could not be either.

## When changes are written

**Every change is written at once**: a creation, a change, a deletion, a move, a setting, the view of the board. There is no "save" to forget and no delay to wait for. The persistence writes at the end of the turn of the event loop in which the change was made, so what one action changes (an application with its offer, its company and its history) goes out in one write, and nothing depends on a timer that a closing page could cut short. A page that is closed also writes whatever is still waiting.

A screen that must say "saved" waits for the write (`persistence.flush()`), but no action needs it to be safe.

### Text that was typed and not saved

Data is written as soon as it changes, so the only thing a closing page can lose is **text typed and never sent**. Forms say when they hold some (`useDirtyGuard`, in `src/composables/useDirty.ts`), and the pages use it:

- **The form of the offer** compares itself with what is stored: it shows "Unsaved changes" and enables "Save" only when there is something to save. After a save it shows what was stored (trimmed, the amounts written back), so it is clean again.
- **The forms that add something** (a note, a reminder, a tag, a contact, a way to reach one, an exchange, a pasted email) are unsaved while their text field holds something.
- **The drawer** asks before it is closed (Escape, the close button, a click outside) while any form is unsaved, and stays open if the user declines.
- **The browser** asks before the board or the options page is closed while any form is unsaved. A popup cannot be asked, so:
- **The popup keeps a draft** of what is typed (`jat:draft`), as it is typed, and gives it back when it is opened again on **the same page**. A draft of another page is not given back, so that two offers are never mixed, and a draft older than 7 days is dropped. Saving the offer clears it.

## Reminders

A reminder is a title and a moment (`dueAt`, UTC, typed in the time zone of the settings), done or not (`doneAt`).

### Suggesting a follow-up

Once the user has applied (`appliedAt` is set when an application reaches the "Applied" column), the drawer of the application **suggests a reminder to follow up**: "You applied: follow up 7 days later, on Oct 20, 9:00 AM?", with a button to add it. **Nothing is added until the user accepts.**

- The delay is a setting (`followUpDays`, 7 by default, from 1 to 60). The reminder is set for **9 in the morning in the time zone of the user**, so it follows the clocks going back or forward.
- It is not offered for an application that is archived, at the end of its road (a final column, such as an offer or a refusal), that the user has not applied to, or that has a reminder waiting already. It comes back once that reminder is done.
- The form to add a reminder by hand starts from the same delay.

### Telling the user when a reminder is due

A background of the extension (`src/entrypoints/background.ts`, with its logic in `src/background/reminders.ts` and `src/services/reminderDue.ts`) looks at the reminders and does two things. It reads the stored data and writes none of it.

- **The number on the icon** is how many reminders are due and not done. It is there with or without notifications, needs no permission, and goes down when a reminder is done. It is capped at 99. A reminder of an archived or finished application is not counted.
- **A notification**, only when the user turned it on in the options. It is made by the system of the user (the notification centre of Windows, macOS or Linux, through the browser), written in the language and the time zone of the settings: the title, the offer and the company, and the moment. A click opens the board on the application, in the tab that is open already if there is one.

How it keeps to the point:

- **Once each.** The reminders already told about are kept apart (`jat:notified`), so a reminder is told about once, however many times the background looks. One that is done is forgotten: ticked, then unticked, it is told about again.
- **Right on time, and later if needed.** An alarm is set for the next moment a reminder is due, and another one looks every 15 minutes. A reminder that came due while the browser was shut is told about when it opens, once.
- **Not a pile.** When more than three come due together (after days away), one notification tells about all of them, with the first few, and opens the board.
- **An alert, if wanted.** By default a notification stays on screen until the user closes it (Chrome and Edge; Firefox does not know the option, so it does not get it). A setting turns that off.
- **The permission is optional.** `notifications` is asked when the switch goes on, and given back when it goes off. If the browser refuses, the switch stays off and says why. If it is taken back later, the reminders that could not be shown are not marked, and are tried again.
- Data written by a newer structure than the extension knows is left alone.

## Exporting the board

"Export (CSV)" in the header of the board writes **the applications that are shown**, in the order they are shown (the search, the filters, the sort and the archive switch apply), as a file for a spreadsheet: `job-application-tracker-board-2026-10-13.csv`.

- **One line per application, and a head** in the language of the page. The columns: status, job title, company, place, country, contract, work mode, source, address, the day published, the salary as the offer states it (from, up to, currency, period, gross or net), the home currency and **the salary per year in the home currency**, when the rates allow it, the moments of application, creation and last change, priority, favourite, tags, contacts, how many reminders are waiting and the next one, and archived.
- **Moments are in UTC**, as they are stored (`2026-10-13T08:00:00.000Z`); the day an offer was published is a plain date. Amounts are plain numbers a spreadsheet can compute with, with the digits of their currency, and no sign or group separator.
- **The separator follows the language.** A comma, with a decimal point (`45000.50`); in French a semicolon, with a decimal comma (`45000,50`), which is what the spreadsheets of those countries read. The file starts with the mark of UTF-8, so that accents are read as such.
- **Nothing runs as a formula.** A text that starts with `=`, `+`, `-` or `@` (an offer called `=HYPERLINK(...)`) would be run by a spreadsheet on the machine of whoever opens the file: such a text gets a quote in front and stays text.
- The file is read back by the CSV reader of the imports.

## Companies tied to one another

A company can be tied to another: a **recruitment firm** that hires for a **final client**, or a **subsidiary** and its parent. A relation is a record of its own (`CompanyRelation`: `fromId`, `toId`, `kind`), so a company keeps its own record whatever it is tied to.

| Kind (stored) | Told from the first company | Told from the second one |
| :--- | :--- | :--- |
| `recruits_for` | "Recruits for X" | "Is recruited by X" |
| `subsidiary_of` | "Subsidiary of X" | "Parent of X" |

Only these two kinds are stored, each in one direction; "parent of" is the opposite of "subsidiary of" and is not stored a second time, so the two cannot contradict each other.

- **Where it shows.** The drawer of an application has a section for the company of its offer, with its links, to add or remove. The **card** tells who the offer is really for (`Hire Co → Big Bank`), the **search** finds an offer by any company it is tied to, and the **export** has a column for the final clients.
- **How it is added.** By the name of the other company, found whatever its case, or made when it is new. The four ways to say it ("recruits for", "is recruited by", "subsidiary of", "parent of") are stored in the right direction.
- **What is refused.** A company tied to itself, the same link twice, a kind nobody knows, and a link that would **close a circle** (A is a subsidiary of B, B of C, then C of A). Nothing is made when the link is refused: a new company is not left behind.

## People, companies and applications

A person is tied to **companies** and to **applications**, from either side.

- **Companies.** A person can work, or have worked, for several companies, one after the other or at the same time (a recruiter in two firms). Each is a link (`ContactCompany`) with the company, the **title** they have there, and a **period**: the first and the last day, as plain dates, both optional. No last day means it goes on. The company is given by its name, found whatever its case, or made when it is new.
- **The main company.** `Contact.companyId` is kept as the person's main company, in step with the links after every change: the one they work for now (the latest start first), or, when they left them all, the one they left last, or none. It is what the rest of the extension has always read.
- **What is refused.** No name, a date that is not a date, a last day before the first, and the same company from the same first day twice. Nothing is made when a link is refused.
- **Applications.** A person is linked to as many applications as needed, with the part they play (recruiter, interviewer…). In the drawer of an application the contacts section links a person who is known already to another application, and shows from the person every application they are tied to. Unlinking takes one link off and keeps the person.
- **Meeting a person adds the first link**: the company of the offer, with the title typed for the person.

## Estimating the net pay

The net pay depends on the country, the year, the status and the person. The extension does not hold those rules: **a pay profile is data the user owns and edits**, and it only ever gives an **estimate**, shown as one ("About 3 200 net per month"), never in place of the pay of the offer.

### A profile

A name, a country, a status (executive, freelance…), a currency and a list of **lines**, taken in order. A line says:

| Field | Meaning |
| :--- | :--- |
| Label | What is taken ("Employee contributions"). |
| Applies to | `gross`: the gross pay of the year; `running`: what is left after the lines before it (a tax taken after the contributions). |
| Share | The part of that base the line applies to, in percent (all of it when empty). A tax taken on 90% of the pay after a flat deduction, for instance. |
| Taken as | A flat **rate** (a percentage), or a **scale** (progressive brackets). |

A scale is one slice per line, written `limit rate`: `11497 0`, `29315 11`, `∞ 45`. Each slice of the base up to its limit (per year) is taken at its own percentage; the last slice has no limit (`∞`, `inf`, `*` or nothing). The limits go up. A rate is a number from 0 to 100. A profile that breaks these is refused and nothing is saved.

### How it is computed

The salary of the offer is turned into a pay per year (a day is the working days of the year, an hour the hours of a day: the same assumptions as for comparing offers), then the profile is applied to **each end of the range**. Each line is rounded to the minor unit of the currency and the net is the gross less the rounded lines, so that what is shown adds up to the cent.

### When there is no estimate

It is not made when it would be a guess, and the drawer says why: no profile chosen (nothing is shown), no period for the pay, a pay that is **net already**, or an offer whose currency is not the one of the profile (the amounts of a profile are in its own currency). A pay that does not say gross or net is taken for gross, and it says so.

### Examples

A few profiles can be added and edited: France (employee, executive or not; freelance under the micro regime) and a flat rate. **They are illustrations, not rules**: the rates and the scales change every year and depend on the person (family, region, options). Check them against an official simulator before relying on them. The scale of the example is the one of the income of 2024 for a single person with one part, as a model of the shape.

### Where it shows

The drawer of an application has the estimate of the profile chosen in the options, with the calculation line by line on request. The CSV export has the net per year (the middle of the range) and the name of the profile.

## Freelance day rate

A helper in the options, for a freelance: from the **income wanted** it finds the **day rate** to ask, or from a **day rate** it shows what is left. It uses the same pay profiles as the net pay (see above), so the charges are whatever the user wrote for their country and regime: a flat rate, or a scale.

- **Inputs.** The days billed in the year (200 by default: fewer than the days worked), the hours of a day, the costs of the year, and the income wanted (or the day rate). The charges come from a profile, or from a flat rate typed in percent.
- **What the charges apply to** is the user's choice, because it changes the answer: **the turnover** (a micro-enterprise: the costs cannot be deducted) or **the profit** (the turnover less the costs).
- **How it is found.** A profile can be a scale, which has no formula to turn round, so the search is made the other way: the **smallest turnover whose net is enough** is found by halving, then divided by the days billed (day rate) and by the days and hours (hourly rate), rounded up so that the net is kept. The net never goes down when the turnover goes up, which is what makes the search sound.
- **What it shows.** The day and hourly rates, the turnover, the costs and each line of the charges, and what is left, per year and per month.
- **When it cannot be done.** If the charges take everything above some level (a rate of 100%), no turnover leaves the income, and it says so.
- **An estimate.** It does not count the VAT, nor the days without a mission. Like the net pay of an employee, it is never a promise.

### The journal of the persistence

Each page keeps in memory the last 80 things its persistence did: what it **wrote** (the kind of data, a short fingerprint of the state, and for the applications their priorities and favourites) and what it **read** back from the storage, with whether it recognised it as its own write or as the write of another page (`FOREIGN`). It holds no data, only counts and fingerprints. It is `window.__jat.events` of a page, and the browser tests print it when two pages disagree, to find out which one put an old state back.

## The address of an offer, and the map

An offer can keep the **postal address of its workplace** and a link to open it in the map service the user chooses. The user searches there, then keeps in the offer what they found. **The extension asks nothing of any map service.**

### The address in fields

Address lines 1 to 3, postal code, city, region, country (an ISO code, the same field as the country of the offer), and the **position** on a map (latitude and longitude), all optional. The same fields hold the address the user leaves from (in the settings).

- **From the page, or from the user.** When a page gives the address split (schema.org `PostalAddress`, with its `geo`), the fields are filled from it as they are. When it does not, the user types them. **Nothing is guessed from a free text**: the formats of addresses differ too much from one country to the next for a guess not to be wrong.
- **The position** comes from the page (`geo`) or is pasted by the user from a map (`47.3941, 0.6848`, `47,3941; 0,6848`, two numbers; a latitude within 90, a longitude within 180). The extension looks nothing up.
- **A country is a code of two letters, exactly** (`FR`). A country given by a page as a name ("France", "Allemagne") is turned into its code when it is one; a name is never cut short into a code.
- **On one line**, for a map service, in the order of the country: the postal code before the city in France, Germany, Spain…; after it in the United Kingdom and Ireland; the region between in the United States, Canada and Australia. What is missing is left out, and the postal code and the city are not said twice when a line already holds them (a page may give the whole address as its street). The country is written in the language of the page.
- Where there is no postal address, the place the offer names (the city as the offer says it) is what is shown on the map.

### The links

- They are built from the address and opened in a new tab (`noopener noreferrer`) when the user clicks: **Show on the map** and **Route from home**. Nothing is sent before the click, and then only the addresses (or positions), to the service chosen. The links are built from what is typed, saved or not.
- **The service** is a setting: Google Maps, OpenStreetMap, Apple Maps, or a link of the user's own (`https://…` with `{to}` or `{query}`; `{from}` for a route; `{lat}`, `{lon}`, `{fromLat}`, `{fromLon}`, `{toLat}`, `{toLon}` for positions). Google and Apple take the address as text, or a position when there is no address.
- **OpenStreetMap makes a route only from positions**: with the position of both ends it opens the route (by car, bicycle or on foot); without them it only shows the place, and the page says what is missing. **It has no route for public transport**, and says so. A link of the user's own that has no `{from}` shows the place only.
- **The start** of a route is the home address of the settings. It stays in the browser with the other settings and the backups, and never goes into the CSV export. How the user usually travels is a setting too, and can be changed for an offer.

### Journeys to work

An offer keeps any number of **journeys**, each a list of **legs** found by the user on a map: for instance, from Tours to Bussy-Saint-Georges, on foot 10 min, bus 12 25 min, train TER 1 h02, metro 14 20 min, RER A 18 min, on foot 8 min, **2 h23 in all**.

- A leg has a means (on foot, bicycle, car, bus, tram, metro, train, suburban train such as the RER, public transport, ferry, waiting, other), an optional line or operator (60 characters at most), a **whole number of minutes** (0 to 24 hours) and an optional distance in metres (written in kilometres). **The total is the sum of the legs**, waiting included; the distance in total is the sum of the distances given.
- A journey is **outbound** or **return**, with an optional name. **Adding the way back** makes the same legs in the reverse order. A journey of more than 24 hours, no leg, an unknown means or a time that is not whole is refused, and nothing is kept.
- **One journey per direction is the preferred one** (the first one made; the user can change it; when it is deleted the shortest takes its place). The card shows the time of the preferred outbound journey, and the CSV has its time, its distance, the journey in words and the time of the preferred way back.
- **No time or distance is computed by the extension**: it would need a service to find the way. The user does the search on the map and keeps the result.
- Stored in `journeys` (`id`, `updatedAt`, `jobOfferId`, `direction`, `name`, `preferred`, `legs`). Before structure version 8 the distance, time and means kept in an offer are turned into a journey of one leg (`jy_<offer id>`), the preferred outbound one.

## Bringing two computers together

A process of its own, different from the restore: the restore replaces what is stored after a loss, the merge **adds** the data of another computer's backup to the data stored here. Nothing is deleted.

- **A preview** shows, per kind of data, what is in the file, what would be added, what would be replaced by a more recent version, what is kept as it is here and what is the same. The user must accept the risk of duplicates before it can be applied. The settings are not merged.
- **A record on both sides** (same id) keeps its most recent version, by `updatedAt` (UTC); a record never stamped is the oldest, and on a tie the one stored here stays.
- **The default columns and sources** (`status_<key>`, `source_<key>`, but with a random id in older installs) are matched by their `key`, not doubled, and the applications, activities and offers of the file that point to them follow.
- **A deletion is not a record that is missing.** What was deleted here (it is in the trash) is not brought back from the file. What was deleted on the other computer is not deleted here: the trash of the file is not merged.
- **Duplicates are possible**: a company, contact or tag created on both computers has two ids, so it is there twice. The preview counts the likely ones (same company name, same contact name, same address of an offer) and the user merges them by hand.

## Text appearance

Settings, kept with the others and in the backups: `fontFamily` (`system`, `serif`, `monospace` as `mono`, `custom`), `fontCustom` (the name of a font installed on the computer, letters, digits, spaces, dots, dashes and underscores only, 100 characters at most, so that it cannot break out of a style), `textScale` (80, 90, 100, 110, 125, 150, 175 or 200, in percent of the usual size, written on the root so every size in `rem` follows), `textSpacing` (`default`, `wide`, `wcag` for line height 1.5, letters 0.12 em and words 0.16 em, `widest`), `density` (`comfortable`, `compact`) and `motion` (`auto` follows the system, `reduce` forces it). The chosen font is always followed by the system fonts so that every script keeps a font that has its letters. No font is shipped: the fonts made for easier reading are used when installed, by name.

## The symbol of a column or a tag

`symbol` on `statuses` and `tags`: one character (a letter, a sign, an emoji; a sequence such as a flag or a joined emoji counts as one; 16 UTF-16 units at most) or null. What is typed after the first character is dropped. It is shown in front of the name, hidden from screen readers (the name is the text that is read). When it is none, or when the fonts of the computer cannot draw it, the default shape of the colour-blind modes is shown (nothing in the standard mode).

## Languages

`src/languages.ts` describes each language: its code, its name in its own language, its direction (`ltr` or `rtl`) and its script (ISO 15924). The page writes `lang` and `dir` on its root element from the language in use (the setting, or the language of the browser when it is one the extension has, else English). Names, notes and text typed by the user carry `dir="auto"` so that a name in another script keeps its order. Adding a language is one line in the table and one file of texts.

## Right-to-left and vertical writing

The style sheets say sides as start and end, block and inline (`margin-inline-start`, `border-block-end`, `text-align: start`), never left, right, top or bottom. Stylelint refuses the physical properties (`property-disallowed-list`). With `dir="rtl"` on the root the columns of the board are mirrored; the pages are checked in e2e for a side overflow from right to left.

## Typed text: storing, comparing, searching, sorting

- **Stored** in one form of Unicode (NFC) for the names of companies and tags.
- **Compared** without the case, the accents or the spaces around (`fold`): "Société Générale" and "societe generale" are the same company, "Résumé" and "resume" the same tag. The search of the board uses the same folding.
- **Sorted** with `Intl.Collator` of the language in use: accents and case do not decide the order, numbers are ordered by their value, and each language has its own order ("ä" after "z" in Swedish).
- **Searched**: words are cut at the spaces; in Chinese, Japanese, Thai, Lao, Khmer and Burmese, which put no space between words, the search is cut with `Intl.Segmenter` where the browser has it.
