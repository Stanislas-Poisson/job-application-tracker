# Formats

How the extension stores and shows what it keeps, so that a piece of information means the same everywhere. The rule is always the same: **store one canonical form, show it in the way of the user**.

## Time

| What | Stored as | Shown as |
| :--- | :--- | :--- |
| A moment (a message, a reminder, when an application was saved) | UTC, an ISO 8601 string that ends with `Z`: `2026-12-23T19:00:00.000Z` | In the time zone of the settings (the one of the browser by default), in the language of the settings. |
| A calendar date with no hour (the day an offer was published) | A plain date: `2026-12-24` | The same day for everybody. It is never turned into a moment, so no time zone can move it. |
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
  - the rates are typed by the user, one unit of a currency in the home currency. The extension never looks a rate up, and a currency with no rate is not converted: it is not guessed;
  - a range is compared by its middle, or by its one end when the other is missing.
- The converted amount is shown as "about", never in place of the amount of the offer.

## People

| What | Stored as | Shown as |
| :--- | :--- | :--- |
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
