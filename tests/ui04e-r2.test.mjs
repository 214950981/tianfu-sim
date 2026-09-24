/**
 * UI04E-R2 — Response-Loss Reload Proof.
 *
 * UI04E-R1 separated "arriving at NEXT_LIFE" from "starting the next life" and added a persisted
 * pending-bootstrap id. R1 only proved that a *second* `createRunOffer` with the same bootstrap id
 * returns the same run; it never proved the failure mode that id exists for. This suite closes that
 * gap behaviourally:
 *
 *   1. a real old run sits at the authoritative NEXT_LIFE stage, and local storage holds only the old
 *      current bootstrap key (no pending key);
 *   2. the real `miniprogram/pages/v2-live` page presses "开启下一世". It persists ONE pending
 *      bootstrap id BEFORE calling `createRunOffer`;
 *   3. the real cloud host handler COMMITS that `createRunOffer` (the new run + the bootstrap mapping
 *      are in the database) and then the transport LOSES the response before the page sees success;
 *   4. after the lost response: current bootstrap is still the old key, the pending key is still
 *      there, and the database holds exactly old + one new run;
 *   5. a page reload with the SAME local storage and the SAME database returns to the old terminal run
 *      at NEXT_LIFE — because the current bootstrap was never promoted;
 *   6. the second explicit CTA reuses the exact same pending id and RECOVERS the already-created new
 *      run instead of creating a second one;
 *   7. success promotes pending -> current, clears the pending key, and renders the new DESTINY_OFFER
 *      under the same authoritative playerId.
 *
 * Nothing here inspects source strings: every assertion is made against the real page object, the real
 * cloud handler, the real fake CloudBase database and the real local-storage map.
 *
 * CURRENT RESULT (UI04E_R2, status BLOCKED — see .codex/control/LAST_RESULT.yaml)
 *
 * The suite is red at step 1 and it is red for a real reason, not for a harness artefact:
 * `TianfuLiveService.createRunOffer` returns `builder.build(state)` and never hands the run's terminal
 * sidecar to the projection, so bootstrapping onto an existing terminal run projects `pageState:
 * "ENDING"` with `state.terminal === undefined` — while `fetchView` on the SAME run projects
 * `NEXT_LIFE` with the full sidecar. The v2-live page bootstraps through `createRunOffer` and then
 * calls `controller.restore()`, which does not re-fetch when an initial view is present, so a reload
 * on a NEXT_LIFE run lands on ENDING and the "开启下一世" CTA is unreachable (and the server then
 * rejects every advance, because the authoritative sidecar stage is NEXT_LIFE, not ENDING).
 *
 * The rest of the chain was proven green against the same tree with one explicit
 * `controller.load()` inserted after each bootstrap (that is the ONLY difference): pending persisted
 * before the call, lost response leaving current-bootstrap old / pending durable / exactly two runs,
 * reload recovering the old NEXT_LIFE run, retry reusing the same pending id and recovering the same
 * new run, and success promoting + clearing + rendering DESTINY_OFFER under the same playerId.
 * So the pending-bootstrap lifecycle of UI04E-R1 is sound; the single defect is the missing terminal
 * projection on the createRunOffer bootstrap path.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import {
  bootstrapKeyFor,
  CloudBaseGatewayStore,
  createLiveContentRegistry,
  derivePlayerId,
  documentIdFor,
  LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION,
  TianfuLiveService
} from "../server/src/index.ts";
import { createFakeCloudDatabase, loadCloudFunction } from "../tools/ui04d-cloud-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const PAGE_PATH = path.join(ROOT, "miniprogram/pages/v2-live/v2-live.js");

/** The two local-storage keys the page owns. Kept in sync with v2-live.js by name, not by parsing. */
const BOOTSTRAP_KEY = "tianfu2:bootstrap-id";
const PENDING_KEY = "tianfu2:next-life-bootstrap-id";

