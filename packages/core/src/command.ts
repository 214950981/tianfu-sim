import { assertSafeInteger } from "./numeric.ts";
import type { ActionType } from "./state.ts";

export const APP_ERROR_CODES = [
  "INVALID_COMMAND",
  "INVALID_OPTION",
  "STATE_CONFLICT",
  "UNAUTHORIZED",
  "CONTENT_MISMATCH",
  "RUN_NOT_ACTIVE",
  "RUN_OFFER_MISMATCH",
  "TRANSIENT"
] as const;

export type AppErrorCode = typeof APP_ERROR_CODES[number];
export type ClientPlatform = "wechat" | "douyin" | "dev";
export type GameCommand =
  | { type: "START_RUN"; offerId: string; destinyId: string; selectionId?: never }
  | { type: "START_RUN"; offerId: string; selectionId: string; destinyId?: never }
  | { type: "CHOOSE_ACTION"; actionId: ActionType; pursuitCauseId?: string }
  | { type: "ATTEMPT_BREAKTHROUGH" }
  | { type: "CHOOSE_EVENT_OPTION"; eventId: string; optionId: string }
  | { type: "EQUIP_TECHNIQUE"; componentId: string; slot: number }
  | { type: "EQUIP_ARTIFACT"; componentId: string; slot: number }
  | { type: "USE_ITEM"; itemId: string }
  | { type: "TRAVEL"; regionId: string }
  | { type: "JOIN_FACTION"; factionId: string }
  | { type: "LEAVE_FACTION"; factionId: string }
  | { type: "START_BREAKTHROUGH"; targetRealmId: string }
  | { type: "CHOOSE_BREAKTHROUGH_OPTION"; sessionId: string; optionId: string }
  | { type: "RESPOND_NPC"; npcId: string; intentId: string }
  | { type: "ABANDON_RUN" }
  | { type: "CLAIM_META_UNLOCK"; unlockId: string };

export interface CommandEnvelope<T extends GameCommand = GameCommand> {
  commandId: string;
  playerId: string;
  runId: string;
  expectedStateVersion: number;
  rulesVersion: string;
  contentVersion: string;
  clientPlatform: ClientPlatform;
  clientBuild: string;
  issuedAtClient?: number;
  command: T;
}

export interface CommandResult<TPatch = unknown, TEffect = unknown, TNarrative = unknown> {
  ok: boolean;
  commandId: string;
  stateVersion: number;
  statePatch?: TPatch;
  domainEffects?: TEffect[];
  narrative?: TNarrative;
  error?: { code: AppErrorCode; messageKey: string; retryable: boolean };
}

export class CommandValidationError extends TypeError {
  readonly code = "INVALID_COMMAND" as const;
}

type ObjectValue = Record<string, unknown>;
const platforms = new Set(["wechat", "douyin", "dev"]);
const actionTypes = new Set<ActionType>(["cultivate", "travel", "worldly", "pursuit"]);

function fail(path: string, message: string): never {
  throw new CommandValidationError(`${path}: ${message}`);
}

