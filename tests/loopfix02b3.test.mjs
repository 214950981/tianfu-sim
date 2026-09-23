import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, DIRECTOR_V1, NPC_CONTENT01_V1, NPC_V1 } from "../packages/content/src/index.ts";
import { createOfferedRun, instantiateCoreNpc, reduce, ruleStateHash, scoreDirectorEvent, selectDirectorEvent, validateGameState } from "../packages/core/src/index.ts";

// LOOPFIX02B3 — same-core-NPC consecutive-scene P4 eligibility gating.
//
// The gate is an eligibility filter only. Every assertion below that is not about the gate
// itself proves the surrounding Director machinery is untouched: precedence order, weights,
// RNG consumption, and Cause/recurrence behaviour.

function registry() { const content = new ContentRegistry(); content.registerNpcPack(NPC_CONTENT01_V1); content.register(CONTENT01_PACK); return content; }

function offered(seed = "loopfix02b3") {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: CONTENT01_VERSION, runId: `run:${CONTENT01_VERSION}:${seed}`,
    playerId: "player:loopfix02b3", rootSeed: seed, metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:${CONTENT01_VERSION}:${seed}`, destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20, maxAge: 400, runName: "LoopFix", realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 }, resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: false
    }
  });
}

function active(content = registry(), seed = "loopfix02b3") {
  const state = offered(seed);
  return reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:start` } }).state;
}

// Bring a specific core NPC to met+active so P4 has a real indexed role binding.
function withCoreNpc(state, definitionId, commandId = "event:b3:intro") {
  return instantiateCoreNpc(state, NPC_CONTENT01_V1, definitionId, commandId).state;
}

// recentScenes[i].nodeIndex must be <= run.nodeIndex, so scenes are built after advancing the
// run to the node they are supposed to have happened at.
function atNode(state, nodeIndex) {
  return validateGameState({ ...state, run: { ...state.run, nodeIndex } });
}

function recent(state, scenes) {
  return validateGameState({ ...state, run: { ...state.run, director: { ...state.run.director, recentScenes: scenes } } });
}

function scene(overrides = {}) {
  return { eventId: "scene.placeholder", nodeIndex: 0, slot: "P6", salience: 2, topicTags: [], continuityTags: [], actorIds: [], buildIds: [], ...overrides };
}

// Role -> the core NPC that owns it, and one P4 Event indexed under it.
const ROLE_NPC = { sword: "content01.npc.pei-zhaochuan", healer: "content01.npc.jiang-xuewu", body: "content01.npc.cen-bugui", "ruin-explorer": "content01.npc.xie-tingchao", mortal: "content01.npc.xu-changan" };
const ROLE_EVENT = { sword: "content01.pei.broken-blade", healer: "content01.jiang.herb-price", body: "content01.cen.shoulder-road", "ruin-explorer": "content01.xie.secret-map", mortal: "content01.xu.mortal-letter" };

function p4State(role, seed = "b3") {
  const content = registry();
  const state = withCoreNpc(active(content, `${seed}:${role}`), ROLE_NPC[role]);
  return { content, state, event: content.getEvent(CONTENT01_VERSION, ROLE_EVENT[role]) };
}

// ------------------------------------------------------------------ coverage

test("B3-A: ungated P4 still wins over P5 and P6", () => {
  const { content, state } = p4State("sword");
  for (const slots of [["P4", "P5", "P6"], ["P4", "P5"], ["P4", "P6"]]) {
    const result = selectDirectorEvent(state, "worldly", content, slots);
    assert.equal(result.trace.selectedPrecedenceLevel, "P4", `slots=${slots.join("/")}`);
  }
});

test("B3-B: a core NPC cannot drive two consecutive scenes through P4", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  assert.equal(state.run.director.recentScenes.length, 0);

  // First selection: no previous scene, so the gate is open.
  const first = selectDirectorEvent(state, "worldly", content, ["P4"]);
  assert.equal(first.trace.selectedPrecedenceLevel, "P4");
  assert.deepEqual(first.state.run.director.recentScenes.at(-1).actorIds, [npcId]);

  // Second selection with the same core NPC still the most recent scene: every P4 candidate is
  // gated, so P4 yields no eligible candidates at all and the strict chain moves on.
  const second = selectDirectorEvent(first.state, "worldly", content, ["P4", "P6"]);
  assert.notEqual(second.trace.selectedPrecedenceLevel, "P4", "gated P4 must not select");
  assert.equal(second.trace.selectedPrecedenceLevel, "P6");
  assert.ok(second.trace.exclusionReasonCounts["core-npc-repeat-gate"] >= 1, JSON.stringify(second.trace.exclusionReasonCounts));

  // Scoring the same candidate directly reports the gate as the exclusion reason.
  const scored = scoreDirectorEvent(first.state, event, "worldly", content, "P4");
  assert.equal(scored.eligible, false);
  assert.equal(scored.exclusionReason, "core-npc-repeat-gate");
  assert.equal(scored.weight, 0);
});

