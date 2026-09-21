import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { ContentRegistry } from "../packages/content/src/index.ts";
import { createSnapshot, replayCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import { CommandGateway, InMemoryGatewayStore, ServerViewModelBuilder, generateServerDestinyOffer } from "../server/src/index.ts";

const pack = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));

function setup() {
  const content = new ContentRegistry(); content.register(pack);
  const offerInput = {
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", runId: "run-repair", playerId: "player-repair", rootSeed: "repair-fixed-seed",
    metaView: { unlocks: [], entitlements: [], discoveries: [] }, content,
    fixture: {
      offerId: "offer-repair", age: 20, maxAge: 100, runName: "Repair Run",
      realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  };
  const firstOffer = generateServerDestinyOffer(offerInput); const repeatedOffer = generateServerDestinyOffer(offerInput);
  assert.deepEqual(repeatedOffer, firstOffer);
  const initialState = structuredClone(firstOffer.state); const store = new InMemoryGatewayStore(); store.seedRun(initialState);
  const builder = new ServerViewModelBuilder(content);
  const gateway = new CommandGateway({
    store, content, projectView: (state) => builder.build(state),
    resolveContext: (envelope) => envelope.command.type === "CHOOSE_EVENT_OPTION" ? { actorBindings: { eventTarget: "npc:test:rescued-001" } } : {}
  });
  return { content, initialState, store, gateway };
}

function envelope(stateVersion, commandId, command) {
  return { commandId, playerId: "player-repair", runId: "run-repair", expectedStateVersion: stateVersion, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", clientPlatform: "dev", clientBuild: "repair-gate", command };
}

async function journey() {
  const value = setup(); const auth = { playerId: "player-repair" }; const selectionId = value.initialState.run.offer.innateProfiles[0].selectionId;
  const start = envelope(0, "cmd:repair:start", { type: "START_RUN", offerId: "offer-repair", selectionId });
  assert.equal((await value.gateway.sendCommand(auth, start)).ok, true);
  const action = envelope(1, "cmd:repair:action", { type: "CHOOSE_ACTION", actionId: "cultivate" });
  const actionResult = await value.gateway.sendCommand(auth, action); assert.equal(actionResult.ok, true);
  const afterAction = value.store.readRun("run-repair");
  assert.equal(afterAction.state.run.age, 23); assert.equal(afterAction.state.run.nodeIndex, 1); assert.equal(afterAction.state.run.events.current.eventId, "dev.first-choice");
  const directorDrawIndex = afterAction.state.run.rng.streams.director.drawIndex;
  assert.deepEqual(await value.gateway.sendCommand(auth, action), actionResult);
  assert.equal(value.store.readRun("run-repair").state.run.rng.streams.director.drawIndex, directorDrawIndex);
  const choice = envelope(2, "cmd:repair:choice", { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "rescue-stranger" });
  assert.equal((await value.gateway.sendCommand(auth, choice)).ok, true);
  const stored = value.store.readRun("run-repair"); const cause = Object.values(stored.state.run.causes.byId)[0];
  assert.equal(cause.actorIdsByRole.rescuedNpc, "npc:test:rescued-001"); assert.equal(cause.visibility, "hidden"); assert.equal(cause.state, "echoed"); assert.equal(cause.echoBudget, 0);
  assert.match(stored.state.run.events.current.eventId, /^dev\.rescue-echo-[ab]$/);
  const snapshot = createSnapshot(stored.state, stored.commandLog.entries.length);
  const replay = replayCommandLog({ initialState: value.initialState, commandLog: stored.commandLog, content: value.content });
  const resumed = replayCommandLog({ snapshot, commandLog: stored.commandLog, content: value.content });
  assert.equal(replay.finalRuleStateHash, ruleStateHash(stored.state)); assert.equal(resumed.finalRuleStateHash, replay.finalRuleStateHash);
  assert.deepEqual(replay.state.run.rng, stored.state.run.rng); assert.deepEqual(resumed.state.run.rng, stored.state.run.rng);
  const view = await value.gateway.fetchView(auth, "run-repair"); const serialized = JSON.stringify(view);
  for (const secret of ["repair-fixed-seed", cause.causeId, "rootSeed", "drawIndex", "difficulty", "EffectSpec", "echoBudget", "salience"]) assert.equal(serialized.includes(secret), false, secret);
  return { hash: replay.finalRuleStateHash, rng: replay.state.run.rng, eventId: replay.state.run.events.current.eventId, log: stored.commandLog, snapshot: stored.lastSnapshot };
}

test("Phase 1 Repair Gate: authoritative Gateway journey replays and projects safely", async () => {
  const first = await journey(); const second = await journey();
  assert.equal(first.hash, second.hash); assert.deepEqual(first.rng, second.rng); assert.equal(first.eventId, second.eventId);
  assert.equal(first.log.entries.length, 3); assert.equal(first.snapshot.commandSequence, 3);
});
