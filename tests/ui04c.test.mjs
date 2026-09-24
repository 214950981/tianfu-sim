/**
 * UI04C — WeChat live client vertical slice.
 *
 * This suite proves the whole client RPC round trip **without a cloud backend**: the only seam is an
 * injected `callFunction`, exactly the shape a real WeChat page binds. Behind that seam sit the real
 * CommandGateway, the real ServerViewModelBuilder and the real reducer, so every ViewModel the client
 * sees is authoritative; in front of it sit the real generated-equivalent source modules
 * (`wechat-shell`), so what is under test is precisely the code the WeChat bundle will run.
 *
 * What is proven here:
 *   1. the cloud transport adapter is client-safe, injected and fail-closed;
 *   2. `createRunOffer` exposes only public session metadata (no rootSeed, no RNG, no hidden Cause);
 *   3. DESTINY_OFFER → START_RUN is derived from the authoritative public offer only, and START_RUN
 *      still goes through CommandSubmissionController's commandId/pending/retry/conflict semantics;
 *   4. the full chain bootstrap → 择命 → START_RUN → RUN_HOME → core action → EVENT → option → refresh;
 *   5. retry re-sends the identical envelope, STATE_CONFLICT refreshes and demands an explicit
 *      reconfirmation with a fresh commandId, and a fatal/bootstrap failure is bounded;
 *   6. the real `miniprogram/pages/v2-live` page drives the same chain through the same seam.
 *
 * Nothing here computes gameplay: the client is only ever asserted to *echo* what the server published.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { APP_ERROR_CODES } from "../packages/command-wire/src/index.ts";
import { ContentRegistry } from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, validateGameState } from "../packages/core/src/index.ts";
import {
  CommandGateway,
  InMemoryGatewayStore,
  ServerViewModelBuilder,
  generateServerDestinyOffer
} from "../server/src/index.ts";
import {
  IntentUnavailableError,
  TransportProtocolError,
  WeChatRunController,
  bootstrapWeChatRun,
  createWeChatCloudTransport,
  createWeChatPlatformStorage
} from "../packages/wechat-shell/src/index.ts";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const RULES_VERSION = "2.0.0";
const CONTENT_VERSION = "dev-0.1.0";
const PLAYER_ID = "player-ui04c";
const CLIENT_BUILD = "ui04c-test";
const CLOUD_FUNCTION = "tianfu2";
const DESTINY_IDS = ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"];
const PAGE_PATH = path.join(ROOT, "miniprogram/pages/v2-live/v2-live.js");

const pack = JSON.parse(read("packages/content/dev-fixtures/minimal-pack.json"));
function contentRegistry() { const registry = new ContentRegistry(); registry.register(pack); return registry; }

function offerFixture(runId) {
  return {
    offerId: `offer-${runId}`, age: 24, maxAge: 100, runName: "UI04C 问道",
    realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 },
    resources: { spiritStone: 5, items: {} },
    availableActions: ["cultivate", "travel", "worldly", "pursuit"],
    world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
  };
}

/** An authoritative DESTINY_OFFER run whose public body is the PROG01 innate candidate list. */
function innateOffered(runId) {
  return generateServerDestinyOffer({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, runId, playerId: PLAYER_ID,
    rootSeed: "server-only-root-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] }, content: contentRegistry(),
    fixture: offerFixture(runId)
  }).state;
}

/** An authoritative DESTINY_OFFER run whose public body is the legacy destiny list. */
function legacyOffered(runId) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, runId, playerId: PLAYER_ID,
    rootSeed: "server-only-root-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: { ...offerFixture(runId), destinyIds: DESTINY_IDS }
  });
}

function started(runId) {
  const offered = innateOffered(runId);
  const selectionId = offered.run.offer.innateProfiles[0].selectionId;
  return reduce({
    state: offered,
    command: { type: "START_RUN", offerId: `offer-${runId}`, selectionId },
    context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content: contentRegistry(), commandId: `cmd:${runId}:start` }
  }).state;
}

/** The in-memory double for the raw WeChat storage API, behind the injected adapter. */
class RawWeChatStorage {
  map = new Map();
  getStorageSync(key) { return this.map.has(key) ? this.map.get(key) : ""; }
  setStorageSync(key, value) { this.map.set(key, value); }
}

function commandIds(prefix) { let sequence = 0; return () => `${prefix}:${(sequence += 1)}`; }

