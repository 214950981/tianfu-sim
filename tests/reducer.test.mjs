import assert from "node:assert/strict";
import test from "node:test";

import {
  ReducerError,
  createOfferedRun,
  projectRuleState,
  reduce,
  resolveTimeAdvance
} from "../packages/core/src/index.ts";

function offeredInput() {
  return {
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "content-1",
    runId: "run-1", playerId: "player-1", rootSeed: "root-1",
    metaView: { unlocks: ["u1"], entitlements: [], discoveries: [] },
    fixture: {
      offerId: "offer-1", destinyIds: ["d1", "d2", "d3"], age: 16, maxAge: 100, runName: "Run",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 1, body: 2, spiritSense: 3, fortune: 4 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel"],
      world: { regionId: "start", knownRegionIds: ["start"], tags: [], factionStanding: {} }, firstRun: true
    }
  };
}

function context() { return { rulesVersion: "2.0.0", contentVersion: "content-1", content: {}, commandId: "cmd:reducer" }; }

test("reducer_purity: same input is canonical-equivalent and input is not mutated", () => {
  const factoryInput = offeredInput();
  const factorySnapshot = structuredClone(factoryInput);
  const state = createOfferedRun(factoryInput);
  assert.deepEqual(factoryInput, factorySnapshot);
  const snapshot = structuredClone(state);
  const input = { state, command: { type: "START_RUN", offerId: "offer-1", destinyId: "d2" }, context: context() };
  const first = reduce(input); const second = reduce(input);
  assert.deepEqual(projectRuleState(first.state), projectRuleState(second.state));
  assert.deepEqual(state, snapshot);
});

test("start_run_golden: valid offered destiny activates exactly once", () => {
  const state = createOfferedRun(offeredInput());
  const output = reduce({ state, command: { type: "START_RUN", offerId: "offer-1", destinyId: "d2" }, context: context() });
  assert.equal(output.state.stateVersion, 1);
  assert.equal(output.state.run.status, "active");
  assert.equal(output.state.run.identity.destinyId, "d2");
  assert.equal("offer" in output.state.run, false);
  assert.deepEqual(output.effects, []); assert.deepEqual(output.narrativeFacts, []); assert.deepEqual(output.trace, { rngDraws: [] });
});

test("CORE-INV-06: failed START_RUN changes no version, RNG, or time", () => {
  const state = createOfferedRun(offeredInput());
  const snapshot = structuredClone(state);
  const failures = [
    { type: "START_RUN", offerId: "wrong", destinyId: "d1" },
    { type: "START_RUN", offerId: "offer-1", destinyId: "outside" }
  ];
  for (const command of failures) {
    assert.throws(() => reduce({ state, command, context: context() }), ReducerError);
    assert.deepEqual(state, snapshot);
  }
});

test("CORE-INV-08: consumed offer cannot be reused", () => {
  const offered = createOfferedRun(offeredInput());
  const active = reduce({ state: offered, command: { type: "START_RUN", offerId: "offer-1", destinyId: "d1" }, context: context() }).state;
  const snapshot = structuredClone(active);
  assert.throws(
    () => reduce({ state: active, command: { type: "START_RUN", offerId: "offer-1", destinyId: "d1" }, context: context() }),
    (error) => error instanceof ReducerError && error.code === "RUN_NOT_ACTIVE"
  );
  assert.deepEqual(active, snapshot);
});

test("time_boundary: age is capped at maxAge with integer semantics", () => {
  assert.deepEqual(resolveTimeAdvance(99, 100, 1), { previousAge: 99, delta: 1, nextAge: 100, reachedMaxAge: true });
  assert.deepEqual(resolveTimeAdvance(99, 100, 50), { previousAge: 99, delta: 50, nextAge: 100, reachedMaxAge: true });
  assert.deepEqual(resolveTimeAdvance(10, 100, 5), { previousAge: 10, delta: 5, nextAge: 15, reachedMaxAge: false });
  assert.throws(() => resolveTimeAdvance(101, 100, 0));
  assert.throws(() => resolveTimeAdvance(1, 2, NaN));
});

test("property_current_scope: time helper never exceeds maxAge", () => {
  for (let maxAge = 0; maxAge <= 20; maxAge += 1) {
    for (let age = 0; age <= maxAge; age += 1) {
      for (let delta = 0; delta <= 25; delta += 1) {
        const result = resolveTimeAdvance(age, maxAge, delta);
        assert.ok(result.nextAge >= age && result.nextAge <= maxAge);
        assert.equal(result.reachedMaxAge, result.nextAge === maxAge);
      }
    }
  }
});
