/**
 * LIVEFIX02 — MiniProgram package-closure audit.
 *
 * WHY A STATIC AUDIT AND NOT "ADD THE FILE BACK"
 *
 * The first symptom was a boot error. The cause was structural: `project.config.json` sets
 * `miniprogramRoot: "miniprogram/"`, so the WeChat packager builds that subtree and nothing else. Any
 * file that only exists in the root-level `pages/` tree is invisible to the runtime, and any page
 * registered in `miniprogram/app.json` without a committed `.js` entry is unregistered — which the
 * editor then "fixes" by writing an untracked boilerplate stub. The stub is worse than the defect: it
 * makes the package look complete while shipping a blank page.
 *
 * Copying the two known-missing files would have fixed today's symptom and left the class of defect
 * wide open. This tool closes the whole class: it walks the REAL package the way the packager does, so a
 * future missing entry or missing relative dependency fails a gate instead of a device.
 *
 * WHAT IT PROVES
 *
 *   A. ROOT. `project.config.json` parses and names a `miniprogramRoot` that exists in the tree. An
 *      audit that hard-codes `miniprogram/` would silently stop auditing the package if the root ever
 *      moved, which is the exact failure this task exists to prevent.
 *   B. MANIFEST. `app.json` parses inside that root and lists a non-empty array of unique page entries.
 *   C. PAGE ENTRIES. Every registered page has a committed `.js` that actually calls `Page(` and a
 *      committed `.wxml`. A `.js` without `Page(` compiles and renders nothing; a page with no `.wxml`
 *      renders an empty surface. Neither is a "missing file" the old checks could see.
 *   D. TRANSITIVE JS CLOSURE. Starting from every committed `.js` under the root, every literal relative
 *      `require`/`import` must resolve to a committed file that is itself inside the root. Walking
 *      transitively is the point: `start.js -> data.js` and `game.js -> game_data.js` are second-order
 *      facts that a single-level check cannot see.
 *   E. NO ESCAPE. A specifier that climbs out of the root, or that names a TypeScript source, a
 *      `packages/` module, a `server/` module or a cloud function, is a violation. The packager cannot
 *      bundle any of them, and a root-level `pages/foo.js` is NOT a valid substitute for
 *      `miniprogram/pages/foo.js`.
 *   F. STATIC LITERALS ONLY. A computed `require(someVariable)` cannot be bundled by the packager. The
 *      existing fixture-module audit enforces this for the preview page; this audit enforces it for the
 *      whole package, because a computed specifier is also how a missing file hides from a static scan.
 *   G. WXML TEMPLATE DEPENDENCIES. `<import>` / `<include` / `src` targets in every committed `.wxml` must
 *      resolve inside the root. A template that includes a missing partial renders an incomplete surface
 *      with no error at all.
 *
 * Every check is fail-closed, and every read goes through an injected `read`/`exists`/`listJs` triple so
 * `tests/livefix02.test.mjs` can drive negative controls without touching the working tree.
 *
 * Usage:
 *   node tools/miniprogram-package-closure.mjs           # exit 0 = the package is closed
 *   node tools/miniprogram-package-closure.mjs --json    # machine-readable result
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { requireArguments } from "./ui02-preview-fixture-module.mjs";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const PROJECT_CONFIG_PATH = "project.config.json";

const defaultRead = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
const defaultExists = (relative) => fs.existsSync(path.join(REPO_ROOT, relative));

/** Every `.js` under `root`, forward-slash relative to the repository root, sorted. */
function listJsDefault(relativeRoot) {
  const out = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) out.push(path.relative(REPO_ROOT, full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(REPO_ROOT, relativeRoot));
  return out.sort();
}

/** A relative specifier is "literal relative" only when it is a plain string starting with `./` or `../`. */
function isRelativeSpecifier(specifier) {
  return typeof specifier === "string" && (specifier.startsWith("./") || specifier.startsWith("../"));
}

/** Normalises a repo-relative path the way the packager resolves one. Returns a forward-slash path. */
function normalize(relative) {
  return path.posix.normalize(relative.replace(/\\/g, "/"));
}

