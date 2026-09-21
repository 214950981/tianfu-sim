import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry, NPC_V1, sealContentPack, validateContentPack } from "../packages/content/src/index.ts";
import { createCommandLog, createOfferedRun, createSnapshot, eligibleEvents, executeLoggedCommand, instantiateCoreNpc, isEventEligible, recordEventOccurrence, reduce, replayCommandLog, ruleStateHash, selectDirectorEvent, validateGameState, validateSnapshot } from "../packages/core/src/index.ts";
import { CommandGateway, InMemoryGatewayStore, ServerViewModelBuilder } from "../server/src/index.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
function reseal(source, contentVersion) { const copy = structuredClone(source); const { checksum: _checksum, ...manifest } = copy.manifest; return sealContentPack({ ...copy, manifest: { ...manifest, contentVersion } }); }
function registry(pack = fixture) { const content = new ContentRegistry(); content.register(pack); return content; }
function offered(contentVersion = "dev-0.1.0", seed = "recurrence-seed", firstRun = false) {
  return createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: `run:${contentVersion}:${seed}`, playerId: "player:recurrence", rootSeed: seed, metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: `offer:${contentVersion}:${seed}`, destinyIds: ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"], age: 20, maxAge: 200, runName: "Recurrence", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 20, body: 20, spiritSense: 20, fortune: 20 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }, firstRun } });
}
function active(content = registry(), contentVersion = "dev-0.1.0", seed = "recurrence-seed", firstRun = false) { const state = offered(contentVersion, seed, firstRun); return reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "destiny.steady-foundation" }, context: { rulesVersion: state.rulesVersion, contentVersion, content, commandId: `cmd:${seed}:start` } }).state; }
function occurrenceState(state, eventId, occurrenceCount, lastOccurrenceNodeIndex, nodeIndex = state.run.nodeIndex) { return validateGameState({ ...state, run: { ...state.run, nodeIndex, events: { ...state.run.events, occurrences: { ...(state.run.events.occurrences ?? {}), [eventId]: { occurrenceCount, lastOccurrenceNodeIndex } } } } }); }
function recurringPack(effect, suffix, choiceExtra = {}, cooldown = { maxOccurrences: 2 }) {
  const source = structuredClone(fixture); const target = source.events.find((event) => event.id === "dev.first-choice"); target.cooldown = cooldown;
  target.choices = [{ id: "repeat", scope: "core", labelKey: "repeat", ...choiceExtra, outcomes: { success: { effects: effect === undefined ? [] : [effect] } } }];
  return reseal(source, `recurrence-${suffix}`);
}
function assertRegisters(pack) { assert.doesNotThrow(() => registry(pack)); }
function assertRejected(pack, pattern = /repeat/) { assert.throws(() => registry(pack), pattern); }

test("LOOPFIX02A-001: Event without recurrence preserves legacy eligibility", () => {
  const content = registry(); const state = active(content); const event = content.getEvent(state.contentVersion, "dev.first-choice");
  assert.equal(isEventEligible(event, state), true); assert.equal(state.run.events.occurrences?.[event.id], undefined);
});

test("LOOPFIX02A-002: maxOccurrences supports one and greater-than-one limits with O(1) state", () => {
  const state = active(); const once = { id: "once", cooldown: { maxOccurrences: 1 } }; const twice = { id: "twice", cooldown: { maxOccurrences: 2 } };
  assert.equal(isEventEligible(once, state), true); assert.equal(isEventEligible(once, occurrenceState(state, "once", 1, 0)), false);
  assert.equal(isEventEligible(twice, occurrenceState(state, "twice", 1, 0)), true); assert.equal(isEventEligible(twice, occurrenceState(state, "twice", 2, 0)), false);
});

test("LOOPFIX02A-003: cooldown zero and positive values expire on the exact boundary", () => {
  const state = occurrenceState(active(), "cooled", 1, 2, 2); const zero = { id: "cooled", cooldown: { minNodesBetween: 0 } }; const two = { id: "cooled", cooldown: { minNodesBetween: 2 } };
  assert.equal(isEventEligible(zero, state), false); assert.equal(isEventEligible(zero, { ...state, run: { ...state.run, nodeIndex: 3 } }), true);
  assert.equal(isEventEligible(two, { ...state, run: { ...state.run, nodeIndex: 4 } }), false); assert.equal(isEventEligible(two, { ...state, run: { ...state.run, nodeIndex: 5 } }), true);
});

