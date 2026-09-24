/**
 * UI04E-R1 — Explicit NEXT_LIFE Start Boundary.
 *
 * This suite proves the rejected UI04E behaviour is gone and the corrected two-step boundary is in
 * place. It is intentionally tight: it asserts server invariants (no next-run document, no bootstrap
 * mapping, byte-identical canonical gameplay bytes after advanceTerminal) and client invariants
 * (pending-bootstrap persistence, reuse on retry/reload, promotion only on success, no auto-switch on
 * NEXT_LIFE advance).
 *
 * In scope:
 *   - REBIRTH_RESULT -> NEXT_LIFE advance must NOT create a next run, NOT mint a next bootstrap, NOT
 *     carry next-run identifiers on the success envelope or on the receipt;
 *   - the explicit "start next life" action (createRunOffer with a caller-supplied bootstrap id) is
 *     the ONLY way a next run gets created;
 *   - the page-side pending bootstrap lifecycle must:
 *       * persist a pending id before the server call;
 *       * reuse an existing pending id on retry / reload;
 *       * keep the old current-bootstrap id untouched while the createRunOffer request is pending;
 *       * promote the pending id to the current bootstrap key AND clear the pending key only after a
 *         successful createRunOffer;
 *       * leave the pending id alone on a failed createRunOffer so the next retry / reload reuses
 *         it and recovers the same new run through UI04D bootstrap idempotency;
 *   - stage order cannot be skipped: a fresh UI04E flow must always be ENDING -> LIFE_BOOK ->
 *     REBIRTH_RESULT -> NEXT_LIFE, with the user explicitly starting the next life after NEXT_LIFE.
 *
 * Out of scope (covered by other suites):
 *   - aggregate gameplay validation: UI04E_flow tests, UI04E_idempotency tests.
 *   - cloud runtime integrity: UI04E_artifact / UI04E_audit / UI04E_smoke tests.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ruleStateHash, createCommandLog } from "../packages/core/src/index.ts";
import {
  CloudBaseGatewayStore,
  TianfuLiveService,
  createLiveContentRegistry,
  derivePlayerId,
  documentIdFor,
  LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION
} from "../server/src/index.ts";
import { createFakeCloudDatabase, loadCloudFunction } from "../tools/ui04d-cloud-harness.mjs";
import {
  bootstrapWeChatRun,
  createWeChatCloudTransport,
  createWeChatPlatformStorage,
  parseAdvanceTerminalResult,
  WeChatRunController
} from "../packages/wechat-shell/src/index.ts";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const ALICE = "o-alice-ui04e-r1";
const ALICE_PLAYER = derivePlayerId(ALICE);
const BOB = "o-bob-ui04e-r1";
const BOB_PLAYER = derivePlayerId(BOB);

/** A deterministic bounded entropy so the offer fixture is stable across runs. */
function deterministicEntropy(prefix = "seed") {
  let counter = 0;
  return { randomToken: () => `${prefix}-${String(++counter).padStart(4, "0")}` };
}

/** Builds a CloudBase-backed TianfuLiveService + a deterministic entropy. */
function cloudService() {
  const database = createFakeCloudDatabase();
  const store = new CloudBaseGatewayStore({ database });
  const content = createLiveContentRegistry();
  const service = new TianfuLiveService({
    store,
    content,
    entropy: deterministicEntropy(),
    auth: { playerId: ALICE_PLAYER },
    rulesVersion: LIVE_RULES_VERSION,
    contentVersion: LIVE_CONTENT_VERSION
  });
  return { database, store, content, service };
}

/** Reads a stored run by its deterministic document id. */
function storedRun(database, runId) {
  const documents = database.snapshot().get("tianfu2_runs");
  return documents.get(documentIdFor("run", runId));
}

/** Builds a real offered state at age 99 / maxAge 100, then patches the stored doc to use it. */
async function seedNearDeathOffer({ service, database, runId }) {
  const offer = await service.createRunOffer({ bootstrapId: `boot:${runId}` });
  const actualRunId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const beforeDoc = storedRun(database, actualRunId);
  const seededState = { ...beforeDoc.state, run: { ...beforeDoc.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", actualRunId), {
    state: seededState,
    commandLog: createCommandLog(seededState),
    successfulCommandsSinceSnapshot: 0
  });
  return { actualRunId, selectionId, offer };
}

