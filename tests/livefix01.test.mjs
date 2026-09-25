/**
 * LIVEFIX01 — real CloudBase empty-read semantics + first-run recovery.
 *
 * WHY THIS SUITE EXISTS
 *
 * The fake CloudBase database used until now answered a read for a nonexistent document with
 * `{ data: undefined }`. Real WeChat CloudBase does not: with the collection provisioned,
 * `collection(name).doc(id).get()` can REJECT. On `cloud1-8glg1sird4d40bc0` that rejection hit every
 * first-use read on a correctly provisioned but EMPTY database, so the very first `createRunOffer` blew up
 * before it could create anything and the client only ever saw
 * `createRunOffer result.runId must be a non-empty string`.
 *
 * The fix belongs at the CloudBase persistence boundary, and it is deliberately narrow. This suite proves
 * both halves of that narrowness:
 *
 *   ACCEPT  — a missing DOCUMENT inside an existing collection is `undefined`, for all four read kinds.
 *   REFUSE  — a missing COLLECTION stays fatal. It was observed under the SAME broad `-502005`
 *             ResourceNotFound family, so the numeric code is never the discriminator, and swallowing it
 *             would turn a broken deployment into a silent "your data is empty".
 *
 * Everything else — permission, network, transaction, malformed, uncoded, unknown — stays fatal, because
 * the store must fail closed whenever it cannot positively identify the one benign absence.
 *
 * The fake harness now reproduces the real rejection by default (`missingDocumentMode: "reject"`), so these
 * assertions run against the same failure shape production emitted rather than against a friendlier fake.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { createCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import {
  CloudBaseGatewayStore,
  RunUnavailableError,
  TianfuLiveService,
  createLiveContentRegistry,
  derivePlayerId,
  bootstrapKeyFor,
  documentIdFor,
  isMissingDocumentError,
  CLOUDBASE_MISSING_DOCUMENT_MESSAGE,
  CLOUDBASE_RESOURCE_NOT_FOUND_CODE,
  RUNS_COLLECTION,
  COMMANDS_COLLECTION,
  BOOTSTRAPS_COLLECTION,
  TERMINAL_TRANSITIONS_COLLECTION,
  LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION
} from "../server/src/index.ts";
import {
  createFakeCloudDatabase,
  loadCloudFunction,
  CLOUDBASE_COLLECTIONS,
  RESOURCE_NOT_FOUND_CODE,
  missingCollectionError,
  missingDocumentError
} from "../tools/ui04d-cloud-harness.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJSON = (relative) => JSON.parse(read(relative));
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ALICE = "o-alice-livefix01";
const BOB = "o-bob-livefix01";
const ALICE_PLAYER = derivePlayerId(ALICE);
const BOB_PLAYER = derivePlayerId(BOB);

/** Deterministic server entropy, so a failing assertion names a real defect and not an entropy draw. */
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

let counter = 0;
function envelope(playerId, runId, expectedStateVersion, command, commandId = `cmd:livefix01:${++counter}`) {
  return {
    commandId, playerId, runId, expectedStateVersion,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "livefix01-test", command
  };
}

/** The committed documents of one collection. A never-touched collection reads as empty, not as missing. */
function documentsOf(database, collection) {
  const documents = database.snapshot().get(collection);
  return documents === undefined ? new Map() : documents;
}

/** The stored run document, read straight out of the fake database by its deterministic id. */
function storedRun(database, runId) {
  return documentsOf(database, RUNS_COLLECTION).get(documentIdFor("run", runId));
}

/**
 * Awaits `operation()` and asserts it rejected with the operational "this collection is not provisioned"
 * failure: the same ResourceNotFound family as a missing document, but naming the COLLECTION. Written as an
 * explicit try/catch so the proof does not depend on the assertion library's overload resolution.
 */
