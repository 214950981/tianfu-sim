/**
 * PLAYFEEL01 — stage B targeted suite.
 *
 * WHY THIS FILE EXISTS
 *
 * The locked design (docs/PLAYFEEL01-PRODUCT-DESIGN.md) is a set of PLAYER-VISIBLE claims: the home screen
 * must say what the player is working toward, a settled choice must say what actually happened, the life
 * book must not pass the opening text off as an outcome, and an early death must not read as 寿元已尽.
 * None of those can be proven by grepping the page source, so every case here either
 *   (a) drives the real CommandGateway over a real content01 run and feeds the receipt it returns into the
 *       page's own render model, or
 *   (b) calls the page's own projection functions and asserts on what they return.
 * The only structural assertions are the two the design states literally: that the technical 节点 label and
 * the repeated 就此抉择 button are gone.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No aggregate npm test, no 600-run, no cloud call, no typecheck. The 46 events outside the locked
 * twenty are asserted to be UNCHANGED, which is the scope guard for the whole task.
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
import { reduce } from "../packages/core/src/index.ts";
import { CommandGateway, InMemoryGatewayStore, ServerViewModelBuilder, generateServerDestinyOffer } from "../server/src/index.ts";

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const PAGE_PATH = "miniprogram/pages/v2-live/v2-live.js";
const WXML_PATH = "miniprogram/pages/v2-live/v2-live.wxml";
const CATALOG_PATH = "miniprogram/pages/v2-live/content01-zh-cn.js";

const ACTIONS = ["cultivate", "travel", "worldly", "pursuit"];

const content = (() => {
  const registry = new ContentRegistry();
  registry.registerNpcPack(NPC_CONTENT01_V1);
  registry.register(CONTENT01_PACK);
  return registry;
})();

/**
 * A run started the way the real client starts one: a server-generated destiny offer, then START_RUN with
 * the chosen profile's `selectionId`.
 *
 * WHY NOT `createOfferedRun` + a destinyId: that path leaves `identity.innateProfile` undefined, and the
 * projection deliberately publishes no breakthrough action for a run with no innate profile — so a test
 * built on it would prove the home screen was right to say "此境已无常规前路" on a mortal run, which is
 * precisely the defect the brief records.
 */
