/**
 * LIVEFIX04 — the CloudBase `errCode: -1` missing-document shape.
 *
 * WHAT THIS SUITE PROVES
 *
 * After LIVEFIX01, real WeChat DevTools smoke got further: the start page passed, the game page passed,
 * the `game.wxss` line-253 compile error was gone, and v2-live reached the cloud. The deployed `tianfu2`
 * function then failed the very first request on a freshly deployed, empty database:
 *
 *     errCode: -1
 *     errMsg:  "document.get:fail document with _id 3ce20f6c196afe9afe03504165d51dcf does not exist"
 *
 * and the client only saw `createRunOffer result.runId must be a non-empty string`.
 *
 * The condition is the SAME benign one LIVEFIX01 already handles — a document that is not there yet on
 * first use. Only the wrapper changed: the ResourceNotFound family code became the generic `-1`. So the
 * production code alone is unstable, and `-1` is precisely the code that carries the least information:
 * the platform returns it for permission failures, network faults, transaction conflicts and malformed
 * requests too.
 *
 * That is why the fix here is a single exact shape and not a broadened rule. The classifier accepts
 * `errCode/code: -1` (numeric or stringified) ONLY when the message matches, fully anchored:
 *
 *     ^document\.get:fail\s+document\s+with\s+_id\s+[0-9a-f]{32}\s+does\s+not\s+exist$
 *
 * — the operation prefix, the `_id` subject, a 32-hex deterministic id (exactly what `documentIdFor`
 * produces, so an id this store could not have issued is rejected) and the absence claim, in that order
 * and with nothing around them.
 *
 * The assertions below are therefore mostly about what must STILL FAIL:
 *   - generic `-1`, and every near-miss `-1`, stay fatal — collection absence, permission denied, timeout,
 *     network, transaction conflict, malformed messages, wrong id length, non-hex ids, wrong operations;
 *   - the LIVEFIX01 shapes still normalize exactly as before;
 *   - all four read kinds share the new empty-read semantics;
 *   - a completely empty four-collection database creates the first run, and the same-bootstrap retry
 *     stays exactly-once, under the NEW production shape and the OLD one;
 *   - the committed deployable cloud host returns a non-empty runId on the new shape.
 *
 * Nothing here touches the client, the UI, gameplay, Core, Content or the database schema. It is a
 * persistence-boundary compatibility proof.
 */

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  CloudBaseGatewayStore,
  TianfuLiveService,
  createLiveContentRegistry,
  derivePlayerId,
  bootstrapKeyFor,
  documentIdFor,
  isMissingDocumentError,
  CLOUDBASE_GENERIC_ERROR_CODE,
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
  GENERIC_ERROR_CODE,
  GENERIC_MINUS_ONE_MESSAGE_ID,
  MISSING_DOCUMENT_SHAPES,
  genericMinusOneMissingDocumentError,
  genericMinusOneMissingDocumentErrorStringCode
} from "../tools/ui04d-cloud-harness.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ALICE = "o-alice-livefix04";
const BOB = "o-bob-livefix04";
const ALICE_PLAYER = derivePlayerId(ALICE);
const BOB_PLAYER = derivePlayerId(BOB);

/** The exact production errMsg, with the observed id. Anchored shape, 32-hex id. */
const PRODUCTION_MESSAGE = `document.get:fail document with _id ${GENERIC_MINUS_ONE_MESSAGE_ID} does not exist`;

function deterministicEntropy(prefix = "seed") {
  let counter = 0;
  return { randomToken: () => `${prefix}-${String(++counter).padStart(4, "0")}` };
}

