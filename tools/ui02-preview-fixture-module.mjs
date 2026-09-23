/**
 * UI02R1 — the preview fixture as a static JS module.
 *
 * Why this exists: the WeChat runtime cannot `require()` a `.json` file. `v2-preview.js` used to do
 * `require("./v2-fixtures.json")`, which threw at runtime, and the surrounding try/catch collapsed that
 * into a "missing file" message — so the preview page showed "缺少 v2-fixtures.json" while the file was
 * present and complete, and the real error was invisible.
 *
 * This tool emits the SAME generated fixture as a CommonJS module (`module.exports = …`) that the
 * WeChat runtime loads reliably. It does not create a second source of truth:
 *
 *   - it imports `buildPreviewFixtures()` from tools/ui02-preview-fixtures.mjs, so the payload comes
 *     from the real production chain (generateServerDestinyOffer -> reduce(START_RUN) ->
 *     ServerViewModelBuilder.build -> buildWeChatPageShell -> mapCoreActionIntents /
 *     mapSpecialActionIntents -> buildArchiveView);
 *   - it serializes exactly `JSON.stringify(fixtures, null, 2)`, so the committed JSON and the module
 *     payload are byte-derivable from one another;
 *   - tests/ui02r1.test.mjs asserts the committed module, the committed JSON and a fresh
 *     buildPreviewFixtures() call are all equal, and that the page requires the module (never the JSON).
 *
 * Second contract owned here: the page must load the module with a STATIC LITERAL require.
 *
 * `require(FIXTURE_MODULE_SPECIFIER)` compiled but failed at runtime with
 * "module '<path>' is not defined", because the WeChat packager builds the dependency graph by
 * statically analysing the source and cannot resolve a variable argument. The verifier below parses
 * every require() argument in the preview entry point (and any other miniprogram module) and rejects
 * anything that is not a plain string literal, so this cannot silently regress again.
 *
 * Usage:
 *   node tools/ui02-preview-fixture-module.mjs           # report freshness (exit 1 when stale)
 *   node tools/ui02-preview-fixture-module.mjs --write   # regenerate the committed module
 *
 * The JSON sibling is owned by tools/ui02-preview-fixtures.mjs:
 *   node tools/ui02-preview-fixtures.mjs --write
 */

import fs from "node:fs";
import path from "node:path";

import { FIXTURE_PATH, buildPreviewFixtures } from "./ui02-preview-fixtures.mjs";

export const FIXTURE_MODULE_PATH = "miniprogram/pages/v2-preview/v2-fixtures.js";

/** The specifier the preview page must use. Kept here so the page and its tests cannot disagree. */
export const FIXTURE_MODULE_SPECIFIER = "./v2-fixtures.js";

export const FIXTURE_JSON_SPECIFIER = "./v2-fixtures.json";

/** The module that consumes the fixture and is therefore subject to the literal-require contract. */
export const FIXTURE_CONSUMER_PATH = "miniprogram/pages/v2-preview/v2-preview.js";

/**
 * Marks which characters are code: comments and string/template bodies are not.
 *
 * Needed because the generated fixture module contains the prose "cannot require() a .json file" in its
 * header, and a JSON payload is entirely string literals. Text inside a comment or a string is data,
 * not a call, so the require scan must not see it.
 */
function codeMask(source) {
  const mask = new Uint8Array(source.length);
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    mask[index] = 1;
    index += 1;
  }
  return mask;
}

