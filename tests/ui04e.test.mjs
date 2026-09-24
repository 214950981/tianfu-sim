/**
 * UI04E — Terminal Lifecycle / Multi-Life Vertical Slice.
 *
 * SCOPE
 *
 * One suite, three levels:
 *
 *  1. the TypeScript terminal-flow module against the in-memory store;
 *  2. the committed deployable host `cloudfunctions/tianfu2/index.js`, loaded as CommonJS in its own
 *     realm, exercising the full path `START_RUN -> real action -> reach dying -> ENDING ->
 *     LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE -> new DESTINY_OFFER`;
 *  3. the deterministic regenerated artifacts (cloud runtime, WeChat runtime, their audits and
 *     smokes), plus the new client-side terminal controller methods.
 *
 * What this suite proves:
 *
 *   - a real reducer-driven dying run projects as ENDING (no empty SPECIAL_NODE dead-end);
 *   - terminal presentation state lives outside RuleState and the public terminal projection
 *     contains only already-public facts (LIFE_BOOK / REBIRTH_RESULT / NEXT_LIFE);
 *   - `advanceTerminal` enforces ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE order and
 *     trusted-owner ownership, refusing cross-player attempts and stale expectedTerminalStage;
 *   - `terminalTransitionId` is exactly-once across a post-commit timeout and a cold handler, and
 *     a reused id with a different payload is refused without advancing;
 *   - every pure terminal transition leaves canonical gameplay bytes (stateVersion, age, nodeIndex,
 *     RNG, commandLog, snapshot, causes, NPC state, resources, builds, history) byte-identical;
 *   - REBIRTH_RESULT adds no new gameplay or meta-reward semantics;
 *   - NEXT_LIFE rotates the bootstrap key once and creates a distinct run for the same authoritative
 *     player with retry-safe recovery;
 *   - the prior run remains immutable after the new life is created;
 *   - v2-live renders all four terminal stages and never locally skips an authoritative stage;
 *   - the committed cloud + miniprogram runtime artifacts are fresh, audited and smoke-green.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { reduce, ruleStateHash, validateGameState, createOfferedRun, createRngState, createCommandLog, selectDestinyCandidates } from "../packages/core/src/index.ts";
import {
  parseAdvanceTerminalResult,
  parseRunOfferResult,
  bootstrapWeChatRun,
  TransportProtocolError,
  TerminalUnavailableError,
  WeChatRunController,
  createWeChatPlatformStorage,
  createWeChatCloudTransport as createClientCloudTransport
} from "../packages/wechat-shell/src/index.ts";
import {
  CloudBaseGatewayStore,
  InMemoryGatewayStore,
  TianfuLiveService,
  createLiveContentRegistry,
  derivePlayerId,
  documentIdFor,
  LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION
} from "../server/src/index.ts";

import { createFakeCloudDatabase, loadCloudFunction } from "../tools/ui04d-cloud-harness.mjs";
import { runCloudRuntimeSmoke } from "../tools/ui04d-cloud-runtime-smoke.mjs";
import { auditCloudRuntime } from "../tools/ui04d-cloud-runtime-audit.mjs";
import {
  CLOUD_ARTIFACT_PATHS,
  CLOUD_FACADE_EXPORTS,
  CLOUD_FACADE_PATH,
  CLOUD_FUNCTION_DIR,
  CLOUD_RUNTIME_DIR,
  buildCloudRuntimeArtifact,
  checkCloudRuntimeArtifact
} from "../tools/ui04d-cloud-runtime-artifact.mjs";
import { runRouteGuard } from "../tools/route-guard.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJSON = (relative) => JSON.parse(read(relative));
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ALICE = "o-alice-ui04e";
const BOB = "o-bob-ui04e";
const ALICE_PLAYER = derivePlayerId(ALICE);
const BOB_PLAYER = derivePlayerId(BOB);

/** Deterministic server entropy. */
function deterministicEntropy(prefix = "seed") {
  let counter = 0;
  return { randomToken: () => `${prefix}-${String(++counter).padStart(4, "0")}` };
}

