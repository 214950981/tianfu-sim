import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CommandSubmissionController, RetryUnavailableError, SubmissionLockedError, canOrdinaryBack } from "../packages/application-ui/src/index.ts";
import { ContentRegistry } from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, validateGameState } from "../packages/core/src/index.ts";
import { buildWeChatPageShell } from "../packages/wechat-shell/src/index.ts";
import { CommandGateway, GatewayApplicationTransport, InMemoryGatewayStore, ServerViewModelBuilder } from "../server/src/index.ts";

const pack = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
function contentRegistry() { const content = new ContentRegistry(); content.register(pack); return content; }
function offered() {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", runId: "run-ui", playerId: "player-ui", rootSeed: "server-only-root-seed",
    metaView: { unlocks: ["public.unlock"], entitlements: [], discoveries: [] },
    fixture: { offerId: "offer-ui", destinyIds: ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"], age: 20, maxAge: 100, runName: "UI Run", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 }, resources: { spiritStone: 5, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} } }
  });
}
function active(content = contentRegistry()) {
  const started = reduce({ state: offered(), command: { type: "START_RUN", offerId: "offer-ui", destinyId: "destiny.steady-foundation" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:bootstrap" } }).state;
  const cause = (causeId, visibility) => ({ causeId, templateId: "cause.rescued-stranger", originCommandId: `cmd:${causeId}`, originNodeIndex: 0, originAge: 20, actorIdsByRole: { rescuedNpc: `npc:${causeId}` }, themes: ["secret-theme"], salience: 5, visibility, state: "eligible", maturity: { minNode: 0, minAge: 20, conditions: [] }, eligibleSinceNode: 0, eligibleAge: 20, echoBudget: 3, echoCount: 0, facts: { secret: true }, linkedEventIds: ["dev.rescue-echo-a"] });
  return validateGameState({ ...started, run: { ...started.run, events: { history: [{ eventId: "past.event", nodeIndex: 0, resultTier: "success" }], current: { eventId: "dev.first-choice", kind: "choice" } }, causes: { byId: { hidden: cause("hidden", "hidden"), hinted: cause("hinted", "hint"), explicit: cause("explicit", "journal") } }, npcs: { byId: { secretNpc: { npcId: "secretNpc", templateId: "secret", tier: "S", name: "Secret", age: 30, maxAge: 80, realmId: "secret", regionId: "secret", status: "dead", traits: [], goal: "secret", relation: { affinity: 0, trust: 0, debt: 0 }, importanceScore: 99, memoryRefs: [], timelineCursor: 0, tags: [] } } } } });
}
function keySet(value, result = new Set()) { if (Array.isArray(value)) value.forEach((entry) => keySet(entry, result)); else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { result.add(key); keySet(entry, result); } return result; }

test("VIEWMODEL_projection: PublicState/Interaction/History are safe and risk is server-built", () => {
  const content = contentRegistry(); const state = active(content); const snapshot = structuredClone(state); let riskCalls = 0;
  const builder = new ServerViewModelBuilder(content, { capabilities: { ShareCapability: true, PlatformCapability: true }, riskPolicy: ({ choice }) => { riskCalls += 1; return { tier: choice.check ? "dangerous" : "low", canBeFatal: false, reasons: ["risk.test"], level: choice.check ? "dangerous" : "unknown", labelKey: choice.check ? "risk.server.danger" : "risk.server.unknown", difficulty: 999, EffectSpec: "leak" }; } });
  const view = builder.build(state); assert.deepEqual(state, snapshot); assert.equal(view.state.pageState, "EVENT"); assert.equal(riskCalls, view.currentInteraction.options.length);
  assert.equal(view.currentInteraction.options.some((option) => option.riskPresentation?.labelKey === "risk.server.danger"), true);
  assert.equal(view.history.entries.length, 1); assert.equal(view.state.publicRun.actions.length, 4);
  const keys = keySet(view); for (const forbidden of ["rootSeed", "rng", "drawIndex", "salience", "echoBudget", "eligibleSinceNode", "eligibleAge", "selector", "futureEventIds", "npcs", "check", "difficulty", "effects", "EffectSpec", "trace", "actorIdsByRole"]) assert.equal(keys.has(forbidden), false, forbidden);
  const serialized = JSON.stringify(view); assert.equal(serialized.includes("server-only-root-seed"), false); assert.equal(serialized.includes("secretNpc"), false); assert.equal(serialized.includes("npc:hidden"), false);
  assert.deepEqual(view.state.publicCauses.map((cause) => cause.level).sort(), ["explicit", "hinted"]); assert.equal(view.state.publicCauses.some((cause) => cause.publicId === "hidden"), false);
});

test("PAGE_state/capabilities: unresolved EVENT blocks back and absent features stay hidden", () => {
  const content = contentRegistry(); const builder = new ServerViewModelBuilder(content, { capabilities: { AdCapability: true, ShareCapability: true, PlatformCapability: true } }); const view = builder.build(active(content));
  const submitting = { interactionState: "submitting", mutuallyExclusiveLocked: true, requiresReconfirmation: false, view };
  const shell = buildWeChatPageShell(view, submitting); assert.equal(shell.pageState, "EVENT"); assert.equal(shell.interactionLocked, true); assert.equal(shell.ordinaryBackAllowed, false);
  assert.deepEqual(shell.visibleEntries, { dailyChallenge: false, rewardedAd: false, commerce: false, share: true, aiNarrative: false });
  const withoutPlatform = new ServerViewModelBuilder(content, { capabilities: { ShareCapability: true } }).build(active(content)); assert.equal(buildWeChatPageShell(withoutPlatform, submitting).visibleEntries.share, false);
  assert.equal(canOrdinaryBack("EVENT", "idle"), false); assert.equal(canOrdinaryBack("EVENT", "confirmed"), true); assert.equal(canOrdinaryBack("RUN_HOME", "idle"), true);
  assert.equal(JSON.stringify(shell).includes("challengeSeed"), false); assert.equal(JSON.stringify(shell).includes("leaderboard"), false);
});

class MemoryStorage { values = new Map(); getLocal(key) { return Promise.resolve(this.values.get(key) ?? null); } setLocal(key, value) { this.values.set(key, value); return Promise.resolve(); } }
function session() { return { playerId: "player-ui", runId: "run-ui", rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", clientBuild: "a12-test" }; }
const choose = { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "continue" };

test("COMMAND_submission: submitting locks double-click and successful refresh confirms", async () => {
  const content = contentRegistry(); const view = new ServerViewModelBuilder(content).build(active(content)); let resolveSend; const sent = [];
  const transport = { sendCommand(command) { sent.push(command); return new Promise((resolve) => { resolveSend = resolve; }); }, fetchView: async () => view, createRunOffer: async () => ({}) };
  const controller = new CommandSubmissionController({ transport, storage: new MemoryStorage(), session: session(), commandIdFactory: () => "cmd:locked", initialView: view });
  const first = controller.submit(choose); await Promise.resolve(); await assert.rejects(() => controller.submit(choose), SubmissionLockedError); assert.equal(controller.snapshot().mutuallyExclusiveLocked, true); assert.equal(sent.length, 1);
  resolveSend({ ok: true, commandId: "cmd:locked", stateVersion: view.state.stateVersion + 1 }); await first; assert.equal(controller.snapshot().interactionState, "confirmed"); assert.equal(controller.snapshot().pendingCommandId, undefined);
});

test("PENDING_retry: retry and restart reuse the identical commandId/envelope", async () => {
  const content = contentRegistry(); const view = new ServerViewModelBuilder(content).build(active(content)); const storage = new MemoryStorage(); const sent = []; let fail = true;
  const transport = { async sendCommand(command) { sent.push(structuredClone(command)); if (fail) { fail = false; throw new Error("network"); } return { ok: true, commandId: command.commandId, stateVersion: command.expectedStateVersion + 1 }; }, fetchView: async () => view, createRunOffer: async () => ({}) };
  const first = new CommandSubmissionController({ transport, storage, session: session(), commandIdFactory: () => "cmd:retry", initialView: view }); await assert.rejects(() => first.submit(choose), /network/); assert.equal(first.snapshot().interactionState, "retryableError");
  const restored = new CommandSubmissionController({ transport, storage, session: session(), commandIdFactory: () => "cmd:must-not-be-used", initialView: view }); await restored.restorePending(); assert.equal(restored.snapshot().pendingCommandId, "cmd:retry"); await restored.retry();
  assert.equal(sent.length, 2); assert.deepEqual(sent[1], sent[0]); assert.equal(restored.snapshot().interactionState, "confirmed");
});

test("STATE_CONFLICT refreshes ViewModel and requires explicit reconfirmation", async () => {
  const content = contentRegistry(); const original = new ServerViewModelBuilder(content).build(active(content)); const latest = structuredClone(original); latest.state.stateVersion += 1; const sent = []; let conflict = true;
  const transport = { async sendCommand(command) { sent.push(structuredClone(command)); if (conflict) { conflict = false; return { ok: false, commandId: command.commandId, stateVersion: latest.state.stateVersion, error: { code: "STATE_CONFLICT", messageKey: "state.version_conflict", retryable: false } }; } return { ok: true, commandId: command.commandId, stateVersion: command.expectedStateVersion + 1 }; }, fetchView: async () => latest, createRunOffer: async () => ({}) };
  const ids = ["cmd:stale", "cmd:reconfirmed"]; const controller = new CommandSubmissionController({ transport, storage: new MemoryStorage(), session: session(), commandIdFactory: () => ids.shift(), initialView: original });
  const result = await controller.submit(choose); assert.equal(result.error.code, "STATE_CONFLICT"); assert.equal(controller.snapshot().requiresReconfirmation, true); assert.equal(controller.snapshot().view.state.stateVersion, latest.state.stateVersion); await assert.rejects(() => controller.retry(), RetryUnavailableError); assert.equal(sent.length, 1);
  await controller.reconfirm(choose); assert.equal(sent.length, 2); assert.equal(sent[1].commandId, "cmd:reconfirmed"); assert.equal(sent[1].expectedStateVersion, latest.state.stateVersion);
});

test("PLAT_adapter/minimal shell connects Gateway transport without exposing commandId", async () => {
  const content = contentRegistry(); const builder = new ServerViewModelBuilder(content, { capabilities: { PlatformCapability: true } }); const initial = offered(); const store = new InMemoryGatewayStore(); store.seedRun(initial);
  const gateway = new CommandGateway({ store, content, projectView: (state) => builder.build(state) }); const transport = new GatewayApplicationTransport(gateway, { playerId: "player-ui" }); const initialView = await transport.fetchView("run-ui");
  const controller = new CommandSubmissionController({ transport, storage: new MemoryStorage(), session: session(), commandIdFactory: () => "cmd:start-ui", initialView });
  await controller.submit({ type: "START_RUN", offerId: "offer-ui", destinyId: "destiny.steady-foundation" }); const snapshot = controller.snapshot(); assert.equal(snapshot.view.state.pageState, "RUN_HOME");
  const shell = buildWeChatPageShell(snapshot.view, snapshot); assert.equal(shell.pageState, "RUN_HOME"); assert.equal(JSON.stringify(shell).includes("cmd:start-ui"), false); assert.equal(JSON.stringify(shell).includes("rootSeed"), false);
});