/** `<import src>`, `<include src>` and `src="..."` targets, as raw strings. */
export function templateReferences(source) {
  const found = [];
  for (const match of source.matchAll(/<import\s+[^>]*src\s*=\s*"([^"]+)"/g)) found.push(match[1]);
  for (const match of source.matchAll(/<include\s+[^>]*src\s*=\s*"([^"]+)"/g)) found.push(match[1]);
  for (const match of source.matchAll(/<wxs\s+[^>]*src\s*=\s*"([^"]+)"/g)) found.push(match[1]);
  return found;
}

/** The specifiers of interest for a package walk: relative literals and non-literal arguments. */
export function packageRequireEdges(source) {
  const relative = [];
  const computed = [];
  for (const call of requireArguments(source)) {
    if (call.specifier === null) {
      // A computed specifier is only a violation when it could be a package path. `require(FIXTURE)` and
      // `require(prefix + name)` are both unresolvable by the packager, so both are reported; a call with
      // no argument at all is not an edge.
      if (call.raw.length > 0) computed.push(call.raw);
      continue;
    }
    if (isRelativeSpecifier(call.specifier)) relative.push(call.specifier);
  }
  return { relative, computed };
}

/**
 * Audits the committed MiniProgram package.
 *
 * @param read    (relative) => string
 * @param exists  (relative) => boolean
 * @param listJs  (relativeRoot) => string[]   every committed .js under the root
 * @param listWxml(relativeRoot) => string[]   every committed .wxml under the root
 */
