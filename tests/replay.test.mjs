import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ContentRegistry, sealContentPack } from "../packages/content/src/index.ts";
import {
  PersistenceError,
  canonicalRuleStateJson,
  createCommandLog,
  createOfferedRun,
  createSnapshot,
  executeLoggedCommand,
  reduce,
  replayCommandLog,
  ruleStateHash,
  shouldCreateSnapshot,
  validateCommandLog,
  validateGameState,
  validateSnapshot
} from "../packages/core/src/index.ts";

function contentPack() {
  const success = (amount) => ({ effects: [{ op: "ADD_RESOURCE", key: "spiritStone", amount }] });
  const choice = (id, next) => ({
    id, scope: "core", labelKey: `${id}.label`, check: { primary: "insight", secondary: "fortune", secondaryWeightBps: 5_000, difficulty: 10, randomMin: -10, randomMax: 10 },
    outcomes: { success: success(1), costlySuccess: success(1), failure: success(1) }, ...(next === undefined ? {} : { next: [{ eventId: next }] })
  });
  return sealContentPack({
    manifest: { schemaVersion: 2, packId: "replay-pack", rulesVersion: "2.0.0", contentVersion: "replay-1" },
    references: { items: [], components: [], npcTemplates: [], regions: ["region.start"], endings: [], causes: [], conditions: [] }, destinies: [], causeTemplates: [],
    events: [
      { id: "event.one", version: 1, kind: "choice", titleKey: "one", tags: [], weight: 1, choices: [choice("one", "event.two")], fallback: { bodyKey: "one" } },
      { id: "event.two", version: 1, kind: "choice", titleKey: "two", tags: [], weight: 1, choices: [choice("two")], fallback: { bodyKey: "two" } }
    ]
  });
}
function setup() {
  const pack = contentPack(); const content = new ContentRegistry(); content.register(pack);
  const offered = createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "replay-1", runId: "run-replay", playerId: "player-replay", rootSeed: "root-replay",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: { offerId: "offer-replay", destinyIds: ["d1", "d2", "d3"], age: 20, maxAge: 100, runName: "Replay", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 5, spiritSense: 5, fortune: 7 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"], world: { regionId: "region.start", knownRegionIds: ["region.start"], tags: [], factionStanding: {} } }
  });
  const started = reduce({ state: offered, command: { type: "START_RUN", offerId: "offer-replay", destinyId: "d1" }, context: { rulesVersion: "2.0.0", contentVersion: "replay-1", content, commandId: "cmd:bootstrap" } }).state;
  const initialState = validateGameState({ ...started, run: { ...started.run, events: { history: [], current: { eventId: "event.one", kind: "choice" } } } });
  return { pack, content, initialState };
}
function envelope(state, commandId, eventId, optionId, issuedAtClient = 123) { return { commandId, playerId: state.run.playerId, runId: state.run.runId, expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, clientPlatform: "dev", clientBuild: "test", issuedAtClient, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId } }; }
function journey() {
  const { pack, content, initialState } = setup(); let log = createCommandLog(initialState);
  const first = executeLoggedCommand(initialState, log, envelope(initialState, "cmd:one", "event.one", "one"), { actorBindings: { stable: "npc:test:stable" } }, content); log = first.commandLog;
  const snapshot = createSnapshot(first.output.state, 1);
  const second = executeLoggedCommand(first.output.state, log, envelope(first.output.state, "cmd:two", "event.two", "two", 999), { actorStatusById: { "npc:test:stable": "available" } }, content); log = second.commandLog;
  return { pack, content, initialState, snapshot, finalState: second.output.state, log, secondTrace: second.output.trace };
}

test("DET-001/DET-002/REP-003: full replay is identical across 100 runs", () => {
  const value = journey(); const expected = replayCommandLog({ initialState: value.initialState, commandLog: value.log, content: value.content });
  assert.equal(expected.finalRuleStateHash, ruleStateHash(value.finalState));
  for (let index = 0; index < 100; index += 1) assert.deepEqual(replayCommandLog({ initialState: value.initialState, commandLog: value.log, content: value.content }), expected);
  assert.equal(value.log.entries[0].envelope.commandId, "cmd:one"); assert.deepEqual(value.log.entries[0].context.actorBindings, { stable: "npc:test:stable" });
});

