# Backing up to a cloud drive, and keeping it free

## Can the extension use the account the user is already signed in to?

No, not by itself. A browser that is signed in to Google, Microsoft or Dropbox does not give an extension access to the drive of
that account. To read or write a file in a drive, **the extension must be an application registered with the provider**, and the
user must allow it once in a sign-in window of the provider. What the extension holds afterwards is a token for its own folder,
not the password and not the session of the browser.

This is true for the three providers, and for the three browsers. Only the way the sign-in window is opened differs:
`browser.identity.launchWebAuthFlow` works in Chrome, Edge and Firefox. (`chrome.identity.getAuthToken` is Chrome only, and needs the
user to be signed in to Chrome itself: it is not used.)

## It costs nothing to register

| Provider | What to register | Cost | Folder the extension sees | Review needed |
| :--- | :--- | :--- | :--- | :--- |
| Google Drive | A project in Google Cloud and an OAuth client | Free | `appDataFolder` (a hidden folder of the extension; scope `drive.appdata`) | None for this scope (it is not a sensitive scope) |
| Microsoft OneDrive | An app registration in Microsoft Entra (personal accounts) | Free | `Apps/Job Application Tracker` (scope `Files.ReadWrite.AppFolder`) | None |
| Dropbox | An app in the Dropbox App Console, "App folder" access | Free | `Apps/Job Application Tracker` | None until many users (a production approval for 50+ users, free) |

- No client secret is needed: the extension is a public client and signs in with PKCE, so there is nothing secret to protect in
  the package.
- The extension never sees the other files of the drive: only its own folder.
- The addresses to give the provider as the redirect are the ones of `browser.identity.getRedirectURL()`, which depend on the id
  of the extension (one for each browser). They are known once the extension is published, or fixed earlier with the `key` of
  the manifest (Chrome) and the gecko id (Firefox).
- Nothing goes through a server of ours: the file goes from the browser to the drive of the user. There is no cost for us that
  grows with the number of users, and the quota used is the user's own.

What does cost something (not related to the drive): the Chrome Web Store asks a one-time fee of 5 USD to publish, and the Edge Add-ons
and Firefox Add-ons stores are free.

## What works today, with no registration at all

The options already have **"Back up to a file I choose"** (Chrome and Edge, File System Access API). If the user picks a file in the
folder that their drive application keeps in sync on the computer (Google Drive for desktop, OneDrive, Dropbox), the backup is
copied to the cloud by that application, with the user's own sign-in. It needs no account of ours, no registration and no
permission, and the backup stays protected by the passphrase if the user turned it on. Firefox cannot write to a chosen file again
later: the user saves the file by hand.

## What registering would add

- Backups with no desktop application and from any computer (a work computer, a browser alone).
- A backup that is written by the schedule even when the folder is not on the machine.

## To do it later (checklist)

1. Publish the extension first, to know the ids and the redirect addresses.
2. Register the application with each provider (the table above), with the narrowest scope, and the three redirect addresses.
3. Put the client ids in the source (a client id is public, not a secret).
4. Add the optional host permissions of the provider, asked only when the user turns the provider on, and dropped when they turn it off.
5. Say in `PRIVACY.md` which provider receives the backup, and that it is only when the user chose it.
