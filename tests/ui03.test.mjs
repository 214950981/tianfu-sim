import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { RetryUnavailableError, SubmissionLockedError } from "../packages/application-ui/src/index.ts";
import { ContentRegistry } from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, validateGameState } from "../packages/core/src/index.ts";
import {
  ArchiveUnavailableError,
  IntentUnavailableError,
  WeChatRunController,
  createWeChatPlatformStorage
} from "../packages/wechat-shell/src/index.ts";
import {
  CommandGateway,
  GatewayApplicationTransport,
  InMemoryGatewayStore,
  ServerViewModelBuilder,
  generateServerDestinyOffer
} from "../server/src/index.ts";

/**
 * UI03 — live session controller / E2E wiring.
 *
 * Every gameplay round trip below goes through the *real* CommandGateway + GatewayApplicationTransport
 * + ServerViewModelBuilder. Only the storage port and the commandId factory are test doubles, exactly
 * as the platform boundary requires. The controller is never handed a hand-authored public ViewModel,
 * so whatever it submits has to be derivable from what the server actually published.
 *
 * The controller owns the *in-life* loop (RUN_HOME and after), so the seeds are authoritative active
 * runs: START_RUN is applied through the real reducer, never faked into `publicRun`.
 */

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const RULES_VERSION = "2.0.0";
const CONTENT_VERSION = "dev-0.1.0";
const PLAYER_ID = "player-ui03";
const DESTINY_IDS = ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"];

/** Assertions about the package must inspect code, not prose (the docs name `wx` on purpose). */
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const pack = JSON.parse(read("packages/content/dev-fixtures/minimal-pack.json"));
function contentRegistry() { const content = new ContentRegistry(); content.register(pack); return content; }

function offerFixture(runId) {
  return {
    offerId: `offer-${runId}`, age: 20, maxAge: 100, runName: "UI03 问道",
    realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 },
    resources: { spiritStone: 5, items: {} },
    availableActions: ["cultivate", "travel", "worldly", "pursuit"],
    world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
  };
}

function offered(runId) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, runId, playerId: PLAYER_ID,
    rootSeed: "server-only-root-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: { ...offerFixture(runId), destinyIds: DESTINY_IDS }
  });
}

/** An authoritative active run: START_RUN applied by the real reducer to the real offer. */
function activeState(runId) {
  return reduce({
    state: offered(runId),
    command: { type: "START_RUN", offerId: `offer-${runId}`, destinyId: DESTINY_IDS[0] },
    context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content: contentRegistry(), commandId: `cmd:${runId}:bootstrap` }
  }).state;
}

/** A run started from the real server destiny offer, so the ordinary-breakthrough gate is real. */
function offeredWithInnateProfile(runId) {
  const generated = generateServerDestinyOffer({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, runId, playerId: PLAYER_ID,
    rootSeed: "server-only-root-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] }, content: contentRegistry(),
    fixture: { ...offerFixture(runId), age: 24, runName: "UI03 突破" }
  });
  const selectionId = generated.state.run.offer.innateProfiles[0].selectionId;
  return reduce({
    state: generated.state,
    command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId },
    context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content: contentRegistry(), commandId: `cmd:${runId}:bootstrap` }
  }).state;
}

/** An authoritative SPECIAL_NODE page state (the page state comes from current.kind, as in the contract). */
function specialNodeState(started, status, kind) {
  return validateGameState({
    ...started,
    stateVersion: started.stateVersion + 1,
    run: { ...started.run, status, events: { history: [], current: { eventId: "dev.ordinary-fallback", kind, instanceId: `inst-ui03-${kind}` } } }
  });
}

/**
 * The in-memory double for the raw WeChat storage API, plus the injected adapter over the *same* store.
 * The E2E path uses the adapter, so the boundary is exercised rather than bypassed.
 */
class RawWeChatStorage {
  map = new Map();
  getStorageSync(key) { return this.map.has(key) ? this.map.get(key) : ""; }
  setStorageSync(key, value) { this.map.set(key, value); }
}

