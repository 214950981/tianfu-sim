import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry, RISK_V1, runRiskAudit, sealContentPack, validateContentPack, validateRiskPack } from "../packages/content/src/index.ts";
import { aggregateRiskModifiers, buildRiskPresentation, createCommandLog, createOfferedRun, drawInt, executeLoggedCommand, injuryLevel, orderedRiskHooks, replayCommandLog, resolveThreat, ruleStateHash, validateGameState, reduce } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

const contentPack = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
function registry() { const content = new ContentRegistry(); content.register(contentPack); return content; }
function active({ injury = 0, nodeIndex = 0, currentEvent = false, attributes = { insight: 10, body: 10, spiritSense: 10, fortune: 10 }, cultivationBps = 0, foundationBps = 0 } = {}) {
  const content = registry(); const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", runId: "run-risk", playerId: "player-risk", rootSeed: "risk-fixed-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer-risk", destinyIds: ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"], age: 20, maxAge: 80, runName: "Risk", realm: { id: "mortal", order: 0, cultivation: cultivationBps, cultivationBps, realmFoundationBps: foundationBps }, attributes, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} } } });
  const started = reduce({ state: offered, command: { type: "START_RUN", offerId: "offer-risk", destinyId: "destiny.steady-foundation" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:start-risk" } }).state;
  const state = validateGameState({ ...started, run: { ...started.run, nodeIndex, attributes, conditions: injury === 0 ? [] : [{ id: "injury.test", kind: "injury", stacks: injury, sourceRef: "test" }], events: currentEvent ? { history: [], current: { eventId: "dev.first-choice", kind: "choice" } } : started.run.events } });
  return { content, state };
}
function threat(pack, id) { return pack.threats.find((value) => value.id === id); }
function guaranteedFailure(injury = 2) { return active({ injury, attributes: { insight: -100, body: -100, spiritSense: -100, fortune: -100 } }); }

test("RISK injury levels use versioned score modifiers and injury=3 is not automatic death", () => {
  for (const [level, expected] of [[0,0],[1,-10],[2,-25],[3,-45]]) { const { state } = active({ injury: level }); assert.equal(injuryLevel(state), level); assert.equal(RISK_V1.injuryScoreModifiers[String(level)], expected); assert.equal(state.run.status, "active"); }
});

test("RiskCondition registry and state schema support persistent extensible definitions", () => {
  assert.strictEqual(validateRiskPack(RISK_V1), RISK_V1); assert.ok(RISK_V1.riskConditions.length >= 6); const { state } = active(); const condition = { id: "risk:test", definitionId: "risk-condition.poison", severity: 2, sourceRefs: ["event:test"], createdAge: 20, createdNodeIndex: 0, visibility: "hidden", tags: ["poison"] }; assert.doesNotThrow(() => validateGameState({ ...state, run: { ...state.run, risk: { conditions: [condition], exposureCount: 1 } } }));
  const invalid = structuredClone(RISK_V1); invalid.riskConditions[0].script = "return state"; assert.throws(() => validateRiskPack(invalid), /unknown field/);
});

test("Threat and DeathCause registries are versioned data, not Core enums", () => {
  const content = registry(); assert.equal(content.getRisk("dev-0.1.0").threats.length, 9); assert.equal(RISK_V1.deathCauses.length, 9); assert.deepEqual(RISK_V1.threats.map((value) => value.id), ["threat.combat","threat.ambush","threat.dangerous-exploration","threat.poison","threat.curse","threat.critical-injury","threat.cause-revenge","threat.breakthrough-backlash","threat.special-catastrophe"]);
});

test("RiskResolver maps all four Check tiers through the existing check RNG stream", () => {
  const targets = { greatSuccess: 10, success: 0, costlySuccess: -10, failure: -11 };
  for (const [tier, offset] of Object.entries(targets)) {
    const pack = structuredClone(RISK_V1); const definition = threat(pack, "threat.breakthrough-backlash"); definition.checkSpec = { primary: "body", difficulty: 500, randomMin: -10, randomMax: 10 };
    const initial = active().state; const peek = drawInt(initial.run.rng, "check", -10, 10); const body = 500 + offset - peek.value; const state = validateGameState({ ...initial, run: { ...initial.run, attributes: { ...initial.run.attributes, body } } }); const presentation = buildRiskPresentation(state, definition); const result = resolveThreat(state, pack, { definitionId: definition.id }, { commandId: `cmd:${tier}`, presentedRisk: presentation, acceptedPublicWarning: false }); assert.equal(result.tier, tier); assert.ok(result.rngDraws.every((draw) => draw.stream === "check"));
  }
});

test("lethal failure requires declared prerequisites and otherwise degrades to severe nonlethal consequence", () => {
  const safe = guaranteedFailure(1).state; const definition = threat(RISK_V1, "threat.combat"); const safePresentation = buildRiskPresentation(safe, definition); assert.equal(safePresentation.canBeFatal, false); const severe = resolveThreat(safe, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:severe", presentedRisk: safePresentation, acceptedPublicWarning: false }); assert.equal(severe.tier, "failure"); assert.equal(severe.state.run.status, "active"); assert.equal(injuryLevel(severe.state), 3);
  const lethal = guaranteedFailure(2).state; assert.equal(buildRiskPresentation(lethal, definition).canBeFatal, true);
});

test("unwarned lethal resolution is rejected atomically before RNG consumption", () => {
  const { state } = guaranteedFailure(2); const snapshot = structuredClone(state); const definition = threat(RISK_V1, "threat.combat"); const presentation = buildRiskPresentation(state, definition); assert.throws(() => resolveThreat(state, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:unwarned", presentedRisk: presentation, acceptedPublicWarning: false }), /warning/); assert.deepEqual(state, snapshot);
});

test("first three nodes reject unaccepted lethal risk but permit an explicitly warned player choice", () => {
  const { state } = guaranteedFailure(2); const definition = threat(RISK_V1, "threat.combat"); const presentation = buildRiskPresentation(state, definition); assert.equal(state.run.nodeIndex, 0); assert.throws(() => resolveThreat(state, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:no", presentedRisk: presentation, acceptedPublicWarning: false })); const accepted = resolveThreat(state, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:yes", presentedRisk: presentation, acceptedPublicWarning: true }); assert.equal(accepted.state.run.status, "dying");
});

test("Content DSL rejects END_RUN and direct-death aliases", () => {
  for (const op of ["END_RUN", "killPlayer", "setDead", "forceDeath"]) { const draft = structuredClone(contentPack); draft.events[0].choices[0].outcomes.success.effects = [{ op, endingId: "x" }]; const sealed = sealContentPack({ ...draft, manifest: { schemaVersion: draft.manifest.schemaVersion, packId: draft.manifest.packId, rulesVersion: draft.manifest.rulesVersion, contentVersion: draft.manifest.contentVersion } }); assert.throws(() => validateContentPack(sealed), /unknown effect/); }
});

test("breakthrough failure at critical injury creates nonlethal backlash through RiskResolver", () => {
  const { content, state } = active({ injury: 2, cultivationBps: 10_000, foundationBps: 0 }); const profileState = validateGameState({ ...state, run: { ...state.run, identity: { ...state.run.identity, innateProfile: { spiritualRoot: "root.dual", talentIds: ["talent.cultivation.01"], majorDestinyId: "destiny.major.breakthrough.01" } } } }); const result = reduce({ state: profileState, command: { type: "ATTEMPT_BREAKTHROUGH" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:backlash" } }); assert.equal(result.effects[0].type, "BREAKTHROUGH_FAILED"); assert.equal(result.state.run.risk.exposureCount, 1); assert.equal(result.state.run.status, "active"); assert.ok(result.trace.selector.some((entry) => entry.kind === "breakthrough-backlash")); assert.ok(result.trace.rngDraws.every((draw) => draw.stream === "check"));
});

test("DeathRecord serializes and replays with identical state hash and RNG", () => {
  const { content, state: base } = guaranteedFailure(2); const state = validateGameState({ ...base, run: { ...base.run, events: { history: [], current: { eventId: "dev.first-choice", kind: "choice" } } } }); const log = createCommandLog(state); const envelope = { commandId: "cmd:lethal-event", playerId: state.run.playerId, runId: state.run.runId, expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, clientPlatform: "dev", clientBuild: "risk-test", command: { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "face-combat-risk" } }; const executed = executeLoggedCommand(state, log, envelope, {}, content); const replayed = replayCommandLog({ initialState: state, commandLog: executed.commandLog, content }); assert.equal(executed.output.state.run.status, "dying"); assert.equal(executed.output.state.run.deathRecord.category, "combat"); assert.deepEqual(JSON.parse(JSON.stringify(executed.output.state.run.deathRecord)), executed.output.state.run.deathRecord); assert.equal(replayed.finalRuleStateHash, ruleStateHash(executed.output.state)); assert.deepEqual(replayed.state.run.rng, executed.output.state.run.rng);
});

test("RiskPresentation is server-authoritative, fatal-aware and strips resolver secrets", () => {
  const { content, state: base } = guaranteedFailure(2); const state = validateGameState({ ...base, run: { ...base.run, events: { history: [], current: { eventId: "dev.first-choice", kind: "choice" } } } }); const view = new ServerViewModelBuilder(content).build(state); const option = view.currentInteraction.options.find((value) => value.optionId === "face-combat-risk"); assert.deepEqual(option.riskPresentation, { tier: "lethal", canBeFatal: true, reasons: ["risk.category.combat", "risk.reason.injury"], level: "dangerous", labelKey: "risk.lethal" }); const json = JSON.stringify(view); for (const secret of ["difficulty", "checkSpec", "rng", "drawIndex", "trace", "sourceActorId"]) assert.equal(json.includes(`\"${secret}\"`), false);
});

test("Risk modifier aggregation is canonical, insertion-order independent and clamped", () => {
  const sources = [{ id: "z", modifiers: [{ kind: "riskScoreDelta", value: 999, systemOwner: "RISK01" }], hooks: [], systemOwners: ["RISK01"] }, { id: "a", modifiers: [{ kind: "riskDifficultyDelta", value: -999, systemOwner: "RISK01" }, { kind: "consequenceSeverityDelta", value: 9, systemOwner: "RISK01" }], hooks: [], systemOwners: ["RISK01"] }]; const first = aggregateRiskModifiers(sources); const second = aggregateRiskModifiers([...sources].reverse()); assert.deepEqual(first, second); assert.equal(first.riskScoreDelta, 120); assert.equal(first.riskDifficultyDelta, -120); assert.equal(first.consequenceSeverityDelta, 3); assert.deepEqual(first.sources, ["a", "z"]);
});

test("Risk hooks are whitelist-only, stable, serializable and reject executable content", () => {
  const pack = structuredClone(RISK_V1); pack.threats[0].hooks.push({ id: "risk.afterOutcome", systemOwner: "RISK01", order: 20 }); pack.riskConditions[0].hooks.push({ id: "risk.beforeCheck", systemOwner: "RISK01", order: 10 }); validateRiskPack(pack); assert.deepEqual(orderedRiskHooks(pack, [pack.threats[0], pack.riskConditions[0]]).map((hook) => hook.id), ["risk.beforeCheck", "risk.afterOutcome"]); const unknown = structuredClone(pack); unknown.threats[0].hooks[0].id = "risk.eval"; assert.throws(() => validateRiskPack(unknown), /hook/); const executable = structuredClone(RISK_V1); executable.threats[0].script = () => 1; assert.throws(() => validateRiskPack(executable), /finite JSON|unknown field/);
});

test("risk-audit reports no bypass, warning, determinism or security violations", () => {
  const audit = runRiskAudit(RISK_V1, contentPack); assert.equal(audit.threatDefinitions, 9); assert.ok(audit.lethalThreats > 0); for (const key of ["warningViolations", "directDeathViolations", "earlyNodeViolations", "hookConflicts", "deathRecordViolations", "determinismFailures", "securityViolations"]) assert.equal(audit[key], 0, key); assert.deepEqual(audit.modifierRange, { riskScoreDelta: { min: -120, max: 120 }, riskDifficultyDelta: { min: -120, max: 120 } });
});

test("fixed seed threat resolution and public projection repeat exactly; confirmed death cannot reroll", () => {
  const first = guaranteedFailure(2); const second = guaranteedFailure(2); const definition = threat(RISK_V1, "threat.combat"); const presentation = buildRiskPresentation(first.state, definition); const a = resolveThreat(first.state, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:fixed", presentedRisk: presentation, acceptedPublicWarning: true }); const b = resolveThreat(second.state, RISK_V1, { definitionId: definition.id }, { commandId: "cmd:fixed", presentedRisk: presentation, acceptedPublicWarning: true }); assert.deepEqual(a, b); assert.throws(() => reduce({ state: a.state, command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content: first.content, commandId: "cmd:reroll" } }), /not_active/);
});