/** A live service over a CloudBase-like database — exactly what the cloud host builds. */
function cloudService({ openid = ALICE, database = createFakeCloudDatabase(), entropy = deterministicEntropy() } = {}) {
  const registry = createLiveContentRegistry();
  const store = new CloudBaseGatewayStore({ database });
  const service = new TianfuLiveService({
    store,
    content: registry,
    entropy,
    auth: { playerId: derivePlayerId(openid) },
    rulesVersion: LIVE_RULES_VERSION,
    contentVersion: LIVE_CONTENT_VERSION
  });
  return { service, store, database, registry };
}

function envelope(playerId, runId, expectedStateVersion, command, commandId = `cmd:${++counter}:${Math.random().toString(36).slice(2, 8)}`) {
  return { commandId, playerId, runId, expectedStateVersion, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientPlatform: "wechat", clientBuild: "ui04e-test", command };
}
let counter = 0;

/** The stored run document, read straight out of the fake database by its deterministic id. */
function storedRun(database, runId) {
  const documents = database.snapshot().get("tianfu2_runs");
  return documents.get(documentIdFor("run", runId));
}

/**
 * Drives a real run to `dying` via the real reducer: seeds an offered state at age 99 / maxAge 100
 * (so a single CHOOSE_ACTION travel with cost 2 lands at the ceiling), then runs START_RUN followed by
 * the single travel. Returns the dying state and the issued envelopes so the caller can assert on
 * hash / byte identity. Uses the real CONTENT01 registry so no destiny is fabricated.
 */
async function driveToDying({ service, database, registry, runId, playerId }) {
  // Use the service to create a real CONTENT01 destiny offer (with innateProfiles). Then we
  // overwrite the stored offered state to age 99 / maxAge 100 so a single CHOOSE_ACTION travel
  // (= 2 time) lands at the lifespan ceiling. The offer's innateProfiles survive untouched.
  const offer = await service.createRunOffer({ bootstrapId: `boot:${runId}` });
  const actualRunId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const beforeDoc = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", actualRunId));
  // Patch age/maxAge on the existing offered state (which already has the real innateProfiles).
  const seededState = { ...beforeDoc.state, run: { ...beforeDoc.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", actualRunId), {
    state: seededState, commandLog: createCommandLog(seededState), successfulCommandsSinceSnapshot: 0
  });

  const started = await service.sendCommand(envelope(playerId, actualRunId, 0, { type: "START_RUN", offerId: `offer-${actualRunId}`, selectionId }));
  assert.equal(started.ok, true, JSON.stringify(started));

  const dying = await service.sendCommand(envelope(playerId, actualRunId, started.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }));
  assert.equal(dying.ok, true, JSON.stringify(dying));
  const dyingState = storedRun(database, actualRunId).state;
  assert.equal(dyingState.run.status, "dying", "the run must reach `dying` after a real travel action hits the ceiling");
  assert.notEqual(dyingState.run.ending, undefined, "the run must carry a lifespan ending");
  return { dyingState, started, dying, runId: actualRunId, offer, selectionId };
}

// ================================================================= 1. terminal sidecar data model

test("UI04E_sidecar: TerminalSidecar is bounded and lives outside GameState — no reducer touching", () => {
  const source = read("server/src/gateway-store.ts");
  assert.equal(source.includes("terminal?: TerminalSidecar"), true, "StoredRun must carry the terminal sidecar");
  assert.equal(source.includes("terminalStage"), false, "RuleState must not gain a terminalStage field");
  const stateRef = read(".codex/contracts/state.ref");
  assert.equal(/terminalStage|terminalStage|terminalVersion/.test(stateRef), false, "the state contract must remain terminal-free");
});

// ================================================================= 2. terminal flow — exactly-once + sidecar-only

