# Hangboard

Screenshots hang on a line at the top edge of the screen. Click one to copy it
back. Take it down when you are done.

A Windows reimplementation of the idea behind
[Tendedero](https://github.com/alejandrobujan/tendedero) — not a port. The
original is AppKit against private macOS APIs; what carried over is the design,
not the code.

<!-- A screenshot of the line belongs here. Take one with Hangboard itself:
     press Ctrl+Alt+H, select the line, and save it to docs/line.png. -->

## What it does

Move the pointer to the middle of the top edge of the screen. A thin line drops
down, holding your recent screenshots like photos on a clothesline.

- **`Ctrl+Alt+H`** — capture a region. Drag a rectangle, release.
- **`Ctrl+Alt+Shift+H`** — capture the whole screen.
- **Click a photo** — copy it to the clipboard.
- **Double-click a photo** — open the centred lightbox preview.
- **Right-click a photo** — the context menu: copy, open, reveal, export, discard.
- **Extract text (OCR)** — extract text directly from the context menu or lightbox preview; automatically copies to clipboard and opens an edit window for adjustments.
- **Drag a photo out** — a native OLE drag, so the file lands in Explorer, WeChat,
  QQ, Feishu, Word, Photoshop or VS Code. The lightbox preview drags out too.
- **✕ on a photo** — take it down.
- **☆ on a photo** — pin it, so it is the last to fall when the line fills up.

New screenshots go to the clipboard immediately, so you can paste without
clicking anything.

The tray icon carries the same actions plus the settings panel, where the
hotkeys, the line size, the clipboard watch, autostart and the UI language
(English or Simplified Chinese) can be changed. The line follows the monitor the
pointer is on, and a capture grabs whichever monitor the pointer is on.

## Requirements

- Windows 10 or 11
- To build: Rust (stable, 1.88+), Node 18+, and the Visual Studio Build Tools
  with the C++ workload — Tauri needs `link.exe`.

WebView2 is required at runtime and is already present on Windows 11 and on
up-to-date Windows 10.

## Build

```powershell
npm install          # installs the Tauri CLI
npm run build        # produces src-tauri/target/release/hangboard.exe
```

For a development run with a console and hot reload of the shell:

```powershell
npm run dev
```

An installer (.msi / .exe via NSIS) comes from `npm run bundle`.

## Run from a checkout

```
$env:HANGBOARD_DATA_DIR = ".\dev-data"
.\src-tauri\target\release\hangboard.exe
```

Screenshots and the line index live in that directory, under `shots/` and
`line.json`. Without the variable they go to `%APPDATA%\Hangboard`.

## Layout

```
src-tauri/src/
  lib.rs        app setup, hotkeys, data directory, wiring
  window.rs     creates the five windows, owns their geometry
  hover.rs      polls the pointer, decides when to drop and retract
  capture.rs    freezes the screen, cuts rectangles out of the frozen frame
  line.rs       pixels to items, persistence, clipboard, deletion
  commands.rs   the invoke surface the webview calls
  state.rs      shared state and the geometry constants
  settings.rs   settings.json, defaults, load/save
  tray.rs       the tray icon, its menu, and the localised labels
  ocr.rs        Windows WinRT native OCR text recognition
  clipboard.rs  polls the Windows clipboard for new images
  autostart.rs  the "open at login" registry entry
ui/
  index.html    the line window
  overlay.html  the region-picking overlay
  preview.html  the centred lightbox preview
  context.html  the per-photo context menu
  settings.html the settings panel
  ocr.html      the OCR text result and editing window
docs/
  SPEC.md       what v0.1 does and does not do
  adr/          why the load-bearing decisions went the way they did
```

## Testing

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

The interesting logic — cropping, thumbnailing, persistence, the hot zone
arithmetic — is deliberately free of Tauri types so it can be tested without a
window.

## Windows-only, on purpose

The hot zone, the click-through behaviour, and the capture path are all
Windows-specific. There is no cross-platform abstraction layer, because there
is one platform. Guessing at a second one would be work spent on a guess.

## Licence

MIT. The name and icon are this project's; the design debt to Tendedero is
acknowledged above.