async function expectMissingCollectionFailure(operation, label) {
  let caught = null;
  try { await operation(); } catch (error) { caught = error; }
  assert.notEqual(caught, null, `${label}: must reject instead of reading as empty`);
  const message = typeof caught.message === "string" ? caught.message : "";
  assert.equal(caught.errCode, RESOURCE_NOT_FOUND_CODE, `${label}: must carry the observed ResourceNotFound family`);
  assert.equal(/collection/.test(message), true, `${label}: must name the missing collection, got ${message}`);
  return caught;
}

/**
 * Drives a real run to `dying` through the real reducer: seeds an offered state at age 99 / maxAge 100 so
 * a single travel action lands at the lifespan ceiling. No destiny is fabricated — the real CONTENT01
 * registry is used end to end.
 */
async function driveToDying({ service, database, runId, playerId }) {
  const offer = await service.createRunOffer({ bootstrapId: `boot:${runId}` });
  const actualRunId = offer.runId;
  const selectionId = offer.view.currentInteraction.options[0].optionId;
  const offered = storedRun(database, actualRunId);
  const seededState = { ...offered.state, run: { ...offered.state.run, age: 99, maxAge: 100 } };
  database.seedDoc(RUNS_COLLECTION, documentIdFor("run", actualRunId), {
    state: seededState, commandLog: createCommandLog(seededState), successfulCommandsSinceSnapshot: 0
  });
  const started = await service.sendCommand(envelope(playerId, actualRunId, 0, { type: "START_RUN", offerId: `offer-${actualRunId}`, selectionId }));
  assert.equal(started.ok, true, JSON.stringify(started));
  const dying = await service.sendCommand(envelope(playerId, actualRunId, started.stateVersion, { type: "CHOOSE_ACTION", actionId: "travel" }));
  assert.equal(dying.ok, true, JSON.stringify(dying));
  const state = storedRun(database, actualRunId).state;
  assert.equal(state.run.status, "dying", "the run must reach `dying` through the real reducer");
  assert.notEqual(state.run.ending, undefined, "the run must carry a lifespan ending");
  return { runId: actualRunId, dyingState: state };
}

// ============================================================ 1. the harness reproduces production

test("LIVEFIX01_harness: the fake database now rejects a missing-document read the way real CloudBase does", async () => {
  // The four collections a correct deployment provisions are exactly the four the store addresses.
  assert.deepEqual(CLOUDBASE_COLLECTIONS, [RUNS_COLLECTION, COMMANDS_COLLECTION, BOOTSTRAPS_COLLECTION, TERMINAL_TRANSITIONS_COLLECTION]);
  assert.equal(RESOURCE_NOT_FOUND_CODE, CLOUDBASE_RESOURCE_NOT_FOUND_CODE);

  const database = createFakeCloudDatabase();
  // A read of a document that does not exist REJECTS — this is the behaviour the old fake hid.
  let rejected = null;
  try { await database.collection(RUNS_COLLECTION).doc("never-existed").get(); } catch (error) { rejected = error; }
  assert.notEqual(rejected, null, "the fake must reject a missing-document read, the way real CloudBase does");
  assert.equal(isMissingDocumentError(rejected), true, "the harness shape must be the one the classifier accepts");
  assert.equal(rejected.errCode, RESOURCE_NOT_FOUND_CODE);

  // And the contrast that makes the regression test honest: the old fake answered `{ data: undefined }`,
  // which is precisely why the incompatibility survived every suite until it hit a real environment.
  const oldFake = createFakeCloudDatabase({ missingDocumentMode: "empty" });
  assert.deepEqual(await oldFake.collection(RUNS_COLLECTION).doc("never-existed").get(), { data: undefined });
  assert.throws(() => createFakeCloudDatabase({ missingDocumentMode: "whatever" }), RangeError, "the mode is a closed set");
});

// ============================================================ 2. the classifier

