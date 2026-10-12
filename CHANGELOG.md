# Changelog

## 0.1.0 - 2026-10-12

- First version: the popup to save an offer, the board with a column per status, and the options (language, columns, export and import).
- The data is split in ten models (company, source, offer, application, status, contact, notes, timeline, reminders) and kept in `chrome.storage.local`, shared by the pages.
- English and French.
- Appearance: light, dark or the theme of the system, seven accent colours, two colour-blind modes (red-green, blue-yellow) that use the palette of Okabe and Ito and give each column a shape, and a high-contrast mode. The choice applies to every page at once.
- Time: every moment is stored in UTC and shown in the time zone chosen in the options (the one of the browser by default); a reminder is typed in that time zone. The day an offer was published is a plain date that no time zone can move. See `docs/formats.md`.
- Money: a salary is a range with its currency, its period and gross or net, kept in minor units and shown with the format of the currency and of the language (symbol, code or name). The salaries are compared per year in a home currency with the rates the user types. The columns can be renamed again (the name field did not save).
- Contacts: a phone number is kept in the international format (E.164) and shown as such, or in the national format; the email in lower case; the LinkedIn page as its canonical address; the country as an ISO code, shown by its name; the time zone and the languages of the person, with the time it is there. A phone typed without a country code is read in the country of the person or in the default country of the options.