test("REP-004/PERSIST-004: Snapshot resume matches full replay and restores RNG drawIndex", () => {
  const value = journey(); const full = replayCommandLog({ initialState: value.initialState, commandLog: value.log, content: value.content });
  const resumed = replayCommandLog({ snapshot: value.snapshot, commandLog: value.log, content: value.content });
  assert.equal(resumed.finalRuleStateHash, full.finalRuleStateHash); assert.deepEqual(resumed.state, full.state);
  assert.deepEqual(resumed.state.run.rng, value.finalState.run.rng);
  assert.equal(resumed.state.run.rng.streams.check.drawIndex, value.snapshot.state.run.rng.streams.check.drawIndex + resumed.checkpoints[0].stateVersion - value.snapshot.stateVersion);
  assert.deepEqual(resumed.checkpoints, [full.checkpoints[1]]);
});

test("PERSIST-005/PERSIST-006: corrupted data and version mismatches fail stably", () => {
  const value = journey();
  const badHash = structuredClone(value.snapshot); badHash.ruleStateHash = "0".repeat(64); assert.throws(() => validateSnapshot(badHash), PersistenceError);
  const badRng = structuredClone(value.snapshot); badRng.state.run.rng.streams.check.drawIndex = -1; assert.throws(() => validateSnapshot(badRng));
  const oldSnapshot = structuredClone(value.snapshot); oldSnapshot.snapshotSchemaVersion = 0; assert.throws(() => validateSnapshot(oldSnapshot), /migrate or reject/);
  const badOrder = structuredClone(value.log); badOrder.entries[1].sequence = 9; assert.throws(() => validateCommandLog(badOrder), /contiguous/);
  const badVersion = structuredClone(value.log); badVersion.entries[1].envelope.contentVersion = "wrong"; assert.throws(() => validateCommandLog(badVersion), /metadata/);
  const badCheckpoint = structuredClone(value.log); badCheckpoint.entries[1].resultRuleStateHash = "f".repeat(64); assert.throws(() => replayCommandLog({ initialState: value.initialState, commandLog: badCheckpoint, content: value.content }), /checkpoint mismatch/);
});

test("GS-009: canonical RuleState hash excludes MetaView and client time", () => {
  const value = journey(); const alteredMeta = validateGameState({ ...value.finalState, metaView: { unlocks: ["outside-rule-hash"], entitlements: [], discoveries: [] } });
  assert.equal(ruleStateHash(alteredMeta), ruleStateHash(value.finalState)); assert.equal(canonicalRuleStateJson(alteredMeta), canonicalRuleStateJson(value.finalState));
  const { content, initialState } = setup(); const left = executeLoggedCommand(initialState, createCommandLog(initialState), envelope(initialState, "cmd:time", "event.one", "one", 1), {}, content);
  const right = executeLoggedCommand(initialState, createCommandLog(initialState), envelope(initialState, "cmd:time", "event.one", "one", 999999), {}, content);
  assert.equal(ruleStateHash(left.output.state), ruleStateHash(right.output.state));
});

test("snapshot hooks use a deterministic three-success cadence and forced boundaries", () => {
  const { initialState } = setup(); assert.equal(shouldCreateSnapshot(2, initialState, { type: "START_RUN" }), false); assert.equal(shouldCreateSnapshot(3, initialState, { type: "START_RUN" }), true);
  assert.equal(shouldCreateSnapshot(0, initialState, { type: "START_BREAKTHROUGH" }), true); assert.equal(shouldCreateSnapshot(0, initialState, { type: "SUBMIT_CHALLENGE" }), true);
  const ended = validateGameState({ ...initialState, run: { ...initialState.run, status: "ended", ending: { endingId: "test", age: initialState.run.age, factIds: [] } } });
  assert.equal(shouldCreateSnapshot(0, ended, { type: "START_RUN" }), true);
});

test("replay CLI returns the verified final hash", () => {
  const value = journey(); const directory = mkdtempSync(join(tmpdir(), "tianfu-a10-"));
  try {
    const inputPath = join(directory, "input.json"); const packPath = join(directory, "pack.json"); writeFileSync(inputPath, JSON.stringify({ initialState: value.initialState, commandLog: value.log })); writeFileSync(packPath, JSON.stringify(value.pack));
    const output = JSON.parse(execFileSync(process.execPath, ["tools/replay.mjs", inputPath, packPath], { cwd: process.cwd(), encoding: "utf8" }));
    assert.equal(output.finalRuleStateHash, ruleStateHash(value.finalState)); assert.equal(output.checkpoints.length, 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
