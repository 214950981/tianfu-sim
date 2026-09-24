/**
 * UI04C — WeChat route guard.
 *
 * `miniprogram/app.json` is the one file that decides what the packager builds and where the player
 * lands, and it is the file most easily broken by a new page: one careless edit can move the default
 * route, drop a registered page, rename a tabBar entry, or point a page at TypeScript source the
 * packager cannot bundle. This tool audits the **committed** routing surface as an independent
 * adversary, so those regressions are caught mechanically instead of by opening DevTools.
 *
 * The checks, all fail-closed:
 *
 *  A. MANIFEST. `app.json` parses, `pages` is a non-empty array of unique relative page paths, and no
 *     entry names the generated runtime directory — a page registered inside generated output would be
 *     overwritten on the next regeneration.
 *  B. DEFAULT ROUTE. `pages/start/start` is still first. UI04C adds a dev-only page; it must never
 *     become the entry point of the app.
 *  C. LIVE PAGE POSITION. `pages/v2-live/v2-live` is registered exactly once and LAST, and the accepted
 *     `pages/v2-preview/v2-preview` is still registered ahead of it. "Last" is the whole contract: the
 *     dev-only page must be reachable only by navigating to it on purpose.
 *  D. TABBAR. The tabBar is byte-for-byte the accepted one: same entries, same order, same colours. A
 *     live dev page is not a tab.
 *  E. FILES EXIST. Every registered page has at least its `.js` and `.wxml`; a route to a missing file
 *     is a hard packager failure.
 *  F. REQUIRE EDGES. Every `require` in every registered page script is a plain string literal (the
 *     packager resolves dependencies statically), resolves *inside* `miniprogramRoot`, and reaches no
 *     TypeScript source, no `packages/` module and no `server/` module.
 *  G. RUNTIME SEAM. The live page loads the generated runtime through the static literal
 *     `../../runtime/index.js`, and nothing outside that page loads the runtime at all.
 *  H. PREVIEW GUARD. The fixture-driven preview still loads its fixture module, so adding the live page
 *     did not quietly convert the accepted preview into a live surface.
 *
 * Usage:
 *   node tools/route-guard.mjs
 *
 * Exit codes: 0 = the routing surface is exactly the accepted one plus the appended live page; 1 = a
 * violation.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { FIXTURE_MODULE_SPECIFIER, listRuntimeModules, nonLiteralRequireArguments, requireArguments } from "./ui02-preview-fixture-module.mjs";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const APP_JSON_PATH = "miniprogram/app.json";
export const MINIPROGRAM_ROOT = "miniprogram";
export const DEFAULT_ROUTE = "pages/start/start";
export const PREVIEW_ROUTE = "pages/v2-preview/v2-preview";
export const LIVE_ROUTE = "pages/v2-live/v2-live";
export const RUNTIME_SPECIFIER = "../../runtime/index.js";

/** The accepted tabBar, pinned whole: adding a live page must not disturb one byte of it. */
export const PINNED_TABBAR = {
  color: "#888888",
  selectedColor: "#FFD700",
  backgroundColor: "#0A0A0F",
  borderStyle: "black",
  list: [
    { pagePath: "pages/game/game", text: "仙途" },
    { pagePath: "pages/rank/rank", text: "仙榜" }
  ]
};

const defaultRead = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
const defaultExists = (relative) => fs.existsSync(path.join(REPO_ROOT, relative));

/**
 * A canonical, key-sorted rendering of a JSON value.
 *
 * Deliberately recursive: `JSON.stringify(value, Object.keys(value))` would treat the second argument as
 * an allow-list and silently drop nested keys, which would make two different tabBars compare equal.
 */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Audits the committed routing surface.
 *
 * Pure with respect to the repository: every read goes through the injected `read`/`exists` pair, which
 * is how `tests/ui04c.test.mjs` drives the negative controls.
 */
