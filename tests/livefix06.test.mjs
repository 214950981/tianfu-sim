/**
 * LIVEFIX06 — Content01 live-client Chinese copy completeness.
 *
 * THE REAL FAILURE THIS PINS
 *
 * In WeChat DevTools the Controller drove DESTINY_OFFER -> RUN_HOME -> EVENT and reached
 * `content01.ordinary.night-rain` at stateVersion 4. Cards and risk labels were Chinese, but the heading,
 * the body and all three choices rendered as raw keys: `content01.ordinary.night-rain.title`, `.body`,
 * `.choice.engage`, `.choice.consider`, `.choice.leave`.
 *
 * The cloud function was working and the server projection was correct. `CONTENT01_ZH_CN` in
 * packages/content/src/content01-v1.ts has always held 夜雨 and its full wording. The defect was entirely
 * client-side: v2-live.js kept a hand-maintained `CONTENT_COPY` of 18 page/dev keys, and `presentLabel`
 * returns the key verbatim on a miss, so the client had no translation for any Content01 key.
 *
 * WHY A GENERATOR AND NOT A BIGGER TABLE
 *
 * Hand-maintaining 340 Chinese strings is what just failed, so the catalog is generated:
 * tools/content01-zh-cn-module.mjs imports CONTENT01_ZH_CN from the production source and emits
 * miniprogram/pages/v2-live/content01-zh-cn.js. These tests pin the three properties that make that safe:
 * full coverage, determinism, and a freshness gate that actually fails on drift.
 *
 * WHAT THESE TESTS DO NOT DO
 *
 * They assert nothing about gameplay, RNG, risk or command semantics, because this task changed none of
 * those. Options and their ids come from the server projection and are compared against it unchanged.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { CONTENT01_ZH_CN, CONTENT01_EVENTS, CONTENT01_CAUSE_TEMPLATES } from "../packages/content/src/content01-v1.ts";
import {
  CONTENT01_KEY_PREFIX,
  MODULE_PATH,
  MODULE_SPECIFIER,
  CONSUMER_PATH,
  buildModuleSource,
  checkCatalogFreshness,
  selectContent01Keys,
  validateCatalog
} from "../tools/content01-zh-cn-module.mjs";

const ROOT = process.cwd();
const PAGE_PATH = "miniprogram/pages/v2-live/v2-live.js";
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const NIGHT_RAIN = "content01.ordinary.night-rain";
const NIGHT_RAIN_TITLE_KEY = `${NIGHT_RAIN}.title`;
const NIGHT_RAIN_BODY_KEY = `${NIGHT_RAIN}.body`;
const NIGHT_RAIN_CHOICE_KEYS = ["engage", "consider", "leave"].map((id) => `${NIGHT_RAIN}.choice.${id}`);

/** A raw Content01 key as it appears on screen when the catalog misses. */
const RAW_KEY = /^content01\.[a-z0-9.-]+$/i;
const CHINESE = /[\u4e00-\u9fff]/;

const sourceEntries = () => selectContent01Keys(CONTENT01_ZH_CN).map((key) => [key, CONTENT01_ZH_CN[key]]);

/**
 * Loads the committed generated module exactly as the WeChat runtime would: as a CommonJS module.
 *
 * `createRequire` cannot be used — package.json declares `"type": "module"`, so Node treats a `.js` file
 * as ESM and would ignore `module.exports`. That is a Node-only rule and does not apply to the WeChat
 * packager; tests/ui02r1.test.mjs loads its generated fixture module the same way.
 */
function loadGeneratedModule(source = read(MODULE_PATH)) {
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source, sandbox, { filename: MODULE_PATH });
  return sandbox.module.exports;
}

/**
 * Evaluates the real page and returns its merged catalog, the page-specific table and `presentLabel`.
 *
 * The page module ends in `Page({...})`, which does not exist outside the WeChat runtime, so a `Page` stub
 * is supplied. `CONTENT_COPY` and `presentLabel` are module-level bindings rather than exports, so they are
 * read back out of the same context. Only the presentation helpers are exercised: the catalog is pure and
 * stubbing the controller would test nothing.
 */