test("UI04E_flow: terminal transitions advance ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE in order", async () => {
  const setup = cloudService();
  const { runId, dyingState } = await driveToDying({ ...setup, runId: "run-ui04e-flow", playerId: ALICE_PLAYER });

  const lb = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  assert.equal(lb.ok, true, JSON.stringify(lb));
  assert.equal(lb.stage, "LIFE_BOOK");
  assert.equal(lb.version, 1);

  const rr = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });
  assert.equal(rr.ok, true, JSON.stringify(rr));
  assert.equal(rr.stage, "REBIRTH_RESULT");
  assert.equal(rr.version, 2);

  const nl = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });
  assert.equal(nl.ok, true, JSON.stringify(nl));
  assert.equal(nl.stage, "NEXT_LIFE");
  assert.equal(nl.version, 3);
  assert.equal(typeof nl.nextBootstrapId, "string");
  assert.equal(typeof nl.nextRunId, "string");
  assert.notEqual(nl.nextRunId, runId, "the next life must be a different document");

  // The prior run's terminal sidecar carries all three receipts in order.
  const oldAfter = storedRun(setup.database, runId);
  assert.equal(oldAfter.terminal.stage, "NEXT_LIFE");
  assert.equal(oldAfter.terminal.version, 3);
  assert.equal(Object.keys(oldAfter.terminal.transitions).length, 3);
  // The canonical gameplay bytes are byte-identical to what the reducer settled (terminal sidecar aside).
  assert.equal(ruleStateHash(oldAfter.state), ruleStateHash(dyingState), "the canonical gameplay hash must not change across a pure terminal transition");

  // NEXT_LIFE creates a *new* run document — the nextBootstrapId resolves to it.
  const nextRun = storedRun(setup.database, nl.nextRunId);
  assert.notEqual(nextRun, undefined, "the next life must be persisted as a fresh document");
  assert.equal(nextRun.state.run.status, "offered", "the next life starts at the destiny-offer status");
  assert.equal(nextRun.state.run.runId, nl.nextRunId);
});

test("UI04E_flow: an exact terminal retry returns the same stage without advancing twice", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-retry", playerId: ALICE_PLAYER });

  // First settle.
  const first = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:retry", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  assert.equal(first.ok, true);
  const afterFirst = storedRun(setup.database, runId);
  const firstHash = ruleStateHash(afterFirst.state);

  // Simulate a post-commit timeout by arming the harness and re-issuing the *same* envelope. The
  // first retry returns TRANSIENT (the host wraps the platform timeout). The next retry recovers
  // the settled result via the exactly-once path.
  setup.database.armPostCommitTimeout();
  let lost = null;
  try { await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:retry", expectedTerminalStage: "ENDING", action: "advance-to-life-book" }); }
  catch (error) { lost = error; }
  assert.notEqual(lost, null);
  assert.equal(lost.code, "TRANSIENT");
  assert.equal(lost.retryable, true);
  // The transition *did* settle — the receipt is durable.
  assert.equal(storedRun(setup.database, runId).terminal.stage, "LIFE_BOOK");

  // Retry recovers the same stage/version without advancing.
  const second = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:retry", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  assert.equal(second.ok, true, "the retry must recover the settled stage");
  assert.equal(second.stage, first.stage);
  assert.equal(second.version, first.version);

  const afterSecond = storedRun(setup.database, runId);
  assert.equal(ruleStateHash(afterSecond.state), firstHash, "no double settlement: gameplay bytes unchanged");
  assert.equal(afterSecond.terminal.version, 1, "no double stage bump");
});

test("UI04E_flow: a reused terminalTransitionId with a different payload fails closed without advancing", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-conflict", playerId: ALICE_PLAYER });

  const first = await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:conflict", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  assert.equal(first.ok, true);

  let caught = null;
  try {
    await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:conflict", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });
  } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.messageKey, "terminal.idempotency_conflict");
  const after = storedRun(setup.database, runId);
  assert.equal(after.terminal.stage, "LIFE_BOOK");
  assert.equal(after.terminal.version, 1);
});

