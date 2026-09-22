import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry, sealContentPack, validateContentPack } from "../packages/content/src/index.ts";
import { createOfferedRun, createSnapshot, reduce, replayCommandLog, ruleStateHash, validateGameState, validateSnapshot } from "../packages/core/src/index.ts";

const fixture = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
const VERSION = fixture.manifest.contentVersion;
const TEMPLATE = "cause.rescued-stranger";
const ECHO_EVENT = "dev.rescue-echo-b";
const CLOSE_CHOICE = "close-the-loop";
const RESCUE = { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "rescue-stranger" };
const CLOSE = { type: "CHOOSE_EVENT_OPTION", eventId: ECHO_EVENT, optionId: CLOSE_CHOICE };

// R1 owns its own pack. The shared dev fixture deliberately carries no triggeringCause usage: unrelated tests
// legitimately clone and rewrite it, and a closure reference is only meaningful where a Cause echo can occur.
// The template also links exactly one echo Event so P3 selection is direct and provably RNG-free, which is what
// lets R1 assert that binding provenance costs nothing in randomness.
// The Cause actor role stays authored content (rescuedNpc here) and is never renamed for this mechanism.
function closeDraft(contentVersion = VERSION) {
  const draft = structuredClone(fixture);
  draft.manifest.contentVersion = contentVersion;
  delete draft.manifest.checksum;
  draft.causeTemplates = draft.causeTemplates.map((template) => template.id === TEMPLATE
    ? { ...template, linkedEventIds: [ECHO_EVENT] }
    : template);
  draft.events = draft.events.map((event) => event.id === ECHO_EVENT
    ? { ...event, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "dev.rescue-echo-b.close-the-loop", outcomes: { success: { effects: [{ op: "RESOLVE_CAUSE", triggeringCause: true }] } } }] }
    : event);
  return draft;
}
function registryFor(pack) { const registry = new ContentRegistry(); registry.register(pack ?? sealContentPack(closeDraft())); return registry; }
function cloneFixture(contentVersion) { const draft = closeDraft(contentVersion); return draft; }
function offered(contentVersion = VERSION) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: "run-r1", playerId: "player-r1", rootSeed: "r1-root",
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: "offer-r1", destinyIds: ["d1", "d2", "d3"], age: 20, maxAge: 100, runName: "R1 Run",
      realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  });
}
function active(content, contentVersion = VERSION) {
  return reduce({ state: offered(contentVersion), command: { type: "START_RUN", offerId: "offer-r1", destinyId: "d1" }, context: { rulesVersion: "2.0.0", contentVersion, content, commandId: "cmd:start" } }).state;
}
function withCurrent(state, current) { return validateGameState({ ...state, run: { ...state.run, events: { history: [], current } } }); }
function context(content, commandId, contentVersion = VERSION) { return { rulesVersion: "2.0.0", contentVersion, content, commandId, actorBindings: { eventTarget: "npc:test:rescued-001" } }; }
// The real P3 flow: the reducer selects the echo, materializes the scene and persists the Cause binding.
function triggered(content, commandId) { return reduce({ state: withCurrent(active(content), { eventId: "dev.first-choice", kind: "choice" }), command: RESCUE, context: context(content, commandId) }); }
// Re-reaches the same scope-identical Event without any Cause provenance, past the stale node cooldown.
function untriggeredScene(state, contentVersion = VERSION) {
  return validateGameState({
    ...state,
    contentVersion,
    run: { ...state.run, nodeIndex: 4, events: { ...state.run.events, current: { eventId: ECHO_EVENT, kind: "narrative", instanceId: `event:cmd:continuation:${ECHO_EVENT}` } } }
  });
}
// Plants a second, legally coexisting instance of the same template while the bound scene stays intact.
function plantTwin(state, causeId, templateId, actorId, salience, eligibleSinceNode) {
  return validateGameState({ ...state, run: { ...state.run, causes: { byId: { ...state.run.causes.byId, [causeId]: {
    causeId, templateId, originCommandId: "cmd:twin", originNodeIndex: 0, originAge: 20,
    actorIdsByRole: { rescuedNpc: actorId }, themes: [], salience, visibility: "hidden", state: "eligible",
    maturity: { minNode: 0, minAge: 0, conditions: [] }, eligibleSinceNode, eligibleAge: 20,
    echoBudget: 1, echoCount: 0, facts: {}, linkedEventIds: [ECHO_EVENT]
  } } } } });
}