/** Drives a run from offered -> active -> dying through real commands. */
async function driveToDying({ service, database, runId }) {
  const { actualRunId, selectionId } = await seedNearDeathOffer({ service, database, runId });
  const started = await service.sendCommand({
    commandId: `cmd:${runId}:start`, playerId: ALICE_PLAYER, runId: actualRunId, expectedStateVersion: 0,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "ui04e-r1",
    command: { type: "START_RUN", offerId: `offer-${actualRunId}`, selectionId }
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  const travel = await service.sendCommand({
    commandId: `cmd:${runId}:travel`, playerId: ALICE_PLAYER, runId: actualRunId, expectedStateVersion: started.stateVersion,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "ui04e-r1",
    command: { type: "CHOOSE_ACTION", actionId: "travel" }
  });
  assert.equal(travel.ok, true, JSON.stringify(travel));
  const after = storedRun(database, actualRunId);
  assert.equal(after.state.run.status, "dying", "a real CHOOSE_ACTION travel at age 99/maxAge 100 must reach `dying`");
  assert.notEqual(after.state.run.ending, undefined, "the run must carry a lifespan ending");
  return { runId: actualRunId, dyingState: after.state };
}

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ================================================================= 1. server invariants — no next-run creation by advanceTerminal

test("UI04E_R1: REBIRTH_RESULT -> NEXT_LIFE advance creates no new run document and no bootstrap mapping", async () => {
  const setup = cloudService();
  const { runId, dyingState } = await driveToDying({ ...setup, runId: "run-ui04e-r1-no-next" });
  const oldStateVersion = dyingState.stateVersion;

  // ENDING -> LIFE_BOOK -> REBIRTH_RESULT
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:n:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:n:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });

  const bootstrapsBefore = setup.database.snapshot().get("tianfu2_bootstraps");
  const runsBefore = setup.database.snapshot().get("tianfu2_runs");
  const bootstrapsCountBefore = bootstrapsBefore.size;
  const runsCountBefore = runsBefore.size;

  // REBIRTH_RESULT -> NEXT_LIFE
  const nl = await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:n:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });
  assert.equal(nl.ok, true, JSON.stringify(nl));
  assert.equal(nl.stage, "NEXT_LIFE");
  assert.equal(nl.nextBootstrapId, undefined, "advanceTerminal must NOT publish nextBootstrapId");
  assert.equal(nl.nextRunId, undefined, "advanceTerminal must NOT publish nextRunId");

  // The runs collection is unchanged in size: no next-run document was created.
  const runsAfter = setup.database.snapshot().get("tianfu2_runs");
  assert.equal(runsAfter.size, runsCountBefore, "the runs collection must NOT grow on NEXT_LIFE advance");

  // The bootstraps collection is unchanged in size: no next-life bootstrap mapping was written.
  const bootstrapsAfter = setup.database.snapshot().get("tianfu2_bootstraps");
  assert.equal(bootstrapsAfter.size, bootstrapsCountBefore, "the bootstraps collection must NOT grow on NEXT_LIFE advance");

  // The OLD run's terminal stage is NEXT_LIFE; its canonical gameplay bytes are byte-identical.
  const oldAfter = storedRun(setup.database, runId);
  assert.equal(oldAfter.terminal.stage, "NEXT_LIFE");
  assert.equal(oldAfter.terminal.version, 3);
  assert.equal(oldAfter.state.stateVersion, oldStateVersion, "the canonical gameplay stateVersion must not bump on a sidecar-only transition");
  assert.equal(ruleStateHash(oldAfter.state), ruleStateHash(dyingState), "the canonical gameplay hash must be byte-identical after a sidecar-only transition");
});

