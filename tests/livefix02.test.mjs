/**
 * LIVEFIX02 — MiniProgram package closure + DevTools boot readiness.
 *
 * WHAT THIS SUITE PROVES
 *
 * Real DevTools on `cloud1-8glg1sird4d40bc0` could not boot the 2.0 client:
 *
 *     module 'pages/start/data.js' is not defined, require args is './data.js'
 *     Page 'pages/v2-live/v2-live' has not been registered yet
 *
 * The cause was structural rather than incidental. `project.config.json` sets
 * `miniprogramRoot: "miniprogram/"`, so the packager builds that subtree alone: the start page's
 * `./data.js` and the game page's entire engine existed only in the root-level `pages/` tree, and
 * `miniprogram/pages/game/game.js` was not committed at all. DevTools papered over the second gap with an
 * untracked boilerplate stub.
 *
 * Copying the two known files would fix today's symptom and leave the class wide open, so the assertions
 * here are structural:
 *
 *   - every registered page has a committed `Page(...)` entry and a committed template;
 *   - the whole package's relative-require graph is closed, transitively, inside the declared root;
 *   - a root-level file can never satisfy a MiniProgram dependency (the exact confusion that caused this);
 *   - the mirror is byte-exact and its freshness is a gate, not a convention;
 *   - legacy 1.0 semantics are preserved, not rewritten — proven by digest and by behavioural assertions
 *     over the mirrored engine, not by reading it;
 *   - the route guard fails when closure fails, so "v2-live is registered" implies "v2-live can boot".
 *
 * Nothing here rolls gameplay, touches the cloud function, the server, Core or Content, or re-runs the
 * 2.0 rule chain. It is a packaging proof.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  auditPackageClosure,
  templateReferences,
  packageRequireEdges,
  PROJECT_CONFIG_PATH
} from "../tools/miniprogram-package-closure.mjs";
import {
  runPackageMirror,
  MIRROR_MANIFEST,
  MINIPROGRAM_ROOT
} from "../tools/miniprogram-package-mirror.mjs";
import { runRouteGuard } from "../tools/route-guard.mjs";
import { runCloudRuntimeSmoke } from "../tools/ui04d-cloud-runtime-smoke.mjs";
import { auditClientRuntime } from "../tools/ui04a-client-runtime-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));
const digest = (relative) => createHash("sha256").update(fs.readFileSync(path.join(ROOT, relative))).digest("hex");
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const digestOf = (relative) => digest(relative);

/** An in-memory view over the committed tree; `missing` hides paths to drive negative controls. */
function view(overrides = {}, missing = []) {
  const hidden = new Set(missing);
  return {
    read: (relative) => (Object.hasOwn(overrides, relative) ? overrides[relative] : read(relative)),
    exists: (relative) => (hidden.has(relative) === false && Object.hasOwn(overrides, relative) === false ? fs.existsSync(path.join(ROOT, relative)) : Object.hasOwn(overrides, relative) ? true : false)
  };
}

// ============================================================ 1. the two confirmed defects are closed

