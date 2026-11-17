# ADR-0002 — Freeze the screen instead of capturing live

- **Status:** accepted
- **Date:** 2026-11-08

## Context

Region capture needs the user to drag a rectangle over the desktop. Two ways to
show what they are selecting:

1. **Live.** Put a transparent overlay over the live desktop and dim it. The
   desktop keeps animating underneath.
2. **Frozen.** Grab the screen to a bitmap first, show the bitmap in the
   overlay, and cut the selection out of that same bitmap.

The macOS original cannot do either: it is not a capture tool, and delegates to
the system screenshot UI. On Windows there is no system UI to delegate to, so
this is our decision to make.

## Decision

Frozen capture.

## Why

The live desktop does not hold still. A cursor blinks, a video keeps playing, a
notification slides in, a progress bar redraws. Under a live overlay those
become visible blinking patches inside the region the user is trying to frame,
and worse, the pixels saved at release time may differ from the pixels the user
framed.

Freezing removes the whole class of problem. It also buys a feature for free:
once the desktop is a still image, the selection is a rectangle over an image,
which is exactly what a crop operation is. There is no separate path for
"capture a region" and "crop an image".

The cost is memory: one full-resolution RGBA copy of the primary monitor, 8 MB
at 1920×1080, held only while the overlay is up.

## Consequences

- The overlay must be shown *after* the grab, never before, or it captures
  itself. `begin_capture` orders these explicitly.
- The backdrop shown to the user is a lossy JPEG (fast to base64, small in the
  webview) while the crop comes from the lossless buffer. The two differ by
  JPEG noise; the saved image does not.
- Anything that changes between the hotkey and the grab — a fraction of a
  second — is baked into the still. That is the same latency a system capture
  has.
