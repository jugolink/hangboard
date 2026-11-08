# ADR-0001 — Tauri over WPF for the shell

- **Status:** accepted
- **Date:** 2026-11-08

## Context

Hangboard needs a borderless, transparent, always-on-top window pinned to the
top edge of the screen, holding a horizontal row of image cards with a rope
drawn between them. It also needs a global hotkey, a screen capture, and a
clipboard write.

Three candidates were on the table:

- **WPF / WinUI**, which is native to the platform, has no runtime to ship, and
  gives precise control over window behaviour.
- **Tauri**, which puts the UI in a webview and the system work in Rust.
- **Electron**, which would work but ships a 100 MB runtime for a tool that
  should idle at near zero.

## Decision

Tauri, with the UI in plain HTML/CSS/JS and no frontend framework.

## Why

The line is a *drawing*, not a form. The rope is a parabola with three strokes,
the photos are tilted cards with soft shadows, and the retract animation is a
transform on a container. CSS does all of that in a few dozen lines, with
hardware acceleration and `prefers-reduced-motion` handling built in. The same
in WPF means writing a custom `OnRender` for the rope and hand-rolling the
spring easing.

Counterweight, stated plainly: Tauri ships a webview (already present on
Windows 10/11 as WebView2) and needs `link.exe` from Visual Studio to build,
which is a heavier setup than `dotnet build`. That cost is paid once, by the
developer, and not by the user.

## Consequences

- Adding a frontend framework later is easy; there is no framework to remove
  first.
- Every system capability has to come through a `#[tauri::command]`. This is
  friction, but it is the good kind: it puts a narrow, testable seam between
  the UI and the OS, which is why `capture`, `line`, and `hover` are all unit
  tested without a window.
- The webview's cold start is noticeable. The line window is therefore built
  hidden at startup and never destroyed, so the first reveal is already warm.
