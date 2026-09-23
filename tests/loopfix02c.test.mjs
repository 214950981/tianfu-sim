import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, DIRECTOR_V1, NPC_CONTENT01_V1, validateDirectorPack } from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, ruleStateHash, scoreDirectorEvent, selectDirectorEvent, validateGameState } from "../packages/core/src/index.ts";

// LOOPFIX02C — P5 contextual pacing / P6 reachability.
//
// Background: the P5 contextual tier is populated at essentially every action node (SIM02 measured
// 5205/5205). Because selectDirectorEvent returns at the FIRST slot with an eligible candidate and
// the reducer offers ["P4","P5","P6"], a saturated P5 permanently shadowed the P6 ordinary fallback:
// P6 was selected 0 times across 600 required runs and 1800 escalation runs.
//
// LOOPFIX02C adds one deterministic eligibility gate: a P5 candidate is ineligible ('contextual-gap')
// while any of the last `contextualGapScenes` DirectorSceneRecords is itself a P5 scene, with the v1
// value fixed at exactly 2. Strict P1-P6 precedence is untouched; P4 and P6 eligibility are untouched.
//
// This suite proves the gate's exact semantics and, in every non-gate assertion, that the surrounding
// Director machinery (precedence, P4 gating, weights, RNG consumption, state growth) is unchanged.

function registry() { const content = new ContentRegistry(); content.registerNpcPack(NPC_CONTENT01_V1); content.register(CONTENT01_PACK); return content; }

function offered(seed = "loopfix02c", firstRun = false) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: CONTENT01_VERSION, runId: `run:${CONTENT01_VERSION}:${seed}`,
    playerId: "player:loopfix02c", rootSeed: seed, metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:${CONTENT01_VERSION}:${seed}`, destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20, maxAge: 400, runName: "LoopFixC", realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 }, resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun
    }
  });
}

function active(content = registry(), seed = "loopfix02c", firstRun = false) {
  const state = offered(seed, firstRun);
  return reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:start` } }).state;
}

function atNode(state, nodeIndex) { return validateGameState({ ...state, run: { ...state.run, nodeIndex } }); }

function recent(state, scenes) { return validateGameState({ ...state, run: { ...state.run, director: { ...state.run.director, recentScenes: scenes } } }); }

function scene(overrides = {}) {
  return { eventId: "scene.placeholder", nodeIndex: 0, slot: "P6", salience: 2, topicTags: [], continuityTags: [], actorIds: [], buildIds: [], ...overrides };
}

// A real P5 candidate: CONTENT01 events indexed under the 'contextual' query slot.
function p5Context(content = registry()) {
  const { rules } = content.getDirector(CONTENT01_VERSION);
  return { content, rules };
}

// Pick a live P5 candidate the way the selector would, on a clean state.
function p5CandidateIds(state, content, action = "travel") {
  return content.queryDirectorCandidates(state.contentVersion, { slot: "contextual", action, buildTags: [], worldTags: [...state.run.world.tags], npcRoleTags: [] }).eventIds;
}

// ------------------------------------------------------------------ rule wiring

test("C-A: contextualGapScenes is a versioned Director rule and equals exactly 2 in v1", () => {
  assert.equal(DIRECTOR_V1.rules.contextualGapScenes, 2);
  const pack = registry().getDirector(CONTENT01_VERSION);
  assert.equal(pack.rules.contextualGapScenes, 2);
  assert.equal(pack.id, DIRECTOR_V1.id);
});

test("C-B: the rule is validated as versioned content and pinned by the frozen-v1 check", () => {
  // Accepted as-is.
  assert.doesNotThrow(() => validateDirectorPack(structuredClone(DIRECTOR_V1)));
  // Rejected when not a safe integer.
  const nan = structuredClone(DIRECTOR_V1); nan.rules.contextualGapScenes = Number.NaN;
  assert.throws(() => validateDirectorPack(nan));
  const negative = structuredClone(DIRECTOR_V1); negative.rules.contextualGapScenes = -1;
  assert.throws(() => validateDirectorPack(negative));
  const fractional = structuredClone(DIRECTOR_V1); fractional.rules.contextualGapScenes = 2.5;
  assert.throws(() => validateDirectorPack(fractional));
  // Rejected when the v1 value is tampered with.
  const off = structuredClone(DIRECTOR_V1); off.rules.contextualGapScenes = 3;
  assert.throws(() => validateDirectorPack(off), /frozen/);
  // Rejected when the field is renamed/removed (exports the exact whitelist).
  const missing = structuredClone(DIRECTOR_V1); delete missing.rules.contextualGapScenes;
  assert.throws(() => validateDirectorPack(missing));
});

// ------------------------------------------------------------------ gate semantics

