# Hangboard — spec

A place to hang screenshots while you work. Move the pointer to the top edge of
the screen and a thin line drops down; screenshots you take get pegged to it.
Click one to copy it back. Take it down when you are done.

The idea comes from [Tendedero](https://github.com/alejandrobujan/tendedero), a
macOS app that does exactly this against the macOS menu bar. Hangboard is not a
port: the original is 4,300 lines of AppKit against private macOS APIs, with no
cross-platform layer to reuse. What carries over is the design — the numbers,
the gestures, the feel — all reimplemented for Windows.

## Who this is for

Someone who takes screenshots constantly and keeps losing them. The problem is
not capturing, Windows already does that. The problem is that a screenshot
lands in a folder, and a minute later you cannot find the one you wanted to
paste.

## What it does

| Behaviour | Detail |
| --- | --- |
| Show the line | Pointer rests in the hot band of the top edge for 250 ms. Off by default; the tray menu pins the line open, and a new photo reveals it for 3 s. |
| Hide the line | Pointer leaves the line and the photos for 500 ms. |
| Capture a region | `Ctrl+Alt+H`, drag a rectangle, release. |
| Capture everything | `Ctrl+Alt+Shift+H`. |
| Toggle the line | `Ctrl+Alt+L` pins the line open or takes it back down, without touching the top edge. |
| Hang the result | The new screenshot appears at the right end of the line and is already on the clipboard. |
| Copy a photo | Click it. One click, no double-click interval to wait out. |
| Take a photo down | Click the ✕ at its top-left corner, or press `Delete` while hovering it. |
| Pin a photo | Click the ☆ at its top-right corner. Pinned photos are the last to fall. |
| Drag a photo out | Press and move past a 6 px threshold; the shell starts a native `CF_HDROP` drag. The lightbox preview drags out as well. |
| Extract text (OCR) | Context menu or lightbox preview button; runs native WinRT OCR, opens an edit window, and copies results to clipboard. |
| Annotate a capture | After dragging the rectangle, draw on it before it hangs: rectangle, ellipse, arrow, pen, highlighter, mosaic, text. `Ctrl+Z` / `Ctrl+Y` undo and redo, `Enter` commits, `Esc` discards. |
| Persist | The line survives a restart; photos are PNGs on disk. |

## What the app deliberately does not do

- **A second line.** There is one line, and it follows the pointer between
  monitors; two monitors do not each get their own rope.
- **Recording, and trimming a recording.** The original can hang a screen
  recording and trim it by holding. Substantial on its own.

## How it works

```
  Ctrl+Alt+H
      │
      ▼
  capture::freeze_current()   one xcap grab of the monitor under the pointer,
      │                       held in RAM
      │
      ▼
  overlay window              shows the still as a backdrop; user drags a rect
      │
      ▼
  capture::crop()             cuts the rect out of the frozen frame
      │
      ▼
  line::ingest()              writes shots/<id>.png, builds a data-URL thumbnail
      │
      ├──▶ clipboard            so the screenshot is pastable immediately
      ├──▶ line.json            so it survives a restart
      └──▶ line window          pegged at the right end
```

The reason the overlay shows a *still* rather than the live desktop: nothing can
move underneath the selection. No window repaints mid-drag, no notification
slides in. The crop comes from the same bitmap the user was looking at, so what
was selected is exactly what gets saved.

### Windows-specific decisions

**The hot zone is polled, not event-driven.** macOS tells an app when the
pointer enters the menu bar. Windows has no equivalent, so a 30 Hz thread asks
where the pointer is. 30 Hz is fast enough to feel instant and cheap enough not
to register.

**The line window does not animate by moving.** It is parked at the top edge,
and retracting slides the content up inside it with a CSS transform. Animating a
window 60 times a second means 60 `SetWindowPos` calls, which either stutters or
jump-cuts. The one exception is multi-monitor roaming: while the line is
retracted, a monitor change re-parks the window at the top of the monitor the
pointer moved to, in physical pixels.

**The window is click-through except over a photo.** A window sitting on the
top strip of the screen would otherwise swallow every click on title bars and
browser tabs. The webview reports where it placed the photos; a Rust thread
compares that against the pointer and flips `set_ignore_cursor_events`.

**Only the central 84% of the top edge is hot.** The outer 8% on each side
belongs to the Start button and the tray; hovering those should open their own
menus, not the line.

## Known limits

- Marking up an *already hung* photo is not wired up: the annotation layer only
  runs during capture. The context menu's "Mark Up…" entry is present but
  disabled, and `save_annotated_item` has no caller yet.
- There is no recording.
- Not verified on a machine that is not the development machine.

## Definition of done

- [x] `Ctrl+Alt+H` captures a region, `Ctrl+Alt+Shift+H` the whole screen
- [x] `Ctrl+Alt+L` toggles the line without reaching for the top edge
- [x] The result is on the line and on the clipboard
- [x] Click copies, ✕ discards, ☆ pins
- [x] A photo drags out to another application as a real file
- [x] A capture can be annotated before it hangs
- [x] Text is extracted offline through native WinRT OCR
- [x] The line persists across restarts
- [x] The line drops and retracts on pointer movement
- [x] The window is click-through away from the photos
- [ ] Verified on a machine that is not the development machine