/** Index of the `)` matching the `(` at `open`, ignoring parens inside string literals. -1 if none. */
function matchingParen(source, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Every `require(...)` call argument in `source`, verbatim, as `{ raw, specifier, start, end }`.
 * `specifier` is non-null only when the argument is a single plain string literal.
 * Template literals and concatenations yield `specifier: null` — deliberately fail-closed, because the
 * WeChat packager only bundles a plain literal.
 * `start`/`end` locate the call in the source, so a caller can mutate exactly that call.
 */
export function requireArguments(source) {
  const mask = codeMask(source);
  const calls = [];
  for (let index = 0; index < source.length; index += 1) {
    if (mask[index] !== 1) continue;
    if (!source.startsWith("require", index)) continue;
    if (index > 0 && /[\w$.]/.test(source[index - 1])) continue;
    let cursor = index + "require".length;
    while (cursor < source.length && (source[cursor] === " " || source[cursor] === "\t")) cursor += 1;
    if (source[cursor] !== "(") continue;
    const close = matchingParen(source, cursor);
    if (close === -1) {
      calls.push({ raw: source.slice(cursor + 1).trim(), specifier: null, start: index, end: source.length });
      continue;
    }
    const raw = source.slice(cursor + 1, close).trim();
    const literal = /^"([^"']*)"$/.exec(raw) || /^'([^"']*)'$/.exec(raw);
    calls.push({ raw, specifier: literal === null ? null : literal[1], start: index, end: close + 1 });
    index = close;
  }
  return calls;
}

/** Require arguments that are not plain string literals — i.e. the packager cannot bundle them. */
export function nonLiteralRequireArguments(source) {
  return requireArguments(source).filter((call) => call.specifier === null).map((call) => call.raw);
}

/** Every `.js` file under `root`, excluding node_modules, as forward-slash relative paths. */
export function listRuntimeModules(root, relative = "miniprogram") {
  const out = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) out.push(path.relative(root, full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(root, relative));
  return out.sort();
}

/**
 * Verifies the preview entry point loads the fixture with the literal `require("./v2-fixtures.js")`
 * and that no other miniprogram module uses a non-literal require argument.
 */
export function checkFixtureRequire(root) {
  const problems = [];
  const consumer = fs.readFileSync(path.join(root, FIXTURE_CONSUMER_PATH), "utf8");
  const calls = requireArguments(consumer);

  if (calls.length !== 1) {
    problems.push(FIXTURE_CONSUMER_PATH + " must contain exactly one require() call, found " + calls.length);
  }
  const fixtureCalls = calls.filter((call) => call.specifier === FIXTURE_MODULE_SPECIFIER);
  if (fixtureCalls.length !== 1) {
    problems.push(
      FIXTURE_CONSUMER_PATH + " must require " + JSON.stringify(FIXTURE_MODULE_SPECIFIER) +
      " as a string literal; found " + JSON.stringify(calls.map((call) => call.raw))
    );
  }
  // The diagnostics constant must equal the literal actually required, or the failure panel would lie.
  const declared = /var\s+FIXTURE_MODULE_SPECIFIER\s*=\s*(["'])([^"']*)\1/.exec(consumer);
  if (declared === null) problems.push(FIXTURE_CONSUMER_PATH + " must declare var FIXTURE_MODULE_SPECIFIER");
  else if (declared[2] !== FIXTURE_MODULE_SPECIFIER) {
    problems.push("FIXTURE_MODULE_SPECIFIER is " + JSON.stringify(declared[2]) + ", expected " + JSON.stringify(FIXTURE_MODULE_SPECIFIER));
  }

  for (const relative of listRuntimeModules(root)) {
    const offenders = nonLiteralRequireArguments(fs.readFileSync(path.join(root, relative), "utf8"));
    if (offenders.length > 0) {
      problems.push(relative + " uses non-literal require argument(s): " + JSON.stringify(offenders));
    }
  }
  return { ok: problems.length === 0, problems };
}

const HEADER = [
  "// GENERATED FILE — DO NOT HAND-EDIT.",
  "//",
  "// Same production chain as " + FIXTURE_PATH + ":",
  "//   tools/ui02-preview-fixtures.mjs -> generateServerDestinyOffer -> reduce(START_RUN)",
  "//   -> ServerViewModelBuilder.build -> buildWeChatPageShell -> mapCoreActionIntents /",
  "//   mapSpecialActionIntents -> buildArchiveView",
  "//",
  "// Public-only projection data: no rootSeed, RNG state, hidden Cause, hidden NPC state, difficulty,",
  "// CheckSpec, EffectSpec or internal trace is present, because the server never projects them.",
  "//",
  "// The WeChat runtime cannot require() a .json file, so the identical fixture is emitted as this",
  "// static CommonJS module. Regenerate with:",
  "//   node tools/ui02-preview-fixture-module.mjs --write",
  "// tests/ui02r1.test.mjs asserts this module, " + FIXTURE_PATH + " and",
  "// buildPreviewFixtures() are equal.",
  ""
].join("\n");

/** Canonical fixture payload. Single definition, shared by the JSON writer and this module writer. */
export function fixturePayload(fixtures) {
  return JSON.stringify(fixtures, null, 2);
}

/** CommonJS module source for a generated fixture. JSON is a subset of JS, minus two line separators. */
export function buildFixtureModuleSource(fixtures) {
  const payload = fixturePayload(fixtures)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return HEADER + "module.exports = " + payload + ";\n";
}

export function buildFixtureJsonSource(fixtures) {
  return fixturePayload(fixtures) + "\n";
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui02-preview-fixture-module.mjs");

if (isDirectRun) {
  const fixtures = buildPreviewFixtures();
  const moduleSource = buildFixtureModuleSource(fixtures);
  const jsonSource = buildFixtureJsonSource(fixtures);
  const existingModule = fs.existsSync(FIXTURE_MODULE_PATH) ? fs.readFileSync(FIXTURE_MODULE_PATH, "utf8") : null;
  const existingJson = fs.existsSync(FIXTURE_PATH) ? fs.readFileSync(FIXTURE_PATH, "utf8") : null;
  const write = process.argv.includes("--write");

  if (write) {
    fs.mkdirSync(path.dirname(FIXTURE_MODULE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_MODULE_PATH, moduleSource, "utf8");
    console.log("wrote " + FIXTURE_MODULE_PATH + " (" + moduleSource.length + " bytes)");
    if (existingJson !== jsonSource) {
      console.log("NOTE: " + FIXTURE_PATH + " is stale; run: node tools/ui02-preview-fixtures.mjs --write");
    }
  } else {
    const moduleFresh = existingModule === moduleSource;
    const jsonFresh = existingJson === jsonSource;
    console.log(FIXTURE_MODULE_PATH + ": " + (moduleFresh ? "up to date" : "STALE — run with --write"));
    console.log(FIXTURE_PATH + ": " + (jsonFresh ? "up to date" : "STALE — run: node tools/ui02-preview-fixtures.mjs --write"));
    if (!moduleFresh || !jsonFresh) process.exitCode = 1;

    const requireCheck = checkFixtureRequire(process.cwd());
    console.log(
      FIXTURE_CONSUMER_PATH + ": " + (requireCheck.ok
        ? "requires " + JSON.stringify(FIXTURE_MODULE_SPECIFIER) + " with a static literal, and no miniprogram module uses a non-literal require"
        : "FAIL")
    );
    for (const problem of requireCheck.problems) console.log("  - " + problem);
    if (!requireCheck.ok) process.exitCode = 1;
  }
  console.log(
    "payload " + moduleSource.length + " bytes; states=" + Object.keys(fixtures.states).length +
    " variants=" + Object.keys(fixtures.variants).length +
    "; specifier=" + FIXTURE_MODULE_SPECIFIER
  );
}
