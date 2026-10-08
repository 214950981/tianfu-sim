/**
 * LIVEFIX06 — the Content01 Chinese copy catalog as a static WeChat-safe module.
 *
 * WHY THIS EXISTS
 *
 * `packages/content/src/content01-v1.ts` has always carried the authoritative Chinese wording in
 * `CONTENT01_ZH_CN` — the real EVENT that the Controller observed in WeChat DevTools
 * (`content01.ordinary.night-rain`, stateVersion 4) projected 夜雨 with a full body and three choice
 * labels, and the client still rendered `content01.ordinary.night-rain.title`,
 * `.body` and `.choice.*` as raw text.
 *
 * The cause was purely client-side coverage: `v2-live.js` kept a hand-maintained `CONTENT_COPY` of 18
 * keys, and `presentLabel()` returns the key verbatim for anything missing. So the server projection
 * was correct all along and the page simply had no translation for it.
 *
 * WHY A GENERATOR
 *
 * The 340 committed Content01 keys must reach the client without a second hand-maintained map, because a
 * hand-maintained map is exactly what just failed. This tool is the single deterministic path:
 *
 *   node tools/content01-zh-cn-module.mjs           # report freshness (exit 1 when stale)
 *   node tools/content01-zh-cn-module.mjs --write   # regenerate the committed module
 *
 * It does NOT re-implement the catalog. It imports `CONTENT01_ZH_CN` straight from the production
 * source module, so the payload is derived from the one committed source of truth by construction.
 * Node's TypeScript support strips the types and evaluates the module as written; there is no regex
 * transcription of the Chinese strings anywhere in this file, so a reworded title cannot be missed here.
 *
 * The WeChat runtime cannot `require()` a `.json` file (that failure is documented in
 * tools/ui02-preview-fixture-module.mjs), so the catalog is emitted as a static CommonJS module. The
 * runtime package stays closed: the only dependency is this file, inside `miniprogram/`.
 *
 * SECOND CONTRACT: missing keys must stay a detectable failure.
 *
 * A generated catalog can silently go stale the moment someone adds a `text()` call to the source. This
 * tool exports `checkCatalogFreshness()` so tests/livefix06.test.mjs can prove that a NEW source key with
 * an un-regenerated artifact fails, instead of merely asserting that a script file exists.
 */

import fs from "node:fs";
import path from "node:path";

/** Where the committed client module lives. Inside miniprogramRoot, so the packager bundles it. */
export const MODULE_PATH = "miniprogram/pages/v2-live/content01-zh-cn.js";

/** The specifier v2-live.js must use. A string literal — the packager cannot resolve a variable. */
export const MODULE_SPECIFIER = "./content01-zh-cn.js";

/** The consumer whose require() argument is pinned to the literal above. */
export const CONSUMER_PATH = "miniprogram/pages/v2-live/v2-live.js";

/** The authoritative source of the copy. Never a second definition. */
const SOURCE_MODULE = "../packages/content/src/content01-v1.ts";

/**
 * The catalog exactly as the production source defines it.
 *
 * Loaded through a path relative to this file so the tool works from any cwd. TypeScript is evaluated
 * by Node directly; `CONTENT01_ZH_CN` is populated at module-evaluation time by the `text()` helper
 * calls, so importing the module is what builds the catalog.
 */
export async function loadSourceCatalog() {
  const sourceUrl = new URL(SOURCE_MODULE, import.meta.url).href;
  const module = await import(sourceUrl);
  if (module.CONTENT01_ZH_CN === undefined) {
    throw new Error(SOURCE_MODULE + " does not export CONTENT01_ZH_CN");
  }
  return module.CONTENT01_ZH_CN;
}

/** Keys that look like Content01 public copy. Used to scope the client's Content01 catalog. */
export const CONTENT01_KEY_PREFIX = "content01.";

/**
 * The Content01 subset of the source catalog, sorted.
 *
 * Sorting is what makes the artifact deterministic: the source object is filled by `text()` calls in
 * evaluation order, which is stable today but is not a contract. A sorted key list plus a stable
 * serializer makes the committed bytes a pure function of the catalog contents.
 */
export function selectContent01Keys(catalog) {
  return Object.keys(catalog)
    .filter((key) => key.startsWith(CONTENT01_KEY_PREFIX))
    .sort();
}

