import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { FIXTURE_MODULE_PATH, FIXTURE_MODULE_SPECIFIER } from "../tools/ui02-preview-fixture-module.mjs";
import { PAGE_JS_PATH, WXML_PATH, WXSS_PATH, parseStylesheet } from "../tools/ui02r1-layout-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

const pageJs = read(PAGE_JS_PATH);
const wxml = read(WXML_PATH);
const wxss = read(WXSS_PATH);
const fixtures = readJson("miniprogram/pages/v2-preview/v2-fixtures.json");

const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripMarkup = (source) => source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Runs the preview page module in a sandbox, exposing its top-level presentation tables and Page options. */
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

// ---------------------------------------------------------------- presentation label vocabulary

/**
 * The label tables mirror contract enums only. The expected key sets below are the authoritative
 * vocabularies from the accepted sources (content progression-v1 realm ids, core BUILD_STAGES, core
 * npc.ts affinity/trust semantics, core risk.ts tiers), hard-coded here so a map that invents or
 * drops vocabulary fails the test instead of silently drifting from the contracts.
 */
const CONTRACT_ENUMS = {
  REALM_LABELS: ["mortal", "qi-refining", "foundation-establishment", "golden-core", "nascent-soul", "spirit-transformation"],
  BUILD_STAGE_LABELS: ["latent", "emerging", "formed", "refined"],
  AFFINITY_LABELS: ["hostile", "distant", "neutral", "warm", "close"],
  TRUST_LABELS: ["wary", "guarded", "familiar", "trusted", "deeplyTrusted"],
  RISK_TIER_LABELS: ["low", "caution", "dangerous", "lethal"]
};

test("UI02R2_labels: the presentation tables cover the contract enums exactly", () => {
  const sandbox = loadPreviewPage();
  for (const [name, expectedKeys] of Object.entries(CONTRACT_ENUMS)) {
    const table = sandbox[name];
    assert.notEqual(table, undefined, name + " must exist as a page-level table");
    assert.deepEqual(Object.keys(table).sort(), [...expectedKeys].sort(), name + " must mirror the contract enum ids exactly");
    for (const value of Object.values(table)) {
      assert.equal(typeof value, "string", name + " values must be strings");
      assert.equal(value.length > 0, true, name + " labels must be non-empty");
    }
  }
});

test("UI02R2_labels: the realm labels are the official content displayNames, not invented lore", () => {
  const sandbox = loadPreviewPage();
  // the table lives in the page's vm realm: re-materialize before a strict comparison
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.REALM_LABELS)), {
    mortal: "凡人",
    "qi-refining": "炼气",
    "foundation-establishment": "筑基",
    "golden-core": "金丹",
    "nascent-soul": "元婴",
    "spirit-transformation": "化神"
  });
});

test("UI02R2_labels: unknown projected values fall back verbatim (behavioural)", () => {
  const sandbox = loadPreviewPage();
  const presentLabel = sandbox.presentLabel;
  assert.equal(typeof presentLabel, "function", "presentLabel must be a page-level function");
  assert.equal(presentLabel(sandbox.REALM_LABELS, "void-refining"), "void-refining", "an unknown realm id must render raw");
  assert.equal(presentLabel(sandbox.BUILD_STAGE_LABELS, "transcendent"), "transcendent", "an unknown build stage must render raw");
  assert.equal(presentLabel(sandbox.RISK_TIER_LABELS, "unknown-tier"), "unknown-tier", "an unknown risk tier must render raw");
  assert.equal(presentLabel(sandbox.REALM_LABELS, ""), "", "an empty value stays empty");
  assert.equal(presentLabel(sandbox.REALM_LABELS, undefined), undefined, "a missing value stays missing");
  // the mapped path still maps
  assert.equal(presentLabel(sandbox.REALM_LABELS, "qi-refining"), "炼气");
});

test("UI02R2_labels: the tables contain no per-run fixture values and no narrative content keys", () => {
  const sandbox = loadPreviewPage();
  const serialized = JSON.stringify([
    sandbox.REALM_LABELS, sandbox.BUILD_STAGE_LABELS, sandbox.CONDITION_KIND_LABELS, sandbox.AFFINITY_LABELS,
    sandbox.TRUST_LABELS, sandbox.ROLE_LABELS, sandbox.SLOT_LABELS, sandbox.RISK_TIER_LABELS,
    sandbox.REASON_KEY_LABELS, sandbox.DEATH_CAUSE_LABELS, sandbox.ENTRY_KIND_LABELS
  ]);
  for (const perRun of ["青芜问道", "无名老者", "柳氏药婆", "inst-ui02-event", "npc:core:mentor", "hint_cause", "dev.first-choice"]) {
    assert.equal(serialized.includes(perRun), false, "the label tables must not inline per-run fixture values: " + perRun);
  }
  // and the tables are not a locale layer: narrative content key prose translation stays out of scope
  const allKeys = [
    sandbox.REALM_LABELS, sandbox.BUILD_STAGE_LABELS, sandbox.CONDITION_KIND_LABELS, sandbox.AFFINITY_LABELS,
    sandbox.TRUST_LABELS, sandbox.ROLE_LABELS, sandbox.SLOT_LABELS, sandbox.RISK_TIER_LABELS,
    sandbox.REASON_KEY_LABELS, sandbox.DEATH_CAUSE_LABELS, sandbox.ENTRY_KIND_LABELS
  ].flatMap((table) => Object.keys(table));
  for (const key of allKeys) {
    assert.equal(/\.(title|body|summary|history|label)$/.test(key), false, "narrative content keys must not be mapped: " + key);
  }
});