const ALICE = "o-alice-ui04e-r2";
const ALICE_PLAYER = derivePlayerId(ALICE);

// ================================================================= fixtures

/** Drives one real run through the host to the authoritative NEXT_LIFE stage. */
async function driveToNextLife({ handler, database, bootstrapId }) {
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId });
  const runId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;

  // Patch age/maxAge so the first travel reaches the lifespan ending for real.
  const before = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId));
  const seededState = { ...before.state, run: { ...before.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", runId), {
    state: seededState,
    commandLog: createCommandLog(seededState),
    successfulCommandsSinceSnapshot: 0
  });

  await handler.main({
    operation: "sendCommand",
    command: {
      commandId: "c:r2:start", playerId: ALICE_PLAYER, runId, expectedStateVersion: 0,
      rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
      clientPlatform: "wechat", clientBuild: "ui04e-r2",
      command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId }
    }
  });
  const afterStart = database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId)).state;
  await handler.main({
    operation: "sendCommand",
    command: {
      commandId: "c:r2:travel", playerId: ALICE_PLAYER, runId, expectedStateVersion: afterStart.stateVersion,
      rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
      clientPlatform: "wechat", clientBuild: "ui04e-r2",
      command: { type: "CHOOSE_ACTION", actionId: "travel" }
    }
  });

  const edges = [
    ["ENDING", "advance-to-life-book"],
    ["LIFE_BOOK", "advance-to-rebirth-result"],
    ["REBIRTH_RESULT", "advance-to-next-life"]
  ];
  let index = 0;
  for (const [expectedTerminalStage, action] of edges) {
    index += 1;
    const settled = await handler.main({
      operation: "advanceTerminal",
      request: { runId, terminalTransitionId: `t:r2:setup:${index}`, expectedTerminalStage, action }
    });
    assert.equal(settled.ok, true, JSON.stringify(settled));
  }
  return { runId };
}

/**
 * The transport seam between the page realm and the cloud host.
 *
 * Every request is JSON-round-tripped into the host realm (and every response back out), which is how
 * the runbook models the platform boundary. `state.lose` lets a test drop the response *after* the
 * host has already committed, which is exactly the "server created the run, the client never heard
 * about it" failure the pending-bootstrap id exists for.
 */
function createSeam(handler) {
  const state = { calls: [], lost: [], lose: null };
  const callFunction = async (input) => {
    const data = JSON.parse(JSON.stringify(input.data ?? {}));
    state.calls.push(data);
    const result = await handler.main(data);
    if (typeof state.lose === "function" && state.lose(data) === true) {
      state.lost.push({ bootstrapId: data.bootstrapId, runId: result.runId, playerId: result.playerId });
      throw new Error("cloud transport lost the response after the server committed");
    }
    return { result: JSON.parse(JSON.stringify(result)) };
  };
  return { state, callFunction };
}

/** Loads the committed page the way WeChat loads it: CommonJS, own realm, `Page` + `wx` from the host. */
function loadLivePage({ callFunction, store }) {
  const context = vm.createContext({});
  let definition = null;
  context.Page = (value) => { definition = value; };
  context.wx = {
    cloud: { callFunction },
    getStorageSync: (key) => (store.has(key) ? store.get(key) : ""),
    setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: (key) => store.delete(key)
  };

  const cache = new Map();
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute);
    const object = { exports: {} };
    cache.set(absolute, object.exports);
    const filename = path.relative(ROOT, absolute).replace(/\\/g, "/");
    const wrapper = vm.runInContext(`(function (exports, module, require) {\n${fs.readFileSync(absolute, "utf8")}\n})`, context, { filename });
    wrapper(object.exports, object, (specifier) => {
      if (typeof specifier !== "string" || !/^\.\.?\//.test(specifier)) throw new Error("non-relative specifier: " + String(specifier));
      const resolved = path.resolve(path.dirname(absolute), specifier);
      if (!resolved.startsWith(path.join(ROOT, "miniprogram") + path.sep)) throw new Error("specifier escapes miniprogramRoot: " + specifier);
      return load(resolved);
    });
    cache.set(absolute, object.exports);
    return object.exports;
  };
  load(PAGE_PATH);
  if (definition === null) throw new Error("the page module did not call Page()");

  const page = { data: { ...definition.data }, ...definition };
  page.setData = (patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes(".")) {
        const [head, tail] = key.split(".");
        if (page.data[head] === null || page.data[head] === undefined) page.data[head] = {};
        page.data[head][tail] = value;
      } else page.data[key] = value;
    }
  };
  return { page, definition };
}