/**
 * Fails closed on anything that would render badly or hide a source problem.
 *
 * A missing or empty value would put an empty string on screen; a value that is itself a raw key would
 * re-create the exact bug this task removes. Both must stop the generator rather than be emitted.
 */
export function validateCatalog(entries) {
  const problems = [];
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length === 0) {
      problems.push(`${key} has no copy (got ${JSON.stringify(value)})`);
      continue;
    }
    if (value.startsWith(CONTENT01_KEY_PREFIX)) {
      problems.push(`${key} maps to the raw key ${JSON.stringify(value)} instead of Chinese copy`);
    }
    if (!/[\u4e00-\u9fff]/.test(value)) {
      problems.push(`${key} maps to copy with no Chinese characters: ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

const HEADER = [
  "// GENERATED FILE — DO NOT HAND-EDIT.",
  "//",
  "// LIVEFIX06 — the full Content01 Chinese copy catalog for the v2-live client.",
  "//",
  "// Derived from packages/content/src/content01-v1.ts (CONTENT01_ZH_CN), which is the single",
  "// source of truth for this wording. The strings are imported, not transcribed, so this file",
  "// cannot drift from the source without the freshness check failing.",
  "//",
  "// Regenerate with:",
  "//   node tools/content01-zh-cn-module.mjs --write",
  "// Verify with:",
  "//   node tools/content01-zh-cn-module.mjs",
  "// tests/livefix06.test.mjs asserts this module equals a fresh read of the source catalog, and",
  "// that a new source key without regeneration fails.",
  ""
].join("\n");

/**
 * Canonical payload serialization, shared by the writer and the freshness check.
 *
 * `JSON.stringify` on an array of [key, value] pairs (not an object) is used deliberately: it is
 * insertion-order stable here because the caller sorts, and it preserves keys verbatim so a key can
 * never be mangled by JS object-key coercion.
 */
export function serializeCatalog(entries) {
  return JSON.stringify(entries, null, 2);
}

/** CommonJS module source for a catalog. JSON is a subset of JS, minus the two line separators. */
export function buildModuleSource(entries) {
  const payload = serializeCatalog(entries).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `${HEADER}module.exports = ${payload};\n`;
}

/** The committed artifact, or null when it does not exist yet. */
export function readCommittedModule(root) {
  const absolute = path.join(root, MODULE_PATH);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
}

/**
 * Compares the committed artifact against the current source catalog.
 *
 * Returns the entries plus a freshness verdict rather than throwing, so a caller can report all three
 * states distinctly: up to date, stale (regenerate), or invalid (the source itself is broken).
 */
export async function checkCatalogFreshness(root) {
  const catalog = await loadSourceCatalog();
  const keys = selectContent01Keys(catalog);
  const entries = keys.map((key) => [key, catalog[key]]);
  const problems = validateCatalog(entries);
  const expected = problems.length === 0 ? buildModuleSource(entries) : null;
  const committed = readCommittedModule(root);
  return {
    keyCount: keys.length,
    problems,
    expected,
    committed,
    fresh: problems.length === 0 && committed === expected,
    missing: committed === null
  };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/content01-zh-cn-module.mjs");

if (isDirectRun) {
  const root = process.cwd();
  const catalog = await loadSourceCatalog();
  const keys = selectContent01Keys(catalog);
  const entries = keys.map((key) => [key, catalog[key]]);
  const problems = validateCatalog(entries);

  if (problems.length > 0) {
    console.log("SOURCE CATALOG INVALID — " + problems.length + " problem(s):");
    for (const problem of problems) console.log("  - " + problem);
    process.exit(1);
  }

  const source = buildModuleSource(entries);

  if (process.argv.includes("--write")) {
    const absolute = path.join(root, MODULE_PATH);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const before = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
    fs.writeFileSync(absolute, source, "utf8");
    console.log(`wrote ${MODULE_PATH} (${source.length} bytes, ${keys.length} keys)${before === source ? " [unchanged]" : ""}`);
  } else {
    const committed = readCommittedModule(root);
    const fresh = committed === source;
    console.log(`${MODULE_PATH}: ${fresh ? "up to date" : committed === null ? "MISSING — run with --write" : "STALE — run with --write"}`);
    console.log(`source catalog: ${keys.length} Content01 keys, all non-empty Chinese copy`);
    console.log(`specifier: ${MODULE_SPECIFIER}`);
    if (!fresh) process.exit(1);
  }
}