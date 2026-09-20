import assert from "node:assert/strict";
import test from "node:test";

import { ContentRegistry, sealContentPack, validateContentPack } from "../packages/content/src/index.ts";
import {
  ReducerError,
  createOfferedRun,
  eligibleEvents,
  evaluateCondition,
  outcomeTierForScore,
  reduce,
  resolveLogicalPath,
  resolveOutcome,
  scaleSignedByBps,
  validateGameState
} from "../packages/core/src/index.ts";

const fallback = { bodyKey: "dev.body" };
const success = (effects = []) => ({ effects });
function event(id, choices = [], extra = {}) {
  return { id, version: 1, kind: "choice", titleKey: `${id}.title`, tags: ["dev-fixture"], weight: 100, choices, fallback, ...extra };
}
function coreChoice(id, effects, extra = {}) {
  return { id, scope: "core", labelKey: `${id}.label`, outcomes: { success: success(effects) }, ...extra };
}
function draft(events, contentVersion = "event-content-1") {
  return {
    manifest: { schemaVersion: 2, packId: `pack-${contentVersion}`, rulesVersion: "2.0.0", contentVersion },
    references: { items: ["item.tea"], components: [], npcTemplates: [], regions: ["region.start", "region.next"], endings: ["ending.test"], causes: [], conditions: ["condition.test"] },
    destinies: [], events
  };
}
function registered(events) { const registry = new ContentRegistry(); registry.register(sealContentPack(draft(events))); return registry; }
function activeState(content, eventId = "event.start", overrides = {}) {
  const offered = createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "event-content-1", runId: "run-event", playerId: "player-1", rootSeed: "event-root",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: "offer-event", destinyIds: ["d1", "d2", "d3"], age: 20, maxAge: 100, runName: "Event Run",
      realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 20, body: 3, spiritSense: 2, fortune: 7 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"],
      world: { regionId: "region.start", knownRegionIds: ["region.start"], tags: [], factionStanding: {} }
    }
  });
  const started = reduce({ state: offered, command: { type: "START_RUN", offerId: "offer-event", destinyId: "d1" }, context: { rulesVersion: "2.0.0", contentVersion: "event-content-1", content } }).state;
  return validateGameState({
    ...started,
    run: { ...started.run, ...overrides, events: { history: overrides.events?.history ?? [], current: { eventId, kind: "choice" } } }
  });
}
function context(content) { return { rulesVersion: "2.0.0", contentVersion: "event-content-1", content }; }

test("signed secondary scaling follows deterministic BPS boundaries", () => {
  assert.equal(scaleSignedByBps(7, 5_000), 4);
  assert.equal(scaleSignedByBps(-7, 5_000), -4);
  assert.equal(scaleSignedByBps(0, 5_000), 0);
  assert.equal(scaleSignedByBps(7, 0), 0);
  assert.equal(scaleSignedByBps(-7, 10_000), -7);
});

test("event_golden: one logical Check request resolves tier and fallback deterministically", () => {
  const checked = {
    id: "checked", scope: "core", labelKey: "checked.label",
    check: { primary: "insight", secondary: "fortune", secondaryWeightBps: 5_000, difficulty: 20, randomMin: -10, randomMax: 10 },
    outcomes: {
      success: success([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 2 }]),
      costlySuccess: success([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]),
      failure: success([])
    }
  };
  const content = registered([event("event.start", [checked])]); const state = activeState(content);
  const output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: "event.start", optionId: "checked" }, context: context(content) });
  assert.equal(output.state.run.resources.spiritStone, 2);
  assert.equal(output.state.run.rng.streams.check.drawIndex - state.run.rng.streams.check.drawIndex, output.trace.rngDraws.length);
  assert.deepEqual(output.trace.rngDraws, [{ stream: "check", index: 0, u32: 985641864 }]);
  assert.deepEqual(output.trace.selector, [{ kind: "check", logicalRequests: 1, baseScore: 24, rngRoll: 8, finalScore: 32 }]);
  assert.deepEqual(output.narrativeFacts[0], { type: "EVENT_OUTCOME", eventId: "event.start", choiceId: "checked", requestedTier: "greatSuccess", appliedTier: "success" });
});

test("all four tiers and optional-tier fallback use no additional RNG", () => {
  assert.equal(outcomeTierForScore(20, 10), "greatSuccess");
  assert.equal(outcomeTierForScore(10, 10), "success");
  assert.equal(outcomeTierForScore(0, 10), "costlySuccess");
  assert.equal(outcomeTierForScore(-1, 10), "failure");
  const outcomes = { success: success([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]), costlySuccess: success([]) };
  assert.equal(resolveOutcome(outcomes, "greatSuccess").appliedTier, "success");
  assert.equal(resolveOutcome(outcomes, "costlySuccess").appliedTier, "costlySuccess");
  assert.equal(resolveOutcome(outcomes, "failure").appliedTier, "costlySuccess");
  assert.equal(resolveOutcome({ success: outcomes.success }, "failure").appliedTier, "success");
});