test("LOOPFIX02A-004: candidate inspection is read-only and confirmed selection records exactly once", () => {
  const content = registry(); const state = active(content); const inspected = selectDirectorEvent(state, "travel", content, ["P5", "P6"]);
  assert.deepEqual(inspected.state.run.events.occurrences, state.run.events.occurrences);
  const first = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: "cmd:select" } });
  const eventId = first.state.run.events.current.eventId; assert.deepEqual(first.state.run.events.occurrences[eventId], { occurrenceCount: 1, lastOccurrenceNodeIndex: first.state.run.nodeIndex });
  const retry = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: "cmd:select" } });
  assert.deepEqual(retry.state.run.events.occurrences, first.state.run.events.occurrences); assert.equal(ruleStateHash(retry.state), ruleStateHash(first.state)); assert.deepEqual(retry.state.run.rng, first.state.run.rng);
});

test("LOOPFIX02A-005: ViewModel reads do not change occurrence state", () => {
  const content = registry(); const state = reduce({ state: active(content), command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:view" } }).state;
  const before = structuredClone(state.run.events.occurrences); new ServerViewModelBuilder(content).build(state); assert.deepEqual(state.run.events.occurrences, before);
});

test("LOOPFIX02A-006: Snapshot, replay, hash and RNG preserve occurrence state", () => {
  const content = registry(); const initial = active(content); const envelope = { commandId: "cmd:logged", playerId: initial.run.playerId, runId: initial.run.runId, expectedStateVersion: initial.stateVersion, rulesVersion: initial.rulesVersion, contentVersion: initial.contentVersion, clientPlatform: "dev", clientBuild: "recurrence", command: { type: "CHOOSE_ACTION", actionId: "travel" } };
  const executed = executeLoggedCommand(initial, createCommandLog(initial), envelope, {}, content); const snapshot = validateSnapshot(JSON.parse(JSON.stringify(createSnapshot(executed.output.state, 1)))); const replayed = replayCommandLog({ initialState: initial, commandLog: executed.commandLog, content });
  assert.deepEqual(snapshot.state.run.events.occurrences, executed.output.state.run.events.occurrences); assert.deepEqual(replayed.state.run.events.occurrences, executed.output.state.run.events.occurrences); assert.equal(replayed.finalRuleStateHash, ruleStateHash(executed.output.state)); assert.deepEqual(replayed.state.run.rng, executed.output.state.run.rng);
});

test("LOOPFIX02A-007: Gateway same-command retry does not duplicate occurrence", async () => {
  const content = registry(); const state = active(content); const store = new InMemoryGatewayStore(); store.seedRun(state); const gateway = new CommandGateway({ store, content });
  const envelope = { commandId: "cmd:gateway-recur", playerId: state.run.playerId, runId: state.run.runId, expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, clientPlatform: "dev", clientBuild: "recurrence", command: { type: "CHOOSE_ACTION", actionId: "travel" } };
  const first = await gateway.sendCommand({ playerId: state.run.playerId }, envelope); const duplicate = await gateway.sendCommand({ playerId: state.run.playerId }, envelope); const stored = store.readRun(state.run.runId).state;
  assert.deepEqual(duplicate, first); assert.equal(Object.values(stored.run.events.occurrences).reduce((sum, value) => sum + value.occurrenceCount, 0), 1);
});

test("LOOPFIX02A-008: recurrence eligibility gates P4, P5 and P6 without changing precedence", () => {
  const source = structuredClone(fixture); const first = source.events.find((event) => event.id === "dev.first-choice"); const ordinary = source.events.find((event) => event.id === "dev.ordinary-fallback"); first.cooldown = { maxOccurrences: 1 }; ordinary.cooldown = { maxOccurrences: 1 };
  const p4 = structuredClone(ordinary); p4.id = "dev.core-repeat"; p4.directorHints.npcRoleAffinityTags = ["mentor"]; source.events.push(p4); const pack = reseal(source, "recurrence-slots"); const content = registry(pack); let state = active(content, pack.manifest.contentVersion); state = instantiateCoreNpc(state, NPC_V1, "dev.mysterious-mentor", "intro").state;
  const p4Blocked = occurrenceState(state, p4.id, 1, 0); assert.equal(selectDirectorEvent(p4Blocked, "travel", content, ["P4"]).state.run.events.current, undefined);
  const p5Blocked = occurrenceState(state, first.id, 1, 0); assert.equal(selectDirectorEvent(p5Blocked, "travel", content, ["P5"]).state.run.events.current, undefined);
  const p6Blocked = occurrenceState(occurrenceState(state, ordinary.id, 1, 0), p4.id, 1, 0); assert.equal(selectDirectorEvent(p6Blocked, "travel", content, ["P6"]).state.run.events.current, undefined);
  const precedence = selectDirectorEvent(state, "travel", content, ["P4", "P5", "P6"]); assert.equal(precedence.trace.selectedPrecedenceLevel, "P4");
});

test("LOOPFIX02A-009: invalid and unknown recurrence fields are rejected", () => {
  for (const cooldown of [{ maxOccurrences: 0 }, { maxOccurrences: 1.5 }, { cooldownNodes: 1 }, { minNodesBetween: -1 }, { minNodesBetween: Number.MAX_SAFE_INTEGER + 1 }]) {
    const source = structuredClone(fixture); source.events[0].cooldown = cooldown; const pack = reseal(source, `bad-${JSON.stringify(cooldown)}`); assertRejected(pack, /cooldown|maxOccurrences|minNodesBetween|not allowed/);
  }
});

test("LOOPFIX02A-010: occurrence state validates shape and rejects injection effects", () => {
  const state = active(); assert.throws(() => validateGameState({ ...state, run: { ...state.run, events: { ...state.run.events, occurrences: { bad: { occurrenceCount: 1, lastOccurrenceNodeIndex: 0, patch: true } } } } }), /unknown or missing/);
  const source = structuredClone(fixture); source.events[0].choices = [{ id: "patch", scope: "core", labelKey: "patch", outcomes: { success: { effects: [{ op: "SET_EVENT_OCCURRENCE", eventId: "x", count: 99 }] } } }]; assertRejected(reseal(source, "state-injection"), /unknown effect/);
});

test("LOOPFIX02A-011: cumulative effects require per-effect repeat declarations", () => {
  const cases = [
    [{ op: "ADD_CULTIVATION", amount: 1 }, "progression"],
    [{ op: "ADD_BUILD_EVIDENCE", buildId: "build.sword", amount: 200, reasonTag: "test" }, "build"],
    [{ op: "ADJUST_NPC_RELATION", npcId: "npc:test", affinityDelta: 1, reasonTag: NPC_V1.reasonTags[0] }, "npc"],
    [{ op: "ADD_CAUSE", templateId: "cause.rescued-stranger", salience: 3, actorBindingKeys: { rescuedNpc: "eventTarget" } }, "cause"]
  ];
  for (const [effect, name] of cases) { assertRejected(recurringPack(effect, `${name}-missing`)); assertRegisters(recurringPack({ ...effect, repeatBehavior: "allow-cumulative" }, `${name}-valid`)); }
});

test("LOOPFIX02A-012: repeatable risk resolution is explicit and idempotent effects stay declaration-free", () => {
  assertRejected(recurringPack(undefined, "risk-missing", { threatId: "threat.combat" }));
  assertRegisters(recurringPack(undefined, "risk-valid", { threatId: "threat.combat", riskRepeatBehavior: "allow-repeat-resolution" }));
  assertRegisters(recurringPack({ op: "ADD_IDENTITY_TAG", tag: "remembered" }, "idempotent"));
  assertRejected(recurringPack({ op: "ADD_IDENTITY_TAG", tag: "remembered", repeatBehavior: "allow-cumulative" }, "bad-idempotent"), /repeatBehavior/);
});

test("LOOPFIX02A-013: maxOccurrences=1 needs no cumulative-effect waiver", () => assertRegisters(recurringPack({ op: "ADD_CULTIVATION", amount: 1 }, "once", {}, { maxOccurrences: 1 })));

test("LOOPFIX02A-014: lifecycle contract and runtime use P1-P6 terminology", () => {
  const lifecycle = fs.readFileSync(new URL("../.codex/contracts/lifecycle.ref", import.meta.url), "utf8"); const director = fs.readFileSync(new URL("../.codex/contracts/director.ref", import.meta.url), "utf8");
  assert.equal(lifecycle.includes("P0 terminal"), false); for (const tier of ["P1 terminal", "P2 first-run", "P3 eligible", "P4 active", "P5 build", "P6 ordinary"]) assert.equal(lifecycle.includes(tier), true, tier); assert.equal(director.includes("P1 terminal/lifespan"), true);
});

test("LOOPFIX02A-015: recurrence implementation contains no content ID hardcoding", () => {
  const text = ["event.ts", "reducer.ts", "director.ts"].map((file) => fs.readFileSync(new URL(`../packages/core/src/${file}`, import.meta.url), "utf8")).join("\n");
  assert.equal(/content01\.|cen-|pei-|jiang-|xie-|xu-/.test(text), false);
});