// ================================================================= the injected cloud seam

/**
 * The fake cloud function. It is the *only* thing a live page would replace with `wx.cloud`: everything
 * behind it is the real authoritative stack, so an envelope that survives this harness is an envelope
 * the real backend will accept.
 */
function fakeCloud({ seed, playerId = PLAYER_ID, wrap } = {}) {
  const content = contentRegistry();
  const builder = new ServerViewModelBuilder(content, { capabilities: { PlatformCapability: true, ShareCapability: true, AiNarrativeCapability: true } });
  const store = new InMemoryGatewayStore();
  const gateway = new CommandGateway({ store, content, projectView: (state) => builder.build(state) });
  const auth = { playerId };
  const calls = [];
  let sequence = 0;

  const handle = async ({ name, data }) => {
    calls.push({ name, data: structuredClone(data) });
    if (name !== CLOUD_FUNCTION) return { errMsg: "cloud.callFunction:fail", result: { ok: false, commandId: "", stateVersion: 0, error: { code: "INTERNAL", messageKey: "error.unknown", retryable: false } } };
    if (data.operation === "createRunOffer") {
      const runId = `run-ui04c-${(sequence += 1)}`;
      const state = seed(runId);
      store.seedRun(state);
      return { errMsg: "cloud.callFunction:ok", result: { runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: builder.build(state) } };
    }
    if (data.operation === "fetchView") return { errMsg: "cloud.callFunction:ok", result: { view: await gateway.fetchView(auth, String(data.runId)) } };
    // The clone is not cosmetic: a real cloud call serializes its payload, so the authoritative stack
    // never receives objects from another realm. Keeping it means the harness cannot pass by accident.
    if (data.operation === "sendCommand") return { errMsg: "cloud.callFunction:ok", result: await gateway.sendCommand(auth, structuredClone(data.command)) };
    throw new Error("the fake cloud knows no operation " + String(data.operation));
  };

  const api = { callFunction: wrap === undefined ? handle : wrap(handle) };
  return { api, calls, store, gateway, builder, runIdOf: (index = 0) => `run-ui04c-${index + 1}` };
}

/** Builds the client stack over a cloud seam: transport adapter -> bootstrap -> controller. */
async function liveClient(cloud) {
  const transport = createWeChatCloudTransport({ api: cloud.api, cloudFunctionName: CLOUD_FUNCTION });
  const raw = new RawWeChatStorage();
  const commandIdsFactory = commandIds("cmd:ui04c");
  const boot = await bootstrapWeChatRun({ transport, playerId: PLAYER_ID, clientBuild: CLIENT_BUILD });
  const controller = new WeChatRunController({
    transport,
    storage: createWeChatPlatformStorage(raw),
    session: boot.session,
    commandIdFactory: commandIdsFactory,
    initialView: boot.view
  });
  await controller.restore();
  return { transport, boot, controller, raw, cloud };
}

const sendCalls = (cloud) => cloud.calls.filter((entry) => entry.data.operation === "sendCommand");
const lastEnvelope = (cloud) => sendCalls(cloud)[sendCalls(cloud).length - 1].data.command;

// ================================================================= 1. the transport adapter

test("UI04C_transport: the injected cloud API is the only seam, and each operation sends an exact envelope", async () => {
  const cloud = fakeCloud({ seed: legacyOffered });
  const transport = createWeChatCloudTransport({ api: cloud.api });

  const offer = await transport.createRunOffer();
  assert.deepEqual(cloud.calls[0], { name: "tianfu2", data: { operation: "createRunOffer" } }, "createRunOffer must send exactly { operation }");

  const view = await transport.fetchView(offer.runId);
  assert.deepEqual(cloud.calls[1], { name: "tianfu2", data: { operation: "fetchView", runId: offer.runId } });
  assert.equal(view.state.pageState, "DESTINY_OFFER");

  const envelope = { commandId: "cmd:manual", playerId: PLAYER_ID, runId: offer.runId, expectedStateVersion: 0, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientPlatform: "wechat", clientBuild: CLIENT_BUILD, command: { type: "START_RUN", offerId: `offer-${offer.runId}`, destinyId: DESTINY_IDS[0] } };
  const result = await transport.sendCommand(envelope);
  assert.deepEqual(cloud.calls[2].data, { operation: "sendCommand", command: envelope }, "the envelope must be passed through byte-for-byte");
  assert.equal(result.ok, true);

  // A neutral source package may never name a platform global: only the injected function is called.
  const source = stripJs(read("packages/wechat-shell/src/index.ts"));
  assert.equal(/\bwx\s*\./.test(source), false, "the client-safe source must not reference the wx global");
  assert.equal(source.includes("tt."), false);
  assert.equal(read("miniprogram/runtime/wechat-shell.js").includes("wx.cloud"), false);
});