test("LIVEFIX01_classifier: the two accepted missing-document shapes are normalized", () => {
  // Shape A — coded. Real CloudBase attached `-502005` and named the document `_id` as absent.
  assert.equal(isMissingDocumentError(missingDocumentError("deadbeef")), true, "the harness's coded missing-document shape");
  assert.equal(isMissingDocumentError({ errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE, errMsg: "document.get failed because document with deterministic _id does not exist" }), true, "the exact observed production error");
  assert.equal(isMissingDocumentError({ errMsg: CLOUDBASE_MISSING_DOCUMENT_MESSAGE, errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE }), true, "message via errMsg");
  assert.equal(isMissingDocumentError({ message: CLOUDBASE_MISSING_DOCUMENT_MESSAGE, code: "-502005" }), true, "a stringified code from an SDK that stringifies");
  assert.equal(isMissingDocumentError({ message: "document.get failed because document with _id abc does not exist", errCode: -502005 }), true, "the same shape with a concrete _id");

  // Shape B — the literal production sentence, with or without a code. Nothing else in the SDK vocabulary
  // can accidentally match it, which is why this is the only uncoded message ever normalized.
  assert.equal(isMissingDocumentError(new Error(CLOUDBASE_MISSING_DOCUMENT_MESSAGE)), true, "an uncoded Error carrying the literal sentence");
  assert.equal(isMissingDocumentError({ message: `[ResourceNotFound] ${CLOUDBASE_MISSING_DOCUMENT_MESSAGE}` }), true, "the literal wrapped in a platform prefix");

  // The codes exported for the harness, the store and the tests are one value, not three.
  assert.equal(CLOUDBASE_RESOURCE_NOT_FOUND_CODE, -502005);
  assert.equal(CLOUDBASE_MISSING_DOCUMENT_MESSAGE, "document.get failed because document with deterministic _id does not exist");
});

test("LIVEFIX01_classifier: a missing COLLECTION with the same numeric code is NOT swallowed", () => {
  // The whole point of the task: `-502005` is a family, not a diagnosis. Missing collection was observed
  // under the same family and is a deployment prerequisite violation, never a first-use empty document.
  assert.equal(isMissingDocumentError(missingCollectionError(RUNS_COLLECTION)), false, "harness missing-collection shape");
  for (const message of [
    `[ResourceNotFound] collection.get failed because collection ${RUNS_COLLECTION} does not exist`,
    "collection tianfu2_bootstraps not found",
    "the collection does not exist",
    "集合 tianfu2_runs 不存在",
    "document.get failed because the collection tianfu2_runs does not exist"
  ]) {
    assert.equal(isMissingDocumentError({ errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE, errMsg: message }), false, `must stay fatal: ${message}`);
  }
});

test("LIVEFIX01_classifier: permission network transaction malformed and unknown errors remain fatal", () => {
  const fatal = [
    { label: "permission denied", error: { errCode: -502005, errMsg: "permission denied for collection tianfu2_runs" } },
    { label: "permission family", error: { errCode: -501001, errMsg: "document.get failed because document with _id x does not exist" } },
    { label: "network timeout", error: { code: "ETIMEDOUT", message: "document.get failed because document with _id x does not exist" } },
    { label: "transaction aborted", error: { errCode: -502005, errMsg: "transaction aborted: write conflict on document" } },
    { label: "document locked", error: { errCode: -502005, errMsg: "document with _id x is locked by another transaction" } },
    { label: "no absence claim", error: { errCode: -502005, errMsg: "document.get failed because the caller lacks permission on _id abc" } },
    { label: "no document subject", error: { errCode: -502005, errMsg: "does not exist" } },
    { label: "code only", error: { errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE } },
    { label: "empty message", error: { errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE, message: "" } },
    { label: "plain object", error: { message: "something else entirely" } },
    { label: "a thrown string", error: "document.get failed because document with _id x does not exist" },
    { label: "null", error: null },
    { label: "undefined", error: undefined },
    { label: "a number", error: -502005 }
  ];
  for (const entry of fatal) {
    assert.equal(isMissingDocumentError(entry.error), false, `${entry.label} must remain fatal`);
  }
});

