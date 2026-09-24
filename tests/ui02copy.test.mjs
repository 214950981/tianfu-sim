/**
 * UI02COPY — player-facing copy / raw-key cleanup: structural invariants that are actually
 * machine-checkable.
 *
 * This file pins what the copy pass changed and what it must not have changed:
 *
 *  - every string the product markup can render for any committed fixture is player-facing Chinese,
 *    never a dot-separated content key and never an internal capability enum name;
 *  - EVENT / SPECIAL_NODE render a readable Chinese title, body and every option label while the
 *    option ids, `riskPresentation` and the submission/locking semantics stay untouched;
 *  - LIFE_ARCHIVE renders readable Chinese history and build-transition copy without touching the
 *    public history data it aggregates;
 *  - MODE_SELECT shows a concise player-facing unavailable state, and the internal capability
 *    diagnostic is structurally unreachable from the markup;
 *  - the copy catalog is *bounded*: exactly the narrative content keys the committed fixtures expose,
 *    no more, and an unmapped future key still fails visibly instead of inventing copy;
 *  - START / DESTINY_OFFER / RUN_OPENING keep their documented copy, and nothing promises a reward,
 *    a benefit or an outcome.
 *
 * The visual guard is derived from the committed markup rather than from a hand-written field list,
 * so it cannot go stale when a binding is added or renamed. It is behavioural in the same sense the
 * other preview suites are: it loads the real page module, runs the real `present()` over the real
 * committed fixture, and resolves every path the markup actually renders.
 *
 * It cannot judge whether the Chinese reads well. Visual acceptance is still a human DevTools pass —
 * see docs/UI02_PREVIEW.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { FIXTURE_MODULE_PATH, FIXTURE_MODULE_SPECIFIER } from "../tools/ui02-preview-fixture-module.mjs";
import { PAGE_JS_PATH, WXML_PATH, parseWxmlElements } from "../tools/ui02r1-layout-audit.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

const pageJs = read(PAGE_JS_PATH);
const wxml = read(WXML_PATH);
const fixtures = readJson("miniprogram/pages/v2-preview/v2-fixtures.json");

const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripMarkup = (source) => source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
/**
 * The same comment-stripping `parseWxmlElements` applies internally, so the parser's element offsets
 * and the region offsets below are measured against the identical string.
 */
const stripComments = (source) => source.replace(/<!--[\s\S]*?-->/g, "");

const ALL_FIXTURE_KEYS = [
  ...Object.keys(fixtures.entry),
  ...Object.keys(fixtures.states),
  ...Object.keys(fixtures.variants)
];

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

// ---------------------------------------------------------------- the two forbidden shapes

/**
 * An implementation identifier must never reach the player:
 *  - a dot-separated content key (application facing), e.g. `dev.first-choice.title`,
 *    `build.fact.BUILD_STAGE_TRANSITION.summary`;
 *  - an internal capability enum name (platform/authority facing), e.g. `DailyChallengeCapability`.
 *
 * Both patterns are anchored and require at least one dot / a `Capability` suffix, so ordinary copy
 * (Chinese prose, "剑修 · 成形", "低险", numbers, ids without dots such as `npc:core:mentor`) cannot
 * trip them by accident.
 */
const RAW_CONTENT_KEY = /^[a-z][a-z0-9-]*(?:\.[A-Za-z0-9_-]+)+$/;
const CAPABILITY_NAME = /[A-Za-z]Capability$/;

/** The product-surface region of the committed markup: everything `.surface` draws, minus the dev layer. */
function productRegion(rawMarkup) {
  const cleaned = stripComments(rawMarkup);
  const start = cleaned.indexOf('class="surface"');
  const end = cleaned.indexOf("dev-trigger");
  assert.equal(start >= 0 && end > start, true, "the product surface and dev-layer markers must both exist");
  return cleaned.slice(start, end);
}

/** Drops `X op Y` comparisons: a ternary condition is evaluated, not rendered. */
function renderableExpressions(inner) {
  return inner.replace(/[^\s{}?]+?\s*(?:===|!==|==|!=|<=|>=|<|>)\s*[^\s{}?:]+/g, " ");
}