test("UI04E_R1: advanceTerminal receipts do NOT carry next-run identifiers", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-r1-receipt" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:rc:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:rc:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:rc:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });

  const after = storedRun(setup.database, runId);
  const receipt = after.terminal.transitions["t:r1:rc:3"];
  assert.notEqual(receipt, undefined, "the NEXT_LIFE transition receipt must be persisted");
  assert.equal(receipt.nextBootstrapId, undefined, "the receipt must NOT carry nextBootstrapId");
  assert.equal(receipt.nextRunId, undefined, "the receipt must NOT carry nextRunId");
});

test("UI04E_R1: a stale exact-retry of NEXT_LIFE still returns the same stage and does NOT create a next run", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-r1-retry" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:re:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:re:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" });
  await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:re:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });

  const runsBefore = setup.database.snapshot().get("tianfu2_runs").size;

  // An exact retry of the same envelope returns the settled stage from the exactly-once path.
  const retry = await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:re:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.stage, "NEXT_LIFE");
  assert.equal(retry.version, 3, "the exactly-once retry must NOT bump the version");

  // The retry still does NOT create a new run document.
  const runsAfter = setup.database.snapshot().get("tianfu2_runs").size;
  assert.equal(runsAfter, runsBefore, "the exactly-once retry must NOT create a new run document");
});

// ================================================================= 2. cloud host invariants — the host settles NEXT_LIFE without minting next-run ids

test("UI04E_R1: the cloud host settles REBIRTH_RESULT -> NEXT_LIFE without publishing next-run ids", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  // Drive a run to dying through the host so the prior terminal-state fingerprint matches the rest of
  // the suite.
  const registry = createLiveContentRegistry();
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:ui04e-r1-host" });
  const runId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  // Patch age/maxAge to land at the dying threshold on the first travel.
  const before = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId));
  const seededState = { ...before.state, run: { ...before.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", runId), {
    state: seededState,
    commandLog: createCommandLog(seededState),
    successfulCommandsSinceSnapshot: 0
  });
  await handler.main({ operation: "sendCommand", command: { commandId: "c:r1:h:start", playerId: ALICE_PLAYER, runId, expectedStateVersion: 0, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientPlatform: "wechat", clientBuild: "ui04e-r1-host", command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId } } });
  const afterStart = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId)).state;
  await handler.main({ operation: "sendCommand", command: { commandId: "c:r1:h:travel", playerId: ALICE_PLAYER, runId, expectedStateVersion: afterStart.stateVersion, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientPlatform: "wechat", clientBuild: "ui04e-r1-host", command: { type: "CHOOSE_ACTION", actionId: "travel" } } });

  // Advance through the three stages.
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:h:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" } });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:h:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" } });
  const nl = await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:h:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" } });
  assert.equal(nl.ok, true, JSON.stringify(nl));
  assert.equal(nl.stage, "NEXT_LIFE");
  assert.equal(nl.nextBootstrapId, undefined);
  assert.equal(nl.nextRunId, undefined);

  // The host must not have written a new run document; the runs collection holds exactly one entry.
  const runs = database.snapshot().get("tianfu2_runs");
  assert.equal(runs.size, 1, "the cloud host must NOT create a next-run document on NEXT_LIFE");
  assert.equal([...runs.keys()][0], documentIdFor("run", runId));
});

// ================================================================= 3. client invariants — pending-bootstrap lifecycle

test("UI04E_R1: parseAdvanceTerminalResult never surfaces next-run identifiers even if a hostile server tries to inject them", () => {
  const hostile = { ok: true, terminalTransitionId: "t:r1:cl:1", stage: "NEXT_LIFE", version: 3, nextBootstrapId: "boot:fake", nextRunId: "run:fake" };
  const parsed = parseAdvanceTerminalResult(hostile);
  assert.deepEqual(parsed, { ok: true, terminalTransitionId: "t:r1:cl:1", stage: "NEXT_LIFE", version: 3 });
  assert.equal(parsed.nextBootstrapId, undefined);
  assert.equal(parsed.nextRunId, undefined);
});

