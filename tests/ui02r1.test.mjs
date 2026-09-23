import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { mapCoreActionIntents, mapSpecialActionIntents } from "../packages/wechat-shell/src/index.ts";
import {
  MIN_FONT_SIZE_RPX,
  PAGE_JSON_PATH,
  PAGE_JS_PATH,
  RPX_PER_SCREEN_WIDTH,
  SAFE_AREA_BOTTOM_WORST_CASE_PX,
  SUPPORTED_BASELINE,
  TOUCH_TARGET_MIN_PX,
  VIEWPORT_MATRIX,
  WXML_PATH,
  WXSS_PATH,
  auditLayout,
  classesOf,
  findByClass,
  parseMediaQuery,
  parseStylesheet,
  parseWxmlElements,
  resolveTokens,
  rpxToPx
} from "../tools/ui02r1-layout-audit.mjs";
import {
  BORDER_BOX_CANDIDATES,
  COMPAT_TARGETS,
  SUPPORTED_AT_RULES,
  auditWxssCompat,
  selectorIsSupported
} from "../tools/wxss-compat-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

/**
 * Frozen UI02R1 base-tree digests (task base = remote source HEAD dc5675d6).
 *
 * They pin, without needing git at test time, that this presentation-only task touched nothing but
 * the 2.0 dev preview surface. A later task that is legitimately allowed to change one of these trees
 * must update the digest and the file count on purpose.
 *
 * `files` is the base file count: it makes the digest non-forgeable by deletion/addition, because the
 * hashed set must have exactly that cardinality after DEVTOOLS_ARTIFACTS is excluded.
 */
const BASE_TREE = {
  "miniprogram/pages/start": { files: 2, digest: "60e0cc693eb8849d74a23b56cca97b7a154e18ad2167013109efb534f1dfbcba" },
  "miniprogram/pages/game": { files: 2, digest: "c04c015e9ea8e37c3ea9d817377cf010a07e618a35d7b84a00f61b816d991cfe" },
  "miniprogram/pages/rank": { files: 4, digest: "3171b3fbbb94368e7ed3df556b1cfb58379911e1bf2d617e19554c37c5c0d605" },
  "miniprogram/app.json": { files: 1, digest: "222ff69299f6e8c800a4e9a5ef334cfeb67a28ace5e55405cee050105e3fb47f" },
  "miniprogram/app.wxss": { files: 1, digest: "50d3287504a6112527997fbbf85678724c457bb90513467609895c936da370fe" },
  pages: { files: 9, digest: "19cdc6c90862f1fc12572bdbf2b394a3dc2119ff75d69840b739f555a0b88700" },
  "packages/core/src": { files: 17, digest: "247b0b9e650aab642824491fc36186fbef552e62dddf9a75cc0ebeaaa92ef80d" },
  "packages/content/src": { files: 18, digest: "3a290c9b6fbf03969990857544709acebaea57d22fe5f864fa9c197b65bfec67" },
  "packages/wechat-shell/src": { files: 1, digest: "f821d3de163d1cb8e9b47e694fc4a73d92e8230c89e9221693962b9cd3582e9c" },
  "packages/application-ui/src": { files: 1, digest: "9548718c649769adcf8b825115c93657ee902a03883dfc2076a528f0688cabd9" },
  "packages/platform-contract/src": { files: 1, digest: "c1b057b87f4fc75554334fce767ca2a46a64e83785ae9dbeca8daf74d8a42bc1" },
  "server/src": { files: 4, digest: "71df0d6e33d0ef815fe6072c701ab53f090508da4f1c31e9a18c2023a3b343a5" },
  "tools/ui02-preview-fixtures.mjs": { files: 1, digest: "9327e7018f256735860d21efbd92f35bfbc1367486f26e011a15d94a8d662c48" },
  "miniprogram/pages/v2-preview/v2-fixtures.json": { files: 1, digest: "af40f19c015a3a00855fa9e031eb7fe15700b0f61af0fd9a96ccd7ad3c869a7d" }
};

/**
 * WeChat DevTools writes these into the worktree as soon as the project is opened for manual visual QA
 * (observed during UI02R1: stock page template + default project settings, mtime 2026-09-23 15:06-15:08).
 * They are generated scratch output, not authored content, and none of them exists in the task base.
 * They are excluded from the byte-equivalence claim — but only by exact path, and nothing else may be,
 * so the digest still fails closed on any other addition inside a pinned tree.
 */