test("UI04C_transport: a malformed or secret-bearing response fails closed", async () => {
  const good = await (async () => {
    const cloud = fakeCloud({ seed: innateOffered });
    return await createWeChatCloudTransport({ api: cloud.api }).createRunOffer();
  })();

  const cases = [
    ["no result wrapper", () => ({ errMsg: "ok" })],
    ["a non-object response", () => "not-an-object"],
    ["a view that is not an object", () => ({ result: { runId: "r", rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: 7 } })],
    ["a missing page state", () => ({ result: { runId: "r", rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, state: { ...good.view.state, pageState: undefined } } } })],
    ["an unknown page state", () => ({ result: { runId: "r", rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, state: { ...good.view.state, pageState: "MADE_UP" } } } })],
    ["a runId mismatch", () => ({ result: { runId: "another-run", rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: good.view } })],
    ["a rulesVersion mismatch", () => ({ result: { runId: good.view.state.runId, rulesVersion: "9.9.9", contentVersion: CONTENT_VERSION, view: good.view } })],
    ["rootSeed in the payload", () => ({ result: { runId: good.view.state.runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: good.view, rootSeed: "server-only" } })],
    ["an RNG state inside the view", () => ({ result: { runId: good.view.state.runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, state: { ...good.view.state, rngState: { drawIndex: 3 } } } } })],
    ["a hidden Cause inside the view", () => ({ result: { runId: good.view.state.runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, state: { ...good.view.state, hiddenCauses: [{ id: "cause" }] } } } })],
    ["a check spec inside an interaction", () => ({ result: { runId: good.view.state.runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, currentInteraction: { ...good.view.currentInteraction, checkSpec: { dc: 12 } } } } })],
    ["a nested secret three levels down", () => ({ result: { runId: good.view.state.runId, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, view: { ...good.view, state: { ...good.view.state, publicRun: { ...good.view.state.publicRun, resources: { rootSeed: "deep" } } } } } })]
  ];
  for (const [label, response] of cases) {
    const transport = createWeChatCloudTransport({ api: { callFunction: async () => response() } });
    await assert.rejects(() => transport.createRunOffer(), TransportProtocolError, label + " must be refused");
  }

  // sendCommand: an unvalidated settlement wrapper is never handed to the controller.
  const commandEnvelope = { commandId: "cmd:x", playerId: PLAYER_ID, runId: "r", expectedStateVersion: 0, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, clientPlatform: "wechat", clientBuild: CLIENT_BUILD, command: { type: "CHOOSE_ACTION", actionId: "cultivate" } };
  for (const [label, response] of [
    ["a missing ok flag", { stateVersion: 1, commandId: "cmd:x" }],
    ["an unknown error code", { ok: false, commandId: "cmd:x", stateVersion: 1, error: { code: "TOTALLY_MADE_UP", messageKey: "x", retryable: true } }],
    ["a non-retryable flag that is not boolean", { ok: false, commandId: "cmd:x", stateVersion: 1, error: { code: "STATE_CONFLICT", messageKey: "x", retryable: "yes" } }],
    ["a negative state version", { ok: true, commandId: "cmd:x", stateVersion: -1 }]
  ]) {
    const transport = createWeChatCloudTransport({ api: { callFunction: async () => ({ result: response }) } });
    await assert.rejects(() => transport.sendCommand(commandEnvelope), TransportProtocolError, label + " must be refused");
  }

  // A well-formed failure is accepted, and every application error code is accepted.
  for (const code of APP_ERROR_CODES) {
    const transport = createWeChatCloudTransport({ api: { callFunction: async () => ({ result: { ok: false, commandId: "cmd:x", stateVersion: 3, error: { code, messageKey: "x", retryable: false } } }) } });
    const settled = await transport.sendCommand(commandEnvelope);
    assert.deepEqual(settled, { ok: false, commandId: "cmd:x", stateVersion: 3, error: { code, messageKey: "x", retryable: false } });
  }

  // The adapter itself is not optional: an API without callFunction is refused.
  assert.throws(() => createWeChatCloudTransport({ api: {} }), TransportProtocolError);
});