/** The real transport, decorated so every submitted envelope is observable. Behaviour is unchanged. */
function recordTransport(real) {
  const sent = [];
  return {
    sent,
    sendCommand: async (envelope) => { sent.push(structuredClone(envelope)); return await real.sendCommand(envelope); },
    fetchView: (runId) => real.fetchView(runId),
    createRunOffer: () => real.createRunOffer()
  };
}

function commandIds(prefix) { let sequence = 0; return () => `${prefix}:${(sequence += 1)}`; }

/** Full real stack: store <- gateway <- transport <- recorder <- controller <- injected storage adapter. */
function stack(runId, initial = activeState(runId)) {
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content, { capabilities: { PlatformCapability: true, ShareCapability: true, AiNarrativeCapability: true } });
  const store = new InMemoryGatewayStore();
  store.seedRun(initial);
  const gateway = new CommandGateway({ store, content, projectView: (state) => builder.build(state) });
  const transport = recordTransport(new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID }));
  const raw = new RawWeChatStorage();
  const controller = new WeChatRunController({
    transport,
    storage: createWeChatPlatformStorage(raw),
    session: { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" },
    commandIdFactory: commandIds(`cmd:ui03:${runId}`)
  });
  return { content, builder, store, gateway, transport, raw, controller, sent: transport.sent };
}

function keySet(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => keySet(entry, result));
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { result.add(key); keySet(entry, result); }
  return result;
}

/** The authoritative current event id, read straight out of the stored run. */
const authoritativeEventId = (store, runId) => store.readRun(runId).state.run.events.current.eventId;
const runIdOf = (name) => `run-ui03-${name}`;
const choose = (optionId) => ({ kind: "interactionOption", optionId });

// ---------------------------------------------------------------- seam and ownership

