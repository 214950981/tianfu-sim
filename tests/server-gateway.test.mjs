import assert from "node:assert/strict";
import test from "node:test";

import { createOfferedRun, replayCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import { CommandGateway, GatewayApplicationTransport, InMemoryGatewayStore } from "../server/src/index.ts";

function offered() {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "gateway-1", runId: "run-gateway", playerId: "player-owner", rootSeed: "gateway-secret-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: { offerId: "offer-gateway", destinyIds: ["destiny.a", "destiny.b", "destiny.c"], age: 20, maxAge: 100, runName: "Gateway", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 5, body: 5, spiritSense: 5, fortune: 5 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"], world: { regionId: "start", knownRegionIds: ["start"], tags: [], factionStanding: {} } }
  });
}
function envelope(commandId = "cmd:start", destinyId = "destiny.a", overrides = {}) {
  return { commandId, playerId: "player-owner", runId: "run-gateway", expectedStateVersion: 0, rulesVersion: "2.0.0", contentVersion: "gateway-1", clientPlatform: "dev", clientBuild: "test", command: { type: "START_RUN", offerId: "offer-gateway", destinyId }, ...overrides };
}
function setup(options = {}) { const initial = offered(); const store = new InMemoryGatewayStore(); store.seedRun(initial); const gateway = new CommandGateway({ store, content: {}, ...options }); return { initial, store, gateway }; }

test("integration: ApplicationTransport sends one authoritative command and records replayable persistence", async () => {
  const value = setup(); const transport = new GatewayApplicationTransport(value.gateway, { playerId: "player-owner" });
  const result = await transport.sendCommand(envelope()); assert.deepEqual(result, { ok: true, commandId: "cmd:start", stateVersion: 1 });
  const stored = value.store.readRun("run-gateway"); assert.equal(stored.state.run.status, "active"); assert.equal(stored.commandLog.entries.length, 1);
  const replayed = replayCommandLog({ initialState: value.initial, commandLog: stored.commandLog, content: {} }); assert.equal(replayed.finalRuleStateHash, ruleStateHash(stored.state));
  const responseText = JSON.stringify(result); assert.equal(responseText.includes("rootSeed"), false); assert.equal(responseText.includes("rng"), false); assert.equal(responseText.includes("facts"), false);
  assert.equal(JSON.stringify(stored.commandLog).includes("gateway-secret-seed"), false);
});

test("idempotency: exact duplicate settles once; changed payload with same commandId is rejected", async () => {
  const value = setup(); const request = envelope(); const first = await value.gateway.sendCommand({ playerId: "player-owner" }, request); const afterFirst = value.store.readRun("run-gateway");
  const duplicate = await value.gateway.sendCommand({ playerId: "player-owner" }, request); const afterDuplicate = value.store.readRun("run-gateway");
  assert.deepEqual(duplicate, first); assert.deepEqual(afterDuplicate, afterFirst); assert.equal(afterDuplicate.commandLog.entries.length, 1);
  const conflict = await value.gateway.sendCommand({ playerId: "player-owner" }, envelope("cmd:start", "destiny.b"));
  assert.equal(conflict.ok, false); assert.equal(conflict.error.code, "INVALID_COMMAND"); assert.equal(conflict.error.messageKey, "command.idempotency_conflict"); assert.deepEqual(value.store.readRun("run-gateway"), afterFirst);
});

test("state version: concurrent commands serialize and stale request gets STATE_CONFLICT", async () => {
  const value = setup(); const [left, right] = await Promise.all([
    value.gateway.sendCommand({ playerId: "player-owner" }, envelope("cmd:left", "destiny.a")),
    value.gateway.sendCommand({ playerId: "player-owner" }, envelope("cmd:right", "destiny.b"))
  ]);
  assert.equal([left, right].filter((result) => result.ok).length, 1); const stale = [left, right].find((result) => !result.ok); assert.equal(stale.error.code, "STATE_CONFLICT");
  const stored = value.store.readRun("run-gateway"); assert.equal(stored.state.stateVersion, 1); assert.equal(stored.commandLog.entries.length, 1);
  assert.deepEqual(await value.gateway.sendCommand({ playerId: "player-owner" }, stale.commandId === "cmd:left" ? envelope("cmd:left", "destiny.a") : envelope("cmd:right", "destiny.b")), stale);
});

test("owner auth and trust boundary reject cross-player and authoritative-state forgery", async () => {
  const value = setup();
  const crossPlayer = await value.gateway.sendCommand({ playerId: "player-attacker" }, envelope("cmd:attack", "destiny.a", { playerId: "player-attacker" })); assert.equal(crossPlayer.error.code, "UNAUTHORIZED");
  const boundMismatch = await value.gateway.sendCommand({ playerId: "player-attacker" }, envelope("cmd:mismatch")); assert.equal(boundMismatch.error.code, "UNAUTHORIZED");
  const forged = await value.gateway.sendCommand({ playerId: "player-owner" }, { ...envelope("cmd:forge"), state: { run: { rootSeed: "chosen" } }, reward: 999 }); assert.equal(forged.error.code, "INVALID_COMMAND");
  const oversized = await value.gateway.sendCommand({ playerId: "player-owner" }, envelope("cmd:large", "destiny.a", { clientBuild: "x".repeat(20_000) })); assert.equal(oversized.error.code, "INVALID_COMMAND");
  const stored = value.store.readRun("run-gateway"); assert.equal(stored.state.stateVersion, 0); assert.equal(stored.commandLog.entries.length, 0);
});

test("timeout retry returns committed result without double state/RNG/time settlement", async () => {
  let timeouts = 0; const value = setup({ afterCommit: () => { if (timeouts++ === 0) throw new Error("simulated timeout"); } }); const request = envelope("cmd:timeout");
  await assert.rejects(() => value.gateway.sendCommand({ playerId: "player-owner" }, request), /simulated timeout/); const committed = value.store.readRun("run-gateway");
  const retry = await value.gateway.sendCommand({ playerId: "player-owner" }, request); assert.equal(retry.ok, true); const afterRetry = value.store.readRun("run-gateway");
  assert.deepEqual(afterRetry, committed); assert.equal(afterRetry.state.stateVersion, 1); assert.equal(afterRetry.commandLog.entries.length, 1);
});

test("failure injection before atomic commit leaves state clean and retryable", async () => {
  const initial = offered(); const store = new InMemoryGatewayStore(); store.seedRun(initial); const failing = new CommandGateway({ store, content: {}, beforeCommit: () => { throw new Error("injected commit failure"); } });
  const failed = await failing.sendCommand({ playerId: "player-owner" }, envelope("cmd:retry")); assert.equal(failed.error.code, "TRANSIENT"); assert.equal(failed.error.retryable, true);
  const afterFailure = store.readRun("run-gateway"); assert.equal(afterFailure.state.stateVersion, 0); assert.equal(afterFailure.commandLog.entries.length, 0); assert.deepEqual(afterFailure.state.run.rng, initial.run.rng);
  const healthy = new CommandGateway({ store, content: {} }); const retried = await healthy.sendCommand({ playerId: "player-owner" }, envelope("cmd:retry")); assert.equal(retried.ok, true); assert.equal(store.readRun("run-gateway").commandLog.entries.length, 1);
});