/**
 * Every value binding the product markup renders, derived from the markup itself.
 *
 * Returns `[{ path, list }]`: `list === null` for a `vm.*` binding, otherwise the `wx:for` array a
 * nested `item.*` binding iterates.
 *
 * Attribute bindings (`class`, `data-*`, `wx:for`, `wx:if`, `style`, `wx:key`) are stripped before
 * scanning: they are markup mechanics, not product copy. A descendant element's attributes appear in
 * its ancestor's `inner` source, so stripping them is what keeps `data-intent` / `data-option` style
 * control ids (e.g. `special.attemptBreakthrough`) out of a surface-copy scan.
 */
function renderedBindings(rawMarkup) {
  const cleaned = stripComments(rawMarkup);
  const surfaceAt = cleaned.indexOf('class="surface"');
  const devAt = cleaned.indexOf("dev-trigger");
  assert.equal(surfaceAt >= 0 && devAt > surfaceAt, true, "the product surface and dev-layer markers must both exist");

  const bindings = [];
  const seen = new Set();
  const push = (path, list) => {
    const id = (list === null ? "vm:" : list + "[]:") + path;
    if (seen.has(id)) return;
    seen.add(id);
    bindings.push({ path, list });
  };

  for (const element of parseWxmlElements(rawMarkup)) {
    if (element.index < surfaceAt || element.index >= devAt) continue;
    const forMatch = /wx:for="\{\{(vm\.([A-Za-z0-9_.]+))\}\}"/.exec(element.attrs);
    if (forMatch !== null) {
      // `item.` bindings below are attributed to this element's list, which is only sound while the
      // markup keeps every `wx:for` flat. Fail closed rather than guess if that ever changes.
      assert.equal(
        parseWxmlElements(element.inner).some((child) => /wx:for="/.test(child.attrs)),
        false,
        "a nested wx:for would break the copy guard's list attribution"
      );
    }
    const text = element.inner.replace(/\s[a-zA-Z-]+(?:="[^"]*"|='[^']*')/g, " ");
    for (const mustache of renderableExpressions(text).matchAll(/\{\{([^}]*)\}\}/g)) {
      for (const ref of mustache[1].matchAll(/\bvm\.([A-Za-z0-9_.]+)/g)) {
        push(ref[1].replace(/\.$/, ""), null);
      }
      if (forMatch === null) continue;
      for (const ref of mustache[1].matchAll(/\bitem\.([A-Za-z0-9_.]+)/g)) {
        push(ref[1].replace(/\.$/, ""), forMatch[2]);
      }
    }
  }
  return bindings;
}

/** Resolves a dotted path on an object; undefined when any segment is missing. */
function resolve(root, dotted) {
  let node = root;
  for (const segment of dotted.split(".")) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = node[segment];
  }
  return node;
}

/** Every string one presented view actually renders, paired with the binding that produced it. */
function renderedValues(view, bindings) {
  const out = [];
  for (const binding of bindings) {
    if (binding.list === null) {
      const value = resolve(view, binding.path);
      if (value !== undefined) out.push({ label: binding.path, value });
      continue;
    }
    const list = resolve(view, binding.list);
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const value = resolve(item, binding.path);
      if (value !== undefined) out.push({ label: binding.list + "[].item." + binding.path, value });
    }
  }
  return out;
}

/**
 * The guard itself, factored out so the negative controls can prove it is not vacuous. It reports
 * every rendered string that is still an implementation identifier.
 */
function copyProblems(view, bindings) {
  const problems = [];
  for (const { label, value } of renderedValues(view, bindings)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (RAW_CONTENT_KEY.test(value)) problems.push(label + " renders the raw content key " + JSON.stringify(value));
    else if (CAPABILITY_NAME.test(value)) problems.push(label + " renders the internal capability name " + JSON.stringify(value));
  }
  return problems;
}

/**
 * The fixture paths the preview page's copy layer consumes as *narrative content*: the interaction
 * title/body/option keys of the two decision surfaces, plus the public history and cause
 * title+summary keys the archive aggregates. It is derived from the committed fixtures, so the
 * catalog below can be pinned by set equality rather than by a hand-copied list going stale.
 */