// ============================================================ 3. all four read kinds

test("LIVEFIX01_reads: run command bootstrap and terminal-transition reads all share the empty-read semantics", async () => {
  const database = createFakeCloudDatabase();
  const store = new CloudBaseGatewayStore({ database });

  // Outside a transaction: an unknown run is a normal first-use absence.
  assert.equal(await store.readRun("run-never-existed"), undefined, "readRun must not throw on a missing document");

  // Inside a transaction: all four kinds answer `undefined`, not a rejection.
  const seen = await store.transact(async (view) => ({
    run: await view.getRun("run-never-existed"),
    command: await view.getIdempotency("cmd-never-settled"),
    bootstrap: await view.getBootstrap(bootstrapKeyFor(ALICE_PLAYER, "boot-never-used")),
    terminal: await view.getTerminalTransition("term-never-settled")
  }));
  assert.deepEqual(seen, { run: undefined, command: undefined, bootstrap: undefined, terminal: undefined });

  // The four reads really did reach the database, every one of them answered by id and never by query.
  const audited = database.audit();
  assert.equal(audited.whereCalls, 0, "no query may be issued on the read path");
  assert.equal(audited.transactions, 1, "all four kinds were read inside the one transaction");
  // Addressing a collection with `.doc()` is what registers it, so this proves each kind was really read.
  for (const name of CLOUDBASE_COLLECTIONS) {
    assert.equal(database.snapshot().has(name), true, `${name} must have been addressed by document id`);
  }
});

test("LIVEFIX01_reads: a collection that is not provisioned is an operational error, never an empty document", async () => {
  // A deployment that provisioned only three of the four: reads must fail loudly, and nothing may be
  // invented to paper over it.
  const database = createFakeCloudDatabase({ provisionedCollections: [RUNS_COLLECTION, COMMANDS_COLLECTION, TERMINAL_TRANSITIONS_COLLECTION] });
  const store = new CloudBaseGatewayStore({ database });

  // The bootstrap collection is the one createRunOffer reads first, so that is where a half-provisioned
  // deployment surfaces. It must be loud, and it must not be answered as "no bootstrap yet".
  const { service } = cloudService({ database });
  await expectMissingCollectionFailure(() => service.createRunOffer({ bootstrapId: "boot:no-collection" }), "createRunOffer without the bootstraps collection");

  // Fail closed means also: no document was written anywhere, and the collection is still absent.
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 0);
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 0);
  await expectMissingCollectionFailure(() => database.collection(BOOTSTRAPS_COLLECTION).doc("anything").get(), "a read against the absent collection");

  // A database with no collection provisioned at all fails the same way, including the plain read path.
  const nothing = createFakeCloudDatabase({ provisionedCollections: [] });
  const bare = new CloudBaseGatewayStore({ database: nothing });
  await expectMissingCollectionFailure(() => bare.readRun("run-x"), "readRun with no collection provisioned");
});