function objectValue(value: unknown, path: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
  return value as ObjectValue;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

function safeInteger(value: unknown, path: string, minimum?: number): number {
  if (typeof value !== "number") fail(path, "must be a number");
  try { assertSafeInteger(value, path); } catch { fail(path, "must be a finite safe integer"); }
  if (minimum !== undefined && value < minimum) fail(path, `must be >= ${minimum}`);
  return value;
}

function exactFields(value: ObjectValue, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`command.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`command.${key}`, "is required");
}

function idFields(command: ObjectValue, type: string, fields: readonly string[]): void {
  exactFields(command, ["type", ...fields]);
  if (command.type !== type) fail("command.type", `must be ${type}`);
  for (const field of fields) stringValue(command[field], `command.${field}`);
}

export function validateGameCommand(value: unknown): GameCommand {
  const command = objectValue(value, "command");
  const type = stringValue(command.type, "command.type");
  switch (type) {
    case "START_RUN": {
      const hasDestiny = Object.hasOwn(command, "destinyId"); const hasSelection = Object.hasOwn(command, "selectionId");
      if (hasDestiny === hasSelection) fail("command", "must contain exactly one of destinyId or selectionId");
      idFields(command, type, ["offerId", hasSelection ? "selectionId" : "destinyId"]); break;
    }
    case "CHOOSE_ACTION": {
      exactFields(command, ["type", "actionId"], ["pursuitCauseId"]);
      const actionId = stringValue(command.actionId, "command.actionId") as ActionType;
      if (!actionTypes.has(actionId)) fail("command.actionId", "has an invalid value");
      if (command.pursuitCauseId !== undefined) stringValue(command.pursuitCauseId, "command.pursuitCauseId");
      break;
    }
    case "CHOOSE_EVENT_OPTION": idFields(command, type, ["eventId", "optionId"]); break;
    case "ATTEMPT_BREAKTHROUGH": exactFields(command, ["type"]); break;
    case "EQUIP_TECHNIQUE":
    case "EQUIP_ARTIFACT":
      exactFields(command, ["type", "componentId", "slot"]);
      stringValue(command.componentId, "command.componentId"); safeInteger(command.slot, "command.slot", 0);
      break;
    case "USE_ITEM": idFields(command, type, ["itemId"]); break;
    case "TRAVEL": idFields(command, type, ["regionId"]); break;
    case "JOIN_FACTION":
    case "LEAVE_FACTION": idFields(command, type, ["factionId"]); break;
    case "START_BREAKTHROUGH": idFields(command, type, ["targetRealmId"]); break;
    case "CHOOSE_BREAKTHROUGH_OPTION": idFields(command, type, ["sessionId", "optionId"]); break;
    case "RESPOND_NPC": idFields(command, type, ["npcId", "intentId"]); break;
    case "ABANDON_RUN": exactFields(command, ["type"]); break;
    case "CLAIM_META_UNLOCK": idFields(command, type, ["unlockId"]); break;
    default: fail("command.type", "has an invalid value");
  }
  return value as GameCommand;
}

export function validateCommandEnvelope(value: unknown): CommandEnvelope {
  const envelope = objectValue(value, "envelope");
  const required = ["commandId", "playerId", "runId", "expectedStateVersion", "rulesVersion", "contentVersion", "clientPlatform", "clientBuild", "command"];
  const optional = ["issuedAtClient"];
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(envelope)) if (!allowed.has(key)) fail(`envelope.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(envelope, key)) fail(`envelope.${key}`, "is required");
  for (const key of ["commandId", "playerId", "runId", "rulesVersion", "contentVersion", "clientBuild"] as const) stringValue(envelope[key], `envelope.${key}`);
  safeInteger(envelope.expectedStateVersion, "envelope.expectedStateVersion", 0);
  const platform = stringValue(envelope.clientPlatform, "envelope.clientPlatform");
  if (!platforms.has(platform)) fail("envelope.clientPlatform", "has an invalid value");
  if (envelope.issuedAtClient !== undefined) safeInteger(envelope.issuedAtClient, "envelope.issuedAtClient");
  validateGameCommand(envelope.command);
  return value as CommandEnvelope;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const source = value as ObjectValue;
  const target: ObjectValue = {};
  for (const key of Object.keys(source).sort()) target[key] = canonicalValue(source[key]);
  return target;
}

export function serializeCommandEnvelope(value: unknown): string {
  return JSON.stringify(canonicalValue(validateCommandEnvelope(value)));
}

export function parseCommandEnvelope(serialized: string): CommandEnvelope {
  if (typeof serialized !== "string") fail("serialized", "must be a string");
  try { return validateCommandEnvelope(JSON.parse(serialized)); }
  catch (error) {
    if (error instanceof CommandValidationError) throw error;
    throw new CommandValidationError("serialized: must contain valid JSON");
  }
}