function narrativeKeysOf(source) {
  const keys = new Set();
  const add = (value) => { if (typeof value === "string" && value.length > 0) keys.add(value); };
  for (const key of ALL_FIXTURE_KEYS) {
    const entry = source.entry[key] || source.states[key] || source.variants[key];
    const interaction = entry.view === undefined ? undefined : entry.view.currentInteraction;
    if (interaction !== undefined && interaction !== null) {
      add(interaction.titleKey);
      add(interaction.body === undefined || interaction.body === null ? undefined : interaction.body.bodyKey);
      for (const option of interaction.options === undefined ? [] : interaction.options) add(option.labelKey);
    }
    const state = entry.view === undefined ? undefined : entry.view.state;
    for (const cause of state === undefined || state.publicCauses === undefined ? [] : state.publicCauses) {
      add(cause.titleKey);
      add(cause.summaryKey);
    }
    const archive = entry.archive;
    if (archive === undefined) continue;
    for (const row of archive.history) { add(row.titleKey); add(row.summaryKey); }
    for (const cause of archive.causes) { add(cause.titleKey); add(cause.summaryKey); }
  }
  return [...keys].sort();
}

// ---------------------------------------------------------------- the catalog is bounded and honest

test("UI02COPY_catalog: the copy catalog is exactly the narrative content keys the committed fixtures expose", () => {
  const sandbox = loadPreviewPage();
  const catalog = JSON.parse(JSON.stringify(sandbox.CONTENT_COPY));
  assert.equal(typeof catalog, "object", "CONTENT_COPY must be a page-level catalog");

  const expected = narrativeKeysOf(fixtures);
  assert.equal(expected.length > 0, true, "the committed fixtures must expose narrative content keys");
  assert.deepEqual(
    Object.keys(catalog).sort(),
    expected,
    "the catalog must cover exactly the reachable narrative keys: no missing entry (a raw key would render) " +
      "and no invented one (that would be copy for content that does not exist)"
  );
  // and every entry is real Chinese copy, not a key echoed back
  for (const [key, value] of Object.entries(catalog)) {
    assert.equal(typeof value === "string" && value.length > 0, true, key + " must map to non-empty copy");
    assert.equal(/[\u4e00-\u9fff]/.test(value), true, key + " must map to Chinese copy, got " + JSON.stringify(value));
    assert.equal(RAW_CONTENT_KEY.test(value), false, key + " must not echo a content key");
    assert.equal(CAPABILITY_NAME.test(value), false, key + " must not name a capability");
  }
  // the option labels the two decision surfaces render are distinct, so the copy is per-option and
  // not a single blob reused everywhere
  const optionCopies = Object.entries(catalog)
    .filter(([key]) => /^dev\.(first-choice|ordinary-fallback)\./.test(key) && !/\.(title|body|history)$/.test(key))
    .map(([, value]) => value);
  assert.equal(new Set(optionCopies).size, optionCopies.length, "each distinct option key needs its own copy");
});

test("UI02COPY_catalog: the catalog carries no capability vocabulary, no per-run fixture value and no promise", () => {
  const sandbox = loadPreviewPage();
  const serialized = JSON.stringify(sandbox.CONTENT_COPY);
  for (const capability of ["DailyChallengeCapability", "AdCapability", "RewardedAdCapability", "CommerceCapability", "ShareCapability", "PlatformCapability", "AiNarrativeCapability"]) {
    assert.equal(serialized.includes(capability), false, "the catalog must not name a capability: " + capability);
  }
  // per-run values belong to the projection, never to a presentation catalog
  for (const perRun of ["青芜问道", "无名老者", "柳氏药婆", "inst-ui02-event", "npc:core:mentor", "hint_cause"]) {
    assert.equal(serialized.includes(perRun), false, "the catalog must not inline a per-run fixture value: " + perRun);
  }
  // and it promises nothing: no reward, benefit, probability or outcome vocabulary
  for (const promise of ["奖励", "免费", "礼包", "福利", "赠送", "返利", "VIP", "无限", "一键满级", "获得", "收益", "概率", "成功率", "权重"]) {
    assert.equal(serialized.includes(promise), false, "the copy must not promise anything: " + promise);
  }
  // a rewritten-content guard: the catalog is a presentation table in the page, not a content-pack edit
  for (const file of ["packages/content/dev-fixtures/minimal-pack.json"]) {
    assert.equal(read(file).includes("前路初开"), false, file + " must stay a content source, not a copy target");
  }
});

// ---------------------------------------------------------------- the visual guard

