# ADR-0003 — Where the hot zone is, and why it is polled

- **Status:** accepted
- **Date:** 2026-11-08

## Context

The line appears when the pointer reaches the top edge of the screen. On macOS
that is a solved problem: the menu bar is a system-provided strip, and an app
can ask to be told when the pointer enters it.

Windows has no such notification. There is no "pointer reached the top edge"
event, and installing a global mouse hook to synthesise one is a heavy hammer:
it needs care to unhook, it can be refused by security software, and a bug in
the callback degrades input for the whole desktop.

## Decision

Poll `cursor_position` at 30 Hz on a background thread. Treat a pointer inside
a 3-logical-pixel strip at the top of the monitor, within the middle third of
its width, as "in the hot zone".

## Why 30 Hz

The delay budget is 250 ms, so the sampling interval only needs to be small
relative to that. At 33 ms the worst-case extra latency is 33 ms, about 1% of
the animation. Going faster buys nothing a person can perceive; going slower
starts to interact with the 250 ms dwell in ways that feel laggy.

A poll is also trivially debuggable: it is one syscall in a loop, and its
failure mode is "the line does not appear", not "input stops working".

## Why the middle third only

The top edge of a 1920-wide screen holds the Start button on the left and the
clock and tray on the right. A full-width hot zone would fight both: moving to
the clock would drop the line, and clicking Start would need to pass through
it. Restricting to the middle third leaves 640 px in the centre — plenty of
target — and leaves both corners to their owners.

## Consequences

- The poll costs a syscall every 33 ms forever. Measured on the development
  machine it does not appear in the process CPU list.
- Maximised windows have their title bar at the top edge. The hot zone sits
  above them in z-order, so reaching the hot zone is possible, but a click at
  the very top of a title bar can hit the line if a photo happens to be there.
  Mitigated by the click-through: the window only accepts input over a photo.
- 3 logical pixels is deliberately shallow. A taller zone would trigger when
  reaching for a scroll bar or a tab.
