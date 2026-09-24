/**
 * UI02ENTRY — 2.0 entry-flow high-fidelity visual slice: structural invariants that are actually
 * machine-checkable.
 *
 * Scope of this file: the four pre-run screens START -> MODE_SELECT -> DESTINY_OFFER -> RUN_OPENING.
 * It pins WHAT the slice added, that it reuses the accepted UI02R2A2 visual system, and WHAT it must
 * not have changed or invented:
 *
 *  - the four screens are reachable and render from generated fixtures, never from a blank surface;
 *  - DESTINY_OFFER carries the REAL public server offer (independently re-derived here) and exposes no
 *    seed, RNG state, draw index, hidden weight or rule internals;
 *  - MODE_SELECT reads the accepted capability projection instead of inventing modes;
 *  - RUN_OPENING formats public selected-run data and resolves nothing;
 *  - START uses documented product copy only (provenance asserted against docs/);
 *  - the one-screen contract holds for every pre-run screen at every matrix viewport;
 *  - the accepted in-life pages, the default route and the 1.0 pages do not regress.
 *
 * It cannot judge whether the result looks good. Visual acceptance is still a human DevTools pass —
 * see docs/UI02_PREVIEW.md.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { ContentRegistry } from "../packages/content/src/index.ts";
import { generateServerDestinyOffer, ServerViewModelBuilder } from "../server/src/index.ts";
import { buildFixtureJsonSource, buildFixtureModuleSource, FIXTURE_MODULE_PATH, FIXTURE_MODULE_SPECIFIER, requireArguments } from "../tools/ui02-preview-fixture-module.mjs";
import { buildPreviewEntry, buildPreviewFixtures, FIXTURE_PATH } from "../tools/ui02-preview-fixtures.mjs";
import {
  ENTRY_STACKS,
  MIN_FONT_SIZE_RPX,
  PAGE_JS_PATH,
  PAGE_JSON_PATH,
  SAFE_AREA_BOTTOM_WORST_CASE_PX,
  SUPPORTED_BASELINE,
  TOUCH_TARGET_MIN_PX,
  VIEWPORT_MATRIX,
  WXML_PATH,
  WXSS_PATH,
  ancestorClasses,
  auditLayout,
  classesOf,
  entryStack,
  findByClass,
  lengthPx,
  parseDeclarations,
  parseStylesheet,
  parseWxmlElements,
  resolveTokens,
  ruleBody
} from "../tools/ui02r1-layout-audit.mjs";
import { auditWxssCompat } from "../tools/wxss-compat-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

const wxss = read(WXSS_PATH);
const wxml = read(WXML_PATH);
const pageJs = read(PAGE_JS_PATH);
const pageJson = readJson(PAGE_JSON_PATH);
const fixtures = readJson(FIXTURE_PATH);
const sheet = parseStylesheet(wxss);
const elements = parseWxmlElements(wxml);

const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripMarkup = (source) => source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const declsOf = (selector) => parseDeclarations(ruleBody(sheet, selector));

const ENTRY_FLOW = ["START", "MODE_SELECT", "DESTINY_OFFER", "RUN_OPENING"];
const ENTRY_PAGE_CLASS = {
  START: "page--start",
  MODE_SELECT: "page--modes",
  DESTINY_OFFER: "page--offer",
  RUN_OPENING: "page--opening"
};
const ENTRY_PAYLOAD_FIELD = {
  START: "start",
  MODE_SELECT: "modeSelect",
  DESTINY_OFFER: "destinyOffer",
  RUN_OPENING: "runOpening"
};
/** The capability vocabulary the UI contract already defines. No other mode may exist. */
const CONTRACT_MODE_IDS = ["main", "dailyChallenge", "commerce", "share"];

/** Runs the preview page module in a sandbox, exposing its presentation layer and Page options. */
function loadPreviewPage(source = pageJs) {
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
  vm.runInContext(source, sandbox);
  return sandbox;
}

/** A page instance with a captured setData, so the page's own handlers can be driven. */
function pageInstance(pageOptions) {
  const page = Object.create(pageOptions);
  page.data = Object.assign({}, pageOptions.data);
  page.setData = (patch) => { Object.assign(page.data, patch); };
  return page;
}

/** Every key of a nested structure, for the "no secret key may appear anywhere" scans. */
function keySet(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => keySet(entry, result));
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { result.add(key); keySet(entry, result); }
  return result;
}

/** Same algorithm the repo's frozen base-tree digests use: sha256 over sorted "<relpath>:<sha256(content)>\n". */
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

// ---------------------------------------------------------------- the four screens are reviewable

