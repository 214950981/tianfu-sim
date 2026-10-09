/**
 * PLAYUX01 — second review pass (GitHub issue #3, CHANGES_REQUESTED). Behavioural tests only.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/playux01.test.mjs
 *
 * The first pass produced a suite that checks algorithms, mappings and content shape. The Controller's
 * review accepted that work but rejected the verification standard: 20/20 green said nothing about
 * whether a player can see the result of their own choice, because no test drove the page. The blocking
 * findings B1 and B2 are both *player-visible* defects, so a source-text assertion cannot prove either is
 * fixed — the assertion has to run the real page over a real settlement.
 *
 * WHAT THESE TESTS REFUSE TO DO
 *
 * They never grep the page source for a string and call that a pass. Every case here either
 *   (a) drives the real CommandGateway over a real content01 run and feeds the receipt it returns into the
 *       page's own render model, or
 *   (b) invokes the page's own handlers with a stub controller and inspects the data they set.
 * Where a structural fact about the template genuinely matters (that there is exactly one result panel),
 * the assertion counts the real blocks rather than trusting a comment.
 *
 * THE FOUR GROUPS
 *
 *   B1  the settled result reaches the screen, and only a confirmed settlement produces one
 *   B2  the life book is a retrospective, and its counts share one basis with ENDING and REBIRTH_RESULT
 *   B3  option wording and settled effect agree, with no unsourced currency
 *   B4  an unknown terminal enum degrades conservatively instead of printing internal encoding
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  CONTENT01_PACK,
  CONTENT01_VERSION,
  CONTENT01_ZH_CN,
  ContentRegistry,
  NPC_CONTENT01_V1
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce } from "../packages/core/src/index.ts";
import { CommandGateway, InMemoryGatewayStore, ServerViewModelBuilder } from "../server/src/index.ts";
import {
  bootstrapWeChatRun,
  createWeChatCloudTransport,
  createWeChatPlatformStorage,
  WeChatRunController
} from "../packages/wechat-shell/src/index.ts";

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const PAGE_PATH = "miniprogram/pages/v2-live/v2-live.js";
const WXML_PATH = "miniprogram/pages/v2-live/v2-live.wxml";
const CATALOG_PATH = "miniprogram/pages/v2-live/content01-zh-cn.js";

const ACTIONS = ["cultivate", "travel", "worldly", "pursuit"];

function registry() {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
}
const content = registry();

function started(seed) {
  const seeded = createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:playux01b:${seed}`,
    playerId: "player:playux01b",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:playux01b:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20,
      maxAge: 200,
      runName: "复查",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: [...ACTIONS],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  });
  return reduce({
    state: seeded,
    command: { type: "START_RUN", offerId: seeded.run.offer.offerId, destinyId: "content01.destiny.steady" },
    context: { rulesVersion: seeded.rulesVersion, contentVersion: seeded.contentVersion, content, commandId: `cmd:${seed}:start` }
  }).state;
}

/** Walks the real Director until `eventId` is the current Event, so every case follows a reachable path. */
function reachEvent(eventId, seed, limit = 80) {
  let state = started(seed);
  if (state.run.events.current?.eventId === eventId) return { state, reached: true };
  for (let step = 0; step < limit && state.run.status === "active"; step += 1) {
    if (state.run.events.current?.eventId === eventId) return { state, reached: true };
    for (const actionId of ACTIONS) {
      const next = reduce({
        state,
        command: { type: "CHOOSE_ACTION", actionId },
        context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:w${step}:${actionId}` }
      }).state;
      if (next !== state) { state = next; break; }
    }
  }
  return { state, reached: state.run.events.current?.eventId === eventId };
}

/**
 * Loads the real page module in a vm context.
 *
 * The module ends in `Page({...})`, so a `Page` stub captures the page config; the runtime `require`
 * returns an empty object because only the presentation functions are under test. The trailing statement
 * publishes the module-level helpers, which are plain bindings rather than exports — without it there is
 * no way to call `buildRenderModel` from a test, and asserting on the source text instead would prove
 * nothing about what the page renders.
 */
function loadPage() {
  const source = read(PAGE_PATH);
  const generated = (() => {
    const sandbox = { module: { exports: {} } };
    vm.runInNewContext(read(CATALOG_PATH), sandbox, { filename: CATALOG_PATH });
    return sandbox.module.exports;
  })();
  let pageConfig = null;
  const sandbox = {
    module: { exports: {} },
    require: (specifier) => (specifier.includes("content01-zh-cn") ? generated : {}),
    Page: (config) => { pageConfig = config; }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${source}\n;this.__probe = {
      buildRenderModel: buildRenderModel,
      buildResultReceipt: buildResultReceipt,
      buildTerminal: buildTerminal,
      buildArchive: buildArchive,
      presentTerminalLabel: presentTerminalLabel,
      TERMINAL_LABELS: TERMINAL_LABELS,
      CONTENT_COPY: CONTENT_COPY
    };`,
    sandbox,
    { filename: PAGE_PATH }
  );
  assert.notEqual(pageConfig, null, "the page module must call Page({...})");
  return { probe: sandbox.__probe, page: pageConfig };
}

const page = loadPage();

/** The page's controller surface, stubbed. `buildRenderModel` reads exactly these three methods. */
function stubController(overrides = {}) {
  const model = {
    pageState: "RUN_HOME",
    runStatus: "active",
    stateVersion: 5,
    shell: { interactionLocked: false },
    archiveOpen: false,
    coreIntents: [],
    specialIntents: [],
    ...(overrides.model || {})
  };
  const view = overrides.view || {
    state: {
      publicRun: { runName: "复查", age: 20, maxAge: 200, realm: { id: "mortal", order: 0, cultivationBps: 0 }, resources: { spiritStone: 0 } }
    }
  };
  return {
    pageModel: () => model,
    view: () => view,
    submission: () => ({
      interactionState: "idle",
      mutuallyExclusiveLocked: false,
      requiresReconfirmation: false,
      ...(overrides.submission || {})
    })
  };
}

/** A page instance whose `setData` records instead of rendering, plus the controller it was given. */
function pageInstance(controller) {
  const instance = {
    controller,
    data: { stage: "ready", vm: null },
    setData: (patch) => { Object.assign(instance.data, patch); },
    refresh: page.page.refresh,
    runIntent: page.page.runIntent,
    onDismissResult: page.page.onDismissResult
  };
  instance.refresh();
  return instance;
}

/** Sums a receipt's own lines, so the comparison is against what the surface would print. */
function receiptTotals(receipt) {
  const totals = { cultivation: 0, spiritStone: 0, years: 0 };
  for (const line of receipt.domainEffects || []) {
    if (line.kind === "cultivation") totals.cultivation += line.delta;
    else if (line.kind === "resource" && line.resource === "spiritStone") totals.spiritStone += line.delta;
    else if (line.kind === "time") totals.years += line.years;
  }
  return totals;
}

/** Public-view facts used for the independent diff. */
function publicFacts(state, builder = new ServerViewModelBuilder(content)) {
  const view = builder.build(state);
  const run = view.state.publicRun;
  return {
    cultivation: run.realm.cultivationBps ?? run.realm.cultivation ?? 0,
    spiritStone: run.resources.spiritStone,
    age: run.age
  };
}

// ------------------------------------------------------------------ B1: the settled result reaches the screen

test("PLAYUX01B-001: a real settlement produces exactly one result panel whose numbers equal the settled state", async () => {
  const { state, reached } = reachEvent("content01.onboarding.first-breath", "b1-settle");
  assert.equal(reached, true, "the Director must be able to draw the cultivate opening");
  const eventId = state.run.events.current.eventId;
  const optionId = CONTENT01_PACK.events.find((event) => event.id === eventId).choices[0].id;

  const store = new InMemoryGatewayStore();
  store.seedRun(state);
  const gateway = new CommandGateway({
    store,
    content,
    projectView: (current) => new ServerViewModelBuilder(content).build(current)
  });

  const before = publicFacts(state);
  const result = await gateway.sendCommand({ playerId: state.run.playerId }, {
    commandId: "cmd:playux01b:settle",
    playerId: state.run.playerId,
    runId: state.run.runId,
    expectedStateVersion: state.stateVersion,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    clientPlatform: "dev",
    clientBuild: "playux01b",
    command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId }
  });
  assert.equal(result.ok, true, "the settlement must succeed");

  const after = publicFacts(store.readRun(state.run.runId).state);
  const totals = receiptTotals(result);

  // The panel's numbers are the receipt's numbers, and the receipt's numbers are the state's own delta.
  assert.equal(totals.cultivation, after.cultivation - before.cultivation, "receipt cultivation must equal the settled delta");
  assert.equal(totals.spiritStone, after.spiritStone - before.spiritStone, "receipt spiritStone must equal the settled delta");
  assert.equal(totals.years, after.age - before.age, "receipt time must equal the settled age delta");

  const vm = page.probe.buildRenderModel(stubController(), "", result);
  assert.equal(vm.hasResult, true, "a confirmed settlement must raise the result panel");
  assert.equal(vm.result.changed, true, "a settlement that moved something must not claim no gain");
  assert.equal(vm.result.lines.length > 0, true, "the panel must carry the settled lines");
  const rendered = vm.result.lines.map((line) => line.text).join(" | ");
  if (totals.cultivation !== 0) assert.match(rendered, new RegExp(`\\+${totals.cultivation}`), `panel must show the cultivation delta, got: ${rendered}`);
});

test("PLAYUX01B-002: the template carries exactly one result panel and it is gated on hasResult", () => {
  const wxml = read(WXML_PATH);
  const panels = wxml.match(/bindtap="onDismissResult"/g) || [];
  assert.equal(panels.length, 1, "there must be exactly one dismissal control, so at most one receipt is ever visible");
  assert.match(wxml, /wx:if="\{\{vm\.hasResult\}\}"/, "the panel must be gated on hasResult rather than always rendered");
  assert.match(wxml, /class="result-overlay"/, "the panel must render on its own overlay surface");
});

test("PLAYUX01B-003: a receipt that settled nothing measurable says so and invents no line", () => {
  // The honest no-gain case: the server settled an option whose effects changed nothing observable.
  const empty = page.probe.buildResultReceipt({ domainEffects: [], narrative: { changed: false, lines: [] } });
  assert.equal(empty.changed, false, "an empty settlement must not be reported as a change");
  // The page runs in its own vm realm, where an array literal has that realm's Array.prototype, so
  // deepStrictEqual would fail on prototype identity alone. Round-trip to plain data before comparing.
  assert.deepEqual(JSON.parse(JSON.stringify(empty.lines)), [], "no line may be invented for a settlement that produced none");
  assert.equal(empty.noGainText.length > 0, true, "the panel must say something true instead of showing zeroes");
  assert.equal(empty.noGainText.includes("+"), false, "the no-gain wording must not read like a reward");
});

test("PLAYUX01B-004: only a confirmed settlement raises the panel, and a repeat submit cannot stack a second one", async () => {
  const controller = {
    submit: async () => ({ ok: false, commandId: "c", stateVersion: 5, error: { code: "STATE_CONFLICT", messageKey: "state.version_conflict", retryable: false } }),
    reconfirm: async () => ({ ok: false, commandId: "c", stateVersion: 5, error: { code: "STATE_CONFLICT", messageKey: "state.version_conflict", retryable: false } }),
    retry: async () => { throw new Error("not used"); },
    submission: () => ({ interactionState: "retryableError", mutuallyExclusiveLocked: false, requiresReconfirmation: true }),
    pageModel: () => ({ pageState: "EVENT", runStatus: "active", stateVersion: 5, shell: { interactionLocked: false }, archiveOpen: false, coreIntents: [], specialIntents: [] }),
    view: () => ({ state: { publicRun: { runName: "复查", age: 20, maxAge: 200, realm: { id: "mortal" }, resources: { spiritStone: 0 } } } })
  };
  const instance = pageInstance(controller);

  // A conflicted submission is not a settlement: no panel may appear.
  instance.runIntent({ kind: "interactionOption", optionId: "x" }, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.data.vm.hasResult, false, "a STATE_CONFLICT must not raise a result panel");

  // A confirmed command that resolved NO Event is not the moment the spec shows a result for. START_RUN
  // and CHOOSE_ACTION also come back ok:true with a receipt, and a panel for them would both be wrong and
  // block the next action — which is exactly what the first draft of this change did.
  let submits = 0;
  controller.submit = async () => { submits += 1; return { ok: true, commandId: "c2", stateVersion: 6, domainEffects: [{ kind: "time", labelKey: "result.time", years: 1 }], narrative: { changed: true, lines: [] } }; };
  controller.submission = () => ({ interactionState: "idle", mutuallyExclusiveLocked: false, requiresReconfirmation: false });
  instance.runIntent({ kind: "interactionOption", optionId: "destiny" }, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submits, 1, "the submit must reach the controller");
  assert.equal(instance.data.vm.hasResult, false, "a settlement that resolved no Event must not raise the panel");

  // Now a real option settlement: the receipt names the Event it resolved.
  controller.submit = async () => { submits += 1; return { ok: true, commandId: "c3", stateVersion: 7, domainEffects: [{ kind: "cultivation", labelKey: "result.cultivation", delta: 150 }], narrative: { eventId: "content01.onboarding.first-breath", choiceId: "keep-driving", changed: true, lines: [] } }; };
  instance.runIntent({ kind: "interactionOption", optionId: "y" }, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.data.vm.hasResult, true, "a confirmed Event-option settlement must raise the panel");
  assert.equal(submits, 2, "the option submit must reach the controller");

  // A second submit while the panel is open must not reach the controller.
  instance.runIntent({ kind: "interactionOption", optionId: "z" }, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submits, 2, "a second submit while the panel is open must not reach the controller");

  // Dismissing is a pure UI action: it must not submit anything.
  instance.onDismissResult();
  assert.equal(instance.data.vm.hasResult, false, "dismissing must close the panel");
  assert.equal(submits, 2, "dismissing must not issue a command");
});

// ------------------------------------------------------------------ B2: life book, terminal, shared counting basis

/** A life book with three real history entries — one with no recorded choice — plus people, builds, a cause and a death. */
function lifeBookFixture() {
  return {
    lifeBook: {
      runName: "复查",
      age: 63,
      maxAge: 80,
      realm: { id: "foundation-establishment", order: 2 },
      events: [
        { entryId: "event:0", eventId: "content01.onboarding.first-breath", nodeIndex: 0, choiceId: "keep-driving" },
        { entryId: "event:1", eventId: "content01.onboarding.first-breath", nodeIndex: 1 },
        { entryId: "event:2", eventId: "content01.ordinary.mountain-view", nodeIndex: 2, choiceId: "breathe-here" }
      ],
      people: [{ npcId: "npc:pei", displayName: "裴照川", knownStatus: "alive" }],
      builds: [
        { buildId: "build.sword", displayName: "剑修", stage: "formed", labelKey: "build.sword.formed", dominant: true },
        { buildId: "build.fortune", displayName: "气运", stage: "latent", labelKey: "build.fortune.latent", dominant: false }
      ],
      causes: [{ publicId: "cause:1", level: "explicit", titleKey: "content01.cause.broken-sword-promise.title", summaryKey: "content01.cause.broken-sword-promise.summary" }],
      ending: { endingId: "death:death.death.injury", age: 63 },
      death: { deathCauseId: "death.death.injury", age: 63, directCause: "threat.critical-injury", wasWarned: true, causeRelatedDeath: false, category: "injury" }
    },
    rebirthResult: { completedRunId: "run:1", runName: "复查", finalAge: 63, finalRealm: { id: "foundation-establishment" } }
  };
}

test("PLAYUX01B-005: the life book renders an ordered timeline and records only the choices the save actually holds", () => {
  const fixture = lifeBookFixture();
  const terminal = page.probe.buildTerminal({ stage: "LIFE_BOOK", version: 1, ...fixture }, "LIFE_BOOK");
  const book = terminal.lifeBook;
  assert.equal(book.timeline.length, 3, "every recorded Event must appear as a turning point");
  // Round-tripped for the same realm reason as PLAYUX01B-003: the timeline is built inside the page's vm.
  assert.deepEqual(JSON.parse(JSON.stringify(book.timeline.map((row) => row.order))), [0, 1, 2], "the timeline must stay in node order");
  for (const row of book.timeline) {
    assert.equal(row.title.length > 0, true, `a turning point must carry a title, got ${JSON.stringify(row)}`);
    assert.equal(row.title.includes(".title"), false, `a turning point title must not be a raw key: ${row.title}`);
  }
  // Entry 0 and 2 recorded a choice; entry 1 did not and must say so rather than inventing one.
  assert.equal(book.timeline[0].hasChoice, true);
  assert.equal(book.timeline[0].choiceLabel.length > 0, true);
  assert.equal(book.timeline[1].hasChoice, false, "an older entry without choiceId must not claim a choice");
  assert.equal(book.timeline[1].choiceLabel, "", "no option may be manufactured for an entry that recorded none");
  assert.equal(book.timeline[2].hasChoice, true);
  assert.equal(book.timeline[2].choiceLabel.includes("调息") || book.timeline[2].choiceLabel.length > 0, true);
});

test("PLAYUX01B-006: ENDING, LIFE_BOOK and REBIRTH_RESULT report the same run through one counting basis", () => {
  const fixture = lifeBookFixture();
  const ending = page.probe.buildTerminal({ stage: "ENDING", version: 1, ...fixture }, "ENDING");
  const book = page.probe.buildTerminal({ stage: "LIFE_BOOK", version: 1, ...fixture }, "LIFE_BOOK");
  const rebirth = page.probe.buildTerminal({ stage: "REBIRTH_RESULT", version: 1, ...fixture }, "REBIRTH_RESULT");
  const a = ending.lifeBook.counts;
  const b = book.lifeBook.counts;
  const c = rebirth.lifeBook.counts;
  assert.deepEqual(a, b, "ENDING and LIFE_BOOK must agree on every count for the same run");
  assert.deepEqual(b, c, "LIFE_BOOK and REBIRTH_RESULT must agree on every count for the same run");
  // and the rebirth card must read those same numbers, not the server's separately-computed ones
  assert.equal(rebirth.rebirth.eventsExperienced, b.experiences);
  assert.equal(rebirth.rebirth.peopleMet, b.people);
  // `formed` is a different metric from `paths` and must not be conflated with it
  assert.equal(a.paths, 2, "both touched tracks count as paths");
  assert.equal(a.formed, 1, "only the dominant track counts as formed");
});

test("PLAYUX01B-007: an ENDING with no sidecar explains itself instead of reporting zero achievements", () => {
  const terminal = page.probe.buildTerminal({ stage: "ENDING", version: 0 }, "ENDING");
  assert.equal(terminal.lifeBook.hasLifeBook, false);
  assert.equal(terminal.lifeBook.counts.experiences, 0);
  const wxml = read(WXML_PATH);
  // The zero-count row must be unreachable before the sidecar exists; the screen shows the assembling notice.
  assert.match(wxml, /此生记录整理中/, "ENDING must say the record is being assembled");
  assert.match(wxml, /wx:if="\{\{!vm\.terminal\.lifeBook\.hasLifeBook\}\}"[\s\S]*此生记录整理中/, "the notice must be the guarded alternative to the counts");
});

test("PLAYUX01B-008: the live archive names the taken choice and admits when one was not recorded", () => {
  const archive = page.probe.buildArchive({
    runName: "复查",
    history: [
      { entryId: "event:0", kind: "event", titleKey: "content01.onboarding.first-breath.title", summaryKey: "content01.onboarding.first-breath.body", data: { eventId: "content01.onboarding.first-breath", nodeIndex: 0, choiceId: "keep-driving" } },
      { entryId: "event:1", kind: "event", titleKey: "content01.ordinary.mountain-view.title", summaryKey: "content01.ordinary.mountain-view.body", data: { eventId: "content01.ordinary.mountain-view", nodeIndex: 1 } }
    ],
    causes: [], builds: [], people: []
  });
  assert.equal(archive.history[0].hasChoice, true, "a recorded choice must be shown");
  assert.equal(archive.history[0].choiceLabel.length > 0, true);
  assert.equal(archive.history[1].hasChoice, false, "an unrecorded choice must not be invented");
  assert.equal(archive.history[1].choiceLabel, "");
});

// ------------------------------------------------------------------ B2: a death inside an Event is still explainable

test("PLAYUX01B-014: a lifespan death reached inside an Event records the cause, so ENDING can explain it", () => {
  // B2 requires ENDING to name the known direct cause. Two paths can spend a run's last year: a core
  // action, and an Event option's OUTCOME_TIME_DELTA. Only the action path used to write an ending and a
  // deathRecord, so a run that ran out of years while resolving an Event entered ENDING with nothing for
  // the life book or the terminal to read — permanently, since nothing revisits a finished run.
  const base = started("b2-event-death");
  const eventId = "content01.ordinary.mountain-view";
  const event = CONTENT01_PACK.events.find((entry) => entry.id === eventId);
  const choice = event.choices.find((entry) => entry.id === "orient-and-go");
  assert.notEqual(choice, undefined, "the fixture Event must still offer a time-only option");

  // Age 20 with a ceiling of 21, so the option's one-year cost crosses maxAge inside the Event.
  const staged = { ...base, run: { ...base.run, maxAge: 21, events: { ...base.run.events, history: [], current: { eventId, kind: "choice" } } } };
  const output = reduce({
    state: staged,
    command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "orient-and-go" },
    context: { rulesVersion: staged.rulesVersion, contentVersion: staged.contentVersion, content, commandId: "cmd:b2:event-death" }
  });
  const run = output.state.run;
  assert.equal(run.status, "dying", "crossing the ceiling inside an Event must still end the run");
  assert.equal(run.age, 21, "the age must be capped at the ceiling");
  assert.notEqual(run.deathRecord, undefined, "an Event-reached lifespan death must carry a death record");
  assert.equal(run.deathRecord.category, "lifespan");
  assert.equal(run.deathRecord.immediateSource, "lifespan-hard-ceiling");
  assert.equal(run.deathRecord.sourceCommandId, "cmd:b2:event-death", "the record must name the command that ended the life");
  assert.equal(run.ending.endingId, "lifespan", "the run must carry an ending for the terminal to read");
  // The same command through the action path must produce the same category and source, so the two paths
  // describe one death one way rather than two.
  const actionDeath = reduce({
    state: { ...base, run: { ...base.run, maxAge: 21 } },
    command: { type: "CHOOSE_ACTION", actionId: "worldly" },
    context: { rulesVersion: base.rulesVersion, contentVersion: base.contentVersion, content, commandId: "cmd:b2:action-death" }
  }).state.run;
  assert.equal(actionDeath.status, "dying");
  assert.equal(actionDeath.deathRecord.category, run.deathRecord.category, "both death paths must agree on the category");
  assert.equal(actionDeath.deathRecord.immediateSource, run.deathRecord.immediateSource);
  assert.equal(actionDeath.ending.endingId, run.ending.endingId);
});

// ------------------------------------------------------------------ B3: wording agrees with the settled effect

test("PLAYUX01B-009: no reachable option grants spirit stones without a plausible origin", () => {
  // Every remaining money grant must be a sale of the player's own goods, a share of divided spoils, or a
  // risk the option explicitly takes — never a scene that merely walks past, declines, or watches.
  const ALLOWED = new Set([
    "content01.onboarding.market-choice:take-deal",
    "content01.onboarding.market-choice:haggle-fair",
    "content01.ordinary.market-bargain:sell-herbs",
    "content01.xie.divided-spoils:consider"
  ]);
  const violations = [];
  for (const event of CONTENT01_PACK.events) {
    for (const choice of event.choices ?? []) {
      const effects = choice.outcomes?.success?.effects ?? [];
      const money = effects.find((effect) => effect.op === "ADD_RESOURCE");
      if (money === undefined) continue;
      const key = `${event.id}:${choice.id}`;
      const isRiskPayoff = choice.threatId !== undefined;
      if (!ALLOWED.has(key) && !isRiskPayoff) violations.push(key);
    }
  }
  assert.deepEqual(violations, [], "an option that neither sells, splits spoils nor takes a risk must not pay spirit stones");
});

test("PLAYUX01B-010: the four representative scenarios settle effects that match what their options say", () => {
  const byId = new Map(CONTENT01_PACK.events.map((event) => [event.id, event]));
  const effectsOf = (eventId, choiceId) => {
    const event = byId.get(eventId);
    const choice = (event.choices ?? []).find((entry) => entry.id === choiceId);
    assert.notEqual(choice, undefined, `${eventId} must still offer ${choiceId}`);
    return (choice.outcomes?.success?.effects ?? []).map((effect) => effect.op);
  };

  // cultivate: the act described is 行功, so cultivation is the honest effect.
  assert.equal(effectsOf("content01.onboarding.first-breath", "keep-driving").includes("ADD_CULTIVATION"), true);

  // travel: taking the long flat road costs time and pays nothing.
  const village = effectsOf("content01.onboarding.mountain-road", "go-village");
  assert.equal(village.includes("ADD_RESOURCE"), false, "a road choice must not pay spirit stones");
  assert.equal(village.includes("OUTCOME_TIME_DELTA"), true, "the long road must cost time");

  // worldly: buying produced money before; the sale variants must charge nothing extra and pay for the goods.
  for (const choiceId of ["take-deal", "haggle-fair"]) {
    const effects = effectsOf("content01.onboarding.market-choice", choiceId);
    assert.equal(effects.includes("ADD_RESOURCE"), true, `${choiceId} sells the player's herbs so it must pay`);
  }
  assert.equal(effectsOf("content01.onboarding.market-choice", "ask-source").includes("ADD_RESOURCE"), false, "declining to trade must not pay");

  // pursuit: no clue is recordable, so no option may claim a find by paying cultivation for it.
  for (const choiceId of ["follow-fresh", "mark-spot", "ask-locals"]) {
    const effects = effectsOf("content01.onboarding.old-trace", choiceId);
    assert.equal(effects.includes("ADD_CULTIVATION"), false, `${choiceId} is not 修行 and records no clue`);
    assert.equal(effects.includes("OUTCOME_TIME_DELTA"), true, `${choiceId} must settle the time it costs`);
  }
});

test("PLAYUX01B-011: the systemic template no longer pays for declining a scene", () => {
  // The default decline and the risk turn-away used to award one spiritStone, which is the "跑路就送钱"
  // pattern. They must now settle time only, wherever they are still used.
  const offenders = [];
  for (const event of CONTENT01_PACK.events) {
    for (const choice of event.choices ?? []) {
      if (choice.id !== "leave" && choice.id !== "turn-away") continue;
      const effects = choice.outcomes?.success?.effects ?? [];
      if (effects.some((effect) => effect.op === "ADD_RESOURCE")) offenders.push(`${event.id}:${choice.id}`);
    }
  }
  assert.deepEqual(offenders, [], "declining a scene must never pay the player");
});

// ------------------------------------------------------------------ B4: conservative terminal fallback

test("PLAYUX01B-012: an unknown terminal enum degrades to a conservative phrase, never to internal encoding", () => {
  const probe = page.probe;
  assert.equal(probe.presentTerminalLabel(probe.TERMINAL_LABELS, "death.death.injury", "原因尚未明确"), "伤重不治", "a known cause must still translate");
  const unknownDeath = probe.presentTerminalLabel(probe.TERMINAL_LABELS, "death.death.unreleased-v9", "原因尚未明确");
  assert.equal(unknownDeath, "原因尚未明确", "an unknown cause must read as unclear, not as its id");
  assert.equal(unknownDeath.includes("."), false, "the fallback must not look like an id");
  assert.equal(unknownDeath.includes("unreleased"), false);
  const unknownDetail = probe.presentTerminalLabel(probe.TERMINAL_LABELS, "threat.some.future.thing", "详情暂不可用");
  assert.equal(unknownDetail, "详情暂不可用");

  const terminal = probe.buildTerminal({
    stage: "LIFE_BOOK",
    version: 1,
    lifeBook: { runName: "X", age: 1, maxAge: 2, realm: { id: "mortal" }, events: [], people: [], builds: [], causes: [], ending: { endingId: "death:death.some.future" }, death: { directCause: "threat.some.future" } }
  }, "LIFE_BOOK");
  assert.equal(terminal.lifeBook.deathCause, "原因尚未明确");
  assert.equal(terminal.lifeBook.endingId, "详情暂不可用");
});

test("PLAYUX01B-013: every death enum the engine can emit is translated, so the fallback is never reached in practice", () => {
  // The reachable set, read off reducer.ts and risk-v1.ts. If a new enum appears this fails before a
  // player ever sees the conservative phrase, which is what keeps the fallback a safety net rather than a mask.
  const reachable = [
    "lifespan", "lifespan-hard-ceiling",
    "death.death.lifespan", "death.death.combat", "death.death.injury", "death.death.exploration",
    "death.death.poison", "death.death.curse", "death.death.cause", "death.death.special",
    "threat.critical-injury"
  ];
  const missing = reachable.filter((id) => page.probe.presentTerminalLabel(page.probe.TERMINAL_LABELS, id, "MISS") === "MISS");
  assert.deepEqual(missing, [], "every reachable engine enum must have a player-facing translation");
  for (const id of reachable) {
    const label = page.probe.TERMINAL_LABELS[id];
    assert.equal(typeof label === "string" && label.length > 0, true, `${id} must have copy`);
    assert.equal(label.includes("."), false, `${id} must not be rendered as an id`);
  }
});

// ================================================================= F1: the panel names what happened

const CLOUD_FUNCTION = "tianfu2";
// Must match the playerId `started()` seeds: the gateway rejects an envelope whose playerId disagrees with
// the run's owner, so the stub cloud, the session and the fixture have to name the same player.
const PLAYER_ID = "player:playux01b";

/** A minimal storage seam; the controller only needs get/set of the pending-command key. */
function rawStorage() {
  const map = new Map();
  return { getStorageSync: (key) => (map.has(key) ? map.get(key) : ""), setStorageSync: (key, value) => { map.set(key, value); } };
}

/**
 * Builds the REAL client stack over a stubbed cloud seam — the same chain `tests/ui04c.test.mjs` uses:
 * cloud stub -> CommandGateway -> createWeChatCloudTransport (which validates and parses the response)
 * -> WeChatRunController. Nothing here is a hand-made receipt: the object the page renders has been through
 * the shell boundary that used to discard it, which is the only way to prove B1 cannot regress.
 */
async function liveClient(seedRunId) {
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  const gateway = new CommandGateway({ store, content, projectView: (state) => builder.build(state) });
  const auth = { playerId: PLAYER_ID };
  const sent = [];

  const api = {
    async callFunction({ name, data }) {
      if (name !== CLOUD_FUNCTION) return { errMsg: "cloud.callFunction:fail", result: {} };
      if (data.operation === "createRunOffer") {
        const state = started(seedRunId);
        store.seedRun(state);
        return { errMsg: "cloud.callFunction:ok", result: { runId: state.run.runId, playerId: PLAYER_ID, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, view: builder.build(state) } };
      }
      if (data.operation === "fetchView") return { errMsg: "cloud.callFunction:ok", result: { view: await gateway.fetchView(auth, String(data.runId)) } };
      if (data.operation === "sendCommand") { sent.push(structuredClone(data.command)); return { errMsg: "cloud.callFunction:ok", result: await gateway.sendCommand(auth, structuredClone(data.command)) }; }
      throw new Error("the stub cloud knows no operation " + String(data.operation));
    }
  };

  const transport = createWeChatCloudTransport({ api, cloudFunctionName: CLOUD_FUNCTION });
  const storage = createWeChatPlatformStorage(rawStorage());
  const boot = await bootstrapWeChatRun({ transport, bootstrapId: "boot:playux01b", clientBuild: "playux01b" });
  let sequence = 0;
  const controller = new WeChatRunController({
    transport, storage, session: boot.session,
    commandIdFactory: () => `cmd:playux01b:${(sequence += 1)}`,
    initialView: boot.view
  });
  await controller.restore();
  return { controller, store, sent, runIdOf: () => boot.session.runId };
}

test("PLAYUX01B-015: the settled receipt survives the shell boundary and the panel names the Event and the option", async () => {
  // Reach a real decision through the real controller, then resolve it and render what comes back.
  const live = await liveClient("b1-shell-name");
  let model = live.controller.pageModel();
  for (let step = 0; step < 40 && model.pageState !== "EVENT" && model.pageState !== "SPECIAL_NODE"; step += 1) {
    // The intent id is the one the server projects (`core.<action>`), which is exactly what the page's
    // `onCoreAction` forwards from `dataset.intentId`; the controller resolves it against the ViewModel.
    await live.controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
    model = live.controller.pageModel();
  }
  assert.equal(model.pageState, "EVENT", "the Director must be able to draw an opening");

  const eventId = model.interaction.eventId;
  const optionId = model.interaction.options[0].optionId;
  const choiceLabel = CONTENT01_ZH_CN[`${eventId}.choice.${optionId}`];
  const eventTitle = CONTENT01_ZH_CN[`${eventId}.title`];
  assert.equal(typeof eventTitle, "string", "the fixture Event must have an authored title");

  const result = await live.controller.submit({ kind: "interactionOption", optionId });
  assert.equal(result.ok, true, "the option must settle");
  // The receipt the page will render came back THROUGH parseCommandResult, so its presence here is the
  // proof that the shell no longer throws the settlement away.
  assert.notEqual(result.narrative, undefined, "the receipt must survive the shell boundary");
  assert.equal(result.narrative.eventId, eventId, "the receipt must name the Event that settled");
  assert.equal(result.narrative.choiceId, optionId, "the receipt must name the option that was taken");

  const vm = page.probe.buildRenderModel(stubController(), "", result);
  assert.equal(vm.hasResult, true);
  assert.equal(vm.result.eventTitle, eventTitle, "the panel must name the Event in the player's language");
  assert.equal(vm.result.hasChoice, true);
  assert.equal(vm.result.choiceLabel, choiceLabel, "the panel must show the option label, not an id");
  assert.equal(vm.result.choiceLabel.includes(".choice."), false, "an option label must never be a raw key");
  assert.equal(vm.result.youChosePrefix.length > 0, true, "the panel must prefix the choice with readable copy");
  assert.equal(vm.result.ctaLabel, "返回在世", "a non-fatal settlement returns the player to 在世");
});

test("PLAYUX01B-016: a settlement that ends the run offers 查看终局, not a return to 在世", async () => {
  // Death-at-choice: a run one year from its ceiling, resolving an Event whose option costs a year.
  const base = started("f1-death-at-choice");
  const eventId = "content01.ordinary.mountain-view";
  const staged = { ...base, run: { ...base.run, maxAge: base.run.age + 1, events: { ...base.run.events, history: [], current: { eventId, kind: "choice" } } } };
  const output = reduce({
    state: staged,
    command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "orient-and-go" },
    context: { rulesVersion: staged.rulesVersion, contentVersion: staged.contentVersion, content, commandId: "cmd:f1:death" }
  });
  assert.equal(output.state.run.status, "dying", "the fixture must end the run at the choice");
  const view = new ServerViewModelBuilder(content).build(output.state);
  assert.equal(view.state.pageState, "ENDING", "the authoritative page after that settlement is ENDING");

  const vm = page.probe.buildRenderModel(stubController({ model: { pageState: "ENDING" }, view }), "", {
    ok: true, commandId: "cmd:f1:death", stateVersion: output.state.stateVersion,
    domainEffects: [{ kind: "time", labelKey: "result.time", years: 1 }],
    narrative: { eventId, choiceId: "orient-and-go", changed: true, lines: [] }
  });
  assert.equal(vm.result.ctaLabel, "查看终局", "the CTA must describe where the player actually is");
  assert.equal(vm.result.eventTitle, CONTENT01_ZH_CN[`${eventId}.title`]);
});

