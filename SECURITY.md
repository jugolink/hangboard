# Security

## Reporting

Report vulnerabilities privately through GitHub's
[Security Advisories](https://github.com/jugolink/hangboard/security/advisories/new)
rather than in a public issue. If that is unavailable, open an issue that says
only that you have a security report and how to reach you — leave the details
out of it.

There is one maintainer, so expect an initial reply within about a week.

## What this app touches

Hangboard runs on Windows with the same privileges as the user who launched it.
It has no network access, no telemetry, no auto-update, and no server component.
Knowing what it does read and write is the fastest way to judge whether
something you have found is in scope:

- **The screen.** Captures freeze the display through Win32 GDI, then cut
  rectangles out of the frozen frame. Nothing is uploaded anywhere.
- **The clipboard.** When "hang what you copy" is on, the app polls
  `GetClipboardSequenceNumber` and reads images. It also writes to the clipboard
  on click-to-copy and after OCR.
- **Its own data directory** (`%APPDATA%\Hangboard` by default, or whatever
  `HANGBOARD_DATA_DIR` names): PNG screenshots under `shots/`, and `line.json`,
  `settings.json`.
- **The registry**, one key: `HKCU\...\Run` when "open at login" is enabled.
- **The filesystem, on explicit action only**: exporting a photo, or choosing a
  custom `.wav` chime.

Out of scope: anything requiring an attacker who already has code execution as
the same user, and anything that requires the app to be running elevated (it
does not ask for elevation and does not need it).

## Not a vulnerability

- Screenshots of whatever is on screen, including sensitive content. That is the
  feature; the files sit in the data directory with normal user permissions.
- The absence of a password, PIN, or encryption on that directory. It inherits
  the account's own protection, which is the design.
- The app reading the clipboard when the user has enabled clipboard hanging.