test("LIVEFIX01_scope: the store never creates a collection and never queries", () => {
  const source = stripJs(read("server/src/cloudbase-store.ts"));
  assert.equal(/createCollection/.test(source), false, "the four collections remain an explicit deployment prerequisite");
  assert.equal(/\.where\s*\(/.test(source), false, "the store must address documents by id only");
  // There is exactly one place that normalizes a missing document, not four copy-pasted catches.
  const normalizations = (stripJs(source).match(/isMissingDocumentError\(/g) ?? []).length;
  assert.equal(normalizations >= 2, true, "one classifier plus the store-wide helper that uses it");
  assert.equal(source.includes("async function readDocumentData"), true, "reads must go through one shared helper");
});

// ============================================================ 4. empty database, first bootstrap

test("LIVEFIX01_bootstrap: an empty four-collection database supports the first createRunOffer", async () => {
  const database = createFakeCloudDatabase();
  // The supported first-use state: provisioned, and completely empty.
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 0);
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 0);
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 0);
  assert.equal(documentsOf(database, TERMINAL_TRANSITIONS_COLLECTION).size, 0);

  const { service } = cloudService({ database });
  const offer = await service.createRunOffer({ bootstrapId: "boot:livefix01-first" });

  // The client symptom of the live bug was `createRunOffer result.runId must be a non-empty string`.
  assert.equal(typeof offer.runId, "string");
  assert.equal(offer.runId.length > 0, true, "the first offer must publish a run id");
  assert.equal(offer.playerId, ALICE_PLAYER);
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");

  // Exactly one run and one bootstrap mapping, created atomically inside the one transaction.
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, "exactly one run document");
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1, "exactly one bootstrap mapping");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 0, "an offer settles no command");
  assert.equal(documentsOf(database, TERMINAL_TRANSITIONS_COLLECTION).size, 0, "and no terminal receipt");
  assert.equal(database.audit().transactions, 1, "the offer is one transaction, not several");

  // The mapping points at this run, and the run is owned by the OPENID-derived player.
  const mapping = documentsOf(database, BOOTSTRAPS_COLLECTION).get(documentIdFor("bootstrap", bootstrapKeyFor(ALICE_PLAYER, "boot:livefix01-first")));
  assert.notEqual(mapping, undefined, "the mapping must be written under its deterministic id");
  assert.equal(mapping.playerId, ALICE_PLAYER);
  assert.equal(mapping.bootstrapId, "boot:livefix01-first");
  assert.equal(mapping.runId, offer.runId);
  assert.equal(mapping.bootstrapKey, bootstrapKeyFor(ALICE_PLAYER, "boot:livefix01-first"));
  const stored = storedRun(database, offer.runId);
  assert.equal(stored.state.run.playerId, ALICE_PLAYER);
  assert.equal(stored.commandLog.entries.length, 0);
});

test("LIVEFIX01_bootstrap: repeating createRunOffer with the same identity plus bootstrapId recovers the same run", async () => {
  const database = createFakeCloudDatabase();
  const { service } = cloudService({ database });
  const first = await service.createRunOffer({ bootstrapId: "boot:livefix01-retry" });

  const retry = await service.createRunOffer({ bootstrapId: "boot:livefix01-retry" });
  assert.equal(retry.runId, first.runId, "a retry must recover, not re-create");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, "no second run was created");
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1, "no second mapping was written");

  // A cold handler — fresh store object, fresh registry, same database — recovers the same run too. This
  // is the reload case, and it is served entirely through the rejecting read path.
  const cold = cloudService({ database });
  const recovered = await cold.service.createRunOffer({ bootstrapId: "boot:livefix01-retry" });
  assert.equal(recovered.runId, first.runId, "a cold start must recover the same run");
  assert.deepEqual(JSON.parse(JSON.stringify(recovered.view)), JSON.parse(JSON.stringify(first.view)), "and project the same authoritative view");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1);

  // A different bootstrap key is a different life; a different OPENID is a different player.
  const fresh = await cold.service.createRunOffer({ bootstrapId: "boot:livefix01-another" });
  assert.notEqual(fresh.runId, first.runId);
  const bob = cloudService({ openid: BOB, database });
  const bobOffer = await bob.service.createRunOffer({ bootstrapId: "boot:livefix01-retry" });
  assert.equal(bobOffer.playerId, BOB_PLAYER);
  assert.notEqual(bobOffer.runId, first.runId, "the bootstrap key is a recovery key, not an identity");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 3);
});

// ============================================================ 5. first command, first terminal receipt