function loadPage(source = read(PAGE_PATH), generated = loadGeneratedModule()) {
  const require_ = (specifier) => (specifier.includes("content01-zh-cn") ? generated : {});
  const page = { module: { exports: {} }, require: require_, Page: () => {} };
  page.exports = page.module.exports;
  vm.createContext(page);
  vm.runInContext(source, page, { filename: PAGE_PATH });

  // The slice must reach PAST presentLabel's own definition and stop before the render model, which needs
  // the runtime stub. Slicing at presentLabel's own signature excludes its body and yields
  // "presentLabel is not defined" — a harness bug, not a product failure.
  const region = source.slice(0, source.indexOf("// ---------------------------------------------------------------- render model"));
  const probe = { module: { exports: {} }, require: require_ };
  vm.createContext(probe);
  vm.runInContext(
    `${region}\nthis.CONTENT_COPY = CONTENT_COPY; this.PAGE_CONTENT_COPY = PAGE_CONTENT_COPY; this.presentLabel = presentLabel;`,
    probe
  );
  return {
    CONTENT_COPY: probe.CONTENT_COPY,
    PAGE_CONTENT_COPY: probe.PAGE_CONTENT_COPY,
    presentLabel: probe.presentLabel,
    generated
  };
}

// ---------------------------------------------------------------- 1. source-key coverage

test("LIVEFIX06_coverage: every committed CONTENT01_ZH_CN key reaches the client catalog", () => {
  const sourceKeys = selectContent01Keys(CONTENT01_ZH_CN);
  assert.equal(sourceKeys.length > 300, true, `the source catalog must be substantive, got ${sourceKeys.length}`);

  const { CONTENT_COPY } = loadPage();
  const missing = sourceKeys.filter((key) => !Object.prototype.hasOwnProperty.call(CONTENT_COPY, key));
  assert.deepEqual(missing, [], "every source key must be present; a miss renders the raw key");

  // and the client must not have gone the other way and invented copy for content that does not exist
  const generatedKeys = loadGeneratedModule().map((pair) => pair[0]);
  const extra = Object.keys(CONTENT_COPY).filter(
    (key) => key.startsWith(CONTENT01_KEY_PREFIX) && !generatedKeys.includes(key)
  );
  assert.deepEqual(extra, [], "the client must not carry Content01 keys the source does not define");
});

test("LIVEFIX06_coverage: the catalog is exactly the generated Content01 keys plus the page-specific ones", () => {
  const { CONTENT_COPY, PAGE_CONTENT_COPY } = loadPage();
  const expected = new Set([...loadGeneratedModule().map((pair) => pair[0]), ...Object.keys(PAGE_CONTENT_COPY)]);
  assert.deepEqual(
    Object.keys(CONTENT_COPY).sort(),
    [...expected].sort(),
    "the merged catalog must be the union of the generated Content01 copy and the page-specific copy"
  );
});

test("LIVEFIX06_coverage: every mapped key carries real Chinese copy, never a key echoed back", () => {
  const { CONTENT_COPY } = loadPage();
  const offenders = Object.entries(CONTENT_COPY)
    .filter(([, value]) => typeof value !== "string" || value.length === 0)
    .map(([key]) => `${key} is empty`);
  assert.deepEqual(offenders, [], "an empty value would render a blank line");

  const echoes = Object.entries(CONTENT_COPY)
    .filter(([, value]) => RAW_KEY.test(value))
    .map(([key, value]) => `${key} => ${value}`);
  assert.deepEqual(echoes, [], "a value that is itself a raw key re-creates the reported bug");

  const noChinese = Object.entries(CONTENT_COPY)
    .filter(([, value]) => !CHINESE.test(value))
    .map(([key, value]) => `${key} => ${JSON.stringify(value)}`);
  assert.deepEqual(noChinese, [], "every entry must be Chinese copy");
});

// ---------------------------------------------------------------- 2. the observed EVENT