test("R1-A exact binding: the P3-selected Cause is persisted on the authoritative current scene", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rescue");
  const cause = Object.values(output.state.run.causes.byId)[0];
  assert.equal(cause.state, "echoed"); assert.equal(cause.echoCount, 1); assert.equal(cause.echoBudget, 0);
  // Deterministic provenance: the scene carries the exact causeId P3 selected, not a template and not a guess.
  assert.equal(output.state.run.events.current.eventId, ECHO_EVENT);
  assert.equal(output.state.run.events.current.triggeringCauseId, cause.causeId);
  assert.equal(output.trace.selector.at(-1).tier, "P3");
  assert.equal(output.trace.selector.at(-1).causeId, cause.causeId);
  // Provenance survives participant materialization and rides inside the hashed snapshot.
  assert.equal(output.state.run.events.current.instanceId, `event:cmd:rescue:${ECHO_EVENT}`);
  assert.equal(validateSnapshot(createSnapshot(output.state, 1)).state.run.events.current.triggeringCauseId, cause.causeId);
  // The Echo Event declares no participants, so the materialized binding map is legitimately empty.
  assert.deepEqual(output.state.run.events.current.participantBindings, {});
  assert.equal(active(content).run.events.current, undefined);
});

test("R1-B same-template multi-instance isolation: closure hits the bound instance, never a same-template twin", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rescue");
  const boundId = output.state.run.events.current.triggeringCauseId;
  assert.match(boundId, new RegExp(`:${TEMPLATE}$`));
  const twinId = `cause:twin-b:0:${TEMPLATE}`;
  // The twin outranks the bound instance on salience, so a templateId lookup or a "highest salience
  // same-template" heuristic would resolve the wrong Cause. The authoritative binding must win.
  const twin = plantTwin(output.state, twinId, TEMPLATE, "npc:test:twin-b", 5, 0);
  assert.ok(twin.run.causes.byId[boundId].salience < twin.run.causes.byId[twinId].salience);
  const closed = reduce({ state: twin, command: CLOSE, context: context(content, "cmd:close") });
  assert.equal(closed.state.run.causes.byId[boundId].state, "resolved");
  assert.equal(closed.state.run.causes.byId[boundId].resolution.action, "RESOLVE_CAUSE");
  assert.equal(closed.state.run.causes.byId[boundId].resolution.commandId, "cmd:close");
  // The twin outranked the bound Cause and therefore may echo in its own right, but it must never be the
  // Cause the closure resolved. That is the whole point: salience ordering cannot redirect the reference.
  assert.notEqual(closed.state.run.causes.byId[twinId].resolution?.action, "RESOLVE_CAUSE");
  assert.equal(Object.values(closed.state.run.causes.byId).filter((cause) => cause.resolution?.action === "RESOLVE_CAUSE").length, 1);
});

test("R1-C wrong context fails closed: a scene without Cause provenance cannot resolve or expire anything", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rescue");
  const boundId = output.state.run.events.current.triggeringCauseId;
  // Scope is Event-wide, so the identical current Event reached without provenance is exactly the case an
  // Event-body-only check would let through.
  const reread = untriggeredScene(output.state);
  assert.equal(reread.run.events.current.triggeringCauseId, undefined);
  const before = structuredClone(reread);
  const causeBefore = structuredClone(reread.run.causes.byId[boundId]);
  assert.throws(() => reduce({ state: reread, command: CLOSE, context: context(content, "cmd:no-trigger") }), /cause\.invalid/);
  assert.deepEqual(reread, before, "a fail-closed reference mutates nothing");
  assert.deepEqual(reread.run.causes.byId[boundId], causeBefore);
  assert.equal(reread.stateVersion, before.stateVersion);
  // The EXPIRE form of the reference fails closed identically.
  const expiring = cloneFixture("r1-expire-1");
  expiring.events = expiring.events.map((event) => event.id === ECHO_EVENT
    ? { ...event, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "EXPIRE_CAUSE", triggeringCause: true }] } } }] }
    : event);
  const expiringContent = registryFor(sealContentPack(expiring));
  assert.throws(() => reduce({ state: untriggeredScene(output.state, "r1-expire-1"), command: CLOSE, context: context(expiringContent, "cmd:expire", "r1-expire-1") }), /cause\.invalid/);
});

