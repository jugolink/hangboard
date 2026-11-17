# Contributing

The project is Windows-only by design and small enough to stay that way. Before
sending a change, these are the things that will be asked about it.

## Before you start

Open an issue first for anything larger than a bug fix. The design is deliberate
in places that look accidental — `docs/SPEC.md` says what the app does, and
`docs/adr/` explains why the load-bearing choices went the way they did. A pull
request that reverses one of those decisions without addressing the ADR is
likely to be asked to start over.

## What CI checks

Every pull request runs three jobs. All three must pass.

| Job | What it does |
| --- | --- |
| `fmt, clippy, test` | `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` |
| `build` | `npm run build`, then confirms the `.exe` was produced and uploads it |
| `landing page` | `npm run check:site` and `npm run check:version` |

Run the same things locally before pushing:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
```

`cargo fmt --check` fails the whole job, and it is the most common reason a pull
request comes back red. Run `cargo fmt` (without `--check`) to fix it.

## Version numbers

`src-tauri/Cargo.toml` is the only place a version is edited by hand.
`tauri.conf.json` has no `version` field on purpose, so Tauri falls back to
Cargo. `Cargo.lock` follows on the next build. `package.json`, `site/index.html`
and `site/i18n.js` cannot derive, so `npm run check:version` fails if they are
left behind — that is the intended behaviour, not an obstacle to work around.

## Code that has no tests

The Rust tests cover pure arithmetic and nothing else. The tray, the OLE drag,
WinRT OCR, the window plumbing and the canvas annotation layer are checked by
hand, on Windows, by a person. If you change one of those, say in the pull
request what you did to verify it. "It compiles" is not verification for a path
that only exists at runtime.

## Style

- Comments explain *why*, not *what*. A comment that restates the line below it
  will be removed.
- Documentation claims must match the code. Several past bugs were documentation
  that described a feature the code had stopped doing, so a stale sentence is
  treated as a defect, not as tidying.
- No new dependencies without a reason in the pull request. The binary is
  1.6 MB and the aim is to keep it there.

## Licence

Contributions are accepted under the MIT licence in `LICENSE`.

Adding a dependency adds its licence to the binary, and the notices have to
reach the people who download it. `npm run licenses` collects them and the
release workflow attaches the result to each release. If you add a crate with a
licence that is not MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0 or a public-domain
dedication, say so in the pull request — MPL-2.0 crates are linked as separate
modules rather than modified, which is what keeps the MIT choice intact.
