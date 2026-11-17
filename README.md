# Hangboard

[![CI](https://github.com/jugolink/hangboard/actions/workflows/ci.yml/badge.svg)](https://github.com/jugolink/hangboard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jugolink/hangboard?display_name=tag)](https://github.com/jugolink/hangboard/releases/latest)
[![Licence](https://img.shields.io/github/license/jugolink/hangboard)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4)](#windows-only-on-purpose)

Screenshots hang on a line at the top edge of the screen. Click one to copy it
back. Take it down when you are done.

**English** · [简体中文](README.zh-CN.md)

A Windows reimplementation of the idea behind
[Tendedero](https://github.com/alejandrobujan/tendedero) — not a port. The
original is AppKit against private macOS APIs; what carried over is the design,
not the code.

<!-- A screenshot of the line belongs here, and there is not one yet: it has to
     be taken on a Windows desktop with the app running. The landing page under
     site/ carries a live reproduction of the line in the meantime. -->

For a task-oriented walkthrough — every button, every setting, and the tricks
that are not obvious from the UI — see [USER_GUIDE.md](USER_GUIDE.md) (Chinese).

## What it does

Take a screenshot and it hangs itself on the line for a moment, then tucks
itself away. To bring the line back, hover the middle of the top edge of the
screen (turn "Reveal on hover" on in the settings, or use the tray menu) — a
thin line drops down, holding your recent screenshots like photos on a
clothesline.

- **`Ctrl+Alt+H`** — capture a region. Drag a rectangle, release.
- **`Ctrl+Alt+Shift+H`** — capture the whole primary monitor at once, with no
  overlay to draw on.
- **`Ctrl+Alt+L`** — toggle the clothesline (show or hide).
- **Click a photo** — copy it to the clipboard.
- **Double-click a photo** — open the centred lightbox preview.
- **Right-click a photo** — the context menu: copy, open, quick look, extract
  text, show in Explorer, save to the desktop, discard, or take down everything
  to the left or right of it.
- **Extract text (OCR)** — from the context menu or the lightbox preview. The
  text is copied to the clipboard and an edit window opens for adjustments. Runs
  entirely offline through the Windows WinRT OCR engine; nothing leaves the
  machine.
- **Annotate while you capture** — after dragging the rectangle, draw on it
  before it hangs: rectangle, ellipse, line, arrow, pen, highlighter, mosaic,
  smooth blur, text, and numbered step badges. Each shape takes a colour (seven
  presets plus a full picker), a stroke width (three presets, or the scroll
  wheel), and rectangles and ellipses can be outlined or filled. `Ctrl+Z` /
  `Ctrl+Y` undo and redo, `Enter` hangs the composited result, and `Esc` backs
  out of the current tool first and then throws the capture away. The annotated
  PNG is what gets saved and put on the clipboard.
- **Drag a photo out** — a native OLE drag, so the file lands in Explorer,
  WeChat, QQ, Feishu, Word, Photoshop, or VS Code. The lightbox preview drags
  out too.
- **✕ on a photo** — take it down. It falls off the line, and the take-down is
  final once the animation ends.
- **☆ on a photo** — pin it, so it is the last to fall when the line fills up.
- **Take everything down** — the tray menu drops every photo at once.

New screenshots go to the clipboard immediately, so you can paste without
clicking anything.

The tray icon carries the same actions plus the settings panel, where the
hotkeys, the data directory, the clipboard watch, autostart, the line size, the
capacity limit, and the UI language (English or Simplified Chinese) can be
changed. The line follows the monitor the pointer is on, and a region capture
grabs whichever monitor the pointer is on.

Three settings shape how the line announces a new photo. **Reveal on new photo**
drops the line when a screenshot arrives or a clipboard image is hung;
**Display Duration** is how many seconds it then stays down (1–300, default 3).
**Sound effects** plays a short chime when a photo hangs or is taken down. The
chime is embedded in the binary, so it works with no network and no extra file;
a **Custom Sound Effect** can point at any `.wav` on disk instead, with a
**Test** button to hear it before saving. Turning "Reveal on new photo" off
disables the duration field, and turning sound effects off disables the
custom-sound row.

## Requirements

- Windows 10 or 11. WebView2 is required at runtime and is already present on
  Windows 11 and on up-to-date Windows 10.
- To build: Rust 1.88 or newer (stable), Node 18 or newer, and the Visual Studio
  Build Tools with the C++ workload — Tauri needs `link.exe`.

CI builds with Node 22 and the current stable Rust, so those are the versions
actually exercised; the numbers above are the declared floor
(`src-tauri/Cargo.toml` carries `rust-version = "1.88"`).

## Build

```powershell
npm install          # installs the Tauri CLI
npm run build        # produces src-tauri/target/release/hangboard.exe
```

For a development run with a console and hot reload of the shell:

```powershell
npm run dev
```

An NSIS installer comes from `npm run bundle`. It is the only bundle target
configured — there is no `.msi`.

## Run from a checkout

```
$env:HANGBOARD_DATA_DIR = ".\\dev-data"
.\\src-tauri\\target\\release\\hangboard.exe
```

Screenshots and the line index live in that directory, under `shots/` and
`line.json`. Without the variable they go to `%APPDATA%\\Hangboard`. Both can be
moved from the settings panel, which migrates the existing files.

## Layout

```
src-tauri/src/
  lib.rs        app setup, hotkeys, data directory, wiring
  window.rs     creates the six windows, owns their geometry
  hover.rs      polls the pointer, decides when to drop and retract
  capture.rs    freezes the screen, cuts rectangles out of the frozen frame
  line.rs       pixels to items, persistence, clipboard, deletion
  commands.rs   the invoke surface the webview calls
  state.rs      shared state and the geometry constants
  settings.rs   settings.json, defaults, load/save
  tray.rs       the tray icon, its menu, and the localised labels
  ocr.rs        Windows WinRT native OCR text recognition
  drag.rs       the OLE drag that carries a photo out to other apps
  clipboard.rs  polls the Windows clipboard for new images
  autostart.rs  the "open at login" registry entry
ui/
  index.html    the line window
  line.css      … and its stylesheet
  line.js       … and its behaviour
  overlay.html  the region-picking overlay, with the annotation toolbar
  overlay.css   … and its stylesheet
  overlay.js    … and its behaviour
  annotate.js   the canvas annotation layer the overlay draws with
  preview.html  the centred lightbox preview
  context.html  the per-photo context menu
  settings.html the settings panel
  ocr.html      the OCR text result and editing window
src-tauri/assets/
  default_hang.wav  the hang chime, embedded in the binary with include_bytes!
site/
  index.html    the landing page, deployed on Vercel with this folder as root
  demo.js       the clothesline demo on that page
  README.md     how that folder is built and deployed
docs/
  SPEC.md       what the app does and does not do
  ROADMAP.md    what is left, and what was deliberately deferred
  adr/          why the load-bearing decisions went the way they did
scripts/
  check-site.mjs           keeps the landing page's keys, ids and version in agreement
  check-version.mjs        fails when the version drifts from src-tauri/Cargo.toml
  third-party-licenses.mjs generates THIRD-PARTY-LICENSES.md from cargo metadata
```

Every `.html` under `ui/` has a matching `.css` and `.js`, except `annotate.js`,
which the overlay loads alongside its own script.

## Testing

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
```

The Rust tests (27 of them) cover the interesting *arithmetic* — cropping,
thumbnailing, persistence, migration, the hot-zone geometry, the chime's WAV
header — deliberately free of Tauri types so they run without a window. That
also means they say nothing about the parts that only exist at runtime: the
tray, the OLE drag, WinRT OCR, the window plumbing, or the canvas annotation
layer in `ui/annotate.js`. Those are checked by hand. `docs/ROADMAP.md` lists the
known gaps.

`npm run check` runs two static checks over the files that have no build step:

- `check:site` — every `data-i18n` key resolves in both languages, every id the
  demo script looks up exists in the markup, and the download links point at a
  stable release URL.
- `check:version` — the version is agreed on by `package.json`, `Cargo.lock`,
  `site/index.html` and `site/i18n.js`, all against `src-tauri/Cargo.toml`.

### Bumping the version

Edit `src-tauri/Cargo.toml` only. `tauri.conf.json` deliberately has no
`version` field — Tauri falls back to `Cargo.toml` when it is absent — and
`Cargo.lock` follows on the next build. `package.json` and the two site files
cannot derive, so `npm run check:version` fails if they are left behind.

## Windows-only, on purpose

The hot zone, the click-through behaviour, and the capture path are all
Windows-specific. There is no cross-platform abstraction layer, because there
is one platform. Guessing at a second one would be work spent on a guess.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for what CI checks and what it cannot.
Security reports go through
[private advisories](https://github.com/jugolink/hangboard/security/advisories/new),
not public issues. [docs/ROADMAP.md](docs/ROADMAP.md) lists what is left and
what was deliberately deferred.

## Licence

MIT — see [LICENSE](LICENSE). The name and icon are this project's; the design
debt to Tendedero is acknowledged above.

The binary links 271 crates whose licences require their notices to travel with
it, so the installer shows the MIT text and every release carries a generated
`THIRD-PARTY-LICENSES.md` asset. `npm run licenses` regenerates it from
`cargo metadata --filter-platform x86_64-pc-windows-msvc`; the file is not
committed, because 1.2 MB of licence text would outweigh the source it
documents.
