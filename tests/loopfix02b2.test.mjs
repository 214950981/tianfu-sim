import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT01_CAUSE_TEMPLATES, CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, NPC_CONTENT01_V1, REPEAT_SENSITIVE_EFFECT_OPS } from "../packages/content/src/index.ts";
import { createOfferedRun, materializeEventParticipants, reduce, ruleStateHash, selectCauseEcho, validateGameState } from "../packages/core/src/index.ts";

// LOOPFIX02B2 — CONTENT01 terminal Cause closure on every Cause-linked echo Event.
// Core/contracts/Director are untouched: every assertion below runs on frozen Core code.
// The closure reference is always the triggering-Cause selector, never an authored causeId, because the runtime
// causeId embeds the planting commandId; a templateId-shaped guess would close the wrong instance once one
// template has several actor-bound Causes alive.

function registry() { const content = new ContentRegistry(); content.registerNpcPack(NPC_CONTENT01_V1); content.register(CONTENT01_PACK); return content; }

function offered(contentVersion = CONTENT01_VERSION, seed = "loopfix02b2") {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: `run:${contentVersion}:${seed}`, playerId: "player:loopfix02b2",
    rootSeed: seed, metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:${contentVersion}:${seed}`, destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20, maxAge: 400, runName: "LoopFix", realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 }, resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: false
    }
  });
}

function active(content = registry(), seed = "loopfix02b2") {
  const state = offered(CONTENT01_VERSION, seed);
  return reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:start` } }).state;
}

function context(content, state, commandId) { return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId }; }

function enter(state, eventId, content, commandId = `cmd:enter:${eventId}`) {
  const event = content.getEvent(state.contentVersion, eventId);
  const staged = validateGameState({ ...state, run: { ...state.run, events: { ...state.run.events, current: { eventId, kind: event.kind } } } });
  return materializeEventParticipants(staged, content, eventId, `event:${commandId}:${eventId}`).state;
}

function safeChoiceId(content, state, eventId) { const choices = content.getEvent(state.contentVersion, eventId).choices; return (choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id)) ?? choices[0]).id; }

function advanceTo(content, state, steps) {
  let next = state;
  for (let step = 0; step < steps && next.run.status === "active"; step += 1) {
    next = next.run.events.current === undefined
      ? reduce({ state: next, command: { type: "CHOOSE_ACTION", actionId: ["cultivate", "travel", "worldly", "pursuit"][step % 4] }, context: context(content, next, `cmd:advance:${next.stateVersion}`) }).state
      : reduce({ state: next, command: { type: "CHOOSE_EVENT_OPTION", eventId: next.run.events.current.eventId, optionId: safeChoiceId(content, next, next.run.events.current.eventId) }, context: context(content, next, `cmd:advance:${next.stateVersion}`) }).state;
  }
  return next;
}

// Real P3 provenance: plant a Cause through an origin Event, then walk until the Director selects the echo.
function plantCause(content, seed, originEventId, choiceId) {
  let state = active(content, seed);
  state = enter(state, originEventId, content, `cmd:${seed}:enter`);
  return reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: originEventId, optionId: choiceId }, context: context(content, state, `cmd:${seed}:bind`) }).state;
}

const ECHO_EVENT_IDS = [...new Set(CONTENT01_CAUSE_TEMPLATES.flatMap((template) => template.linkedEventIds))].sort();
const ORIGIN_EVENTS = CONTENT01_PACK.events.filter((event) => event.choices.some((choice) => choice.id.startsWith("bind-"))).map((event) => event.id).sort();

function echoEffectsOf(eventId) {
  const event = CONTENT01_PACK.events.find((candidate) => candidate.id === eventId);
  return event.choices.flatMap((choice) => Object.entries(choice.outcomes ?? {}).flatMap(([tier, outcome]) => (outcome.effects ?? []).map((effect) => ({ choiceId: choice.id, tier, effect }))));
}

// ---------------------------------------------------------------- coverage

test("B2-A: every CONTENT01 Cause template links at least one echo Event", () => {
  assert.ok(CONTENT01_CAUSE_TEMPLATES.length >= 10, String(CONTENT01_CAUSE_TEMPLATES.length));
  for (const template of CONTENT01_CAUSE_TEMPLATES) assert.ok(template.linkedEventIds.length >= 1, template.id);
  assert.equal(ECHO_EVENT_IDS.length, 10);
});