/** Flushes the page's promise chains until `predicate` holds (or the tick budget is spent). */
async function waitFor(predicate, ticks = 200) {
  for (let index = 0; index < ticks; index += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return predicate();
}

const runIds = (database) => database.snapshot().get("tianfu2_runs");
/** The bootstrap mapping is keyed by the derived (playerId, bootstrapId) key, not by the raw id. */
const bootstrapRecord = (database, bootstrapId) =>
  database.snapshot().get("tianfu2_bootstraps").get(documentIdFor("bootstrap", bootstrapKeyFor(ALICE_PLAYER, bootstrapId)));

// ================================================================= the proof

test("UI04E_R2: a lost createRunOffer response keeps the old run authoritative, and a reload recovers the same new run through the same pending bootstrap", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const OLD_BOOTSTRAP = "boot:ui04e-r2:old";

  const { runId: oldRunId } = await driveToNextLife({ handler, database, bootstrapId: OLD_BOOTSTRAP });
  assert.equal(runIds(database).size, 1, "the host starts with exactly one run document");

  // Local storage: the old current bootstrap only. No pending key yet.
  const store = new Map([[BOOTSTRAP_KEY, OLD_BOOTSTRAP]]);
  const seam = createSeam(handler);

  // ---- 1. the page boots back into the OLD terminal run at NEXT_LIFE
  const first = loadLivePage({ callFunction: seam.callFunction, store });
  first.page.onLoad();
  assert.equal(await waitFor(() => first.page.data.stage === "ready" || first.page.data.stage === "error"), true, JSON.stringify(first.page.data));
  assert.equal(first.page.data.stage, "ready", JSON.stringify(first.page.data.failure));
  assert.equal(first.page.data.vm.pageState, "NEXT_LIFE", "the old terminal run must render NEXT_LIFE");
  assert.equal(first.page.controller.view().state.runId, oldRunId);
  assert.equal(first.page.controller.view().state.terminal.stage, "NEXT_LIFE");
  assert.equal(store.get(PENDING_KEY), undefined, "no pending bootstrap exists before the first CTA");

  // ---- 2. arm the response loss for the NEXT-LIFE bootstrap only (never for the old bootstrap)
  seam.state.lose = (data) => data.operation === "createRunOffer" && typeof data.bootstrapId === "string" && data.bootstrapId !== OLD_BOOTSTRAP;

  // ---- 3. the explicit CTA persists ONE pending id BEFORE the server call
  first.page.onStartNextLife();
  const pendingId = store.get(PENDING_KEY);
  assert.equal(typeof pendingId, "string", "the CTA must persist a pending bootstrap before calling createRunOffer");
  assert.notEqual(pendingId.length, 0);
  assert.equal(store.get(BOOTSTRAP_KEY), OLD_BOOTSTRAP, "the current bootstrap must stay on the old run until success");

  // ---- 4. the host committed, the response was lost
  assert.equal(await waitFor(() => seam.state.lost.length === 1), true, "the host must have committed exactly one next-life run before the response was lost");
  await waitFor(() => first.page.data.vm !== null && first.page.data.vm.banner !== null);
  const lostRunId = seam.state.lost[0].runId;
  assert.equal(seam.state.lost[0].bootstrapId, pendingId, "the committed run must be bound to the pending bootstrap id");
  assert.notEqual(lostRunId, oldRunId, "the committed run is a NEW run");
  assert.equal(seam.state.lost[0].playerId, ALICE_PLAYER, "the new run is owned by the same authoritative player");

  // ---- 5. after the lost response: current bootstrap unchanged, pending durable, exactly two runs
  assert.equal(store.get(BOOTSTRAP_KEY), OLD_BOOTSTRAP, "a lost response must NOT promote the current bootstrap");
  assert.equal(store.get(PENDING_KEY), pendingId, "a lost response must NOT clear the pending bootstrap");
  assert.equal(runIds(database).size, 2, "the database holds exactly the old run plus the one new run the host committed");
  assert.equal(first.page.data.vm.pageState, "NEXT_LIFE", "the page must still render the old terminal run");
  assert.equal(first.page.controller.view().state.runId, oldRunId, "the controller must not switch runs on a lost response");
  assert.notEqual(first.page.data.vm.banner, null, "the page must surface the failure instead of silently starting a life");

  // ---- 6. reload with the SAME storage and the SAME database: back to the old NEXT_LIFE run
  const second = loadLivePage({ callFunction: seam.callFunction, store });
  second.page.onLoad();
  assert.equal(await waitFor(() => second.page.data.stage === "ready" || second.page.data.stage === "error"), true, JSON.stringify(second.page.data));
  assert.equal(second.page.data.stage, "ready", JSON.stringify(second.page.data.failure));
  assert.equal(second.page.data.vm.pageState, "NEXT_LIFE", "the reload must recover the OLD terminal run because the current bootstrap was never promoted");
  assert.equal(second.page.controller.view().state.runId, oldRunId);
  assert.equal(second.page.controller.view().state.terminal.stage, "NEXT_LIFE");
  assert.equal(runIds(database).size, 2, "the reload must not create a run");

  // ---- 7. the retry reuses the SAME pending id and RECOVERS the already-created run
  seam.state.lose = null;
  second.page.onStartNextLife();
  assert.equal(store.get(PENDING_KEY), pendingId, "the retry must reuse the existing pending bootstrap, not mint a new one");

  assert.equal(await waitFor(() => store.get(BOOTSTRAP_KEY) === pendingId), true, "a successful start-next-life must promote the pending id to the current bootstrap");
  await waitFor(() => second.page.data.vm !== null && second.page.data.vm.pageState === "DESTINY_OFFER");

  const newRunId = second.page.controller.view().state.runId;
  assert.equal(newRunId, lostRunId, "the retry must RECOVER the already-created run, not create another");
  assert.notEqual(newRunId, oldRunId);
  assert.equal(runIds(database).size, 2, "the database must never hold more than the old run plus one new run");
  assert.equal(store.get(PENDING_KEY), undefined, "success must clear the pending key");

  // ---- 8. the rendered view and the authoritative owner
  assert.equal(second.page.data.vm.pageState, "DESTINY_OFFER", "the recovered next life renders DESTINY_OFFER");
  assert.equal(second.page.data.vm.isOffer, true);
  const pendingRecord = bootstrapRecord(database, pendingId);
  const oldRecord = bootstrapRecord(database, OLD_BOOTSTRAP);
  assert.notEqual(pendingRecord, undefined, "the pending bootstrap mapping must be durable");
  assert.equal(pendingRecord.runId, newRunId);
  assert.equal(pendingRecord.playerId, ALICE_PLAYER, "the authoritative playerId is unchanged across lives");
  assert.equal(oldRecord.playerId, pendingRecord.playerId, "both lives belong to the same authoritative player");

  // ---- 9. the pending id was sent exactly twice (the lost attempt + the recovery), never a third id
  const pendingCalls = seam.state.calls.filter((call) => call.operation === "createRunOffer" && call.bootstrapId === pendingId);
  assert.equal(pendingCalls.length, 2, "the same pending bootstrap id must be reused across the lost attempt and the recovery");
  assert.equal(seam.state.calls.filter((call) => call.operation === "createRunOffer" && call.bootstrapId !== pendingId && call.bootstrapId !== OLD_BOOTSTRAP).length, 0, "no other next-life bootstrap id may ever be minted");
});