function cloudService({ openid = ALICE, database, entropy = deterministicEntropy() } = {}) {
  const registry = createLiveContentRegistry();
  const store = new CloudBaseGatewayStore({ database: database ?? createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" }) });
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
function envelope(playerId, runId, expectedStateVersion, command, commandId = `cmd:livefix04:${++counter}`) {
  return {
    commandId, playerId, runId, expectedStateVersion,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "livefix04-test", command
  };
}

function documentsOf(database, collection) {
  const documents = database.snapshot().get(collection);
  return documents === undefined ? new Map() : documents;
}

function storedRun(database, runId) {
  return documentsOf(database, RUNS_COLLECTION).get(documentIdFor("run", runId));
}

/** Awaits `operation()` and requires it to reject. Never asserts on a message it does not own. */
async function rejectionOf(operation, label) {
  let caught = null;
  try { await operation(); } catch (error) { caught = error; }
  assert.notEqual(caught, null, `${label}: must reject instead of reading as empty`);
  return caught;
}

// ============================================================ 1. the exact production shape is accepted

test("LIVEFIX04_classifier: the exact production errCode=-1 shape is normalized", () => {
  // This is the literal evidence from the deployed tianfu2 function, both as a numeric and a string code.
  assert.equal(
    isMissingDocumentError({ errCode: -1, errMsg: PRODUCTION_MESSAGE }),
    true,
    "the observed production shape must be accepted"
  );
  assert.equal(
    isMissingDocumentError({ code: "-1", errMsg: PRODUCTION_MESSAGE }),
    true,
    "the same shape with a stringified code must be accepted"
  );
  assert.equal(
    isMissingDocumentError({ errCode: -1, message: PRODUCTION_MESSAGE }),
    true,
    "the same shape reported on `message` rather than `errMsg`"
  );
  // The harness builds the identical shape, so the test and the store cannot drift apart.
  assert.equal(isMissingDocumentError(genericMinusOneMissingDocumentError(GENERIC_MINUS_ONE_MESSAGE_ID)), true);
  assert.equal(isMissingDocumentError(genericMinusOneMissingDocumentErrorStringCode(GENERIC_MINUS_ONE_MESSAGE_ID)), true);
  // Surrounding whitespace from a platform that pads its messages must not defeat an anchored match.
  assert.equal(isMissingDocumentError({ errCode: -1, errMsg: `  ${PRODUCTION_MESSAGE} ` }), true, "padding is tolerated");
});

test("LIVEFIX04_classifier: the accepted shape is anchored to the real 32-hex document id", () => {
  // The id must be one `documentIdFor` could actually have produced.
  const real = documentIdFor("run", "some-run-id");
  assert.equal(/^[0-9a-f]{32}$/.test(real), true, "documentIdFor must produce 32 hex chars");
  assert.equal(
    isMissingDocumentError({ errCode: -1, errMsg: `document.get:fail document with _id ${real} does not exist` }),
    true,
    "a real deterministic id must be accepted"
  );

  // Every near-miss id shape stays fatal. These are the controls that stop the rule drifting into
  // "any message mentioning a document is fine".
  const badIds = [
    ["31 hex chars (one short)", "3ce20f6c196afe9afe03504165d51dc"],
    ["33 hex chars (one long)", "3ce20f6c196afe9afe03504165d51dcff"],
    ["non-hex letters", "3ce20f6c196afe9afe03504165d51dcg"],
    ["an ObjectId-shaped id", "3ce20f6c196afe9afe03504165d51dcf-extra"],
    ["a uuid with dashes", "3ce20f6c-196a-fe9a-fe03-504165d51dcf"],
    ["no id at all", ""]
  ];
  for (const [label, id] of badIds) {
    const message = `document.get:fail document with _id ${id} does not exist`;
    assert.equal(isMissingDocumentError({ errCode: -1, errMsg: message }), false, `${label} must stay fatal`);
  }
});

test("LIVEFIX04_classifier: generic and near-miss -1 errors remain fatal", () => {
  // THE core guarantee. `-1` is the least informative code the platform returns; nothing about it alone
  // may ever normalize an error.
  const fatal = [
    ["a bare -1 with no message", { errCode: -1 }],
    ["a bare -1 with an empty message", { errCode: -1, errMsg: "" }],
    ["a bare -1 with an unrelated message", { errCode: -1, errMsg: "internal error" }],
    ["-1 with no message key at all", { errCode: -1 }],
    ["permission denied", { errCode: -1, errMsg: "document.get:fail permission denied for collection tianfu2_runs" }],
    ["auth failure", { errCode: -1, errMsg: "document.get:fail unauthorized, no permission to read this document" }],
    ["network timeout", { errCode: -1, errMsg: "document.get:fail request timeout after 6000ms" }],
    ["network unreachable", { errCode: -1, errMsg: "document.get:fail socket hang up, network error" }],
    ["transaction conflict", { errCode: -1, errMsg: "document.get:fail transaction conflict, please retry" }],
    ["transaction aborted", { errCode: -1, errMsg: "runTransaction:fail transaction aborted" }],
    ["malformed document message", { errCode: -1, errMsg: "document.get:fail document is malformed and cannot be decoded" }],
    ["a truncated production sentence", { errCode: -1, errMsg: "document.get:fail document with _id 3ce20f6c196afe9afe03504165d51dcf does not" }],
    ["the production sentence with trailing junk", { errCode: -1, errMsg: `${PRODUCTION_MESSAGE} (retrying)` }],
    ["the production sentence with a leading prefix", { errCode: -1, errMsg: `[ResourceNotFound] ${PRODUCTION_MESSAGE}` }],
    ["the production sentence with a wrong operation", { errCode: -1, errMsg: `collection.get:fail document with _id ${GENERIC_MINUS_ONE_MESSAGE_ID} does not exist` }],
    ["the production sentence with no absence claim", { errCode: -1, errMsg: `document.get:fail document with _id ${GENERIC_MINUS_ONE_MESSAGE_ID}` }],
    ["the production shape with the code spelled as text", { errCode: "minus one", errMsg: PRODUCTION_MESSAGE }],
    ["a collection absence carrying -1", { errCode: -1, errMsg: "collection.get:fail collection tianfu2_runs does not exist" }],
    ["-1 as a boolean-ish string", { errCode: "true", errMsg: PRODUCTION_MESSAGE }]
  ];
  for (const [label, error] of fatal) {
    assert.equal(isMissingDocumentError(error), false, `${label} must stay fatal`);
  }

  // And the LIVEFIX01 near-miss invariant still holds under the new branch: a missing COLLECTION is a
  // deployment error even when it wears the -1 code.
  assert.equal(
    isMissingDocumentError({ errCode: -1, errMsg: `document.get:fail collection tianfu2_runs does not exist` }),
    false,
    "collection absence must never be an empty document"
  );
});

test("LIVEFIX04_regression: every LIVEFIX01 shape is still normalized exactly as before", () => {
  // Unchanged accepted shapes.
  assert.equal(
    isMissingDocumentError({ errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE, errMsg: CLOUDBASE_MISSING_DOCUMENT_MESSAGE }),
    true,
    "the original coded production shape"
  );
  assert.equal(
    isMissingDocumentError({ errMsg: CLOUDBASE_MISSING_DOCUMENT_MESSAGE, errCode: CLOUDBASE_RESOURCE_NOT_FOUND_CODE }),
    true,
    "message via errMsg"
  );
  assert.equal(
    isMissingDocumentError({ message: CLOUDBASE_MISSING_DOCUMENT_MESSAGE, code: "-502005" }),
    true,
    "a stringified LIVEFIX01 code"
  );
  assert.equal(
    isMissingDocumentError({ message: "document.get failed because document with _id abc does not exist", errCode: -502005 }),
    true,
    "the LIVEFIX01 shape with a short concrete _id must still be accepted — LIVEFIX04 must not tighten it"
  );
  assert.equal(
    isMissingDocumentError(new Error(CLOUDBASE_MISSING_DOCUMENT_MESSAGE)),
    true,
    "an uncoded Error carrying the literal sentence"
  );
  assert.equal(
    isMissingDocumentError({ message: `[ResourceNotFound] ${CLOUDBASE_MISSING_DOCUMENT_MESSAGE}` }),
    true,
    "the literal wrapped in a platform prefix"
  );
  // The generic code constant is the one the dispatch named, and it is not the ResourceNotFound family.
  assert.equal(CLOUDBASE_GENERIC_ERROR_CODE, -1);
  assert.notEqual(CLOUDBASE_GENERIC_ERROR_CODE, CLOUDBASE_RESOURCE_NOT_FOUND_CODE);
  assert.equal(GENERIC_ERROR_CODE, -1);
});

// ============================================================ 2. all four read kinds share the semantics

test("LIVEFIX04_reads: run command bootstrap and terminal-transition reads all normalize the new shape", async () => {
  const database = createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" });
  const store = new CloudBaseGatewayStore({ database });

  // Outside a transaction: an unknown run is a normal first-use absence.
  assert.equal(await store.readRun("run-never-existed"), undefined, "readRun must normalize the new shape");

  // Inside a transaction: all four kinds answer `undefined`, not a rejection.
  const seen = await store.transact(async (view) => ({
    run: await view.getRun("run-never-existed"),
    command: await view.getIdempotency("cmd-never-settled"),
    bootstrap: await view.getBootstrap(bootstrapKeyFor(ALICE_PLAYER, "boot-never-used")),
    terminal: await view.getTerminalTransition("term-never-settled")
  }));
  assert.deepEqual(seen, { run: undefined, command: undefined, bootstrap: undefined, terminal: undefined });

  // The four reads really did reach the database, every one answered by id and never by query.
  const audited = database.audit();
  assert.equal(audited.whereCalls, 0, "no query may be issued on the read path");
  assert.equal(audited.transactions, 1, "all four kinds were read inside the one transaction");
  for (const name of CLOUDBASE_COLLECTIONS) {
    assert.equal(database.snapshot().has(name), true, `${name} must have been addressed by document id`);
  }
});

test("LIVEFIX04_reads: a collection that is not provisioned is still an operational error", async () => {
  // The new branch must not become a deployment-error blanket. A missing collection under the SAME -1 code
  // has to keep rejecting, or a broken deployment would look like a healthy empty database.
  const database = createFakeCloudDatabase({
    provisionedCollections: [],
    missingDocumentShape: "genericMinusOne"
  });
  const store = new CloudBaseGatewayStore({ database });
  const caught = await rejectionOf(() => store.readRun("any"), "unprovisioned collection");
  assert.equal(
    /collection/.test(typeof caught.message === "string" ? caught.message : ""),
    true,
    `must name the missing collection, got ${String(caught.message)}`
  );
});

// ============================================================ 3. empty database, first bootstrap

test("LIVEFIX04_bootstrap: an empty four-collection database creates the first run under the new shape", async () => {
  const database = createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" });
  // The supported first-use state: provisioned, and completely empty.
  for (const collection of CLOUDBASE_COLLECTIONS) {
    assert.equal(documentsOf(database, collection).size, 0, `${collection} must start empty`);
  }

  const { service } = cloudService({ database });
  const offer = await service.createRunOffer({ bootstrapId: "boot:livefix04-first" });

  // The live client symptom was `createRunOffer result.runId must be a non-empty string`.
  assert.equal(typeof offer.runId, "string");
  assert.equal(offer.runId.length > 0, true, "the first offer must publish a run id");
  assert.equal(offer.playerId, ALICE_PLAYER);
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");

  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, "exactly one run document");
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1, "exactly one bootstrap mapping");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 0, "an offer settles no command");
  assert.equal(documentsOf(database, TERMINAL_TRANSITIONS_COLLECTION).size, 0, "and no terminal receipt");

  const mapping = documentsOf(database, BOOTSTRAPS_COLLECTION).get(
    documentIdFor("bootstrap", bootstrapKeyFor(ALICE_PLAYER, "boot:livefix04-first"))
  );
  assert.notEqual(mapping, undefined, "the mapping must be written under its deterministic id");
  assert.equal(mapping.runId, offer.runId);
  assert.equal(storedRun(database, offer.runId).state.run.playerId, ALICE_PLAYER);
});