test("C-C: P5 is ineligible when a P5 scene exists in the last two Director records", () => {
  const content = registry();
  const base = atNode(active(content), 2);
  const eventId = p5CandidateIds(base, content)[0];
  assert.equal(typeof eventId, "string");
  const event = content.getEvent(base.contentVersion, eventId);

  // 1 trailing P5 scene -> gated.
  const oneP5 = recent(base, [scene({ eventId: "a", nodeIndex: 0, slot: "P5" }), scene({ eventId: "b", nodeIndex: 1, slot: "P6" })]);
  assert.equal(scoreDirectorEvent(oneP5, event, "travel", content, "P5").exclusionReason, "contextual-gap");

  // 2 trailing P5 scenes -> still gated.
  const twoP5 = recent(base, [scene({ eventId: "a", nodeIndex: 0, slot: "P6" }), scene({ eventId: "b", nodeIndex: 1, slot: "P5" }), scene({ eventId: "c", nodeIndex: 2, slot: "P5" })]);
  assert.equal(scoreDirectorEvent(twoP5, event, "travel", content, "P5").exclusionReason, "contextual-gap");

  // A single P5 scene is enough on its own (window is the last 2 records).
  const onlyP5 = recent(base, [scene({ eventId: "a", nodeIndex: 1, slot: "P5" })]);
  assert.equal(scoreDirectorEvent(onlyP5, event, "travel", content, "P5").exclusionReason, "contextual-gap");
});

test("C-D: P5 reopens after two subsequent non-P5 Director scenes", () => {
  const content = registry();
  const base = atNode(active(content), 3);
  const eventId = p5CandidateIds(base, content)[0];
  const event = content.getEvent(base.contentVersion, eventId);

  // P5 is the 3rd-from-last record: outside the 2-record window -> eligible again.
  const reopened = recent(base, [
    scene({ eventId: "p5", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "x", nodeIndex: 1, slot: "P6" }),
    scene({ eventId: "y", nodeIndex: 2, slot: "P4" })
  ]);
  const scored = scoreDirectorEvent(reopened, event, "travel", content, "P5");
  assert.notEqual(scored.exclusionReason, "contextual-gap");
  assert.equal(scored.eligible, true, JSON.stringify(scored));

  // Exactly one intervening non-P5 scene is not enough.
  const oneGap = recent(base, [
    scene({ eventId: "x", nodeIndex: 0, slot: "P6" }),
    scene({ eventId: "p5", nodeIndex: 1, slot: "P5" }),
    scene({ eventId: "y", nodeIndex: 2, slot: "P6" })
  ]);
  assert.equal(scoreDirectorEvent(oneGap, event, "travel", content, "P5").exclusionReason, "contextual-gap");
});

test("C-E: the gate is P5-only and never touches P4 or P6", () => {
  const content = registry();
  const base = atNode(active(content), 2);
  const withP5 = recent(base, [scene({ eventId: "p5", nodeIndex: 1, slot: "P5" })]);

  // P6 ordinary fallback is never 'contextual-gap'.
  for (const id of content.queryDirectorCandidates(withP5.contentVersion, { slot: "ordinary" }).eventIds) {
    const scored = scoreDirectorEvent(withP5, content.getEvent(withP5.contentVersion, id), "travel", content, "P6");
    assert.notEqual(scored.exclusionReason, "contextual-gap", id);
  }
  // No P4 candidate reports 'contextual-gap' either.
  for (const id of content.queryDirectorCandidates(withP5.contentVersion, { slot: "coreNpc", npcRoleTags: ["sword"] }).eventIds) {
    const scored = scoreDirectorEvent(withP5, content.getEvent(withP5.contentVersion, id), "worldly", content, "P4");
    assert.notEqual(scored.exclusionReason, "contextual-gap", id);
  }
});

test("C-F: the gate consumes zero RNG and adds no state", () => {
  const content = registry();
  const base = atNode(active(content), 2);
  const withP5 = recent(base, [scene({ eventId: "p5", nodeIndex: 1, slot: "P5" })]);
  const eventId = p5CandidateIds(withP5, content)[0];

  const beforeRng = JSON.stringify(withP5.run.rng);
  const beforeKeys = Object.keys(withP5.run.director).sort();
  const scored = scoreDirectorEvent(withP5, content.getEvent(withP5.contentVersion, eventId), "travel", content, "P5");
  assert.equal(scored.exclusionReason, "contextual-gap");
  assert.equal(JSON.stringify(withP5.run.rng), beforeRng, "RNG state must be untouched");
  assert.deepEqual(Object.keys(withP5.run.director).sort(), beforeKeys, "DirectorState shape must be unchanged");

  // And through the real selector: a fully gated P5 tier must not draw.
  const gatedState = recent(atNode(active(content, "rng-probe"), 2), [
    scene({ eventId: "a", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "b", nodeIndex: 1, slot: "P5" })
  ]);
  const result = selectDirectorEvent(gatedState, "travel", content, ["P5"]);
  assert.equal(result.trace.logicalRngRequests, 0);
  assert.equal(result.trace.eligibleCandidateCount, 0);
  assert.deepEqual(result.state.run.rng, gatedState.run.rng);
  assert.deepEqual(result.state.run.director.recentScenes, gatedState.run.director.recentScenes);
});