test("B3-C: a different core NPC stays eligible, and can be selected instead", () => {
  const content = registry();
  // Two distinct core NPCs alive; the most recent scene belonged to the sword NPC only.
  let state = withCoreNpc(active(content, "b3-c"), ROLE_NPC.sword);
  state = withCoreNpc(state, ROLE_NPC.healer, "event:b3:intro:2");
  const swordId = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === ROLE_NPC.sword).npcId;
  const healerId = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === ROLE_NPC.healer).npcId;

  state = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [swordId] })]);

  // Same NPC: gated.
  assert.equal(scoreDirectorEvent(state, content.getEvent(CONTENT01_VERSION, ROLE_EVENT.sword), "worldly", content, "P4").exclusionReason, "core-npc-repeat-gate");
  // Different NPC: fully eligible and still scores as before.
  const other = scoreDirectorEvent(state, content.getEvent(CONTENT01_VERSION, ROLE_EVENT.healer), "worldly", content, "P4");
  assert.equal(other.eligible, true);
  assert.notEqual(other.exclusionReason, "core-npc-repeat-gate");
  assert.deepEqual(other.actorIds, [healerId]);
});

test("B3-D: one intervening scene with no matching core actor clears the gate", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(atNode(state, 2), [scene({ eventId: ROLE_EVENT.sword, nodeIndex: 2, slot: "P4", actorIds: [npcId] })]);
  assert.equal(scoreDirectorEvent(gated, event, "worldly", content, "P4").eligible, false);

  // An intervening ordinary scene carrying no core actor is enough.
  const cleared = recent(atNode(state, 3), [
    scene({ eventId: ROLE_EVENT.sword, nodeIndex: 2, slot: "P4", actorIds: [npcId] }),
    scene({ eventId: "content01.ordinary.tea-house", nodeIndex: 3, slot: "P6", actorIds: [] })
  ]);
  const scored = scoreDirectorEvent(cleared, event, "worldly", content, "P4");
  assert.equal(scored.eligible, true, "gate must clear after one non-matching scene");
  assert.notEqual(scored.exclusionReason, "core-npc-repeat-gate");
});

test("B3-E: the gate ignores every scene except the single most recent one", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  // The same NPC appears in recent memory but NOT as the most recent scene.
  const state0 = recent(atNode(state, 3), [
    scene({ eventId: ROLE_EVENT.sword, nodeIndex: 1, slot: "P4", actorIds: [npcId] }),
    scene({ eventId: "content01.ordinary.market-bargain", nodeIndex: 2, slot: "P5", actorIds: [] }),
    scene({ eventId: "content01.ordinary.night-rain", nodeIndex: 3, slot: "P6", actorIds: [] })
  ]);
  assert.equal(scoreDirectorEvent(state0, event, "worldly", content, "P4").eligible, true);
});

// Drives the REAL reducer to a P3 Cause echo so the DirectorSceneRecord is produced by production code
// rather than hand-built. This is the seam that must write exact actor provenance onto the record.
// `boundNpcId` is the actor the selected CauseInstance is bound to; `templateId` supplies the
// linked echo Event. Returns the reduced state plus the P3 record it wrote.
function echoViaReducer({ content, state, boundNpcId, templateId, linkedEventId, commandId }) {
  const npcIds = Object.values(state.run.npcs.byId).map((npc) => npc.npcId);
  const npcIndex = npcIds.indexOf(boundNpcId);
  const withCause = {
    ...state,
    run: {
      ...state.run,
      causes: { byId: {
        "cause:b3": { causeId: "cause:b3", templateId, originCommandId: "event:b3:intro", originNodeIndex: 0, originAge: 20,
          actorIdsByRole: { actor: boundNpcId }, themes: [], salience: 3, visibility: "hidden", state: "eligible",
          maturity: { minNode: 0, minAge: 20, conditions: [] }, eligibleSinceNode: 0, eligibleAge: 20, echoBudget: 1, echoCount: 0,
          facts: {}, linkedEventIds: [linkedEventId] }
      } }
    }
  };
  void npcIndex;
  const out = reduce({ state: withCause, command: { type: "CHOOSE_ACTION", actionId: "worldly" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId } });
  return out;
}

