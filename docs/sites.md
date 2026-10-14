# The job sites the extension reads

For each site, one page of an offer is kept as a **fixture**: the structure the site publishes, with placeholders in place of the
words of the offer, and what the extension reads from it. The test suite reads every fixture and compares. When a site changes how
it publishes its offers, the reading may stop finding a field: the command below says which one, and rewrites the fixture.

| Site | How it is read | Fixture |
| :--- | :--- | :--- |
| APEC, Cadremploi, Free-Work, HelloWork, Indeed, JobTeaser, Meteojob, Monster, Welcome to the Jungle, WeLoveDevs, ZipRecruiter | The `JobPosting` data of the page (JSON-LD) | `tests/fixtures/sites/<site>/` |
| LinkedIn | Adapter: the tab, the line under the title, the "About the job" block | `tests/fixtures/linkedin/` |
| Glassdoor | Adapter: the `data-test` attributes of the header of the open offer | `tests/fixtures/glassdoor/` |
| France Travail | Adapter: the tab and the description tag, and the shadow DOM of the offer component | `tests/unit/adapters.test.ts` |
| Talent.com | Adapter: the tab and the tags | `tests/unit/adapters.test.ts` |

## What a fixture holds

`snapshot.json` is the page as the extension takes it (`collectSnapshot`): the address, the tab, the JSON-LD and the tags it reads.
The words of the offer are replaced: the title, the company, the description, the links, the street and the identifiers. The numbers,
the dates, the contract type, the pay and the cities stay, since they are the structure and the facts the reading must find.
`expected.json` is what the extension reads from it.

## When a site changes

Save a page of an offer of that site (the page of **one** offer, with its text shown), then:

```sh
PAGE="/path/to/the/saved/page.html" SITE=indeed URL="https://fr.indeed.com/viewjob?jk=x" npx vitest run tests/unit/sitePages.test.ts
```

- It fails and lists the fields the reading used to find and does not any more (or new ones): the site changed. Fix the reading
  (`src/extraction/`), then make the fixture again.
- `WRITE=1` in front of the command rewrites `snapshot.json` and `expected.json` from the page. Read the diff before committing:
  nothing of the words of the offer must be in it.

A saved page itself is never committed: it holds the whole text of an offer, and often more.

## What is read besides the page

After the reading of the site, the pay is completed (`src/extraction/salaryGuess.ts`):

- **Gross or net and the period** are taken from the words next to **the same amount** in the text of the offer ("40 k€ brut
  annuel"), within the same sentence. A word next to another amount is not used.
- **A period that nobody says** is a year, unless the figure can only be something else: a month for a plain figure of 1 000 to
  12 000 in euros, pounds or francs (3000 € is a month, 40 000 € is a year), an hour below 100. 40 000 $ is a year too, since
  nothing tells otherwise. The user can correct it in the form.