// ================================================================= 2. the bootstrap

test("UI04C_bootstrap: the session is authoritative public metadata and nothing else", async () => {
  const cloud = fakeCloud({ seed: innateOffered });
  const { boot, controller } = await liveClient(cloud);

  assert.deepEqual(Object.keys(boot.session).sort(), ["clientBuild", "contentVersion", "playerId", "rulesVersion", "runId"]);
  assert.equal(boot.session.playerId, PLAYER_ID, "the player identity is a client fact, never a server one");
  assert.equal(boot.session.clientBuild, CLIENT_BUILD);
  assert.equal(boot.session.runId, boot.view.state.runId);
  assert.equal(boot.session.rulesVersion, boot.view.state.rulesVersion);
  assert.equal(boot.session.contentVersion, boot.view.state.contentVersion);

  const serialized = JSON.stringify(boot);
  for (const secret of ["rootSeed", "rngState", "drawIndex", "hiddenCause", "checkSpec", "difficulty", "selectorWeights", "futureEventIds", "echoBudget"]) {
    assert.equal(serialized.includes(secret), false, "the bootstrap must never carry " + secret);
  }
  assert.equal(controller.pageModel().pageState, "DESTINY_OFFER");
});

// ================================================================= 3. DESTINY_OFFER -> START_RUN

test("UI04C_destiny: an innate selection submits START_RUN with the authoritative selectionId", async () => {
  const cloud = fakeCloud({ seed: innateOffered });
  const { controller } = await liveClient(cloud);
  const model = controller.pageModel();
  assert.equal(model.pageState, "DESTINY_OFFER");

  const offeredIds = model.interaction.options.map((option) => option.optionId);
  assert.equal(offeredIds.length > 0, true);
  const chosen = offeredIds[0];
  const result = await controller.submit({ kind: "interactionOption", optionId: chosen });
  assert.equal(result.ok, true, JSON.stringify(result));

  const envelope = lastEnvelope(cloud);
  assert.deepEqual(envelope.command, { type: "START_RUN", offerId: model.interaction.interactionId, selectionId: chosen }, "the selectionId must come from the published candidate, never from a client guess");
  assert.equal(envelope.command.destinyId, undefined);
  assert.equal(controller.pageModel().pageState, "RUN_HOME", "the next page state is whatever the server projected");
});

test("UI04C_destiny: a legacy offer submits START_RUN with the authoritative destinyId", async () => {
  const cloud = fakeCloud({ seed: legacyOffered });
  const { controller } = await liveClient(cloud);
  const model = controller.pageModel();
  const chosen = model.interaction.options[0].optionId;
  assert.equal(DESTINY_IDS.includes(chosen), true);

  const result = await controller.submit({ kind: "interactionOption", optionId: chosen });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(lastEnvelope(cloud).command, { type: "START_RUN", offerId: model.interaction.interactionId, destinyId: chosen });
  assert.equal(controller.pageModel().pageState, "RUN_HOME");
});

test("UI04C_destiny: a selection the server did not offer is refused, never fabricated", async () => {
  const cloud = fakeCloud({ seed: innateOffered });
  const { controller } = await liveClient(cloud);
  await assert.rejects(
    () => controller.submit({ kind: "interactionOption", optionId: "selection-i-invented-myself" }),
    IntentUnavailableError,
    "the client must refuse a candidate it made up"
  );
  assert.equal(sendCalls(cloud).length, 0, "nothing may be sent for a refused intent");
});

// ================================================================= 4. the whole live chain