test("R1-D snapshot and replay: provenance is hashed, validated and reproduced", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:replay");
  const boundId = output.state.run.events.current.triggeringCauseId;
  const snapshot = validateSnapshot(createSnapshot(output.state, 1));
  assert.equal(snapshot.ruleStateHash, ruleStateHash(output.state));
  assert.equal(ruleStateHash(snapshot.state), snapshot.ruleStateHash);
  const replayed = replayCommandLog({
    snapshot,
    commandLog: { commandLogSchemaVersion: 1, rulesVersion: "2.0.0", contentVersion: VERSION, runId: "run-r1", playerId: "player-r1", baseSequence: 0, entries: [{ sequence: 1, envelope: { commandId: "cmd:replay", playerId: "player-r1", runId: "run-r1", expectedStateVersion: 0, rulesVersion: "2.0.0", contentVersion: VERSION, clientPlatform: "dev", clientBuild: "test", command: RESCUE }, context: { actorBindings: { eventTarget: "npc:test:rescued-001" } }, resultStateVersion: 1, resultRuleStateHash: ruleStateHash(output.state) }] },
    content
  });
  assert.equal(replayed.finalRuleStateHash, snapshot.ruleStateHash);
  assert.equal(replayed.state.run.events.current.triggeringCauseId, boundId);
  // Tampering with the persisted provenance invalidates the snapshot.
  const forged = structuredClone(snapshot);
  forged.state.run.events.current.triggeringCauseId = `cause:forged:0:${TEMPLATE}`;
  assert.throws(() => validateSnapshot(forged), /ruleStateHash/);
  // Dropping the binding changes the canonical hash, so provenance is genuinely load-bearing.
  const stripped = structuredClone(snapshot.state);
  delete stripped.run.events.current.triggeringCauseId;
  assert.notEqual(ruleStateHash(stripped), snapshot.ruleStateHash);
});

test("R1-E retry exactly-once: a repeated or terminal closure changes no version, RNG or Cause", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rescue");
  const boundId = output.state.run.events.current.triggeringCauseId;
  const first = reduce({ state: output.state, command: CLOSE, context: context(content, "cmd:once") });
  assert.equal(first.state.run.causes.byId[boundId].state, "resolved");
  assert.equal(first.state.run.causes.byId[boundId].resolution.commandId, "cmd:once");
  const afterFirst = structuredClone(first.state);
  // Replaying the identical command against the already-resolved scene: the Event is no longer current.
  assert.throws(() => reduce({ state: first.state, command: CLOSE, context: context(content, "cmd:once") }), /event\.not_current/);
  assert.deepEqual(first.state, afterFirst);
  assert.equal(first.state.stateVersion, afterFirst.stateVersion);
  assert.deepEqual(first.state.run.rng, afterFirst.run.rng);
  // A hand-terminal Cause behind a live binding fails closed with no mutation.
  const terminal = validateGameState({ ...output.state, run: { ...output.state.run, causes: { byId: { ...output.state.run.causes.byId, [boundId]: { ...output.state.run.causes.byId[boundId], state: "expired" } } } } });
  const terminalBefore = structuredClone(terminal);
  assert.throws(() => reduce({ state: terminal, command: CLOSE, context: context(content, "cmd:retry") }), /cause\.invalid/);
  assert.deepEqual(terminal, terminalBefore);
});

test("R1-F existing exact causeId compatibility: the author-time form is unchanged", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rescue");
  const boundId = output.state.run.events.current.triggeringCauseId;
  // Same Event, same choice id, but the literal author-time form and no scene provenance at all.
  const legacy = cloneFixture("r1-legacy-1");
  legacy.events = legacy.events.map((event) => event.id === ECHO_EVENT
    ? { ...event, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "RESOLVE_CAUSE", causeId: boundId }] } } }] }
    : event);
  assert.doesNotThrow(() => validateContentPack(sealContentPack(legacy), "r1-legacy-1"));
  const legacyContent = registryFor(sealContentPack(legacy));
  const legacyState = untriggeredScene(output.state, "r1-legacy-1");
  assert.equal(legacyState.run.events.current.triggeringCauseId, undefined);
  const closed = reduce({ state: legacyState, command: CLOSE, context: context(legacyContent, "cmd:legacy", "r1-legacy-1") });
  assert.equal(closed.state.run.causes.byId[boundId].state, "resolved");
  assert.equal(closed.state.run.causes.byId[boundId].resolution.commandId, "cmd:legacy");
});

