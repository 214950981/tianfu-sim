import assert from "node:assert/strict";
import test from "node:test";

import {
  clampConditionStacks,
  clampDebt,
  clampRelationScore,
  createRngState,
  projectRuleState,
  validateGameState,
  validateStateTransition
} from "../packages/core/src/index.ts";

function validState(status = "offered") {
  const rootSeed = "state-seed";
  const identity = { runName: "Run", rootTags: [], titles: [] };
  if (status !== "offered") identity.destinyId = "destiny-1";
  const run = {
    runId: "run-1", playerId: "player-1", rootSeed, status, nodeIndex: 0, age: 16, maxAge: 100,
    realm: { id: "mortal", order: 0, cultivation: 0 },
    attributes: { insight: 1, body: 1, spiritSense: 1, fortune: 1 },
    resources: { spiritStone: 0, items: {} }, conditions: [], identity,
    actions: { available: ["cultivate"], pursuitCauseIds: [], recent: [] },
    events: { history: [] }, causes: { byId: {} }, npcs: { nextNpcSequence: 1, byId: {}, roleIndex: {} },
    build: { techniques: [], artifacts: [], consumables: [], tagScores: {} },
    world: { regionId: "start", knownRegionIds: ["start"], tags: [], factionStanding: {} },
    rng: createRngState("2.0.0", rootSeed), director: { profileId: "first_run", recentScenes: [] }
  };
  if (status === "offered") run.offer = { offerId: "offer-1", destinyIds: ["d1", "d2", "d3"] };
  if (status === "ended") run.ending = { endingId: "ending-1", age: 16, factIds: [] };
  return { schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "2.0.0", stateVersion: 0, run, metaView: { unlocks: [], entitlements: [], discoveries: [] } };
}

test("schema_roundtrip: valid state is stable and RuleState excludes MetaView", () => {
  const state = validState();
  const roundTrip = JSON.parse(JSON.stringify(validateGameState(state)));
  assert.deepEqual(roundTrip, state);
  const projected = projectRuleState(state);
  assert.equal("metaView" in projected, false);
  assert.deepEqual(projected, projectRuleState(roundTrip));
});

test("CORE-INV-01: versions and rootSeed cannot change once offered", () => {
  const previous = validState();
  for (const mutate of [
    (state) => { state.schemaVersion = 3; },
    (state) => { state.rulesVersion = "2.0.1"; state.run.rng.rulesVersion = "2.0.1"; },
    (state) => { state.contentVersion = "2.0.1"; },
    (state) => { state.run.rootSeed = "other"; state.run.rng.rootSeed = "other"; }
  ]) {
    const next = structuredClone(previous); mutate(next);
    assert.throws(() => validateStateTransition(previous, next));
  }
});

test("CORE-INV-03: offered and active destiny invariants hold", () => {
  const offeredWithDestiny = validState(); offeredWithDestiny.run.identity.destinyId = "d1";
  assert.throws(() => validateGameState(offeredWithDestiny));
  const activeWithoutDestiny = validState("active"); delete activeWithoutDestiny.run.identity.destinyId;
  assert.throws(() => validateGameState(activeWithoutDestiny));
  assert.doesNotThrow(() => validateGameState(validState("active")));
});

test("CORE-INV-04: ended Run rule fields are protected", () => {
  const ended = validState("ended");
  const metaOnly = structuredClone(ended); metaOnly.stateVersion += 1; metaOnly.metaView.unlocks.push("u1");
  assert.doesNotThrow(() => validateStateTransition(ended, metaOnly));
  const changedRun = structuredClone(ended); changedRun.stateVersion += 1; changedRun.run.age += 1;
  assert.throws(() => validateStateTransition(ended, changedRun), /ended Run/);
  const missingEnding = validState("ended"); delete missingEnding.run.ending;
  assert.throws(() => validateGameState(missingEnding));
});

test("state_ranges: invalid enums and numeric values are rejected", () => {
  const mutations = [
    (state) => { state.run.status = "invalid"; },
    (state) => { state.run.age = NaN; },
    (state) => { state.run.maxAge = Infinity; },
    (state) => { state.run.nodeIndex = Number.MAX_SAFE_INTEGER + 1; },
    (state) => { state.run.conditions.push({ id: "c", kind: "injury", stacks: 4, sourceRef: "test" }); },
    (state) => { state.run.npcs.byId.n1 = { npcId: "n1", archetypeId: "a", originKind: "generated", displayName: "N", traitTags: [], factIds: [], tags: [], roleTags: [], actualStatus: "active", relation: { affinity: 101, trust: 0, debt: 0, encounterCount: 1 }, significance: 0, promotedToA: false, knowledge: { met: true, knownFactIds: [], knownTraitTags: [], knownStatus: "active", lastKnownAge: 1, lastKnownNodeIndex: 0 }, createdAge: 1, createdNodeIndex: 0, lastEncounterAge: 1, lastEncounterNodeIndex: 0, encounterCount: 1, milestoneFacts: [] }; }
  ];
  for (const mutate of mutations) { const state = validState(); mutate(state); assert.throws(() => validateGameState(state)); }
  assert.equal(clampConditionStacks(9), 3);
  assert.equal(clampRelationScore(-200), -100);
  assert.equal(clampDebt(8), 3);
  assert.throws(() => clampDebt(NaN));
});
