import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import * as wire from "../packages/command-wire/src/index.ts";
import { RetryUnavailableError } from "../packages/application-ui/src/index.ts";
import { ContentRegistry } from "../packages/content/src/index.ts";
import { ACTION_TYPES, createOfferedRun, reduce } from "../packages/core/src/index.ts";
import * as core from "../packages/core/src/index.ts";
import { WeChatRunController, createWeChatPlatformStorage } from "../packages/wechat-shell/src/index.ts";
import {
  CommandGateway,
  GatewayApplicationTransport,
  InMemoryGatewayStore,
  ServerViewModelBuilder
} from "../server/src/index.ts";
import { auditClientRuntime, formatAuditReport } from "../tools/ui04a-client-runtime-audit.mjs";

/**
 * UI04A — client-safe command wire boundary.
 *
 * The task extracts the command/envelope wire codec out of gameplay Core into a dependency-free
 * client-safe module, without changing a single byte of protocol behaviour. So this suite has four
 * jobs:
 *   1. freeze the wire behaviour (canonical bytes, validation failures, parse behaviour) for
 *      representative commands, including the four the task names;
 *   2. prove the Core/server compatibility path is the *same code*, not a second definition;
 *   3. prove the client runtime graph no longer reaches gameplay Core — and that the audit which
 *      claims that can actually fail;
 *   4. prove the UI03 retry / restore / STATE_CONFLICT semantics survived the extraction.
 */

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const WIRE_PATH = "packages/command-wire/src/index.ts";
const WIRE_FIXTURE_DIR = "tests/fixtures/ui04a-client-runtime";

const base = {
  commandId: "cmd-1", playerId: "player-1", runId: "run-1", expectedStateVersion: 0,
  rulesVersion: "2.0.0", contentVersion: "2.0.0", clientPlatform: "dev", clientBuild: "test"
};
const envelope = (command, extra = {}) => ({ ...base, command, ...extra });

// ---------------------------------------------------------------- 1. frozen wire behaviour

/**
 * Canonical bytes are frozen verbatim. They were produced by the *original* Core implementation and
 * re-verified against a pristine `git archive` of the task base before being written down, so a
 * future change that silently reorders keys, drops a field or alters the encoding fails here.
 */
test("UI04A_wire: canonical serialized bytes are frozen for the representative commands", () => {
  const frozen = {
    START_RUN: '{"clientBuild":"test","clientPlatform":"dev","command":{"destinyId":"destiny-1","offerId":"offer-1","type":"START_RUN"},"commandId":"cmd-1","contentVersion":"2.0.0","expectedStateVersion":0,"playerId":"player-1","rulesVersion":"2.0.0","runId":"run-1"}',
    CHOOSE_ACTION: '{"clientBuild":"test","clientPlatform":"dev","command":{"actionId":"cultivate","type":"CHOOSE_ACTION"},"commandId":"cmd-1","contentVersion":"2.0.0","expectedStateVersion":0,"playerId":"player-1","rulesVersion":"2.0.0","runId":"run-1"}',
    CHOOSE_EVENT_OPTION: '{"clientBuild":"test","clientPlatform":"dev","command":{"eventId":"dev.first-choice","optionId":"continue","type":"CHOOSE_EVENT_OPTION"},"commandId":"cmd-1","contentVersion":"2.0.0","expectedStateVersion":0,"playerId":"player-1","rulesVersion":"2.0.0","runId":"run-1"}',
    ATTEMPT_BREAKTHROUGH: '{"clientBuild":"test","clientPlatform":"dev","command":{"type":"ATTEMPT_BREAKTHROUGH"},"commandId":"cmd-1","contentVersion":"2.0.0","expectedStateVersion":0,"playerId":"player-1","rulesVersion":"2.0.0","runId":"run-1"}'
  };
  const actual = {
    START_RUN: wire.serializeCommandEnvelope(envelope({ type: "START_RUN", offerId: "offer-1", destinyId: "destiny-1" })),
    CHOOSE_ACTION: wire.serializeCommandEnvelope(envelope({ type: "CHOOSE_ACTION", actionId: "cultivate" })),
    CHOOSE_EVENT_OPTION: wire.serializeCommandEnvelope(envelope({ type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "continue" })),
    ATTEMPT_BREAKTHROUGH: wire.serializeCommandEnvelope(envelope({ type: "ATTEMPT_BREAKTHROUGH" }))
  };
  assert.deepEqual(actual, frozen);

  // key order of the input must not change the bytes: canonicalization, not JSON.stringify order
  const shuffled = { runId: "run-1", command: { destinyId: "destiny-1", type: "START_RUN", offerId: "offer-1" }, clientBuild: "test", playerId: "player-1", commandId: "cmd-1", contentVersion: "2.0.0", clientPlatform: "dev", rulesVersion: "2.0.0", expectedStateVersion: 0 };
  assert.equal(wire.serializeCommandEnvelope(shuffled), frozen.START_RUN);

  // an optional field keeps its place in the canonical key order and is never invented
  assert.equal(
    wire.serializeCommandEnvelope(envelope({ type: "ABANDON_RUN" }, { issuedAtClient: 123 })),
    '{"clientBuild":"test","clientPlatform":"dev","command":{"type":"ABANDON_RUN"},"commandId":"cmd-1","contentVersion":"2.0.0","expectedStateVersion":0,"issuedAtClient":123,"playerId":"player-1","rulesVersion":"2.0.0","runId":"run-1"}'
  );
});