test("UI02COPY_surface: no committed fixture renders a raw content key or a capability name", () => {
  const sandbox = loadPreviewPage();
  const bindings = renderedBindings(wxml);
  assert.equal(bindings.length >= 25, true, "the guard must be substantive, got " + bindings.length + " bindings");

  for (const key of ALL_FIXTURE_KEYS) {
    const view = sandbox.present(key);
    assert.notEqual(view, null, key + " must project a view");
    assert.deepEqual(copyProblems(view, bindings), [], key + " still renders implementation vocabulary");
  }
  // and the guard really is reading rendered values, not nothing: touching a known copy field changes it
  const runHome = sandbox.present("RUN_HOME");
  const values = renderedValues(runHome, bindings).map((entry) => entry.label);
  for (const expected of ["runHome.runName", "runHome.realmName", "runHome.attentions[].item.value", "runHome.actions[].item.label", "runHome.breakthrough.note"]) {
    assert.equal(values.includes(expected), true, "the guard must resolve " + expected);
  }
});

test("UI02COPY_surface: the markup itself carries no internal capability vocabulary", () => {
  const surface = productRegion(wxml);
  for (const capability of ["DailyChallengeCapability", "AdCapability", "RewardedAdCapability", "CommerceCapability", "ShareCapability", "PlatformCapability", "AiNarrativeCapability"]) {
    assert.equal(surface.includes(capability), false, "the product surface must not name a capability: " + capability);
  }
  // the unavailable row renders the player-facing field, and the internal diagnostic is not bound at all
  assert.equal(/class="entry-row-note">\{\{item\.available \? item\.note : item\.gateLabel\}\}</.test(surface), true, "MODE_SELECT must render the player-facing unavailable state");
  assert.equal(/item\.gateNote/.test(surface), false, "the internal capability diagnostic must stay unreachable from the product surface");
  assert.equal((stripMarkup(wxml).match(/gateNote/g) || []).length, 0, "no markup path may reference gateNote");
});

// ---------------------------------------------------------------- EVENT / SPECIAL_NODE / LIFE_ARCHIVE

test("UI02COPY_decision: EVENT renders readable Chinese title, body and every option label", () => {
  const sandbox = loadPreviewPage();
  const decision = JSON.parse(JSON.stringify(sandbox.present("EVENT").decision));
  const interaction = fixtures.states.EVENT.view.currentInteraction;

  assert.equal(decision.headline, sandbox.CONTENT_COPY[interaction.titleKey], "the title must render the catalog copy");
  assert.equal(decision.bodyKey, sandbox.CONTENT_COPY[interaction.body.bodyKey], "the body must render the catalog copy");
  for (const value of [decision.headline, decision.bodyKey]) {
    assert.equal(/[\u4e00-\u9fff]/.test(value), true, "readable Chinese expected, got " + JSON.stringify(value));
  }
  // all option labels, in the server's order, resolved one-to-one from the projected label keys
  assert.deepEqual(
    decision.options.map((option) => option.label),
    interaction.options.map((option) => sandbox.CONTENT_COPY[option.labelKey]),
    "every option label must be the catalog copy of its own projected label key"
  );
  assert.equal(decision.options.every((option) => /[\u4e00-\u9fff]/.test(option.label)), true, "every option label must be Chinese");
  // the option ids and the whole risk presentation are untouched
  assert.deepEqual(decision.options.map((option) => option.optionId), interaction.options.map((option) => option.optionId));
  assert.deepEqual(
    decision.options.map((option) => [option.hasRisk, option.tier, option.tierClass, option.canBeFatal, option.reasons]),
    interaction.options.map((option) => [
      option.riskPresentation !== undefined,
      sandbox.presentLabel(sandbox.RISK_TIER_LABELS, option.riskPresentation === undefined ? "" : option.riskPresentation.tier),
      option.riskPresentation === undefined ? "" : ({ low: "", caution: "is-caution", dangerous: "is-dangerous", lethal: "is-lethal" })[option.riskPresentation.tier],
      option.riskPresentation !== undefined && option.riskPresentation.canBeFatal === true,
      option.riskPresentation === undefined ? "" : option.riskPresentation.reasons.map((reason) => sandbox.presentLabel(sandbox.REASON_KEY_LABELS, reason)).join(" · ")
    ]),
    "riskPresentation must be rendered exactly as projected"
  );
  // the decision stays locked the way the accepted shell projects it
  assert.equal(decision.locked, true, "an unresolved decision must stay locked");
  assert.equal(decision.backAllowed, false);
});

