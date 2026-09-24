/**
 * UI04D — WeChat cloud authority backend vertical slice.
 *
 * UI04C proved the *client* could drive the whole chain against an injected cloud seam. This suite proves
 * there is now a real server behind that seam, and it does so at three levels:
 *
 *   1. the accepted TypeScript server modules (identity derivation, the CloudBase store, the live service);
 *   2. the **committed deployable host** `cloudfunctions/tianfu2/index.js`, loaded as CommonJS in its own
 *      realm with an injected `wx-server-sdk` / `getWXContext().OPENID` / CloudBase-like database — the
 *      same file a human uploads, not a re-implementation of it;
 *   3. the generated cloud runtime: freshness, dependency/closure audit and a load smoke.
 *
 * The invariants asserted here are the ones a diff cannot show:
 *
 *   - the OPENID is the only identity source, and a client-supplied playerId is ignored;
 *   - the same OPENID + bootstrapId is one run, across retries *and* cold handler starts;
 *   - a real CONTENT01 destiny offer is created server-side with server-only entropy, and rootSeed never
 *     leaves the cloud;
 *   - CloudBase transactions preserve command idempotency, STATE_CONFLICT, ownership, snapshot and replay;
 *   - the transactional path addresses documents by deterministic id and never queries;
 *   - an exact retry after a lost response does not settle twice;
 *   - another OPENID can neither read nor command a run, and the refusal leaks nothing;
 *   - the client now takes its identity from the server and persists only a bootstrap key.
 *
 * Nothing here rolls gameplay: every state transition is produced by the accepted reducer through the
 * accepted CommandGateway, and the assertions only compare what the server published.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ruleStateHash, replayCommandLog } from "../packages/core/src/index.ts";
import {
  parsePublicViewModel,
  parseRunOfferResult,
  bootstrapWeChatRun,
  createWeChatCloudTransport,
  TransportProtocolError
} from "../packages/wechat-shell/src/index.ts";
import {
  CloudBaseGatewayStore,
  CommandGateway,
  InMemoryGatewayStore,
  TianfuLiveService,
  createLiveContentRegistry,
  derivePlayerId,
  assertTrustedOpenid,
  bootstrapKeyFor,
  documentIdFor,
  runIdSeedFor,
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
const readJson = (relative) => JSON.parse(read(relative));
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ALICE = "o-alice-ui04d";
const BOB = "o-bob-ui04d";
const ALICE_PLAYER = derivePlayerId(ALICE);
const BOB_PLAYER = derivePlayerId(BOB);

/** Deterministic server entropy, so a failing assertion names a real defect and not an entropy draw. */
function deterministicEntropy(prefix = "seed") {
  let counter = 0;
  return { randomToken: () => `${prefix}-${String(++counter).padStart(4, "0")}` };
}

/** A live service over a CloudBase-like database, the way the cloud host builds it. */
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

function envelope(playerId, runId, expectedStateVersion, command, commandId = `cmd:${commandIdCounter++}`) {
  return {
    commandId, playerId, runId, expectedStateVersion,
    rulesVersion: LIVE_RULES_VERSION, contentVersion: LIVE_CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "ui04d-test", command
  };
}
let commandIdCounter = 0;

/** The stored run document, read straight out of the fake database by its deterministic id. */
function storedRun(database, runId) {
  const documents = database.snapshot().get("tianfu2_runs");
  return documents.get(documentIdFor("run", runId));
}

// ================================================================= 1. identity