// ---------------------------------------------------------------- the rendered projection uses the labels

test("UI02R2_present: RUN_HOME renders Chinese structural labels instead of raw enum ids", () => {
  const sandbox = loadPreviewPage();
  const home = sandbox.present("RUN_HOME").runHome;
  // realm: fixture realm.id === "mortal" -> 凡人; order 0 reads 未入修行, not "第 0 境"
  assert.equal(home.realmName, "凡人");
  assert.equal(home.realmOrderLabel, "未入修行");
  assert.equal(wxml.includes("第 {{vm.runHome.realmOrder}} 境"), false, "the raw ordinal template must be gone");
  // build stage: dominant build is 剑修 formed -> 成形
  const dominant = home.builds.find((build) => build.dominant);
  assert.equal(dominant.stageLabel, "成形");
  assert.equal(home.attentions[0].value, "剑修 · 成形");
  // condition kind: injury -> 伤患
  assert.equal(home.conditions[0].label, "伤患");
  assert.ok(home.conditionSummary.includes("伤患 ×1"), home.conditionSummary);
  // affinity/trust join for the people drawer meta
  assert.equal(home.people[0].relation, "亲近 / 相熟");
  assert.equal(home.people[0].roles, "师长");
});

test("UI02R2_present: the blocked breakthrough variant maps its reason key", () => {
  const sandbox = loadPreviewPage();
  const blocked = sandbox.present("RUN_HOME_BREAKTHROUGH_BLOCKED").runHome;
  assert.equal(blocked.breakthrough.enabled, false);
  assert.equal(blocked.breakthrough.note, "突破 · 暂不可行 · 修为未满");
  // the raw key must not be shown when a label exists
  assert.equal(blocked.breakthrough.note.includes("breakthrough."), false);
});

test("UI02R2_present: EVENT maps participant slots, risk tiers and reason keys", () => {
  const sandbox = loadPreviewPage();
  const decision = JSON.parse(JSON.stringify(sandbox.present("EVENT").decision));
  assert.equal(decision.participants[0].slot, "对方");
  const labels = decision.options.map((option) => option.tier);
  assert.deepEqual(labels, ["低险", "低险", "低险", "危险", "低险"]);
  const dangerous = decision.options[3];
  assert.equal(dangerous.reasons, "争斗之险 · 身负伤患");
});

test("UI02R2_present: LIFE_ARCHIVE maps entry kinds, build stages and death labels", () => {
  const sandbox = loadPreviewPage();
  const archive = sandbox.present("LIFE_ARCHIVE").archive;
  assert.deepEqual([...new Set(archive.entries.map((entry) => entry.kind))].sort(), ["事件", "道途"]);
  assert.equal(archive.builds.every((build) => !["latent", "emerging", "formed", "refined"].includes(build.stage)), true, "no raw build stage id may render");
  assert.equal(archive.deathRealm, "凡人");
  assert.equal(archive.deathCause, "寿元耗尽");
  assert.equal(archive.people[0].roles, "师长");
});

test("UI02R2_present: the label layer changes no projected value and adds no rule computation", () => {
  const pageCode = stripJs(pageJs);
  for (const forbidden of ["Math.random", "difficulty", "checkSpec", "breakthroughScore", "wx.request"]) {
    assert.equal(pageCode.includes(forbidden), false, "preview page must not compute rules: " + forbidden);
  }
  // the server projection fields the page already reported stay verbatim
  const sandbox = loadPreviewPage();
  const home = sandbox.present("RUN_HOME");
  assert.equal(home.pageState, "RUN_HOME");
  assert.equal(home.runHome.realmOrder, fixtures.states.RUN_HOME.view.state.publicRun.realm.order, "the numeric realm order stays the projected value");
});

// ---------------------------------------------------------------- visual polish structure

