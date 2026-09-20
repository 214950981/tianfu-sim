import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_ERROR_CODES,
  CommandValidationError,
  createRngState,
  parseCommandEnvelope,
  serializeCommandEnvelope,
  validateCommandEnvelope,
  validateGameCommand
} from "../packages/core/src/index.ts";

function envelope(command = { type: "ABANDON_RUN" }) {
  return {
    commandId: "cmd-1", playerId: "player-1", runId: "run-1", expectedStateVersion: 0,
    rulesVersion: "2.0.0", contentVersion: "2.0.0", clientPlatform: "dev", clientBuild: "test", command
  };
}

test("CMD-001: every authoritative command schema accepts its exact shape", () => {
  const commands = [
    { type: "START_RUN", offerId: "o", destinyId: "d" },
    { type: "START_RUN", offerId: "o", selectionId: "s" },
    { type: "CHOOSE_ACTION", actionId: "pursuit", pursuitCauseId: "c" },
    { type: "ATTEMPT_BREAKTHROUGH" },
    { type: "CHOOSE_EVENT_OPTION", eventId: "e", optionId: "o" },
    { type: "EQUIP_TECHNIQUE", componentId: "t", slot: 0 },
    { type: "EQUIP_ARTIFACT", componentId: "a", slot: 1 },
    { type: "USE_ITEM", itemId: "i" }, { type: "TRAVEL", regionId: "r" },
    { type: "JOIN_FACTION", factionId: "f" }, { type: "LEAVE_FACTION", factionId: "f" },
    { type: "START_BREAKTHROUGH", targetRealmId: "r2" },
    { type: "CHOOSE_BREAKTHROUGH_OPTION", sessionId: "s", optionId: "o" },
    { type: "RESPOND_NPC", npcId: "n", intentId: "i" }, { type: "ABANDON_RUN" },
    { type: "CLAIM_META_UNLOCK", unlockId: "u" }
  ];
  for (const command of commands) assert.strictEqual(validateGameCommand(command), command);
  assert.deepEqual(APP_ERROR_CODES, ["INVALID_COMMAND", "INVALID_OPTION", "STATE_CONFLICT", "UNAUTHORIZED", "CONTENT_MISMATCH", "RUN_NOT_ACTIVE", "RUN_OFFER_MISMATCH", "TRANSIENT"]);
});

test("CMD-002: unknown and client-authoritative fields are rejected", () => {
  for (const forbidden of ["gold", "realm", "rank", "finalState"]) {
    const inCommand = envelope({ type: "ABANDON_RUN", [forbidden]: 1 });
    const inEnvelope = { ...envelope(), [forbidden]: 1 };
    for (const candidate of [inCommand, inEnvelope]) {
      assert.throws(() => validateCommandEnvelope(candidate), (error) => error instanceof CommandValidationError && error.code === "INVALID_COMMAND");
    }
  }
  assert.throws(() => validateGameCommand({ type: "UNKNOWN" }), CommandValidationError);
});

test("CMD-007: START_RUN requires offerId and exactly one offered selection field", () => {
  assert.throws(() => validateGameCommand({ type: "START_RUN", destinyId: "d" }), /offerId/);
  assert.throws(() => validateGameCommand({ type: "START_RUN", offerId: "o" }), /destinyId/);
  assert.doesNotThrow(() => validateGameCommand({ type: "START_RUN", offerId: "o", destinyId: "d" }));
  assert.doesNotThrow(() => validateGameCommand({ type: "START_RUN", offerId: "o", selectionId: "s" }));
  assert.throws(() => validateGameCommand({ type: "START_RUN", offerId: "o", destinyId: "d", selectionId: "s" }));
});

test("CMD-008: rejection is side-effect free and serialization deterministic", () => {
  const rng = createRngState("2.0.0", "unchanged");
  const rngSnapshot = structuredClone(rng);
  const invalid = envelope({ type: "ABANDON_RUN", gold: 99 });
  const invalidSnapshot = structuredClone(invalid);
  assert.throws(() => validateCommandEnvelope(invalid));
  assert.deepEqual(invalid, invalidSnapshot);
  assert.deepEqual(rng, rngSnapshot);

  const first = envelope({ type: "START_RUN", offerId: "o", destinyId: "d" });
  const second = { command: { destinyId: "d", offerId: "o", type: "START_RUN" }, clientBuild: "test", clientPlatform: "dev", contentVersion: "2.0.0", rulesVersion: "2.0.0", expectedStateVersion: 0, runId: "run-1", playerId: "player-1", commandId: "cmd-1" };
  assert.equal(serializeCommandEnvelope(first), serializeCommandEnvelope(second));
  assert.deepEqual(parseCommandEnvelope(serializeCommandEnvelope(first)), JSON.parse(serializeCommandEnvelope(first)));
});