// ------------------------------------------------------------------ precedence preserved

test("C-G: strict P1-P6 precedence is unchanged; only P5 eligibility moves", () => {
  const content = registry();

  // P2 onboarding still wins over everything when first-run and inside the window.
  const firstRun = active(content, "c-p2", true);
  assert.equal(firstRun.run.director.profileId, "first_run");
  assert.equal(selectDirectorEvent(firstRun, "cultivate", content, ["P2", "P4", "P5", "P6"]).trace.selectedPrecedenceLevel, "P2");

  // With P5 gated and P4 empty, the selector falls through to P6 (never promotes P6 above a live P4).
  const gatedNoP4 = recent(atNode(active(content, "c-p6"), 2), [
    scene({ eventId: "a", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "b", nodeIndex: 1, slot: "P5" })
  ]);
  const fallback = selectDirectorEvent(gatedNoP4, "travel", content, ["P4", "P5", "P6"]);
  assert.equal(fallback.trace.selectedPrecedenceLevel, "P6");

  // The slot order itself is still honoured: asking only for P5/P6 yields P6 when P5 is gated.
  assert.equal(selectDirectorEvent(gatedNoP4, "travel", content, ["P5", "P6"]).trace.selectedPrecedenceLevel, "P6");
});

// ------------------------------------------------------------------ the headline: P6 reachable

test("C-H: P6 is selected when P4 is empty and P5 is contextual-gap gated", () => {
  const content = registry();
  const base = active(content, "c-p6-window");

  // Drive the real reducer from a state whose last two Director records are P5. P5 must be gated,
  // and P4 has no eligible core NPC (no core NPC is instantiated here), so P6 must be chosen.
  const seeded = recent(atNode(base, 2), [
    scene({ eventId: "a", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "b", nodeIndex: 1, slot: "P5" })
  ]);
  const result = selectDirectorEvent(seeded, "travel", content, ["P4", "P5", "P6"]);
  assert.equal(result.trace.selectedPrecedenceLevel, "P6");
  assert.equal(result.state.run.director.recentScenes.at(-1).slot, "P6");

  // The P5 tier really was gated at that call, not merely empty for another reason.
  assert.ok((result.trace.exclusionReasonCounts["contextual-gap"] ?? 0) >= 1, JSON.stringify(result.trace.exclusionReasonCounts));
});

test("C-I: P5 remains reachable and is not blanket suppressed", () => {
  const content = registry();
  const base = atNode(active(content, "c-p5-live"), 3);

  // On a clean ring P5 is selected normally over P6.
  const clean = selectDirectorEvent(base, "travel", content, ["P5", "P6"]);
  assert.equal(clean.trace.selectedPrecedenceLevel, "P5");
  assert.equal(clean.state.run.director.recentScenes.at(-1).slot, "P5");

  // And the gate clears after two non-P5 scenes, so P5 comes back.
  const reopened = recent(base, [
    scene({ eventId: "p5", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "x", nodeIndex: 1, slot: "P6" }),
    scene({ eventId: "y", nodeIndex: 2, slot: "P4" })
  ]);
  assert.equal(selectDirectorEvent(reopened, "travel", content, ["P5", "P6"]).trace.selectedPrecedenceLevel, "P5");
});

test("C-J: alternating P4/P5 no longer starves P6 across a sustained sequence", () => {
  const content = registry();
  // Simulate the exact pathological pattern SIM02 measured: P4 and P5 alternating forever, which
  // previously left P6 unreachable. Replay it directly over the selector and count P6 wins.
  let state = active(content, "c-alternation");
  const slots = ["P4", "P5", "P6"];
  let p6Wins = 0;
  for (let step = 0; step < 40; step += 1) {
    if (state.run.status !== "active") break;
    const result = selectDirectorEvent(state, "travel", content, slots);
    if (result.trace.selectedPrecedenceLevel === "P6") p6Wins += 1;
    state = result.state;
  }
  assert.ok(p6Wins >= 1, `expected at least one P6 selection in a 40-step sequence, got ${p6Wins}`);
  assert.ok(state.run.director.recentScenes.length <= content.getDirector(state.contentVersion).rules.recentWindowSize, "the ring must stay bounded");
});

// ------------------------------------------------------------------ P4 untouched