// ================================================================= service-level projection + immutability

/** A real TianfuLiveService over the fake CloudBase database, so both endpoints share one store. */
function cloudLiveService() {
  const database = createFakeCloudDatabase();
  const store = new CloudBaseGatewayStore({ database });
  const content = createLiveContentRegistry();
  let counter = 0;
  const service = new TianfuLiveService({
    store,
    content,
    entropy: { randomToken: () => `seed-r2-${String(++counter).padStart(4, "0")}` },
    auth: { playerId: ALICE_PLAYER },
    rulesVersion: LIVE_RULES_VERSION,
    contentVersion: LIVE_CONTENT_VERSION
  });
  return { database, service };
}

const storedRunDoc = (database, runId) => database.snapshot().get("tianfu2_runs").get(documentIdFor("run", runId));

/** Drives one real offered run to the authoritative end-of-life (`dying`) status through real commands. */
async function driveToEndOfLife({ database, service, bootstrapId }) {
  const offer = await service.createRunOffer({ bootstrapId });
  const runId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const before = storedRunDoc(database, runId);
  const seeded = { ...before.state, run: { ...before.state.run, age: 99, maxAge: 100 } };
  database.seedDoc("tianfu2_runs", documentIdFor("run", runId), {
    state: seeded,
    commandLog: createCommandLog(seeded),
    successfulCommandsSinceSnapshot: 0
  });
  const started = await service.sendCommand({
    commandId: `c:r2:proj:start`, playerId: ALICE_PLAYER, runId, expectedStateVersion: 0,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "ui04e-r2",
    command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId }
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  const travelled = await service.sendCommand({
    commandId: `c:r2:proj:travel`, playerId: ALICE_PLAYER, runId, expectedStateVersion: started.stateVersion,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "ui04e-r2",
    command: { type: "CHOOSE_ACTION", actionId: "travel" }
  });
  assert.equal(travelled.ok, true, JSON.stringify(travelled));
  assert.equal(storedRunDoc(database, runId).state.run.status, "dying", "the run must reach end-of-life for real");
  return { runId };
}

/**
 * UI04FINAL acceptance: the bootstrap-recovery response and `fetchView` must project the SAME
 * terminal-aware PublicViewModel for the same stored run. Returning a bare `GameState` from
 * `createRunOffer` dropped `StoredRun.terminal`, so a reload onto a NEXT_LIFE run rendered ENDING.
 */
test("UI04E_R2: createRunOffer recovery and fetchView project the same terminal-aware PublicViewModel for the same stored run", async () => {
  const { database, service } = cloudLiveService();
  const BOOT = "boot:ui04e-r2:projection";
  const { runId } = await driveToEndOfLife({ database, service, bootstrapId: BOOT });

  const edges = [
    ["ENDING", "advance-to-life-book", "LIFE_BOOK"],
    ["LIFE_BOOK", "advance-to-rebirth-result", "REBIRTH_RESULT"],
    ["REBIRTH_RESULT", "advance-to-next-life", "NEXT_LIFE"]
  ];

  let index = 0;
  for (const [stage, action, nextStage] of edges) {
    const recovered = await service.createRunOffer({ bootstrapId: BOOT });
    const fetched = await service.fetchView(runId);

    assert.equal(recovered.runId, runId, `recovery at ${stage} must return the SAME run, not a new life`);
    assert.equal(recovered.view.state.pageState, stage, `the recovered view must project ${stage}`);
    assert.deepEqual(
      recovered.view,
      fetched,
      `createRunOffer recovery and fetchView must project the same PublicViewModel at ${stage}`
    );
    // The terminal sidecar is created by the first transition, so ENDING legitimately has none yet.
    if (stage === "ENDING") {
      assert.equal(recovered.view.state.terminal, undefined);
    } else {
      assert.equal(recovered.view.state.terminal.stage, stage, `the recovered view must carry the ${stage} sidecar`);
      assert.equal(fetched.state.terminal.stage, stage);
    }

    index += 1;
    const settled = await service.advanceTerminal({
      runId, terminalTransitionId: `t:r2:projection:${index}`, expectedTerminalStage: stage, action
    });
    assert.equal(settled.ok, true, JSON.stringify(settled));
    assert.equal(settled.stage, nextStage);
  }

  // The final NEXT_LIFE stage is the one the page reloads into, so it gets its own explicit check.
  const recovered = await service.createRunOffer({ bootstrapId: BOOT });
  const fetched = await service.fetchView(runId);
  assert.equal(recovered.view.state.pageState, "NEXT_LIFE");
  assert.equal(recovered.view.state.terminal.stage, "NEXT_LIFE");
  assert.deepEqual(recovered.view, fetched, "NEXT_LIFE recovery must equal fetchView byte for byte");
});

/**
 * UI04FINAL acceptance: starting the next life must leave the prior run's canonical gameplay bytes
 * untouched and keep it parked at the NEXT_LIFE terminal stage (G11: an ended run is immutable).
 */
test("UI04E_R2: the prior run stays gameplay byte-identical and at NEXT_LIFE after the next life is created", async () => {
  const { database, service } = cloudLiveService();
  const OLD = "boot:ui04e-r2:old-life";
  const { runId: oldRunId } = await driveToEndOfLife({ database, service, bootstrapId: OLD });

  let index = 0;
  for (const [stage, action] of [["ENDING", "advance-to-life-book"], ["LIFE_BOOK", "advance-to-rebirth-result"], ["REBIRTH_RESULT", "advance-to-next-life"]]) {
    index += 1;
    const settled = await service.advanceTerminal({
      runId: oldRunId, terminalTransitionId: `t:r2:immutable:${index}`, expectedTerminalStage: stage, action
    });
    assert.equal(settled.ok, true, JSON.stringify(settled));
  }

  const beforeDoc = storedRunDoc(database, oldRunId);
  assert.equal(beforeDoc.terminal.stage, "NEXT_LIFE");
  const stateBytes = JSON.stringify(beforeDoc.state);
  const stateHash = ruleStateHash(beforeDoc.state);
  const terminalBytes = JSON.stringify(beforeDoc.terminal);
  const commandLogBytes = JSON.stringify(beforeDoc.commandLog);

  // The explicit next-life step: a freshly persisted pending bootstrap id, never a server-minted one.
  const next = await service.createRunOffer({ bootstrapId: "boot:ui04e-r2:next-life" });
  assert.notEqual(next.runId, oldRunId, "the next life is a new run document");
  assert.equal(next.view.state.pageState, "DESTINY_OFFER", "the next life opens on a fresh destiny offer");
  assert.equal(next.view.state.terminal, undefined, "a fresh life carries no terminal sidecar");

  const afterDoc = storedRunDoc(database, oldRunId);
  assert.equal(JSON.stringify(afterDoc.state), stateBytes, "the prior run's canonical gameplay state must be byte-identical");
  assert.equal(ruleStateHash(afterDoc.state), stateHash, "the prior run's rule state hash must not move");
  assert.equal(JSON.stringify(afterDoc.commandLog), commandLogBytes, "the prior run's command log must not move");
  assert.equal(JSON.stringify(afterDoc.terminal), terminalBytes, "the prior run's terminal sidecar must not move");
  assert.equal(afterDoc.terminal.stage, "NEXT_LIFE", "the prior run stays parked at NEXT_LIFE");

  const oldView = await service.fetchView(oldRunId);
  assert.equal(oldView.state.pageState, "NEXT_LIFE", "the prior run still projects NEXT_LIFE after the new life exists");
  assert.equal(oldView.state.terminal.stage, "NEXT_LIFE");
});