test("UI02ENTRY_reachable: all four pre-run screens render from generated fixtures", () => {
  assert.deepEqual(Object.keys(fixtures.entry), ENTRY_FLOW, "the entry collection must hold exactly the contract main flow");
  const sandbox = loadPreviewPage();
  for (const key of ENTRY_FLOW) {
    const view = sandbox.present(key);
    assert.notEqual(view, null, `${key} must project a view`);
    assert.equal(view.kind, key, `${key} must render as ${key}`);
    assert.equal(view.pageState, fixtures.entry[key].pageState, `${key} must report its generated page state verbatim`);
    assert.notEqual(view[ENTRY_PAYLOAD_FIELD[key]], undefined, `${key} must carry its projection payload, not just a kind`);
  }
  // the page publishes exactly the generated entry vocabulary through the dev tabs
  const page = pageInstance(sandbox.pageOptions);
  page.onLoad();
  assert.equal(page.data.failure, null, "the committed fixture must load without a failure panel");
  assert.deepEqual(Array.from(page.data.tabs, (tab) => tab.key).slice(0, ENTRY_FLOW.length), ENTRY_FLOW);
  for (const tab of page.data.tabs) {
    page.onSelectTab({ currentTarget: { dataset: { key: tab.key } } });
    assert.equal(page.data.failure, null, `${tab.key} must render, not report a failure`);
    assert.notEqual(page.data.vm, null, `${tab.key} must produce a vm`);
  }
  // the markup really branches on all four kinds (an unreachable branch would be dead markup)
  const markupKinds = [...new Set([...stripMarkup(wxml).matchAll(/vm\.kind\s*===\s*'([^']+)'/g)].map((match) => match[1]))];
  for (const key of ENTRY_FLOW) assert.equal(markupKinds.includes(key), true, `${key} must have a markup branch`);
});

test("UI02ENTRY_reachable: the flow is walkable inside the preview without changing the route", () => {
  const sandbox = loadPreviewPage();
  const page = pageInstance(sandbox.pageOptions);
  page.onLoad();
  assert.equal(page.data.activeKey, "START", "the preview opens on the first pre-run screen");
  page.onEntryNav({ currentTarget: { dataset: { target: "MODE_SELECT" } } });
  assert.equal(page.data.vm.kind, "MODE_SELECT");
  page.onEntryNav({ currentTarget: { dataset: { target: "DESTINY_OFFER" } } });
  assert.equal(page.data.vm.kind, "DESTINY_OFFER");
  page.onEntryNav({ currentTarget: { dataset: { target: "RUN_HOME" } } });
  assert.equal(page.data.vm.kind, "RUN_HOME");
  // the navigation is preview-only and is labelled as such: it never claims to have submitted a command
  assert.equal(/未提交命令/.test(page.data.lastIntent), true, page.data.lastIntent);
  // the app route is untouched: main entry still pages/start/start, preview still registered last
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  // UI04C appends its dev-only live page LAST, behind the accepted preview, so the preview stays
  // registered but is no longer the final entry.
  assert.equal(app.pages.slice(0, -1).includes("pages/v2-preview/v2-preview"), true, "the preview must stay registered");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
});

/** Resolves a dotted path on an object; undefined when any segment is missing. */
function resolvePath(root, dotted) {
  let node = root;
  for (const segment of dotted.split(".")) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = node[segment];
  }
  return node;
}

/** The `vm.<path>` references in a markup region that do not resolve on `view` (they would render blank). */
function unresolvedBindings(view, region) {
  const unresolved = new Set();
  for (const mustache of region.matchAll(/\{\{([^}]*)\}\}/g)) {
    for (const pathMatch of mustache[1].matchAll(/\bvm\.([a-zA-Z0-9_.]+)/g)) {
      const path = pathMatch[1].replace(/\.$/, "");
      if (resolvePath(view, path) === undefined) unresolved.add(path);
    }
  }
  return [...unresolved];
}

/** The markup region of one pre-run page: its own page class up to the next page's discriminator. */
function entryRegion(markup, pageClass) {
  const start = markup.indexOf(pageClass);
  const end = markup.indexOf('wx:if="{{vm.kind', start);
  assert.equal(start >= 0 && end > start, true, pageClass + " markup region must exist");
  return markup.slice(start, end);
}

/**
 * The blank-surface defect class this project has shipped twice was "the page renders, the projection is
 * complete, and the text is empty". A mistyped binding produces exactly that and no structural check sees
 * it, so every vm.* path in the pre-run markup is resolved against the presented view here.
 */