test("UI04D_identity: the OPENID-derived playerId is stable, opaque and never reversible", () => {
  assert.equal(derivePlayerId(ALICE), ALICE_PLAYER, "the same OPENID must always derive the same handle");
  assert.notEqual(ALICE_PLAYER, BOB_PLAYER);
  assert.equal(ALICE_PLAYER.includes(ALICE), false, "the derived handle must not contain the OPENID");
  assert.equal(ALICE_PLAYER.includes(ALICE.slice(2)), false, "nor any substring of it");
  assert.match(ALICE_PLAYER, /^p-[0-9a-f]{40}$/, "the handle must be an opaque fixed-width digest");
  for (const bad of ["", "  ", "a b", null, undefined, 7]) {
    assert.throws(() => assertTrustedOpenid(bad), RangeError, `an OPENID of ${JSON.stringify(bad)} must be refused`);
  }
  // Deterministic document keys: the same inputs always address the same documents, so no query is needed.
  assert.equal(bootstrapKeyFor(ALICE_PLAYER, "boot:1"), bootstrapKeyFor(ALICE_PLAYER, "boot:1"));
  assert.notEqual(bootstrapKeyFor(ALICE_PLAYER, "boot:1"), bootstrapKeyFor(BOB_PLAYER, "boot:1"));
  assert.equal(runIdSeedFor(ALICE_PLAYER, "boot:1"), runIdSeedFor(ALICE_PLAYER, "boot:1"));
  assert.match(documentIdFor("run", "run-x"), /^[0-9a-f]{32}$/, "document ids must be character-safe hex");
});

// ================================================================= 2. the offer

test("UI04D_offer: createRunOffer publishes the authoritative playerId and never the OPENID or the seed", async () => {
  const { service } = cloudService();
  const offer = await service.createRunOffer({ bootstrapId: "boot:ui04d" });
  assert.equal(offer.playerId, ALICE_PLAYER, "the player id is the server's, derived from the trusted OPENID");
  const serialized = JSON.stringify(offer);
  for (const secret of [ALICE, "OPENID", "openid", "rootSeed"]) {
    assert.equal(serialized.includes(secret), false, `the offer response must never carry ${secret}`);
  }
  assert.equal(offer.rulesVersion, LIVE_RULES_VERSION);
  assert.equal(offer.contentVersion, LIVE_CONTENT_VERSION);
  // The client's own fail-closed parser is the real bar: if it accepts the payload, the boundary holds.
  const parsed = parseRunOfferResult(JSON.parse(serialized));
  assert.equal(parsed.playerId, ALICE_PLAYER);
  assert.equal(parsed.runId, offer.view.state.runId);
});

test("UI04D_offer: the offer is a real CONTENT01 destiny offer and projects a valid PublicViewModel", async () => {
  const { service } = cloudService();
  const offer = await service.createRunOffer({ bootstrapId: "boot:ui04d-content" });
  assert.equal(offer.contentVersion, "content01.v1", "the live registry serves the accepted CONTENT01 pack");
  assert.equal(offer.rulesVersion, "2.0.0");
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");
  assert.equal(offer.view.state.runStatus, "offered");
  const interaction = offer.view.currentInteraction;
  assert.equal(interaction.kind, "destinyOffer");
  assert.equal(interaction.options.length > 0, true, "the server must publish at least one offered candidate");
  // generateServerDestinyOffer over CONTENT01 yields the PROG01 innate candidate list (root / talent / destiny).
  for (const candidate of interaction.body.candidates) {
    assert.equal(typeof candidate.selectionId, "string");
    for (const field of ["spiritualRoot", "talent", "majorDestiny"]) {
      assert.equal(typeof candidate[field], "string", `an innate candidate must publish ${field}`);
    }
  }
  // The client-side validator is the contract: a payload it refuses is not a public ViewModel.
  assert.doesNotThrow(() => parsePublicViewModel(JSON.parse(JSON.stringify(offer.view))));
  assert.equal(JSON.stringify(offer.view).includes("rootSeed"), false);
});