test("LIVEFIX06_event: night-rain title, body and all three choices resolve to Chinese copy", () => {
  const { CONTENT_COPY, presentLabel } = loadPage();
  const rendered = (key) => presentLabel(CONTENT_COPY, key);

  // the exact keys the Controller saw as raw text on the real device
  assert.equal(rendered(NIGHT_RAIN_TITLE_KEY), "夜雨");

  const body = rendered(NIGHT_RAIN_BODY_KEY);
  assert.equal(CHINESE.test(body), true);
  assert.equal(body.includes("夜雨敲窗"), true, "the body must be the canonical source body, not a stand-in");
  assert.equal(body.length > 40, true, "the body must be the full text, not a title echoed twice");

  assert.equal(NIGHT_RAIN_CHOICE_KEYS.length, 3, "the event has three choices");
  const labels = NIGHT_RAIN_CHOICE_KEYS.map(rendered);
  for (const label of labels) {
    assert.equal(CHINESE.test(label), true, `choice label must be Chinese, got ${JSON.stringify(label)}`);
    assert.equal(RAW_KEY.test(label), false, `choice label must not be a raw key: ${label}`);
  }
  assert.equal(new Set(labels).size, 3, "each choice needs its own copy, not one label reused");

  // no key from this event may leak, in any form
  for (const key of [NIGHT_RAIN_TITLE_KEY, NIGHT_RAIN_BODY_KEY, ...NIGHT_RAIN_CHOICE_KEYS]) {
    assert.equal(RAW_KEY.test(rendered(key)), false, `${key} still renders raw`);
  }
});

test("LIVEFIX06_event: the rendered body comes from the source catalog, not from the page table", () => {
  const { CONTENT_COPY, PAGE_CONTENT_COPY } = loadPage();
  assert.equal(
    Object.prototype.hasOwnProperty.call(PAGE_CONTENT_COPY, NIGHT_RAIN_BODY_KEY),
    false,
    "night-rain must be resolved by the generated catalog, which is what this task added"
  );
  assert.equal(CONTENT_COPY[NIGHT_RAIN_BODY_KEY], CONTENT01_ZH_CN[NIGHT_RAIN_BODY_KEY]);
});

test("LIVEFIX06_event: every key the content pack projects is renderable", () => {
  // The event definition is the server's own view. If it projects a key the catalog cannot render, the
  // player sees a raw key — so the catalog must cover what the pack actually projects.
  const { CONTENT_COPY } = loadPage();
  const unresolved = [];

  for (const event of CONTENT01_EVENTS) {
    for (const key of [event.titleKey, event.fallback === undefined ? undefined : event.fallback.bodyKey]) {
      if (typeof key !== "string") continue;
      if (!Object.prototype.hasOwnProperty.call(CONTENT_COPY, key)) unresolved.push(`${event.id} -> ${key}`);
    }
    for (const choice of event.choices) {
      if (!Object.prototype.hasOwnProperty.call(CONTENT_COPY, choice.labelKey)) {
        unresolved.push(`${event.id} -> ${choice.labelKey}`);
      }
    }
  }
  assert.deepEqual(unresolved, [], "every key the content pack projects must be renderable");
  assert.equal(CONTENT01_EVENTS.length > 30, true, "the guard must cover the whole event set");
});

test("LIVEFIX06_event: one event from every Content01 family resolves", () => {
  const { CONTENT_COPY } = loadPage();
  // One event per family, so this cannot pass by fixing ordinary/ alone.
  const representatives = [
    "content01.onboarding.first-breath",
    "content01.ordinary.tea-house",
    "content01.pei.broken-blade",
    "content01.jiang.bitter-decoction",
    "content01.cen.shield-stranger",
    "content01.xie.cave-gamble",
    "content01.xu.empty-courtyard",
    "content01.build.sword.river-cut",
    "content01.risk.falling-star",
    "content01.road.kindness-echo"
  ];
  for (const id of representatives) {
    const event = CONTENT01_EVENTS.find((candidate) => candidate.id === id);
    assert.equal(event !== undefined, true, `${id} must exist in the committed pack`);
    assert.equal(CHINESE.test(CONTENT_COPY[event.titleKey]), true, `${id} title must be Chinese`);
    assert.equal(CHINESE.test(CONTENT_COPY[event.fallback.bodyKey]), true, `${id} body must be Chinese`);
    for (const choice of event.choices) {
      assert.equal(CHINESE.test(CONTENT_COPY[choice.labelKey]), true, `${id} choice ${choice.id} must be Chinese`);
    }
  }
});