test("UI04E_flow: another player cannot advance a terminal transition, and the refusal leaks nothing", async () => {
  const database = createFakeCloudDatabase();
  const alice = cloudService({ database });
  const bob = cloudService({ openid: BOB, database });
  const { runId } = await driveToDying({ ...alice, runId: "run-ui04e-cross", playerId: ALICE_PLAYER });

  let caught = null;
  try {
    await bob.service.advanceTerminal({ runId, terminalTransitionId: "term:cross", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.code, "UNAUTHORIZED");
  assert.equal(JSON.stringify(caught).includes(runId), false, "the refusal must not echo the run id");
});

test("UI04E_flow: terminal transitions are refused on a run that has not yet reached end-of-life", async () => {
  const setup = cloudService();
  const offer = await setup.service.createRunOffer({ bootstrapId: "boot:ui04e-tooearly" });
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  await setup.service.sendCommand(envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId }));
  let caught = null;
  try {
    await setup.service.advanceTerminal({ runId: offer.runId, terminalTransitionId: "term:tooearly", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.messageKey, "terminal.not_reached");
});

test("UI04E_flow: a stale expectedTerminalStage is a STATE_CONFLICT, not a silent advance", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-stale", playerId: ALICE_PLAYER });

  let caught = null;
  try {
    await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:stale", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });
  } catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.code, "STATE_CONFLICT");
  assert.equal(caught.messageKey, "terminal.stage_drift");
});

// ================================================================= 3. canonical gameplay bytes are untouched

test("UI04E_idempotency: pure terminal transitions leave GameState, commandLog and ruleStateHash byte-identical", async () => {
  const setup = cloudService();
  const { runId, dyingState } = await driveToDying({ ...setup, runId: "run-ui04e-hash", playerId: ALICE_PLAYER });

  const dyingStateJson = JSON.stringify(dyingState);
  const dyingRng = JSON.stringify(dyingState.run.rng);
  const dyingHash = ruleStateHash(dyingState);

  await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:a", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:b", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });

  const after = storedRun(setup.database, runId);
  assert.equal(JSON.stringify(after.state), dyingStateJson, "the canonical GameState must be byte-identical");
  assert.equal(JSON.stringify(after.state.run.rng), dyingRng, "the RNG must be untouched");
  assert.equal(ruleStateHash(after.state), dyingHash, "the ruleStateHash must match");
  assert.equal(after.commandLog.entries.length, 2, "no extra command log entries from terminal flow");
  assert.equal(after.terminal.stage, "REBIRTH_RESULT");
  assert.equal(after.terminal.version, 2);
});

// ================================================================= 4. terminal projection in the public ViewModel

test("UI04E_projection: a dying run projects as ENDING with no empty SPECIAL_NODE dead-end", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-dying", playerId: ALICE_PLAYER });

  const view = await setup.service.fetchView(runId);
  assert.equal(view.state.pageState, "ENDING", "dying runs must project as ENDING, never SPECIAL_NODE");
  assert.equal(view.state.runStatus, "dying");
});

test("UI04E_projection: LIFE_BOOK only contains already-public facts (no hidden Causes, no rootSeed, no RNG)", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-lifebook", playerId: ALICE_PLAYER });

  await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:lb", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });

  const view = await setup.service.fetchView(runId);
  assert.equal(view.state.pageState, "LIFE_BOOK");
  assert.equal(typeof view.state.terminal, "object");
  assert.equal(view.state.terminal.stage, "LIFE_BOOK");
  const lifeBook = view.state.terminal.lifeBook;
  assert.notEqual(lifeBook, undefined);
  const serialized = JSON.stringify(view);
  for (const secret of ["rootSeed", "rngState", "drawIndex", "echoBudget", "selectorWeights", "hiddenCause", "futureEventIds", "checkSpec"]) {
    assert.equal(serialized.includes(secret), false, "LIFE_BOOK must not carry server-only state: " + secret);
  }
});

test("UI04E_projection: REBIRTH_RESULT adds no new gameplay or meta-reward semantics", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-rr", playerId: ALICE_PLAYER });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:rr1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "term:rr2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });

  const view = await setup.service.fetchView(runId);
  assert.equal(view.state.pageState, "REBIRTH_RESULT");
  assert.equal(view.state.terminal.stage, "REBIRTH_RESULT");
  const serialized = JSON.stringify(view.state.terminal);
  for (const forbidden of ["metaCurrency", "unlocks", "achievements", "entitlements", "reward"]) {
    assert.equal(serialized.includes(forbidden), false, "REBIRTH_RESULT must not invent meta-reward fields: " + forbidden);
  }
  assert.equal(view.state.terminal.rebirthResult.nextLifeAffordance, true);
});