test("UI02R2_polish: the breakthrough CTA is the single primary control and the four actions are uniform secondaries", () => {
  const sheet = parseStylesheet(wxss);
  const rule = (selector) => sheet.outerRules.find((entry) => entry.selector === selector);
  const cta = rule(".cta");
  assert.notEqual(cta, undefined);
  assert.equal(/background-color:\s*var\(--ink\)/.test(cta.body), true, "the CTA must be solid ink (primary)");
  const ctaLabel = rule(".cta-label");
  assert.equal(/color:\s*var\(--paper\)/.test(ctaLabel.body), true, "the CTA label must read paper-on-ink");
  assert.equal(/font-weight:\s*600/.test(ctaLabel.body), true);
  const action = rule(".action");
  assert.equal(/background-color:\s*var\(--paper-raised\)/.test(action.body), true, "core actions stay light outline secondaries");
  assert.equal(/border:\s*var\(--hairline\) solid var\(--rule-strong\)/.test(action.body), true);
  // uniform card radius on interactive surfaces
  assert.equal(wxss.includes("--radius-card: 8rpx;"), true);
  for (const selector of [".cta", ".action", ".dock-note", ".option", ".failure", ".dev-trigger"]) {
    assert.equal(/border-radius:\s*var\(--radius-card\)/.test(rule(selector).body), true, selector + " must use the shared card radius");
  }
});

test("UI02R2_polish: the attention region reads as a priorities panel, not a plain list", () => {
  const elements = wxml;
  assert.equal(elements.includes("眼下要务"), true, "the panel title must be the refined copy");
  assert.equal(elements.includes("此刻值得关注"), false, "the old plain-list title must be gone");
  assert.equal(elements.includes('class="attention-mark"'), true, "the gold mark must precede the panel title");
  const sheet = parseStylesheet(wxss);
  const rule = (selector) => sheet.outerRules.find((entry) => entry.selector === selector);
  assert.equal(/background-color:\s*var\(--gold\)/.test(rule(".attention-mark").body), true);
  assert.equal(/border:\s*var\(--hairline\) solid var\(--rule-strong\)/.test(rule(".attn-tag").body), true, "attention tags must be chips");
});

test("UI02R2_polish: vitals are a divided strip and the hero carries the hierarchy", () => {
  const sheet = parseStylesheet(wxss);
  const rule = (selector) => sheet.outerRules.find((entry) => entry.selector === selector);
  assert.equal(/border-right:\s*var\(--hairline\) solid var\(--rule\)/.test(rule(".vital--rule").body), true);
  assert.equal(wxml.includes('class="vital vital--lead vital--rule"'), true);
  assert.equal(wxml.includes('class="vital vital--tail"'), true);
  assert.equal(/font-weight:\s*600/.test(rule(".hero-name").body), true);
  assert.equal(/font-weight:\s*600/.test(rule(".vital-value").body), true);
  assert.equal(/color:\s*var\(--gold\)/.test(rule(".hero-realm").body), true, "the realm order keeps the restrained gold accent");
});

test("UI02R2_polish: interaction floors and the readability floor are untouched by the polish", () => {
  const sheet = parseStylesheet(wxss);
  const pageBase = sheet.outerRules.find((entry) => entry.selector === "page");
  const decls = Object.fromEntries([...pageBase.body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  assert.equal(decls["--touch-min"], "104rpx");
  assert.equal(decls["--cta-h"], "104rpx");
  assert.equal(decls["--dock-row-h"], "104rpx");
  assert.equal(decls["--radius"], "4rpx", "the frozen UI02 radius token stays");
  for (const token of ["--paper:", "--ink:", "--cinnabar:", "--gold:"]) {
    assert.equal(wxss.includes(token), true, "frozen design token " + token + " must stay");
  }
});

test("UI02R2_polish: the frozen design language rejects legacy neon and glow", () => {
  const pageSources = [stripMarkup(wxml), stripJs(pageJs), wxss.replace(/\/\*[\s\S]*?\*\//g, "")].join("\n");
  for (const neon of ["#FFD700", "#050508", "#55ff55", "#55ccff", "#dd55ff", "#ff4444", "text-shadow", "box-shadow"]) {
    assert.equal(pageSources.includes(neon), false, "legacy neon value leaked: " + neon);
  }
});

test("UI02R2_polish: the product surface still renders no debug data and no raw enum template", () => {
  const markup = stripMarkup(wxml);
  // the dev trigger carries a dynamic class, so bound the product surface by the bare marker
  const surfaceStart = markup.indexOf('class="surface"');
  const devStart = markup.indexOf("dev-trigger");
  assert.ok(surfaceStart >= 0 && devStart > surfaceStart, "surface and dev markers must both exist");
  const productMarkup = markup.slice(surfaceStart, devStart);
  for (const marker of ["lastIntent", "decisionId", "onBlockedBack", "gatedEntries", "devOpen"]) {
    assert.equal(productMarkup.includes(marker), false, marker + " must stay outside the product surface");
  }
  // the old raw ordinal template and the old raw tag column width are gone
  assert.equal(markup.includes("realmOrder}} 境"), false);
});
