# Roadmap

What is left to do, and why. Shipped work is not listed here — `git log` and the
release notes are the record of what landed.

## Shipped so far

| Version | What it added |
| --- | --- |
| v0.1.0 | The line, tray, settings, hotkeys, clipboard watch, lightbox, context menu, drag-out, NSIS installer, i18n, multi-monitor roaming, offline OCR, annotation while capturing, custom chime and display duration, ten annotation tools, landing page under `site/` |

## Open

### Real-hardware regression testing

- [ ] Full feature pass on a machine that is not the development box
- [ ] Multi-monitor and mixed-DPI regression
- [ ] Memory and window-lifetime monitoring across repeated show/hide cycles

These three need a second machine and a human at the keyboard. No script can
stand in for them, and CI cannot reach them: CI covers the build, the unit
tests, and static consistency only.

### Deferred by decision

- [ ] **Annotating a photo that is already on the line.** The context menu's
      "Mark Up…" stays `disabled` and `context.js` keeps `markup: null`. The
      Rust side (`save_annotated_item`) is implemented and registered but has no
      caller. Decision: not doing it. Annotating during capture covers the real
      use; doing it afterwards means rebuilding the whole annotation state
      machine inside the lightbox, and the payoff does not justify it. If that
      changes, `save_annotated_item` is the place to start.
- [ ] **QR and barcode decoding.** Offline decoding needs `rxing` or `rqrr`; the
      dependency cost outweighed the feature, so it was removed. OCR text
      extraction stayed.

## Known test gaps

- The canvas annotation layer (`ui/annotate.js`, ~550 lines) has no automated
  tests. It is browser interaction code, the repository has no frontend test
  runner, and adding one is not planned. Regressions are caught by hand.
- `ui/line.js` layout and hit-rect reporting are likewise untested, but they
  agree with `get_geometry` / `set_hit_rects` through the constants in
  `src-tauri/src/state.rs`. Change the geometry and both sides must be read
  together.
- The 27 Rust tests cover pure logic — cropping, thumbnailing, persistence, hot
  zone arithmetic. Windows-only paths (tray, OLE drag, WinRT OCR, window
  plumbing) are not covered.