test("UI04A_wire: validation rejects the same invalid envelopes with the same paths and text", () => {
  const rejections = [
    [envelope({ type: "UNKNOWN" }), /^command\.type: has an invalid value$/],
    [envelope({ type: "ABANDON_RUN", gold: 1 }), /^command\.gold: is not allowed$/],
    [envelope({ type: "ABANDON_RUN" }, { realm: "x" }), /^envelope\.realm: is not allowed$/],
    [envelope({ type: "START_RUN", offerId: "o", destinyId: "d", selectionId: "s" }), /^command: must contain exactly one of destinyId or selectionId$/],
    [envelope({ type: "CHOOSE_ACTION", actionId: "ascend" }), /^command\.actionId: has an invalid value$/],
    [envelope({ type: "ATTEMPT_BREAKTHROUGH", difficulty: 3 }), /^command\.difficulty: is not allowed$/],
    [envelope({ type: "EQUIP_TECHNIQUE", componentId: "c", slot: -1 }), /^command\.slot: must be >= 0$/],
    [envelope({ type: "EQUIP_ARTIFACT", componentId: "c", slot: 1.5 }), /^command\.slot: must be a finite safe integer$/],
    [envelope({ type: "ABANDON_RUN" }, { expectedStateVersion: -1 }), /^envelope\.expectedStateVersion: must be >= 0$/],
    [envelope({ type: "ABANDON_RUN" }, { clientPlatform: "ios" }), /^envelope\.clientPlatform: has an invalid value$/],
    [envelope({ type: "ABANDON_RUN" }, { commandId: "" }), null],
    [null, /^envelope: must be an object$/],
    [envelope({ type: "ABANDON_RUN" }, { expectedStateVersion: Number.MAX_SAFE_INTEGER + 2 }), /^envelope\.expectedStateVersion: must be a finite safe integer$/]
  ];
  for (const [value, pattern] of rejections) {
    if (pattern === null) { assert.doesNotThrow(() => wire.validateCommandEnvelope(value)); continue; }
    assert.throws(
      () => wire.validateCommandEnvelope(value),
      (error) => error instanceof wire.CommandValidationError && error.code === "INVALID_COMMAND" && pattern.test(error.message),
      `expected rejection ${pattern} for ${JSON.stringify(value)}`
    );
  }
  // rejection is side-effect free and never mutates the candidate
  const candidate = envelope({ type: "ABANDON_RUN", gold: 99 });
  const snapshot = structuredClone(candidate);
  assert.throws(() => wire.validateCommandEnvelope(candidate));
  assert.deepEqual(candidate, snapshot);
  assert.strictEqual(wire.validateGameCommand({ type: "ABANDON_RUN" }).type, "ABANDON_RUN");
});

test("UI04A_wire: parse round-trips canonical bytes and rejects malformed serialized input", () => {
  const value = envelope({ type: "CHOOSE_EVENT_OPTION", eventId: "e", optionId: "o" });
  const serialized = wire.serializeCommandEnvelope(value);
  assert.deepEqual(wire.parseCommandEnvelope(serialized), JSON.parse(serialized));
  assert.equal(wire.serializeCommandEnvelope(wire.parseCommandEnvelope(serialized)), serialized);
  for (const [bad, pattern] of [["{oops", /^serialized: must contain valid JSON$/], ["", /^serialized: must contain valid JSON$/], [JSON.stringify({ commandId: "c" }), /^envelope\.playerId: is required$/]]) {
    assert.throws(() => wire.parseCommandEnvelope(bad), (error) => error instanceof wire.CommandValidationError && pattern.test(error.message));
  }
  assert.throws(() => wire.parseCommandEnvelope(5), (error) => error instanceof wire.CommandValidationError && error.code === "INVALID_COMMAND");
});