test("B3-F: a P3 Cause echo blocks an immediate same-core-NPC P4 rebound", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];

  // Produce a real P3 echo through the reducer, bound to this core NPC.
  const echo = echoViaReducer({ content, state, boundNpcId: npcId, templateId: "content01.cause.broken-sword-rivalry", linkedEventId: "content01.pei.sparring-rain", commandId: "cmd:b3:f" });
  const p3 = echo.state.run.director.recentScenes.filter((s) => s.slot === "P3");
  assert.equal(p3.length, 1, JSON.stringify(echo.state.run.director.recentScenes));
  // Provenance is exact: the record carries the actor the selected Cause was bound to.
  assert.deepEqual(p3[0].actorIds, [npcId], "P3 record must persist the selected Cause's actorIdsByRole values");
  assert.equal(p3[0].causeId, "cause:b3");
  assert.equal(echo.state.run.events.current.triggeringCauseId, "cause:b3");

  // With that echo as the most recent scene, a P4 rebound on the same core NPC is ineligible.
  const rebound = scoreDirectorEvent(echo.state, event, "worldly", content, "P4");
  assert.equal(rebound.eligible, false, "P3 echo with the same core NPC must gate P4");
  assert.equal(rebound.exclusionReason, "core-npc-repeat-gate");
});

test("B3-G: a P3 echo bound to a different core NPC does not gate P4", () => {
  const { content, state, event } = p4State("sword");
  const swordId = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === ROLE_NPC.sword).npcId;
  // Add the healer core NPC and bind the Cause to it, while the P4 candidate binds the sword NPC.
  const twoNpc = withCoreNpc(state, ROLE_NPC.healer, "event:b3:intro:2");
  const healerId = Object.values(twoNpc.run.npcs.byId).find((npc) => npc.definitionId === ROLE_NPC.healer).npcId;

  const echo = echoViaReducer({ content, state: twoNpc, boundNpcId: healerId, templateId: "content01.cause.medicine-debt", linkedEventId: "content01.jiang.debt-echo", commandId: "cmd:b3:g" });
  const p3 = echo.state.run.director.recentScenes.filter((s) => s.slot === "P3");
  assert.equal(p3.length, 1);
  assert.deepEqual(p3[0].actorIds, [healerId]);

  // The sword P4 candidate is untouched by a healer-bound echo.
  const scored = scoreDirectorEvent(echo.state, event, "worldly", content, "P4");
  assert.equal(scored.eligible, true, JSON.stringify(scored));
  assert.deepEqual(scored.actorIds, [swordId]);
});

test("B3-H: a gated P4 falls through to the next strict precedence level", () => {
  const { content, state } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);
  // With P5 excluded from the chain, the gated P4 must yield to P6 rather than aborting.
  const p6Only = selectDirectorEvent(gated, "worldly", content, ["P4", "P6"]);
  assert.equal(p6Only.trace.selectedPrecedenceLevel, "P6");
  assert.ok(p6Only.trace.selectedEventId.startsWith("content01.ordinary."), p6Only.trace.selectedEventId);
  assert.ok(p6Only.trace.exclusionReasonCounts["core-npc-repeat-gate"] >= 1);
  // And with P5 present, P5 wins over P6 - still strictly ordered, only P4's eligibility changed.
  const full = selectDirectorEvent(gated, "worldly", content, ["P4", "P5", "P6"]);
  assert.equal(full.trace.selectedPrecedenceLevel, "P5");
});

test("B3-I: the gate consumes zero RNG", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);

  const direct = selectDirectorEvent(gated, "worldly", content, ["P4"]);
  assert.deepEqual(direct.state.run.rng, gated.run.rng);
  assert.equal(direct.trace.logicalRngRequests, 0);
  assert.equal(direct.trace.rngDrawIndexBefore, direct.trace.rngDrawIndexAfter);
  assert.deepEqual(direct.rngDraws, []);

  // Scoring a gated candidate must not touch RNG either.
  const before = JSON.stringify(gated.run.rng);
  scoreDirectorEvent(gated, event, "worldly", content, "P4");
  assert.equal(JSON.stringify(gated.run.rng), before);
});