export function auditPackageClosure({
  read = defaultRead,
  exists = defaultExists,
  listJs = listJsDefault,
  listWxml = null
} = {}) {
  const violations = [];
  const report = [];

  // ---------------------------------------------------------------- A. the packager root
  let root;
  try {
    const config = JSON.parse(read(PROJECT_CONFIG_PATH));
    root = typeof config.miniprogramRoot === "string" ? config.miniprogramRoot.replace(/\\/g, "/").replace(/\/+$/, "") : null;
  } catch (error) {
    return { ok: false, violations: [`${PROJECT_CONFIG_PATH}: not parseable JSON (${error.message})`], report: [], root: null };
  }
  if (root === null || root.length === 0) {
    return { ok: false, violations: [`${PROJECT_CONFIG_PATH}: miniprogramRoot is missing; the audit cannot know which tree the packager builds`], report: [], root: null };
  }
  if (!exists(`${root}/app.json`)) {
    return { ok: false, violations: [`${root}/app.json: the declared miniprogramRoot has no app.json, so it is not a MiniProgram package`], report: [], root };
  }
  report.push(`${PROJECT_CONFIG_PATH}: miniprogramRoot = ${root}`);

  // ---------------------------------------------------------------- B. the page manifest
  let pages;
  try {
    pages = JSON.parse(read(`${root}/app.json`)).pages;
  } catch (error) {
    return { ok: false, violations: [`${root}/app.json: not parseable JSON (${error.message})`], report, root };
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    return { ok: false, violations: [`${root}/app.json: pages must be a non-empty array`], report, root };
  }
  const duplicates = pages.filter((entry, index) => pages.indexOf(entry) !== index);
  for (const duplicate of [...new Set(duplicates)]) violations.push(`${root}/app.json: ${duplicate} is registered more than once`);
  report.push(`${root}/app.json: ${pages.length} registered pages`);

  // ---------------------------------------------------------------- C. page entries
  for (const entry of pages) {
    const script = `${root}/${entry}.js`;
    const template = `${root}/${entry}.wxml`;
    if (!exists(script)) {
      violations.push(`${script}: registered page has no committed .js entry; the packager cannot register it and DevTools substitutes an untracked stub`);
      continue;
    }
    const source = read(script);
    // A page entry that never calls Page() compiles and renders nothing. That is the silent half of the
    // stub problem, so it is checked explicitly rather than inferred from file existence.
    if (!/(^|[^.\w])Page\s*\(/.test(source)) {
      violations.push(`${script}: a registered page entry must call Page(...); this file would compile and render an empty page`);
    }
    if (!exists(template)) violations.push(`${template}: registered page has no committed .wxml`);
  }

  // ---------------------------------------------------------------- D/E/F. transitive JS closure
  const committedJs = listJs(root);
  const visited = new Set();
  const queue = [...committedJs];
  const scanned = [];

  while (queue.length > 0) {
    const relative = normalize(queue.shift());
    if (visited.has(relative)) continue;
    visited.add(relative);
    if (!exists(relative)) {
      violations.push(`${relative}: reachable in the package graph but not committed`);
      continue;
    }
    const source = read(relative);
    scanned.push(relative);
    const { relative: literals, computed } = packageRequireEdges(source);
    for (const raw of computed) {
      violations.push(`${relative}: require(${JSON.stringify(raw)}) is not a plain string literal; the packager resolves dependencies statically and cannot bundle it`);
    }
    for (const specifier of literals) {
      const resolved = normalize(path.posix.join(path.posix.dirname(relative), specifier));
      // E: an edge out of the root is unbuildable. Checking the prefix BEFORE existence is deliberate — a
      // root-level pages/foo.js must never satisfy miniprogram/pages/foo.js's require.
      if (resolved !== root && !resolved.startsWith(root + "/")) {
        violations.push(`${relative}: require(${JSON.stringify(specifier)}) resolves to ${resolved}, outside ${root}/, so the packager cannot bundle it and a root-level file cannot substitute for it`);
        continue;
      }
      for (const forbidden of ["packages/", "server/", "cloudfunctions/", "node_modules/"]) {
        if (resolved.includes(forbidden)) violations.push(`${relative}: require(${JSON.stringify(specifier)}) reaches ${forbidden}, which is outside the WeChat bundle`);
      }
      if (!exists(resolved)) {
        violations.push(`${relative}: require(${JSON.stringify(specifier)}) resolves to ${resolved}, which is not committed inside ${root}/`);
        continue;
      }
      if (resolved.endsWith(".js") && !visited.has(resolved)) queue.push(resolved);
    }
  }
  report.push(`${root}/: ${scanned.length} committed JS modules form a closed relative-require graph`);

  // ---------------------------------------------------------------- G. template dependencies
  const templates = listWxml === null
    ? fs.existsSync(path.join(REPO_ROOT, root))
      ? listWxmlDefault(root)
      : []
    : listWxml(root);
  for (const relative of templates) {
    if (!exists(relative)) {
      violations.push(`${relative}: committed template is not readable`);
      continue;
    }
    for (const specifier of templateReferences(read(relative))) {
      if (!isRelativeSpecifier(specifier)) continue; // absolute URLs and package names are not package edges
      const resolved = normalize(path.posix.join(path.posix.dirname(relative), specifier));
      if (!resolved.startsWith(root + "/")) {
        violations.push(`${relative}: <import>/<include>/<wxs src="${specifier}"> resolves to ${resolved}, outside ${root}/`);
        continue;
      }
      if (!exists(resolved)) violations.push(`${relative}: template reference ${JSON.stringify(specifier)} resolves to ${resolved}, which is not committed inside ${root}/`);
    }
  }
  report.push(`${root}/: ${templates.length} committed templates have no dangling include`);

  return { ok: violations.length === 0, violations, report, root, pages, modules: scanned };
}

function listWxmlDefault(relativeRoot) {
  const out = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".wxml")) out.push(path.relative(REPO_ROOT, full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(REPO_ROOT, relativeRoot));
  return out.sort();
}

export function formatPackageClosureReport(result) {
  return result.violations.length > 0
    ? result.violations.join("\n")
    : [...result.report, "LIVEFIX02 MiniProgram package closure: PASS"].join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/miniprogram-package-closure.mjs");

if (isDirectRun) {
  const result = auditPackageClosure({});
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: result.ok, root: result.root, violations: result.violations, report: result.report }, null, 2));
  } else if (result.violations.length > 0) {
    console.error(result.violations.join("\n"));
  } else {
    console.log(formatPackageClosureReport(result));
  }
  if (!result.ok) process.exitCode = 1;
}