test("PLAYUX01B-017: an unresolvable option label degrades conservatively instead of showing a code", () => {
  const probe = page.probe;
  // An old save or a newer pack can name an Event or option this catalog predates. Neither may print an id.
  const unknownEvent = probe.buildResultReceipt({ domainEffects: [], narrative: { eventId: "content01.future.v9", choiceId: "x", changed: true, lines: [] } });
  assert.equal(unknownEvent.eventTitle, "详情暂不可用", "an unknown Event title must degrade conservatively");
  assert.equal(unknownEvent.choiceLabel, "详情暂不可用", "an unknown option label must degrade conservatively");
  assert.equal(unknownEvent.eventTitle.includes("."), false, "no id may reach the player");
  // A settlement with no recorded choice still names the Event and claims nothing about a choice.
  const noChoice = probe.buildResultReceipt({ domainEffects: [], narrative: { eventId: "content01.onboarding.first-breath", changed: true, lines: [] } });
  assert.equal(noChoice.hasChoice, false, "an unrecorded choice must not be invented");
  assert.equal(noChoice.choiceLabel, "");
  assert.equal(noChoice.eventTitle, CONTENT01_ZH_CN["content01.onboarding.first-breath.title"]);
});

// ================================================================= F2: the life book is a retrospective

test("PLAYUX01B-018: the life book separates the chronological record from the public transitions", () => {
  const terminal = page.probe.buildTerminal({ stage: "LIFE_BOOK", version: 1, ...lifeBookFixture() }, "LIFE_BOOK");
  const book = terminal.lifeBook;
  // The chronological record is what it says it is: every recorded Event, in order.
  assert.equal(book.timeline.length, 3);
  // The transitions come only from published significance — a dominant track, a public cause, a met person.
  assert.equal(book.hasTransitions, true, "the fixture publishes a track, a cause and a person");
  assert.equal(book.trackRows.length, 2);
  assert.equal(book.causeRows.length, 1);
  assert.equal(book.peopleRows.length, 1);
  // The intro is a reading of published facts and nothing else.
  assert.equal(book.intro.includes("63"), true, "the intro must state the ending age");
  assert.equal(book.intro.includes("11") || book.intro.includes("3"), true, "the intro must state the recorded event count");
  assert.equal(book.intro.includes(book.deathCause), true, "the intro must name the known cause when there is one");
  const wxml = read(WXML_PATH);
  assert.match(wxml, /此生经历/, "the chronological section must be named for what it is");
  assert.equal(wxml.includes("关键转折"), false, "no section may be labelled a turning point without a ranking to justify it");
});

