import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry, sealContentPack, validateContentPack } from "../packages/content/src/index.ts";
import { advanceCauses, createOfferedRun, defaultEchoBudget, reduce, selectCauseEcho, validateGameState } from "../packages/core/src/index.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));

function registryFor(pack = fixture) { const registry = new ContentRegistry(); registry.register(pack); return registry; }
function offered(contentVersion = "dev-0.1.0") {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: "run-cause", playerId: "player-cause", rootSeed: "cause-root",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: "offer-cause", destinyIds: ["d1", "d2", "d3"], age: 20, maxAge: 100, runName: "Cause Run",
      realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  });
}
function active(content, contentVersion = "dev-0.1.0") {
  const started = reduce({ state: offered(contentVersion), command: { type: "START_RUN", offerId: "offer-cause", destinyId: "d1" }, context: { rulesVersion: "2.0.0", contentVersion, content, commandId: "cmd:start" } }).state;
  return validateGameState({ ...started, run: { ...started.run, events: { history: [], current: { eventId: "dev.first-choice", kind: "choice" } } } });
}
function rescueContext(content, extra = {}) { return { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:rescue", actorBindings: { eventTarget: "npc:test:rescued-001" }, ...extra }; }
const rescueCommand = { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "rescue-stranger" };

test("CAUSE-001/002/006 and GS-002: real Cause reaches first echo with deterministic provenance and binding", () => {
  const content = registryFor(); const state = active(content);
  const first = reduce({ state, command: rescueCommand, context: rescueContext(content) });
  const replay = reduce({ state, command: rescueCommand, context: rescueContext(content) });
  assert.deepEqual(first, replay);
  const causes = Object.values(first.state.run.causes.byId); assert.equal(causes.length, 1);
  assert.equal(causes[0].originCommandId, "cmd:rescue");
  assert.equal(causes[0].actorIdsByRole.rescuedNpc, "npc:test:rescued-001");
  assert.equal(causes[0].state, "echoed"); assert.equal(causes[0].echoBudget, 0); assert.equal(causes[0].echoCount, 1);
  assert.match(first.state.run.events.current.eventId, /^dev\.rescue-echo-[ab]$/);
  assert.equal(first.trace.selector.at(-1).tier, "P3"); assert.equal(first.trace.selector.at(-1).logicalRequests, 1);
  assert.equal(first.trace.rngDraws.every((draw) => draw.stream === "event"), true);
});

test("CAUSE-003: salience budget map and zero budget are deterministic", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(defaultEchoBudget), [0, 1, 1, 2, 3]);
  const content = registryFor(); const state = active(content);
  const dormant = validateGameState({ ...state, run: { ...state.run, causes: { byId: {} } } });
  assert.deepEqual(selectCauseEcho(dormant, content, "dev-0.1.0"), { state: dormant, rngDraws: [], trace: [] });
});

test("CAUSE-004: missing required binding fails atomically before RNG/time", () => {
  const content = registryFor(); const state = active(content); const snapshot = structuredClone(state);
  assert.throws(() => reduce({ state, command: rescueCommand, context: { ...rescueContext(content), actorBindings: {} } }), /cause\.invalid/);
  assert.deepEqual(state, snapshot);
});

test("CAUSE-005: unknown actor status stays live; explicit unavailable expires", () => {
  const content = registryFor(); const state = active(content);
  const unknown = reduce({ state, command: rescueCommand, context: rescueContext(content, { actorStatusById: {} }) });
  assert.equal(Object.values(unknown.state.run.causes.byId)[0].state, "echoed");
  const unavailable = reduce({ state, command: rescueCommand, context: rescueContext(content, { actorStatusById: { "npc:test:rescued-001": "unavailable" } }) });
  const cause = Object.values(unavailable.state.run.causes.byId)[0]; assert.equal(cause.state, "expired"); assert.equal(unavailable.state.run.events.current, undefined);
  assert.equal(unavailable.trace.rngDraws.length, 0);
});

function transformDraft(invalidTarget = false) {
  const echo = { id: "echo.one", version: 1, kind: "narrative", titleKey: "echo", tags: [], weight: 1, fallback: { bodyKey: "echo" } };
  const start = { id: "dev.first-choice", version: 1, kind: "choice", titleKey: "start", tags: [], weight: 1, choices: [{ id: "rescue-stranger", scope: "core", labelKey: "rescue", outcomes: { success: { effects: [{ op: "ADD_CAUSE", templateId: "cause.source", salience: 4, actorBindingKeys: { rescuedNpc: "eventTarget" } }] } } }], fallback: { bodyKey: "start" } };
  return {
    manifest: { schemaVersion: 2, packId: "cause-transform", rulesVersion: "2.0.0", contentVersion: "cause-transform-1" },
    references: { items: [], components: [], npcTemplates: [], regions: ["dev.start"], endings: [], causes: ["cause.source", "cause.target"], conditions: [] }, destinies: [], events: [start, echo],
    causeTemplates: [
      { id: "cause.source", salience: 4, maturity: {}, actors: [{ role: "rescuedNpc", required: !invalidTarget }], themes: [], linkedEventIds: ["echo.one"], onActorUnavailable: { action: "transform", targetCauseTemplateId: "cause.target" } },
      { id: "cause.target", salience: 2, maturity: { minNodeDelta: 99 }, actors: [{ role: "rescuedNpc", required: true }], themes: [], linkedEventIds: ["echo.one"], onActorUnavailable: { action: "expire" } }
    ]
  };
}

test("CAUSE-007/008: transform resolves old Cause and inherits only same-role actor binding", () => {
  const draft = transformDraft(); const content = registryFor(sealContentPack(draft)); const state = active(content, "cause-transform-1");
  const output = reduce({ state, command: rescueCommand, context: { rulesVersion: "2.0.0", contentVersion: "cause-transform-1", content, commandId: "cmd:transform", actorBindings: { eventTarget: "npc:test:rescued-001", unused: "npc:test:unused" }, actorStatusById: { "npc:test:rescued-001": "unavailable" } } });
  const causes = Object.values(output.state.run.causes.byId); assert.equal(causes.length, 2);
  const oldCause = causes.find((cause) => cause.templateId === "cause.source"); const replacement = causes.find((cause) => cause.templateId === "cause.target");
  assert.equal(oldCause.state, "resolved"); assert.notEqual(oldCause.causeId, replacement.causeId);
  assert.deepEqual(replacement.actorIdsByRole, { rescuedNpc: "npc:test:rescued-001" }); assert.equal(replacement.originCommandId, "cmd:transform");
  assert.equal(Object.values(replacement.actorIdsByRole).includes("npc:test:unused"), false);
});

test("content lint rejects transform that cannot satisfy target required role", () => {
  assert.throws(() => validateContentPack(sealContentPack(transformDraft(true))), /transform cannot bind required target role/);
});