const DEVTOOLS_ARTIFACTS = [
  "miniprogram/project.config.json",
  "miniprogram/pages/v2-preview/project.config.json",
  "miniprogram/pages/game/game.js"
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Base files of a pinned path, as repo-relative POSIX paths, with generated artifacts excluded. */
function baseTreeFiles(relative, ignored = DEVTOOLS_ARTIFACTS) {
  const absolute = path.join(ROOT, relative);
  const stat = fs.statSync(absolute);
  const all = (stat.isDirectory() ? walk(absolute) : [absolute])
    .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"));
  return { all, hashed: all.filter((file) => !ignored.includes(file)).sort() };
}

/** Same algorithm the digests were produced with: sha256 over sorted "<relpath>:<sha256(content)>\n". */
function treeDigestOf(files) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update(":");
    digest.update(createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex"));
    digest.update("\n");
  }
  return digest.digest("hex");
}

const stripCss = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
/** Rule assertions must inspect code, not prose: the page documents what it avoids computing. */
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const wxss = read(WXSS_PATH);
const wxml = read(WXML_PATH);
const pageJs = read(PAGE_JS_PATH);
const pageJson = readJson(PAGE_JSON_PATH);
const fixtures = readJson("miniprogram/pages/v2-preview/v2-fixtures.json");
const audit = auditLayout();
const failureText = audit.failures.map((entry) => `${entry.name} :: ${entry.detail}`).join("\n");

// ---------------------------------------------------------------- audit is green and non-vacuous

test("UI02R1_audit: the structural layout audit is green", () => {
  assert.equal(audit.failures.length, 0, `layout audit failures:\n${failureText}`);
  assert.equal(audit.checks.length >= 80, true, `expected a substantive audit, got ${audit.checks.length} checks`);
  for (const requirement of [
    "page: disableScroll is enabled on the preview route",
    "screen: constrained 100vh viewport with hidden overflow",
    "scroll: .decision-viewport (EVENT / SPECIAL_NODE narrative + options) is a single scroll-view",
    "scroll: .archive-viewport (LIFE_ARCHIVE history) is a single scroll-view",
    "dock: exactly one .action template, driven by the server-projected core action list",
    "touch: the smallest core action target across the matrix is at least 44 CSS px",
    "safe-area: .dock reserves the home-indicator inset"
  ]) {
    assert.equal(audit.checks.some((entry) => entry.name === requirement), true, `missing audit check: ${requirement}`);
  }
});

/**
 * A green audit is worthless if it cannot fail. These negative controls mutate the audited inputs and
 * require the audit to notice, which is what makes the PASS in the previous test meaningful.
 */