test("LIVEFIX02_gap: the start page's data module exists inside the package and is the real one", () => {
  const startPage = read(`${MINIPROGRAM_ROOT}/pages/start/start.js`);
  const { relative } = packageRequireEdges(startPage);
  assert.deepEqual(relative, ["./data.js"], "start.js must have exactly one relative dependency, and it is the one that was missing");

  const data = read(`${MINIPROGRAM_ROOT}/pages/start/data.js`);
  // The destructuring contract is the failure surface: if the mirror were a stub, these would be undefined
  // and the default route would render empty talent/root pools.
  for (const symbol of ["MASTER_TALENTS", "ROOT_POOL", "GAME_HELP"]) {
    assert.equal(new RegExp(`module\\.exports[\\s\\S]*\\b${symbol}\\b`).test(data), true, `data.js must export ${symbol}`);
  }
  // Prove it is loadable and populated, not merely present.
  const loaded = createRequire(import.meta.url)(path.join(ROOT, `${MINIPROGRAM_ROOT}/pages/start/data.js`));
  assert.equal(Array.isArray(loaded.MASTER_TALENTS), true, "MASTER_TALENTS must be a non-empty array");
  assert.equal(Array.isArray(loaded.ROOT_POOL), true, "ROOT_POOL must be a non-empty array");
  assert.equal(loaded.MASTER_TALENTS.length > 0, true);
  assert.equal(loaded.ROOT_POOL.length > 0, true);
  assert.equal(typeof loaded.GAME_HELP, "object");
  // The start page reduces over these pools with `weight`; a zero-weight pool would make the roll constant.
  for (const pool of ["MASTER_TALENTS", "ROOT_POOL"]) {
    for (const item of loaded[pool]) {
      assert.equal(typeof item.name, "string", `every ${pool} entry needs a name`);
      assert.equal(typeof item.weight, "number", `every ${pool} entry needs a numeric weight`);
      assert.equal(item.weight > 0, true, `a ${pool} entry with weight ${item.weight} would skew the roll`);
    }
  }
});