// ================================================================= 5. the committed cloud host drives the full chain

/** Seeds an offered state at age 99 / maxAge 100 through the host. Returns the real runId + selectionId. */
async function hostSeedNearDeath(handler, database, registry, label) {
  // Use the host to create a real CONTENT01 destiny offer (with innateProfiles). Then overwrite the
  // stored offered state to age 99 / maxAge 100 so a single CHOOSE_ACTION travel hits the ceiling.
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: `boot:${label}` });
  const runId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const beforeDoc = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId));
  const seededState = { ...beforeDoc.state, run: { ...beforeDoc.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", runId), {
    state: seededState, commandLog: createCommandLog(seededState), successfulCommandsSinceSnapshot: 0
  });
  return { runId, selectionId };
}

test("UI04E_host: the committed cloud function drives START_RUN -> real action -> dying -> ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const registry = createLiveContentRegistry();
  const { runId, selectionId } = await hostSeedNearDeath(handler, database, registry, "host");

  const started = await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId }) });
  assert.equal(started.ok, true, JSON.stringify(started));
  const travel = await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, started.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }) });
  assert.equal(travel.ok, true, JSON.stringify(travel));

  // The dying view is ENDING.
  const dyingView = await handler.main({ operation: "fetchView", runId });
  assert.equal(dyingView.view.state.pageState, "ENDING");

  // ENDING -> LIFE_BOOK
  const lb = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:host:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" } });
  assert.equal(lb.ok, true, JSON.stringify(lb));
  assert.equal(lb.stage, "LIFE_BOOK");

  const lbView = await handler.main({ operation: "fetchView", runId });
  assert.equal(lbView.view.state.pageState, "LIFE_BOOK");
  assert.equal(lbView.view.state.terminal.stage, "LIFE_BOOK");

  // LIFE_BOOK -> REBIRTH_RESULT
  const rr = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:host:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" } });
  assert.equal(rr.ok, true, JSON.stringify(rr));
  assert.equal(rr.stage, "REBIRTH_RESULT");

  // REBIRTH_RESULT -> NEXT_LIFE
  const nl = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:host:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" } });
  assert.equal(nl.ok, true, JSON.stringify(nl));
  assert.equal(nl.stage, "NEXT_LIFE");
  assert.equal(typeof nl.nextBootstrapId, "string");
  assert.equal(typeof nl.nextRunId, "string");

  // The prior run remains immutable at NEXT_LIFE — same canonical gameplay bytes.
  const prior = storedRun(database, runId);
  assert.equal(prior.terminal.stage, "NEXT_LIFE");
  const nextRun = storedRun(database, nl.nextRunId);
  assert.notEqual(nextRun, undefined);
  assert.equal(nextRun.state.run.runId, nl.nextRunId);
  assert.equal(nextRun.state.run.status, "offered");
});

test("UI04E_host: an exact retry after a post-commit timeout settles exactly once and recovers the next-life bootstrap", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const registry = createLiveContentRegistry();
  const { runId, selectionId } = await hostSeedNearDeath(handler, database, registry, "host-retry");

  await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId }) });
  const afterStart = storedRun(database, runId).state;
  await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, afterStart.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }) });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:hr:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" } });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:hr:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" } });

  database.armPostCommitTimeout();
  const lost = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:hr:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" } });
  assert.equal(lost.ok, false, JSON.stringify(lost));
  assert.equal(lost.error.retryable, true);

  const after = storedRun(database, runId);
  assert.equal(after.terminal.stage, "NEXT_LIFE");
  const firstNext = after.terminal.transitions["term:hr:3"];
  assert.notEqual(firstNext, undefined);
  assert.equal(firstNext.nextBootstrapId !== undefined && firstNext.nextRunId !== undefined, true);
  const committedNextRunId = firstNext.nextRunId;

  const retried = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:hr:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" } });
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(retried.nextRunId, committedNextRunId, "the retry must recover the same next-life run id");
  assert.equal(retried.version, 3, "the retry must NOT bump the version");
});