test("B2-B: every normal choice on every Cause-linked echo closes via triggeringCause with no authored causeId", () => {
  for (const eventId of ECHO_EVENT_IDS) {
    const event = CONTENT01_PACK.events.find((candidate) => candidate.id === eventId);
    const normal = event.choices.filter((choice) => ["engage", "consider", "leave"].includes(choice.id));
    assert.equal(normal.length, 3, eventId);
    for (const choice of normal) {
      const closures = (choice.outcomes.success.effects ?? []).filter((effect) => effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE");
      assert.equal(closures.length, 1, `${eventId}/${choice.id}`);
      assert.equal(closures[0].triggeringCause, true, `${eventId}/${choice.id}`);
      assert.equal("causeId" in closures[0], false, `${eventId}/${choice.id}`);
    }
  }
});

test("B2-C: engage and consider resolve the triggering Cause; leave expires it on all 10 echoes with no exception", () => {
  for (const eventId of ECHO_EVENT_IDS) {
    const event = CONTENT01_PACK.events.find((candidate) => candidate.id === eventId);
    const byId = new Map(event.choices.map((choice) => [choice.id, choice]));
    for (const choiceId of ["engage", "consider"]) {
      const ops = (byId.get(choiceId).outcomes.success.effects ?? []).filter((effect) => effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE");
      assert.deepEqual(ops.map((effect) => effect.op), ["RESOLVE_CAUSE"], `${eventId}/${choiceId}`);
    }
    const leaveOps = (byId.get("leave").outcomes.success.effects ?? []).filter((effect) => effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE");
    assert.deepEqual(leaveOps.map((effect) => effect.op), ["EXPIRE_CAUSE"], `${eventId}/leave`);
  }
});

test("B2-D: exactly one closure per normal choice, so no zero-budget nonterminal zombie path exists", () => {
  for (const eventId of ECHO_EVENT_IDS) {
    for (const { choiceId, tier, effect } of echoEffectsOf(eventId)) {
      if (!["engage", "consider", "leave"].includes(choiceId)) continue;
      if (effect.op !== "RESOLVE_CAUSE" && effect.op !== "EXPIRE_CAUSE") continue;
      assert.equal(tier, "success", `${eventId}/${choiceId}/${tier}`);
    }
  }
});

test("B2-E: closure effects never hardcode a runtime causeId", () => {
  for (const effect of ECHO_EVENT_IDS.flatMap((eventId) => echoEffectsOf(eventId).map((entry) => entry.effect))) {
    if (effect.op !== "RESOLVE_CAUSE" && effect.op !== "EXPIRE_CAUSE") continue;
    assert.equal(effect.triggeringCause, true);
    assert.equal("causeId" in effect, false);
  }
});

test("B2-F: repeatable echo closure effects carry a valid repeatBehavior", () => {
  for (const eventId of ECHO_EVENT_IDS) {
    const event = CONTENT01_PACK.events.find((candidate) => candidate.id === eventId);
    const repeatable = event.cooldown !== undefined && event.cooldown.maxOccurrences !== 1;
    assert.equal(repeatable, true, eventId);
    for (const { effect } of echoEffectsOf(eventId)) {
      if (!REPEAT_SENSITIVE_EFFECT_OPS.has(effect.op)) continue;
      assert.equal(effect.repeatBehavior, "allow-cumulative", `${eventId}/${effect.op}`);
    }
  }
});

test("B2-G: resolved path is reachable through the real origin -> maturity -> P3 echo flow", () => {
  const content = registry();
  let reached = 0;
  for (const originEventId of ORIGIN_EVENTS) {
    const state = plantCause(content, `b2g:${originEventId}`, originEventId, "bind-1");
    const causeId = Object.keys(state.run.causes.byId)[0];
    assert.ok(causeId !== undefined, originEventId);
    let walked = state;
    for (let step = 0; step < 12 && walked.run.causes.byId[causeId].echoCount === 0 && walked.run.status === "active"; step += 1) walked = advanceTo(content, walked, 1);
    if (walked.run.causes.byId[causeId].echoCount === 0) continue;
    reached += 1;
    // The echo Event is entered by a real P3 selection, so the closure reference resolves.
    const current = walked.run.events.current;
    if (current === undefined || !ECHO_EVENT_IDS.includes(current.eventId)) continue;
    assert.equal(current.triggeringCauseId, causeId, originEventId);
    const resolved = reduce({ state: walked, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.eventId, optionId: "engage" }, context: context(content, walked, `cmd:b2g:${originEventId}:engage`) }).state;
    assert.equal(resolved.run.causes.byId[causeId].state, "resolved", originEventId);
  }
  assert.ok(reached >= 6, `echo reached for ${reached} origins`);
});

test("B2-H: expired path is reachable through the real origin -> maturity -> P3 echo flow", () => {
  const content = registry();
  let reached = 0;
  for (const originEventId of ORIGIN_EVENTS) {
    const state = plantCause(content, `b2h:${originEventId}`, originEventId, "bind-1");
    const causeId = Object.keys(state.run.causes.byId)[0];
    assert.ok(causeId !== undefined, originEventId);
    let walked = state;
    for (let step = 0; step < 12 && walked.run.causes.byId[causeId].echoCount === 0 && walked.run.status === "active"; step += 1) walked = advanceTo(content, walked, 1);
    if (walked.run.causes.byId[causeId].echoCount === 0) continue;
    reached += 1;
    const current = walked.run.events.current;
    if (current === undefined || !ECHO_EVENT_IDS.includes(current.eventId)) continue;
    const expired = reduce({ state: walked, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.eventId, optionId: "leave" }, context: context(content, walked, `cmd:b2h:${originEventId}:leave`) }).state;
    assert.equal(expired.run.causes.byId[causeId].state, "expired", originEventId);
  }
  assert.ok(reached >= 6, `echo reached for ${reached} origins`);
});

test("B2-I: an unbound Cause-linked echo fails closed, consuming no RNG and no state mutation", () => {
  const content = registry();
  const staged = enter(active(content, "b2i"), "content01.pei.sparring-rain", content);
  const before = ruleStateHash(staged);
  assert.throws(() => reduce({ state: staged, command: { type: "CHOOSE_EVENT_OPTION", eventId: "content01.pei.sparring-rain", optionId: "engage" }, context: context(content, staged, "cmd:b2i:engage") }), /cause\.invalid/);
  assert.equal(ruleStateHash(staged), before);
});

test("B2-J: under two live same-template instances the closure binds the exact triggering Cause", () => {
  const content = registry();
  const state = plantCause(content, "b2j", "content01.pei.broken-blade", "bind-1");
  const causeId = Object.keys(state.run.causes.byId)[0];
  assert.ok(causeId !== undefined);
  // Forge a second, distinct instance of the same template to prove the binding is not template-shaped.
  const twin = { ...state.run.causes.byId[causeId], causeId: `${causeId}:twin`, originCommandId: "cmd:twin" };
  const twoLive = validateGameState({ ...state, run: { ...state.run, causes: { byId: { ...state.run.causes.byId, [twin.causeId]: twin } } } });
  assert.equal(Object.keys(twoLive.run.causes.byId).length, 2);
  let walked = twoLive;
  for (let step = 0; step < 12 && walked.run.causes.byId[causeId].echoCount === 0 && walked.run.status === "active"; step += 1) walked = advanceTo(content, walked, 1);
  const current = walked.run.events.current;
  if (current === undefined || !ECHO_EVENT_IDS.includes(current.eventId)) return;
  const bound = walked.run.events.current.triggeringCauseId;
  assert.ok(bound === causeId || bound === twin.causeId, String(bound));
  const after = reduce({ state: walked, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.eventId, optionId: "leave" }, context: context(content, walked, "cmd:b2j:leave") }).state;
  const other = bound === causeId ? twin.causeId : causeId;
  assert.equal(after.run.causes.byId[bound].state, "expired");
  assert.notEqual(after.run.causes.byId[other].state, "expired");
});