test("UI02ENTRY_bindings: every pre-run binding resolves on the presented view", () => {
  const sandbox = loadPreviewPage();
  const markup = stripMarkup(wxml);
  const ROOT_FIELD = { START: "start", MODE_SELECT: "modeSelect", DESTINY_OFFER: "destinyOffer", RUN_OPENING: "runOpening" };
  const ROOT_CLASS = {
    START: 'class="page page--start"',
    MODE_SELECT: 'class="page page--modes"',
    DESTINY_OFFER: 'class="page page--offer"',
    RUN_OPENING: 'class="page page--opening"'
  };
  for (const key of ENTRY_FLOW) {
    const view = sandbox.present(key);
    const region = entryRegion(markup, ROOT_CLASS[key]);
    assert.deepEqual(unresolvedBindings(view, region), [], `${key} has unresolved bindings; they would render blank`);
    // a screen may only bind its own projection field, never another screen's
    for (const pathMatch of region.matchAll(/\bvm\.([a-zA-Z0-9_]+)/g)) {
      assert.equal(pathMatch[1], ROOT_FIELD[key], `${key} must bind only vm.${ROOT_FIELD[key]}, found vm.${pathMatch[1]}`);
    }
  }
  // each screen actually renders something: an empty region would make the checks above vacuous
  for (const key of ENTRY_FLOW) {
    const region = entryRegion(markup, ROOT_CLASS[key]);
    assert.equal((region.match(/\{\{/g) || []).length >= 1, true, `${key} must render bound values`);
  }
});

// ---------------------------------------------------------------- DESTINY_OFFER carries real public offer data

/** Independently rebuilds the documented dev offer through the real production chain. */
function rebuildDevOffer() {
  const pack = JSON.parse(read("packages/content/dev-fixtures/minimal-pack.json"));
  const content = new ContentRegistry();
  content.register(pack);
  const generated = generateServerDestinyOffer({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0",
    runId: "run-ui02-preview", playerId: "player-ui02-preview", rootSeed: "server-only-root-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    content,
    fixture: {
      offerId: "offer-ui02-preview", age: 24, maxAge: 100, runName: "青芜问道",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 },
      resources: { spiritStone: 5, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  });
  const view = new ServerViewModelBuilder(content, { capabilities: { PlatformCapability: true, ShareCapability: true, AiNarrativeCapability: true } }).build(generated.state);
  return { content, generated, view };
}

test("UI02ENTRY_offer: DESTINY_OFFER is the real public server offer, not hand-authored data", () => {
  const { generated, view } = rebuildDevOffer();
  const committed = fixtures.entry.DESTINY_OFFER.view;
  // the committed fixture equals an independently rebuilt projection of the documented dev offer
  assert.deepEqual(committed.state.pageState, "DESTINY_OFFER");
  assert.equal(committed.currentInteraction.interactionId, generated.state.run.offer.offerId);
  const rebuilt = view.currentInteraction.body.candidates;
  assert.deepEqual(
    committed.currentInteraction.body.candidates.map((candidate) => [candidate.selectionId, candidate.spiritualRoot, candidate.talent, candidate.majorDestiny]),
    rebuilt.map((candidate) => [candidate.selectionId, candidate.spiritualRoot, candidate.talent, candidate.majorDestiny]),
    "the offer candidates must be the real generated public projection"
  );
  // and the page renders exactly those public candidate fields
  const offer = JSON.parse(JSON.stringify(loadPreviewPage().present("DESTINY_OFFER").destinyOffer));
  assert.deepEqual(offer.candidates.map((candidate) => candidate.spiritualRoot), rebuilt.map((candidate) => candidate.spiritualRoot));
  assert.deepEqual(offer.candidates.map((candidate) => candidate.majorDestiny), rebuilt.map((candidate) => candidate.majorDestiny));
  assert.equal(offer.count, rebuilt.length);
  assert.equal(offer.candidates.length, 3, "the dev offer projects three public candidates");
  for (const candidate of offer.candidates) {
    assert.deepEqual(
      Object.keys(candidate).sort(),
      ["majorDestiny", "optionId", "order", "selectionId", "spiritualRoot", "talent"],
      "a candidate may carry only public presentation fields"
    );
  }
});

test("UI02ENTRY_offer: no seed, RNG state, draw index, hidden weight or rule internals are projected", () => {
  const serialized = JSON.stringify(fixtures.entry);
  for (const forbidden of ["rootSeed", "server-only-root-seed", "drawIndex", "rng", "RNG", "roll", "weight", "weights", "odds", "chance", "difficulty", "selector", "eligibility", "salience", "echoBudget", "lifetimeEvidence", "affinityBps", "significance", "promotionThreshold", "actualStatus", "encounterCount", "trace", "resolver"]) {
    assert.equal(serialized.includes(forbidden), false, `the entry fixture leaked: ${forbidden}`);
  }
  const keys = keySet(fixtures.entry);
  for (const forbidden of ["rootSeed", "rng", "rngState", "drawIndex", "salience", "echoBudget", "selector", "weights", "difficulty", "checkSpec", "EffectSpec", "trace", "actorIdsByRole", "lifetimeEvidence", "affinityBps", "significance", "promotionThreshold", "actualStatus"]) {
    assert.equal(keys.has(forbidden), false, `the entry fixture leaked key: ${forbidden}`);
  }
  // the interaction itself is the accepted public shape only
  assert.deepEqual(
    Object.keys(fixtures.entry.DESTINY_OFFER.view.currentInteraction).sort(),
    ["body", "interactionId", "interactionState", "kind", "options", "titleKey"]
  );
  for (const candidate of fixtures.entry.DESTINY_OFFER.view.currentInteraction.body.candidates) {
    assert.deepEqual(Object.keys(candidate).sort(), ["majorDestiny", "selectionId", "spiritualRoot", "talent"]);
  }
  for (const option of fixtures.entry.DESTINY_OFFER.view.currentInteraction.options) {
    assert.deepEqual(Object.keys(option).sort(), ["labelKey", "optionId"]);
  }
  // the page source cannot compute any of it either
  const pageCode = stripJs(pageJs);
  for (const forbidden of ["Math.random", "difficulty", "checkSpec", "wx.request", "Date.now"]) {
    assert.equal(pageCode.includes(forbidden), false, `the preview page must not compute rules: ${forbidden}`);
  }
});

test("UI02ENTRY_offer: the order of candidates is presentation only and the confirm decision is not local", () => {
  const sandbox = loadPreviewPage();
  const page = pageInstance(sandbox.pageOptions);
  page.onLoad();
  page.show("DESTINY_OFFER");
  // nothing is pre-selected: the preview never decides a destiny for the player
  assert.equal(page.data.offerSelected, "", "no default selection may exist");
  page.onOfferConfirm();
  assert.equal(page.data.offerSelected, "", "confirming without a selection must not choose one");
  assert.equal(/尚未择定/.test(page.data.lastIntent), true, page.data.lastIntent);

  // selecting is a UI highlight; the projection is untouched and no outcome is produced
  const before = JSON.stringify(page.data.vm.destinyOffer);
  const second = page.data.vm.destinyOffer.candidates[1];
  page.onSelectCandidate({ currentTarget: { dataset: { option: second.optionId } } });
  assert.equal(page.data.offerSelected, second.optionId);
  assert.equal(JSON.stringify(page.data.vm.destinyOffer), before, "selecting must not change the projection");
  page.onOfferConfirm();
  assert.equal(page.data.lastIntent.includes(second.spiritualRoot), true, page.data.lastIntent);
  assert.equal(/未发送|未接线/.test(page.data.lastIntent), true, "the preview must disclose that nothing was sent");
  // an unknown option id is ignored rather than guessed
  page.onSelectCandidate({ currentTarget: { dataset: { option: "not-a-candidate" } } });
  assert.equal(page.data.offerSelected, second.optionId);
  // the markup carries no submission binding on the offer screen
  const offerMarkup = stripMarkup(wxml).slice(stripMarkup(wxml).indexOf('class="page page--offer"'), stripMarkup(wxml).indexOf('class="page page--opening"'));
  assert.equal(/onIntent|bindsubmit|bindtap="onOfferSubmit"/.test(offerMarkup), false, "the offer screen must not submit gameplay intent");
});

// ---------------------------------------------------------------- MODE_SELECT invents nothing

test("UI02ENTRY_modes: MODE_SELECT renders only the contract capability vocabulary", () => {
  const sandbox = loadPreviewPage();
  const modes = JSON.parse(JSON.stringify(sandbox.present("MODE_SELECT").modeSelect));
  assert.deepEqual(modes.modes.map((mode) => mode.modeId), CONTRACT_MODE_IDS);
  for (const mode of modes.modes) {
    assert.equal(typeof mode.label === "string" && mode.label.length > 0, true, "every mode needs a label");
    if (mode.modeId !== "main") {
      assert.equal(mode.capability.length > 0, true, `the gated entry ${mode.modeId} must name its capability`);
    }
  }
  // the page's own vocabulary is the single source: no mode id may appear outside it
  const pageCode = stripJs(pageJs);
  const declaredModeIds = [...pageCode.matchAll(/modeId:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(declaredModeIds, CONTRACT_MODE_IDS, "the page may declare exactly the contract vocabulary");
});

test("UI02ENTRY_modes: availability is read from the accepted capability projection", () => {
  const sandbox = loadPreviewPage();
  const projected = fixtures.entry.MODE_SELECT.shell.visibleEntries;
  const modes = sandbox.present("MODE_SELECT").modeSelect.modes;
  for (const mode of modes) {
    if (mode.modeId === "main") { assert.equal(mode.available, true, "the main contract flow is always available"); continue; }
    assert.equal(mode.available, projected[mode.modeId] === true, `${mode.modeId} availability must follow the projection`);
  }
  // disabling a capability must gate its entry and nothing else (behavioural, not textual)
  const allOff = sandbox.buildModeSelect({ shell: { visibleEntries: { dailyChallenge: false, rewardedAd: false, commerce: false, share: false } } });
  assert.deepEqual(Array.from(allOff.modes.filter((mode) => mode.available), (mode) => mode.modeId), ["main"]);
  assert.equal(allOff.availableCount, 1);
  assert.equal(allOff.gatedCount, 3);
  for (const mode of Array.from(allOff.modes).filter((entry) => !entry.available)) {
    assert.equal(mode.gateNote.includes("能力未开通"), true, "a disabled entry must say it is unavailable");
    assert.equal(mode.gateNote.includes(mode.capability), true, "a disabled entry must name the missing capability");
  }
  const allOn = sandbox.buildModeSelect({ shell: { visibleEntries: { dailyChallenge: true, rewardedAd: true, commerce: true, share: true } } });
  assert.equal(Array.from(allOn.modes).every((mode) => mode.available), true);
  assert.equal(allOn.modes.length, CONTRACT_MODE_IDS.length, "gating changes availability, never the vocabulary");
  // the primary entry action follows the main row's availability
  assert.equal(sandbox.buildModeSelect({ shell: { visibleEntries: {} } }).primary.enabled, true, "the main flow stays enterable");
});

// ---------------------------------------------------------------- RUN_OPENING resolves nothing

test("UI02ENTRY_opening: RUN_OPENING uses only public selected profile / run information", () => {
  const sandbox = loadPreviewPage();
  const opening = JSON.parse(JSON.stringify(sandbox.present("RUN_OPENING").runOpening));
  const entry = fixtures.entry.RUN_OPENING;
  assert.equal(opening.runName, entry.view.state.publicRun.runName);
  assert.equal(opening.age, entry.view.state.publicRun.age);
  assert.equal(opening.maxAge, entry.view.state.publicRun.maxAge);
  assert.equal(opening.realmName, "凡人", "the mortal realm id renders through the accepted label vocabulary");
  assert.deepEqual(opening.attributes.map((row) => row.key), ["insight", "body", "spiritSense", "fortune"]);
  assert.deepEqual(opening.attributes.map((row) => row.value), [
    entry.view.state.publicRun.attributes.insight,
    entry.view.state.publicRun.attributes.body,
    entry.view.state.publicRun.attributes.spiritSense,
    entry.view.state.publicRun.attributes.fortune
  ]);
  // the selected profile is the already-public resolved candidate, not a raw id
  assert.equal(opening.hasSelected, true);
  assert.equal(opening.selectedRoot, entry.selected.spiritualRoot.displayName);
  assert.equal(opening.selectedTalent, entry.selected.talent.displayName);
  assert.equal(opening.selectedDestiny, entry.selected.majorDestiny.displayName);
  assert.equal(opening.selectedRoot.includes("root."), false, "no raw spiritual-root id may render");
  assert.equal(opening.selectedTalent.includes("talent."), false, "no raw talent id may render");
  assert.equal(opening.selectedDestiny.includes("destiny."), false, "no raw destiny id may render");
  // the entry fixture holds no terminal or mutation state
  assert.equal(entry.view.state.runStatus, "active");
  assert.equal("ending" in entry.view.state.publicRun, false);
  assert.equal("death" in entry.view.state.publicRun, false);
});

test("UI02ENTRY_opening: the opening screen mutates nothing and offers exactly one enter affordance", () => {
  const markup = stripMarkup(wxml);
  const openingMarkup = markup.slice(markup.indexOf('class="page page--opening"'), markup.indexOf('class="page page--home"'));
  assert.equal(/onIntent|bindsubmit/.test(openingMarkup), false, "RUN_OPENING must not submit a command");
  assert.equal((openingMarkup.match(/class="entry-cta[ "]/g) || []).length, 1, "exactly one enter affordance");
  assert.equal(/data-target="\{\{vm\.runOpening\.enter\.target\}\}"/.test(openingMarkup), true, "the affordance enters RUN_HOME");
  // an active run has no pending interaction to resolve, and the entry fixture carries none
  assert.equal("currentInteraction" in fixtures.entry.RUN_OPENING.view, false, "RUN_OPENING must not carry a resolvable interaction");
  // and no mutation path exists in the shipped source for this screen
  const pageCode = stripJs(pageJs);
  for (const forbidden of ["START_RUN(", "reduce(", "stateVersion +", "new ServerViewModelBuilder"]) {
    assert.equal(pageCode.includes(forbidden), false, `the preview must not resolve gameplay: ${forbidden}`);
  }
});

// ---------------------------------------------------------------- START copy provenance

test("UI02ENTRY_start: START has one primary action and its copy is documented product copy", () => {
  const sandbox = loadPreviewPage();
  const start = JSON.parse(JSON.stringify(sandbox.present("START").start));
  assert.equal(start.primary.enabled, true);
  assert.equal(start.primary.target, "MODE_SELECT");
  assert.equal(typeof start.primary.label === "string" && start.primary.label.length > 0, true);
  const startMarkup = stripMarkup(wxml).slice(stripMarkup(wxml).indexOf('class="page page--start"'), stripMarkup(wxml).indexOf('class="page page--modes"'));
  assert.equal((startMarkup.match(/class="entry-cta[ "]/g) || []).length, 1, "START must have exactly one primary entry action");
  assert.equal(startMarkup.includes("{{vm.start.coreLine}}"), true, "the core line must render");

  // provenance: the copy comes from the documents, so it cannot drift into invented lore unnoticed
  const brain = read("docs/PROJECT-BRAIN.md");
  const preview = read("docs/UI02_PREVIEW.md");
  assert.equal(brain.includes(sandbox.START_COPY.coreLine), true, "the core line must be documented verbatim");
  assert.equal(brain.includes(sandbox.START_COPY.positioning), true, "the positioning line must be documented verbatim");
  assert.equal(preview.includes(sandbox.START_COPY.title), true, "the product name must already be used in the docs");
  // and it promises nothing: no reward, bonus, purchase or benefit vocabulary
  const startSources = startMarkup + JSON.stringify(sandbox.START_COPY);
  for (const promise of ["奖励", "免费", "礼包", "福利", "赠送", "返利", "VIP", "无限", "一键满级"]) {
    assert.equal(startSources.includes(promise), false, `START must not promise anything: ${promise}`);
  }
});

// ---------------------------------------------------------------- shared accepted visual system

test("UI02ENTRY_visual: the pre-run screens reuse the accepted UI02R2A2 language, not a new one", () => {
  for (const token of ["--paper:", "--ink:", "--cinnabar:", "--gold:", "--radius-card: 8rpx", "--touch-min: 104rpx", "--cta-h: 104rpx"]) {
    assert.equal(wxss.includes(token), true, "frozen token " + token + " must stay");
  }
  // the per-screen primary control is the same solid-ink treatment as the breakthrough CTA
  assert.equal(declsOf(".entry-cta").get("background-color"), "var(--ink)");
  assert.equal(declsOf(".entry-cta").get("border-radius"), "var(--radius-card)");
  assert.equal(declsOf(".entry-cta-label").get("color"), "var(--paper)");
  // no new media band and no new design language: the entry rules reuse the tokens + card radius
  assert.deepEqual(sheet.bands.map((band) => band.query), [
    "(min-width: 340px)", "(min-width: 400px)",
    "(min-height: 560px)", "(min-height: 600px)", "(min-height: 750px)", "(min-height: 820px)"
  ]);
  const entryRules = sheet.outerRules.filter((rule) => /^\.(entry|offer|opening)-/.test(rule.selector));
  assert.equal(entryRules.length >= 30, true, "the entry flow must actually be styled (" + entryRules.length + " rules)");
  const sources = [stripMarkup(wxml), stripJs(pageJs), wxss.replace(/\/\*[\s\S]*?\*\//g, "")].join("\n");
  for (const neon of ["#FFD700", "#050508", "#55ff55", "#55ccff", "#dd55ff", "#ff4444", "text-shadow", "box-shadow"]) {
    assert.equal(sources.includes(neon), false, "legacy neon value leaked: " + neon);
  }
});

test("UI02ENTRY_visual: the accepted in-life surfaces and controls are not recomposed", () => {
  // RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE keep their accepted treatments and one-screen budget
  assert.equal(declsOf(".hero").get("border-left"), "4rpx solid var(--cinnabar-soft)");
  assert.equal(declsOf(".vitals").get("height"), "var(--vitals-h)");
  assert.equal(declsOf(".attention").get("background-color"), "var(--paper-sunk)");
  assert.equal(String(declsOf(".attention").get("flex")).startsWith("1 1"), true);
  assert.equal(declsOf(".cta").get("background-color"), "var(--ink)");
  assert.equal(declsOf(".action").get("background-color"), "var(--paper-raised)");
  assert.equal((stripMarkup(wxml).match(/class="dock-grid"/g) || []).length, 1, "the RUN_HOME dock must stay unique");
  assert.equal((stripMarkup(wxml).match(/class="attention-scroll"/g) || []).length, 1);
  assert.equal((stripMarkup(wxml).match(/class="decision-viewport"/g) || []).length, 1);
  assert.equal((stripMarkup(wxml).match(/class="archive-viewport"/g) || []).length, 1);
  // the accepted RUN_HOME first-screen budget still fits and still leaves no dead field
  const quantised = auditLayout().quantised;
  assert.equal(quantised.length, VIEWPORT_MATRIX.length);
  for (const entry of quantised) {
    assert.equal(entry.slackPx / entry.viewport.height <= 0.05, true, `${entry.viewport.width}x${entry.viewport.height} re-opened a dead field`);
  }
});

// ---------------------------------------------------------------- one-screen contract

test("UI02ENTRY_onescreen: every pre-run screen fits the supported baseline with the safe-area reserved", () => {
  const result = auditLayout();
  assert.equal(result.failures.length, 0, "layout audit failures:\n" + result.failures.map((failure) => failure.name + " :: " + failure.detail).join("\n"));
  assert.equal(result.entryQuantised.length, Object.keys(ENTRY_STACKS).length * VIEWPORT_MATRIX.length);
  for (const entry of result.entryQuantised) {
    assert.equal(entry.missingTokens.length, 0, `${entry.key}@${entry.viewport.width}x${entry.viewport.height} has unresolved tokens`);
    assert.equal(
      entry.totalPx <= entry.viewport.height,
      true,
      `${entry.key}@${entry.viewport.width}x${entry.viewport.height}: stack ${entry.stackPx.toFixed(1)}px + safe-area exceeds the viewport`
    );
  }
  // and the tightest case is the supported baseline itself
  const baseline = result.entryQuantised.filter((entry) => entry.viewport.width === SUPPORTED_BASELINE.minWidth && entry.viewport.height === SUPPORTED_BASELINE.minHeight);
  assert.equal(baseline.length, Object.keys(ENTRY_STACKS).length);
  for (const entry of baseline) assert.equal(entry.totalPx <= SUPPORTED_BASELINE.minHeight, true, entry.key);
  // the audit sums the real tokens, so the budget cannot silently drift
  const baseTokens = resolveTokens(sheet, SUPPORTED_BASELINE.minWidth, SUPPORTED_BASELINE.minHeight).tokens;
  const startStack = entryStack(ENTRY_STACKS.START, baseTokens, SUPPORTED_BASELINE.minWidth);
  assert.equal(startStack.missing.length, 0);
  assert.equal(startStack.totalPx > 0, true, "the START budget must be non-vacuous");
  assert.equal(Number.parseFloat(baseTokens.get("--entry-title-lh")) > 0, true);
});

test("UI02ENTRY_onescreen: the pre-run screens cannot create page-level scroll", () => {
  assert.equal(pageJson.disableScroll, true);
  assert.equal(declsOf("page").get("height"), "100%");
  assert.equal(declsOf("page").get("overflow"), "hidden");
  assert.equal(declsOf(".screen").get("height"), "100vh");
  assert.equal(declsOf(".screen").get("overflow"), "hidden");
  for (const key of ENTRY_FLOW) {
    const page = findByClass(elements, ENTRY_PAGE_CLASS[key]);
    assert.equal(page.length, 1, `${key} must render exactly one page container`);
    assert.equal(classesOf(page[0]).includes("page"), true);
    assert.equal(ancestorClasses(page[0]).includes("surface"), true, `${key} must be a .surface child`);
  }
  // the only scroll regions inside the pre-run flow are the two bounded lists
  const entryScrollViews = elements.filter(
    (element) => element.tag === "scroll-view" && ENTRY_FLOW.some((key) => ancestorClasses(element).includes(ENTRY_PAGE_CLASS[key]))
  );
  assert.equal(entryScrollViews.length, 2, "exactly the mode list and the candidate list may scroll");
  for (const element of entryScrollViews) {
    assert.equal(/(^|\s)scroll-y(\s|$)/.test(element.attrs), true);
    const classes = classesOf(element);
    assert.equal(classes.includes("entry-list"), true, "an entry scroll region must be the bounded list surface");
    const decls = declsOf(".entry-list");
    assert.equal(String(decls.get("flex")).startsWith("1 1"), true, ".entry-list must absorb the remainder");
    assert.equal(decls.get("min-height"), "0", ".entry-list must be compressible");
  }
  // and the pre-run action areas reserve the home-indicator inset
  assert.equal(/env\(safe-area-inset-bottom/.test(ruleBody(sheet, ".entry-dock")), true);
  for (const viewport of VIEWPORT_MATRIX) {
    const tokens = resolveTokens(sheet, viewport.width, viewport.height).tokens;
    const cta = lengthPx(String(declsOf(".entry-cta").get("min-height")), tokens, viewport.width);
    assert.equal(cta >= TOUCH_TARGET_MIN_PX, true, `the pre-run primary control is ${cta.toFixed(2)}px at ${viewport.width}x${viewport.height}`);
  }
  assert.equal(SAFE_AREA_BOTTOM_WORST_CASE_PX >= 34, true);
});

// ---------------------------------------------------------------- audits and fixtures

test("UI02ENTRY_gates: the structural audits are green and the generated fixtures are fresh", () => {
  const layout = auditLayout();
  assert.equal(layout.failures.length, 0, "layout audit failures:\n" + layout.failures.map((failure) => failure.name + " :: " + failure.detail).join("\n"));
  assert.equal(layout.checks.length >= 120, true, "expected a substantive audit, got " + layout.checks.length + " checks");
  const compat = auditWxssCompat();
  assert.equal(compat.failures.length, 0, "wxss compatibility failures:\n" + compat.failures.map((failure) => failure.name + " :: " + failure.detail).join("\n"));
  // fixture freshness: the committed artifacts are exactly what the production chain generates
  const generated = buildPreviewFixtures();
  assert.equal(read(FIXTURE_PATH), buildFixtureJsonSource(generated), "stale " + FIXTURE_PATH);
  assert.equal(read(FIXTURE_MODULE_PATH), buildFixtureModuleSource(generated), "stale " + FIXTURE_MODULE_PATH);
  assert.deepEqual(fixtures.entry, JSON.parse(JSON.stringify(buildPreviewEntry())), "the entry collection must be generated, not hand-edited");
  // the page still loads the fixture through the single statically analysable literal require
  const calls = requireArguments(pageJs);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].specifier, FIXTURE_MODULE_SPECIFIER);
});

test("UI02ENTRY_scope: the default route and the 1.0 pages are byte-equivalent to the task base", () => {
  // default route / route registration (the preview is still last and still not the default)
  assert.equal(readJson("miniprogram/app.json").pages[0], "pages/start/start");
  // UI04C appends its dev-only live page last, so the manifest is expected to change by exactly one
  // route: stripping that route must restore the accepted bytes.
  const raw = read("miniprogram/app.json");
  const stripped = raw.replace(',\n    "pages/v2-live/v2-live"', "");
  assert.notEqual(stripped, raw, "the strip must really remove the appended live route");
  assert.equal(
    createHash("sha256").update("miniprogram/app.json").update(":").update(createHash("sha256").update(stripped).digest("hex")).update("\n").digest("hex"),
    "222ff69299f6e8c800a4e9a5ef334cfeb67a28ace5e55405cee050105e3fb47f",
    "miniprogram/app.json must differ from the task base only by the appended v2-live route"
  );
  // the 1.0 start page is untouched and knows nothing about the 2.0 entry flow
  assert.equal(
    treeDigestOf(["miniprogram/pages/start/start.js", "miniprogram/pages/start/start.wxml"]),
    "60e0cc693eb8849d74a23b56cca97b7a154e18ad2167013109efb534f1dfbcba"
  );
  for (const file of ["miniprogram/pages/start/start.js", "miniprogram/pages/start/start.wxml"]) {
    assert.equal(read(file).includes("v2-preview"), false, file);
  }
  // the pre-run screens add no transport and no platform SDK
  const pageCode = stripJs(pageJs);
  for (const forbidden of ["wx.request", "wx.login", "ApplicationTransport", "CommandGateway"]) {
    assert.equal(pageCode.includes(forbidden), false, `the preview must not wire live transport: ${forbidden}`);
  }
});

test("UI02ENTRY_scope: the page files do not reach into the gameplay layers", () => {
  for (const file of [WXML_PATH, PAGE_JS_PATH, WXSS_PATH]) {
    const source = read(file);
    for (const forbidden of ["server/src", "viewmodel.ts", "command-gateway", "packages/core/src", "packages/content/src", "packages/wechat-shell", "application-ui"]) {
      assert.equal(source.includes(forbidden), false, `${file} must not reach into ${forbidden}`);
    }
  }
});

// ---------------------------------------------------------------- negative controls

test("UI02ENTRY_guard: the new assertions detect the ways the entry slice could regress", () => {
  const sandbox = loadPreviewPage();
  const layout = auditLayout();

  // 1. a leaked hidden weight inside the entry fixture must be caught by the leak scan
  const injected = JSON.parse(JSON.stringify(fixtures.entry));
  injected.DESTINY_OFFER.view.currentInteraction.body.candidates[0].weight = 42;
  const scan = (value) => JSON.stringify(value).includes("weight");
  assert.equal(scan(fixtures.entry), false);
  assert.equal(scan(injected), true, "the leak scan must see an injected weight");

  // 2. a hand-invented mode would break the vocabulary pin
  const invented = sandbox.buildModeSelect({ shell: { visibleEntries: { dailyChallenge: true, commerce: true, share: true } } });
  assert.deepEqual(Array.from(invented.modes, (mode) => mode.modeId), CONTRACT_MODE_IDS);
  assert.equal(Array.from(invented.modes).some((mode) => mode.modeId === "pvp"), false);

  // 3. a default destiny selection must break the "nothing is decided" pin
  const countOf = (source) => (source.match(/offerSelected: ""/g) || []).length;
  assert.equal(countOf(pageJs) >= 1, true, "the page must default to no selection");
  const preselected = pageJs.replace('offerSelected: ""', 'offerSelected: "innate.1.root.five-elements.talent.exploration.03.destiny.major.years.04"');
  assert.notEqual(preselected, pageJs);
  assert.equal(countOf(preselected), countOf(pageJs) - 1, "the control must remove one empty-default site");
  // the behavioural half: with the real page, confirming without a selection still refuses to choose
  const untouchedPage = pageInstance(sandbox.pageOptions);
  untouchedPage.onLoad();
  untouchedPage.show("DESTINY_OFFER");
  untouchedPage.onOfferConfirm();
  assert.equal(untouchedPage.data.offerSelected, "", "the shipped page must not choose for the player");

  // 4. dropping a pre-run branch from the markup must leave a kind without a branch
  const dropped = wxml.replace("wx:if=\"{{vm.kind === 'RUN_OPENING'}}\"", "wx:if=\"{{false}}\"");
  assert.notEqual(dropped, wxml);
  const droppedKinds = [...new Set([...stripMarkup(dropped).matchAll(/vm\.kind\s*===\s*'([^']+)'/g)].map((match) => match[1]))];
  assert.equal(droppedKinds.includes("RUN_OPENING"), false, "the control must remove the branch");

  // 5. a pre-run screen that grows past the baseline must break the budget
  const grown = wxss.replace("--entry-cand-h: 152rpx;", "--entry-cand-h: 900rpx;");
  assert.notEqual(grown, wxss);
  const grownAudit = auditLayout({ wxss: grown });
  assert.equal(grownAudit.entryQuantised.some((entry) => entry.key === "DESTINY_OFFER" && entry.totalPx > entry.viewport.height), true);

  // 6. a mistyped binding renders blank and must be reported
  assert.deepEqual(unresolvedBindings(sandbox.present("START"), entryRegion(stripMarkup(wxml), 'class="page page--start"')), []);
  const typo = wxml.replace("{{vm.start.coreLine}}", "{{vm.start.coreLineTypo}}");
  assert.notEqual(typo, wxml);
  assert.deepEqual(
    unresolvedBindings(sandbox.present("START"), entryRegion(stripMarkup(typo), 'class="page page--start"')),
    ["start.coreLineTypo"],
    "a mistyped binding must be reported"
  );

  // and the real inputs are untouched by any of the above
  assert.equal(auditLayout().failures.length, 0);
  assert.equal(JSON.stringify(fixtures.entry).includes("weight"), false);
  assert.equal(layout.entryQuantised.length, Object.keys(ENTRY_STACKS).length * VIEWPORT_MATRIX.length);
});

test("UI02ENTRY_a11y: no pre-run text is shrunk below the readability floor", () => {
  const tooSmall = [];
  for (const rule of sheet.outerRules) {
    if (!/^\.(entry|offer|opening)-/.test(rule.selector)) continue;
    const match = /font-size:\s*(\d+)rpx/.exec(rule.body);
    if (match === null) continue;
    if (Number(match[1]) < MIN_FONT_SIZE_RPX) tooSmall.push(rule.selector + " -> " + match[1] + "rpx");
  }
  assert.deepEqual(tooSmall, [], `pre-run text below ${MIN_FONT_SIZE_RPX}rpx: ${tooSmall.join(", ")}`);
});
