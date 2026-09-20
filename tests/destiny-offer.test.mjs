import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ContentRegistry } from "../packages/content/src/index.ts";
import { ReducerError, reduce, validateCommandEnvelope, validateGameCommand } from "../packages/core/src/index.ts";
import { generateServerDestinyOffer, projectDestinyOfferView } from "../server/src/index.ts";

const pack = JSON.parse(await readFile("packages/content/dev-fixtures/minimal-pack.json", "utf8"));

function registry() { const value = new ContentRegistry(); value.register(pack); return value; }
function serverInput(content = registry()) {
  return {
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "dev-0.1.0",
    runId: "run-destiny-1", playerId: "player-1", rootSeed: "destiny-root-1",
    metaView: { unlocks: [], entitlements: [], discoveries: [] }, content,
    fixture: {
      offerId: "offer-destiny-1", age: 16, maxAge: 100, runName: "Server Run",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 1, body: 1, spiritSense: 1, fortune: 1 },
      resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }, firstRun: true
    }
  };
}
function context(content) { return { rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", content, commandId: "cmd:destiny" }; }

test("destiny_golden: locked inputs produce the same three candidates and order", () => {
  const content = registry(); const input = serverInput(content);
  const first = generateServerDestinyOffer(input);
  const second = generateServerDestinyOffer({ ...input, metaView: structuredClone(input.metaView), fixture: structuredClone(input.fixture), content });
  const expected = ["destiny.hidden-mentor", "destiny.steady-foundation", "destiny.volatile-star"];
  assert.deepEqual(first.state.run.offer.destinyIds, expected);
  assert.deepEqual(second.state.run.offer.destinyIds, expected);
  assert.equal(first.state.run.offer.destinyIds.length, 3);
  assert.equal(first.state.run.rng.streams.offer.drawIndex, 3);
  assert.deepEqual(first.internalTrace.rngDraws.map(({ stream, index }) => ({ stream, index })), [
    { stream: "offer", index: 0 }, { stream: "offer", index: 1 }, { stream: "offer", index: 2 }
  ]);
});

test("invalid_destiny: stable failure changes no state, RNG, or time", () => {
  const content = registry(); const generated = generateServerDestinyOffer(serverInput(content)); const snapshot = structuredClone(generated.state);
  assert.throws(
    () => reduce({ state: generated.state, command: { type: "START_RUN", offerId: "offer-destiny-1", destinyId: "destiny.not-offered" }, context: context(content) }),
    (error) => error instanceof ReducerError && error.code === "INVALID_OPTION"
  );
  assert.deepEqual(generated.state, snapshot);
});

test("offer_consumed: START_RUN accepts one offered destiny exactly once", () => {
  const content = registry(); const state = generateServerDestinyOffer(serverInput(content)).state; const destinyId = state.run.offer.destinyIds[0];
  const active = reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId }, context: context(content) }).state;
  assert.equal(active.run.identity.destinyId, destinyId); assert.equal(active.run.status, "active"); assert.equal("offer" in active.run, false);
  assert.throws(() => reduce({ state: active, command: { type: "START_RUN", offerId: "offer-destiny-1", destinyId }, context: context(content) }), /offer_consumed/);
});

test("first_run_fixture: starter destinies cover required profiles and real tradeoffs/hooks", () => {
  assert.deepEqual(new Set(pack.destinies.map((destiny) => destiny.profile)), new Set(["stable", "high-variance", "story-hook"]));
  for (const destiny of pack.destinies) {
    assert.ok(destiny.advantage.amount > 0); assert.ok(destiny.cost.amount > 0);
    assert.ok(["world", "person"].includes(destiny.hook.kind));
  }
});

test("client cannot set rootSeed or request a free reroll", () => {
  const clientEnvelope = {
    commandId: "cmd", playerId: "player-1", runId: "run", expectedStateVersion: 0,
    rulesVersion: "2.0.0", contentVersion: "dev-0.1.0", clientPlatform: "dev", clientBuild: "test",
    rootSeed: "client-seed", command: { type: "START_RUN", offerId: "offer", destinyId: "d" }
  };
  assert.throws(() => validateCommandEnvelope(clientEnvelope));
  assert.throws(() => validateGameCommand({ type: "REROLL_DESTINY" }));
});

test("Offer View exposes candidates but no rootSeed or RNG internals", () => {
  const content = registry(); const state = generateServerDestinyOffer({ ...serverInput(content), platformNickname: "Ignored Nickname" }).state;
  const view = projectDestinyOfferView(state, content); const serialized = JSON.stringify(view);
  assert.equal(view.candidates.length, 3); assert.equal(view.runName, "Server Run");
  assert.equal(serialized.includes("rootSeed"), false); assert.equal(serialized.includes("\"rng\""), false); assert.equal(serialized.includes("destiny-root-1"), false);
});