test("UI02R1_audit: the audit actually detects contract violations (negative controls)", () => {
  const mutations = [
    ["page-level scroll re-enabled", { pageJson: { ...pageJson, disableScroll: false } }, "disableScroll"],
    [
      "product root allowed to grow",
      { wxss: wxss.replace("  height: 100vh;\n  overflow: hidden;", "  min-height: 100vh;") },
      "100vh"
    ],
    [
      "dev chrome moved into the product flow",
      { wxss: wxss.replace(".dev-trigger {\n  box-sizing: border-box;\n  position: fixed;", ".dev-trigger {\n  box-sizing: border-box;\n  position: static;") },
      "position: fixed"
    ],
    [
      "touch target compressed below 44px",
      { wxss: wxss.replace("--touch-min: 104rpx;", "--touch-min: 80rpx;").replace("--dock-row-h: 104rpx;", "--dock-row-h: 80rpx;") },
      "CORE ACTION TARGET"
    ],
    [
      "core action count no longer driven by the projection",
      { wxml: wxml.replace('wx:for="{{vm.runHome.actions}}"', 'wx:for="{{vm.runHome.attentions}}"') },
      "driven by the server-projected core action list"
    ],
    [
      "breakthrough CTA no longer gated on server availability",
      { wxml: wxml.replace('wx:if="{{vm.runHome.breakthrough.enabled}}"', 'wx:if="{{true}}"') },
      "gated on server-projected availability"
    ],
    [
      "decision surface no longer has a bounded scroll viewport",
      { wxml: wxml.replace('<scroll-view class="decision-viewport" scroll-y>', '<scroll-view class="decision-viewport">') },
      "decision-viewport"
    ],
    [
      "LIFE_ARCHIVE loses its internal scroll viewport",
      { wxml: wxml.replace('<scroll-view class="archive-viewport" scroll-y>', '<scroll-view class="archive-viewport">') },
      "archive-viewport"
    ],
    [
      "dev debug data leaked into the product surface",
      { wxml: wxml.replace('<view class="vital-label">修为</view>', '<view class="vital-label">{{lastIntent}}</view>') },
      "lastIntent"
    ],
    ["attention list uncapped", { pageJs: pageJs.replace("ATTENTION_SLOT_LIMIT = 3", "ATTENTION_SLOT_LIMIT = 12") }, "three public slots"],
    [
      "safe-area inset dropped from the dock",
      { wxss: wxss.replace(/\.dock \{[\s\S]*?\n\}/, ".dock {\n  flex: 0 0 auto;\n}") },
      "safe-area"
    ],
    ["readability floor violated", { wxss: wxss.replace("  color: var(--ink-faint);\n  font-size: 22rpx;\n}", "  color: var(--ink-faint);\n  font-size: 16rpx;\n}") }, "readability"],
    [
      "long public text no longer clamped",
      { wxss: wxss.replace(/\.attn-value \{[\s\S]*?\n\}/, ".attn-value {\n  flex: 1 1 auto;\n  font-size: 26rpx;\n  color: var(--ink-soft);\n}") },
      "ellipsize"
    ],
    [
      "public condition row removed from the one-screen summaries",
      { wxml: wxml.replace('data-drawer="conditions" bindtap="onOpenDrawer"', 'data-drawer="conditions"') },
      "condition"
    ]
  ];

  for (const [label, overrides, expectedFragment] of mutations) {
    const changed = (overrides.wxss !== undefined && overrides.wxss !== wxss) ||
      (overrides.wxml !== undefined && overrides.wxml !== wxml) ||
      (overrides.pageJs !== undefined && overrides.pageJs !== pageJs) ||
      (overrides.pageJson !== undefined && JSON.stringify(overrides.pageJson) !== JSON.stringify(pageJson));
    assert.equal(changed, true, `negative control "${label}" did not mutate its input`);

    const mutated = auditLayout(overrides);
    assert.equal(mutated.failures.length > 0, true, `audit did not detect: ${label}`);
    assert.equal(
      mutated.failures.some((entry) => `${entry.name} ${entry.detail}`.includes(expectedFragment)),
      true,
      `audit failed for the wrong reason on "${label}": ${mutated.failures.map((entry) => entry.name).join(" | ")}`
    );
  }
});

// ---------------------------------------------------------------- WXSS compatibility

/**
 * UI02R1 attempt 1 failed to compile in WeChat DevTools:
 *   ./pages/v2-preview/v2-preview.wxss(150:1): unexpected token '*'
 * The universal selector is not the only WXSS hazard, and the real compiler is not available in this
 * repository, so the stylesheet is held inside a documented, covered subset and that subset is pinned
 * here with negative controls.
 */
test("UI02R1_wxss: the stylesheet stays inside the WXSS-supported syntax subset", () => {
  const result = auditWxssCompat();
  assert.equal(
    result.failures.length,
    0,
    "wxss compatibility failures:\n" + result.failures.map((entry) => entry.name + " :: " + entry.detail).join("\n")
  );
  for (const requirement of [
    COMPAT_TARGETS[0] + ": no universal `*` selector (the DevTools compiler rejects the `*` token)",
    COMPAT_TARGETS[0] + ": no attribute selectors (documented WXSS exception)",
    COMPAT_TARGETS[0] + ": no parameterised pseudo-classes or pseudo-elements (documented WXSS exception)",
    COMPAT_TARGETS[0] + ": every selector stays inside the documented WXSS selector subset",
    COMPAT_TARGETS[0] + ": at-rules limited to " + SUPPORTED_AT_RULES.join(" / "),
    COMPAT_TARGETS[0] + ": media conditions limited to (min|max)-(width|height) in px",
    COMPAT_TARGETS[0] + ": every definite-sized box with padding/border declares border-box (replaces the removed `*`)"
  ]) {
    assert.equal(result.checks.some((entry) => entry.name === requirement), true, "missing compat check: " + requirement);
  }
  assert.equal(result.checks.every((entry) => entry.ok) || result.failures.length === 0, true);
});

