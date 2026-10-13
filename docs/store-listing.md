# Store listings

The texts, the images and the answers to the questions of the stores. The name and the description of the package itself are in
`public/_locales/<language>/messages.json`.

## Name and categories

- **Name:** Job Application Tracker
- **Short name:** Job Tracker
- **Category:** Chrome Web Store: Productivity. Edge: Productivity. Firefox: Organizer (and the tag "job search").
- **Languages of the listing:** English (default), French, Spanish, German, Italian, Portuguese (Portugal), Dutch and Arabic.

## Short description (132 characters at most)

- **English:** Keeps the job offers you saw and follows each application. Everything stays in your browser.
- **French:** Garde les offres d’emploi que vous avez vues et suit chaque candidature. Tout reste dans votre navigateur.

## Long description

### English

Keep every job offer you find, and follow each application from the first look to the answer.

- **Save an offer from the page you are on.** Open the extension on an offer: the title, the company, the place, the salary and the
  date are read from the page, and you check them before saving.
- **A board with a column for each step.** To apply, applied, follow-up, interview, offer, rejected, or your own columns. Drag a card to
  move it.
- **Notes, contacts, reminders and a timeline** for every application. A reminder can show a number on the icon and a notification.
- **Companies, contacts and tags**, with phone numbers and addresses kept in a clean form.
- **Salary and pay tools.** Compare offers in your currency, with the net pay estimated for a country.
- **Addresses and journeys.** Keep the address of the workplace, open it in the map service you choose, and keep the journeys you
  found (on foot, bus, train, metro…) with the total time.
- **Your data is yours.** Everything stays in your browser. Back it up to a file (protected by a passphrase if you want), restore it,
  or bring the data of two computers together.
- **Made for everyone.** Light, dark, colour-blind and high-contrast looks, your own colours, text from 80% to 200%, English and French.

No account, no server, no tracking. The source code is public.

### Français

Gardez chaque offre d’emploi trouvée, et suivez chaque candidature du premier regard à la réponse.

- **Enregistrez une offre depuis la page où vous êtes.** Ouvrez l’extension sur une offre : le titre, l’entreprise, le lieu, le salaire
  et la date sont lus dans la page, et vous les vérifiez avant d’enregistrer.
- **Un tableau avec une colonne par étape.** À postuler, postulé, relance, entretien, offre, refusé, ou vos propres colonnes. Glissez
  une carte pour la déplacer.
- **Notes, contacts, rappels et historique** pour chaque candidature. Un rappel peut afficher un nombre sur l’icône et une notification.
- **Entreprises, contacts et étiquettes**, avec des numéros de téléphone et des adresses rangés proprement.
- **Salaire et outils de paie.** Comparez les offres dans votre monnaie, avec le net estimé pour un pays.
- **Adresses et trajets.** Gardez l’adresse du lieu de travail, ouvrez-la dans le service de cartes de votre choix, et gardez les
  trajets trouvés (à pied, bus, train, métro…) avec la durée totale.
- **Vos données sont à vous.** Tout reste dans votre navigateur. Sauvegardez dans un fichier (protégé par une phrase secrète si vous
  voulez), restaurez, ou rassemblez les données de deux ordinateurs.
- **Pour tout le monde.** Apparences claire, sombre, daltonisme et contraste élevé, vos propres couleurs, texte de 80 % à 200 %,
  anglais et français.

Sans compte, sans serveur, sans suivi. Le code source est public.

## Single purpose (Chrome Web Store)

Keeps the job offers the user saves and tracks the progress of each application, in the browser.

## Justification of each permission

| Permission | Justification |
| :--- | :--- |
| `storage` | Keeps the offers, the applications and the settings of the user in the browser. |
| `activeTab` | Reaches the tab the user is on, only when the user opens the extension on it, to read the offer. |
| `scripting` | Reads that one tab at that moment (title, address, the offer data the page publishes) to fill the form. Nothing is read in the background. |
| `alarms` | Wakes the extension when a reminder comes due. |
| `notifications` (optional) | Asked only when the user turns the notifications of the reminders on. |
| `https://api.frankfurter.dev/*` (optional) | Asked only when the user turns the automatic exchange rates on. The request names the home currency and nothing else. |

No remote code. No data is collected, sold, transferred or used for anything but the purpose of the extension: the answers to the
"data usage" questions are **none collected**, and the three certifications are true. The privacy policy is `PRIVACY.md`, public at
`https://github.com/Stanislas-Poisson/job-application-tracker/blob/main/PRIVACY.md`.

Firefox: `data_collection_permissions` is `none` (already in the manifest).

## Images

The pictures are made by two scripts, from invented data (no real company, person or offer):

- `python3 store/make-graphics.py` draws the logo (`store/graphics/logo-128.png`, `300`, `512`) and the promotional tiles
  (`promo-small-*-440x280.png` for Chrome, `promo-marquee-*-1400x560.png` for the Chrome marquee).
- `npm run zip`, then `node tests/e2e/store-screenshots.mjs` (from `tests/e2e`) takes the screenshots at 1280 x 800 in
  `store/screenshots/en` and `store/screenshots/fr`, in the light and dark looks: `1-board`, `2-application`, `3-options`.

| Store | Icon | Screenshots | Tiles |
| :--- | :--- | :--- | :--- |
| Chrome Web Store | 128 x 128 (in the package) | 1 to 5, 1280 x 800 | Small 440 x 280 (needed), marquee 1400 x 560 (optional) |
| Microsoft Edge Add-ons | 300 x 300 (`logo-300.png`) | up to 10, 1280 x 800 | Small 440 x 280 (optional) |
| Firefox Add-ons | 128 x 128 (in the package) | at least 1 | none |

Suggested order for the screenshots: the board, an application with its details, the options (appearance). Use the pictures of the
language of the listing.