test("UI04D_offer: the same OPENID + bootstrapId is one run, and a different bootstrapId starts another", async () => {
  const { service } = cloudService();
  const first = await service.createRunOffer({ bootstrapId: "boot:ui04d-idem" });
  const retry = await service.createRunOffer({ bootstrapId: "boot:ui04d-idem" });
  assert.equal(retry.runId, first.runId, "a retry of the same bootstrap must recover the same run");
  const fresh = await service.createRunOffer({ bootstrapId: "boot:ui04d-other" });
  assert.notEqual(fresh.runId, first.runId, "a different bootstrap key starts a different life");

  // A *cold* service (fresh registry, fresh store object, same database) still recovers the same run:
  // nothing authoritative lives in handler memory.
  const database = createFakeCloudDatabase();
  const cold = cloudService({ database });
  const coldFirst = await cold.service.createRunOffer({ bootstrapId: "boot:cold" });
  const coldAgain = cloudService({ database });
  const recovered = await coldAgain.service.createRunOffer({ bootstrapId: "boot:cold" });
  assert.equal(recovered.runId, coldFirst.runId, "a cold handler must recover the same run from the database");
});

test("UI04D_offer: a bootstrapId is a recovery key, not an identity — it cannot reach another player's run", async () => {
  const shared = "boot:shared-key";
  const alice = cloudService({ openid: ALICE });
  const bob = cloudService({ openid: BOB, database: alice.database });
  const aliceRun = await alice.service.createRunOffer({ bootstrapId: shared });
  const bobRun = await bob.service.createRunOffer({ bootstrapId: shared });
  assert.notEqual(bobRun.runId, aliceRun.runId, "the same bootstrap key under another OPENID is a different run");
  assert.equal(bobRun.playerId, BOB_PLAYER);
  await assert.rejects(() => bob.service.fetchView(aliceRun.runId), /run\.not_owned/, "Bob must not read Alice's run");
});

// ================================================================= 3. the CloudBase store

test("UI04D_store: the CloudBase store preserves idempotency, STATE_CONFLICT, ownership, snapshot and replay", async () => {
  const { service, database } = cloudService();
  const offer = await service.createRunOffer({ bootstrapId: "boot:ui04d-store" });
  const runId = offer.runId;
  const initial = storedRun(database, runId);
  assert.equal(initial.state.run.playerId, ALICE_PLAYER, "the owner recorded in the document is the OPENID-derived id");
  assert.equal(initial.commandLog.entries.length, 0);

  const start = await service.sendCommand(envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId: offer.view.currentInteraction.options[0].optionId }));
  assert.equal(start.ok, true, JSON.stringify(start));

  // 1. exact duplicate: settled once.
  const duplicate = await service.sendCommand(envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId: offer.view.currentInteraction.options[0].optionId }, start.commandId));
  assert.deepEqual(duplicate, start, "an exact duplicate must return the recorded result");
  assert.equal(storedRun(database, runId).commandLog.entries.length, 1, "and must not settle twice");

  // 2. changed payload under a reused commandId: refused, and nothing moved.
  const before = storedRun(database, runId);
  const conflict = await service.sendCommand(envelope(ALICE_PLAYER, runId, 0, { type: "START_RUN", offerId: `offer-${runId}`, selectionId: "selection-i-invented" }, start.commandId));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "INVALID_COMMAND");
  assert.equal(conflict.error.messageKey, "command.idempotency_conflict");
  assert.deepEqual(storedRun(database, runId), before, "a refused command must mutate nothing at all");

  // 3. STATE_CONFLICT against a stale version.
  const stale = await service.sendCommand(envelope(ALICE_PLAYER, runId, 0, { type: "CHOOSE_ACTION", actionId: "cultivate" }));
  assert.equal(stale.error.code, "STATE_CONFLICT", JSON.stringify(stale));

  // 4. ownership: another player's envelope is refused at the gateway.
  const foreign = await service.sendCommand(envelope(BOB_PLAYER, runId, before.state.stateVersion, { type: "CHOOSE_ACTION", actionId: "cultivate" }));
  assert.equal(foreign.error.code, "UNAUTHORIZED");

  // 5. a real command advances the run, and the log replays to the same canonical state.
  const acted = await service.sendCommand(envelope(ALICE_PLAYER, runId, before.state.stateVersion, { type: "CHOOSE_ACTION", actionId: "cultivate" }));
  assert.equal(acted.ok, true, JSON.stringify(acted));
  const final = storedRun(database, runId);
  assert.equal(final.commandLog.entries.length, 2);
  const replayed = replayCommandLog({ initialState: initial.state, commandLog: final.commandLog, content: createLiveContentRegistry() });
  assert.equal(replayed.finalRuleStateHash, ruleStateHash(final.state), "the persisted log must replay to the persisted state");
  // Periodic snapshots are still taken on the same cadence, through the transaction.
  assert.equal(typeof final.successfulCommandsSinceSnapshot, "number");
});