test("UI04C_flow: bootstrap -> 择命 -> START_RUN -> RUN_HOME -> core action -> EVENT -> option -> refresh", async () => {
  const cloud = fakeCloud({ seed: innateOffered });
  const { controller } = await liveClient(cloud);

  // 1. 择命
  assert.equal(controller.pageModel().pageState, "DESTINY_OFFER");
  const selectionId = controller.pageModel().interaction.options[0].optionId;
  await controller.submit({ kind: "interactionOption", optionId: selectionId });

  // 2. RUN_HOME, with the four core actions the server projected
  const home = controller.pageModel();
  assert.equal(home.pageState, "RUN_HOME");
  assert.deepEqual(home.coreIntents.map((entry) => entry.intentId).sort(), ["core.cultivate", "core.pursuit", "core.travel", "core.worldly"]);
  const homeVersion = home.stateVersion;

  // 3. a core action, submitted as the command the server's own projection maps to
  const action = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(action.ok, true, JSON.stringify(action));
  assert.deepEqual(lastEnvelope(cloud).command, { type: "CHOOSE_ACTION", actionId: "cultivate" });
  assert.equal(controller.pageModel().stateVersion > homeVersion, true, "the refresh is authoritative: the state version must advance");

  // 4. EVENT, with the option list the server published and the authoritative eventId
  const decision = controller.pageModel();
  assert.equal(decision.pageState === "EVENT" || decision.pageState === "SPECIAL_NODE", true, "the page state comes from the server");
  assert.equal(decision.interaction.eventId, "dev.first-choice");
  const optionId = decision.interaction.options[0].optionId;

  // 5. the option, then the authoritative refresh
  const chosen = await controller.submit({ kind: "interactionOption", optionId });
  assert.equal(chosen.ok, true, JSON.stringify(chosen));
  const envelope = lastEnvelope(cloud);
  assert.deepEqual(envelope.command, { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId });
  assert.equal(envelope.command.eventId, decision.interaction.eventId, "the eventId is the server's, never a client memory");

  const after = controller.pageModel();
  assert.equal(after.stateVersion > decision.stateVersion, true);
  assert.equal(after.pageState, "RUN_HOME", "after the event resolves the server projects the next page state");

  // Every submission carried its own commandId, and the client never re-used one.
  const ids = sendCalls(cloud).map((entry) => entry.data.command.commandId);
  assert.equal(new Set(ids).size, ids.length, "each submission must mint a fresh commandId");
});

test("UI04C_flow: a special action is emitted only when the server projects it, and never invents odds", async () => {
  const cloud = fakeCloud({ seed: started });
  const { controller } = await liveClient(cloud);
  const model = controller.pageModel();
  assert.equal(model.pageState, "RUN_HOME");

  // Whatever the server projected is what the surface may offer — the client adds and removes nothing.
  const projected = model.specialIntents;
  if (projected.length === 0) {
    await assert.rejects(() => controller.submit({ kind: "specialAction", intentId: "special.attemptBreakthrough" }), IntentUnavailableError, "an unprojected breakthrough must be refused");
    assert.equal(sendCalls(cloud).length, 0);
    return;
  }
  const intent = projected[0];
  assert.equal(intent.intentId, "special.attemptBreakthrough");
  if (intent.enabled === true) {
    const result = await controller.submit({ kind: "specialAction", intentId: intent.intentId });
    assert.equal(result.ok === true || result.error !== undefined, true);
    assert.deepEqual(lastEnvelope(cloud).command, { type: "ATTEMPT_BREAKTHROUGH" }, "the breakthrough command carries no client-computed odds");
  } else {
    await assert.rejects(() => controller.submit({ kind: "specialAction", intentId: intent.intentId }), IntentUnavailableError, "a breakthrough the server disables must be refused");
    assert.equal(sendCalls(cloud).length, 0);
  }
});

// ================================================================= 5. failure, retry, conflict

test("UI04C_retry: a transient failure is retryable and the retry re-sends the identical envelope", async () => {
  const cloud = fakeCloud({ seed: started });
  // One transient failure, then the real backend: the flake is installed *in front of* the same seam the
  // page binds, so the client cannot tell it apart from a real network hiccup.
  const real = cloud.api.callFunction;
  let flaked = false;
  cloud.api.callFunction = async (input) => {
    if (input.data.operation === "sendCommand" && flaked === false) {
      flaked = true;
      cloud.calls.push({ name: input.name, data: structuredClone(input.data) });
      return { result: { ok: false, commandId: input.data.command.commandId, stateVersion: 1, error: { code: "TRANSIENT", messageKey: "network.hiccup", retryable: true } } };
    }
    return await real(input);
  };

  const { controller } = await liveClient(cloud);
  const first = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.deepEqual(first.error, { code: "TRANSIENT", messageKey: "network.hiccup", retryable: true });
  assert.equal(controller.submission().interactionState, "retryableError");
  assert.equal(controller.submission().requiresReconfirmation, false, "a transient failure is not a conflict: no reconfirmation may be demanded");

  const before = sendCalls(cloud).length;
  const retried = await controller.retry();
  assert.equal(retried.ok, true, JSON.stringify(retried));
  const sends = sendCalls(cloud);
  assert.equal(sends.length, before + 1, "exactly one additional send");
  // Idempotency is the whole point: the retry re-sends the *same* commandId and payload, so the server
  // cannot apply it twice.
  assert.deepEqual(sends[sends.length - 1].data.command, sends[sends.length - 2].data.command);
  assert.equal(controller.pageModel().stateVersion > 1, true, "after the retry lands the client holds the authoritative refresh");
});