test("B3-J: the gate adds no persistent state", () => {
  const { content, state } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);
  const result = selectDirectorEvent(gated, "worldly", content, ["P4", "P5", "P6"]);
  // Only the pre-existing Director fields may appear; no new counter/timer/log is introduced.
  assert.deepEqual(Object.keys(result.state.run.director).sort(), ["profileId", "recentScenes"]);
  for (const key of Object.keys(result.state.run.director.recentScenes.at(-1))) {
    assert.ok(["eventId", "nodeIndex", "slot", "salience", "topicTags", "continuityTags", "actorIds", "buildIds", "causeId", "riskTier"].includes(key), key);
  }
  // Recent-scene memory stays inside the frozen ring bound.
  assert.ok(result.state.run.director.recentScenes.length <= DIRECTOR_V1.rules.recentWindowSize);
});

test("B3-K: no Director weight, constant, precedence, or scoring change", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];

  // Weight invariance: for a state whose most recent scene does NOT carry this core NPC, the
  // gate is never consulted, so the score must be byte-identical to the frozen pre-change
  // result. baseWeightDefault(100) + actionAffinityBonus(80) + topicNoveltyBonus(20) = 200.
  const rules = content.getDirector(CONTENT01_VERSION).rules;
  const ungated = recent(atNode(state, 1), [scene({ eventId: "content01.ordinary.tea-house", nodeIndex: 1, slot: "P6", actorIds: ["npc.unrelated"] })]);
  const scored = scoreDirectorEvent(ungated, event, "worldly", content, "P4");
  assert.equal(scored.eligible, true);
  assert.equal(scored.exclusionReason, undefined);
  assert.deepEqual(scored.reasons, ["action-affinity", "topic-novelty"]);
  assert.equal(scored.weight, rules.baseWeightDefault + rules.actionAffinityBonus + rules.topicNoveltyBonus);

  // The same score is produced for an identical state built twice - no hidden ordering effect.
  const twin = recent(atNode(state, 1), [scene({ eventId: "content01.ordinary.tea-house", nodeIndex: 1, slot: "P6", actorIds: ["npc.unrelated"] })]);
  assert.equal(scoreDirectorEvent(twin, event, "worldly", content, "P4").weight, scored.weight);

  // Gating is an eligibility filter only: when the gate does fire, the weight is zeroed with an
  // exclusionReason and no partial score is reported. No re-weighting of surviving candidates.
  const gatedState = recent(atNode(state, 1), [scene({ eventId: "content01.ordinary.tea-house", nodeIndex: 1, slot: "P6", actorIds: [npcId] })]);
  const gated = scoreDirectorEvent(gatedState, event, "worldly", content, "P4");
  assert.equal(gated.eligible, false);
  assert.equal(gated.weight, 0);
  assert.equal(gated.exclusionReason, "core-npc-repeat-gate");

  // The frozen pacing/weight constants are untouched.
  for (const [key, value] of Object.entries({ recentWindowSize: 8, continuityWindow: 3, firstRunWindowNodes: 3, majorSalienceThreshold: 4, majorGapNodes: 2, randomDangerGapNodes: 1, baseWeightMin: 1, baseWeightMax: 1000, baseWeightDefault: 100, actionAffinityBonus: 80, recentNpcContinuityBonus: 50 })) {
    assert.equal(rules[key], value, key);
  }
});

test("B3-L: the gate is deterministic and order-independent", () => {
  const { content, state } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);
  const outputs = Array.from({ length: 25 }, () => {
    const result = selectDirectorEvent(gated, "worldly", content, ["P4", "P5", "P6"]);
    return `${result.trace.selectedPrecedenceLevel}|${result.trace.selectedEventId}|${ruleStateHash(result.state)}`;
  });
  assert.equal(new Set(outputs).size, 1, "gated selection must be deterministic");
});

test("B3-M: Cause and recurrence machinery are untouched by the gate", () => {
  // The gate lives in scoreDirectorEvent and reads only recentScenes + Event tags; it never
  // writes to causes and never reorders Cause buckets. Prove the Cause surface is unchanged by
  // running a real selection and checking the gate did not perturb it.
  const content = registry();
  const state = withCoreNpc(active(content, "b3-m"), ROLE_NPC.sword);
  const causesBefore = structuredClone(state.run.causes);
  const recurrenceBefore = structuredClone(state.run.recurrence);
  const result = selectDirectorEvent(state, "worldly", content, ["P4", "P5", "P6"]);
  assert.deepEqual(result.state.run.causes, causesBefore, "gate must not mutate CauseState");
  assert.deepEqual(result.state.run.recurrence, recurrenceBefore, "gate must not mutate recurrence state");
  // Cause record shape is exactly as before - no gate bookkeeping leaked into a CauseInstance.
  for (const cause of Object.values(result.state.run.causes.byId)) {
    assert.equal(Object.keys(cause).includes("coreNpcRepeatGate"), false);
  }
  // The gate introduces no Cause bucket and no Cause phase the reducer must satisfy.
  assert.deepEqual(Object.keys(result.state.run.causes).sort(), Object.keys(causesBefore).sort());
});