test("UI02COPY_decision: SPECIAL_NODE renders readable Chinese copy with its locking and risk semantics unchanged", () => {
  const sandbox = loadPreviewPage();
  const decision = JSON.parse(JSON.stringify(sandbox.present("SPECIAL_NODE").decision));
  const interaction = fixtures.states.SPECIAL_NODE.view.currentInteraction;

  assert.equal(decision.headline, sandbox.CONTENT_COPY[interaction.titleKey]);
  assert.equal(decision.bodyKey, sandbox.CONTENT_COPY[interaction.body.bodyKey]);
  assert.equal(decision.options.length, interaction.options.length);
  assert.deepEqual(
    decision.options.map((option) => option.label),
    interaction.options.map((option) => sandbox.CONTENT_COPY[option.labelKey])
  );
  assert.equal(/[\u4e00-\u9fff]/.test(decision.headline), true);
  assert.equal(/[\u4e00-\u9fff]/.test(decision.bodyKey), true);
  // the same generic container and the same submission boundary as EVENT
  assert.equal(decision.locked, true);
  assert.equal(decision.kind, "SPECIAL_NODE");
  assert.equal(fixtures.states.SPECIAL_NODE.shell.ordinaryBackAllowed, false);
});

test("UI02COPY_archive: LIFE_ARCHIVE renders Chinese history copy without touching the public history data", () => {
  const sandbox = loadPreviewPage();
  const archive = JSON.parse(JSON.stringify(sandbox.present("LIFE_ARCHIVE").archive));
  const projected = fixtures.states.LIFE_ARCHIVE.archive;

  assert.equal(archive.entries.length, projected.history.length, "the entry count must not change");
  // the public history data itself is the untouched source of truth
  assert.deepEqual(archive.entries.map((entry) => entry.entryId), projected.history.map((entry) => entry.entryId));
  for (const [index, entry] of archive.entries.entries()) {
    assert.equal(entry.title, sandbox.CONTENT_COPY[projected.history[index].titleKey], "title " + index);
    assert.equal(entry.summary, sandbox.CONTENT_COPY[projected.history[index].summaryKey], "summary " + index);
    assert.equal(/[\u4e00-\u9fff]/.test(entry.title), true, "a history title must be Chinese, got " + JSON.stringify(entry.title));
    assert.equal(/[\u4e00-\u9fff]/.test(entry.summary), true, "a history summary must be Chinese, got " + JSON.stringify(entry.summary));
    assert.equal(RAW_CONTENT_KEY.test(entry.title) || RAW_CONTENT_KEY.test(entry.summary), false, "no dot-separated key may render");
  }
  // the entry kinds still read through the accepted structural label table, not through the copy catalog
  assert.deepEqual(archive.entries.map((entry) => entry.kind).sort(), ["事件", "事件", "道途"]);
  assert.equal(archive.readOnly, true);
  // and the rest of the archive (death / builds / people) is unchanged by this pass
  assert.equal(archive.deathRealm, "凡人");
  assert.equal(archive.deathCause, "寿元耗尽");
  assert.equal(archive.builds.every((build) => !["latent", "emerging", "formed", "refined"].includes(build.stage)), true);
});

// ---------------------------------------------------------------- MODE_SELECT is player-facing