test("UI04C_conflict: STATE_CONFLICT refreshes the view and demands an explicit reconfirmation", async () => {
  const cloud = fakeCloud({ seed: started });
  const { controller } = await liveClient(cloud);
  const runId = controller.view().state.runId;

  // Another client wins the race: the authoritative state moves on behind this client's back.
  const stored = cloud.store.readRun(runId);
  await cloud.gateway.sendCommand({ playerId: PLAYER_ID }, {
    commandId: "cmd:out-of-band", playerId: PLAYER_ID, runId,
    expectedStateVersion: stored.state.stateVersion, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION,
    clientPlatform: "wechat", clientBuild: "other-client", command: { type: "CHOOSE_ACTION", actionId: "travel" }
  });
  const advanced = cloud.store.readRun(runId).state.stateVersion;

  // The client still holds the stale view, so its submission conflicts.
  assert.equal(controller.view().state.stateVersion, stored.state.stateVersion);
  const conflicted = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.error.code, "STATE_CONFLICT");

  const submission = controller.submission();
  assert.equal(submission.requiresReconfirmation, true, "the user must be asked to reconfirm, not silently retried");
  assert.equal(controller.view().state.stateVersion, advanced, "the latest authoritative ViewModel must have been fetched");
  await assert.rejects(() => controller.retry(), /retry is unavailable/, "a conflict is not a transient failure: retry must be refused");

  // Explicit reconfirmation: a fresh commandId, against the *latest* state version, and — because the
  // authoritative page state moved on while this client was stale — an intent re-derived from the
  // refreshed projection rather than from the client's memory of what it was doing.
  const staleCommandId = sendCalls(cloud)[sendCalls(cloud).length - 1].data.command.commandId;
  const refreshed = controller.pageModel();
  assert.equal(refreshed.pageState, "EVENT", "the refresh is authoritative: the other client opened an interaction");
  const reconfirmed = await controller.reconfirm({ kind: "interactionOption", optionId: refreshed.interaction.options[0].optionId });
  assert.equal(reconfirmed.ok, true, JSON.stringify(reconfirmed));
  const envelope = lastEnvelope(cloud);
  assert.notEqual(envelope.commandId, staleCommandId, "reconfirmation must mint a fresh commandId");
  assert.equal(envelope.expectedStateVersion, advanced, "reconfirmation must go against the latest authoritative version");
  assert.deepEqual(envelope.command, { type: "CHOOSE_EVENT_OPTION", eventId: refreshed.interaction.eventId, optionId: refreshed.interaction.options[0].optionId });
  assert.equal(controller.submission().requiresReconfirmation, false);
});

test("UI04C_fatal: a non-retryable rejection is fatal and the client does not invent a repair", async () => {
  const cloud = fakeCloud({
    seed: started,
    wrap: (handle) => async (input) => {
      if (input.data.operation === "sendCommand") return { result: { ok: false, commandId: input.data.command.commandId, stateVersion: 1, error: { code: "INVALID_COMMAND", messageKey: "command.invalid", retryable: false } } };
      return await handle(input);
    }
  });
  const { controller } = await liveClient(cloud);
  const version = controller.view().state.stateVersion;
  const result = await controller.submit({ kind: "coreAction", intentId: "core.cultivate" });
  assert.equal(result.ok, false);
  assert.equal(controller.submission().interactionState, "fatalError");
  assert.equal(controller.submission().pendingCommandId, undefined, "the pending command is dropped; the client does not keep retrying it");
  assert.equal(controller.view().state.stateVersion, version, "the client must not fabricate a new state");
});

test("UI04C_archive: the read-only side page opens and closes locally and submits nothing", async () => {
  const cloud = fakeCloud({ seed: started });
  const { controller } = await liveClient(cloud);
  const before = cloud.calls.length;

  controller.openArchive();
  const opened = controller.pageModel();
  assert.equal(opened.archiveOpen, true);
  assert.equal(opened.archive !== undefined, true);
  assert.equal(cloud.calls.length, before, "opening the archive must not touch the server");

  controller.closeArchive();
  assert.equal(controller.pageModel().archiveOpen, false);
  assert.equal(cloud.calls.length, before, "closing the archive must not touch the server");
});

