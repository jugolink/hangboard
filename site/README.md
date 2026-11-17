# The Hangboard site

A static landing page for the app, meant to be deployed on Vercel. There is no
build step: the browser gets these files as they are.

```
site/
  index.html    the page
  styles.css    all of it, dark and light
  i18n.js       Chinese and English strings, plus the language toggle
  demo.js       the clothesline, and the four demos below it
  vercel.json   caching and clean URLs
  assets/       the app icon
```

`scripts/check-site.mjs` lives beside the app's other scripts, not here, so
`npm run check:site` works from the repository root. The app itself is described
in the [top-level README](../README.md).

## Run it locally

Any static server works. `npx serve` is the least setup:

```powershell
npx serve site
```

Then open http://localhost:3000.

Opening `index.html` from the file system mostly works, but `Ctrl+V`, the paste
button and the OCR copy button need a real origin, so use the server.

## Checking it

There is no build step, so nothing would otherwise notice a `data-i18n` key
with no translation or a version number that drifted from `package.json`.
`scripts/check-site.mjs` checks exactly those:

```powershell
npm run check:site
```

It runs in CI on every push and pull request.

It checks four things:

1. every `data-i18n` / `data-i18n-title` key resolves in every language, and no
   key exists in one language but not the other;
2. every id `demo.js` reaches for through `getElementById` exists in the markup;
3. every printed version — in `index.html` *and* in `i18n.js` — matches
   `package.json`;
4. every download link points at a stable release URL rather than a pinned tag.

## Deploy on Vercel

Import the repository, then set **Root Directory** to `site`. Framework preset
**Other**, Build Command empty, Output Directory empty. `vercel.json` is picked
up from that directory.

From the CLI, the same thing:

```powershell
npx vercel --cwd site
```

## The demo

The clothesline at the top of the page is a browser-only reimplementation of
the app's own webview front end. It is deliberately not an import of
`ui/line.js`: that file calls `invoke()` and `listen()` into Rust, and there is
no Rust behind a static page.

What the two share is geometry and drawing, taken from the same sources:

| What | Where the numbers come from |
| --- | --- |
| photo height, card width, spacing, rope top, peg offset | `src-tauri/src/state.rs`, `geometry()` |
| the sag of the rope (`ropeY`) | `ui/line.js` |
| card positions (`spot`) | `ui/line.js` |
| the three-stroke rope | `ui/line.js`, `drawRope()` |
| glass frame, clothespin, arrival and fall animations | `ui/line.css` |

If the app's geometry changes, those numbers in `demo.js` (`GEO`,
`CARD_DROP`) and the keyframes in `styles.css` need to change with it. The
comment at the top of `demo.js` says where each one came from.

### The four simulations

Below the clothesline the page demonstrates four behaviours. All four are
**simulations** — nothing here talks to Windows, and none of it is a port of
the app's code:

| Demo | What it actually does |
| --- | --- |
| Drag to dock | Hit-tests the pointer against the WeChat / VS Code / Explorer targets with `getBoundingClientRect` and reports a delivery. No file is dragged. |
| Annotation | A `<canvas>` with rectangle, arrow, brush, highlighter and mosaic, committed back onto the line with `Enter`. This one mirrors `ui/annotate.js` in behaviour, not in code. |
| OCR | A scanning beam, a 1.2 s pause, then a popover holding `ocrSampleText`. The text is invented. Nothing is recognised, and the clipboard is only written when the visitor presses **Copy Text**. |
| Hotkey visualiser | Real key events highlight the matching row and run its action, so the shortcut table is something to try rather than read. |

Sound is synthesised with the Web Audio API — a peg click and a falling drop —
so the page ships no audio files.

Two behaviours in the hotkey visualiser are load-bearing and easy to break:

- **Only the longest matching chord runs.** `Ctrl+Alt+Shift+H` contains
  `Ctrl+Alt+H`, so a naive "are all these keys held" test would fire both.
- **Actions run on `keydown` only, never on `keyup`.** Releasing Shift while
  still holding `Ctrl+Alt+H` leaves a shorter chord held; acting on that would
  fire a shortcut the visitor never pressed.

## Dark and light

Dark is the default palette. `styles.css` also carries a
`prefers-color-scheme: light` block that restyles the whole page, and
`index.html` has a matching `theme-color` meta tag per scheme so the browser
chrome follows the page rather than fighting it.

## Updating the download version

The version is printed in more places than the download button, and every one
of them has to agree with `package.json`:

| Where | What |
| --- | --- |
| `index.html` | `#download-meta` and the `.btn-meta` in the closing call to action |
| `i18n.js` | `heroBadge` and `ocrSampleText`, once per language |

`npm run check:site` fails if any of them drifts, so the usual move is to bump
`package.json` and run it. The download link itself points at
`/releases/latest`, so it never goes stale — only the printed numbers do.

## Language

Chinese is the default. The nav toggle switches to English and remembers the
choice in `localStorage`; a first-time visitor whose browser reports a
non-Chinese language gets English. Every string is in `i18n.js` — the HTML
carries `data-i18n` keys rather than text, so nothing is duplicated between
the two languages and a missing key falls back to Chinese instead of leaving
a blank element.

## What is not here

No analytics, no cookie banner, no fonts fetched from a CDN, no framework, no
audio files, no dependencies. Four files and an icon; that is the whole site.
