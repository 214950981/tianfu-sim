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
  }
  console.log(
    "payload " + moduleSource.length + " bytes; states=" + Object.keys(fixtures.states).length +
    " variants=" + Object.keys(fixtures.variants).length +
    "; specifier=" + FIXTURE_MODULE_SPECIFIER
  );
}
