/**
 * UI02R2A2 — RUN_HOME visual recomposition: structural invariants that are actually machine-checkable.
 *
 * This file pins WHAT the recomposition changed and WHAT it must not have changed. It deliberately
 * re-derives its numbers from the committed stylesheet through the existing audit parser, so a later
 * edit that quietly reintroduces the dead middle gap or shrinks a control fails here rather than
 * drifting silently.
 *
 * It cannot judge whether the result looks good. Visual acceptance is still a human DevTools pass —
 * see docs/UI02_PREVIEW.md 5.3.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { FIXTURE_MODULE_PATH, FIXTURE_MODULE_SPECIFIER } from "../tools/ui02-preview-fixture-module.mjs";
import {
  PAGE_JS_PATH,
  WXML_PATH,
  WXSS_PATH,
  VIEWPORT_MATRIX,
  SAFE_AREA_BOTTOM_WORST_CASE_PX,
  TOUCH_TARGET_MIN_PX,
  auditLayout,
  parseStylesheet,
  resolveTokens,
  runHomeStack,
  parseDeclarations,
  ruleBody
} from "../tools/ui02r1-layout-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const wxss = read(WXSS_PATH);
const wxml = read(WXML_PATH);
const pageJs = read(PAGE_JS_PATH);
const sheet = parseStylesheet(wxss);
const rule = (selector) => sheet.outerRules.find((entry) => entry.selector === selector);
const declsOf = (selector) => parseDeclarations(ruleBody(sheet, selector));

const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripMarkup = (source) => source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Runs the preview page module in a sandbox, exposing its presentation layer and Page options. */
function loadPreviewPage() {
  const sandbox = {
    module: { exports: {} },
    Page: (options) => { sandbox.pageOptions = options; },
    require: (specifier) => {
      assert.equal(specifier, FIXTURE_MODULE_SPECIFIER, "the page may only load the generated fixture module");
      const fixtureSandbox = { module: { exports: {} } };
      vm.runInNewContext(read(FIXTURE_MODULE_PATH), fixtureSandbox);
      return fixtureSandbox.module.exports;
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(pageJs, sandbox);
  return sandbox;
}

const TALL_HEIGHT = 750;
/** Leftover flexible height must stay under this share of the viewport, or it reads as a dead field. */
const DEAD_SPACE_MAX_SHARE = 0.05;

// ---------------------------------------------------------------- the dead middle gap is closed

test("UI02R2A2_rhythm: the one-screen stack still fits every matrix viewport", () => {
  const { quantised, failures } = auditLayout();
  assert.equal(failures.length, 0, "layout audit failures:\n" + failures.map((f) => f.name + " :: " + f.detail).join("\n"));
  assert.equal(quantised.length, VIEWPORT_MATRIX.length);
  for (const entry of quantised) {
    assert.equal(
      entry.stackPx + SAFE_AREA_BOTTOM_WORST_CASE_PX <= entry.viewport.height,
      true,
      `${entry.viewport.width}x${entry.viewport.height}: stack ${entry.stackPx.toFixed(1)}px + safe-area exceeds the viewport`
    );
  }
});

test("UI02R2A2_rhythm: no large unexploited gap is left between the information and the action area", () => {
  // Everything the fixed regions do not use lands in the one flexible box (the priorities panel). If
  // that remainder is large it reads as an empty field, which is exactly what was rejected. The fix is
  // allocation, not scrolling: the tall bands give the room back to the content.
  const { quantised } = auditLayout();
  for (const entry of quantised) {
    const share = entry.slackPx / entry.viewport.height;
    assert.equal(
      share <= DEAD_SPACE_MAX_SHARE,
      true,
      `${entry.viewport.width}x${entry.viewport.height}: ${entry.slackPx.toFixed(1)}px of unused height ` +
        `(${(share * 100).toFixed(1)}% of the viewport) exceeds the ${DEAD_SPACE_MAX_SHARE * 100}% dead-space ceiling`
    );
  }
  // the tall/normal phones specifically: this is where the old composition left 136-145 CSS px
  for (const entry of quantised.filter((item) => item.viewport.height >= TALL_HEIGHT)) {
    assert.equal(
      entry.slackPx <= 32,
      true,
      `${entry.viewport.width}x${entry.viewport.height}: ${entry.slackPx.toFixed(1)}px of dead height on a tall viewport`
    );
  }
});

test("UI02R2A2_rhythm: the dead-space check actually detects the pre-recomposition layout (negative control)", () => {
  // Reverting the tall-band rhythm tokens to their UI02R2 values must re-open the gap. This proves the
  // ceiling above is measuring the real composition rather than rubber-stamping whatever it is given.
  const regressed = wxss
    .replace("--screen-pad-top: 24rpx;", "--screen-pad-top: 20rpx;")
    .replace("--hero-name-lh: 112rpx;", "--hero-name-lh: 100rpx;")
    .replace("--hero-name-lh: 116rpx;", "--hero-name-lh: 108rpx;")
    .replace("--hero-meta-h: 50rpx;", "--hero-meta-h: 44rpx;")
    .replace("--hero-meta-h: 54rpx;", "--hero-meta-h: 44rpx;")
    .replace("--life-h: 72rpx;", "--life-h: 60rpx;")
    .replace("--vitals-h: 120rpx;", "--vitals-h: 96rpx;")
    .replace("--attn-head-h: 52rpx;", "--attn-head-h: 44rpx;")
    .replace("--attn-slot-h: 116rpx;", "--attn-slot-h: 82rpx;")
    .replace("--attn-slot-h: 120rpx;", "--attn-slot-h: 88rpx;")
    .replace("--dock-pad-top: 24rpx;", "--dock-pad-top: 20rpx;")
    .replace("--dock-pad-top: 28rpx;", "--dock-pad-top: 20rpx;")
    .replace("--dock-pad-bottom: 20rpx;", "--dock-pad-bottom: 16rpx;")
    .replace("--attn-note-pad: 10rpx;", "--attn-note-pad: 8rpx;");
  assert.notEqual(regressed, wxss, "the negative control must actually rewrite the tokens");
  const { quantised } = auditLayout({ wxss: regressed });
  const tall = quantised.filter((entry) => entry.viewport.height >= TALL_HEIGHT);
  assert.equal(tall.length, 3);
  for (const entry of tall) {
    assert.equal(
      entry.slackPx > 32,
      true,
      `${entry.viewport.width}x${entry.viewport.height}: reverting the rhythm tokens should re-open the gap, got ${entry.slackPx.toFixed(1)}px`
    );
  }
});

test("UI02R2A2_rhythm: the extra room went into content, never into smaller controls", () => {
  const base = resolveTokens(sheet, 320, 500).tokens;
  for (const viewport of VIEWPORT_MATRIX) {
    const tokens = resolveTokens(sheet, viewport.width, viewport.height).tokens;
    for (const token of ["--touch-min", "--cta-h", "--dock-row-h"]) {
      const floor = Number.parseFloat(base.get(token));
      const value = Number.parseFloat(tokens.get(token));
      assert.equal(value >= floor, true, `${token} must never shrink below the baseline at ${viewport.width}x${viewport.height}`);
    }
    assert.equal(
      Number.parseFloat(tokens.get("--attn-slot-h")) >= Number.parseFloat(base.get("--attn-slot-h")),
      true,
      `attention rows must not be compressed at ${viewport.width}x${viewport.height}`
    );
  }
  // and the floors themselves are still the frozen UI02/UI02R1 values
  assert.equal(base.get("--touch-min"), "104rpx");
  assert.equal(base.get("--cta-h"), "104rpx");
  assert.equal(base.get("--dock-row-h"), "104rpx");
  assert.equal(base.get("--radius"), "4rpx");
  const smallest = Math.min(...VIEWPORT_MATRIX.map((viewport) => {
    const tokens = resolveTokens(sheet, viewport.width, viewport.height).tokens;
    return (Number.parseFloat(tokens.get("--dock-row-h")) * viewport.width) / 750;
  }));
  assert.equal(smallest >= TOUCH_TARGET_MIN_PX, true, "core action target floor");
});

// ---------------------------------------------------------------- viewport matrix is untouched

test("UI02R2A2_matrix: the responsive band structure is unchanged (no new or reordered band)", () => {
  // "Responsive rhythm" here means new VALUES inside the existing bands. Adding or reordering a band
  // would change the viewport matrix contract, which this task must not do.
  assert.deepEqual(sheet.bands.map((band) => band.query), [
    "(min-width: 340px)",
    "(min-width: 400px)",
    "(min-height: 560px)",
    "(min-height: 600px)",
    "(min-height: 750px)",
    "(min-height: 820px)"
  ]);
  const { quantised } = auditLayout();
  for (const entry of quantised) {
    assert.equal(entry.missingTokens.length, 0, `${entry.viewport.width}x${entry.viewport.height} has unresolved tokens`);
  }
});

// ---------------------------------------------------------------- grouped surfaces, distinct roles

test("UI02R2A2_surfaces: hero / vitals / attention / dock each carry a distinct surface treatment", () => {
  const hero = declsOf(".hero");
  const vitals = declsOf(".vitals");
  const attention = declsOf(".attention");
  const dockGrid = declsOf(".dock-grid");

  // identity plate: raised, and the one cinnabar edge on RUN_HOME
  assert.equal(hero.get("background-color"), "var(--paper-raised)");
  assert.equal(hero.get("border-left"), "4rpx solid var(--cinnabar-soft)");
  // cultivation status: one raised card with a full hairline edge, still the reserved token height
  assert.equal(vitals.get("background-color"), "var(--paper-raised)");
  assert.equal(vitals.get("border"), "var(--hairline) solid var(--rule)");
  assert.equal(vitals.get("box-sizing"), "border-box");
  assert.equal(vitals.get("height"), "var(--vitals-h)");
  // priorities: the inset panel, and the only flexible box
  assert.equal(attention.get("background-color"), "var(--paper-sunk)");
  assert.equal(attention.get("border"), "var(--hairline) solid var(--rule)");
  assert.equal(attention.get("box-sizing"), "border-box");
  assert.equal(String(attention.get("flex")).startsWith("1 1"), true);
  // action group: one recessed tray behind the four core actions
  assert.equal(dockGrid.get("background-color"), "var(--paper-sunk)");

  // the roles are genuinely distinct: raised identity/status vs inset priorities/actions
  const backgrounds = [hero, vitals, attention, dockGrid].map((d) => d.get("background-color"));
  assert.equal(new Set(backgrounds).size >= 2, true, "the surfaces must not collapse into one flat field");

  // and the fixed regions stay fixed: only the priorities panel may absorb the remainder
  for (const selector of [".hero", ".vitals", ".dock"]) {
    assert.equal(String(declsOf(selector).get("flex")).startsWith("0 0"), true, selector + " must not grow into the remainder");
  }
});

test("UI02R2A2_surfaces: the hero reads as identity / realm / lifespan at a glance", () => {
  // realm identity is a compact chip, not a loose line of text
  const realm = declsOf(".hero-realm");
  assert.equal(realm.get("border"), "var(--hairline) solid var(--gold-soft)");
  assert.equal(realm.get("border-radius"), "var(--radius)");
  assert.equal(realm.get("color"), "var(--gold)");
  // the realm name stays the only large type
  assert.equal(/font-size:\s*52rpx/.test(rule(".hero-name").body), true);
  assert.equal(/font-weight:\s*600/.test(rule(".hero-name").body), true);
  // lifespan is a gauge: a rounded, clipped track
  const track = declsOf(".life-track");
  assert.equal(track.get("border-radius"), "3rpx");
  assert.equal(track.get("overflow"), "hidden");
  assert.equal(declsOf(".life-fill").get("border-radius"), "3rpx");
  // and the three parts are still rendered together inside the plate
  const markup = stripMarkup(wxml);
  for (const marker of ['class="hero-name"', 'class="hero-realm"', 'class="life"']) {
    assert.equal(markup.includes(marker), true, marker + " must still render");
  }
});

test("UI02R2A2_surfaces: the row marker is deterministic decoration, not projected state", () => {
  const markup = stripMarkup(wxml);
  assert.equal((markup.match(/class="attn-mark"/g) || []).length, 2, "one marker per priority row template");
  // no binding, no conditional class, no data-* : it cannot vary with the projection
  for (const line of markup.split("\n").filter((entry) => entry.includes("attn-mark"))) {
    assert.equal(/\{\{/.test(line), false, "the marker must carry no binding: " + line.trim());
    assert.equal(/wx:/.test(line), false, "the marker must carry no directive: " + line.trim());
    assert.equal(/data-/.test(line), false, "the marker must carry no payload: " + line.trim());
  }
  const mark = declsOf(".attn-mark");
  assert.equal(mark.get("background-color"), "var(--gold-soft)");
  assert.equal(mark.get("width"), mark.get("height"), "the marker is a square, i.e. pure geometry");
});

// ---------------------------------------------------------------- contract surfaces preserved

test("UI02R2A2_contract: all four core actions stay first-screen visible in one operation group", () => {
  const { quantised } = auditLayout();
  // the audited worst-case stack already prices both dock rows, so "it fits" == "they are visible"
  for (const entry of quantised) {
    assert.equal(entry.stackPx + SAFE_AREA_BOTTOM_WORST_CASE_PX <= entry.viewport.height, true, `${entry.viewport.width}x${entry.viewport.height}`);
  }
  const stack = runHomeStack(resolveTokens(sheet, 320, 500).tokens, 320);
  const rows = stack.parts.find((part) => part.id === "dock-rows");
  assert.equal(rows.count, 2, "the 2x2 dock is priced as two rows");
  // and the dock is a non-shrinking flex child, so the actions can never be squeezed out
  assert.equal(String(declsOf(".dock").get("flex")).startsWith("0 0"), true);
  assert.equal(/wx:for="\{\{vm\.runHome\.actions\}\}"/.test(wxml), true);
  assert.equal((stripMarkup(wxml).match(/class="dock-grid"/g) || []).length, 1);
});

test("UI02R2A2_contract: breakthrough stays server-gated and visually primary", () => {
  const markup = stripMarkup(wxml);
  assert.equal(/wx:if="\{\{vm\.runHome\.breakthrough\.enabled\}\}"/.test(markup), true);
  assert.equal(/data-intent="\{\{vm\.runHome\.breakthrough\.intentId\}\}"/.test(markup), true, "the intent id is unchanged");
  // primary control: solid ink with paper text, while the four actions stay light outline secondaries
  assert.equal(declsOf(".cta").get("background-color"), "var(--ink)");
  assert.equal(declsOf(".cta-label").get("color"), "var(--paper)");
  assert.equal(declsOf(".action").get("background-color"), "var(--paper-raised)");
  // the CTA is never smaller than an action row
  for (const viewport of VIEWPORT_MATRIX) {
    const tokens = resolveTokens(sheet, viewport.width, viewport.height).tokens;
    assert.equal(
      Number.parseFloat(tokens.get("--cta-h")) >= Number.parseFloat(tokens.get("--dock-row-h")),
      true,
      `CTA must not be smaller than a core action at ${viewport.width}x${viewport.height}`
    );
  }
});

test("UI02R2A2_contract: attention keeps at most three summaries plus one condition row", () => {
  const markup = stripMarkup(wxml);
  const start = markup.indexOf('class="attention-scroll"');
  const end = markup.indexOf("</scroll-view>", start);
  const region = markup.slice(start, end);
  assert.equal((region.match(/class="attn"/g) || []).length, 2, "one summary template + one condition row");
  assert.equal(/wx:for="\{\{vm\.runHome\.attentions\}\}"/.test(region), true);
  assert.equal(/ATTENTION_SLOT_LIMIT = 3/.test(stripJs(pageJs)), true);
  assert.equal(/\.slice\(0, ATTENTION_SLOT_LIMIT\)/.test(stripJs(pageJs)), true);
  // every row still opens a read-only drawer
  for (const line of region.split("\n").filter((entry) => entry.includes('class="attn"'))) {
    assert.equal(/bindtap="onOpenDrawer"/.test(line + region), true);
  }
  assert.equal((region.match(/data-drawer=/g) || []).length, 2);
});

test("UI02R2A2_contract: scroll ownership, safe area and the no-page-scroll rule are unchanged", () => {
  const json = JSON.parse(read("miniprogram/pages/v2-preview/v2-preview.json"));
  assert.equal(json.disableScroll, true);
  assert.equal(declsOf(".screen").get("height"), "100vh");
  assert.equal(declsOf(".screen").get("overflow"), "hidden");
  for (const selector of [".surface", ".page", ".home-body", ".attention"]) {
    const decls = declsOf(selector);
    assert.equal(decls.get("min-height"), "0", selector + " must be compressible");
    assert.equal(decls.get("overflow"), "hidden", selector + " must not extend the document");
  }
  for (const selector of [".dock", ".decision-viewport", ".archive-viewport", ".drawer"]) {
    assert.equal(
      /env\(safe-area-inset-bottom/.test(ruleBody(sheet, selector)),
      true,
      selector + " must still reserve the home-indicator inset"
    );
  }
  // the only vertical scroll containers are the bounded ones
  assert.equal((stripMarkup(wxml).match(/scroll-y/g) || []).length >= 4, true);
});

test("UI02R2A2_contract: the UI02R2 Chinese presentation labels and raw fallback are intact", () => {
  // This task is a visual recomposition: it must not have disturbed the label layer.
  const sandbox = loadPreviewPage();
  const home = sandbox.present("RUN_HOME").runHome;
  assert.equal(home.realmName, "凡人");
  assert.equal(home.realmOrderLabel, "未入修行");
  assert.ok(home.conditionSummary.includes("伤患 ×1"), home.conditionSummary);
  assert.equal(sandbox.presentLabel(sandbox.REALM_LABELS, "void-refining"), "void-refining", "unknown ids still fall back verbatim");
  assert.equal(sandbox.presentLabel(sandbox.REALM_LABELS, "qi-refining"), "炼气");
});

test("UI02R2A2_contract: the dev overlay stays functional but visually subordinate", () => {
  const markup = stripMarkup(wxml);
  const surfaceStart = markup.indexOf('class="surface"');
  const devStart = markup.indexOf("dev-trigger");
  assert.ok(surfaceStart >= 0 && devStart > surfaceStart);
  const product = markup.slice(surfaceStart, devStart);
  for (const marker of ["lastIntent", "decisionId", "onBlockedBack", "gatedEntries", "devOpen"]) {
    assert.equal(product.includes(marker), false, marker + " must stay out of the product surface");
  }
  assert.equal(/devOpen:\s*false/.test(stripJs(pageJs)), true, "the overlay is collapsed by default");
  assert.equal(declsOf(".dev-trigger").get("position"), "fixed", "zero product layout height");
});

test("UI02R2A2_design: the frozen paper/ink/cinnabar/gold language is preserved (no neon, no glow)", () => {
  for (const token of ["--paper:", "--ink:", "--cinnabar:", "--gold:"]) {
    assert.equal(wxss.includes(token), true, "frozen design token " + token + " must stay");
  }
  const sources = [stripMarkup(wxml), stripJs(pageJs), wxss.replace(/\/\*[\s\S]*?\*\//g, "")].join("\n");
  for (const neon of ["#FFD700", "#050508", "#55ff55", "#55ccff", "#dd55ff", "text-shadow", "box-shadow"]) {
    assert.equal(sources.includes(neon), false, "legacy neon value leaked: " + neon);
  }
  // no product text shrunk below the readability floor
  for (const entry of sheet.outerRules) {
    const match = /font-size:\s*(\d+)rpx/.exec(entry.body);
    if (match === null) continue;
    assert.equal(Number(match[1]) >= 20, true, entry.selector + " is below the 20rpx readability floor");
  }
});