function started(seed) {
  const generated = generateServerDestinyOffer({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:playfeel01:${seed}`,
    playerId: "player:playfeel01",
    rootSeed: `root:playfeel01:${seed}`,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    content,
    fixture: {
      offerId: `offer:playfeel01:${seed}`,
      age: 20,
      maxAge: 200,
      runName: "试锋",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: [...ACTIONS],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  });
  const offered = generated.state ?? generated;
  const profiles = offered.run.offer.innateProfiles ?? [];
  assert.notEqual(profiles.length, 0, "the server offer must publish innate profiles");
  return reduce({
    state: offered,
    command: { type: "START_RUN", offerId: offered.run.offer.offerId, selectionId: profiles[0].selectionId },
    context: { rulesVersion: offered.rulesVersion, contentVersion: offered.contentVersion, content, commandId: `cmd:${seed}:start` }
  }).state;
}

/** Walks the real Director until `eventId` is the current Event, so every case follows a reachable path. */
function reachEvent(eventId, seed, limit = 80) {
  let state = started(seed);
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
    `${source}\n;this.__probe = { buildRenderModel: buildRenderModel, buildResultReceipt: buildResultReceipt, buildTerminal: buildTerminal };`,
    sandbox,
    { filename: PAGE_PATH }
  );
  assert.notEqual(pageConfig, null, "the page module must call Page({...})");
  return { probe: sandbox.__probe, page: pageConfig };
}

const page = loadPage();

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
      publicRun: { runName: "试锋", age: 20, maxAge: 200, realm: { id: "mortal", order: 0, cultivationBps: 0 }, resources: { spiritStone: 0 } }
    }
  };
  return {
    pageModel: () => model,
    view: () => view,
    submission: () => ({ interactionState: "idle", mutuallyExclusiveLocked: false, requiresReconfirmation: false })
  };
}

/** The event ids the locked brief names, in the order it lists them. */
const BRIEFED = [
  "content01.onboarding.first-breath", "content01.onboarding.quiet-retreat", "content01.onboarding.market-choice",
  "content01.onboarding.old-trace", "content01.onboarding.mountain-road", "content01.onboarding.roadside-injury",
  "content01.onboarding.forked-path",
  "content01.ordinary.old-song", "content01.ordinary.empty-search", "content01.ordinary.market-bargain",
  "content01.ordinary.mountain-view", "content01.ordinary.tea-house",
  "content01.pei.broken-blade", "content01.xie.secret-map", "content01.xu.mortal-letter", "content01.jiang.herb-price",
  "content01.build.sword.river-cut", "content01.build.alchemy.herb-sort",
  "content01.risk.ruin-depth", "content01.risk.pine-ambush"
];

const SETTLE_KEYS = Object.keys(CONTENT01_ZH_CN).filter((key) => key.includes(".settle."));
const SETTLED_EVENTS = new Set(SETTLE_KEYS.map((key) => key.split(".settle.")[0]));

// ------------------------------------------------------------------ B2: the settled result says what happened

test("PF01-001: a real settlement narrates the taken option, and the narration is not the opening body", async () => {
  const { state, reached } = reachEvent("content01.onboarding.first-breath", "pf01-settle");
  assert.equal(reached, true, "the Director must be able to draw the cultivate opening");
  const eventId = state.run.events.current.eventId;
  const optionId = "keep-driving";

  const store = new InMemoryGatewayStore();
  store.seedRun(state);
  const gateway = new CommandGateway({
    store,
    content,
    projectView: (current) => new ServerViewModelBuilder(content).build(current)
  });
  const result = await gateway.sendCommand({ playerId: state.run.playerId }, {
    commandId: "cmd:pf01:settle",
    playerId: state.run.playerId,
    runId: state.run.runId,
    expectedStateVersion: state.stateVersion,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    clientPlatform: "dev",
    clientBuild: "playfeel01",
    command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId }
  });
  assert.equal(result.ok, true, "the settlement must succeed");

  const vm = page.probe.buildRenderModel(stubController(), "", result);
  assert.equal(vm.result.hasNarration, true, "a briefed scene must narrate the option that settled");
  assert.equal(vm.result.narration, CONTENT01_ZH_CN[`${eventId}.settle.${optionId}`], "the narration must be the scene's authored settlement");
  assert.notEqual(vm.result.narration, CONTENT01_ZH_CN[`${eventId}.body`], "the narration must not repeat the scene's opening body");
  // The brief bans sentences that would be equally true of every scene.
  assert.equal(/冥冥|日后自见分晓|留下形状/.test(vm.result.narration), false, "the narration must be specific to this scene");
});

test("PF01-002: a tiered risk scene narrates each outcome tier differently, and falls back to the option sentence", () => {
  const eventId = "content01.risk.pine-ambush";
  const receipt = (tier) => ({ domainEffects: [], narrative: { changed: true, eventId, choiceId: "take-risk", ...(tier === undefined ? {} : { appliedTier: tier }) } });

  const success = page.probe.buildResultReceipt(receipt("success"));
  const costly = page.probe.buildResultReceipt(receipt("costlySuccess"));
  const failed = page.probe.buildResultReceipt(receipt("failure"));

  assert.equal(success.narration, CONTENT01_ZH_CN[`${eventId}.settle.take-risk.success`]);
  assert.equal(costly.narration, CONTENT01_ZH_CN[`${eventId}.settle.take-risk.costlySuccess`]);
  assert.notEqual(success.narration, costly.narration, "a clean success and a costly success must not read the same");
  assert.equal(failed.hasNarration, true, "a failure must still say what happened");

  // `read-signs` authors only a success sentence. A failure tier must say nothing rather than borrow the
  // sentence written for a different outcome, and a scene whose tiers are all authored never needs this.
  const silent = page.probe.buildResultReceipt({ domainEffects: [], narrative: { changed: true, eventId, choiceId: "read-signs", appliedTier: "failure" } });
  assert.equal(silent.hasNarration, false, "an unauthored tier must not borrow another tier's sentence");
  assert.equal(silent.narration, "");

  // The fallback in the other direction: an option-level sentence exists but no tier-specific one does, so
  // the tier the server reports must still resolve to the option's own account.
  const fallback = page.probe.buildResultReceipt({ domainEffects: [], narrative: { changed: true, eventId: "content01.onboarding.first-breath", choiceId: "keep-driving", appliedTier: "success" } });
  assert.equal(fallback.narration, CONTENT01_ZH_CN["content01.onboarding.first-breath.settle.keep-driving"], "an unauthored tier falls back to the option-level sentence");
});

test("PF01-003: a scene outside the locked twenty narrates nothing rather than improvising", () => {
  const eventId = "content01.ordinary.night-rain";
  assert.equal(SETTLED_EVENTS.has(eventId), false, "this scene must be outside the authored set for this case to mean anything");
  const built = page.probe.buildResultReceipt({ domainEffects: [], narrative: { changed: true, eventId, choiceId: "listen" } });
  assert.equal(built.hasNarration, false, "no authored settlement means no narration, never a generic one");
  assert.equal(built.narration, "", "the narration field must be empty rather than a raw key");
});

test("PF01-004: the life book records what each recorded choice settled, and never repeats the opening as the outcome", () => {
  const events = [
    { entryId: "event:0", eventId: "content01.onboarding.first-breath", nodeIndex: 1, choiceId: "keep-driving", resultTier: "success" },
    { entryId: "event:1", eventId: "content01.onboarding.quiet-retreat", nodeIndex: 4, choiceId: "sit-again" },
    { entryId: "event:2", eventId: "content01.ordinary.night-rain", nodeIndex: 9 }
  ];
  const terminal = page.probe.buildTerminal({
    stage: "LIFE_BOOK",
    version: 1,
    lifeBook: { runName: "试锋", age: 62, maxAge: 100, realm: { id: "mortal", order: 0 }, events, people: [], builds: [], causes: [] }
  }, "LIFE_BOOK");

  const rows = terminal.lifeBook.timeline;
  assert.equal(rows.length, 3, "every recorded entry must appear");
  assert.equal(rows[0].settledText, CONTENT01_ZH_CN["content01.onboarding.first-breath.settle.keep-driving"]);
  assert.equal(rows[0].hasSettled, true);
  assert.equal(rows[1].settledText, CONTENT01_ZH_CN["content01.onboarding.quiet-retreat.settle.sit-again"], "a save with no resultTier still gets the option sentence");
  assert.equal(rows[2].hasSettled, false, "an entry with no recorded choice must not claim an outcome");
  for (const row of rows) assert.notEqual(row.settledText, row.body, "the settled text must never be the opening body");
});

// ------------------------------------------------------------------ B1: the home screen says what the player is working toward

test("PF01-005: the home screen names the run's own spiritual root and states an honest cultivation goal", () => {
  const state = started("pf01-home");
  const view = new ServerViewModelBuilder(content).build(state);
  const vm = page.probe.buildRenderModel(stubController({ model: { pageState: "RUN_HOME" }, view }), "", null);

  const identity = view.state.publicRun.identity;
  const profile = identity.innateProfile;
  if (profile?.spiritualRootName !== undefined) {
    assert.equal(vm.rootName, profile.spiritualRootName, "the root must be the server-resolved display name");
    assert.notEqual(vm.rootName, profile.spiritualRoot, "the root must never render as its internal id");
  } else {
    assert.equal(vm.rootName, "灵根未详", "an older save without a name must fall back, never print an id");
  }
  const cultivation = view.state.publicRun.realm.cultivationBps ?? 0;
  assert.equal(vm.cultivationGap, 10000 - cultivation, "the gap must be the pack's own 10000 threshold minus what the run has");
  assert.equal(vm.goalLine, `距圆满尚差 ${vm.cultivationGap} 修为`, "the goal line must state the shortfall, not a promise");
  assert.equal(/成功|几率|概率|[0-9]+%/.test(vm.goalLine), false, "the goal line must never state or imply a success chance");
});

test("PF01-006: a blocked breakthrough explains itself with the server's own reason, never a raw enum", () => {
  const view = {
    state: {
      publicRun: {
        runName: "试锋", age: 20, maxAge: 200, realm: { id: "mortal", order: 0, cultivationBps: 0 }, resources: { spiritStone: 0 },
        specialActions: [{ actionId: "attemptBreakthrough", kind: "breakthrough", available: false, labelKey: "special.attemptBreakthrough", blockedReasonKey: "breakthrough.cultivation_incomplete", targetRealm: { id: "qi-refining", displayName: "炼气" } }]
      }
    }
  };
  const model = { pageState: "RUN_HOME", coreIntents: [], specialIntents: [{ intentId: "special.attemptBreakthrough", labelKey: "special.attemptBreakthrough", enabled: false }] };
  const vm = page.probe.buildRenderModel(stubController({ model, view }), "", null);

  assert.equal(vm.breakthroughAvailable, false);
  assert.equal(vm.breakthroughReason, "修为未满，尚不足以冲击", "the disabled button must carry the server's reason in Chinese");
  assert.equal(vm.specialActions[0].reason, "修为未满，尚不足以冲击");

  const unknown = page.probe.buildRenderModel(stubController({
    model,
    view: { state: { publicRun: { ...view.state.publicRun, specialActions: [{ actionId: "attemptBreakthrough", available: false, blockedReasonKey: "some.future.reason", targetRealm: { id: "qi-refining", displayName: "炼气" } }] } } }
  }), "", null);
  assert.equal(unknown.breakthroughReason, "暂不可行", "an unknown reason key must degrade, never print the key");
});

// ------------------------------------------------------------------ B4: death, and the technical labels

test("PF01-007: an early death says the unspent years; only a lifespan death says 寿元已尽", () => {
  const build = (death) => page.probe.buildTerminal({
    stage: "ENDING", version: 1,
    lifeBook: { runName: "试锋", age: death.age, maxAge: 100, realm: { id: "mortal", order: 0 }, events: [], people: [], builds: [], causes: [],
      ending: { endingId: "ending.mortal-end" },
      death }
  }, "ENDING").lifeBook;

  const early = build({ deathCauseId: "threat.dangerous-exploration", age: 62, realmId: "mortal", directCause: "death.death.exploration", category: "exploration" });
  assert.equal(early.deathDetail, "尚余 38 年寿元，因殁于探索提前终结。", "62 of 100 must read as cut short with the years named");
  assert.equal(/寿元已尽/.test(early.deathDetail), false, "an early death must not be reported as running out of life");

  const old = build({ deathCauseId: "lifespan", age: 100, realmId: "mortal", directCause: "death.death.lifespan", category: "lifespan" });
  assert.equal(old.deathDetail, "寿元已尽，终于 100 岁。");

  const unknown = build({ deathCauseId: "x", age: 62, realmId: "mortal", directCause: "some.unmapped.source", category: "exploration" });
  assert.equal(unknown.deathDetail, "尚余 38 年寿元，因已记录的风险提前终结。", "an unmapped cause must still be honest, not the old blanket 原因尚未明确");
});

test("PF01-008: the template drops the technical node label and the repeated decision button", () => {
  // Comments are stripped first: the route and closure audits read JavaScript comments as code, and a
  // comment quoting the forbidden phrase verbatim would otherwise count as a rendered occurrence.
  const wxml = read(WXML_PATH).replace(/<!--[\s\S]*?-->/g, "");
  assert.equal(/第\s*\{\{item\.order\}\}\s*节点/.test(wxml), false, "第 N 节点 is a development field and the brief bans it");
  assert.equal(/就此抉择/.test(wxml), false, "three identical 就此抉择 buttons are explicitly forbidden");
  assert.match(wxml, /class="card option-card"[^>]*data-option-id="\{\{item\.optionId\}\}"[^>]*bindtap="onOption"/, "the option itself must be the tap target");
  assert.match(wxml, /class="result-narration"/, "the result panel must render the settlement narration");
  assert.match(wxml, /class="archive-settled"/, "the life book must render the settled line");
});

// ------------------------------------------------------------------ B3: exactly the twenty, and their tiers differ

test("PF01-009: every legal option of the twenty briefed scenes has an authored settlement, and the other 46 have none", () => {
  const byId = new Map(CONTENT01_PACK.events.map((event) => [event.id, event]));
  for (const eventId of BRIEFED) {
    const event = byId.get(eventId);
    assert.notEqual(event, undefined, `${eventId} must still exist in the pack`);
    for (const choice of event.choices ?? []) {
      const authored = SETTLE_KEYS.some((key) => key === `${eventId}.settle.${choice.id}` || key.startsWith(`${eventId}.settle.${choice.id}.`));
      assert.equal(authored, true, `${eventId}:${choice.id} must have an authored settlement`);
    }
  }
  const outside = [...SETTLED_EVENTS].filter((id) => !BRIEFED.includes(id));
  assert.deepEqual(outside, [], "no scene outside the locked twenty may gain settlement copy");
  assert.equal(SETTLED_EVENTS.size, 20, "exactly the twenty briefed scenes are authored");
});

test("PF01-010: the two risk scenes settle their tiers differently, and a failure pays no reward", () => {
  const byId = new Map(CONTENT01_PACK.events.map((event) => [event.id, event]));
  for (const eventId of ["content01.risk.pine-ambush", "content01.risk.ruin-depth"]) {
    const event = byId.get(eventId);
    const risk = (event.choices ?? []).find((choice) => choice.id === "take-risk");
    const outcomes = risk.outcomes ?? {};
    const money = (tier) => (outcomes[tier]?.effects ?? []).filter((effect) => effect.op === "ADD_RESOURCE").reduce((sum, effect) => sum + effect.amount, 0);
    assert.equal(money("success") > money("costlySuccess"), true, `${eventId}: a costly success must pay less than a clean one`);
    assert.equal(money("failure"), 0, `${eventId}: a failure must not hand out a reward`);
    for (const tier of ["success", "costlySuccess", "failure"]) {
      assert.equal(SETTLE_KEYS.includes(`${eventId}.settle.take-risk.${tier}`), true, `${eventId}: ${tier} must have its own sentence`);
    }
  }
});

test("PF01-011: the client catalog carries every settlement key the pack authors", () => {
  // The generated module is an array of [key, copy] pairs, not an object: the WeChat runtime package must
  // stay closed and data-only, and a pair list is what the page merges into CONTENT_COPY at load.
  const pairs = (() => {
    const sandbox = { module: { exports: {} } };
    vm.runInNewContext(read(CATALOG_PATH), sandbox, { filename: CATALOG_PATH });
    return sandbox.module.exports;
  })();
  assert.equal(Array.isArray(pairs), true, "the generated catalog must be a pair list");
  const generated = Object.fromEntries(pairs);
  const missing = SETTLE_KEYS.filter((key) => generated[key] === undefined);
  assert.deepEqual(missing, [], "a settlement the pack authors must reach the client catalog");
  for (const key of SETTLE_KEYS) assert.equal(generated[key], CONTENT01_ZH_CN[key], `${key} must be byte-identical to the source copy`);
});