test("UI02R1_wxss: removing the universal reset did not silently break the box model", () => {
  // The removed `* { box-sizing: border-box }` used to cover every box. Each box that a definite size
  // and padding/border applies to must now declare it itself, or the one-screen budget arithmetic lies.
  assert.equal(/^\s*\*\s*\{/m.test(stripCss(wxss)), false, "the universal selector must not come back");
  const sheet = parseStylesheet(wxss);
  for (const name of BORDER_BOX_CANDIDATES) {
    const rule = sheet.outerRules.find((entry) => entry.selector === "." + name);
    assert.notEqual(rule, undefined, "." + name + " must exist");
    assert.equal(/box-sizing:\s*border-box/.test(rule.body), true, "." + name + " must declare box-sizing: border-box");
  }
  // and the declaration count stays exactly the derived requirement: no blanket rule smuggled back in
  assert.equal((stripCss(wxss).match(/box-sizing:\s*border-box/g) || []).length, BORDER_BOX_CANDIDATES.length);
});

test("UI02R1_wxss: the compatibility audit detects unsupported WXSS syntax (negative controls)", () => {
  const target = COMPAT_TARGETS[0];
  const mutations = [
    ["universal selector reintroduced", wxss.replace(/^  box-sizing: border-box;\n/gm, "") + "\n* {\n  box-sizing: border-box;\n}\n", "*"],
    ["attribute selector added", wxss + "\n.attn[data-drawer] {\n  color: var(--ink);\n}\n", "attribute"],
    ["parameterised pseudo-class added", wxss + "\n.attn:nth-child(2) {\n  color: var(--ink);\n}\n", "parameterised pseudo"],
    ["unsupported at-rule added", wxss + "\n@supports (display: flex) {\n  page {\n    --x: 1rpx;\n  }\n}\n", "at-rules"],
    ["unsupported media condition added", wxss + "\n@media screen and (orientation: landscape) {\n  page {\n    --x: 1rpx;\n  }\n}\n", "media conditions"],
    ["border-box declarations dropped", wxss.replace(/^  box-sizing: border-box;\n/gm, ""), "border-box"],
    ["sticky positioning added", wxss.replace(".dev-trigger {\n  box-sizing: border-box;\n  position: fixed;", ".dev-trigger {\n  box-sizing: border-box;\n  position: sticky;"), "sticky"]
  ];
  for (const [label, mutated, expectedFragment] of mutations) {
    assert.notEqual(mutated, wxss, 'negative control "' + label + '" did not mutate its input');
    const result = auditWxssCompat(COMPAT_TARGETS, { [target]: mutated });
    assert.equal(result.failures.length > 0, true, "compat audit did not detect: " + label);
    assert.equal(
      result.failures.some((entry) => (entry.name + " " + entry.detail).includes(expectedFragment)),
      true,
      'compat audit failed for the wrong reason on "' + label + '": ' + result.failures.map((entry) => entry.name).join(" | ")
    );
  }
});

test("UI02R1_wxss: the selector whitelist accepts the documented WXSS selector forms and rejects the exclusions", () => {
  for (const selector of ["page", "view", ".screen", ".action", ".attn", ".life-fill", ".life-fill.is-pressing",
    ".life-legend .quiet", ".build-line.is-dominant .build-name", ".attn:active", "view, checkbox", ".a, .b .c", "#firstname"]) {
    assert.equal(selectorIsSupported(selector), true, selector + " should be accepted");
  }
  for (const selector of ["*", ".a > .b", ".a + .b", ".a ~ .b", ".a[data-x]", ".a:nth-child(2)", ".a::before(1)", "::part(x)"]) {
    assert.equal(selectorIsSupported(selector), false, selector + " should be rejected");
  }
  // and the real stylesheet uses no comma list at all, so the construct is never load-bearing
  assert.equal(parseStylesheet(wxss).outerRules.some((rule) => rule.selector.includes(",")), false);
});

// ---------------------------------------------------------------- scope purity

test("UI02R1_scope: server ViewModel, wechat-shell intent mapping, application UI controller, Core/Content gameplay and 1.0 pages are byte-equivalent to the task base", () => {
  for (const relative of Object.keys(BASE_TREE)) {
    const { hashed } = baseTreeFiles(relative);
    assert.equal(hashed.length, BASE_TREE[relative].files, `${relative} must still contain exactly its base files (got ${hashed.join(", ")})`);
    assert.equal(treeDigestOf(hashed), BASE_TREE[relative].digest, `${relative} must be byte-equivalent to the task base`);
  }
});

test("UI02R1_scope: the DevTools-artifact exclusion is narrow and cannot hide a real change", () => {
  // 1. Every excluded path must be absent from the base tree, or the exclusion would mask a real file.
  const baseFiles = new Set();
  for (const relative of Object.keys(BASE_TREE)) {
    for (const file of baseTreeFiles(relative, []).all) baseFiles.add(file);
  }
  for (const artifact of DEVTOOLS_ARTIFACTS) {
    assert.equal(baseFiles.has(artifact), false, `${artifact} must not be a base file`);
  }
  // 2. The allowlist is exactly the observed generated set — it cannot silently grow.
  assert.deepEqual([...DEVTOOLS_ARTIFACTS].sort(), [
    "miniprogram/pages/game/game.js",
    "miniprogram/pages/v2-preview/project.config.json",
    "miniprogram/project.config.json"
  ]);
  // 3. Across every pinned tree, the exclusion removes nothing that is actually there: the hashed set
  //    equals the full set. If a future DevTools run drops a *different* artifact, this fails closed.
  for (const relative of Object.keys(BASE_TREE)) {
    const all = baseTreeFiles(relative, []).all;
    const hashed = baseTreeFiles(relative).hashed;
    assert.equal(hashed.length, all.length, `${relative} contains an unreviewed extra file: ${all.filter((file) => !hashed.includes(file)).join(", ")}`);
  }
});

test("UI02R1_scope: no server / shell / application / core / content vocabulary leaked into the preview layout change", () => {
  for (const file of ["miniprogram/pages/v2-preview/v2-preview.wxml", "miniprogram/pages/v2-preview/v2-preview.js", "miniprogram/pages/v2-preview/v2-preview.wxss"]) {
    const source = read(file);
    for (const forbidden of ["server/src", "viewmodel.ts", "command-gateway", "packages/core/src", "packages/content/src", "packages/wechat-shell", "application-ui"]) {
      assert.equal(source.includes(forbidden), false, `${file} must not reach into ${forbidden}`);
    }
  }
  // presentation-only: the layout refactor introduces no rule computation and no transport
  const pageCode = stripJs(pageJs);
  for (const forbidden of ["Math.random", "difficulty", "checkSpec", "breakthroughScore", "wx.request"]) {
    assert.equal(pageCode.includes(forbidden), false, `preview page must not compute rules: ${forbidden}`);
  }
});

test("UI02R1_route: the preview route registration and default page are untouched", () => {
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-preview/v2-preview");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages.filter((page) => page.includes("v2-preview")).length, 1);
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
});

// ---------------------------------------------------------------- one-screen policy

test("UI02R1_overview: the preview route is structurally unable to create page-level vertical scroll", () => {
  assert.equal(pageJson.disableScroll, true);
  const sheet = parseStylesheet(wxss);
  const pageRule = sheet.outerRules.find((rule) => rule.selector === "page");
  assert.notEqual(pageRule, undefined);
  const pageDecls = Object.fromEntries([...pageRule.body.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  assert.equal(pageDecls.overflow, "hidden");
  assert.equal(pageDecls.height, "100%");
  assert.equal(/height:\s*100vh/.test(wxss), true, "the product root must be a 100vh constrained container");
  assert.equal(/min-height:\s*100vh/.test(wxss), false, "no element may grow the document with min-height: 100vh");
});

test("UI02R1_overview: front-end structure keeps the four core actions in a bottom dock that cannot be pushed off-screen", () => {
  const corners = parseWxmlElements(wxml);
  const dock = findByClass(corners, "dock")[0];
  const grid = findByClass(corners, "dock-grid")[0];
  assert.notEqual(dock, undefined);
  assert.notEqual(grid, undefined);
  assert.equal(dock.ancestors.some((ancestor) => classesOf(ancestor).includes("page--home")), true);
  // the dock is a non-shrinking flex child and the flexible region above it absorbs the slack
  const dockRule = parseStylesheet(wxss).outerRules.find((rule) => rule.selector === ".dock");
  assert.equal(/flex:\s*0 0 auto/.test(dockRule.body), true);
  // the four slots come from the accepted projection, never from markup duplication
  const actionTemplates = findByClass(corners, "action");
  assert.equal(actionTemplates.length, 1);
  assert.equal(actionTemplates[0].attrs.includes('wx:for="{{vm.runHome.actions}}"'), true);
  assert.deepEqual(
    mapCoreActionIntents(fixtures.states.RUN_HOME.view).map((intent) => intent.command.actionId),
    ["cultivate", "travel", "worldly", "pursuit"]
  );
});

test("UI02R1_overview: disabled action slots keep a stable cell so the dock never jumps", () => {
  const elements = parseWxmlElements(wxml);
  const action = findByClass(elements, "action")[0];
  assert.equal(action.attrs.includes("{{item.enabled ? '' : 'is-disabled'}}"), true);
  const disabledRule = parseStylesheet(wxss).outerRules.find((rule) => rule.selector === ".action.is-disabled");
  assert.notEqual(disabledRule, undefined);
  assert.equal(/opacity/.test(disabledRule.body), true);
  // the disabled slot keeps its grid column, so the dock height and width never change
  const actionRule = parseStylesheet(wxss).outerRules.find((rule) => rule.selector === ".action");
  assert.equal(/min-height:\s*var\(--dock-row-h\)/.test(actionRule.body), true);
  assert.equal(/flex:\s*0 0 var\(--dock-col-w\)/.test(actionRule.body), true);
});

test("UI02R1_overview: the breakthrough CTA appears only when the server projection enables it, and the unavailable case is a compact note", () => {
  const elements = parseWxmlElements(wxml);
  const cta = findByClass(elements, "cta");
  const note = findByClass(elements, "dock-note");
  assert.equal(cta.length, 1);
  assert.equal(note.length, 1);
  assert.equal(cta[0].attrs.includes('wx:if="{{vm.runHome.breakthrough.enabled}}"'), true);
  assert.equal(note[0].attrs.includes('wx:elif="{{vm.runHome.breakthrough.note !== \'\'}}"'), true);
  // wx:if means the unavailable variant reserves no CTA block at all (nothing is hidden-but-sized)
  assert.equal(cta[0].attrs.includes("hidden"), false);
  // and the availability itself is exactly the accepted projection
  assert.equal(mapSpecialActionIntents(fixtures.states.RUN_HOME.view)[0].enabled, true);
  assert.equal(mapSpecialActionIntents(fixtures.variants.RUN_HOME_BREAKTHROUGH_BLOCKED.view)[0].enabled, false);
  // the layout never branches on the fixture variant key: the same tree serves availability variants
  for (const variant of ["RUN_HOME_BREAKTHROUGH_BLOCKED", "RUN_HOME_NO_PLATFORM_CAPABILITY"]) {
    assert.equal(wxml.includes(variant), false, `layout must not special-case ${variant}`);
  }
});

// ---------------------------------------------------------------- viewport matrix

test("UI02R1_matrix: the supported portrait baseline and every matrix viewport are explicitly covered by responsive rules", () => {
  assert.deepEqual(SUPPORTED_BASELINE, { minWidth: 320, minHeight: 500 });
  assert.deepEqual(VIEWPORT_MATRIX.map((entry) => `${entry.width}x${entry.height}`), [
    "320x500", "360x560", "375x603", "390x750", "414x820", "430x850"
  ]);
  const sheet = parseStylesheet(wxss);
  assert.equal(sheet.bands.length >= 5, true, "the stylesheet must declare the matrix bands");
  const heightBands = sheet.bands.filter((band) => parseMediaQuery(band.query).conditions.some((condition) => condition.axis === "height"));
  const widthBands = sheet.bands.filter((band) => parseMediaQuery(band.query).conditions.some((condition) => condition.axis === "width"));
  assert.equal(heightBands.length >= 4, true);
  assert.equal(widthBands.length >= 2, true);
  for (const band of sheet.bands) {
    const query = parseMediaQuery(band.query);
    assert.equal(query.residual, "", `unsupported media condition: ${band.query}`);
    assert.equal(query.conditions.length > 0, true);
  }
  for (const viewport of VIEWPORT_MATRIX) {
    const isBaseline = viewport.width === SUPPORTED_BASELINE.minWidth && viewport.height === SUPPORTED_BASELINE.minHeight;
    const width = widthBands.filter((band) => {
      const conditions = parseMediaQuery(band.query).conditions;
      return conditions.every((condition) => (condition.axis === "width"
        ? (condition.kind === "min" ? viewport.width >= condition.value : viewport.width <= condition.value)
        : true));
    });
    const height = heightBands.filter((band) => {
      const conditions = parseMediaQuery(band.query).conditions;
      return conditions.every((condition) => (condition.axis === "height"
        ? (condition.kind === "min" ? viewport.height >= condition.value : viewport.height <= condition.value)
        : true));
    });
    assert.equal(
      width.length >= 1 || isBaseline,
      true,
      `${viewport.width}x${viewport.height} matches no width band and is not the baseline`
    );
    assert.equal(height.length >= 1 || isBaseline, true, `${viewport.width}x${viewport.height} matches no height band and is not the baseline`);
  }
});

test("UI02R1_matrix: the first-screen stack fits every matrix viewport with the home-indicator inset reserved", () => {
  const entries = audit.quantised;
  assert.equal(entries.length, VIEWPORT_MATRIX.length);
  for (const entry of entries) {
    assert.equal(entry.missingTokens.length, 0, `${entry.viewport.width}x${entry.viewport.height} has unresolved layout tokens: ${entry.missingTokens.join(", ")}`);
    assert.equal(
      entry.totalPx <= entry.viewport.height,
      true,
      `${entry.viewport.width}x${entry.viewport.height}: stack ${entry.stackPx.toFixed(1)}px + ${SAFE_AREA_BOTTOM_WORST_CASE_PX}px safe-area exceeds the viewport`
    );
    assert.equal(entry.row >= TOUCH_TARGET_MIN_PX, true, `${entry.viewport.width}x${entry.viewport.height}: core action target ${entry.row.toFixed(2)}px`);
    assert.equal(`${entry.viewport.width}x${entry.viewport.height}`.length > 0, true);
  }
  // tightest case is the supported baseline width, so compliance there implies compliance above it
  const smallest = entries.reduce((worst, entry) => (entry.row < worst.row ? entry : worst), entries[0]);
  assert.equal(smallest.viewport.width, SUPPORTED_BASELINE.minWidth);
  assert.equal(smallest.row >= TOUCH_TARGET_MIN_PX, true);
});

test("UI02R1_matrix: compact-height bands tighten non-interactive spacing instead of shrinking controls", () => {
  const sheet = parseStylesheet(wxss);
  const base = resolveTokens(sheet, 320, 500).tokens;
  const compact = resolveTokens(sheet, 320, 560).tokens;
  // typography and interaction floors are identical: only surrounding space changes
  for (const token of ["--touch-min", "--cta-h", "--dock-row-h"]) {
    assert.equal(compact.get(token), base.get(token), `${token} must not shrink in a compact-height band`);
  }
  assert.equal(rpxToPx(base.get("--touch-min"), 320) >= TOUCH_TARGET_MIN_PX, true);
  // and the compact band genuinely changes something, otherwise it is dead CSS
  const changed = [...base.keys()].filter((key) => compact.get(key) !== base.get(key));
  assert.equal(changed.length > 0, true, "the compact-height band must override at least one layout token");
  assert.equal(changed.includes("--touch-min"), false);
});

test("UI02R1_matrix: no product text is shrunk below the readability floor", () => {
  const sheet = parseStylesheet(wxss);
  const tooSmall = [];
  for (const rule of sheet.outerRules) {
    const match = /font-size:\s*(\d+)rpx/.exec(rule.body);
    if (match === null) continue;
    if (Number(match[1]) < MIN_FONT_SIZE_RPX) tooSmall.push(`${rule.selector} -> ${match[1]}rpx`);
  }
  assert.deepEqual(tooSmall, [], `text shrunk below ${MIN_FONT_SIZE_RPX}rpx (${(MIN_FONT_SIZE_RPX * SUPPORTED_BASELINE.minWidth / RPX_PER_SCREEN_WIDTH).toFixed(2)}px at the baseline): ${tooSmall.join(", ")}`);
});

// ---------------------------------------------------------------- dev layer

test("UI02R1_dev: preview controls and debug output are a collapsed floating overlay outside the product flow", () => {
  const elements = parseWxmlElements(wxml);
  const trigger = findByClass(elements, "dev-trigger");
  const panel = findByClass(elements, "dev-panel");
  const scrim = findByClass(elements, "dev-scrim");
  assert.equal(trigger.length, 1);
  assert.equal(panel.length, 1);
  assert.equal(scrim.length, 1);
  for (const element of [trigger[0], panel[0], scrim[0]]) {
    assert.equal(classesOf(element).includes("surface") || false, false);
    assert.equal(element.ancestors.some((ancestor) => classesOf(ancestor).includes("surface")), false, "dev chrome must not live inside the product surface");
  }
  assert.equal(/devOpen:\s*false/.test(pageJs), true, "dev overlay must start collapsed");
  assert.equal(/onToggleDev/.test(wxml), true);
  // debug-only content lives in the overlay, not in the product surface
  const sheet = parseStylesheet(wxss);
  for (const selector of [".dev-trigger", ".dev-panel", ".dev-scrim"]) {
    const rule = sheet.outerRules.find((entry) => entry.selector === selector);
    assert.equal(/position:\s*fixed/.test(rule.body), true, `${selector} must be a fixed overlay`);
  }
  const surfaceInner = findByClass(elements, "surface")[0].inner;
  for (const marker of ["lastIntent", "decisionId", "onBlockedBack", "gatedEntries", "devOpen"]) {
    assert.equal(surfaceInner.includes(marker), false, `${marker} must not appear in the product surface`);
  }
  const panelInner = panel[0].inner;
  for (const marker of ["lastIntent", "decisionId", "onBlockedBack", "gatedEntries"]) {
    assert.equal(panelInner.includes(marker), true, `${marker} must be reachable from the dev overlay`);
  }
});

test("UI02R1_dev: switching views collapses the overlay so the one-screen result is directly observable", () => {
  assert.equal(/onSelectTab: function/.test(pageJs), true);
  const handler = pageJs.slice(pageJs.indexOf("onSelectTab: function"), pageJs.indexOf("onToggleDev: function"));
  assert.equal(/devOpen:\s*false/.test(handler), true);
  assert.equal(/drawer:\s*null/.test(handler), true);
});

// ---------------------------------------------------------------- EVENT / SPECIAL_NODE

test("UI02R1_decision: EVENT and SPECIAL_NODE are fixed full-screen decision containers with bounded internal scroll", () => {
  const elements = parseWxmlElements(wxml);
  const decisionViewport = findByClass(elements, "decision-viewport");
  assert.equal(decisionViewport.length, 1);
  assert.equal(decisionViewport[0].tag, "scroll-view");
  assert.equal(/(^|\s)scroll-y(\s|$)/.test(decisionViewport[0].attrs), true);
  assert.equal(decisionViewport[0].ancestors.some((ancestor) => classesOf(ancestor).includes("page--decision")), true);
  // the headline is pinned outside the scrolling region, so many options can never push the decision
  // heading off the surface
  const head = findByClass(elements, "decision-head");
  assert.equal(head.length, 1);
  assert.equal(head[0].ancestors.some((ancestor) => classesOf(ancestor).includes("decision-viewport")), false);
  const decisionRule = parseStylesheet(wxss).outerRules.find((rule) => rule.selector === ".decision-viewport");
  assert.equal(/min-height:\s*0/.test(decisionRule.body), true);
  assert.equal(/flex:\s*1 1 auto/.test(decisionRule.body), true);
  // both page states share the exact same container: one decision model, no duplicated surface
  assert.equal((wxml.match(/class="decision-viewport"/g) || []).length, 1);
  assert.equal(/vm\.kind === 'EVENT' \|\| vm\.kind === 'SPECIAL_NODE'/.test(wxml), true);
  // unresolved decisions cannot be escaped through the product surface: the probe lives in the overlay
  const pageDecision = findByClass(elements, "page--decision")[0].inner;
  assert.equal(pageDecision.includes("onBlockedBack"), false);
  assert.equal(fixtures.states.EVENT.shell.ordinaryBackAllowed, false);
  assert.equal(fixtures.states.SPECIAL_NODE.shell.ordinaryBackAllowed, false);
  // long risk copy is bounded
  const reasons = parseStylesheet(wxss).outerRules.find((rule) => rule.selector === ".option-reasons");
  assert.equal(/-webkit-line-clamp:\s*\d+/.test(reasons.body), true);
});

// ---------------------------------------------------------------- LIFE_ARCHIVE

test("UI02R1_archive: LIFE_ARCHIVE stays intentionally scrollable read-only inside its own viewport", () => {
  const elements = parseWxmlElements(wxml);
  const archiveViewport = findByClass(elements, "archive-viewport");
  assert.equal(archiveViewport.length, 1);
  assert.equal(archiveViewport[0].tag, "scroll-view");
  assert.equal(/(^|\s)scroll-y(\s|$)/.test(archiveViewport[0].attrs), true);
  assert.equal(archiveViewport[0].ancestors.some((ancestor) => classesOf(ancestor).includes("page--archive")), true);
  // the archive owns its scroll: it does not make the RUN_HOME product surface grow
  assert.equal(/vm\.kind === 'RUN_HOME'/.test(wxml), true);
  assert.equal(wxml.indexOf("page--archive") > wxml.indexOf("page--home"), true);
  assert.equal(fixtures.states.LIFE_ARCHIVE.archive.readOnly, true);
  // hidden Causes still never surface in the new layout
  assert.equal(JSON.stringify(fixtures).includes("hidden_cause"), false);
});