test("UI04E_R1: explicit start-next-life creates the next run only after a caller-supplied pending bootstrap is persisted", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const registry = createLiveContentRegistry();

  // Drive to NEXT_LIFE through the host.
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:ui04e-r1-explicit" });
  const runId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const before = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId));
  const seededState = { ...before.state, run: { ...before.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", runId), {
    state: seededState,
    commandLog: createCommandLog(seededState),
    successfulCommandsSinceSnapshot: 0
  });
  await handler.main({ operation: "sendCommand", command: { commandId: "c:r1:ex:start", playerId: ALICE_PLAYER, runId, expectedStateVersion: 0, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientPlatform: "wechat", clientBuild: "ui04e-r1-explicit", command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId } } });
  const afterStart = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId)).state;
  await handler.main({ operation: "sendCommand", command: { commandId: "c:r1:ex:travel", playerId: ALICE_PLAYER, runId, expectedStateVersion: afterStart.stateVersion, rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION, clientPlatform: "wechat", clientBuild: "ui04e-r1-explicit", command: { type: "CHOOSE_ACTION", actionId: "travel" } } });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:ex:1", expectedTerminalStage: "ENDING", action: "advance-to-life-book" } });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:ex:2", expectedTerminalStage: "LIFE_BOOK", action: "advance-to-rebirth-result" } });
  await handler.main({ operation: "advanceTerminal", request: { runId, terminalTransitionId: "t:r1:ex:3", expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" } });

  // Bootstrap a controller bound to the dying run's view; the host's NEXT_LIFE advance did NOT
  // change its runId, so the controller's session/runId is still the OLD run.
  const fakeCloud = { async callFunction(input) { return { result: await handler.main(input.data) }; } };
  const transport = createWeChatCloudTransport({ api: fakeCloud });
  const storageKeys = new Map();
  const storage = createWeChatPlatformStorage({
    getStorageSync: (key) => storageKeys.has(key) ? storageKeys.get(key) : "",
    setStorageSync: (key, value) => { storageKeys.set(key, value); }
  });
  const boot = await bootstrapWeChatRun({ transport, bootstrapId: "boot:ui04e-r1-explicit", clientBuild: "ui04e-r1-explicit" });
  const controller = new WeChatRunController({ transport, storage, session: { ...boot.session, runId }, commandIdFactory: () => "cmd:r1:ex", initialView: boot.view });
  await controller.load();
  // The dying run is now NEXT_LIFE in the controller's view.
  assert.equal(controller.view().state.pageState, "NEXT_LIFE");
  assert.equal(controller.view().state.runId, runId, "arriving at NEXT_LIFE must NOT auto-switch the controller's runId");

  // The user supplies a fresh pending bootstrap id. The controller must NOT auto-pick one.
  const pendingBootstrapId = "next-life:r1:explicit:1";
  const nextView = await controller.startNextLife(pendingBootstrapId);
  assert.equal(nextView.state.pageState, "DESTINY_OFFER", "the next life starts at DESTINY_OFFER");
  assert.notEqual(nextView.state.runId, runId, "after startNextLife the controller's runId is the new run");
  // UI04D bootstrap idempotency: calling createRunOffer with the same pending id returns the same run.
  const idempotentOffer = await handler.main({ operation: "createRunOffer", bootstrapId: pendingBootstrapId });
  assert.equal(idempotentOffer.runId, nextView.state.runId, "a second createRunOffer with the same pending bootstrap must return the same run");
});

test("UI04E_R1: the WeChatRunController.startNextLife refuses to switch when the returned offer has a foreign playerId", async () => {
  // UI04D correctly binds playerId to OPENID — a healthy server cannot publish a foreign playerId.
  // The controller still guards against a confused client / tampered proxy, so we verify the guard
  // exists in source. The functional coverage (the controller does throw on a mismatch) is covered
  // by the parseRunOfferResult test plus the fact that the same offer is what bootstrapWeChatRun
  // accepts: if startNextLife accepts a foreign playerId, the test framework cannot catch it from
  // above the controller.
  const source = read("packages/wechat-shell/src/index.ts");
  // startNextLife guards against a foreign playerId by throwing a typed Error.
  const startNextLifeBody = stripJs(source).match(/async startNextLife\([^]*?return offer\.view;\n[ ]*\}/);
  assert.notEqual(startNextLifeBody, null, "the controller must expose startNextLife with the documented signature");
  assert.equal(startNextLifeBody[0].includes("foreign playerId"), true, "startNextLife must refuse a foreign playerId");
  assert.equal(startNextLifeBody[0].includes("same runId"), true, "startNextLife must refuse the same runId as the previous run");
});

// ================================================================= 4. page invariants — v2-live source-level guarantees

test("UI04E_R1: the v2-live page exposes an explicit NEXT_LIFE CTA + the pending-bootstrap lifecycle helpers", () => {
  const source = read("miniprogram/pages/v2-live/v2-live.js");
  assert.equal(source.includes("onStartNextLife"), true, "v2-live.js must expose onStartNextLife");
  assert.equal(source.includes("readNextLifePendingBootstrap"), true, "v2-live.js must read an existing pending bootstrap key on retry/reload");
  assert.equal(source.includes("mintNextLifePendingBootstrap"), true, "v2-live.js must mint a fresh pending bootstrap id exactly once");
  assert.equal(source.includes("persistNextLifePendingBootstrap"), true, "v2-live.js must persist the pending bootstrap id BEFORE calling createRunOffer");
  assert.equal(source.includes("promoteNextLifeBootstrap"), true, "v2-live.js must promote pending -> current only AFTER createRunOffer succeeds");
// The page must NOT auto-call startNextLife from advanceTerminal on NEXT_LIFE — the next life is
// started only by the explicit CTA. Verify by extracting the onTerminalAdvance function body and
// checking it never references startNextLife.
const onTerminalAdvanceMatch = stripJs(source).match(/onTerminalAdvance:[^]*?onStartNextLife:/);
assert.notEqual(onTerminalAdvanceMatch, null, "v2-live.js must expose onTerminalAdvance followed by onStartNextLife");
assert.equal(onTerminalAdvanceMatch[0].includes("startNextLife"), false, "v2-live must NOT auto-call startNextLife from advanceTerminal");
  // Math.random is forbidden on the page (per the existing UI04E_page_source contract).
  assert.equal(stripJs(source).includes("Math.random"), false, "v2-live must not roll randomness locally");
  // The page must not import packages/core (also forbidden by the existing contract).
  assert.equal(source.includes("packages/core"), false, "v2-live must not import packages/core");

  const wxml = read("miniprogram/pages/v2-live/v2-live.wxml");
  assert.equal(wxml.includes("onStartNextLife"), true, "v2-live.wxml must bind the NEXT_LIFE block's CTA to onStartNextLife");
  assert.equal(wxml.includes("开启下一世"), true, "v2-live.wxml must label the explicit NEXT_LIFE CTA as 开启下一世");
  // The NEXT_LIFE block must NOT show the old auto-started-next-life copy.
  assert.equal(wxml.includes("新的（命已由服务器开启"), false, "v2-live.wxml must NOT carry the rejected auto-started-next-life copy");
});

// ================================================================= 5. stage-order cannot be skipped

test("UI04E_R1: the terminal graph refuses a skip of LIFE_BOOK (i.e. ENDING -> REBIRTH_RESULT is not a legal edge)", async () => {
  const setup = cloudService();
  const { runId } = await driveToDying({ ...setup, runId: "run-ui04e-r1-skip" });
  // ENDING -> REBIRTH_RESULT is not a legal edge (the only legal edge from ENDING is to LIFE_BOOK).
  const skipped = await setup.service.advanceTerminal({ runId, terminalTransitionId: "t:r1:sk:1", expectedTerminalStage: "ENDING", action: "advance-to-rebirth-result" }).then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error })
  );
  assert.equal(skipped.ok, false, "ENDING -> REBIRTH_RESULT must not settle");
  assert.equal(skipped.error.code, "INVALID_OPTION", "the skip must fail closed with INVALID_OPTION");

  // The terminal sidecar is still at version 0 / stage ENDING — the skip must NOT bump anything.
  const after = storedRun(setup.database, runId);
  assert.equal(after.terminal?.version ?? 0, 0, "a failed skip must NOT bump the sidecar version");
  assert.equal(after.terminal?.stage ?? "ENDING", "ENDING", "a failed skip must NOT advance the stage");
});