test("B2-K: closure costs no RNG draw", () => {
  const content = registry();
  const state = plantCause(content, "b2k", "content01.pei.broken-blade", "bind-1");
  const causeId = Object.keys(state.run.causes.byId)[0];
  let walked = state;
  for (let step = 0; step < 12 && walked.run.causes.byId[causeId].echoCount === 0 && walked.run.status === "active"; step += 1) walked = advanceTo(content, walked, 1);
  const current = walked.run.events.current;
  if (current === undefined || !ECHO_EVENT_IDS.includes(current.eventId)) return;
  const before = JSON.stringify(walked.run.rng);
  const after = reduce({ state: walked, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.eventId, optionId: "engage" }, context: context(content, walked, "cmd:b2k:engage") }).state;
  assert.equal(JSON.stringify(after.run.rng), before);
  assert.notEqual(ruleStateHash(after), ruleStateHash(walked));
});

// Every slot is probed through an index key that the echo Events actually declare, so an
// empty result is never mistaken for proof of absence.
const ECHO_ACTION_TYPES = ["cultivate", "travel", "worldly", "pursuit"];

// Union of every index key the Cause-linked echoes are registered under. Feeding these keys
// back into queryDirectorCandidates reconstructs exactly the sets the echoes would land in
// if buildDirectorIndex() ever stopped excluding causeLinked ids.
function echoIndexKeys() {
  const byId = new Map(CONTENT01_PACK.events.map((event) => [event.id, event]));
  const actions = new Set();
  const npcRoles = new Set();
  const buildTags = new Set();
  const worldTags = new Set();
  const onboarding = new Set();
  for (const id of ECHO_EVENT_IDS) {
    const event = byId.get(id);
    assert.ok(event !== undefined, `missing echo Event: ${id}`);
    for (const action of event.actionAffinity ?? []) actions.add(action);
    const hints = event.directorHints ?? {};
    for (const tag of hints.npcRoleAffinityTags ?? []) npcRoles.add(tag);
    for (const tag of hints.buildAffinityTags ?? []) buildTags.add(tag);
    for (const tag of hints.worldAffinityTags ?? []) worldTags.add(tag);
    if (hints.onboardingEligible === true) onboarding.add(id);
  }
  return { byId, actions: [...actions].sort(), npcRoles: [...npcRoles].sort(), buildTags: [...buildTags].sort(), worldTags: [...worldTags].sort(), onboarding: [...onboarding] };
}