test("UI03_seam: the live controller is wired through the port set only, never through a platform global", () => {
  const shell = stripJs(read("packages/wechat-shell/src/index.ts"));
  for (const forbidden of ["wx.", "tt.", "Math.random", "Date.now", "fetch(", "eval(", "new Function"]) {
    assert.equal(shell.includes(forbidden), false, `wechat-shell must not contain ${forbidden}`);
  }
  const specifiers = [...shell.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(specifiers.length > 0, true);
  for (const specifier of specifiers) {
    assert.equal(/(^|[^a-z])server\//.test(specifier), false, `wechat-shell must not import the server layer: ${specifier}`);
  }
  assert.equal(specifiers.some((specifier) => specifier.includes("platform-contract")), true, "the controller speaks the platform-neutral port");
  assert.equal(specifiers.some((specifier) => specifier.includes("application-ui")), true, "the controller delegates submission");
});

test("UI03_ownership: the shell persists nothing itself; the pending envelope is CommandSubmissionController's", async () => {
  const shell = stripJs(read("packages/wechat-shell/src/index.ts"));
  // the shell never calls the storage port: every write has to go through the submission controller
  assert.equal(/\.(?:getLocal|setLocal)\s*\(/.test(shell), false, "wechat-shell must not touch the storage port directly");
  assert.equal(shell.includes("CommandSubmissionController"), true);

  // behavioural: a transient failure leaves a pending envelope that a *fresh* WeChatRunController
  // recovers over the same raw storage with the identical commandId. A second envelope/id engine could
  // not satisfy that, because it would key its own record.
  const runId = runIdOf("pending");
  let firstCall = true;
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  store.seedRun(activeState(runId));
  const gateway = new CommandGateway({
    store, content,
    beforeCommit: () => { if (firstCall) { firstCall = false; throw new Error("simulated transient failure"); } },
    projectView: (state) => builder.build(state)
  });
  const transport = recordTransport(new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID }));
  const raw = new RawWeChatStorage();
  const session = { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" };
  const first = new WeChatRunController({ transport, storage: createWeChatPlatformStorage(raw), session, commandIdFactory: commandIds("cmd:ui03:pending") });
  await first.load();
  const failed = await first.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "TRANSIENT");
  assert.equal(first.submission().interactionState, "retryableError");
  const pendingCommandId = first.submission().pendingCommandId;
  assert.equal(typeof pendingCommandId, "string");

  const second = new WeChatRunController({ transport, storage: createWeChatPlatformStorage(raw), session, commandIdFactory: commandIds("cmd:ui03:must-not-be-used") });
  await second.restore();
  assert.equal(second.submission().pendingCommandId, pendingCommandId, "restart recovery must reuse the identical pending envelope");
  const retried = await second.retry();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(store.readRun(runId).commandLog.entries.length, 1, "the command must settle exactly once");
  assert.equal(store.readRun(runId).state.stateVersion, 2, "the seed was version 1; exactly one commit may follow");
});

// ---------------------------------------------------------------- E2E: core action -> EVENT -> choice

test("UI03_e2e: a real gateway round trip runs core action -> EVENT -> event choice -> refreshed RUN_HOME", async () => {
  const runId = runIdOf("e2e");
  const { store, controller, sent } = stack(runId);
  await controller.load();
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  assert.deepEqual(controller.pageModel().coreIntents.map((intent) => intent.command), [
    { type: "CHOOSE_ACTION", actionId: "cultivate" },
    { type: "CHOOSE_ACTION", actionId: "travel" },
    { type: "CHOOSE_ACTION", actionId: "worldly" },
    { type: "CHOOSE_ACTION", actionId: "pursuit" }
  ]);

  const acted = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(acted.ok, true, JSON.stringify(acted));
  // the transition came from a refreshed authoritative ViewModel, not from a local guess
  assert.equal(controller.pageModel().pageState, "EVENT");
  assert.equal(controller.pageModel().stateVersion, store.readRun(runId).state.stateVersion);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].command, { type: "CHOOSE_ACTION", actionId: "cultivate" });

  const decision = controller.pageModel().interaction;
  const eventId = authoritativeEventId(store, runId);
  assert.equal(eventId, "dev.first-choice");
  assert.equal(decision.eventId, eventId, "the projected event id must be the authoritative current event");
  assert.notEqual(decision.interactionId, decision.eventId, "the interaction id is an instance identity and must never be reused as the event id");
  assert.equal(store.readRun(runId).state.run.events.current.instanceId, decision.interactionId);
  assert.equal(decision.options.length > 1, true);
  assert.equal(decision.options.some((option) => option.riskPresentation !== undefined), true);

  const chosen = decision.options[0].optionId;
  const resolved = await controller.submit(choose(chosen));
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(sent.length, 2);
  assert.deepEqual(Object.keys(sent[1].command).sort(), ["eventId", "optionId", "type"]);
  assert.deepEqual(sent[1].command, { type: "CHOOSE_EVENT_OPTION", eventId, optionId: chosen });
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  assert.equal(controller.pageModel().stateVersion, store.readRun(runId).state.stateVersion);
  assert.equal(controller.pageModel().interaction, undefined);
  // the resolved event is now public history, carrying the same id the controller had to use
  assert.equal(controller.view().history.entries.some((entry) => entry.data?.eventId === eventId), true);
  assert.equal(store.readRun(runId).commandLog.entries.length, 2, "exactly two commands may have committed");
});