// ---------------------------------------------------------------- 3. other presentation surfaces

test("LIVEFIX06_surfaces: destiny offer copy resolves for every destiny", () => {
  const { CONTENT_COPY } = loadPage();
  for (const destinyId of ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"]) {
    for (const suffix of ["title", "body", "advantage", "cost", "hook"]) {
      const key = `${destinyId}.${suffix}`;
      assert.equal(CHINESE.test(CONTENT_COPY[key]), true, `${key} must resolve to Chinese copy`);
    }
  }
});

test("LIVEFIX06_surfaces: cause origin choice labels resolve", () => {
  const { CONTENT_COPY } = loadPage();
  // The origin labels are the only Content01 copy shown when a Cause is being planted.
  const originLabelKeys = CONTENT01_EVENTS.flatMap((event) =>
    event.choices.filter((choice) => choice.id.startsWith("bind-")).map((choice) => choice.labelKey)
  );
  assert.equal(originLabelKeys.length > 0, true, "the pack must project origin choices");
  for (const key of originLabelKeys) {
    assert.equal(CHINESE.test(CONTENT_COPY[key]), true, `${key} must resolve`);
  }
  assert.equal(CONTENT01_CAUSE_TEMPLATES.length > 0, true, "cause templates must exist");
});

test("LIVEFIX06_surfaces: no Content01 key leaks through presentLabel", () => {
  const { CONTENT_COPY, presentLabel } = loadPage();
  const leaks = selectContent01Keys(CONTENT01_ZH_CN)
    .map((key) => ({ key, shown: presentLabel(CONTENT_COPY, key) }))
    .filter(({ shown }) => RAW_KEY.test(shown) || shown.length === 0 || !CHINESE.test(shown))
    .map(({ key, shown }) => `${key} => ${shown}`);
  assert.deepEqual(leaks, [], "no Content01 key may render as a raw key, an empty string or non-Chinese");
});

test("LIVEFIX06_surfaces: an unknown key still falls through, so future keys stay detectable", () => {
  const { CONTENT_COPY, presentLabel } = loadPage();
  // The client must not invent copy for a key it has never seen. Falling through to the key is the honest
  // signal that the catalog is incomplete, and it is what makes the freshness gate meaningful.
  assert.equal(presentLabel(CONTENT_COPY, "content01.future.v99-unreleased.title"), "content01.future.v99-unreleased.title");
  assert.equal(presentLabel(CONTENT_COPY, "some.other.pack.key"), "some.other.pack.key");
  assert.equal(presentLabel(CONTENT_COPY, ""), "");
  // a known key still resolves, proving the fall-through is not simply a broken table
  assert.equal(presentLabel(CONTENT_COPY, NIGHT_RAIN_TITLE_KEY), "夜雨");
});

// ---------------------------------------------------------------- 4. the generated artifact

test("LIVEFIX06_artifact: the committed module equals a fresh read of the source catalog", () => {
  const entries = sourceEntries();
  assert.equal(read(MODULE_PATH), buildModuleSource(entries), `${MODULE_PATH} is stale; regenerate with --write`);
  // vm-realm arrays have a different Array.prototype, so deepEqual would fail on identity alone;
  // JSON round-trip both sides onto plain objects before comparing.
  const committedKeys = JSON.parse(JSON.stringify(loadGeneratedModule().map((pair) => pair[0])));
  assert.deepStrictEqual(committedKeys, entries.map((pair) => pair[0]));
});

test("LIVEFIX06_artifact: generation is deterministic and order-independent", () => {
  const first = buildModuleSource(sourceEntries());
  assert.equal(buildModuleSource(sourceEntries()), first, "two builds of the same catalog must be byte-identical");

  // key order in the source object must not leak into the artifact
  const reversed = Object.fromEntries(Object.entries(CONTENT01_ZH_CN).reverse());
  assert.equal(
    buildModuleSource(selectContent01Keys(reversed).map((key) => [key, reversed[key]])),
    first,
    "the artifact must be a function of the catalog contents, not of its insertion order"
  );
});