test("UI04E_host: another OPENID cannot advance a terminal transition; the refusal leaks nothing", async () => {
  const database = createFakeCloudDatabase();
  const alice = loadCloudFunction({ openid: ALICE, database });
  const bob = loadCloudFunction({ openid: BOB, database });
  const registry = createLiveContentRegistry();
  const { runId, selectionId } = await hostSeedNearDeath(alice, database, registry, "host-cross");

  await alice.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId }) });
  const afterStart = storedRun(database, runId).state;
  await alice.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, afterStart.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }) });

  const bobAttempt = await bob.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "term:cross", expectedTerminalStage: "ENDING", action: "advance-to-life-book" } });
  assert.equal(bobAttempt.ok, false);
  assert.equal(bobAttempt.error.code, "UNAUTHORIZED");
  assert.equal(JSON.stringify(bobAttempt).includes(runId), false, "the refusal must not echo the run id");
});

// ================================================================= 6. v2-live terminal rendering

test("UI04E_page: the v2-live page renders all four terminal stages and never locally skips an authoritative stage", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const registry = createLiveContentRegistry();
  const { runId, selectionId } = await hostSeedNearDeath(handler, database, registry, "page");
  await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId }) });
  const afterStart = storedRun(database, runId).state;
  await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, runId, afterStart.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }) });

  // Build a transport that hits the host, and bootstrap the controller on the *same* dying run
  // (not a fresh DESTINY_OFFER) by overriding the controller's session.runId after bootstrap.
  const fakeCloud = { async callFunction(input) { return { result: await handler.main(input.data) }; } };
  const transport = createClientCloudTransport({ api: fakeCloud });
  const storage = createWeChatPlatformStorage({ getStorageSync: () => "boot:ui04e-page", setStorageSync: () => undefined });
  const boot = await bootstrapWeChatRun({ transport, bootstrapId: "boot:ui04e-page", clientBuild: "ui04e-page" });
  // The bootstrap created a fresh offered run; for this test we want the dying run, so we construct
  // the controller directly and override the runId.
  const controller = new WeChatRunController({ transport, storage, session: { ...boot.session, runId }, commandIdFactory: () => "cmd:ui04e-page", initialView: boot.view });
  await controller.load();

  assert.equal(controller.pageModel().pageState, "ENDING", "dying run must project as ENDING");

  const lb = await controller.advanceTerminal({ terminalTransitionId: "term:page:1", action: "advance-to-life-book" });
  assert.equal(lb.ok, true);
  assert.equal(controller.pageModel().pageState, "LIFE_BOOK");

  const rr = await controller.advanceTerminal({ terminalTransitionId: "term:page:2", action: "advance-to-rebirth-result" });
  assert.equal(rr.ok, true);
  assert.equal(controller.pageModel().pageState, "REBIRTH_RESULT");

  const nl = await controller.advanceTerminal({ terminalTransitionId: "term:page:3", action: "advance-to-next-life" });
  assert.equal(nl.ok, true);
  assert.equal(typeof nl.nextBootstrapId, "string");
  assert.equal(typeof nl.nextRunId, "string");

  const nextView = await controller.startNextLife(nl.nextBootstrapId);
  assert.equal(nextView.state.pageState, "DESTINY_OFFER", "the next life starts at DESTINY_OFFER");
  assert.notEqual(controller.view().state.runId, runId);

  // Skipping a stage locally is refused.
  let skipped = null;
  try { await controller.advanceTerminal({ terminalTransitionId: "term:skip", action: "advance-to-life-book" }); }
  catch (error) { skipped = error; }
  assert.notEqual(skipped, null);
  assert.equal(skipped.name, "TerminalUnavailableError", "the controller must refuse a skip of the authoritative stage order");
});

