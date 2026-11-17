/* Consistency checks for the landing page in site/.
 *
 * The page has no build step, which also means nothing catches the boring
 * mistakes: a data-i18n key with no translation, an id the demo script looks
 * up but the markup does not define, a version number that drifted from
 * package.json. This script catches exactly those, and nothing else — it does
 * not try to be a linter.
 *
 *   node scripts/check-site.mjs
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("site/index.html");
const i18nSource = read("site/i18n.js");
const demo = read("site/demo.js");
const pkg = JSON.parse(read("package.json"));

const problems = [];

/* ---- 1. every data-i18n key resolves in every language ---------------- */

// The strings are a plain object literal at the top of the file; the rest of
// it is DOM code that needs a browser. Evaluating only the literal keeps this
// check free of a DOM shim.
const literal = i18nSource.slice(
  i18nSource.indexOf("const HB_I18N"),
  i18nSource.indexOf("\n};") + 3,
);
const sandbox = {};
vm.runInNewContext(`${literal}\nthis.HB_I18N = HB_I18N;`, sandbox);
const strings = sandbox.HB_I18N;

const langs = Object.keys(strings);
const keys = new Set([
  ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/data-i18n-title="([^"]+)"/g)].map((m) => m[1]),
]);

for (const lang of langs) {
  for (const key of keys) {
    if (typeof strings[lang][key] !== "string") {
      problems.push(`${lang} is missing the string "${key}"`);
    }
  }
}

// A key defined in one language but not the other is the same bug from the
// other direction: the fallback would silently show the wrong language.
const zh = new Set(Object.keys(strings["zh-CN"] || {}));
const en = new Set(Object.keys(strings.en || {}));
for (const key of zh) if (!en.has(key)) problems.push(`"${key}" is in zh-CN but not en`);
for (const key of en) if (!zh.has(key)) problems.push(`"${key}" is in en but not zh-CN`);

/* ---- 2. every id the demo reaches for exists --------------------------- */

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const wanted = new Set(
  [...demo.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]),
);
for (const id of wanted) {
  if (!ids.has(id)) problems.push(`site/demo.js looks up #${id}, which the markup lacks`);
}

/* ---- 3. every printed version matches package.json -------------------- */

// The version is printed in more than one file, and it is printed once per
// language inside i18n.js (the hero badge and the sample OCR text). Scanning
// only the markup let those drift silently, so check every file that prints one.
for (const [file, source] of [
  ["site/index.html", html],
  ["site/i18n.js", i18nSource],
]) {
  const printed = new Set([...source.matchAll(/v(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
  for (const v of printed) {
    if (v !== pkg.version) {
      problems.push(`${file} prints v${v}; package.json is ${pkg.version}`);
    }
  }
  if (printed.size === 0 && file === "site/index.html") {
    problems.push(`${file} prints no version at all`);
  }
}

/* ---- 4. the download links point at the release feed ------------------ */

for (const href of html.matchAll(/href="([^"]*releases[^"]*)"/g)) {
  const url = href[1];
  // A pinned download URL goes stale on the next release; /releases/latest
  // and /releases/tag/vX.Y.Z are the two forms that keep working.
  if (!/releases\/(latest|tag\/v\d+\.\d+\.\d+)$/.test(url)) {
    problems.push(`download link is not a stable release URL: ${url}`);
  }
}

/* ---- report ----------------------------------------------------------- */

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}

console.log(
  `site ok — ${keys.size} keys in ${langs.length} languages, ` +
    `${wanted.size} ids, v${pkg.version}`,
);
