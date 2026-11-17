/* One version, checked everywhere it is written down.
 *
 * The app version appears in four files, in three different formats, and none
 * of them can derive from another:
 *
 *   src-tauri/Cargo.toml      version = "0.1.0"     the source of truth
 *   src-tauri/Cargo.lock      version = "0.1.0"     written by cargo, follows
 *                                                   Cargo.toml on the next build
 *   package.json              "version": "0.1.0"    npm requires a literal
 *   site/index.html           v0.1.0 (x3)           what visitors read
 *   site/i18n.js              v0.1.0 (x2 per lang)  the hero badge and the
 *                                                   sample OCR text
 *
 * `tauri.conf.json` deliberately has no `version`: Tauri documents that when
 * the field is removed the version is read from `Cargo.toml`, so it is not a
 * fourth place to edit. See node_modules/@tauri-apps/cli/config.schema.json.
 *
 * Cargo.toml wins. Everything else is checked against it, so bumping one file
 * and forgetting the rest fails here instead of shipping a mismatched number.
 *
 *   node scripts/check-version.mjs
 */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const problems = [];

/* ---- the source of truth ---------------------------------------------- */

const cargoToml = read("src-tauri/Cargo.toml");
const truthMatch = cargoToml.match(/^version = "([^"]+)"/m);
if (!truthMatch) {
  console.error("✗ src-tauri/Cargo.toml has no top-level `version = \"...\"`");
  process.exit(1);
}
const truth = truthMatch[1];

/* ---- every other place that prints it --------------------------------- */

// [file, extractor, what the file calls this occurrence]
const places = [
  [
    "package.json",
    () => JSON.parse(read("package.json")).version,
    "npm needs a literal here; it cannot derive from Cargo.toml",
  ],
  [
    "src-tauri/Cargo.lock",
    () => {
      const lock = read("src-tauri/Cargo.lock");
      // The `hangboard` package block, not the first version in the file.
      // Match on \s+ rather than \n: a Windows checkout has CRLF endings, and
      // a literal \n pattern silently finds nothing there. That is exactly the
      // failure this check reported against itself on CI.
      const m = lock.match(/name = "hangboard"\s+version = "([^"]+)"/);
      return m ? m[1] : null;
    },
    "cargo rewrites this on the next build; a stale value means a build was skipped",
  ],
  [
    "site/index.html",
    () => {
      const found = new Set(
        [...read("site/index.html").matchAll(/v(\d+\.\d+\.\d+)/g)].map((m) => m[1]),
      );
      return found.size === 1 ? [...found][0] : `ambiguous: ${[...found].join(", ")}`;
    },
    "the download button and the closing call to action",
  ],
  [
    "site/i18n.js",
    () => {
      const found = new Set(
        [...read("site/i18n.js").matchAll(/v(\d+\.\d+\.\d+)/g)].map((m) => m[1]),
      );
      return found.size === 1 ? [...found][0] : `ambiguous: ${[...found].join(", ")}`;
    },
    "the hero badge and the sample OCR text, once per language",
  ],
];

for (const [file, extract, note] of places) {
  let got;
  try {
    got = extract();
  } catch (error) {
    problems.push(`${file}: could not read a version (${error.message})`);
    continue;
  }
  if (got === null) {
    problems.push(`${file}: no version found — ${note}`);
  } else if (got !== truth) {
    problems.push(`${file}: ${got} — Cargo.toml is ${truth} (${note})`);
  }
}

/* ---- tauri.conf.json must NOT carry a version ------------------------- */

// Leaving one there silently wins over Cargo.toml and recreates the drift this
// script exists to prevent.
const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
if ("version" in conf) {
  problems.push(
    `src-tauri/tauri.conf.json: has "version": "${conf.version}" — remove it so Tauri reads Cargo.toml`,
  );
}

/* ---- report ----------------------------------------------------------- */

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem(s); Cargo.toml says ${truth}`);
  process.exit(1);
}

console.log(`version ok — ${truth}, agreed on by ${places.length} files`);