test("LIVEFIX04_bootstrap: the same-bootstrap retry stays exactly-once under the new shape", async () => {
  const database = createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" });
  const { service } = cloudService({ database });
  const first = await service.createRunOffer({ bootstrapId: "boot:livefix04-retry" });

  const retry = await service.createRunOffer({ bootstrapId: "boot:livefix04-retry" });
  assert.equal(retry.runId, first.runId, "a retry must recover, not re-create");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, "no second run was created");
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1, "no second mapping was written");

  // A cold handler — fresh store, fresh registry, same database — is the reload case, and it is served
  // entirely through the rejecting read path.
  const cold = cloudService({ database });
  const recovered = await cold.service.createRunOffer({ bootstrapId: "boot:livefix04-retry" });
  assert.equal(recovered.runId, first.runId, "a cold start must recover the same run");
  assert.deepEqual(
    JSON.parse(JSON.stringify(recovered.view)),
    JSON.parse(JSON.stringify(first.view)),
    "and project the same authoritative view"
  );
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1);

  // A different OPENID is a different player: the bootstrap key is a recovery key, not an identity.
  const bob = cloudService({ openid: BOB, database });
  const bobOffer = await bob.service.createRunOffer({ bootstrapId: "boot:livefix04-retry" });
  assert.equal(bobOffer.playerId, BOB_PLAYER);
  assert.notEqual(bobOffer.runId, first.runId);
});