test("UI03_e2e: the option command is derived only from the authoritative interaction (fail-closed controls)", async () => {
  const runId = runIdOf("option-guard");
  const { store, controller, sent } = stack(runId);
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(controller.pageModel().pageState, "EVENT");
  const before = store.readRun(runId);

  await assert.rejects(() => controller.submit(choose("not-an-option")), IntentUnavailableError);
  await assert.rejects(() => controller.submit({ kind: "coreAction", intentId: "core.ascend" }), IntentUnavailableError);
  await assert.rejects(() => controller.submit({ kind: "specialAction", intentId: "special.attemptBreakthrough" }), IntentUnavailableError);
  assert.equal(sent.length, 1, "a rejected intent must never reach the transport");
  assert.deepEqual(store.readRun(runId), before, "a rejected intent must not touch the run");
  // The guard is not vacuous: an interaction whose authoritative event id was not published must be
  // refused rather than reconstructed from the interaction id or from a presentation key.
  const stripped = structuredClone(controller.view());
  delete stripped.currentInteraction.eventId;
  const isolated = new WeChatRunController({
    transport: recordTransport(new GatewayApplicationTransport(new CommandGateway({ store, content: contentRegistry() }), { playerId: PLAYER_ID })),
    storage: createWeChatPlatformStorage(new RawWeChatStorage()),
    session: { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" },
    commandIdFactory: commandIds("cmd:ui03:unused"),
    initialView: stripped
  });
  await assert.rejects(() => isolated.submit(choose("continue")), IntentUnavailableError);
});

// ---------------------------------------------------------------- E2E: breakthrough

test("UI03_e2e: ATTEMPT_BREAKTHROUGH round trips from a server-projected available state", async () => {
  const runId = runIdOf("breakthrough");
  const started = offeredWithInnateProfile(runId);
  const ready = validateGameState({
    ...started,
    stateVersion: started.stateVersion + 2,
    run: { ...started.run, nodeIndex: 12, age: 27, realm: { ...started.run.realm, cultivation: 10_000, cultivationBps: 10_000, realmFoundationBps: 5_400 } }
  });
  const { store, controller, sent } = stack(runId, ready);
  await controller.load();
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  const special = controller.pageModel().specialIntents;
  assert.equal(special.length, 1);
  assert.equal(special[0].intentId, "special.attemptBreakthrough");
  assert.equal(special[0].enabled, true, "the seed must be genuinely projected as available");
  assert.equal(/difficulty|odds|chance|rng|score/.test(JSON.stringify(special)), false, "the projection must carry no client-computable odds");

  const result = await controller.submit({ kind: "specialAction", intentId: "special.attemptBreakthrough" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(sent[0].command, { type: "ATTEMPT_BREAKTHROUGH" });
  assert.deepEqual(Object.keys(sent[0].command), ["type"], "no client-authored score/difficulty/modifier field may exist");
  assert.equal(store.readRun(runId).state.run.realm.id, "qi-refining", "the authoritative realm must have advanced");
  assert.equal(controller.pageModel().runStatus, "active");
  assert.equal(controller.pageModel().stateVersion, store.readRun(runId).state.stateVersion);
});

test("UI03_e2e: breakthrough is refused when the server does not project it as available", async () => {
  // (a) the projection exists but is unavailable
  const blockedId = runIdOf("breakthrough-blocked");
  const started = offeredWithInnateProfile(blockedId);
  const incomplete = validateGameState({
    ...started,
    stateVersion: started.stateVersion + 1,
    run: { ...started.run, realm: { ...started.run.realm, cultivation: 3_200, cultivationBps: 3_200 } }
  });
  const blocked = stack(blockedId, incomplete);
  await blocked.controller.load();
  assert.equal(blocked.controller.pageModel().specialIntents[0].enabled, false);
  await assert.rejects(() => blocked.controller.submit({ kind: "specialAction", intentId: "special.attemptBreakthrough" }), IntentUnavailableError);
  assert.equal(blocked.sent.length, 0);
  assert.equal(blocked.store.readRun(blockedId).state.stateVersion, incomplete.stateVersion);

  // (b) the projection does not exist at all (no authoritative InnateProfile)
  const absentId = runIdOf("breakthrough-absent");
  const absent = stack(absentId);
  await absent.controller.load();
  assert.deepEqual(absent.controller.pageModel().specialIntents, []);
  await assert.rejects(() => absent.controller.submit({ kind: "specialAction", intentId: "special.attemptBreakthrough" }), IntentUnavailableError);
  assert.equal(absent.sent.length, 0);
});

// ---------------------------------------------------------------- SPECIAL_NODE parity

test("UI03_e2e: SPECIAL_NODE option flow uses the same authoritative interaction boundary as EVENT", async () => {
  const runId = runIdOf("special-active");
  const { store, controller, sent } = stack(runId, specialNodeState(offeredWithInnateProfile(runId), "active", "combat"));
  await controller.load();
  assert.equal(controller.pageModel().pageState, "SPECIAL_NODE");
  const interaction = controller.pageModel().interaction;
  const eventId = authoritativeEventId(store, runId);
  assert.equal(interaction.eventId, eventId);
  assert.deepEqual(interaction.options.map((option) => option.optionId), ["continue"]);

  const result = await controller.submit(choose("continue"));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(sent[0].command, { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "continue" });
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  assert.equal(controller.view().history.entries.length, 1);
});

test("UI03_back: unresolved EVENT and SPECIAL_NODE cannot be ordinarily backed out through the live controller", async () => {
  const runId = runIdOf("back-event");
  const { controller } = stack(runId);
  await controller.load();
  assert.equal(controller.pageModel().shell.ordinaryBackAllowed, true, "an idle RUN_HOME may be left");
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(controller.pageModel().pageState, "EVENT");
  assert.equal(controller.pageModel().shell.ordinaryBackAllowed, false, "an unresolved EVENT must keep back disabled");
  // the lock is a property of the *authoritative* interaction, not of the last settled command
  assert.equal(controller.submission().interactionState, "confirmed");
  await controller.submit(choose(controller.pageModel().interaction.options[0].optionId));
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  assert.equal(controller.pageModel().shell.ordinaryBackAllowed, true, "resolving the decision releases the lock");

  // An *active* run in a special node is the real SPECIAL_NODE case, so the back-lock below is asserted
  // against the page state that actually carries it.
  const specialId = runIdOf("back-special");
  const special = stack(specialId, specialNodeState(offeredWithInnateProfile(specialId), "active", "combat"));
  await special.controller.load();
  assert.equal(special.controller.pageModel().pageState, "SPECIAL_NODE");
  assert.equal(special.controller.pageModel().shell.ordinaryBackAllowed, false, "an unresolved SPECIAL_NODE must keep back disabled");
  const specialEventId = authoritativeEventId(special.store, specialId);
  assert.deepEqual(await special.controller.submit(choose("continue")).then(() => special.sent[0].command), { type: "CHOOSE_EVENT_OPTION", eventId: specialEventId, optionId: "continue" });

  // UI04E: a dying run is no longer an empty SPECIAL_NODE dead-end — it projects the ENDING terminal
  // page, and the command is still legitimately refused because the run is not active.
  const dyingId = runIdOf("back-dying");
  const dying = stack(dyingId, specialNodeState(offeredWithInnateProfile(dyingId), "dying", "combat"));
  await dying.controller.load();
  assert.equal(dying.controller.pageModel().pageState, "ENDING", "UI04E: a dying run projects ENDING, not SPECIAL_NODE");
  // The terminal page is advanced through `advanceTerminal`, never through an ordinary event option, so
  // the controller refuses the intent locally and no CHOOSE_EVENT_OPTION leaves the client.
  await assert.rejects(() => dying.controller.submit(choose("continue")), IntentUnavailableError);
  assert.equal(dying.sent.length, 0, "a terminal page must not emit an ordinary event-option command");
});

test("UI03_lock: an in-flight submission locks the surface and rejects a second intent", async () => {
  const runId = runIdOf("lock");
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  store.seedRun(activeState(runId));
  const gateway = new CommandGateway({ store, content, projectView: (state) => builder.build(state) });
  const real = new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID });
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  const transport = { sendCommand: async (envelope) => { await gate; return await real.sendCommand(envelope); }, fetchView: (id) => real.fetchView(id), createRunOffer: () => real.createRunOffer() };
  const controller = new WeChatRunController({
    transport, storage: createWeChatPlatformStorage(new RawWeChatStorage()),
    session: { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" },
    commandIdFactory: commandIds("cmd:ui03:lock")
  });
  await controller.load();
  const inFlight = controller.submit({ kind: "coreAction", intentId: "core.travel" });
  await Promise.resolve();
  assert.equal(controller.submission().mutuallyExclusiveLocked, true);
  assert.equal(controller.pageModel().shell.interactionLocked, true);
  await assert.rejects(() => controller.submit({ kind: "coreAction", intentId: "core.cultivate" }), SubmissionLockedError);
  release();
  assert.equal((await inFlight).ok, true);
  assert.equal(controller.pageModel().shell.interactionLocked, false);
  assert.equal(controller.pageModel().pageState, "EVENT");
});

// ---------------------------------------------------------------- retry / conflict

test("UI03_retry: a transient failure retries the identical commandId and envelope", async () => {
  const runId = runIdOf("retry");
  let thrownOnce = false;
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  store.seedRun(activeState(runId));
  const gateway = new CommandGateway({
    store, content,
    beforeCommit: () => { if (!thrownOnce) { thrownOnce = true; throw new Error("simulated transient failure"); } },
    projectView: (state) => builder.build(state)
  });
  const transport = recordTransport(new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID }));
  const controller = new WeChatRunController({
    transport, storage: createWeChatPlatformStorage(new RawWeChatStorage()),
    session: { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" },
    commandIdFactory: commandIds("cmd:ui03:retry")
  });
  await controller.load();
  const before = store.readRun(runId).state.stateVersion;

  const failed = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "TRANSIENT");
  assert.equal(failed.error.retryable, true);
  assert.equal(controller.submission().interactionState, "retryableError");
  assert.equal(store.readRun(runId).state.stateVersion, before, "a transient failure must not commit");

  const retried = await controller.retry();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(transport.sent.length, 2);
  assert.equal(transport.sent[1].commandId, transport.sent[0].commandId);
  assert.deepEqual(transport.sent[1], transport.sent[0], "the retry must reuse the identical commandId and payload");
  assert.equal(store.readRun(runId).commandLog.entries.length, 1, "the command must settle exactly once");
  assert.equal(store.readRun(runId).state.stateVersion, before + 1);
  assert.equal(controller.pageModel().stateVersion, before + 1);

  // a retry is only available from the retryable state
  await assert.rejects(() => controller.retry(), RetryUnavailableError);
});