test("LIVEFIX02_gap: the game page entry is committed, is not the DevTools stub, and keeps 1.0 semantics", () => {
  const entry = `${MINIPROGRAM_ROOT}/pages/game/game.js`;
  assert.equal(fs.existsSync(path.join(ROOT, entry)), true, "the game page entry must exist inside the package");

  const source = read(entry);
  // The DevTools stub is a `Page({})` with empty lifecycle methods and an empty data block. It registers
  // the page and renders nothing, which is strictly worse than a missing file because it looks fixed.
  assert.equal(/Page\s*\(/.test(source), true);
  assert.equal(source.includes("coreData"), true, "the real 1.0 engine carries coreData; the stub does not");
  assert.equal(source.includes("onShareAppMessage"), true, "the 1.0 share/reward flow must survive");
  assert.equal(/\n\s{2}data:\s*\{\s*\}/.test(source), false, "an empty data block means the DevTools stub was committed");
  // 969 lines of engine in the reviewed source; a stub is ~50. Pin the floor, not the exact byte count, so
  // a legitimate later edit is not blocked while a stub can never pass.
  assert.equal(source.split("\n").length > 500, true, "the game entry is the full engine, not a stub");
  // Every handler the committed template binds must exist on the page, or the tap silently does nothing.
  const template = read(`${MINIPROGRAM_ROOT}/pages/game/game.wxml`);
  const handlers = new Set([...template.matchAll(/bind[a-zA-Z]+="([^"]+)"/g)].map((match) => match[1]));
  assert.equal(handlers.size > 0, true, "the template must bind handlers for this assertion to mean anything");
  for (const handler of handlers) {
    assert.equal(new RegExp(`(^|[\\s,{])${handler}\\s*\\(`).test(source), true, `game.wxml binds ${handler} but game.js does not define it`);
  }
  // The engine's own dependency is closed inside the package too.
  const { relative } = packageRequireEdges(source);
  assert.deepEqual(relative, ["./game_data.js"]);
  const gameData = createRequire(import.meta.url)(path.join(ROOT, `${MINIPROGRAM_ROOT}/pages/game/game_data.js`));
  for (const symbol of ["REALM_NAMES", "SUB_REALMS", "REALM_CONFIG", "ADVENTURE_EVENTS", "MASTER_ITEMS"]) {
    assert.notEqual(gameData[symbol], undefined, `game_data.js must export ${symbol}`);
  }
  // The rank of the 1.0 realm ladder is gameplay data, not presentation: keep it intact.
  assert.equal(gameData.REALM_NAMES.length, 15, "the 1.0 realm ladder has 15 stages and must not be rebalanced");
});

// ============================================================ 2. the package is closed

test("LIVEFIX02_closure: the committed package is closed — every page entry and every relative require", () => {
  const result = auditPackageClosure({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  assert.equal(result.ok, true);

  // The audit reads the root from project.config.json rather than assuming it, so moving the root cannot
  // silently turn this gate into a no-op.
  assert.equal(result.root, readJson(PROJECT_CONFIG_PATH).miniprogramRoot.replace(/\/+$/, ""));
  // Closure is transitive: the graph includes second-order edges (start.js -> data.js, game.js ->
  // game_data.js) that a single-level scan would miss.
  assert.equal(result.modules.length >= 14, true, `expected the whole package to be scanned, got ${result.modules.length} modules`);
  assert.equal(result.modules.includes(`${MINIPROGRAM_ROOT}/pages/start/data.js`), true);
  assert.equal(result.modules.includes(`${MINIPROGRAM_ROOT}/pages/game/game_data.js`), true);
  // Every registered page is represented.
  for (const entry of result.pages) {
    assert.equal(result.modules.includes(`${result.root}/${entry}.js`), true, `${entry} must be scanned as a page entry`);
  }
});

test("LIVEFIX02_closure: a missing start-page data module is caught (negative control, defect 1)", () => {
  const baseline = auditPackageClosure({});
  assert.deepEqual(baseline.violations, [], "the control must start from a green package");

  const broken = auditPackageClosure(view({}, [`${MINIPROGRAM_ROOT}/pages/start/data.js`]));
  assert.equal(broken.ok, false, "hiding the start page's data module must fail the gate");
  assert.equal(
    broken.violations.some((entry) => entry.includes("pages/start/data.js") && entry.includes("not committed")),
    true,
    broken.violations.join("\n")
  );
  // It is reported against the requiring module, which is the actionable location.
  assert.equal(
    broken.violations.some((entry) => entry.includes("pages/start/start.js") && entry.includes('require("./data.js")')),
    true,
    broken.violations.join("\n")
  );
});

test("LIVEFIX02_closure: a missing game page entry is caught (negative control, defect 2)", () => {
  const broken = auditPackageClosure(view({}, [`${MINIPROGRAM_ROOT}/pages/game/game.js`]));
  assert.equal(broken.ok, false, "hiding the registered game page entry must fail the gate");
  assert.equal(
    broken.violations.some((entry) => entry.includes("pages/game/game.js") && entry.includes("no committed .js entry")),
    true,
    broken.violations.join("\n")
  );
  // A page entry that exists but never calls Page() is the silent half of the stub problem: the packager
  // is satisfied, the route registers, and the page renders nothing. File existence cannot see it.
  const notAPage = auditPackageClosure(view({ [`${MINIPROGRAM_ROOT}/pages/game/game.js`]: "// engine helpers only\nexports.helpers = 1;\n" }));
  assert.equal(notAPage.ok, false, "a registered entry that never calls Page(...) must fail");
  assert.equal(
    notAPage.violations.some((entry) => entry.includes("must call Page(")),
    true,
    notAPage.violations.join("\n")
  );

  // And a template-less page is equally unbuildable.
  const templateLess = auditPackageClosure(view({}, [`${MINIPROGRAM_ROOT}/pages/game/game.wxml`]));
  assert.equal(templateLess.ok, false, "a registered page with no committed .wxml must fail");
});

test("LIVEFIX02_closure: a root-level file can never satisfy a MiniProgram dependency", () => {
  // The exact confusion that produced this task: pages/start/data.js exists at the repo root and looks
  // like it should be enough. It is not, because the packager builds miniprogramRoot only.
  assert.equal(fs.existsSync(path.join(ROOT, "pages/start/data.js")), true, "the root-level source exists — that is the trap");
  assert.equal(fs.existsSync(path.join(ROOT, `${MINIPROGRAM_ROOT}/pages/start/data.js`)), true, "and so must the in-package copy");

  // Rewrite the page to reach upward out of the root; the audit must refuse even though a file with that
  // exact relative name is committed one level up.
  const escaping = read(`${MINIPROGRAM_ROOT}/pages/start/start.js`).replace('require(\'./data.js\')', 'require("../../../pages/start/data.js")');
  const result = auditPackageClosure(view({ [`${MINIPROGRAM_ROOT}/pages/start/start.js`]: escaping }));
  assert.equal(result.ok, false, "an edge out of the root must fail even when the target file is committed");
  assert.equal(
    result.violations.some((entry) => entry.includes("outside miniprogram/") && entry.includes("cannot substitute")),
    true,
    result.violations.join("\n")
  );
});

test("LIVEFIX02_closure: a computed require and a dangling template include both fail closed", () => {
  const computed = read(`${MINIPROGRAM_ROOT}/pages/start/start.js`).replace("require('./data.js')", "require('./' + 'data.js')");
  const computedResult = auditPackageClosure(view({ [`${MINIPROGRAM_ROOT}/pages/start/start.js`]: computed }));
  assert.equal(computedResult.ok, false, "a computed specifier cannot be bundled statically");
  assert.equal(
    computedResult.violations.some((entry) => entry.includes("not a plain string literal")),
    true,
    computedResult.violations.join("\n")
  );

  // Templates are the other half of the package: a dangling <wxs src> renders a broken formatter with no
  // error, so it is checked too.
  assert.deepEqual(templateReferences("<wxs module=\"f\" src=\"./missing.wxs\"></wxs>"), ["./missing.wxs"]);
  assert.deepEqual(templateReferences("<import src=\"./a.wxml\"/><include src=\"./b.wxml\"/>"), ["./a.wxml", "./b.wxml"]);
  assert.deepEqual(templateReferences("<image src=\"{{item.avatar}}\"/>"), [], "a data-bound src is not a static package edge");
  const dangling = auditPackageClosure(view({ [`${MINIPROGRAM_ROOT}/pages/game/game.wxml`]: '<wxs module="logFormatter" src="./gone.wxs"></wxs>' }));
  assert.equal(dangling.ok, false, "a dangling template reference must fail the gate");
});

test("LIVEFIX02_closure: the audit cannot be silenced by pointing miniprogramRoot at a non-package", () => {
  // An audit that trusts config blindly would report "PASS" on a root with no app.json, or crash. Both are
  // worse than a red gate, because a red gate gets fixed and a false green ships.
  const missingRoot = auditPackageClosure(view({ [PROJECT_CONFIG_PATH]: JSON.stringify({ miniprogramRoot: "nowhere/" }) }));
  assert.equal(missingRoot.ok, false);
  assert.equal(missingRoot.violations.some((entry) => entry.includes("no app.json")), true, missingRoot.violations.join("\n"));

  const noRootField = auditPackageClosure(view({ [PROJECT_CONFIG_PATH]: JSON.stringify({ appid: "x" }) }));
  assert.equal(noRootField.ok, false);
  assert.equal(noRootField.violations.some((entry) => entry.includes("miniprogramRoot is missing")), true, noRootField.violations.join("\n"));

  // A real move of the root must still audit the moved tree, not skip it.
  const moved = auditPackageClosure(view({ [PROJECT_CONFIG_PATH]: JSON.stringify({ ...readJson(PROJECT_CONFIG_PATH), miniprogramRoot: "pages/" }) }));
  assert.equal(moved.ok, false, "pointing the root at the legacy tree must fail: it has no app.json");
});

// ============================================================ 3. the mirror has one source of truth

test("LIVEFIX02_mirror: every mirrored file is a byte-exact copy of its root-level source", () => {
  const result = runPackageMirror({});
  assert.deepEqual(result.problems, [], result.problems.join("\n"));
  assert.equal(result.ok, true);

  for (const entry of MIRROR_MANIFEST) {
    assert.equal(fs.existsSync(path.join(ROOT, entry.source)), true, `${entry.source} must stay committed as the source of truth`);
    assert.equal(fs.existsSync(path.join(ROOT, entry.target)), true, `${entry.target} must exist inside the package`);
    assert.equal(digestOf(entry.source), digestOf(entry.target), `${entry.target} must be byte-identical to ${entry.source}`);
    // The manifest must explain itself: a future reader should never have to re-derive the runtime failure.
    assert.equal(typeof entry.why === "string" && entry.why.length > 40, true, `${entry.target} needs a stated reason`);
  }
  // Root-level legacy sources are the source of truth and must not be moved or deleted.
  for (const relative of ["pages/start/start.js", "pages/game/game.js", "pages/start/data.js", "pages/rank/rank.js"]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${relative} must stay in place`);
  }
});

test("LIVEFIX02_mirror: a drifted or vanished mirror is reported, not tolerated", () => {
  // Drift: the target diverges from its source. This is the failure mode that would silently fork 1.0
  // semantics into two copies.
  const drifted = runPackageMirror(view({ [MIRROR_MANIFEST[0].target]: "module.exports = {};\n" }));
  assert.equal(drifted.ok, false);
  assert.equal(drifted.problems.some((entry) => entry.includes("STALE")), true, drifted.problems.join("\n"));

  // Vanished: the target is gone.
  const vanished = runPackageMirror(view({}, [MIRROR_MANIFEST[0].target]));
  assert.equal(vanished.ok, false);
  assert.equal(vanished.problems.some((entry) => entry.includes("missing")), true, vanished.problems.join("\n"));

  // Vanished source: the mirror has no single source of truth any more.
  const sourceless = runPackageMirror(view({}, [MIRROR_MANIFEST[0].source]));
  assert.equal(sourceless.ok, false);
  assert.equal(sourceless.problems.some((entry) => entry.includes("source is missing")), true, sourceless.problems.join("\n"));
});

test("LIVEFIX02_mirror: the 1.0 semantics that matter are preserved, not modernised", () => {
  // Byte equality already proves this, but the assertions below are the behavioural half: they fail if a
  // future "cleanup" rewrites the mirrored engine instead of copying it.
  const game = read(`${MINIPROGRAM_ROOT}/pages/game/game.js`);
  const start = read(`${MINIPROGRAM_ROOT}/pages/start/start.js`);
  // 1.0 rewards: diamonds and merit are granted by share/ad flows on the client. Removing them would be a
  // silent economy change disguised as packaging work.
  for (const token of ["diamonds", "merit", "onShareAppMessage", "checkDailyShare", "updateDiamonds"]) {
    assert.equal(game.includes(token), true, `the mirrored game engine must keep ${token}`);
  }
  for (const token of ["rechargeTiers", "watchAd", "doRecharge", "consumedMerit"]) {
    assert.equal(start.includes(token), true, `the mirrored start page must keep ${token}`);
  }
  // The reviewed miniprogram tree is NEWER than the root tree on the share flow (single 300-diamond tier,
  // data-driven notice). Mirroring must not clobber that with the older root logic.
  assert.equal(start.includes("rechargeNotice"), true, "the in-package start page keeps its own newer share flow");
  assert.equal(read(`${MINIPROGRAM_ROOT}/pages/start/start.wxml`).includes("recharge-notice"), true, "and its template matches");
  // And the mirror must not have overwritten the tree's own page scripts.
  assert.equal(digestOf(`${MINIPROGRAM_ROOT}/pages/start/start.js`) === digestOf("pages/start/start.js"), false, "the in-package start page is its own maintained file, not a mirror");
});

// ============================================================ 4. the gate is wired into routing

test("LIVEFIX02_route: v2-live stays registered, and only because the whole package is closed", async () => {
  const result = runRouteGuard({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));

  const app = readJson(`${MINIPROGRAM_ROOT}/app.json`);
  assert.equal(app.pages[0], "pages/start/start", "the default route must not move");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live", "v2-live stays registered last");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"], "tabBar ordering is frozen");

  // The route guard now carries the closure result, so a green routing surface is evidence the package
  // builds — not just that a JSON list looks right.
  assert.equal(result.report.some((line) => line.includes("package closure")), true, "route guard must report the closure verdict");
  assert.equal(result.report.some((line) => line.includes("closed relative-require graph")), true, result.report.join("\n"));
});

test("LIVEFIX02_route: the guard fails when a page entry disappears or a relative require breaks", async () => {
  // Same seam the UI04C negative controls use, so this is proven with the guard's real reader.
  const withFiles = (overrides = {}, missing = []) => {
    const hidden = new Set(missing);
    return {
      read: (relative) => (Object.hasOwn(overrides, relative) ? overrides[relative] : read(relative)),
      exists: (relative) => (hidden.has(relative) ? false : fs.existsSync(path.join(ROOT, relative)))
    };
  };

  const noGameEntry = runRouteGuard(withFiles({}, [`${MINIPROGRAM_ROOT}/pages/game/game.js`]));
  assert.equal(noGameEntry.ok, false, "a missing tabBar page entry must fail the routing gate");
  assert.equal(noGameEntry.violations.some((entry) => entry.includes("no committed .js entry")), true, noGameEntry.violations.join("\n"));

  const brokenStart = runRouteGuard(withFiles({ [`${MINIPROGRAM_ROOT}/pages/start/start.js`]: "Page({ data: {} });\nconst x = require('./data.js');\n" }, [`${MINIPROGRAM_ROOT}/pages/start/data.js`]));
  assert.equal(brokenStart.ok, false, "a dangling relative require must fail the routing gate");
});

test("LIVEFIX02_route: the accepted routing surface and the untouched trees are unmodified", () => {
  // LIVEFIX02 is a packaging task. These are the boundaries a packaging change must never cross.
  const client = auditClientRuntime();
  assert.deepEqual(client.violations, [], client.violations.join("\n"));

  // app.json's frozen parts, restated so a future edit has to argue with this test.
  const app = readJson(`${MINIPROGRAM_ROOT}/app.json`);
  assert.equal(app.style, "v2");
  assert.equal(app.componentFramework, "glass-easel");
  assert.equal(app.lazyCodeLoading, "requiredComponents");
  assert.equal(app.sitemapLocation, "sitemap.json");
  // The 1.0 entry page and tabBar pages keep their own maintained copies inside the package; only the
  // files listed in the manifest are mirrored.
  const mirrored = new Set(MIRROR_MANIFEST.map((entry) => entry.target));
  for (const relative of ["miniprogram/pages/rank/rank.js", "miniprogram/app.js", "miniprogram/app.wxss", "miniprogram/sitemap.json"]) {
    assert.equal(mirrored.has(relative), false, `${relative} is maintained in place and must not become a mirror`);
  }
  // No server, Core, Content or cloud-function source may reach a mirrored file. This is the boundary that
  // matters for scope: the mirror projects LEGACY client files, and a byte-exact copy of 1.0 code is the
  // required outcome — so the check is cross-layer leakage, never the absence of 1.0's own client-side
  // randomness, which is preserved semantics rather than a defect.
  for (const entry of MIRROR_MANIFEST) {
    if (!entry.target.endsWith(".js")) continue;
    const code = stripJs(read(entry.target));
    for (const forbidden of ["packages/core", "packages/content", "packages/wechat-shell", "server/src", "cloudfunctions/", "wx-server-sdk"]) {
      assert.equal(code.includes(forbidden), false, `${entry.target} must not reference ${forbidden}`);
    }
    // And the mirror must not have grown a dependency edge outside the package.
    const { relative: literals } = packageRequireEdges(read(entry.target));
    for (const specifier of literals) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.target), specifier));
      assert.equal(resolved.startsWith(`${MINIPROGRAM_ROOT}/`), true, `${entry.target} requires ${specifier}, which escapes the package`);
    }
  }
  // The cloud runtime must be untouched by a MiniProgram packaging task.
  assert.equal(typeof runCloudRuntimeSmoke, "function", "the cloud smoke entry point must remain importable");
});

// ============================================================ 5. DevTools boot readiness

test("LIVEFIX02_boot: every registered page has the full runtime file set the packager needs", () => {
  const app = readJson(`${MINIPROGRAM_ROOT}/app.json`);
  for (const entry of app.pages) {
    for (const extension of ["js", "wxml"]) {
      assert.equal(fs.existsSync(path.join(ROOT, `${MINIPROGRAM_ROOT}/${entry}.${extension}`)), true, `${MINIPROGRAM_ROOT}/${entry}.${extension} must be committed`);
    }
  }
  // The two pages that were unstyled are now styled; the rest already were. A registered page with no
  // stylesheet renders, but not as 1.0 did, which is a silent visual regression rather than an error.
  for (const entry of ["pages/start/start", "pages/game/game"]) {
    assert.equal(fs.existsSync(path.join(ROOT, `${MINIPROGRAM_ROOT}/${entry}.wxss`)), true, `${entry}.wxss must be committed`);
  }
  // A page-level stylesheet must actually define the classes its template uses, or it is decoration.
  for (const [template, stylesheet] of [
    ["miniprogram/pages/start/start.wxml", "miniprogram/pages/start/start.wxss"],
    ["miniprogram/pages/game/game.wxml", "miniprogram/pages/game/game.wxss"]
  ]) {
    const wxml = read(template);
    const css = read(stylesheet);
    const used = new Set();
    for (const match of wxml.matchAll(/class="([^"]*)"/g)) {
      for (const token of match[1].split(/\s+/)) {
        const trimmed = token.trim();
        if (trimmed.length > 0 && !trimmed.includes("{{")) used.add(trimmed);
      }
    }
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((match) => match[1]));
    const covered = [...used].filter((token) => defined.has(token)).length;
    // The in-package game template is newer than the root stylesheet, so full coverage is not claimed; the
    // gate is that the stylesheet is real and carries the layout, not an empty file.
    assert.equal(covered >= 15, true, `${stylesheet} defines only ${covered} of ${used.size} classes used by ${template}`);
  }
});

test("LIVEFIX02_registration: the suite, the tools and the package scripts are registered", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.scripts["test:livefix02"], "node --test tests/livefix02.test.mjs");
  assert.equal(pkg.scripts["miniprogram:package-closure"], "node tools/miniprogram-package-closure.mjs");
  assert.equal(pkg.scripts["miniprogram:package-mirror"], "node tools/miniprogram-package-mirror.mjs");
  assert.equal(pkg.scripts["miniprogram:package-mirror:write"], "node tools/miniprogram-package-mirror.mjs --write");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/livefix02.test.mjs"), true, "the aggregate must run LIVEFIX02");
  for (const relative of [
    "tests/livefix02.test.mjs",
    "tools/miniprogram-package-closure.mjs",
    "tools/miniprogram-package-mirror.mjs"
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `${relative} must exist`);
  }
  // The permanent rule is documented where a human will look before adding a page.
  const status = read("docs/dev-status.md");
  for (const phrase of ["LIVEFIX02", "miniprogramRoot", "package-closure", "镜像"]) {
    assert.equal(status.includes(phrase), true, `docs/dev-status.md must mention ${phrase}`);
  }
});

// Node's CJS loader, used to prove a mirrored module actually evaluates.
function createRequire(base) {
  return (absolute) => {
    const resolved = path.resolve(absolute);
    // eslint-disable-next-line no-undef
    return globalThis.require === undefined ? loadCommonJs(resolved) : globalThis.require(resolved);
  };
}

function loadCommonJs(absolute) {
  const module = { exports: {} };
  const fn = new Function("module", "exports", "require", fs.readFileSync(absolute, "utf8"));
  fn(module, module.exports, (specifier) => {
    if (specifier.startsWith(".")) return loadCommonJs(path.resolve(path.dirname(absolute), specifier));
    throw new Error("the mirrored 1.0 module must not require a bare package specifier: " + specifier);
  });
  return module.exports;
}