test("B3-N: the gate is a no-op for P2, P5, and P6", () => {
  const { content, state } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);

  // P4 is gated; P6 is not, even with the identical state and the identical core NPC binding.
  assert.equal(scoreDirectorEvent(gated, content.getEvent(CONTENT01_VERSION, ROLE_EVENT.sword), "worldly", content, "P4").exclusionReason, "core-npc-repeat-gate");
  assert.notEqual(scoreDirectorEvent(gated, content.getEvent(CONTENT01_VERSION, ROLE_EVENT.sword), "worldly", content, "P5").exclusionReason, "core-npc-repeat-gate");
  assert.notEqual(scoreDirectorEvent(gated, content.getEvent(CONTENT01_VERSION, ROLE_EVENT.sword), "worldly", content, "P6").exclusionReason, "core-npc-repeat-gate");

  // Selection paths: P6 still selects, and the gate never appears in a P5/P6-only trace.
  const p6 = selectDirectorEvent(gated, "worldly", content, ["P6"]);
  assert.equal(p6.trace.selectedPrecedenceLevel, "P6");
  assert.equal(p6.trace.exclusionReasonCounts["core-npc-repeat-gate"], undefined);

  // P2 (onboarding) is likewise unaffected: the gate keys on slot === "P4" only.
  const p2 = selectDirectorEvent(gated, "worldly", content, ["P2"]);
  assert.equal(p2.trace.exclusionReasonCounts["core-npc-repeat-gate"], undefined);
});

test("B3-O: the gate key matches the contract's declared exclusion reason", () => {
  const { content, state, event } = p4State("sword");
  const npcId = Object.keys(state.run.npcs.byId)[0];
  const gated = recent(state, [scene({ eventId: ROLE_EVENT.sword, slot: "P4", actorIds: [npcId] })]);
  const scored = scoreDirectorEvent(gated, event, "worldly", content, "P4");
  assert.equal(scored.exclusionReason, "core-npc-repeat-gate");
  const ref = fs.readFileSync(new URL("../.codex/contracts/director.ref", import.meta.url), "utf8");
  assert.ok(ref.includes("core-npc-repeat-gate"), "contract must document the gate");
  // P4 binding semantics themselves are unchanged when the gate is open.
  const open = scoreDirectorEvent(state, event, "worldly", content, "P4");
  assert.equal(open.eligible, true);
  assert.deepEqual(open.actorIds, [npcId]);
});

// ------------------------------------------------------------------ provenance (attempt 2 repair)

// pei-zhaochuan and cen-bugui BOTH declare roleTags ["wanderer"]. That makes the previous
// role-re-derivation provably unsafe: matchingActorIds resolves a role to the lexicographically-first
// active core instance, so an echo Event declaring "wanderer" would bind cen-bugui even when the Cause
// was bound to pei-zhaochuan. Provenance must come from the selected CauseInstance instead.
const SAME_ROLE = ["content01.npc.pei-zhaochuan", "content01.npc.cen-bugui"];

test("B3-P: two active core NPCs share a role and the role index really does hold both", () => {
  const content = registry();
  let state = withCoreNpc(active(content, "b3-p"), SAME_ROLE[0]);
  state = withCoreNpc(state, SAME_ROLE[1], "event:b3:intro:2");
  const pei = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[0]).npcId;
  const cen = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[1]).npcId;
  assert.notEqual(pei, cen);

  // Both definitions genuinely declare the shared role, and the index holds both instances.
  const sharedRoles = NPC_CONTENT01_V1.coreDefinitions
    .filter((definition) => SAME_ROLE.includes(definition.id))
    .map((definition) => definition.roleTags)
    .reduce((left, right) => left.filter((role) => right.includes(role)));
  assert.deepEqual(sharedRoles, ["wanderer"], "fixture must rely on a genuinely shared role");
  const wanderer = [...state.run.npcs.roleIndex.wanderer].sort();
  assert.deepEqual(wanderer, [cen, pei].sort(), "both instances must be indexed under the shared role");
  // The unsafe resolution is real: sorting picks cen, not necessarily the Cause-bound actor.
  assert.equal(wanderer[0], cen, "role re-derivation would resolve to the sorted-first instance");
});