test("UI03_conflict: STATE_CONFLICT refreshes the latest ViewModel and needs explicit reconfirmation", async () => {
  const runId = runIdOf("conflict");
  const { store, gateway, controller, sent } = stack(runId, offered(runId));
  await controller.load();
  assert.equal(controller.pageModel().pageState, "DESTINY_OFFER");
  assert.equal(controller.pageModel().stateVersion, 0);

  // the run moves on outside this session: the controller's ViewModel is now stale
  const outside = await gateway.sendCommand({ playerId: PLAYER_ID }, {
    commandId: "cmd:ui03:outside", playerId: PLAYER_ID, runId, expectedStateVersion: 0,
    rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientPlatform: "dev", clientBuild: "ui03-outside",
    command: { type: "START_RUN", offerId: `offer-${runId}`, destinyId: DESTINY_IDS[0] }
  });
  assert.equal(outside.ok, true, JSON.stringify(outside));
  const latestVersion = store.readRun(runId).state.stateVersion;
  assert.equal(latestVersion, 1);

  const conflicted = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.error.code, "STATE_CONFLICT");
  assert.equal(sent[0].expectedStateVersion, 0, "the stale envelope really carried the stale version");
  // the controller refreshed from the authoritative server and now demands an explicit reconfirmation
  assert.equal(controller.submission().requiresReconfirmation, true);
  assert.equal(controller.submission().view.state.stateVersion, latestVersion);
  assert.equal(controller.pageModel().stateVersion, latestVersion);
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  await assert.rejects(() => controller.retry(), RetryUnavailableError, "a conflict must not be silently retried");
  await assert.rejects(() => controller.submit({ kind: "coreAction", intentId: "core.cultivate" }), RetryUnavailableError);

  const reconfirmed = await controller.reconfirm({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(reconfirmed.ok, true, JSON.stringify(reconfirmed));
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].commandId, sent[0].commandId, "reconfirmation must use a fresh commandId");
  assert.equal(sent[1].expectedStateVersion, latestVersion, "reconfirmation must target the latest stateVersion");
  assert.equal(controller.submission().requiresReconfirmation, false);
  assert.equal(controller.pageModel().pageState, "EVENT");
});