export function runRouteGuard({ read = defaultRead, exists = defaultExists } = {}) {
  const violations = [];
  const report = [];

  // ---------------------------------------------------------------- A. manifest
  let manifest;
  try {
    manifest = JSON.parse(read(APP_JSON_PATH));
  } catch (error) {
    return { ok: false, violations: [`${APP_JSON_PATH}: not parseable JSON (${error.message})`], report: [] };
  }
  const pages = manifest.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return { ok: false, violations: [`${APP_JSON_PATH}: pages must be a non-empty array`], report: [] };
  }
  for (const entry of pages) {
    if (typeof entry !== "string" || entry.length === 0) violations.push(`${APP_JSON_PATH}: a page entry is not a non-empty string`);
    else if (entry.includes("runtime/")) violations.push(`${APP_JSON_PATH}: ${entry} is registered inside the generated runtime directory`);
  }
  const duplicates = pages.filter((entry, index) => pages.indexOf(entry) !== index);
  for (const duplicate of [...new Set(duplicates)]) violations.push(`${APP_JSON_PATH}: ${duplicate} is registered more than once`);
  report.push(`${APP_JSON_PATH}: ${pages.length} registered pages`);

  // ---------------------------------------------------------------- B/C. route order
  if (pages[0] !== DEFAULT_ROUTE) violations.push(`${APP_JSON_PATH}: the default route moved; ${DEFAULT_ROUTE} must stay first (found ${JSON.stringify(pages[0])})`);
  const liveCount = pages.filter((entry) => entry === LIVE_ROUTE).length;
  if (liveCount !== 1) violations.push(`${APP_JSON_PATH}: ${LIVE_ROUTE} must be registered exactly once (found ${liveCount})`);
  else if (pages[pages.length - 1] !== LIVE_ROUTE) violations.push(`${APP_JSON_PATH}: ${LIVE_ROUTE} must be registered last (found at index ${pages.indexOf(LIVE_ROUTE)})`);
  if (!pages.includes(PREVIEW_ROUTE)) violations.push(`${APP_JSON_PATH}: the accepted ${PREVIEW_ROUTE} is no longer registered`);
  else if (pages.indexOf(PREVIEW_ROUTE) > pages.indexOf(LIVE_ROUTE)) violations.push(`${APP_JSON_PATH}: ${LIVE_ROUTE} must not be registered ahead of ${PREVIEW_ROUTE}`);

  // ---------------------------------------------------------------- D. tabBar
  const tabBar = manifest.tabBar;
  if (tabBar === undefined) {
    violations.push(`${APP_JSON_PATH}: the tabBar was removed`);
  } else if (stable(tabBar) !== stable(PINNED_TABBAR)) {
    violations.push(`${APP_JSON_PATH}: the tabBar changed; it must stay byte-for-byte the accepted one`);
  } else {
    report.push(`${APP_JSON_PATH}: tabBar pinned (${tabBar.list.map((entry) => entry.pagePath).join(", ")})`);
  }

  // E. FILES EXIST. Every registered page has its `.wxml`, and every 2.0 page (the pages this project
  // owns) also has its `.js`. The legacy 1.0 tree is accepted as-is and out of scope, so it is not held
  // to the 2.0 file contract — but a *missing* file for a page we registered is still a hard failure.
  for (const entry of pages) {
    if (!exists(`${MINIPROGRAM_ROOT}/${entry}.wxml`)) violations.push(`${MINIPROGRAM_ROOT}/${entry}.wxml: registered page file is missing`);
    if (entry.startsWith("pages/v2-") && !exists(`${MINIPROGRAM_ROOT}/${entry}.js`)) {
      violations.push(`${MINIPROGRAM_ROOT}/${entry}.js: registered 2.0 page script is missing`);
    }
  }

  // ---------------------------------------------------------------- F/G/H. require edges
  const consumers = [];
  for (const entry of new Set(pages)) {
    const relative = `${MINIPROGRAM_ROOT}/${entry}.js`;
    if (!exists(relative)) continue;
    const source = read(relative);
    for (const raw of nonLiteralRequireArguments(source)) {
      violations.push(`${relative}: non-literal require argument ${JSON.stringify(raw)}; the WeChat packager resolves dependencies by static analysis`);
    }
    for (const call of requireArguments(source)) {
      if (call.specifier === null) continue; // already reported above
      // Resolved from the *registered* location, i.e. inside miniprogramRoot, which is where the
      // packager resolves it: `pages/v2-live/v2-live` + `../../runtime/index.js` is
      // `miniprogram/runtime/index.js`, well inside the bundle.
      const resolved = path.posix.normalize(path.posix.join(MINIPROGRAM_ROOT, path.posix.dirname(entry), call.specifier));
      if (!resolved.startsWith(MINIPROGRAM_ROOT + "/")) {
        violations.push(`${relative}: require(${JSON.stringify(call.specifier)}) escapes ${MINIPROGRAM_ROOT}/, so the packager cannot bundle it`);
        continue;
      }
      for (const forbidden of ["packages/", "server/", ".ts", "cloudfunctions/"]) {
        if (resolved.includes(forbidden)) violations.push(`${relative}: require(${JSON.stringify(call.specifier)}) reaches ${forbidden}, which is outside the WeChat bundle`);
      }
      if (resolved.endsWith("/runtime/index.js")) consumers.push(relative);
    }
    if (entry === LIVE_ROUTE && !source.includes(`require("${RUNTIME_SPECIFIER}")`)) {
      violations.push(`${relative}: must load the generated runtime with the static literal require("${RUNTIME_SPECIFIER}")`);
    }
    if (entry === PREVIEW_ROUTE && !source.includes(FIXTURE_MODULE_SPECIFIER)) {
      violations.push(`${relative}: the accepted preview must stay fixture-driven (${FIXTURE_MODULE_SPECIFIER})`);
    }
  }

  // G. only the live page may load the runtime.
  const runtimeConsumers = listRuntimeModules(REPO_ROOT)
    .filter((candidate) => !candidate.startsWith("miniprogram/runtime/"))
    .filter((candidate) => {
      const source = read(candidate);
      return source.includes("runtime/index.js") || source.includes("WeChatRunController");
    });
  const expectedConsumers = [`${MINIPROGRAM_ROOT}/${LIVE_ROUTE}.js`];
  for (const extra of [...new Set(runtimeConsumers)].filter((entry) => !expectedConsumers.includes(entry))) {
    violations.push(`${extra}: loads the generated runtime, but only ${expectedConsumers[0]} is allowed to`);
  }
  if (runtimeConsumers.length > 0) report.push(`runtime consumers: ${[...new Set(runtimeConsumers)].join(", ")}`);

  return { ok: violations.length === 0, violations, report, pages };
}

export function formatRouteGuardReport(result) {
  return result.violations.length > 0
    ? result.violations.join("\n")
    : [...result.report, "UI04C route guard: PASS"].join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/route-guard.mjs");

if (isDirectRun) {
  const result = runRouteGuard({});
  if (result.violations.length > 0) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(formatRouteGuardReport(result));
  }
}