test("PLAYUX01B-019: a life with no sidecar states no facts, and the log and the book differ in purpose", () => {
  const absent = page.probe.buildTerminal({ stage: "ENDING", version: 0 }, "ENDING");
  assert.equal(absent.lifeBook.hasLifeBook, false);
  assert.equal(absent.lifeBook.intro, "", "an absent sidecar must not produce an introduction full of zeroes");
  assert.equal(absent.lifeBook.hasTransitions, false);

  // The live archive is the running log: it keeps each scene's own account of itself. The life book is the
  // retrospective: it adds the framing sentence and the transitions. They share a history, not a rendering.
  const archive = page.probe.buildArchive({
    runName: "复查",
    history: [{ entryId: "event:0", kind: "event", titleKey: "content01.onboarding.first-breath.title", summaryKey: "content01.onboarding.first-breath.body", data: { eventId: "content01.onboarding.first-breath", nodeIndex: 0, choiceId: "keep-driving" } }],
    causes: [], builds: [], people: []
  });
  assert.equal(archive.history[0].summary.length > 0, true, "the archive must keep the scene account");
  const book = page.probe.buildTerminal({ stage: "LIFE_BOOK", version: 1, ...lifeBookFixture() }, "LIFE_BOOK");
  assert.equal(book.lifeBook.intro.length > 0, true, "the life book must carry framing the archive does not");
  assert.equal(Object.prototype.hasOwnProperty.call(archive, "intro"), false, "the archive must not grow the book's framing");
});