// ---------------------------------------------------------------- LIFE_ARCHIVE

test("UI03_archive: LIFE_ARCHIVE is local read-only navigation that submits and mutates nothing", async () => {
  const runId = runIdOf("archive");
  const { store, controller, sent } = stack(runId);
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  await controller.submit(choose(controller.pageModel().interaction.options[0].optionId));
  assert.equal(controller.pageModel().pageState, "RUN_HOME");

  const before = store.readRun(runId);
  const sentBefore = sent.length;
  const opened = controller.openArchive();
  assert.equal(opened.archiveOpen, true);
  assert.equal(opened.archive.readOnly, true);
  assert.equal(opened.archive.history.length, controller.view().history.entries.length);
  assert.equal(opened.archive.causes.length, controller.view().state.publicCauses.length);
  assert.equal(sent.length, sentBefore, "opening the archive must not submit anything");
  assert.deepEqual(store.readRun(runId), before, "opening the archive must not mutate the run");
  assert.equal(opened.pageState, "RUN_HOME", "the archive is an overlay over RUN_HOME, not a page state");
  // read-only: hidden Causes are still absent, and no rule trace is exposed
  assert.equal(opened.archive.causes.every((cause) => cause.level === "explicit" || cause.level === "hinted"), true);
  assert.equal(JSON.stringify(opened.archive).includes("trace"), false);

  const closed = controller.closeArchive();
  assert.equal(closed.archiveOpen, false);
  assert.equal(closed.archive, undefined);
  assert.equal(sent.length, sentBefore);
  assert.deepEqual(store.readRun(runId), before);

  // the overlay is not a legal navigation out of a decision surface
  await controller.submit({ kind: "coreAction", intentId: "core.travel" });
  assert.equal(controller.pageModel().pageState, "EVENT");
  assert.throws(() => controller.openArchive(), ArchiveUnavailableError);
});

