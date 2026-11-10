# Hangboard — v0.1 spec

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

## What v0.1 does

| Behaviour | Detail |
| --- | --- |
| Show the line | Pointer rests in the hot band of the top edge for 250 ms. |
| Hide the line | Pointer leaves the line and the photos for 500 ms. |
| Capture a region | `Ctrl+Alt+H`, drag a rectangle, release. |
| Capture everything | `Ctrl+Alt+Shift+H`. |
| Hang the result | The new screenshot appears at the right end of the line and is already on the clipboard. |
| Copy a photo | Click it. One click, no double-click interval to wait out. |
| Take a photo down | Click the ✕ at its top-left corner, or press `Delete` while hovering it. |
| Pin a photo | Click the ☆ at its top-right corner. Pinned photos are the last to fall. |
| Persist | The line survives a restart; photos are PNGs on disk. |

## What v0.1 deliberately does not do

- **Annotation.** Tendedero hands editing to the macOS Markup tool. Windows has
  no equivalent to hand off to, so this needs its own editor. That is a v0.2
  feature, not a corner to cut.
- **Recording, and trimming a recording.** The original can hang a screen
  recording and trim it by holding. Substantial on its own.
- **Drag and drop out to Explorer.** Copy-then-paste covers the common case.
- **A second line.** There is one line, and it follows the pointer between
  monitors; two monitors do not each get their own rope.

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

- Drag and drop out to Explorer is not implemented; copy-then-paste is the
  supported path.
- There is no annotation editor, and no recording.
- Not verified on a machine that is not the development machine.

## Definition of done for v0.1

- [x] `Ctrl+Alt+H` captures a region, `Ctrl+Alt+Shift+H` the whole screen
- [x] The result is on the line and on the clipboard
- [x] Click copies, ✕ discards, ☆ pins
- [x] The line persists across restarts
- [x] The line drops and retracts on pointer movement
- [x] The window is click-through away from the photos
- [ ] Verified on a machine that is not the development machine