// ---------------------------------------------------------------- 2. one source of truth

test("UI04A_single_source: the Core command surface IS the wire module, object-for-object", () => {
  // Not "a re-export that happens to look the same" — the very same bindings. A copy would fail this.
  for (const name of ["APP_ERROR_CODES", "validateGameCommand", "validateCommandEnvelope", "serializeCommandEnvelope", "parseCommandEnvelope", "CommandValidationError"]) {
    assert.equal(core[name], wire[name], `core.${name} must be the identical binding exported by command-wire`);
  }
  assert.deepEqual(core.APP_ERROR_CODES, ["INVALID_COMMAND", "INVALID_OPTION", "STATE_CONFLICT", "UNAUTHORIZED", "CONTENT_MISMATCH", "RUN_NOT_ACTIVE", "RUN_OFFER_MISMATCH", "TRANSIENT"]);
  assert.deepEqual(core.COMMAND_ACTION_IDS, wire.COMMAND_ACTION_IDS);
});

test("UI04A_single_source: the protocol action vocabulary is pinned to the rule-side vocabulary", () => {
  // `command-wire` owns the *protocol* action ids (from .codex/contracts/command.ref); Core owns the
  // *rule* action ids. They are deliberately separate constants, so pin them equal in both directions.
  assert.deepEqual([...wire.COMMAND_ACTION_IDS], [...ACTION_TYPES]);
  assert.deepEqual([...ACTION_TYPES], ["cultivate", "travel", "worldly", "pursuit"]);
  for (const actionId of ACTION_TYPES) {
    assert.doesNotThrow(() => wire.validateGameCommand({ type: "CHOOSE_ACTION", actionId }));
  }
  assert.throws(() => wire.validateGameCommand({ type: "CHOOSE_ACTION", actionId: "ascend" }));
});

test("UI04A_single_source: command-wire is dependency-free — it imports nothing at all", () => {
  const source = stripComments(read(WIRE_PATH));
  assert.equal(/\bimport\b/.test(source), false, "command-wire must not contain any import statement");
  assert.equal(/\brequire\s*\(/.test(source), false, "command-wire must not contain require()");
  assert.equal(source.includes('from "'), false, "command-wire must not contain any from-clause");
  assert.equal(source.includes("packages/core"), false, "the boundary must not name gameplay Core at all");
  // and it is genuinely the moved codec, not a thin facade onto something else
  assert.equal(source.includes("canonicalValue"), true);
  assert.equal(source.includes("validateGameCommand"), true);
});

test("UI04A_compat: the Core gameplay callers keep their original import path and the server keeps validating", async () => {
  // source: gameplay modules still import the compat shim, so nothing had to be rewritten
  assert.equal(read("packages/core/src/reducer.ts").includes('from "./command.ts"'), true);
  assert.equal(read("packages/core/src/persistence.ts").includes('from "./command.ts"'), true);
  assert.equal(read("packages/core/src/index.ts").includes('export * from "./command.ts"'), true);
  assert.equal(read("server/src/command-gateway.ts").includes('from "../../packages/core/src/index.ts"'), true);

  // behaviour: the real server gateway still validates envelopes through that same codec. These three
  // outcomes happen before any run lookup, so no seeded run is needed.
  const gateway = new CommandGateway({ store: new InMemoryGatewayStore(), content: {} });
  const oversized = await gateway.sendCommand({ playerId: "player-1" }, envelope({ type: "ABANDON_RUN", pad: "x".repeat(17_000) }));
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error.messageKey, "command.payload_too_large");
  const malformed = await gateway.sendCommand({ playerId: "player-1" }, envelope({ type: "UNKNOWN" }));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, "INVALID_COMMAND");
  assert.equal(malformed.error.messageKey, "command.invalid");
  // a well-formed envelope passes envelope validation and is refused only because the run is unknown
  const valid = await gateway.sendCommand({ playerId: "player-1" }, envelope({ type: "ABANDON_RUN" }));
  assert.equal(valid.ok, false);
  assert.equal(valid.error.messageKey, "run.not_owned");
});

// ---------------------------------------------------------------- 3. the runtime boundary audit