test("UI03_archive: the overlay never survives a server-directed page transition", async () => {
  const runId = runIdOf("archive-transition");
  const { controller } = stack(runId);
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  await controller.submit(choose(controller.pageModel().interaction.options[0].optionId));
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
  assert.equal(controller.openArchive().archiveOpen, true);
  await controller.submit({ kind: "coreAction", intentId: "core.worldly" });
  const after = controller.pageModel();
  assert.notEqual(after.pageState, "RUN_HOME");
  assert.equal(after.archiveOpen, false, "a live overlay must not ride into the next server-directed page");
  assert.equal(after.archive, undefined);
});

// ---------------------------------------------------------------- storage boundary

test("UI03_storage: the WeChat storage adapter is injected and behaves as a PlatformStorage port", async () => {
  const raw = new RawWeChatStorage();
  const storage = createWeChatPlatformStorage(raw);
  assert.equal(await storage.getLocal("missing"), null);
  await storage.setLocal("k", "v");
  assert.equal(await storage.getLocal("k"), "v");
  await storage.setLocal("k", "");
  assert.equal(await storage.getLocal("k"), null, "an empty string is how WeChat reports an absent key");

  // and it is a real port: the accepted submission controller persists through it verbatim
  const runId = runIdOf("storage");
  let firstCall = true;
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content);
  const store = new InMemoryGatewayStore();
  store.seedRun(activeState(runId));
  const gateway = new CommandGateway({ store, content, beforeCommit: () => { if (firstCall) { firstCall = false; throw new Error("simulated transient failure"); } }, projectView: (state) => builder.build(state) });
  const controller = new WeChatRunController({
    transport: recordTransport(new GatewayApplicationTransport(gateway, { playerId: PLAYER_ID })),
    storage,
    session: { playerId: PLAYER_ID, runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientBuild: "ui03-test" },
    commandIdFactory: commandIds("cmd:ui03:storage")
  });
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal([...raw.map.keys()].some((key) => key.includes(runId)), true, "the pending envelope must be persisted through the injected adapter");
});