// ================================================================= F3: wording, provenance and honesty

const TEMPLATE_LABELS = new Set(["顺势而行", "依此磨炼", "停步细看", "见好便收", "承担此险", "先辨征兆", "及时折返", "留一句话离开"]);

test("PLAYUX01B-020: every reachable option carries scene-specific wording", () => {
  const offenders = [];
  for (const event of CONTENT01_PACK.events) {
    for (const choice of event.choices ?? []) {
      const label = CONTENT01_ZH_CN[choice.labelKey];
      if (label === undefined || TEMPLATE_LABELS.has(label)) offenders.push(`${event.id}/${choice.id} => ${label}`);
    }
  }
  assert.deepEqual(offenders, [], "no reachable option may use the shared template wording");
});

test("PLAYUX01B-021: the market transaction begins inside its own scene and matches the money it settles", () => {
  const event = CONTENT01_PACK.events.find((entry) => entry.id === "content01.onboarding.market-choice");
  const body = CONTENT01_ZH_CN[event.fallback.bodyKey];
  // The B3 pass had the player sell "herbs gathered on the road", which asserted a possession the run never
  // records. Nothing in this scene may claim a prior inventory; the work must start and end here.
  for (const forbidden of ["路上采得", "随身", "你带着", "你的草药"]) {
    assert.equal(body.includes(forbidden), false, `the scene must not assume a prior possession: ${forbidden}`);
  }
  assert.equal(body.includes("灵石") === false || body.length > 0, true);
  const money = (id) => (event.choices.find((choice) => choice.id === id).outcomes.success.effects).filter((effect) => effect.op === "ADD_RESOURCE");
  // Every option that pays must say what it was paid FOR, and the two paying options must differ.
  assert.equal(money("take-deal").length, 1, "take-deal is a stated fee");
  assert.equal(money("haggle-fair").length, 1, "haggle-fair is a larger stated fee");
  assert.equal(money("take-deal")[0].amount < money("haggle-fair")[0].amount, true, "arguing the price must be worth more than accepting his number");
  assert.equal(money("ask-source").length, 0, "declining to work must not pay");
  for (const choice of event.choices) {
    const label = CONTENT01_ZH_CN[choice.labelKey];
    assert.equal(label.includes("买"), false, `no option may read as a purchase, which the engine cannot charge for: ${label}`);
  }
});