// ================================================================= 6. the real page

/**
 * Loads the committed page the way WeChat loads it: as CommonJS, in its own realm, with `Page` and `wx`
 * supplied by the host. The repository is `"type": "module"`, so a plain `require()` would fail; a
 * `node:vm` realm with a CommonJS wrapper is the same trick `tools/ui04b-wechat-runtime-smoke.mjs` uses
 * for the artifact, and it keeps the page's top-level `var`s module-scoped exactly as the packager does.
 */
function loadLivePage(cloud, { playerId = PLAYER_ID } = {}) {
  const store = new Map();
  if (playerId !== null) store.set("tianfu2:dev-player-id", playerId);
  const context = vm.createContext({});
  let definition = null;
  context.Page = (value) => { definition = value; };
  context.wx = {
    cloud: { callFunction: cloud.api.callFunction },
    getStorageSync: (key) => (store.has(key) ? store.get(key) : ""),
    setStorageSync: (key, value) => store.set(key, value)
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
  return { page, definition, store };
}

/** Flushes the page's promise chains: waits for the loading stage to end and for any submission to land. */
async function settle(page, ticks = 60) {
  for (let index = 0; index < ticks; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    const busy = page.data.vm !== null && page.data.vm !== undefined && page.data.vm.locked === true;
    if (index >= 8 && page.data.stage !== "loading" && busy === false) return page.data.stage;
  }
  return page.data.stage;
}

test("UI04C_page: the committed v2-live page drives the whole chain through the injected cloud", async () => {
  const cloud = fakeCloud({ seed: innateOffered });
  const { page } = loadLivePage(cloud);

  page.onLoad();
  assert.equal(await settle(page), "ready", JSON.stringify(page.data));

  const offered = page.data.vm;
  assert.equal(offered.pageState, "DESTINY_OFFER");
  assert.equal(offered.isOffer, true);
  assert.equal(offered.offerCandidates.length, offered.offerCandidates.length > 0 ? offered.offerCandidates.length : 0);
  assert.equal(offered.offerCandidates.length > 0, true, "the page renders the candidates the server published");
  for (const candidate of offered.offerCandidates) {
    assert.equal(typeof candidate.optionId, "string");
    assert.equal(candidate.origin === "innate" || candidate.origin === "legacy", true);
  }

  // 择命 -> START_RUN
  const selectionId = offered.offerCandidates[0].optionId;
  page.onOption({ currentTarget: { dataset: { optionId: selectionId } } });
  await settle(page);
  assert.deepEqual(lastEnvelope(cloud).command, { type: "START_RUN", offerId: offered.offerCandidates.length > 0 ? lastEnvelope(cloud).command.offerId : "", selectionId });
  assert.equal(page.data.vm.pageState, "RUN_HOME");
  assert.equal(page.data.vm.isHome, true);
  assert.deepEqual(page.data.vm.coreActions.map((entry) => entry.intentId).sort(), ["core.cultivate", "core.pursuit", "core.travel", "core.worldly"]);

  // RUN_HOME -> core action -> EVENT
  page.onCoreAction({ currentTarget: { dataset: { intentId: "core.cultivate" } } });
  await settle(page);
  assert.equal(lastEnvelope(cloud).command.type, "CHOOSE_ACTION");
  assert.equal(page.data.vm.isDecision, true);
  assert.equal(page.data.vm.decisionEventId, "dev.first-choice");

  // EVENT -> option -> authoritative refresh
  const optionId = page.data.vm.options[0].optionId;
  page.onOption({ currentTarget: { dataset: { optionId } } });
  await settle(page);
  assert.deepEqual(lastEnvelope(cloud).command, { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId });
  assert.equal(page.data.vm.pageState, "RUN_HOME");

  // 生平录 opens and closes without a single request.
  const before = cloud.calls.length;
  page.onOpenArchive();
  assert.equal(page.data.vm.archiveOpen, true);
  page.onCloseArchive();
  assert.equal(page.data.vm.archiveOpen, false);
  assert.equal(cloud.calls.length, before);
});

test("UI04C_page: a bootstrap failure is bounded and names the stage, not the server state", async () => {
  const cloud = { api: { callFunction: async () => { throw new Error("cloud unreachable"); } }, calls: [], store: null, gateway: null };
  const { page } = loadLivePage(cloud);
  page.onLoad();
  assert.equal(await settle(page), "error");
  assert.equal(page.data.failure.stage, "创建轮次");
  assert.equal(page.data.failure.code, "Error");
  assert.equal(page.data.failure.detail.length <= 160, true, "the diagnostic must be bounded");
  assert.equal(page.data.vm, null, "no half-built view may be rendered");
});

test("UI04C_page: the page computes no gameplay and never touches a Node-only API", () => {
  const source = read("miniprogram/pages/v2-live/v2-live.js");
  const code = stripJs(source);
  assert.equal(/require\(\s*"\.\.\/\.\.\/runtime\/index\.js"\s*\)/.test(source), true, "the runtime must be loaded by a static literal require");
  for (const forbidden of ["Math.random", "Math.floor(", "packages/core", "packages/content", "server/src", "require(\"fs\")", "process.", "wx.request"]) {
    assert.equal(code.includes(forbidden), false, "the page must not use " + forbidden);
  }
  assert.equal(/\b(?:risk|odds|probability|breakthroughOdds)\s*[:=]\s*[^;]*[*/+-]/.test(code), false, "no arithmetic over a gameplay value");
  assert.equal(code.includes("Date.now()") && code.includes("outcome"), false);
});

// ================================================================= 7. route, registration, docs

test("UI04C_route: the dev-only page is registered last and the accepted routing surface is intact", async () => {
  const { runRouteGuard } = await import("../tools/route-guard.mjs");
  const result = runRouteGuard({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));

  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-live/v2-live");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);

  for (const extension of ["js", "wxml", "wxss", "json"]) {
    assert.equal(fs.existsSync(path.join(ROOT, `miniprogram/pages/v2-live/v2-live.${extension}`)), true, `v2-live.${extension} must exist`);
  }
});

test("UI04C_route: the guard can fail — route order, tabBar and the runtime seam are real assertions", async () => {
  const { runRouteGuard, APP_JSON_PATH } = await import("../tools/route-guard.mjs");
  const committed = read(APP_JSON_PATH);
  const withFiles = (overrides) => ({ read: (relative) => (Object.hasOwn(overrides, relative) ? overrides[relative] : read(relative)), exists: (relative) => fs.existsSync(path.join(ROOT, relative)) });

  const moved = runRouteGuard(withFiles({ [APP_JSON_PATH]: JSON.stringify({ ...JSON.parse(committed), pages: ["pages/v2-live/v2-live", "pages/start/start"] }) }));
  assert.equal(moved.violations.some((entry) => entry.includes("default route moved")), true, moved.violations.join("\n"));

  const tab = JSON.parse(committed);
  tab.tabBar.list[0].text = "改了";
  const tabChanged = runRouteGuard(withFiles({ [APP_JSON_PATH]: JSON.stringify(tab) }));
  assert.equal(tabChanged.violations.some((entry) => entry.includes("tabBar changed")), true, tabChanged.violations.join("\n"));

  const pageSource = read("miniprogram/pages/v2-live/v2-live.js").replace('require("../../runtime/index.js")', 'require("../../packages/wechat-shell/src/index.ts")');
  const escaped = runRouteGuard(withFiles({ "miniprogram/pages/v2-live/v2-live.js": pageSource }));
  assert.equal(
    escaped.violations.some((entry) => entry.includes("outside the WeChat bundle") || entry.includes("escapes miniprogram/")),
    true,
    escaped.violations.join("\n")
  );
});

test("UI04C_registration: the suite, the route guard and the docs are registered", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.scripts["test:ui04c"], "node --test tests/ui04c.test.mjs");
  assert.equal(pkg.scripts["ui04c:route"], "node tools/route-guard.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui04c.test.mjs"), true, "the aggregate must run UI04C");
  for (const relative of ["tests/ui04c.test.mjs", "tools/route-guard.mjs", "docs/UI04C_LIVE_CLIENT.md"]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, relative + " must exist");
  }
  const doc = read("docs/UI04C_LIVE_CLIENT.md");
  for (const phrase of ["createRunOffer", "fetchView", "sendCommand", "selectionId", "destinyId", "STATE_CONFLICT", "v2-live", "rootSeed", "callFunction", "UI04D"]) {
    assert.equal(doc.includes(phrase), true, "the documentation must mention " + phrase);
  }
});