// ---------------------------------------------------------------- client model boundary

test("UI03_boundary: the page model adds no server secret or hidden rule state", async () => {
  const runId = runIdOf("boundary");
  const { store, controller } = stack(runId);
  await controller.load();
  await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  const model = controller.pageModel();
  const keys = keySet(model);
  for (const forbidden of ["rootSeed", "rng", "drawIndex", "salience", "echoBudget", "eligibleSinceNode", "eligibleAge",
    "selector", "futureEventIds", "npcs", "check", "difficulty", "effects", "EffectSpec", "trace", "actorIdsByRole",
    "participantBindings", "affinityBps", "lifetimeEvidence", "significance", "promotionThreshold", "actualStatus"]) {
    assert.equal(keys.has(forbidden), false, `client model leaked key: ${forbidden}`);
  }
  const serialized = JSON.stringify(model);
  for (const forbidden of ["server-only-root-seed", "commandId", "tianfu2:pending-command"]) {
    assert.equal(serialized.includes(forbidden), false, `client model leaked value: ${forbidden}`);
  }
  // the one field UI03 adds is the *public* current-event id, and it is exactly the authoritative one
  assert.equal(model.interaction.eventId, store.readRun(runId).state.run.events.current.eventId);
  assert.equal(store.readRun(runId).state.run.events.current.eventId, "dev.first-choice");

  // ...and it is not published for the pre-run offer, which has no current event
  const offerId = runIdOf("boundary-offer");
  const offer = stack(offerId, offered(offerId));
  await offer.controller.load();
  assert.equal(offer.controller.pageModel().interaction.kind, "destinyOffer");
  assert.equal("eventId" in offer.controller.pageModel().interaction, false, "a destiny offer is not an event");
  assert.equal(offer.controller.pageModel().pageState, "DESTINY_OFFER");
});

// ---------------------------------------------------------------- docs, registration, route scope

test("UI03_docs: the controller documentation names its responsibilities, its seam and what stays UI04", () => {
  const doc = read("docs/UI03_LIVE_CONTROLLER.md");
  for (const phrase of ["WeChatRunController", "CommandSubmissionController", "ApplicationTransport", "PlatformStorage",
    "UI04", "wx", "eventId", "LIFE_ARCHIVE"]) {
    assert.equal(doc.includes(phrase), true, `documentation must mention ${phrase}`);
  }
  assert.equal(/未接线|尚未接线|not wired/.test(doc), true, "the doc must state that the production transport is not wired yet");
});

test("UI03_registration: the dedicated suite is registered and the aggregate npm test runs it", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:ui03"], "node --test tests/ui03.test.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui03.test.mjs"), true);
  assert.equal(fs.existsSync(path.join(ROOT, "tests/ui03.test.mjs")), true);
});

test("UI03_scope: the live controller work did not touch the default route or the legacy 1.0 pages", () => {
  const app = JSON.parse(read("miniprogram/app.json"));
  assert.equal(app.pages[0], "pages/start/start");
  // UI04C appends its dev-only live page LAST, behind the accepted preview; the default route, the
  // preview's own registration and the 1.0 tabBar are all still exactly what UI03 accepted.
  assert.equal(app.pages.includes("pages/v2-preview/v2-preview"), true, "the accepted dev preview must stay registered");
  assert.equal(app.pages.slice(0, -1).join("|"), ["pages/start/start", "pages/game/game", "pages/rank/rank", "pages/v2-preview/v2-preview"].join("|"));
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
  // the neutral layers stay free of any platform global
  for (const file of ["packages/platform-contract/src/index.ts", "packages/core/src/index.ts"]) {
    const source = stripJs(read(file));
    for (const forbidden of ["wx.", "tt.", "fetch("]) assert.equal(source.includes(forbidden), false, `${file} must not reference ${forbidden}`);
  }
});