test("UI04A_audit: the client runtime closure reaches no gameplay Core, Content or server module", () => {
  const result = auditClientRuntime();
  assert.deepEqual(result.violations, [], formatAuditReport(result));
  assert.deepEqual(result.roots, ["packages/application-ui/src/index.ts", "packages/wechat-shell/src/index.ts"]);
  const closure = result.report.join("\n");
  assert.equal(closure.includes("packages/command-wire/src/index.ts"), true);
  assert.equal(closure.includes("packages/core/"), false, "no runtime closure entry may live under gameplay Core");
  assert.equal(closure.includes("packages/content/"), false);
  assert.equal(closure.includes("server/"), false);
  // the two client entries really are in their own closures, so "no violation" is not "no walk"
  assert.equal(closure.includes("packages/application-ui/src/index.ts"), true);
  assert.equal(closure.includes("packages/wechat-shell/src/index.ts"), true);
});

/**
 * A green audit proves nothing unless it can fail. The controls are the two fixture files: one with a
 * real runtime edge into `packages/core/src/reducer.ts`, one with a type-only edge into
 * `packages/core/src/state.ts` (erased by the compiler, therefore legal).
 */
test("UI04A_audit: the audit is not vacuous (forbidden edge fails, type-only edge passes)", () => {
  for (const fixture of ["forbidden-edge.ts", "type-only-edge.ts"]) {
    assert.equal(fs.existsSync(path.join(ROOT, WIRE_FIXTURE_DIR, fixture)), true, `${fixture} must exist`);
  }
  const forbidden = auditClientRuntime([`${WIRE_FIXTURE_DIR}/forbidden-edge.ts`]);
  assert.notEqual(forbidden.violations.length, 0, "the audit must detect a real gameplay runtime dependency");
  assert.equal(forbidden.violations.some((line) => line.includes("packages/core/src/reducer.ts")), true, forbidden.violations.join("\n"));
  assert.equal(forbidden.violations.some((line) => line.includes("packages/core/src/rng.ts")), true, "the walk must follow the graph transitively");
  assert.equal(formatAuditReport(forbidden).includes("PASS"), false);

  const typeOnly = auditClientRuntime([`${WIRE_FIXTURE_DIR}/type-only-edge.ts`]);
  assert.deepEqual(typeOnly.violations, [], "a type-only import is erased and must not fail the runtime audit");
  assert.equal(formatAuditReport(typeOnly).includes("PASS"), true);
  // and the walk is real: the closure of the type-only fixture is the fixture alone
  assert.deepEqual(typeOnly.report, [`${WIRE_FIXTURE_DIR}/type-only-edge.ts: runtime closure = [${WIRE_FIXTURE_DIR}/type-only-edge.ts]`]);

  // fail closed on an unresolvable specifier rather than silently skipping it
  const saved = fs.readFileSync(path.join(ROOT, WIRE_FIXTURE_DIR, "type-only-edge.ts"), "utf8");
  const broken = path.join(ROOT, WIRE_FIXTURE_DIR, "unresolvable-edge.ts");
  fs.writeFileSync(broken, 'import { thing } from "../../../packages/core/src/nowhere.ts";\nexport const x = thing;\n');
  try {
    const unresolvable = auditClientRuntime([`${WIRE_FIXTURE_DIR}/unresolvable-edge.ts`]);
    assert.equal(unresolvable.violations.some((line) => line.includes("cannot resolve relative specifier")), true, unresolvable.violations.join("\n"));
  } finally {
    fs.rmSync(broken, { force: true });
    assert.equal(fs.readFileSync(path.join(ROOT, WIRE_FIXTURE_DIR, "type-only-edge.ts"), "utf8"), saved);
  }
});

test("UI04A_scope: only the compat shim inside Core mentions command-wire", () => {
  const coreDir = path.join(ROOT, "packages/core/src");
  const referencing = fs.readdirSync(coreDir).filter((file) => read(`packages/core/src/${file}`).includes("command-wire"));
  assert.deepEqual(referencing, ["command.ts"], "the extraction must not ripple into any gameplay module");
  // the gameplay modules the task forbids touching are untouched in their import structure
  for (const file of ["reducer.ts", "state.ts", "rng.ts", "director.ts", "cause.ts", "progression.ts", "risk.ts", "build.ts", "npc.ts", "participants.ts"]) {
    assert.equal(read(`packages/core/src/${file}`).includes("command-wire"), false, `${file} must not know about the wire boundary`);
  }
});