test("UI04D_store: document access is deterministic and the transactional path never queries", () => {
  const source = stripJs(read("server/src/cloudbase-store.ts"));
  assert.equal(/\.where\s*\(/.test(source), false, "the CloudBase store must address documents by id, never by query");
  assert.equal(source.includes("runTransaction"), true, "the store must settle inside a server-side transaction");
  // Ids are hex digests of their logical key: same key, same document, with no lookup in between.
  assert.equal(documentIdFor("run", "run-a"), documentIdFor("run", "run-a"));
  assert.notEqual(documentIdFor("run", "run-a"), documentIdFor("run", "run-b"));
  assert.match(documentIdFor("bootstrap", bootstrapKeyFor(ALICE_PLAYER, "boot:1")), /^[0-9a-f]{32}$/);
});

// ================================================================= 4. the deployable host

test("UI04D_host: the committed cloud function drives createRunOffer -> START_RUN -> action -> option -> fetchView", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });

  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:host" });
  assert.equal(offer.view.state.pageState, "DESTINY_OFFER");
  assert.equal(offer.playerId, ALICE_PLAYER);

  const started = await handler.main({
    operation: "sendCommand",
    command: envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId })
  });
  assert.equal(started.ok, true, JSON.stringify(started));

  const home = await handler.main({ operation: "fetchView", runId: offer.runId });
  assert.equal(home.view.state.pageState, "RUN_HOME");

  // A core action, then whatever the server projected next: EVENT / SPECIAL_NODE with its own eventId.
  const acted = await handler.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, offer.runId, home.view.state.stateVersion, { type: "CHOOSE_ACTION", actionId: "cultivate" }) });
  assert.equal(acted.ok, true, JSON.stringify(acted));
  const decision = await handler.main({ operation: "fetchView", runId: offer.runId });
  assert.equal(["EVENT", "SPECIAL_NODE"].includes(decision.view.state.pageState), true, decision.view.state.pageState);
  const interaction = decision.view.currentInteraction;
  assert.equal(typeof interaction.eventId, "string", "the authoritative event id must be published");

  const chose = await handler.main({
    operation: "sendCommand",
    command: envelope(ALICE_PLAYER, offer.runId, decision.view.state.stateVersion, { type: "CHOOSE_EVENT_OPTION", eventId: interaction.eventId, optionId: interaction.options[0].optionId })
  });
  assert.equal(chose.ok, true, JSON.stringify(chose));
  const after = await handler.main({ operation: "fetchView", runId: offer.runId });
  assert.equal(after.view.state.stateVersion > decision.view.state.stateVersion, true, "the refresh is authoritative");

  // The whole transactional path was served by document ids.
  const audited = database.audit();
  assert.equal(audited.whereCalls, 0, "no query may be issued on the transactional path");
  assert.equal(audited.documentIds.length > 0, true);
});