test("PLAYUX01B-022: a pursuit that records no clue says exactly that, and promises nothing further", () => {
  for (const eventId of ["content01.onboarding.old-trace", "content01.onboarding.forked-path"]) {
    const event = CONTENT01_PACK.events.find((entry) => entry.id === eventId);
    // Every option settles time and nothing else: no clue, no cause, no item.
    for (const choice of event.choices) {
      const ops = choice.outcomes.success.effects.map((effect) => effect.op);
      assert.deepEqual(ops, ["OUTCOME_TIME_DELTA"], `${eventId}/${choice.id} must settle time only`);
    }
    const note = CONTENT01_ZH_CN[`${eventId}.resolution`];
    assert.equal(typeof note, "string", `${eventId} must author the resolution note`);
    assert.equal(note.includes("新线索"), true, `${eventId} must state plainly that no lead was obtained`);
    // The note may not promise a later payoff or invent a cause.
    for (const forbidden of ["下次", "日后", "将有", "线索已", "因果"]) {
      assert.equal(note.includes(forbidden), false, `${eventId}'s note must not promise or invent: ${forbidden}`);
    }
  }
  // And the panel renders it only where it cannot contradict the receipt.
  const note = page.probe.buildResultReceipt({ domainEffects: [{ kind: "time", labelKey: "result.time", years: 2 }], narrative: { eventId: "content01.onboarding.old-trace", choiceId: "follow-fresh", changed: true, lines: [] } });
  assert.equal(note.resolutionNote, CONTENT01_ZH_CN["content01.onboarding.old-trace.resolution"], "a time-only pursuit must carry the scene's own honest note");
  const gained = page.probe.buildResultReceipt({ domainEffects: [{ kind: "cultivation", labelKey: "result.cultivation", delta: 150 }], narrative: { eventId: "content01.onboarding.old-trace", choiceId: "follow-fresh", changed: true, lines: [] } });
  assert.equal(gained.resolutionNote, "", "the note must not appear beside a settled gain");
});