test("B3-Q: a P3 echo bound to one of two same-role core NPCs records the exact bound actor", () => {
  const content = registry();
  let state = withCoreNpc(active(content, "b3-q"), SAME_ROLE[0]);
  state = withCoreNpc(state, SAME_ROLE[1], "event:b3:intro:2");
  const pei = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[0]).npcId;
  const cen = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[1]).npcId;

  // Bind the Cause to PEI while the echo Event's role is the SHARED "wanderer" role. Role-based
  // re-derivation would have produced cen; authoritative provenance must produce pei.
  const echo = echoViaReducer({ content, state, boundNpcId: pei, templateId: "content01.cause.road-conflict", linkedEventId: "content01.road.conflict-echo", commandId: "cmd:b3:q" });
  const p3 = echo.state.run.director.recentScenes.filter((s) => s.slot === "P3");
  assert.equal(p3.length, 1, JSON.stringify(echo.state.run.director.recentScenes));
  assert.deepEqual(p3[0].actorIds, [pei], "record must carry the Cause-bound actor, not a role-resolved sibling");
  assert.equal(p3[0].actorIds.includes(cen), false, "record must never bind the same-role sibling");
});

test("B3-R: the gate uses the recorded actor, so a same-role sibling is neither gated nor mis-bound", () => {
  const content = registry();
  let state = withCoreNpc(active(content, "b3-r"), SAME_ROLE[0]);
  state = withCoreNpc(state, SAME_ROLE[1], "event:b3:intro:2");
  const pei = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[0]).npcId;
  const cen = Object.values(state.run.npcs.byId).find((npc) => npc.definitionId === SAME_ROLE[1]).npcId;

  // Echo bound to pei.
  const echo = echoViaReducer({ content, state, boundNpcId: pei, templateId: "content01.cause.road-conflict", linkedEventId: "content01.road.conflict-echo", commandId: "cmd:b3:r" });
  const recorded = echo.state.run.director.recentScenes.at(-1);
  assert.deepEqual(recorded.actorIds, [pei]);

  // A P4 candidate binding the SAME npc is gated by the recorded actor.
  const sameActorP4 = recent(echo.state, [recorded]);
  assert.equal(scoreDirectorEvent(sameActorP4, content.getEvent(CONTENT01_VERSION, "content01.pei.broken-blade"), "worldly", content, "P4").exclusionReason, "core-npc-repeat-gate");

  // A P4 candidate binding the same-role SIBLING is NOT gated, because the record never claimed it.
  const siblingP4 = scoreDirectorEvent(recent(echo.state, [recorded]), content.getEvent(CONTENT01_VERSION, "content01.cen.shoulder-road"), "worldly", content, "P4");
  assert.equal(siblingP4.eligible, true, JSON.stringify(siblingP4));
  assert.deepEqual(siblingP4.actorIds, [cen]);
});

test("B3-S: the repair introduces no content lookup or role re-derivation in the gate path", () => {
  const source = fs.readFileSync(new URL("../packages/core/src/director.ts", import.meta.url), "utf8");
  // The gate must read the recorded record's actorIds directly.
  assert.ok(/previous\.actorIds\.includes\(id\)/.test(source), "gate must intersect against record actorIds");
  // No re-derivation helpers, and no content access inside the gate.
  assert.equal(source.includes("sceneCoreActorIds"), false, "content re-derivation helper must be gone");
  assert.ok(/function coreNpcRepeatGate\(state: GameState, coreActorIds: readonly string\[\]\)/.test(source), "gate must not take a content handle");
  // The reducer resolves provenance from the selected CauseInstance by id only.
  const reducer = fs.readFileSync(new URL("../packages/core/src/reducer.ts", import.meta.url), "utf8");
  assert.ok(reducer.includes("state.run.causes.byId[causeId]"), "reducer must resolve the exact selected Cause by id");
  for (const forbidden of ["getCauseTemplate", "templateId ===", "salience ===", "getEvent("]) {
    const helper = reducer.slice(reducer.indexOf("function selectedCauseActorIds"), reducer.indexOf("export interface OfferedRunFixture"));
    assert.equal(helper.includes(forbidden), false, `provenance helper must not use ${forbidden}`);
  }
});