test("LIVEFIX04_bootstrap: the first sendCommand settles once under the new shape", async () => {
  const database = createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" });
  const { service } = cloudService({ database });
  const offer = await service.createRunOffer({ bootstrapId: "boot:livefix04-command" });
  const START_COMMAND_ID = "cmd:livefix04-start";
  const startCommand = { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId };

  // One envelope object, reused verbatim. Reusing the SAME object is what makes this an exact retry: a
  // fresh envelope would carry a new commandId and prove nothing about the receipt read.
  const command = envelope(ALICE_PLAYER, offer.runId, 0, startCommand, START_COMMAND_ID);

  const started = await service.sendCommand(command);
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1, "exactly one command receipt was written");

  // The exact retry is served by the receipt that now exists: same result, no second settlement. The
  // whole point is that the receipt READ is a missing-document read, so it is served by the new shape.
  const retry = await service.sendCommand(command);
  assert.deepEqual(retry, started, "an exact retry must return the recorded result");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1, "the retry must not write a second receipt");
  assert.equal(storedRun(database, offer.runId).commandLog.entries.length, 1, "the retry must not settle twice");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, "no second run was created");

  // A changed payload under the same commandId is still refused, so normalizing the missing receipt did
  // not weaken idempotency.
  const conflict = await service.sendCommand({ ...command, command: { type: "CHOOSE_ACTION", actionId: "cultivate" } });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.messageKey, "command.idempotency_conflict");
  assert.equal(documentsOf(database, COMMANDS_COLLECTION).size, 1);
});

