## What this changes

<!-- One or two sentences. If it fixes an issue, link it: "Fixes #12". -->

## Why

<!--
The reasoning, not the diff. If it reverses a decision recorded in docs/adr/,
say which one and why that reasoning no longer holds.
-->

## How it was verified

<!--
CI covers fmt, clippy, the 27 unit tests, the build and the two static checks.
Those run on their own -- do not list them here.

This section is for what CI cannot reach: the tray, OLE drag-out, WinRT OCR,
window geometry, multi-monitor behaviour, and the canvas annotation layer in
ui/annotate.js. If your change touches one of those, say what you did on a real
Windows desktop. "It compiles" is not verification for a runtime-only path.
-->

## Checklist

- [ ] `cargo fmt` applied (the most common reason a PR comes back red)
- [ ] `cargo clippy --all-targets -- -D warnings` is clean
- [ ] `cargo test` passes
- [ ] `npm run check` passes (site keys, ids, version agreement)
- [ ] Version bumped in `src-tauri/Cargo.toml` only, if this is a release
- [ ] Documentation claims still match the code — README, `docs/SPEC.md`, and
      the landing page all describe behaviour, and a stale sentence counts as a
      defect