// ---------------------------------------------------------------- 4. UI03 semantics preserved

const RULES_VERSION = "2.0.0";
const CONTENT_VERSION = "dev-0.1.0";
const PLAYER_ID = "player-ui04a";
const DESTINY_IDS = ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"];
const readJson = (relative) => JSON.parse(read(relative));

function contentRegistry() {
  const content = new ContentRegistry();
  content.register(readJson("packages/content/dev-fixtures/minimal-pack.json"));
  return content;
}

function offeredState(runId) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, runId, playerId: PLAYER_ID,
    rootSeed: "server-only-root-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer-${runId}`, destinyIds: DESTINY_IDS, age: 20, maxAge: 100, runName: "UI04A 问道",
      realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 },
      resources: { spiritStone: 5, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  });
}

/** An authoritative active run: START_RUN applied by the real reducer to the real offer. */
function activeState(runId) {
  return reduce({
    state: offeredState(runId),
    command: { type: "START_RUN", offerId: `offer-${runId}`, destinyId: DESTINY_IDS[0] },
    context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content: contentRegistry(), commandId: `cmd:${runId}:bootstrap` }
  }).state;
}

class RawWeChatStorage {
  map = new Map();
  getStorageSync(key) { return this.map.has(key) ? this.map.get(key) : ""; }
  setStorageSync(key, value) { this.map.set(key, value); }
}

function commandIds(prefix) { let sequence = 0; return () => `${prefix}:${(sequence += 1)}`; }

async function stack(runId, { failFirstSubmit = false, seed = "active" } = {}) {
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  store.seedRun(seed === "offered" ? offeredState(runId) : activeState(runId));
  let firstCall = true;
  const gateway = new CommandGateway({
    store, content,
    ...(failFirstSubmit ? { beforeCommit: () => { if (firstCall) { firstCall = false; throw new Error("simulated transient failure"); } } } : {}),
    projectView: (state) => builder.build(state)
  });
  const real = new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID });
  const sent = [];
  const transport = {
    sendCommand: async (value) => { sent.push(structuredClone(value)); return await real.sendCommand(value); },
    fetchView: (id) => real.fetchView(id),
    createRunOffer: () => real.createRunOffer()
  };
  const raw = new RawWeChatStorage();
  const session = { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui04a-test" };
  const controller = new WeChatRunController({ transport, storage: createWeChatPlatformStorage(raw), session, commandIdFactory: commandIds(`cmd:ui04a:${runId}`) });
  return { store, gateway, raw, session, controller, sent };
}

test("UI04A_ui03: retry re-sends the identical serialized envelope and still settles exactly once", async () => {
  const runId = "run-ui04a-retry";
  const { store, controller, sent } = await stack(runId, { failFirstSubmit: true });
  await controller.load();
  const before = store.readRun(runId).state.stateVersion;

  const failed = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "TRANSIENT");
  assert.equal(controller.submission().interactionState, "retryableError");
  assert.equal(store.readRun(runId).state.stateVersion, before, "a transient failure must not commit");

  const retried = await controller.retry();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].commandId, sent[0].commandId);
  assert.deepEqual(sent[1], sent[0], "the retry must reuse the identical commandId and payload");
  assert.equal(wire.serializeCommandEnvelope(sent[1]), wire.serializeCommandEnvelope(sent[0]), "and therefore the identical canonical bytes");
  assert.equal(store.readRun(runId).commandLog.entries.length, 1, "the command must settle exactly once");
  assert.equal(store.readRun(runId).state.stateVersion, before + 1);
  await assert.rejects(() => controller.retry(), RetryUnavailableError);
});