test("LIVEFIX01_command: the first sendCommand settles once when no idempotency receipt exists yet", async () => {
  const database = createFakeCloudDatabase();
  const { service } = cloudService({ database });
  const offer = await service.createRunOffer({ bootstrapId: "boot:livefix01-command" });
  // The idempotency collection is empty: the command document does not exist yet.
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 0);

  const command = envelope(ALICE_PLAYER, offer.runId, 0, {
    type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId
  }, "cmd:livefix01-first-command");

  const first = await service.sendCommand(command);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1, "one receipt");
  assert.equal(storedRun(database, offer.runId).commandLog.entries.length, 1, "and one settled command");
  const settledHash = ruleStateHash(storedRun(database, offer.runId).state);

  // The exact retry is served by the receipt that now exists: same result, no second settlement.
  const retry = await service.sendCommand(command);
  assert.deepEqual(retry, first, "an exact retry must return the recorded result");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1);
  assert.equal(storedRun(database, offer.runId).commandLog.entries.length, 1, "the retry must not settle twice");
  assert.equal(ruleStateHash(storedRun(database, offer.runId).state), settledHash, "and must not advance state");

  // A changed payload under the same commandId is still refused, so normalizing the missing receipt did
  // not weaken idempotency.
  const conflict = await service.sendCommand({ ...command, command: { type: "CHOOSE_ACTION", actionId: "cultivate" } });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.messageKey, "command.idempotency_conflict");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1);
});

test("LIVEFIX01_terminal: the first advanceTerminal settles once when no receipt exists yet", async () => {
  const setup = cloudService();
  const { runId, dyingState } = await driveToDying({ ...setup, runId: "run-livefix01-terminal", playerId: ALICE_PLAYER });
  // The terminal-transition collection is completely empty: no receipt for any transition id.
  assert.equal(documentsOf(setup.database, TERMINAL_TRANSITIONS_COLLECTION).size, 0);

  const request = { runId, terminalTransitionId: "term:livefix01-first", expectedTerminalStage: "ENDING", action: "advance-to-life-book" };
  const first = await setup.service.advanceTerminal(request);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.stage, "LIFE_BOOK");
  assert.equal(first.version, 1);
  assert.equal(documentsOf(setup.database, TERMINAL_TRANSITIONS_COLLECTION).size, 1, "exactly one receipt");

  // The exact retry recovers the settled stage without a second bump.
  const retry = await setup.service.advanceTerminal(request);
  assert.equal(retry.stage, "LIFE_BOOK");
  assert.equal(retry.version, 1, "no double stage bump");
  assert.equal(documentsOf(setup.database, TERMINAL_TRANSITIONS_COLLECTION).size, 1, "no second receipt");
  const stored = storedRun(setup.database, runId);
  assert.equal(stored.terminal.version, 1);
  assert.equal(Object.keys(stored.terminal.transitions).length, 1);
  // Terminal transitions remain sidecar-only: the canonical gameplay bytes did not move.
  assert.equal(ruleStateHash(stored.state), ruleStateHash(dyingState));

  // A reused id with a different payload is still refused — the missing-receipt normalization did not
  // weaken terminal exactly-once.
  let caught = null;
  try {
    await setup.service.advanceTerminal({ ...request, expectedTerminalStage: "REBIRTH_RESULT", action: "advance-to-next-life" });
  } catch (error) { caught = error; }
  assert.notEqual(caught, null, "a reused transition id with a different payload must fail closed");
  assert.equal(caught.code, "INVALID_COMMAND");
  assert.equal(caught.messageKey, "terminal.idempotency_conflict");
  assert.equal(documentsOf(setup.database, TERMINAL_TRANSITIONS_COLLECTION).size, 1);
});

// ============================================================ 6. ownership still fails closed