test("R1 lint: triggeringCause requires a Cause-linked Event, not any particular actor role", () => {
  const variants = [
    // The Event is not linked from any CauseTemplate, so no authoritative triggering Cause can ever exist for it.
    { version: "r1-unlinked-1", mutate: (draft) => { draft.events = draft.events.map((e) => e.id === "dev.ordinary-fallback" ? { ...e, choices: [{ id: "continue", scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "EXPIRE_CAUSE", triggeringCause: true }] } } }] } : e); }, expect: /requires this Event to be linked from a CauseTemplate/ },
    // causeId and triggeringCause are mutually exclusive.
    { version: "r1-both-1", mutate: (draft) => { draft.events = draft.events.map((e) => e.id === ECHO_EVENT ? { ...e, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "RESOLVE_CAUSE", causeId: "x", triggeringCause: true }] } } }] } : e); }, expect: /exactly one of causeId or triggeringCause/ },
    // Neither target form is present.
    { version: "r1-neither-1", mutate: (draft) => { draft.events = draft.events.map((e) => e.id === ECHO_EVENT ? { ...e, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "EXPIRE_CAUSE" }] } } }] } : e); }, expect: /exactly one of causeId or triggeringCause/ },
    // The selector must be exactly true.
    { version: "r1-false-1", mutate: (draft) => { draft.events = draft.events.map((e) => e.id === ECHO_EVENT ? { ...e, choices: [{ id: CLOSE_CHOICE, scope: "core", labelKey: "l", outcomes: { success: { effects: [{ op: "RESOLVE_CAUSE", triggeringCause: false }] } } }] } : e); }, expect: /must be true/ }
  ];
  for (const variant of variants) {
    const draft = cloneFixture(variant.version);
    variant.mutate(draft);
    assert.throws(() => validateContentPack(sealContentPack(draft), variant.version), variant.expect, variant.version);
  }
  // A Cause actor role is content meaning and is never reserved for this mechanism. Any legal role name works:
  // the pack below authors `master`, and the closure reference is still legal because the Event stays Cause-linked.
  const renamed = cloneFixture("r1-renamed-1");
  renamed.causeTemplates = renamed.causeTemplates.map((t) => t.id === TEMPLATE ? { ...t, actors: [{ role: "master", required: true }] } : t);
  renamed.events = renamed.events.map((e) => e.id === "dev.first-choice"
    ? { ...e, choices: e.choices.map((c) => c.id === "rescue-stranger" ? { ...c, outcomes: { success: { effects: [{ op: "ADD_CAUSE", templateId: TEMPLATE, salience: 3, visibility: "hidden", actorBindingKeys: { master: "eventTarget" } }] } } } : c) }
    : e);
  assert.doesNotThrow(() => validateContentPack(sealContentPack(renamed), "r1-renamed-1"));
  // The successor links the Event, so the reference stays legal there too. Any role name works: `witness` here.
  const chained = cloneFixture("r1-chain-1");
  chained.causeTemplates = [
    { ...chained.causeTemplates[0], onActorUnavailable: { action: "transform", targetCauseTemplateId: "cause.successor" } },
    { id: "cause.successor", salience: 3, maturity: {}, actors: [{ role: "rescuedNpc", required: true }, { role: "witness", required: false }], themes: [], linkedEventIds: [ECHO_EVENT], onActorUnavailable: { action: "expire" } }
  ];
  chained.references = { ...chained.references, causes: [TEMPLATE, "cause.successor"] };
  assert.doesNotThrow(() => validateContentPack(sealContentPack(chained), "r1-chain-1"));
});

test("R1 regression: no new RNG, echoBudget and P1-P6 precedence are untouched", () => {
  const content = registryFor();
  const output = triggered(content, "cmd:rng");
  const cause = Object.values(output.state.run.causes.byId)[0];
  // One owned echo Event => direct selection with no RNG; closure adds none either.
  assert.deepEqual([cause.echoBudget, cause.echoCount], [0, 1]);
  assert.deepEqual(output.trace.rngDraws, []);
  const closed = reduce({ state: output.state, command: CLOSE, context: context(content, "cmd:close-rng") });
  assert.deepEqual(closed.trace.rngDraws, []);
  assert.deepEqual(closed.state.run.rng, output.state.run.rng);
  // Selection stayed on P3 and the closure scene records the same causeId the binding names.
  assert.equal(output.trace.selector.at(-1).tier, "P3");
  assert.equal(output.trace.selector.at(-1).logicalRequests, 0);
  const scene = closed.state.run.director.recentScenes.at(-1);
  assert.equal(scene.slot, "P3");
  assert.equal(scene.causeId, output.state.run.events.current.triggeringCauseId);
  assert.equal(scene.eventId, ECHO_EVENT);
});