test("UI02COPY_modes: MODE_SELECT unavailable rows show player-facing copy and no implementation vocabulary", () => {
  const sandbox = loadPreviewPage();
  const modes = JSON.parse(JSON.stringify(sandbox.present("MODE_SELECT").modeSelect.modes));
  const gated = modes.filter((mode) => !mode.available);
  assert.equal(gated.length > 0, true, "the committed fixture must contain unavailable entries");

  for (const mode of gated) {
    assert.equal(mode.gateLabel, "暂未开放", `${mode.modeId} must render the concise player-facing state`);
    assert.equal(CAPABILITY_NAME.test(mode.gateLabel), false, `${mode.modeId} must not leak its capability name`);
    assert.equal(mode.gateLabel.includes(mode.capability), false, `${mode.modeId} must not contain ${mode.capability}`);
  }
  // the internal diagnostic is retained for the dev/diagnostic layer only, and it is not what renders
  assert.equal(gated.every((mode) => mode.gateNote.includes(mode.capability)), true, "the internal attribution stays available");
  assert.equal(gated.every((mode) => mode.gateNote !== mode.gateLabel), true, "the rendered field is not the diagnostic");
  // an all-off projection still renders only player-facing copy
  const allOff = sandbox.buildModeSelect({ shell: { visibleEntries: { dailyChallenge: false, rewardedAd: false, commerce: false, share: false } } });
  const offModes = Array.from(allOff.modes).filter((mode) => !mode.available);
  assert.equal(offModes.length, 3);
  assert.equal(offModes.every((mode) => mode.gateLabel === "暂未开放"), true);
  assert.equal(offModes.every((mode) => CAPABILITY_NAME.test(mode.gateLabel) === false), true);
  // the main contract flow stays available and unchanged
  assert.equal(Array.from(allOff.modes).find((mode) => mode.modeId === "main").gateLabel, "");
});

// ---------------------------------------------------------------- fail visibly, never invent

test("UI02COPY_fallback: an unmapped future key falls back verbatim instead of inheriting wrong copy", () => {
  const sandbox = loadPreviewPage();
  assert.equal(sandbox.presentLabel(sandbox.CONTENT_COPY, "future.pack.unknown-key"), "future.pack.unknown-key");
  assert.equal(sandbox.presentLabel(sandbox.CONTENT_COPY, ""), "");
  assert.equal(sandbox.presentLabel(sandbox.CONTENT_COPY, undefined), undefined);

  // behavioural: a fixture carrying an unknown key renders that key, so the defect is visible
  const unknown = "future.pack.unknown-key";
  const committed = fixtures.states.EVENT;
  const mutated = {
    ...committed,
    view: {
      ...committed.view,
      currentInteraction: {
        ...committed.view.currentInteraction,
        titleKey: unknown,
        options: committed.view.currentInteraction.options.map((option, index) => (index === 0 ? { ...option, labelKey: unknown } : option))
      }
    }
  };
  const decision = sandbox.buildDecision(mutated);
  assert.equal(decision.headline, unknown, "an unmapped key must fall back to the raw key, i.e. fail visibly");
  assert.equal(decision.options[0].label, unknown);
  // the guard sees it, which is what makes the fallback a reported failure rather than a silent one
  assert.equal(copyProblems({ decision }, renderedBindings(wxml)).length > 0, true, "the guard must flag the unmapped key");
});

test("UI02COPY_fallback: the guard is not vacuous (negative controls)", () => {
  const bindings = renderedBindings(wxml);

  // 1. reverting the decision labels to the raw projected key must be caught
  const rawLabels = "label: text(option.labelKey, option.optionId),";
  assert.equal(pageJs.includes(rawLabels), false, "the shipped page must resolve the label through the catalog");
  const regressedLabels = pageJs.replace(
    "label: text(presentLabel(CONTENT_COPY, option.labelKey), option.optionId),",
    rawLabels
  );
  assert.notEqual(regressedLabels, pageJs, "the negative control must actually change the page source");
  const labelSandbox = loadPreviewPage(regressedLabels);
  assert.equal(
    copyProblems(labelSandbox.present("EVENT"), bindings).some((problem) => problem.includes("dev.first-choice.continue")),
    true,
    "the guard must catch a raw option label"
  );

  // 2. reverting the archive entry copy must be caught
  const regressedArchive = pageJs.replace(
    "      title: presentLabel(CONTENT_COPY, entry.titleKey),\n      summary: presentLabel(CONTENT_COPY, entry.summaryKey)",
    "      title: entry.titleKey,\n      summary: entry.summaryKey"
  );
  assert.notEqual(regressedArchive, pageJs, "the negative control must actually change the archive source");
  const archiveSandbox = loadPreviewPage(regressedArchive);
  assert.equal(
    copyProblems(archiveSandbox.present("LIFE_ARCHIVE"), bindings).some((problem) => problem.includes("build.fact.BUILD_STAGE_TRANSITION.summary")),
    true,
    "the guard must catch a raw history summary"
  );

  // 3. binding the internal capability diagnostic back into the markup must be caught by the markup pin
  const regressedMarkup = wxml.replace("item.available ? item.note : item.gateLabel", "item.available ? item.note : item.gateNote");
  assert.notEqual(regressedMarkup, wxml, "the negative control must actually change the markup");
  assert.equal(
    renderedBindings(regressedMarkup).some((binding) => binding.path === "gateNote"),
    true,
    "the guard must see gateNote once it is bound"
  );
  assert.equal(productRegion(regressedMarkup).includes("gateNote"), true);

  // 4. an empty catalog must break the coverage pin rather than silently rendering keys
  const emptyCatalog = pageJs.replace(/var CONTENT_COPY = \{[\s\S]*?\n\};/, "var CONTENT_COPY = {};");
  assert.notEqual(emptyCatalog, pageJs, "the negative control must actually change the catalog");
  const emptySandbox = loadPreviewPage(emptyCatalog);
  assert.notEqual(narrativeKeysOf(fixtures).length, Object.keys(emptySandbox.CONTENT_COPY).length, "an empty catalog must fail the coverage pin");
  assert.equal(copyProblems(emptySandbox.present("EVENT"), bindings).length > 0, true, "an empty catalog must render raw keys");

  // and the real inputs are untouched by any of the above
  const sandbox = loadPreviewPage();
  assert.deepEqual(Object.keys(sandbox.CONTENT_COPY).sort(), narrativeKeysOf(fixtures));
  assert.deepEqual(copyProblems(sandbox.present("EVENT"), bindings), []);
});