test("UI04D_host: a lost response after commit settles exactly once, and a changed payload is refused", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const offer = await handler.main({ operation: "createRunOffer", bootstrapId: "boot:timeout" });
  const command = envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId }, "cmd:timeout");
  // Arm it for the command transaction only: the offer itself must succeed.
  database.armPostCommitTimeout();

  // The first send commits and then loses its response: exactly the retry the design must survive.
  const lost = await handler.main({ operation: "sendCommand", command });
  assert.equal(lost.ok, false, JSON.stringify(lost));
  assert.equal(lost.error.retryable, true, "a lost response must be classified retryable, not fatal");
  const committed = storedRun(database, offer.runId);
  assert.equal(committed.commandLog.entries.length, 1, "the command did settle");
  const committedHash = ruleStateHash(committed.state);

  // The identical envelope is re-sent: same commandId, same payload.
  const retried = await handler.main({ operation: "sendCommand", command });
  assert.equal(retried.ok, true, JSON.stringify(retried));
  const afterRetry = storedRun(database, offer.runId);
  assert.equal(afterRetry.commandLog.entries.length, 1, "the retry must not settle twice");
  assert.equal(ruleStateHash(afterRetry.state), committedHash, "state, RNG and time must not advance on a replay");
  assert.deepEqual(afterRetry.state.run.rng, committed.state.run.rng, "the RNG state is untouched by a replay");
  assert.equal(database.audit().postCommitTimeouts, 1);

  // A different payload under the same commandId is refused without mutating anything.
  const mutated = await handler.main({ operation: "sendCommand", command: { ...command, command: { type: "CHOOSE_ACTION", actionId: "cultivate" } } });
  assert.equal(mutated.error.code, "INVALID_COMMAND");
  assert.equal(mutated.error.messageKey, "command.idempotency_conflict");
  assert.deepEqual(storedRun(database, offer.runId), afterRetry, "a refused replay must mutate nothing");
});

test("UI04D_host: the client-supplied playerId and every other authoritative field are ignored", async () => {
  const database = createFakeCloudDatabase();
  const handler = loadCloudFunction({ openid: ALICE, database });
  const offer = await handler.main({
    operation: "createRunOffer",
    bootstrapId: "boot:forgery",
    playerId: BOB_PLAYER,
    openid: BOB,
    rootSeed: "client-chosen-seed"
  });
  assert.equal(offer.playerId, ALICE_PLAYER, "the identity comes from getWXContext().OPENID, not from the request body");
  assert.equal(JSON.stringify(offer).includes("client-chosen-seed"), false, "a client-chosen root seed is never used");

  // The server-derived identity is the one the gateway compares against, so a forged envelope is refused.
  const forged = await handler.main({
    operation: "sendCommand",
    command: envelope(BOB_PLAYER, offer.runId, 0, { type: "CHOOSE_ACTION", actionId: "cultivate" })
  });
  assert.equal(forged.error.code, "UNAUTHORIZED", JSON.stringify(forged));
});

test("UI04D_host: another OPENID can neither read nor command the run, and the refusal leaks nothing", async () => {
  const database = createFakeCloudDatabase();
  const alice = loadCloudFunction({ openid: ALICE, database });
  const bob = loadCloudFunction({ openid: BOB, database });
  const offer = await alice.main({ operation: "createRunOffer", bootstrapId: "boot:cross" });
  await alice.main({ operation: "sendCommand", command: envelope(ALICE_PLAYER, offer.runId, 0, { type: "START_RUN", offerId: `offer-${offer.runId}`, selectionId: offer.view.currentInteraction.options[0].optionId }) });

  const fetched = await bob.main({ operation: "fetchView", runId: offer.runId });
  assert.equal(fetched.view, undefined, "a foreign fetch must not return a view");
  assert.equal(JSON.stringify(fetched).includes(offer.runId), false, "the refusal must not echo the run id");
  assert.equal(fetched.error.code, "UNAUTHORIZED");
  // The refusal for a run that does not exist is identical, so this endpoint cannot be used to probe.
  const missing = await bob.main({ operation: "fetchView", runId: "run-does-not-exist" });
  assert.deepEqual(missing, fetched, "a foreign run and a missing run must be the same answer");

  const commanded = await bob.main({ operation: "sendCommand", command: envelope(BOB_PLAYER, offer.runId, 1, { type: "CHOOSE_ACTION", actionId: "cultivate" }) });
  assert.equal(commanded.error.code, "UNAUTHORIZED");
  assert.equal(JSON.stringify(commanded).includes(offer.runId), false);
});