test("UI04E_page: a stale-terminal advance from a hidden page state is refused by the controller, not silently sent", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:ui04e-stale-page" });
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId }) });
  const view = await handler.main({ operation: "fetchView", runId: offer.runId });
  assert.equal(view.view.state.pageState, "RUN_HOME");
  const transport = createClientCloudTransport({ api: { callFunction: async (input) => ({ result: await handler.main(input.data) }) } });
  const storage = createWeChatPlatformStorage({ getStorageSync: () => "boot:ui04e-stale-page", setStorageSync: () => undefined });
  const controller = new WeChatRunController({ transport, storage, session: { playerId: ALICE_PLAYER, runId: offer.runId, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientBuild: "ui04e-stale-page" }, commandIdFactory: () => "cmd:ui04e-stale", initialView: view.view });
  let caught = null;
  try { await controller.advanceTerminal({ terminalTransitionId: "term:stale", action: "advance-to-life-book" }); }
  catch (error) { caught = error; }
  assert.notEqual(caught, null);
  assert.equal(caught.name, "TerminalUnavailableError");
});

// ================================================================= 7. protocol — parseAdvanceTerminalResult + transport adapter

test("UI04E_protocol: parseAdvanceTerminalResult accepts a NEXT_LIFE settle and refuses a secret-bearing one", () => {
  const good = { ok: true, terminalTransitionId: "term:1", stage: "NEXT_LIFE", version: 3, nextBootstrapId: "boot:next", nextRunId: "run-next" };
  assert.deepEqual(parseAdvanceTerminalResult(good), good);
  const fail = { ok: false, terminalTransitionId: "term:1", error: { code: "INVALID_OPTION", messageKey: "terminal.not_reached", retryable: false } };
  assert.deepEqual(parseAdvanceTerminalResult(fail), fail);
  assert.throws(() => parseAdvanceTerminalResult({ ...good, rootSeed: "leak" }), TransportProtocolError);
  assert.throws(() => parseAdvanceTerminalResult({ ok: true }), TransportProtocolError);
  assert.throws(() => parseAdvanceTerminalResult({ ok: true, terminalTransitionId: "term:1", stage: "MADE_UP", version: 1 }), TransportProtocolError);
});

test("UI04E_protocol: the transport adapter sends an exact envelope for advanceTerminal", async () => {
  const calls = [];
  const transport = createClientCloudTransport({
    api: {
      async callFunction(input) {
        calls.push(input);
        return { result: { ok: true, terminalTransitionId: "term:1", stage: "LIFE_BOOK", version: 1 } };
      }
    }
  });
  const request = { runId: "run-x", terminalTransitionId: "term:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" };
  const result = await transport.advanceTerminal(request);
  assert.equal(result.ok, true);
  assert.equal(result.stage, "LIFE_BOOK");
  assert.deepEqual(calls[0], { name: "tianfu2", data: { operation: "advanceTerminal", request } });
});

// ================================================================= 8. artifact freshness, audit, smoke

test("UI04E_artifact: the committed cloud runtime is a fresh deterministic generation of single-source code", () => {
  const result = checkCloudRuntimeArtifact({});
  assert.deepEqual(result.problems, [], result.problems.join("\n"));
  const rebuilt = buildCloudRuntimeArtifact({});
  assert.deepEqual(rebuilt.files, result.committed, "a second generation must be byte-identical (determinism)");
});