test("UI04A_ui03: the persisted pending envelope IS the wire codec's canonical bytes", async () => {
  const runId = "run-ui04a-pending";
  const { raw, controller, sent } = await stack(runId, { failFirstSubmit: true });
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.travel" });
  const persisted = raw.map.get(`tianfu2:pending-command:${runId}`);
  assert.equal(typeof persisted, "string");
  assert.equal(persisted, wire.serializeCommandEnvelope(sent[0]), "the pending record must be exactly the client-safe codec's output");
  // and the persisted bytes parse back into the same envelope the controller built
  assert.deepEqual(wire.parseCommandEnvelope(persisted), sent[0]);
  // a second controller over the same raw storage recovers the byte-identical pending command
  const session = { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui04a-test" };
  const recovered = new WeChatRunController({
    transport: { sendCommand: async () => { throw new Error("must not be called"); }, fetchView: async () => controller.view(), createRunOffer: async () => ({}) },
    storage: createWeChatPlatformStorage(raw), session, commandIdFactory: () => "must-not-be-used"
  });
  await recovered.restore();
  assert.equal(recovered.submission().pendingCommandId, sent[0].commandId);
  assert.equal(recovered.submission().interactionState, "retryableError");
});

test("UI04A_ui03: STATE_CONFLICT still refreshes and needs an explicit reconfirmation", async () => {
  const runId = "run-ui04a-conflict";
  const { store, gateway, controller, sent } = await stack(runId, { seed: "offered" });
  await controller.load();
  assert.equal(controller.pageModel().pageState, "DESTINY_OFFER");
  assert.equal(controller.pageModel().stateVersion, 0);

  // move the run on out-of-band so the controller's ViewModel is stale
  const outside = await gateway.sendCommand({ playerId: PLAYER_ID }, {
    commandId: "cmd:ui04a:outside", playerId: PLAYER_ID, runId, expectedStateVersion: 0,
    rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientPlatform: "dev", clientBuild: "ui04a-outside",
    command: { type: "START_RUN", offerId: `offer-${runId}`, destinyId: DESTINY_IDS[0] }
  });
  assert.equal(outside.ok, true, JSON.stringify(outside));
  const latestVersion = store.readRun(runId).state.stateVersion;
  assert.equal(latestVersion, 1);

  const conflicted = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.error.code, "STATE_CONFLICT");
  assert.equal(sent[0].expectedStateVersion, 0, "the stale envelope really carried the stale version");
  assert.equal(controller.submission().requiresReconfirmation, true);
  assert.equal(controller.submission().view.state.stateVersion, latestVersion);
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  await assert.rejects(() => controller.retry(), RetryUnavailableError, "a conflict must not be silently retried");
  await assert.rejects(() => controller.submit({ kind: "coreAction", intentId: "core.cultivate" }), RetryUnavailableError);
  assert.equal(sent.length, 1, "a refused resubmission must not reach the transport");

  const reconfirmed = await controller.reconfirm({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(reconfirmed.ok, true, JSON.stringify(reconfirmed));
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].commandId, sent[0].commandId, "reconfirmation must use a fresh commandId");
  assert.equal(sent[1].expectedStateVersion, latestVersion, "reconfirmation must target the latest stateVersion");
  assert.equal(controller.submission().requiresReconfirmation, false);
  // only the out-of-band command and the *reconfirmed* one may have committed; the conflicted
  // attempt must have left no trace (G14)
  assert.deepEqual(
    store.readRun(runId).commandLog.entries.map((entry) => entry.envelope.commandId),
    ["cmd:ui04a:outside", sent[1].commandId]
  );
  assert.notEqual(sent[1].commandId, sent[0].commandId);
});

// ---------------------------------------------------------------- 5. docs, registration, route scope

test("UI04A_registration: the dedicated suite and the audit are registered", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:ui04a"], "node --test tests/ui04a.test.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui04a.test.mjs"), true, "the aggregate must run UI04A");
  assert.equal(pkg.scripts["ui04a:audit"], "node tools/ui04a-client-runtime-audit.mjs");
  assert.equal(fs.existsSync(path.join(ROOT, "tests/ui04a.test.mjs")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "tools/ui04a-client-runtime-audit.mjs")), true);
});

test("UI04A_docs: the boundary, the compat shim and the remaining UI04B work are documented", () => {
  const doc = read("docs/UI04A_CLIENT_WIRE_BOUNDARY.md");
  for (const phrase of ["command-wire", "packages/core/src/command.ts", "CommandSubmissionController", "UI04B", "client", "re-export", "import type"]) {
    assert.equal(doc.includes(phrase), true, `documentation must mention ${phrase}`);
  }
  assert.equal(/UI04A/.test(doc), true);
});

test("UI04A_scope: no default route, legacy 1.0 page or gameplay surface moved", () => {
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-preview/v2-preview");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
  // no transport/platform global entered the neutral layers
  for (const file of ["packages/command-wire/src/index.ts", "packages/application-ui/src/index.ts", "packages/wechat-shell/src/index.ts"]) {
    const source = stripJs(read(file));
    for (const forbidden of ["wx.", "tt.", "wx.request", "cloudfunctions"]) {
      assert.equal(source.includes(forbidden), false, `${file} must not reference ${forbidden}`);
    }
  }
});