test("LIVEFIX04_shape: both selectable harness shapes drive the same store, service and host", async () => {
  // The point of the harness option: the SAME code path serves both real-world wire shapes. If only one
  // worked, this loop would show it.
  assert.deepEqual(MISSING_DOCUMENT_SHAPES, ["resourceNotFound", "genericMinusOne"]);
  for (const shape of MISSING_DOCUMENT_SHAPES) {
    const database = createFakeCloudDatabase({ missingDocumentShape: shape });
    const { service } = cloudService({ database });
    const offer = await service.createRunOffer({ bootstrapId: `boot:livefix04-${shape}` });
    assert.equal(typeof offer.runId, "string", `${shape}: must publish a run id`);
    assert.equal(offer.runId.length > 0, true, `${shape}: run id must be non-empty`);
    const retry = await service.createRunOffer({ bootstrapId: `boot:livefix04-${shape}` });
    assert.equal(retry.runId, offer.runId, `${shape}: the retry must be exactly-once`);
    assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1, `${shape}: exactly one run`);
  }
  // An unknown shape is rejected rather than silently defaulting, so a typo cannot weaken a test.
  assert.throws(
    () => createFakeCloudDatabase({ missingDocumentShape: "genericMinusOneTypo" }),
    /missingDocumentShape/,
    "an unrecognised shape must throw"
  );
});

// ============================================================ 4. the deployable cloud host