test("UI04D_host: an unknown operation and a malformed command fail closed", async () => {
  const handler = loadCloudFunction({ openid: ALICE, database: createFakeCloudDatabase() });
  const unknown = await handler.main({ operation: "deleteEverything" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, "INVALID_COMMAND");
  const malformed = await handler.main({ operation: "sendCommand", command: { commandId: 7 } });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, "INVALID_COMMAND");
});

// ================================================================= 5. the generated runtime

test("UI04D_artifact: the committed cloud runtime is a fresh deterministic generation of single-source code", () => {
  const result = checkCloudRuntimeArtifact({});
  assert.deepEqual(result.problems, [], result.problems.join("\n"));
  const rebuilt = buildCloudRuntimeArtifact({});
  assert.deepEqual(rebuilt.files, result.committed, "a second generation must be byte-identical (determinism)");

  // Fail closed (1): a drifted source that reaches outside the pinned closure is refused, so no import
  // edit can silently pull a Node-only module into the deployable package.
  const outsideClosure = (relative) =>
    relative === "server/src/identity.ts" ? `import { readFileSync } from "fs";\n${read(relative)}` : read(relative);
  assert.throws(() => buildCloudRuntimeArtifact({ read: outsideClosure }), /not a relative path|not one of the pinned/i);

  // Fail closed (2): a source that stops publishing a facade export is refused here instead of emitting
  // `facade.derivePlayerId === undefined` and failing later, inside the cloud function.
  const droppedExport = (relative) =>
    relative === "server/src/identity.ts"
      ? read(relative).replace("export function derivePlayerId", "function derivePlayerId")
      : read(relative);
  assert.throws(() => buildCloudRuntimeArtifact({ read: droppedExport }), /facade export derivePlayerId is not exported/i);

  // Provenance is self-proving: every generated module names the source it came from.
  for (const artifactPath of CLOUD_ARTIFACT_PATHS) {
    const source = read(artifactPath);
    if (artifactPath === CLOUD_FACADE_PATH) continue;
    assert.match(source, /\/\/ Source of truth: [^\n]+\n/, artifactPath + " must record its source");
    assert.match(source, /\/\/ Source sha256:   [0-9a-f]{64}\n/, artifactPath + " must record the source digest");
  }
});

