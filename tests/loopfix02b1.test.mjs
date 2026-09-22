import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CONTENT01_CAUSE_TEMPLATES, CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, NPC_CONTENT01_V1, runRecurrenceAudit, sealContentPack } from "../packages/content/src/index.ts";
import { createCommandLog, createOfferedRun, createSnapshot, defaultEchoBudget, executeLoggedCommand, isEventEligible, materializeEventParticipants, recordEventOccurrence, reduce, replayCommandLog, ruleStateHash, scoreDirectorEvent, selectDirectorEvent, selectCauseEcho, validateGameState, validateSnapshot } from "../packages/core/src/index.ts";
import { CommandGateway, InMemoryGatewayStore, ServerViewModelBuilder } from "../server/src/index.ts";

// LOOPFIX02B1 — CONTENT01 recurrence application. Core/Director are untouched: every assertion below runs on frozen Core code.
function registry() { const content = new ContentRegistry(); content.registerNpcPack(NPC_CONTENT01_V1); content.register(CONTENT01_PACK); return content; }
function offered(contentVersion = CONTENT01_VERSION, seed = "loopfix02b1") { return createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: `run:${contentVersion}:${seed}`, playerId: "player:loopfix02b1", rootSeed: seed, metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: `offer:${contentVersion}:${seed}`, destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"], age: 20, maxAge: 400, runName: "LoopFix", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} }, firstRun: false } }); }
function active(content = registry(), seed = "loopfix02b1") { const state = offered(CONTENT01_VERSION, seed); return reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:start` } }).state; }
function context(content, state, commandId) { return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId }; }
function enter(state, eventId, content, commandId = `cmd:enter:${eventId}`) { const event = content.getEvent(state.contentVersion, eventId); const staged = validateGameState({ ...state, run: { ...state.run, events: { ...state.run.events, current: { eventId, kind: event.kind } } } }); return materializeEventParticipants(staged, content, eventId, `event:${commandId}:${eventId}`).state; }
function atNode(state, nodeIndex) { return validateGameState({ ...state, run: { ...state.run, nodeIndex } }); }
function cooldownOf(eventId) { return CONTENT01_PACK.events.find((event) => event.id === eventId).cooldown; }
function safeChoiceId(content, state, eventId) { const choices = content.getEvent(state.contentVersion, eventId).choices; return (choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id)) ?? choices[0]).id; }
// Cause maturity only advances through the authoritative action path; a hand-set nodeIndex never mutates cause state.
function plantCause(content, seed, originEventId, choiceId) { let state = active(content, seed); state = enter(state, originEventId, content, `cmd:${seed}:enter`); return reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: originEventId, optionId: choiceId }, context: context(content, state, `cmd:${seed}:bind`) }).state; }
function advanceTo(content, state, steps) { let next = state; for (let step = 0; step < steps && next.run.status === "active"; step += 1) next = next.run.events.current === undefined ? reduce({ state: next, command: { type: "CHOOSE_ACTION", actionId: ["cultivate", "travel", "worldly", "pursuit"][step % 4] }, context: context(content, next, `cmd:advance:${next.stateVersion}`) }).state : reduce({ state: next, command: { type: "CHOOSE_EVENT_OPTION", eventId: next.run.events.current.eventId, optionId: safeChoiceId(content, next, next.run.events.current.eventId) }, context: context(content, next, `cmd:advance:${next.stateVersion}`) }).state; return next; }
function constructWeight(content, state, eventId) { const event = content.getEvent(state.contentVersion, eventId); const plain = scoreDirectorEvent(state, event, "cultivate", content, "P4").weight; const withRecent = validateGameState({ ...state, run: { ...state.run, director: { ...state.run.director, recentScenes: [...state.run.director.recentScenes, { eventId: event.id, nodeIndex: state.run.nodeIndex, slot: "P4", salience: event.directorHints.salience, topicTags: event.directorHints.topicTags, continuityTags: event.directorHints.continuityTags, actorIds: [], buildIds: [] }] } } }); return { plain, penalised: scoreDirectorEvent(withRecent, event, "cultivate", content, "P4").weight }; }

const ORIGIN_EVENTS = [
  { eventId: "content01.pei.broken-blade", templateId: "content01.cause.broken-sword-promise" },
  { eventId: "content01.jiang.herb-price", templateId: "content01.cause.medicine-debt" },
  { eventId: "content01.cen.shoulder-road", templateId: "content01.cause.shared-wound" },
  { eventId: "content01.xie.secret-map", templateId: "content01.cause.secret-map-pact" },
  { eventId: "content01.xu.mortal-letter", templateId: "content01.cause.mortal-promise" },
  { eventId: "content01.road.help", templateId: "content01.cause.road-kindness" },
  { eventId: "content01.road.conflict", templateId: "content01.cause.road-conflict" }
];
// P4-reachable (non cause-linked) core-NPC events plus every cause-linked echo Event.
const SPACED_EVENTS = ["content01.pei.sparring-rain", "content01.pei.old-wound", "content01.pei.promise-echo", "content01.jiang.night-clinic", "content01.jiang.bitter-decoction", "content01.jiang.debt-echo", "content01.cen.stone-steps", "content01.cen.shield-stranger", "content01.cen.shared-echo", "content01.xie.cave-gamble", "content01.xie.divided-spoils", "content01.xie.map-echo", "content01.xu.ten-year-return", "content01.xu.empty-courtyard", "content01.xu.promise-echo", "content01.road.kindness-echo", "content01.road.conflict-echo"];

test("LOOPFIX02B1-001: every Cause origin Event is capped once per Run", () => {
  for (const { eventId } of ORIGIN_EVENTS) assert.deepEqual(cooldownOf(eventId), { maxOccurrences: 1 }, eventId);
  const content = registry(); const state = active(content);
  for (const { eventId } of ORIGIN_EVENTS) assert.equal(isEventEligible(content.getEvent(state.contentVersion, eventId), state), true, eventId);
});

test("LOOPFIX02B1-002: a once-per-run origin records one occurrence and then leaves the candidate pool", () => {
  const content = registry(); const state = active(content); const eventId = "content01.pei.broken-blade";
  const direct = enter(state, eventId, content, "cmd:origin:direct");
  const bound = reduce({ state: direct, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "bind-1" }, context: context(content, direct, "cmd:origin:direct:choice") }).state;
  assert.ok(Object.values(bound.run.causes.byId).some((cause) => cause.templateId === "content01.cause.broken-sword-promise"));
  const entered = enter(state, eventId, content, "cmd:origin:select");
  const recorded = recordEventOccurrence(entered, eventId);
  assert.equal(recorded.run.events.occurrences[eventId]?.occurrenceCount, 1, "authoritative selection records exactly one occurrence");
  assert.equal(recorded.run.events.occurrences[eventId]?.lastOccurrenceNodeIndex, recorded.run.nodeIndex);
  const after = reduce({ state: recorded, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "bind-1" }, context: context(content, recorded, "cmd:origin:choice") }).state;
  assert.equal(after.run.events.current, undefined);
  assert.equal(after.run.events.occurrences[eventId]?.occurrenceCount, 1, "the legal choice must not add a second occurrence");
  assert.equal(isEventEligible(content.getEvent(after.contentVersion, eventId), after), false, "a once-per-run Event stays out at the same node");
  assert.equal(isEventEligible(content.getEvent(after.contentVersion, eventId), atNode(after, after.run.nodeIndex + 25)), false, "an origin may not plant a second Cause at any later node");
});

test("LOOPFIX02B1-003: the legal choice of a once-per-run origin still resolves after selection recorded it", () => {
  const content = registry(); const state = active(content); const eventId = "content01.road.help";
  const direct = enter(state, eventId, content, "cmd:origin:legal");
  const bound = reduce({ state: direct, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "bind-1" }, context: context(content, direct, "cmd:origin:legal:choice") }).state;
  assert.ok(Object.values(bound.run.causes.byId).some((cause) => cause.templateId === "content01.cause.road-kindness"));
  // A recorded occurrence must never block the still-authoritative current scene's own legal choice.
  const recorded = recordEventOccurrence(enter(state, eventId, content, "cmd:origin:replay"), eventId);
  assert.equal(recorded.run.events.occurrences[eventId]?.occurrenceCount, 1);
  const stillLegal = reduce({ state: recorded, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "bind-1" }, context: context(content, recorded, "cmd:origin:replay:choice") }).state;
  assert.equal(stillLegal.run.events.current, undefined);
  assert.ok(Object.values(stillLegal.run.causes.byId).some((cause) => cause.templateId === "content01.cause.road-kindness"));
});

test("LOOPFIX02B1-004: core NPC P4 Events stay eligible while the NPC is met and active, then space out", () => {
  const content = registry(); let state = active(content, "p4-cooldown"); state = enter(state, "content01.cen.shoulder-road", content, "cmd:p4:intro");
  state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: "content01.cen.shoulder-road", optionId: "bind-1" }, context: context(content, state, "cmd:p4:intro:choice") }).state;
  for (const eventId of SPACED_EVENTS) { const event = content.getEvent(state.contentVersion, eventId); assert.equal(typeof cooldownOf(eventId)?.minNodesBetween, "number", eventId); }
  assert.ok(SPACED_EVENTS.every((eventId) => isEventEligible(content.getEvent(state.contentVersion, eventId), state) || eventId === "content01.cen.shield-stranger"), "a fresh run blocks only what P5/P6 pacing already pauses");
  const recorded = recordEventOccurrence(atNode(state, 10), "content01.cen.stone-steps");
  assert.equal(isEventEligible(content.getEvent(state.contentVersion, "content01.cen.stone-steps"), recorded), false);
  assert.equal(isEventEligible(content.getEvent(state.contentVersion, "content01.cen.stone-steps"), atNode(recorded, 14)), false);
  assert.equal(isEventEligible(content.getEvent(state.contentVersion, "content01.cen.stone-steps"), atNode(recorded, 15)), true, "a spaced Event reopens at the exact boundary");
  const weighted = constructWeight(content, atNode(state, 15), "content01.cen.stone-steps");
  assert.ok(weighted.plain > 0 && weighted.penalised < weighted.plain, "the recent-event penalty still applies to spaced Events");
  assert.equal(isEventEligible(content.getEvent(state.contentVersion, "content01.cen.shoulder-road"), recordEventOccurrence(state, "content01.cen.shoulder-road")), false, "a once-per-run origin leaves the pool by occurrence, not by cooldown");
});

test("LOOPFIX02B1-005: cause-linked echo Events are spaced and a Cause cannot echo back to back", () => {
  const content = registry(); const links = CONTENT01_CAUSE_TEMPLATES.flatMap((template) => template.linkedEventIds.map((eventId) => ({ templateId: template.id, eventId })));
  assert.equal(new Set(links.map((entry) => entry.eventId)).size, links.length);
  for (const { eventId } of links) assert.ok(cooldownOf(eventId)?.minNodesBetween >= 4, eventId);
  const state = atNode(active(content, "echo-cooldown"), 10);
  for (const { templateId, eventId } of links) {
    const recorded = recordEventOccurrence(state, eventId);
    assert.equal(isEventEligible(content.getEvent(state.contentVersion, eventId), recorded), false, eventId);
    assert.equal(isEventEligible(content.getEvent(state.contentVersion, eventId), atNode(recorded, 14)), false, eventId);
    assert.equal(isEventEligible(content.getEvent(state.contentVersion, eventId), atNode(recorded, 15)), true, eventId);
    assert.ok(CONTENT01_PACK.causeTemplates.some((template) => template.id === templateId && template.linkedEventIds.includes(eventId)));
  }
});

test("LOOPFIX02B1-006: echoBudget values and consumption semantics are unchanged", () => {
  for (const template of CONTENT01_CAUSE_TEMPLATES) assert.equal(defaultEchoBudget(template.salience), template.salience === 1 ? 0 : template.salience <= 3 ? 1 : template.salience === 4 ? 2 : 3, template.id);
  // Authoritative path: the Cause matures and echoes inside the reducer, so budget only ever drops by exactly one per echo.
  const content = registry(); const planted = plantCause(content, "echo-budget", "content01.road.help", "bind-1"); const causeId = Object.keys(planted.run.causes.byId)[0];
  assert.equal(planted.run.causes.byId[causeId].templateId, "content01.cause.road-kindness");
  assert.equal(planted.run.causes.byId[causeId].echoBudget, 1, "salience 2 authorises exactly one echo");
  const advanced = advanceTo(content, planted, 1);
  const after = advanced.run.causes.byId[causeId];
  assert.equal(after.echoCount, 1, "the maturity node echoes exactly once");
  assert.equal(after.echoBudget, 0, "each echo decrements the budget by exactly one");
  assert.equal(after.state, "echoed");
  assert.equal(after.resolution, undefined, "B1 adds no Cause closure bookkeeping");
  assert.equal(Object.keys(advanced.run.causes.byId).length, 1, "B1 creates no extra Causes");
  const echoedEventId = advanced.run.events.current?.eventId;
  assert.equal(echoedEventId, "content01.road.kindness-echo", "the echo goes to the Cause-linked Event, never back to its origin");
  // A salience-4 Cause keeps a two-echo budget under the frozen default rule.
  const big = registry(); const plantedBig = plantCause(big, "echo-budget-4", "content01.cen.shoulder-road", "bind-1"); const bigCauseId = Object.keys(plantedBig.run.causes.byId)[0];
  assert.equal(plantedBig.run.causes.byId[bigCauseId].echoBudget, defaultEchoBudget(4));
  assert.equal(defaultEchoBudget(4), 2);
});

test("LOOPFIX02B1-007: Director P1-P6 precedence and P3-before-P4 ordering are unchanged", () => {
  const content = registry(); const director = fs.readFileSync(new URL("../.codex/contracts/director.ref", import.meta.url), "utf8");
  const lifecycle = fs.readFileSync(new URL("../.codex/contracts/lifecycle.ref", import.meta.url), "utf8");
  assert.ok(director.includes("Selector precedence is strict: P1 terminal/lifespan; P2 first-run Director; P3 eligible Cause echo; P4 met+active core NPC; P5 action/Build/world/generated-NPC context; P6 ordinary fallback."));
  for (const tier of ["P1 terminal", "P2 first-run", "P3 eligible", "P4 active", "P5 build", "P6 ordinary"]) assert.equal(lifecycle.includes(tier), true, tier);
  let state = enter(active(content, "p4-precedence"), "content01.cen.shoulder-road", content, "cmd:p4-precedence");
  state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: "content01.cen.shoulder-road", optionId: "bind-1" }, context: context(content, state, "cmd:p4-precedence:choice") }).state;
  const selection = selectDirectorEvent(state, "travel", content, ["P4", "P5", "P6"]);
  assert.equal(selection.trace.selectedPrecedenceLevel, "P4");
  const coreOnly = selectDirectorEvent(state, "travel", content, ["P4"]).state.run.events.current?.eventId;
  assert.ok(coreOnly === undefined || CONTENT01_PACK.events.find((event) => event.id === coreOnly).directorHints.npcRoleAffinityTags.length > 0);
});

test("LOOPFIX02B1-008: Snapshot, replay, hash, RNG and gateway retry stay stable with recurrence active", async () => {
  const content = registry(); const initial = active(content, "b1-replay");
  const action = { commandId: "cmd:b1:action", playerId: initial.run.playerId, runId: initial.run.runId, expectedStateVersion: initial.stateVersion, rulesVersion: initial.rulesVersion, contentVersion: initial.contentVersion, clientPlatform: "dev", clientBuild: "loopfix02b1", command: { type: "CHOOSE_ACTION", actionId: "travel" } };
  const selected = executeLoggedCommand(initial, createCommandLog(initial), action, {}, content);
  const eventId = selected.output.state.run.events.current.eventId;
  const chosen = content.getEvent(initial.contentVersion, eventId).choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id)).id;
  const choice = { ...action, commandId: "cmd:b1:choice", expectedStateVersion: selected.output.state.stateVersion, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: chosen } };
  const completed = executeLoggedCommand(selected.output.state, selected.commandLog, choice, {}, content);
  const replayed = replayCommandLog({ initialState: initial, commandLog: completed.commandLog, content });
  const snapshot = validateSnapshot(JSON.parse(JSON.stringify(createSnapshot(completed.output.state, 3))));
  assert.equal(completed.output.state.run.events.occurrences[eventId]?.occurrenceCount, 1);
  assert.deepEqual(replayed.state.run.events.occurrences, completed.output.state.run.events.occurrences);
  assert.equal(replayed.finalRuleStateHash, ruleStateHash(completed.output.state));
  assert.equal(snapshot.ruleStateHash, replayed.finalRuleStateHash);
  assert.deepEqual(replayed.state.run.rng, completed.output.state.run.rng);
  const store = new InMemoryGatewayStore(); store.seedRun(initial); const gateway = new CommandGateway({ store, content });
  await gateway.sendCommand({ playerId: initial.run.playerId }, action);
  const gatewayChoice = { ...choice, expectedStateVersion: store.readRun(initial.run.runId).state.stateVersion };
  const first = await gateway.sendCommand({ playerId: initial.run.playerId }, gatewayChoice);
  const retry = await gateway.sendCommand({ playerId: initial.run.playerId }, gatewayChoice);
  assert.deepEqual(retry, first);
  assert.equal(store.readRun(initial.run.runId).state.run.events.occurrences[eventId]?.occurrenceCount, 1);
});

test("LOOPFIX02B1-009: repeat-safe declarations are minimal, true and never applied to once-per-run Events", () => {
  const occurrences = new Map(); for (const event of CONTENT01_PACK.events) for (const outcome of (event.choices ?? []).flatMap((choice) => [choice.outcomes.greatSuccess, choice.outcomes.success, choice.outcomes.costlySuccess, choice.outcomes.failure])) for (const effect of outcome?.effects ?? []) if (effect.repeatBehavior !== undefined) { assert.equal(effect.repeatBehavior, "allow-cumulative"); occurrences.set(event.id, (occurrences.get(event.id) ?? 0) + 1); }
  for (const eventId of occurrences.keys()) assert.notEqual(cooldownOf(eventId)?.maxOccurrences, 1, eventId);
  const riskChoices = CONTENT01_PACK.events.flatMap((event) => (event.choices ?? []).filter((choice) => choice.threatId !== undefined).map((choice) => ({ eventId: event.id, declared: choice.riskRepeatBehavior })));
  for (const { eventId, declared } of riskChoices) assert.equal(declared, cooldownOf(eventId) === undefined ? undefined : "allow-repeat-resolution", eventId);
  assert.equal(/repeatBehavior/.test(JSON.stringify(CONTENT01_PACK.events.filter((event) => cooldownOf(event.id)?.maxOccurrences === 1))), false);
});

test("LOOPFIX02B1-010: recurrence is declared for Cause origins, spaced Events and nothing else", () => {
  const declared = CONTENT01_PACK.events.filter((event) => event.cooldown !== undefined).map((event) => event.id);
  assert.deepEqual([...declared].sort(), [...ORIGIN_EVENTS.map((entry) => entry.eventId), ...SPACED_EVENTS].sort());
  assert.equal(declared.length, 24);
  for (const event of CONTENT01_PACK.events) if (event.cooldown === undefined) assert.equal(event.tags.includes("cause-origin"), false, event.id);
});

test("LOOPFIX02B1-011: recurrence keeps a long life playable, deterministic and free of candidate deadlock", () => {
  const content = registry(); const runOnce = () => { let state = active(content, "b1-long"); while (state.run.status === "active" && state.run.nodeIndex < 40) { state = state.run.events.current === undefined ? reduce({ state, command: { type: "CHOOSE_ACTION", actionId: ["cultivate", "travel", "worldly", "pursuit"][state.run.nodeIndex % 4] }, context: context(content, state, `cmd:long:${state.stateVersion}`) }).state : reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: state.run.events.current.eventId, optionId: content.getEvent(state.contentVersion, state.run.events.current.eventId).choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id))?.id ?? content.getEvent(state.contentVersion, state.run.events.current.eventId).choices[0].id }, context: context(content, state, `cmd:long:${state.stateVersion}`) }).state; } return state; };
  const first = runOnce(); const second = runOnce();
  assert.equal(ruleStateHash(first), ruleStateHash(second));
  assert.deepEqual(first.run.events.occurrences, second.run.events.occurrences);
  assert.ok(first.run.nodeIndex >= 40);
  for (const [eventId, occurrence] of Object.entries(first.run.events.occurrences)) { const cooldown = cooldownOf(eventId); if (cooldown?.maxOccurrences !== undefined) assert.ok(occurrence.occurrenceCount <= cooldown.maxOccurrences, eventId); }
  assert.equal(JSON.stringify(new ServerViewModelBuilder(content).build(first)).includes("occurrences"), false);
});

test("LOOPFIX02B1-012: content01 recurrence audit is clean and the pack stays on its frozen content version", () => {
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const report = runRecurrenceAudit(CONTENT01_PACK, { lifecycleContract: read("../.codex/contracts/lifecycle.ref"), directorContract: read("../.codex/contracts/director.ref"), coreSource: ["event.ts", "reducer.ts", "director.ts"].map((file) => read(`../packages/core/src/${file}`)).join("\n") });
  for (const key of ["invalidRecurrenceDefinitions", "occurrenceCountViolations", "cooldownViolations", "duplicateCountOnRetry", "repeatSafeViolations", "directorPrecedenceDrift", "lifecycleNumberingDrift", "contentIdHardcodingViolations"]) assert.equal(report[key], 0, key);
  assert.equal(report.eventDefinitions, 66); assert.equal(report.recurrenceDefinitions, 24);
  assert.equal(CONTENT01_PACK.manifest.contentVersion, CONTENT01_VERSION);
  const resealed = sealContentPack({ ...structuredClone(CONTENT01_PACK), manifest: { ...CONTENT01_PACK.manifest, checksum: undefined } });
  assert.equal(resealed.manifest.contentVersion, CONTENT01_VERSION);
  assert.equal(resealed.events.length, 66);
  assert.equal(resealed.manifest.checksum, CONTENT01_PACK.manifest.checksum, "resealing the frozen pack reproduces its checksum");
  assert.equal(runRecurrenceAudit(resealed, { lifecycleContract: read("../.codex/contracts/lifecycle.ref"), directorContract: read("../.codex/contracts/director.ref"), coreSource: "" }).repeatSafeViolations, 0);
});

test("LOOPFIX02B1-013: recurrence application is data driven with no Core or Director special casing", () => {
  const core = ["event.ts", "reducer.ts", "director.ts"].map((file) => fs.readFileSync(new URL(`../packages/core/src/${file}`, import.meta.url), "utf8")).join("\n");
  assert.equal(/content01\.|cen-|pei-|jiang-|xie-|xu-/.test(core), false);
  for (const eventId of ["content01.pei.broken-blade", "content01.cen.stone-steps"]) assert.equal(new RegExp(eventId.replace(/\./g, "\\.")).test(core), false, eventId);
});