test("LIVEFIX01_ownership: an unknown run reads as undefined and the service still refuses identically", async () => {
  const database = createFakeCloudDatabase();
  const store = new CloudBaseGatewayStore({ database });
  const { service } = cloudService({ database });

  // Before any run exists, the raw store read is `undefined` and the service refuses.
  assert.equal(await store.readRun("run-never-existed"), undefined);
  await assert.rejects(() => service.fetchView("run-never-existed"), RunUnavailableError);

  const offer = await service.createRunOffer({ bootstrapId: "boot:livefix01-ownership" });
  // The owner reads it back through the same normalized read path.
  assert.equal((await service.fetchView(offer.runId)).state.runId, offer.runId);
  assert.notEqual(storedRun(database, offer.runId), undefined);

  // Another OPENID gets the identical refusal for both an unknown run and a run that exists but is not
  // theirs, so the endpoint cannot be used to probe which run ids exist.
  const bob = cloudService({ openid: BOB, database });
  let foreign = null;
  try { await bob.service.fetchView(offer.runId); } catch (error) { foreign = error; }
  let missing = null;
  try { await bob.service.fetchView("run-never-existed"); } catch (error) { missing = error; }
  assert.equal(foreign instanceof RunUnavailableError, true);
  assert.equal(missing instanceof RunUnavailableError, true);
  assert.deepEqual(JSON.parse(JSON.stringify(foreign)), JSON.parse(JSON.stringify(missing)), "a foreign run and a missing run must be the same answer");
  assert.equal(await store.readRun("run-never-existed"), undefined, "normalizing missing documents changed nothing about ownership");
});

// ============================================================ 7. the deployable host on an empty database

test("LIVEFIX01_host: the committed cloud function drives a first run on a completely empty database", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });

  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:livefix01-host" });
  assert.equal(typeof offer.runId, "string");
  assert.equal(offer.runId.length > 0, true, "the host must publish a run id on a first-ever request");
  assert.equal(offer.playerId, ALICE_PLAYER);
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1);
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1);

  const started = await handler.main({
    operation: "sendCommand",
    command: envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId })
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1, "the first command receipt was created");

  // A cold handler (a second realm, no cached store) recovers the same bootstrap.
  const cold = loadCloudFunction({ openid: ALICE, database });
  const recovered = await cold.main({ operation: "createRunOffer", bootstrapId: "boot:livefix01-host" });
  assert.equal(recovered.runId, offer.runId, "a cold start must recover the same run from an empty-then-seeded database");

  // The whole path was served by deterministic document ids.
  assert.equal(database.audit().whereCalls, 0);
});

// ============================================================ 8. documentation and registration

test("LIVEFIX01_docs: the deployment doc states that empty collections are valid and first use self-creates", () => {
  const doc = read("docs/UI04D_CLOUD_BACKEND.md");
  for (const phrase of [
    "四张集合",
    "允许为空",
    "首次请求",
    "自动创建",
    "LIVEFIX01",
    "-502005",
    "集合缺失",
    "部署前置"
  ]) {
    assert.equal(doc.includes(phrase), true, "the deployment doc must state " + phrase);
  }
  // The four collection names are enumerated explicitly, not implied.
  for (const name of CLOUDBASE_COLLECTIONS) assert.equal(doc.includes(name), true, "the doc must name " + name);
});

test("LIVEFIX01_registration: the suite and its helper exports are registered", () => {
  const pkg = readJSON("package.json");
  assert.equal(pkg.scripts["test:livefix01"], "node --test tests/livefix01.test.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/livefix01.test.mjs"), true, "the aggregate must run LIVEFIX01");
  assert.equal(fs.existsSync(path.join(ROOT, "tests/livefix01.test.mjs")), true);
  // The classifier is exported from the server boundary so tests and the harness share one definition.
  const source = read("server/src/cloudbase-store.ts");
  assert.equal(source.includes("export function isMissingDocumentError"), true);
  assert.equal(source.includes("export const CLOUDBASE_RESOURCE_NOT_FOUND_CODE"), true);
  assert.equal(source.includes("export const CLOUDBASE_MISSING_DOCUMENT_MESSAGE"), true);
});