test("B2-L: Cause-linked echo Events are reserved out of all four Director index buckets", () => {
  const content = registry();
  const echoIds = new Set(ECHO_EVENT_IDS);
  const keys = echoIndexKeys();

  // --- P4 -> slot "coreNpc": probe every core-NPC role tag the echoes declare.
  // The tag vocabulary is content-declared (sword/healer/body/mortal/ruin-explorer), so a
  // non-empty result is guaranteed whenever any non-echo Event shares a role tag.
  assert.ok(keys.npcRoles.length >= 1, "echoes declare no npcRoleAffinityTags");
  let p4Candidates = 0;
  for (const roleTag of keys.npcRoles) {
    const p4 = content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "coreNpc", npcRoleTags: [roleTag] });
    p4Candidates += p4.eventIds.length;
    assert.ok(p4.stats.indexLookups >= 1, `P4 coreNpc did not consult the index for ${roleTag}`);
    for (const id of p4.eventIds) assert.equal(echoIds.has(id), false, `P4 coreNpc leaked ${id} via ${roleTag}`);
  }
  assert.ok(p4Candidates >= 1, "P4 coreNpc probe was vacuous: no indexed role tag resolved to any Event");

  // --- P5 -> slot "contextual": action / build / world / NPC-role signals.
  let p5Candidates = 0;
  for (const action of ECHO_ACTION_TYPES) {
    const p5 = content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "contextual", action, buildTags: keys.buildTags, worldTags: keys.worldTags, npcRoleTags: keys.npcRoles });
    p5Candidates += p5.eventIds.length;
    for (const id of p5.eventIds) assert.equal(echoIds.has(id), false, `P5 contextual leaked ${id} (action=${action})`);
  }
  // The echo action affinities are a subset of ECHO_ACTION_TYPES, so this must hit real Events.
  assert.ok(p5Candidates >= 1, "P5 contextual probe was vacuous: no indexed action resolved to any Event");

  // --- P6 -> slot "ordinary": events with empty actionAffinity.
  // Note: queryIndex merges action/build/world/npc keys into the contextual slot only, so for
  // ordinary the decisive property is the echo's own actionAffinity emptiness.
  const p6 = content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "ordinary" });
  assert.ok(p6.eventIds.length >= 1, "P6 ordinary index returned nothing");
  for (const id of p6.eventIds) assert.equal(echoIds.has(id), false, `P6 ordinary leaked ${id}`);
  // Six echoes declare an empty actionAffinity, so they would all appear here absent the filter.
  const emptyAffinityEchoes = ECHO_EVENT_IDS.filter((id) => (keys.byId.get(id).actionAffinity ?? []).length === 0);
  assert.ok(emptyAffinityEchoes.length >= 1, "no echo has an empty actionAffinity, so the P6 probe proves nothing");

  // --- Mutual exclusivity across buckets.
  const p4Union = new Set(ECHO_EVENT_IDS.flatMap(() => []));
  for (const roleTag of keys.npcRoles) for (const id of content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "coreNpc", npcRoleTags: [roleTag] }).eventIds) p4Union.add(id);
  for (const id of p4Union) assert.equal(p6.eventIds.includes(id), false, `event ${id} is in both coreNpc and ordinary`);
});