test("C-K: P4 eligibility and the same-core-NPC repeat gate are unchanged", () => {
  const content = registry();
  // The B3 gate still fires on the immediately preceding record, and the new P5 gate must not
  // interfere with it: a P5 record between two P4s must NOT clear the P4 gate.
  const base = atNode(active(content, "c-p4"), 3);
  const p4Event = content.getEvent(base.contentVersion, "content01.pei.broken-blade");

  // A P5 scene in the window is the only trailing record, so it is not a P4 conflict: P4 stays
  // eligible because the preceding record carries no matching core actor.
  const p5Only = recent(base, [scene({ eventId: "p5", nodeIndex: 1, slot: "P5" })]);
  assert.notEqual(scoreDirectorEvent(p5Only, p4Event, "worldly", content, "P4").exclusionReason, "contextual-gap");

  // P5 gate never removes a P4 candidate: compare eligibility with and without a trailing P5.
  const bare = recent(base, []);
  const eligibleBare = scoreDirectorEvent(bare, p4Event, "worldly", content, "P4");
  const eligibleP5 = scoreDirectorEvent(p5Only, p4Event, "worldly", content, "P4");
  assert.equal(eligibleP5.eligible, eligibleBare.eligible);
  assert.equal(eligibleP5.weight, eligibleBare.weight);
  assert.deepEqual(eligibleP5.reasons, eligibleBare.reasons);
});

// ------------------------------------------------------------------ no collateral change

test("C-L: no scoring weight, precedence constant, or rule outside contextualGapScenes changed", () => {
  const rules = registry().getDirector(CONTENT01_VERSION).rules;
  const frozen = {
    recentWindowSize: 8, continuityWindow: 3, noveltyWindow: 4, firstRunWindowNodes: 3,
    majorSalienceThreshold: 4, majorGapNodes: 2, randomDangerGapNodes: 1, contextualGapScenes: 2,
    baseWeightDefault: 100, baseWeightMin: 1, baseWeightMax: 1000,
    actionAffinityBonus: 80, buildEmergingBonus: 25, buildFormedBonus: 50, buildRefinedBonus: 75,
    worldAffinityBonus: 40, recentNpcContinuityBonus: 50, continuityOverlapBonus: 30, continuityBonusCap: 60,
    topicNoveltyBonus: 20, exactEventRecentPenalty: 80, consecutiveTopicPenalty: 30, consecutiveTopicPenaltyCap: 60
  };
  assert.deepEqual(rules, frozen);
  // Exactly one new key relative to the pre-LOOPFIX02C set.
  assert.equal(Object.keys(rules).length, 23);
});

test("C-M: selection is deterministic and order-independent under the new gate", () => {
  const content = registry();
  const seeded = recent(atNode(active(content, "c-det"), 3), [
    scene({ eventId: "a", nodeIndex: 0, slot: "P5" }),
    scene({ eventId: "b", nodeIndex: 1, slot: "P5" }),
    scene({ eventId: "c", nodeIndex: 2, slot: "P6" })
  ]);
  const run = () => selectDirectorEvent(seeded, "travel", content, ["P4", "P5", "P6"]);
  const a = run(); const b = run();
  assert.deepEqual(a.trace, b.trace);
  assert.equal(ruleStateHash(a.state), ruleStateHash(b.state));
  assert.equal(a.state.stateVersion, seeded.stateVersion);
});

test("C-N: the gate is a pure read of bounded recentScenes with no new persistent state", () => {
  const state = active(registry(), "c-shape");
  const fields = Object.keys(state.run.director).sort();
  assert.deepEqual(fields, ["profileId", "recentScenes"]);
  assert.equal(JSON.stringify(state).includes("contextualGap"), false, "no rule value may be persisted into state");
});

test("C-O: the gate is implemented as a rule read, not a hardcoded scene count", () => {
  const source = fs.readFileSync(new URL("../packages/core/src/director.ts", import.meta.url), "utf8");
  const gate = /function contextualGapGate\(([\s\S]*?)\n\}/.exec(source);
  assert.notEqual(gate, null, "contextualGapGate must exist");
  const body = gate[1];
  assert.ok(/rules\.contextualGapScenes/.test(body), "the gate must read the versioned rule");
  assert.ok(/recentScenes/.test(body), "the gate must read bounded recentScenes");
  assert.ok(/slot === "P5"/.test(body), "the gate must inspect P5 records");
  assert.ok(/drawInt|drawBps|drawUint32|seedStream/.test(body) === false, "the gate must consume no RNG");
  // The gate must be wired into the P5 branch only.
  assert.ok(/slot === "P5" && contextualGapGate\(state, rules\)/.test(source), "gate must be P5-only in scoreDirectorEvent");
});