test("CNT-003: hard requirements and cooldown/maxOccurrences are enforceable", () => {
  const blocked = event("event.blocked", [], { requirements: { gte: ["run.age", 999] } });
  const cooled = event("event.cooled", [], { cooldown: { minNodesBetween: 1, maxOccurrences: 2 } });
  const content = registered([blocked, cooled]);
  const state = activeState(content, "event.blocked", { nodeIndex: 2, events: { history: [{ eventId: "event.cooled", nodeIndex: 1 }] } });
  assert.deepEqual(eligibleEvents([blocked, cooled], state), []);
  const later = validateGameState({ ...state, run: { ...state.run, nodeIndex: 3, events: state.run.events } });
  assert.deepEqual(eligibleEvents([blocked, cooled], later).map((value) => value.id), ["event.cooled"]);
  const exhausted = validateGameState({ ...later, run: { ...later.run, events: { ...later.run.events, history: [...later.run.events.history, { eventId: "event.cooled", nodeIndex: 0 }] } } });
  assert.deepEqual(eligibleEvents([cooled], exhausted), []);
});

test("CNT-004: EffectSpec rejects unknown ops, fields, and riskHint", () => {
  const unknown = draft([event("event.start", [coreChoice("bad", [{ op: "EXECUTE", code: "x" }])])]);
  assert.throws(() => validateContentPack(sealContentPack(unknown)), /unknown effect/);
  const extra = draft([event("event.start", [coreChoice("bad", [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1, hidden: true }])])]);
  assert.throws(() => validateContentPack(sealContentPack(extra)), /not allowed/);
  const risk = draft([{ ...event("event.start", [coreChoice("ok", [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }])]), riskHint: "danger" }]);
  assert.throws(() => validateContentPack(sealContentPack(risk)), /riskHint/);
});

test("CNT-005/CNT-007: core, rhythm-only, and tactical semantics stay separate", () => {
  const target = event("event.next");
  const validRhythm = { id: "rhythm", scope: "core", rhythmOnly: true, labelKey: "rhythm", outcomes: { success: success([]) }, next: [{ eventId: "event.next" }] };
  const validTactical = { id: "tactical", scope: "tactical", labelKey: "tactical", outcomes: { success: success([{ op: "setSessionFlag", key: "ready", value: true }]) } };
  assert.doesNotThrow(() => validateContentPack(sealContentPack(draft([event("event.start", [validRhythm, validTactical]), target]))));
  const emptyTactical = { id: "empty", scope: "tactical", labelKey: "empty", outcomes: { success: success([]) } };
  assert.throws(() => validateContentPack(sealContentPack(draft([event("event.start", [emptyTactical])]))), /meaningful/);
  const permanentTactical = { id: "bad", scope: "tactical", labelKey: "bad", outcomes: { success: success([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]) } };
  assert.throws(() => validateContentPack(sealContentPack(draft([event("event.start", [permanentTactical])]))), /session-local/);
  const selfRhythm = { ...validRhythm, next: [{ eventId: "event.start" }] };
  assert.throws(() => validateContentPack(sealContentPack(draft([event("event.start", [selfRhythm])]))), /different event/);
});

test("tactical session-local effects do not enter RuleState", () => {
  const tactical = { id: "tactical", scope: "tactical", labelKey: "tactical", outcomes: { success: success([{ op: "setSessionFlag", key: "ready", value: true }, { op: "adjustSessionCounter", key: "steps", delta: 2 }, { op: "addSessionTag", tag: "focused" }]) } };
  const content = registered([event("event.start", [tactical])]); const state = activeState(content);
  const output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: "event.start", optionId: "tactical" }, context: context(content) });
  const sessionEffect = output.effects.find((effect) => effect.type === "EVENT_SESSION");
  assert.deepEqual(sessionEffect.session, { flags: { ready: true }, counters: { steps: 2 }, tags: ["focused"] });
  assert.equal(JSON.stringify(output.state).includes("ready"), false);
  assert.equal(JSON.stringify(output.state).includes("focused"), false);
  assert.equal(output.trace.rngDraws.length, 0);
});

test("CMD-007: illegal event or option changes no state, RNG, or time", () => {
  const content = registered([event("event.start", [coreChoice("valid", [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }])])]); const state = activeState(content); const snapshot = structuredClone(state);
  for (const command of [
    { type: "CHOOSE_EVENT_OPTION", eventId: "wrong", optionId: "valid" },
    { type: "CHOOSE_EVENT_OPTION", eventId: "event.start", optionId: "missing" }
  ]) {
    assert.throws(() => reduce({ state, command, context: context(content) }), (error) => error instanceof ReducerError && error.code === "INVALID_OPTION");
    assert.deepEqual(state, snapshot);
  }
});

test("DSL_injection_fuzz: only logical paths and whitelist operators execute", () => {
  const content = registered([event("event.start")]); const state = activeState(content);
  assert.equal(resolveLogicalPath(state, "run.age"), 20);
  for (const path of ["run.rng", "run.rootSeed", "__proto__", "constructor.constructor"]) assert.throws(() => resolveLogicalPath(state, path));
  for (const expression of [
    { eval: ["run.age"] }, { Function: "return 1" }, { eq: ["run.rng", 1] }, { all: [{ unknown: true }] }, { gte: ["identity.tags", 0] }
  ]) assert.throws(() => evaluateCondition(expression, state));
});