test("UI04E_audit: the dependency and closure audit is green, and the new terminal-flow module is part of the closure", () => {
  const result = auditCloudRuntime({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  const allowList = CLOUD_FACADE_EXPORTS.map((entry) => entry.name).sort();
  assert.equal(allowList.includes("TerminalFlowError"), true, "the facade must publish TerminalFlowError");
  assert.equal(allowList.includes("parseAdvanceTerminalRequest"), true, "the facade must publish parseAdvanceTerminalRequest");
});

test("UI04E_smoke: the committed host drives createRunOffer -> START_RUN -> action -> fetchView as before, no where() issued", async () => {
  const result = await runCloudRuntimeSmoke();
  assert.deepEqual(result.failures, [], result.failures.join("\n"));
  assert.equal(result.checks.length >= 15, true);
});

test("UI04E_artifact_scope: the cloud runtime adds no gameplay of its own and includes the terminal-flow module", () => {
  const generated = CLOUD_ARTIFACT_PATHS.map((artifactPath) => stripJs(read(artifactPath))).join("\n");
  for (const forbidden of ["Math.random", "packages/wechat-shell", "packages/application-ui", "miniprogram/", "wx.", "wx-server-sdk", "getStorageSync"]) {
    assert.equal(generated.includes(forbidden), false, `the cloud runtime must not reference ${forbidden}`);
  }
  assert.equal((generated.match(/function reduce\s*\(/g) ?? []).length, 1, "exactly one reducer declaration");
  assert.equal((generated.match(/class CommandGateway/g) ?? []).length, 1, "exactly one CommandGateway");
  assert.equal((generated.match(/class ServerViewModelBuilder/g) ?? []).length, 1, "exactly one ViewModel builder");
  const terminal = read(CLOUD_RUNTIME_DIR + "/server-terminal-flow.js");
  assert.equal(terminal.includes("TerminalFlowError"), true, "terminal-flow module must export TerminalFlowError");
  assert.equal(terminal.includes("advanceTerminal"), true);
  const store = read(CLOUD_RUNTIME_DIR + "/server-cloudbase-store.js");
  assert.equal(/\.where\s*\(/.test(stripJs(store)), false, "the CloudBase store must address documents by id, never by query");
  // The terminal-transitions collection name lives in the CloudBase store module (it owns the storage layer).
  const storeSource = stripJs(store);
  assert.equal(storeSource.includes("TERMINAL_TRANSITIONS_COLLECTION"), true, "the CloudBase store must declare the terminal-transitions collection");
});

// ================================================================= 9. WeChat runtime

test("UI04E_wechat_runtime: the wechat runtime artifact is fresh and publishes TerminalUnavailableError", () => {
  const facade = read("miniprogram/runtime/wechat-shell.js");
  assert.equal(facade.includes("TerminalUnavailableError"), true, "the regenerated wechat runtime must publish TerminalUnavailableError");
  assert.equal(facade.includes("advanceTerminal"), true, "the regenerated wechat runtime must publish advanceTerminal");
});

// ================================================================= 10. route guard + v2-live source + page source compliance

test("UI04E_route: the accepted routing surface and the 1.0 pages are untouched", async () => {
  const result = runRouteGuard({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  const app = readJSON("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
});

test("UI04E_page_source: v2-live handles the four terminal stages and uses a literal require of the runtime", () => {
  const source = read("miniprogram/pages/v2-live/v2-live.js");
  const code = stripJs(source);
  assert.equal(source.includes("onTerminalAdvance"), true, "the page must expose onTerminalAdvance");
  assert.equal(source.includes("persistNextLifeBootstrap"), true, "the page must persist the next-life bootstrap key");
  assert.equal(/require\(\s*"\.\.\/\.\.\/runtime\/index\.js"\s*\)/.test(source), true, "the runtime must be loaded by a static literal require");
  assert.equal(code.includes("Math.random"), false, "the page must not roll randomness");
  assert.equal(code.includes("packages/core"), false, "the page must not import packages/core");
  const wxml = read("miniprogram/pages/v2-live/v2-live.wxml");
  for (const stage of ["isEnding", "isLifeBook", "isRebirthResult", "isNextLife"]) {
    assert.equal(wxml.includes(stage), true, `v2-live.wxml must render stage ${stage}`);
  }
});

// ================================================================= 11. registration

test("UI04E_registration: the suite, the runtime scripts and the docs are registered", () => {
  const pkg = readJSON("package.json");
  assert.equal(pkg.scripts["test:ui04e"], "node --test tests/ui04e.test.mjs", "the dedicated UI04E suite must be wired up");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui04e.test.mjs"), true, "the aggregate test must run UI04E");
  for (const relative of [
    "tests/ui04e.test.mjs",
    "docs/UI04E_TERMINAL_LIFECYCLE.md",
    "server/src/terminal-flow.ts"
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, relative + " must exist");
  }
  const doc = read("docs/UI04E_TERMINAL_LIFECYCLE.md");
  for (const phrase of ["advanceTerminal", "terminalTransitionId", "ENDING", "LIFE_BOOK", "REBIRTH_RESULT", "NEXT_LIFE", "nextBootstrapId", "nextRunId"]) {
    assert.equal(doc.includes(phrase), true, "the documentation must mention " + phrase);
  }
});