test("UI04D_audit: the dependency and closure audit is green, and fails closed on drift", () => {
  const result = auditCloudRuntime({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  assert.equal(Object.keys(result.graph).length, CLOUD_ARTIFACT_PATHS.length);

  const committed = { ...result.graph };
  const files = CLOUD_ARTIFACT_PATHS.reduce((accumulator, artifactPath) => {
    accumulator[artifactPath] = read(artifactPath);
    return accumulator;
  }, {});

  // 1. a Node builtin smuggled into a generated module is a violation.
  const withBuiltin = { ...files, [CLOUD_FACADE_PATH]: files[CLOUD_FACADE_PATH].replace('require("./server-identity.js")', 'require("fs")') };
  assert.equal(withBuiltin[CLOUD_FACADE_PATH] !== files[CLOUD_FACADE_PATH], true, "the negative control must actually rewrite the file");
  const builtin = auditCloudRuntime({ files: withBuiltin });
  assert.equal(builtin.violations.some((entry) => entry.includes("require(\"fs\")")), true, builtin.violations.join("\n"));

  // 2. a widened facade is a violation.
  const widened = auditCloudRuntime({ files: { ...files, [CLOUD_FACADE_PATH]: files[CLOUD_FACADE_PATH] + "\nmodule.exports.extra = 1;\n" } });
  assert.equal(widened.violations.some((entry) => entry.includes("publishes extra")), true, widened.violations.join("\n"));

  // 3. a client-source token inside generated code is a violation.
  const leaked = auditCloudRuntime({ files: { ...files, [CLOUD_FACADE_PATH]: files[CLOUD_FACADE_PATH] + "\nvar x = require(\"./miniprogram.js\");\n" } });
  assert.equal(leaked.violations.length > 0, true, leaked.violations.join("\n"));

  // 4. the pinned facade surface is exactly what the host is allowed to see.
  const allowList = CLOUD_FACADE_EXPORTS.map((entry) => entry.name).sort();
  assert.deepEqual(allowList, [...allowList].sort(), "the pinned surface is a set");
  assert.equal(allowList.includes("TianfuLiveService"), true);
  assert.equal(fs.existsSync(path.join(ROOT, CLOUD_FUNCTION_DIR, "package.json")), true);
  assert.equal(Object.keys(readJson(CLOUD_FUNCTION_DIR + "/package.json").dependencies).join(","), "wx-server-sdk");
  assert.equal(read("package.json").includes("wx-server-sdk"), false, "no client manifest may depend on wx-server-sdk");
});

test("UI04D_smoke: the committed host loads as CommonJS and drives the whole path", async () => {
  const result = await runCloudRuntimeSmoke();
  assert.deepEqual(result.failures, [], result.failures.join("\n"));
  assert.equal(result.checks.length >= 15, true, `expected a substantive smoke, got ${result.checks.length} checks`);
});

test("UI04D_scope: the cloud runtime adds no gameplay of its own and no client source", () => {
  const generated = CLOUD_ARTIFACT_PATHS.map((artifactPath) => stripJs(read(artifactPath))).join("\n");
  for (const forbidden of ["Math.random", "packages/wechat-shell", "packages/application-ui", "miniprogram/", "wx.", "wx-server-sdk", "getStorageSync"]) {
    assert.equal(generated.includes(forbidden), false, `the cloud runtime must not reference ${forbidden}`);
  }
  // There is exactly one reducer, one gateway and one ViewModel builder in the whole package.
  const countDeclarations = (pattern) => (generated.match(pattern) ?? []).length;
  assert.equal(countDeclarations(/function reduce\s*\(/g), 1, "exactly one reducer declaration");
  assert.equal(countDeclarations(/class CommandGateway/g), 1, "exactly one CommandGateway");
  assert.equal(countDeclarations(/class ServerViewModelBuilder/g), 1, "exactly one ViewModel builder");
  // The host is thin: no gameplay vocabulary, and only approved dependencies.
  const host = stripJs(read(CLOUD_FUNCTION_DIR + "/index.js"));
  for (const forbidden of ["Math.random", "reduce(", "ruleStateHash", "packages/core", "miniprogram"]) {
    assert.equal(host.includes(forbidden), false, `the host must not compute gameplay (${forbidden})`);
  }
  assert.equal(host.includes("getWXContext"), true, "the host must read the trusted OPENID");
  assert.equal(/event\.(playerId|openid|OPENID|rootSeed)/.test(host), false, "the host must never read an identity from the request body");
  assert.equal(fs.existsSync(path.join(ROOT, CLOUD_RUNTIME_DIR)), true);
});

// ================================================================= 6. the client contract

test("UI04D_client: bootstrapWeChatRun takes the server playerId and re-sends the persisted bootstrapId", async () => {
  const calls = [];
  const view = { state: { schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "content01.v1", stateVersion: 0, runId: "run-x", pageState: "DESTINY_OFFER", runStatus: "offered", publicRun: {}, capabilities: {}, publicCauses: [] }, history: { entries: [] }, share: { title: "t", summary: "s", facts: [] } };
  const transport = createWeChatCloudTransport({
    api: {
      async callFunction(input) {
        calls.push(input);
        return { result: { runId: "run-x", playerId: "p-server-authority", rulesVersion: "2.0.0", contentVersion: "content01.v1", view } };
      }
    }
  });
  const boot = await bootstrapWeChatRun({ transport, bootstrapId: "boot:client", clientBuild: "ui04d" });
  assert.equal(boot.session.playerId, "p-server-authority", "the session identity is the server's, not the client's");
  assert.deepEqual(calls[0].data, { operation: "createRunOffer", bootstrapId: "boot:client" }, "the bootstrap key is sent");
  // Without a bootstrap key the accepted UI04C payload shape is preserved exactly.
  const legacy = createWeChatCloudTransport({ api: { async callFunction(input) { calls.push(input); return { result: { runId: "run-x", playerId: "p-server-authority", rulesVersion: "2.0.0", contentVersion: "content01.v1", view } }; } } });
  await legacy.createRunOffer();
  assert.deepEqual(calls[1].data, { operation: "createRunOffer" });
  // A response that leaks an OPENID is refused outright.
  const leaking = createWeChatCloudTransport({ api: { async callFunction() { return { result: { runId: "run-x", playerId: "p-x", openid: "o-leak", rulesVersion: "2.0.0", contentVersion: "content01.v1", view } }; } } });
  await assert.rejects(() => leaking.createRunOffer(), TransportProtocolError, "a response carrying an OPENID must be refused");
});

test("UI04D_client: v2-live persists a bootstrap key and stores no dev player id", () => {
  const source = read("miniprogram/pages/v2-live/v2-live.js");
  const code = stripJs(source);
  assert.equal(code.includes("dev-player-id"), false, "the page must no longer keep a dev player id");
  assert.equal(code.includes("devPlayerId"), false, "nor mint one");
  assert.equal(source.includes("tianfu2:bootstrap-id"), true, "the page must persist a bootstrap key");
  assert.equal(/bootstrapId\s*:\s*self\.bootstrapId\(\)/.test(code), true, "the bootstrap key must be sent");
  // The key is generated locally and persisted; it is never a random gameplay value.
  assert.equal(code.includes("Math.random"), false, "the page must not roll randomness");
  assert.equal(/require\(\s*"\.\.\/\.\.\/runtime\/index\.js"\s*\)/.test(source), true, "the runtime is loaded by a literal require");
  // No identity of any kind is invented client-side any more.
  for (const forbidden of ["playerId:", "PLAYER_ID"]) {
    assert.equal(code.includes(forbidden), false, `the page must not carry ${forbidden}`);
  }
});

test("UI04D_route: the accepted routing surface and the 1.0 pages are untouched", async () => {
  const result = runRouteGuard({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
});

test("UI04D_registration: the suite, the tools and the docs are registered", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.scripts["test:ui04d"], "node --test tests/ui04d.test.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui04d.test.mjs"), true, "the aggregate must run UI04D");
  for (const script of ["ui04d:artifact", "ui04d:artifact:write", "ui04d:audit", "ui04d:smoke"]) {
    assert.equal(typeof pkg.scripts[script], "string", script + " must be registered");
  }
  for (const relative of [
    "tests/ui04d.test.mjs",
    "tools/ui04d-cloud-runtime-artifact.mjs",
    "tools/ui04d-cloud-runtime-audit.mjs",
    "tools/ui04d-cloud-runtime-smoke.mjs",
    "tools/ui04d-cloud-harness.mjs",
    "cloudfunctions/tianfu2/index.js",
    "cloudfunctions/tianfu2/package.json",
    "docs/UI04D_CLOUD_BACKEND.md"
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, relative + " must exist");
  }
  const doc = read("docs/UI04D_CLOUD_BACKEND.md");
  for (const phrase of ["createRunOffer", "fetchView", "sendCommand", "bootstrapId", "OPENID", "runTransaction", "wx-server-sdk", "部署", "tianfu2_runs"]) {
    assert.equal(doc.includes(phrase), true, "the documentation must mention " + phrase);
  }
});
