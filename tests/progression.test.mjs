import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry, MAJOR_DESTINIES_V1, PROGRESSION_EXPANSION_DESTINIES, PROGRESSION_V1, SPIRITUAL_ROOTS_V1, TALENTS_V1, runComboAudit, validateProgressionPack } from "../packages/content/src/index.ts";
import { aggregateProgressionModifiers, applyBreakthroughOutcome, createCommandLog, createOfferedRun, executeLoggedCommand, orderedProgressionHooks, replayCommandLog, ruleStateHash, validateCommandEnvelope, validateGameState, reduce, cultivationStage } from "../packages/core/src/index.ts";
import { generateServerDestinyOffer } from "../server/src/index.ts";

const contentPack = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
function contentRegistry() { const content = new ContentRegistry(); content.register(contentPack); return content; }
const profile = { spiritualRoot: "root.dual", talentIds: ["talent.cultivation.01"], majorDestinyId: "destiny.major.breakthrough.01" };
function active(overrides = {}) {
  const content = contentRegistry(); const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", runId: "run-prog", playerId: "player-prog", rootSeed: "prog-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer-prog", destinyIds: ["d1", "d2", "d3"], age: 20, maxAge: 80, runName: "Prog", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} } } });
  const started = reduce({ state: offered, command: { type: "START_RUN", offerId: "offer-prog", destinyId: "d1" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:start" } }).state;
  return { content, state: validateGameState({ ...started, run: { ...started.run, identity: { ...started.run.identity, innateProfile: structuredClone(profile), destinyId: profile.majorDestinyId }, realm: { ...started.run.realm, cultivation: overrides.cultivationBps ?? 0, cultivationBps: overrides.cultivationBps ?? 0, realmFoundationBps: overrides.realmFoundationBps ?? 0 }, ...overrides.run } }) };
}

test("PROG registry: six data-driven realms, 8 roots, 48 talents and 36 core destinies validate", () => {
  assert.strictEqual(validateProgressionPack(PROGRESSION_V1), PROGRESSION_V1); assert.equal(PROGRESSION_V1.realms.length, 6); assert.equal(SPIRITUAL_ROOTS_V1.length, 8); assert.equal(TALENTS_V1.length, 48); assert.equal(MAJOR_DESTINIES_V1.length, 36); assert.equal(PROGRESSION_EXPANSION_DESTINIES.length, 4);
  assert.deepEqual(PROGRESSION_V1.realms.map(({ displayName, lifespanCap, retreatCultivationGain, retreatFoundationGain, breakthroughDifficulty }) => [displayName, lifespanCap, retreatCultivationGain, retreatFoundationGain, breakthroughDifficulty]), [["凡人",80,3200,700,350],["炼气",120,2800,650,450],["筑基",180,2400,600,550],["金丹",300,2000,550,650],["元婴",500,1600,500,750],["化神",800,1200,450,undefined]]);
  assert.deepEqual([0, 3334, 6667, 10000].map(cultivationStage), ["early", "mid", "late", "complete"]);
});

test("retreat uses authoritative realm gains and canonical root modifiers, caps cultivation but still grows foundation", () => {
  const { content, state } = active(); const heavenly = validateGameState({ ...state, run: { ...state.run, identity: { ...state.run.identity, innateProfile: { ...profile, spiritualRoot: "root.heavenly" } } } });
  const first = reduce({ state: heavenly, command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:retreat" } });
  assert.equal(first.state.run.realm.cultivationBps, 3776); assert.equal(first.state.run.realm.realmFoundationBps, 651); assert.equal(first.state.run.age, 23); assert.equal(first.state.run.nodeIndex, 1);
  const capped = validateGameState({ ...heavenly, run: { ...heavenly.run, realm: { ...heavenly.run.realm, cultivation: 10000, cultivationBps: 10000, realmFoundationBps: 9000 } } }); const result = reduce({ state: capped, command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:capped" } }); assert.equal(result.state.run.realm.cultivationBps, 10000); assert.equal(result.state.run.realm.realmFoundationBps, 9651);
});

test("breakthrough four outcomes apply frozen retention/loss/injury/lifespan rules", () => {
  const { state } = active({ cultivationBps: 10000, realmFoundationBps: 8000 });
  const great = applyBreakthroughOutcome(state, PROGRESSION_V1, "greatSuccess", "great"); const success = applyBreakthroughOutcome(state, PROGRESSION_V1, "success", "success"); const costly = applyBreakthroughOutcome(state, PROGRESSION_V1, "costlySuccess", "costly"); const failure = applyBreakthroughOutcome(state, PROGRESSION_V1, "failure", "failure");
  for (const value of [great, success, costly]) { assert.equal(value.run.realm.id, "qi-refining"); assert.equal(value.run.realm.cultivationBps, 0); assert.equal(value.run.maxAge, 120); }
  assert.equal(great.run.realm.realmFoundationBps, 4800); assert.equal(success.run.realm.realmFoundationBps, 3600); assert.equal(costly.run.realm.realmFoundationBps, 2400); assert.equal(costly.run.conditions.at(-1).stacks, 1);
  assert.equal(failure.run.realm.id, "mortal"); assert.equal(failure.run.realm.cultivationBps, 7500); assert.equal(failure.run.realm.realmFoundationBps, 7000); assert.equal(failure.run.conditions.at(-1).stacks, 1); assert.equal(failure.run.status, "active");
  let injured = failure; for (let index = 0; index < 5; index += 1) injured = applyBreakthroughOutcome(injured, PROGRESSION_V1, "failure", `failure:${index}`); assert.equal(injured.run.conditions.find((condition) => condition.id.includes("breakthrough-injury")).stacks, 3);
});

test("modifier aggregation is insertion-order independent and clamps all frozen bounds", () => {
  const base = aggregateProgressionModifiers(PROGRESSION_V1, profile); assert.deepEqual(base, aggregateProgressionModifiers({ ...PROGRESSION_V1, spiritualRoots: [...PROGRESSION_V1.spiritualRoots].reverse(), talents: [...PROGRESSION_V1.talents].reverse(), majorDestinies: [...PROGRESSION_V1.majorDestinies].reverse() }, profile));
  const custom = structuredClone(PROGRESSION_V1); custom.talents.find((value) => value.id === profile.talentIds[0]).modifiers.push({ kind: "cultivationGainRateDeltaBps", value: 99_999, systemOwner: "PROG01" }, { kind: "foundationGainRateDeltaBps", value: -99_999, systemOwner: "PROG01" }, { kind: "breakthroughScoreDelta", value: 999, systemOwner: "PROG01" }); const aggregate = aggregateProgressionModifiers(custom, profile); assert.equal(aggregate.cultivationGainRateBps, 16000); assert.equal(aggregate.foundationGainRateBps, 5000); assert.equal(aggregate.breakthroughScoreDelta, 120); assert.deepEqual(aggregate.sources, [...aggregate.sources].sort());
});

test("InnateProfile offer is deterministic, diverse, server-owned and activates one talent", () => {
  const content = contentRegistry(); const input = { schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", runId: "offer-run", playerId: "offer-player", rootSeed: "offer-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, content, fixture: { offerId: "offer", age: 16, maxAge: 80, runName: "Offer", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 1, body: 1, spiritSense: 1, fortune: 1 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} } } };
  const first = generateServerDestinyOffer(input); const second = generateServerDestinyOffer(input); assert.deepEqual(first, second); const offers = first.state.run.offer.innateProfiles; assert.equal(new Set(offers.map((offer) => JSON.stringify(offer.profile))).size, 3); assert.equal(new Set(offers.map((offer) => offer.profile.majorDestinyId)).size, 3); assert.ok(new Set(offers.map((offer) => offer.profile.spiritualRoot)).size >= 2); assert.ok(offers.every((offer) => offer.profile.talentIds.length === 1));
  assert.throws(() => validateCommandEnvelope({ commandId: "inject", playerId: "offer-player", runId: "offer-run", expectedStateVersion: 0, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", clientPlatform: "dev", clientBuild: "test", command: { type: "START_RUN", offerId: "offer", selectionId: offers[0].selectionId, breakthroughScoreDelta: 999 } }));
});

test("ATTEMPT_BREAKTHROUGH uses check RNG and replays to identical hash/streams", () => {
  const { content, state } = active({ cultivationBps: 10000, realmFoundationBps: 10000 }); const log = createCommandLog(state); const envelope = { commandId: "cmd:break", playerId: state.run.playerId, runId: state.run.runId, expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, clientPlatform: "dev", clientBuild: "prog-test", command: { type: "ATTEMPT_BREAKTHROUGH" } };
  const executed = executeLoggedCommand(state, log, envelope, {}, content); const replayed = replayCommandLog({ initialState: state, commandLog: executed.commandLog, content }); assert.equal(executed.output.trace.rngDraws.every((draw) => draw.stream === "check"), true); assert.equal(executed.output.trace.rngDraws.length >= 1, true); assert.equal(replayed.finalRuleStateHash, ruleStateHash(executed.output.state)); assert.deepEqual(replayed.state.run.rng, executed.output.state.run.rng); assert.equal(executed.output.narrativeFacts[0].type, "REALM_BREAKTHROUGH");
  const incomplete = active({ cultivationBps: 9999, realmFoundationBps: 10000 }).state; const snapshot = structuredClone(incomplete); assert.throws(() => reduce({ state: incomplete, command: { type: "ATTEMPT_BREAKTHROUGH" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "bad" } })); assert.deepEqual(incomplete, snapshot);
});

test("hook registry is whitelist-only, deterministic, serializable and rejects executable content", () => {
  const custom = structuredClone(PROGRESSION_V1); custom.spiritualRoots[1].hooks.push({ id: "progression.breakthrough.afterOutcome", systemOwner: "PROG01", order: 20 }); custom.talents[0].hooks.push({ id: "progression.retreat.afterGain", systemOwner: "PROG01", order: 10 }); validateProgressionPack(custom); assert.deepEqual(orderedProgressionHooks(custom, profile).map((hook) => hook.id), ["progression.retreat.afterGain", "progression.breakthrough.afterOutcome"]);
  const unknown = structuredClone(custom); unknown.talents[0].hooks[0].id = "script.execute"; assert.throws(() => validateProgressionPack(unknown), /hook/);
  const executable = structuredClone(PROGRESSION_V1); executable.talents[0].script = () => 1; assert.throws(() => validateProgressionPack(executable), /unknown field|executable/);
});

test("combo-audit enumerates the complete v1 product without engine count limits", () => {
  const result = runComboAudit(); assert.equal(result.theoreticalProfiles, 13_824); assert.ok(result.validProfiles >= 10_000); assert.ok(result.validRatio >= 0.75); assert.equal(result.determinismFailures, 0); assert.equal(result.hookConflicts, 0); assert.ok(result.ownerCoverage.PROG01 > 0);
});