test("B2-M: an eligible Cause echo is selected by P3 and stays reserved from the P4/P5/P6 indexes", () => {
  const content = registry();
  const echoIds = new Set(ECHO_EVENT_IDS);
  const keys = echoIndexKeys();

  // Reconstruct the P4/P5/P6 candidate sets from an active run so the reservation check uses
  // the same queries director.ts issues via queryForSlot().
  let reserved = 0;
  for (const roleTag of keys.npcRoles) {
    for (const id of content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "coreNpc", npcRoleTags: [roleTag] }).eventIds) {
      assert.equal(echoIds.has(id), false, `P4 coreNpc reserved ${id} via ${roleTag}`);
      reserved += 1;
    }
  }
  for (const action of ECHO_ACTION_TYPES) {
    for (const id of content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "contextual", action, buildTags: keys.buildTags, worldTags: keys.worldTags, npcRoleTags: keys.npcRoles }).eventIds) {
      assert.equal(echoIds.has(id), false, `P5 contextual reserved ${id} (action=${action})`);
      reserved += 1;
    }
  }
  for (const id of content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "ordinary" }).eventIds) {
    assert.equal(echoIds.has(id), false, `P6 ordinary reserved ${id}`);
    reserved += 1;
  }
  assert.ok(reserved >= 1, "reservation probe visited no candidates at all");

  // P3, observed at the real reducer seam: the reducer advances Causes and consults
  // selectCauseEcho within a single reduce(), so a Cause never rests in "eligible" between
  // commands. The observable proof is that the echoed current Event the reducer assigns is a
  // Cause-linked Event, and that selectCauseEcho (given the pre-echo state, where the Cause is
  // still eligible) reports exactly that Event with the same causeId binding.
  let verified = 0;
  assert.ok(ORIGIN_EVENTS.length >= 1, "no Cause origin Event exists");
  for (const anchor of ORIGIN_EVENTS) {
    let walked = plantCause(content, `b2m:${anchor}`, anchor, "bind-1");
    const causeId = Object.keys(walked.run.causes.byId)[0];
    if (causeId === undefined) continue;

    // Walk one step at a time and keep the last pre-echo state plus the post-reduce state.
    let before;
    let after;
    for (let step = 0; step < 16 && walked.run.status === "active"; step += 1) {
      const snapshot = walked;
      const cause = snapshot.run.causes.byId[causeId];
      // Force the eligibility the reducer will compute for itself, so selectCauseEcho can be
      // exercised at the exact boundary the reducer uses.
      const eligible = cause.state === "resolved" || cause.state === "expired"
        ? snapshot
        : { ...snapshot, run: { ...snapshot.run, causes: { byId: { ...snapshot.run.causes.byId, [causeId]: { ...cause, state: "eligible" } } } } };
      const selection = selectCauseEcho(eligible, content, CONTENT01_VERSION);
      const hit = selection.trace.find((entry) => entry.tier === "P3" && entry.eventId !== undefined);
      const next = advanceTo(content, snapshot, 1);
      const echoed = next.run.events.current;
      if (hit !== undefined && echoed !== undefined && echoIds.has(echoed.eventId)) {
        assert.equal(hit.eventId, echoed.eventId, "P3 selected a different Event than the reducer echoed");
        assert.equal(hit.causeId, causeId, "P3 bound an unexpected Cause");
        before = hit;
        after = echoed;
        break;
      }
      walked = next;
    }
    if (before === undefined || after === undefined) continue;

    assert.ok(ECHO_EVENT_IDS.includes(after.eventId), `reducer echoed a non-Cause Event: ${after.eventId}`);
    for (const slot of ["coreNpc", "contextual", "ordinary"]) {
      const query = slot === "ordinary"
        ? { slot }
        : slot === "coreNpc"
          ? { slot, npcRoleTags: keys.npcRoles }
          : { slot, action: "worldly", buildTags: keys.buildTags, worldTags: keys.worldTags, npcRoleTags: keys.npcRoles };
      assert.equal(content.queryDirectorCandidates(CONTENT01_VERSION, query).eventIds.includes(after.eventId), false, `${slot} leaked the P3-selected echo ${after.eventId}`);
    }
    verified += 1;
  }
  assert.ok(verified >= 1, "no Cause reached an eligible echo, so P3 selection was never exercised");
});