// ---------------------------------------------------------------- boundaries this pass must not move

test("UI02COPY_boundary: the copy pass changes no projected value, no route and no rule computation", () => {
  const sandbox = loadPreviewPage();
  // every non-copy field the page reported is still exactly the projected value
  const home = sandbox.present("RUN_HOME");
  assert.equal(home.pageState, "RUN_HOME");
  assert.equal(home.kind, "RUN_HOME");
  assert.equal(home.runHome.realmOrder, fixtures.states.RUN_HOME.view.state.publicRun.realm.order);
  assert.equal(home.runHome.runName, fixtures.states.RUN_HOME.view.state.publicRun.runName);
  assert.equal(home.runHome.cultivation, fixtures.states.RUN_HOME.view.state.publicRun.realm.cultivationBps);
  // the entry copy this task did not touch is still the documented product copy
  const start = sandbox.present("START").start;
  const brain = read("docs/PROJECT-BRAIN.md");
  const preview = read("docs/UI02_PREVIEW.md");
  assert.equal(brain.includes(sandbox.START_COPY.coreLine), true, "the START core line must stay documented verbatim");
  assert.equal(brain.includes(sandbox.START_COPY.positioning), true, "the START positioning line must stay documented verbatim");
  assert.equal(preview.includes(sandbox.START_COPY.title), true, "the product name must stay documented");
  assert.equal(start.primary.target, "MODE_SELECT");
  // DESTINY_OFFER / RUN_OPENING keep rendering the real public projection
  const offer = JSON.parse(JSON.stringify(sandbox.present("DESTINY_OFFER").destinyOffer));
  assert.deepEqual(
    offer.candidates.map((candidate) => candidate.spiritualRoot),
    fixtures.entry.DESTINY_OFFER.view.currentInteraction.body.candidates.map((candidate) => candidate.spiritualRoot)
  );
  assert.equal(offer.candidates.length, 3);
  const opening = sandbox.present("RUN_OPENING").runOpening;
  assert.equal(opening.selectedRoot, fixtures.entry.RUN_OPENING.selected.spiritualRoot.displayName);
  // no rule is computed and no transport is wired by the copy pass
  const code = stripJs(pageJs);
  for (const forbidden of ["Math.random", "wx.request", "difficulty", "checkSpec", "rng", "drawer.rows.push"]) {
    assert.equal(code.includes(forbidden), false, "the copy pass must not compute rules or wire transport: " + forbidden);
  }
  // the route registration and the default page are untouched
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  // UI04C appends its dev-only live page LAST, behind the accepted preview, so the preview stays
  // registered but is no longer the final entry.
  assert.equal(app.pages.slice(0, -1).includes("pages/v2-preview/v2-preview"), true, "the preview must stay registered");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live");
});