test("LIVEFIX04_host: the committed cloud function returns a non-empty runId on the new shape", async () => {
  // The committed `cloudfunctions/tianfu2` runtime, driven exactly as the platform drives it. This is the
  // artifact the user actually deploys, so it is the assertion that matches the reported symptom.
  const database = createFakeCloudDatabase({ missingDocumentShape: "genericMinusOne" });
  const handler = loadCloudFunction({ openid: ALICE, database });

  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:livefix04-host" });
  assert.equal(typeof offer.runId, "string");
  assert.equal(offer.runId.length > 0, true, "the host must publish a run id on a first-ever request");
  assert.equal(offer.playerId, ALICE_PLAYER);
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");
  assert.equal(documentsOf(database, RUNS_COLLECTION).size, 1);
  assert.equal(documentsOf(database, BOOTSTRAPS_COLLECTION).size, 1);

  // And the host must still fail closed on a genuinely broken deployment. The real host never echoes a
  // server error to the client — it logs and returns a bounded, retryable envelope — so the proof is the
  // bounded envelope plus the absence of any run, not a thrown error.
  const brokenDatabase = createFakeCloudDatabase({ provisionedCollections: [], missingDocumentShape: "genericMinusOne" });
  const brokenHandler = loadCloudFunction({ openid: ALICE, database: brokenDatabase });
  const broken = await brokenHandler.main({ operation: "createRunOffer", bootstrapId: "boot:livefix04-host-broken" });
  assert.equal(broken.ok, false, `a missing collection must not be normalized into a created run, got ${JSON.stringify(broken)}`);
  assert.equal(broken.error.code, "INTERNAL", "and must map to the bounded internal-failure code, never a raw server error");
  assert.equal(broken.runId, undefined, "no runId may be published when the deployment is broken");
  assert.equal(
    /collection|does not exist/i.test(JSON.stringify(broken)),
    false,
    "the envelope must not leak the underlying collection detail to the client"
  );
  assert.equal(documentsOf(brokenDatabase, RUNS_COLLECTION).size, 0, "nothing may be written when the collection is absent");
});

// ============================================================ 5. scope

test("LIVEFIX04_scope: the classifier stayed narrow and the store never widened its boundary", () => {
  const source = stripJs(read("server/src/cloudbase-store.ts"));

  // The -1 branch must be gated on the anchored regex, not on the code alone.
  assert.match(
    source,
    /CLOUDBASE_GENERIC_ERROR_CODE[\s\S]{0,200}GENERIC_MINUS_ONE_MISSING_DOCUMENT\.test/,
    "the -1 branch must require the exact anchored message, never the code alone"
  );
  assert.match(source, /document\\\.get:fail/, "the regex must pin the document.get operation prefix");
  assert.match(source, /\[0-9a-f\]\{32\}/, "the regex must pin a 32-hex deterministic id");

  // The store still never creates a collection and never queries.
  assert.equal(/createCollection/.test(source), false, "the four collections remain an explicit deployment prerequisite");
  assert.equal(/\.where\s*\(/.test(source), false, "the store must address documents by id only");

  // Every normalization still goes through the single classifier.
  const normalizations = (stripJs(read("server/src/cloudbase-store.ts")).match(/isMissingDocumentError\(/g) ?? []).length;
  assert.ok(normalizations >= 2, `reads must normalize through the shared classifier, saw ${normalizations} call sites`);

  // No client, UI, gameplay, schema or RPC drift: this task's source change is one file.
  assert.match(source, /isMissingDocumentError/, "the boundary lives in the store");
});

test("LIVEFIX04_scope: the deployed runtime artifact carries the new narrow shape", () => {
  // The artifact is generated from the TypeScript source; this asserts the committed copy already
  // reflects LIVEFIX04, so a stale artifact cannot pass as a fix.
  const artifact = stripJs(read("cloudfunctions/tianfu2/runtime/server-cloudbase-store.js"));
  assert.match(artifact, /GENERIC_MINUS_ONE_MISSING_DOCUMENT/, "the runtime must contain the anchored -1 matcher");
  assert.match(artifact, /document\\\.get:fail/, "and the pinned operation prefix");
  assert.equal(/createCollection/.test(artifact), false, "the generated store still never creates a collection");
});