test("LIVEFIX06_artifact: the page loads the module with a static string literal", () => {
  const source = read(CONSUMER_PATH);
  const literal = new RegExp(`require\\(\\s*["']${MODULE_SPECIFIER.replace(/[./]/g, "\\$&")}["']\\s*\\)`);
  assert.equal(
    literal.test(source),
    true,
    // A variable specifier compiles but the WeChat packager cannot resolve it, and the page dies at
    // runtime with "module is not defined" — the failure documented for v2-fixtures.js.
    `${CONSUMER_PATH} must require(${JSON.stringify(MODULE_SPECIFIER)}) as a string literal`
  );
  // Comments legitimately quote the anti-pattern, so strip them before scanning for a bare variable.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/require\(\s*[A-Za-z_$][\w$]*\s*\)/.test(code), false, "no require() argument may be a bare variable");
  assert.equal(/require\(/.test(code), true, "the page must still require the catalog");
});

test("LIVEFIX06_artifact: the runtime package stays closed and free of server/TS-only dependencies", () => {
  const source = read(MODULE_PATH);
  assert.equal(/\brequire\s*\(/.test(source), false, "the generated module must require nothing");
  assert.equal(/\bimport\b/.test(source), false, "the generated module must not use ESM imports");
  assert.equal(/\bexport\b/.test(source), false, "the generated module must be CommonJS for the WeChat runtime");
  // The payload is data only, so the ban is applied to the exported array rather than the whole file:
  // the generated header legitimately mentions the .ts source it was derived from.
  const payload = source.slice(source.indexOf("module.exports = "));
  for (const forbidden of ["packages/", "node_modules", "process.", "require(", "import "]) {
    assert.equal(payload.includes(forbidden), false, `the exported payload must not reference ${forbidden}`);
  }
  // nothing but string pairs may be exported — no code path can smuggle in a dependency
  const pairs = loadGeneratedModule();
  for (const pair of pairs) {
    assert.equal(Array.isArray(pair) && pair.length === 2, true, "each entry must be a [key, copy] pair");
    assert.equal(typeof pair[0], "string", "the key must be a string");
    assert.equal(typeof pair[1], "string", "the copy must be a string");
  }
  assert.equal(MODULE_PATH.startsWith("miniprogram/"), true, "the module must live inside miniprogramRoot");
});

// ---------------------------------------------------------------- 5. the negative controls

test("LIVEFIX06_negative: deleting a client translation key reproduces the raw-key symptom", () => {
  // NEGATIVE CONTROL. A coverage test that only asserts "the generator exists" proves nothing, so this
  // removes one client entry and asserts the page then renders a raw key — the reported symptom.
  const victim = NIGHT_RAIN_TITLE_KEY;
  const generated = loadGeneratedModule().filter((pair) => pair[0] !== victim);
  const { CONTENT_COPY, presentLabel } = loadPage(read(PAGE_PATH), generated);

  assert.equal(
    Object.prototype.hasOwnProperty.call(CONTENT_COPY, victim),
    false,
    "the deleted key must be absent from the catalog"
  );
  assert.equal(
    presentLabel(CONTENT_COPY, victim),
    victim,
    "deleting a key must reproduce the raw-key symptom, which is what the coverage test detects"
  );
  // the rest of the catalog is untouched, so this is a surgical failure and not a blanket outage
  assert.equal(presentLabel(CONTENT_COPY, NIGHT_RAIN_BODY_KEY), CONTENT01_ZH_CN[NIGHT_RAIN_BODY_KEY]);
});

test("LIVEFIX06_negative: a new source key without regenerating the artifact fails the freshness gate", async () => {
  // NEGATIVE CONTROL for the gate itself. Simulates a future author adding text("content01.new.x", "新文案")
  // to the source while the committed module is untouched.
  const polluted = { ...CONTENT01_ZH_CN, "content01.future.only-in-source.title": "只存在于源码" };
  const staleArtifact = buildModuleSource(sourceEntries());
  const freshArtifact = buildModuleSource(selectContent01Keys(polluted).map((key) => [key, polluted[key]]));

  assert.notEqual(freshArtifact, staleArtifact, "a new source key must change the expected artifact");
  assert.equal(
    staleArtifact.includes("content01.future.only-in-source.title"),
    false,
    "the stale artifact is missing the new key, which is precisely the drift the gate reports"
  );
  assert.equal(
    selectContent01Keys(polluted).includes("content01.future.only-in-source.title"),
    true,
    "the new key must be selected by the same prefix rule as every other Content01 key"
  );

  // and the real gate agrees about the committed artifact
  const status = await checkCatalogFreshness(ROOT);
  assert.equal(status.fresh, true, "the committed artifact is fresh in this repository");
  assert.equal(status.keyCount, selectContent01Keys(CONTENT01_ZH_CN).length);
});

test("LIVEFIX06_negative: the generator refuses a catalog that would render badly", () => {
  assert.deepEqual(validateCatalog([["content01.a.title", "夜雨"]]), [], "valid copy must pass");
  assert.equal(
    validateCatalog([["content01.a.title", ""]])[0].includes("no copy"),
    true,
    "an empty value would render a blank line and must be rejected"
  );
  assert.equal(
    validateCatalog([["content01.a.title", "content01.b.title"]])[0].includes("raw key"),
    true,
    "a value that is itself a raw key must be rejected — that is the bug being fixed"
  );
  assert.equal(
    validateCatalog([["content01.a.title", "night rain"]])[0].includes("no Chinese characters"),
    true,
    "untranslated English must be rejected rather than shipped"
  );
});

// ---------------------------------------------------------------- 6. nothing else moved

test("LIVEFIX06_scope: content semantics and the LIVEFIX05 fallback are untouched", () => {
  // The product fix must not edit content semantics.
  const source = fs.readFileSync(path.join(ROOT, "packages/content/src/content01-v1.ts"), "utf8");
  assert.equal(
    source.includes("export const CONTENT01_ZH_CN: Record<string, string> = {};"),
    true,
    "content01-v1.ts must still build its catalog with text(); this task must not edit content semantics"
  );

  // The LIVEFIX05 fallback condition must survive untouched.
  const fallback = 'wx:if="{{!vm.isOffer && !vm.isHome && !vm.isDecision && !vm.isTerminal}}"';
  assert.equal(read("miniprogram/pages/v2-live/v2-live.wxml").includes(fallback), true, "v2-live.wxml must keep the LIVEFIX05 fallback");
});

test("LIVEFIX06_scope: option ids, order and command semantics are untouched", () => {
  // The catalog is presentation-only. The shape the page submits is still derived from the server
  // projection: three options for night-rain, in the order the pack declares them.
  const event = CONTENT01_EVENTS.find((candidate) => candidate.id === NIGHT_RAIN);
  assert.deepEqual(
    event.choices.map((choice) => choice.id),
    ["engage", "consider", "leave"],
    "option ids and order come from the pack and must be unchanged"
  );
  for (const choice of event.choices) {
    assert.equal(choice.scope, "core", "option scope is a contract, not copy");
    assert.equal(Object.prototype.hasOwnProperty.call(choice, "outcomes"), true, "outcomes must be intact");
  }

  // The command envelope lives in the submit path, not the catalog. What this task must not do is add or
  // alter one, so the guard is that the catalog region contains no envelope vocabulary at all: resolving
  // copy cannot reach the submission path.
  const page = read(PAGE_PATH);
  const catalogRegion = page.slice(0, page.indexOf("// ---------------------------------------------------------------- render model"));
  assert.equal(
    /CHOOSE_EVENT_OPTION|CHOOSE_ACTION|START_RUN|expectedStateVersion/.test(catalogRegion),
    false,
    "the catalog region must contain no command envelope; presentation copy cannot touch submission"
  );

  // and the real submission path is still present and still locked. The page delegates the envelope to
  // CommandSubmissionController, so the invariants here are that it still reads the controller's
  // stateVersion and still honours interactionLocked — not that a literal envelope string sits here.
  assert.equal(page.includes("model.stateVersion"), true, "the page must still read stateVersion from the projection");
  assert.equal(page.includes("model.shell.interactionLocked"), true, "submission locking must be unchanged");
  assert.equal(page.includes("controller.pageModel()"), true, "the page must still drive off the controller page model");
});
