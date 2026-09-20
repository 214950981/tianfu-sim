import { assertSafeInteger } from "../../core/src/numeric.ts";
import { sha256Utf8 } from "../../core/src/sha256.ts";
import { ACTION_TYPES, type ActionType } from "../../core/src/state.ts";
import type { ProgressionPack } from "../../core/src/progression.ts";
import { getProgressionPack, validateProgressionPack } from "./progression-v1.ts";

export type LogicalPath =
  | "run.age" | "run.maxAge" | "realm.order" | "realm.cultivation"
  | "attr.insight" | "attr.body" | "attr.spiritSense" | "attr.fortune"
  | "resource.spiritStone" | "identity.tags" | "world.tags" | "world.regionId";
export type ConditionExpr =
  | { all: ConditionExpr[] } | { any: ConditionExpr[] } | { not: ConditionExpr }
  | { eq: [LogicalPath, string | number | boolean] } | { ne: [LogicalPath, string | number | boolean] }
  | { gte: [LogicalPath, number] } | { lte: [LogicalPath, number] }
  | { hasTag: ["identity.tags" | "world.tags", string] }
  | { hasItem: [string, number?] } | { buildTagGte: [string, number] }
  | { relationGte: [string, "affinity" | "trust" | "debt", number] }
  | { relationLte: [string, "affinity" | "trust" | "debt", number] }
  | { causeStateIs: [string, "dormant" | "eligible" | "echoed" | "resolved" | "expired"] }
  | { npcStatusIs: [string, string] };
export type EffectSpec =
  | { op: "ADD_RESOURCE" | "REMOVE_RESOURCE"; key: "spiritStone"; amount: number }
  | { op: "ADD_ITEM" | "REMOVE_ITEM"; itemId: string; amount: number }
  | { op: "ADD_CULTIVATION"; amount: number }
  | { op: "ADD_CONDITION"; conditionId: string; kind: string; stacks: number }
  | { op: "REMOVE_CONDITION"; conditionId: string }
  | { op: "ADD_IDENTITY_TAG" | "REMOVE_IDENTITY_TAG" | "ADD_WORLD_TAG" | "REMOVE_WORLD_TAG"; tag: string }
  | { op: "RELATION_DELTA"; npcId: string; axis: "affinity" | "trust" | "debt"; delta: number }
  | { op: "ADD_CAUSE"; templateId: string; salience: 1 | 2 | 3 | 4 | 5; visibility?: "hidden" | "hint" | "journal"; actorBindingKeys?: Record<string, string> }
  | { op: "RESOLVE_CAUSE" | "EXPIRE_CAUSE"; causeId: string }
  | { op: "GRANT_COMPONENT" | "REMOVE_COMPONENT"; componentId: string }
  | { op: "CREATE_NPC"; templateId: string }
  | { op: "SET_NPC_STATUS"; npcId: string; status: string }
  | { op: "SET_REGION"; regionId: string }
  | { op: "OUTCOME_TIME_DELTA"; years: number }
  | { op: "END_RUN"; endingId: string; deathCause?: string }
  | { op: "setSessionFlag"; key: string; value: boolean }
  | { op: "adjustSessionCounter"; key: string; delta: number }
  | { op: "addSessionTag" | "removeSessionTag"; tag: string };
export interface Transition { eventId: string; when?: ConditionExpr; priority?: number }
export interface Outcome { effects: EffectSpec[]; next?: Transition[]; fallbackKey?: string }
export interface OutcomeTable { greatSuccess?: Outcome; success: Outcome; costlySuccess?: Outcome; failure?: Outcome }
export interface CheckSpec { primary: "insight" | "body" | "spiritSense" | "fortune"; secondary?: "insight" | "body" | "spiritSense" | "fortune"; secondaryWeightBps?: number; difficulty: number; randomMin: -10; randomMax: 10 }
export interface ChoiceDefinition { id: string; scope: "core" | "tactical"; rhythmOnly?: boolean; labelKey: string; requirements?: ConditionExpr; check?: CheckSpec; outcomes: OutcomeTable; next?: Transition[] }
export interface EventDefinition {
  id: string; version: number; kind: "choice" | "narrative" | "combat" | "breakthrough" | "ending" | "tutorial";
  titleKey: string; tags: string[]; requirements?: ConditionExpr; weight: number;
  actionAffinity?: ActionType[];
  cooldown?: { minNodesBetween?: number; maxOccurrences?: number }; choices?: ChoiceDefinition[]; onEnter?: EffectSpec[];
  ai?: unknown; fallback: { titleKey?: string; bodyKey: string }; telemetry?: Record<string, string>;
}
export interface CauseActorRequirement { role: string; required: boolean }
export interface CauseTemplate {
  id: string; salience: 1 | 2 | 3 | 4 | 5;
  maturity: { minAgeDeltaYears?: number; minNodeDelta?: number; conditions?: ConditionExpr[] };
  actors: CauseActorRequirement[]; themes: string[]; linkedEventIds: string[];
  onActorUnavailable: { action: "expire" } | { action: "transform"; targetCauseTemplateId: string };
}
export interface DestinyDefinition {
  id: string;
  version: number;
  profile: "stable" | "high-variance" | "story-hook";
  titleKey: string;
  descriptionKey: string;
  advantage: { target: "insight" | "body" | "spiritSense" | "fortune" | "maxAge" | "spiritStone"; amount: number; labelKey: string };
  cost: { target: "insight" | "body" | "spiritSense" | "fortune" | "maxAge" | "spiritStone"; amount: number; labelKey: string };
  hook: { kind: "world" | "person"; refId: string; labelKey: string };
  requiredUnlocks?: string[];
}
export interface ContentManifest {
  schemaVersion: 2;
  packId: string;
  rulesVersion: string;
  contentVersion: string;
  checksum: string;
}
export interface ContentReferences {
  items: string[];
  components: string[];
  npcTemplates: string[];
  regions: string[];
  endings: string[];
  causes: string[];
  conditions: string[];
}
export interface ContentPack { manifest: ContentManifest; references: ContentReferences; destinies: DestinyDefinition[]; events: EventDefinition[]; causeTemplates: CauseTemplate[]; progressionPackId?: string }
export type ContentPackDraft = Omit<ContentPack, "manifest"> & { manifest: Omit<ContentManifest, "checksum"> };

export class ContentValidationError extends TypeError {
  readonly code = "INVALID_CONTENT" as const;
}

type ObjectValue = Record<string, unknown>;
type ReferenceSets = { [K in keyof ContentReferences]: Set<string> };
const logicalPaths = new Set(["run.age", "run.maxAge", "realm.order", "realm.cultivation", "attr.insight", "attr.body", "attr.spiritSense", "attr.fortune", "resource.spiritStone", "identity.tags", "world.tags", "world.regionId"]);
const attributes = new Set(["insight", "body", "spiritSense", "fortune"]);
const relationAxes = new Set(["affinity", "trust", "debt"]);
const causeStates = new Set(["dormant", "eligible", "echoed", "resolved", "expired"]);
const eventKinds = new Set(["choice", "narrative", "combat", "breakthrough", "ending", "tutorial"]);
const deathCauses = new Set(["lifespan", "combat", "ambush", "exploration", "poison", "curse", "breakthrough", "injury", "cause", "special"]);
const conditionKinds = new Set(["injury", "pillToxicity", "curse", "blessing", "pursued", "other"]);
const destinyProfiles = new Set(["stable", "high-variance", "story-hook"]);
const destinyTargets = new Set(["insight", "body", "spiritSense", "fortune", "maxAge", "spiritStone"]);
const actionTypes = new Set<string>(ACTION_TYPES);
const sessionOps = new Set(["setSessionFlag", "adjustSessionCounter", "addSessionTag", "removeSessionTag"]);
const longTermOps = new Set(["ADD_RESOURCE", "REMOVE_RESOURCE", "ADD_ITEM", "REMOVE_ITEM", "ADD_CULTIVATION", "ADD_CONDITION", "REMOVE_CONDITION", "ADD_IDENTITY_TAG", "REMOVE_IDENTITY_TAG", "ADD_WORLD_TAG", "REMOVE_WORLD_TAG", "RELATION_DELTA", "ADD_CAUSE", "RESOLVE_CAUSE", "EXPIRE_CAUSE", "GRANT_COMPONENT", "REMOVE_COMPONENT", "CREATE_NPC", "SET_NPC_STATUS", "SET_REGION", "OUTCOME_TIME_DELTA", "END_RUN"]);

function fail(path: string, message: string): never { throw new ContentValidationError(`${path}: ${message}`); }
function objectValue(value: unknown, path: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
  return value as ObjectValue;
}
function exact(value: ObjectValue, required: readonly string[], optional: readonly string[] = [], path = "value"): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
}
function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value;
}
function integer(value: unknown, path: string, min?: number, max?: number): number {
  if (typeof value !== "number") fail(path, "must be a number");
  try { assertSafeInteger(value, path); } catch { fail(path, "must be a finite safe integer"); }
  if (min !== undefined && value < min) fail(path, `must be >= ${min}`);
  if (max !== undefined && value > max) fail(path, `must be <= ${max}`);
  return value;
}
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) fail(path, "must be an array"); return value; }
function strings(value: unknown, path: string): string[] { return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`)); }
function oneOf(value: unknown, allowed: Set<string>, path: string): string { const result = stringValue(value, path); if (!allowed.has(result)) fail(path, "has an invalid value"); return result; }
function tuple(value: unknown, minLength: number, maxLength: number, path: string): unknown[] {
  const result = array(value, path);
  if (result.length < minLength || result.length > maxLength) fail(path, `must contain ${minLength}${minLength === maxLength ? "" : `..${maxLength}`} values`);
  return result;
}
function unique(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) { if (seen.has(value)) fail(path, `contains duplicate id ${value}`); seen.add(value); }
}
function jsonValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { integer(value, path); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => jsonValue(entry, `${path}[${index}]`)); return; }
  for (const [key, entry] of Object.entries(objectValue(value, path))) jsonValue(entry, `${path}.${key}`);
}

function validateCondition(value: unknown, path: string, depth = 0): void {
  if (depth > 32) fail(path, "nesting exceeds 32 levels");
  const condition = objectValue(value, path);
  const keys = Object.keys(condition);
  if (keys.length !== 1) fail(path, "must contain exactly one operator");
  const op = keys[0]; const operand = condition[op];
  switch (op) {
    case "all": case "any": array(operand, `${path}.${op}`).forEach((entry, index) => validateCondition(entry, `${path}.${op}[${index}]`, depth + 1)); break;
    case "not": validateCondition(operand, `${path}.not`, depth + 1); break;
    case "eq": case "ne": {
      const pair = tuple(operand, 2, 2, `${path}.${op}`); oneOf(pair[0], logicalPaths, `${path}.${op}[0]`);
      if (!["string", "number", "boolean"].includes(typeof pair[1])) fail(`${path}.${op}[1]`, "must be scalar");
      if (typeof pair[1] === "number") integer(pair[1], `${path}.${op}[1]`);
      break;
    }
    case "gte": case "lte": { const pair = tuple(operand, 2, 2, `${path}.${op}`); oneOf(pair[0], logicalPaths, `${path}.${op}[0]`); integer(pair[1], `${path}.${op}[1]`); break; }
    case "hasTag": { const pair = tuple(operand, 2, 2, `${path}.hasTag`); oneOf(pair[0], new Set(["identity.tags", "world.tags"]), `${path}.hasTag[0]`); stringValue(pair[1], `${path}.hasTag[1]`); break; }
    case "hasItem": { const pair = tuple(operand, 1, 2, `${path}.hasItem`); stringValue(pair[0], `${path}.hasItem[0]`); if (pair.length === 2) integer(pair[1], `${path}.hasItem[1]`, 1); break; }
    case "buildTagGte": { const pair = tuple(operand, 2, 2, `${path}.buildTagGte`); stringValue(pair[0], `${path}.buildTagGte[0]`); integer(pair[1], `${path}.buildTagGte[1]`); break; }
    case "relationGte": case "relationLte": { const values = tuple(operand, 3, 3, `${path}.${op}`); stringValue(values[0], `${path}.${op}[0]`); oneOf(values[1], relationAxes, `${path}.${op}[1]`); integer(values[2], `${path}.${op}[2]`); break; }
    case "causeStateIs": { const pair = tuple(operand, 2, 2, `${path}.causeStateIs`); stringValue(pair[0], `${path}.causeStateIs[0]`); oneOf(pair[1], causeStates, `${path}.causeStateIs[1]`); break; }
    case "npcStatusIs": { const pair = tuple(operand, 2, 2, `${path}.npcStatusIs`); stringValue(pair[0], `${path}.npcStatusIs[0]`); stringValue(pair[1], `${path}.npcStatusIs[1]`); break; }
    default: fail(path, `unknown condition operator ${op}`);
  }
}

function requireReference(id: unknown, set: Set<string>, path: string): string {
  const result = stringValue(id, path);
  if (!set.has(result)) fail(path, `unknown reference ${result}`);
  return result;
}

function validateEffect(value: unknown, refs: ReferenceSets, path: string): string {
  const effect = objectValue(value, path); const op = stringValue(effect.op, `${path}.op`);
  switch (op) {
    case "ADD_RESOURCE": case "REMOVE_RESOURCE": exact(effect, ["op", "key", "amount"], [], path); if (effect.key !== "spiritStone") fail(`${path}.key`, "must be spiritStone"); integer(effect.amount, `${path}.amount`, 0); break;
    case "ADD_ITEM": case "REMOVE_ITEM": exact(effect, ["op", "itemId", "amount"], [], path); requireReference(effect.itemId, refs.items, `${path}.itemId`); integer(effect.amount, `${path}.amount`, 1); break;
    case "ADD_CULTIVATION": exact(effect, ["op", "amount"], [], path); integer(effect.amount, `${path}.amount`); break;
    case "ADD_CONDITION": exact(effect, ["op", "conditionId", "kind", "stacks"], [], path); requireReference(effect.conditionId, refs.conditions, `${path}.conditionId`); oneOf(effect.kind, conditionKinds, `${path}.kind`); integer(effect.stacks, `${path}.stacks`, 0, 3); break;
    case "REMOVE_CONDITION": exact(effect, ["op", "conditionId"], [], path); requireReference(effect.conditionId, refs.conditions, `${path}.conditionId`); break;
    case "ADD_IDENTITY_TAG": case "REMOVE_IDENTITY_TAG": case "ADD_WORLD_TAG": case "REMOVE_WORLD_TAG": exact(effect, ["op", "tag"], [], path); stringValue(effect.tag, `${path}.tag`); break;
    case "RELATION_DELTA": exact(effect, ["op", "npcId", "axis", "delta"], [], path); stringValue(effect.npcId, `${path}.npcId`); oneOf(effect.axis, relationAxes, `${path}.axis`); integer(effect.delta, `${path}.delta`); break;
    case "ADD_CAUSE": exact(effect, ["op", "templateId", "salience"], ["visibility", "actorBindingKeys"], path); requireReference(effect.templateId, refs.causes, `${path}.templateId`); integer(effect.salience, `${path}.salience`, 1, 5); if (effect.visibility !== undefined) oneOf(effect.visibility, new Set(["hidden", "hint", "journal"]), `${path}.visibility`); if (effect.actorBindingKeys !== undefined) for (const [role, slot] of Object.entries(objectValue(effect.actorBindingKeys, `${path}.actorBindingKeys`))) { stringValue(role, `${path}.actorBindingKeys role`); stringValue(slot, `${path}.actorBindingKeys.${role}`); } break;
    case "RESOLVE_CAUSE": case "EXPIRE_CAUSE": exact(effect, ["op", "causeId"], [], path); stringValue(effect.causeId, `${path}.causeId`); break;
    case "GRANT_COMPONENT": case "REMOVE_COMPONENT": exact(effect, ["op", "componentId"], [], path); requireReference(effect.componentId, refs.components, `${path}.componentId`); break;
    case "CREATE_NPC": exact(effect, ["op", "templateId"], [], path); requireReference(effect.templateId, refs.npcTemplates, `${path}.templateId`); break;
    case "SET_NPC_STATUS": exact(effect, ["op", "npcId", "status"], [], path); stringValue(effect.npcId, `${path}.npcId`); stringValue(effect.status, `${path}.status`); break;
    case "SET_REGION": exact(effect, ["op", "regionId"], [], path); requireReference(effect.regionId, refs.regions, `${path}.regionId`); break;
    case "OUTCOME_TIME_DELTA": exact(effect, ["op", "years"], [], path); integer(effect.years, `${path}.years`, 0); break;
    case "END_RUN": exact(effect, ["op", "endingId"], ["deathCause"], path); requireReference(effect.endingId, refs.endings, `${path}.endingId`); if (effect.deathCause !== undefined) oneOf(effect.deathCause, deathCauses, `${path}.deathCause`); break;
    case "setSessionFlag": exact(effect, ["op", "key", "value"], [], path); stringValue(effect.key, `${path}.key`); if (typeof effect.value !== "boolean") fail(`${path}.value`, "must be a boolean"); break;
    case "adjustSessionCounter": exact(effect, ["op", "key", "delta"], [], path); stringValue(effect.key, `${path}.key`); integer(effect.delta, `${path}.delta`); break;
    case "addSessionTag": case "removeSessionTag": exact(effect, ["op", "tag"], [], path); stringValue(effect.tag, `${path}.tag`); break;
    default: fail(`${path}.op`, `unknown effect ${op}`);
  }
  return op;
}

function validateTransition(value: unknown, eventIds: Set<string>, path: string): void {
  const transition = objectValue(value, path); exact(transition, ["eventId"], ["when", "priority"], path);
  requireReference(transition.eventId, eventIds, `${path}.eventId`);
  if (transition.when !== undefined) validateCondition(transition.when, `${path}.when`);
  if (transition.priority !== undefined) integer(transition.priority, `${path}.priority`);
}

function validateOutcome(value: unknown, refs: ReferenceSets, eventIds: Set<string>, path: string): Set<string> {
  const outcome = objectValue(value, path); exact(outcome, ["effects"], ["next", "fallbackKey"], path);
  const ops = new Set(array(outcome.effects, `${path}.effects`).map((effect, index) => validateEffect(effect, refs, `${path}.effects[${index}]`)));
  if (outcome.next !== undefined) array(outcome.next, `${path}.next`).forEach((entry, index) => validateTransition(entry, eventIds, `${path}.next[${index}]`));
  if (outcome.fallbackKey !== undefined) stringValue(outcome.fallbackKey, `${path}.fallbackKey`);
  return ops;
}

function validateChoice(value: unknown, refs: ReferenceSets, eventIds: Set<string>, currentEventId: string, path: string): string {
  const choice = objectValue(value, path); exact(choice, ["id", "scope", "labelKey", "outcomes"], ["rhythmOnly", "requirements", "check", "next"], path);
  const id = stringValue(choice.id, `${path}.id`); const scope = oneOf(choice.scope, new Set(["core", "tactical"]), `${path}.scope`);
  if (choice.rhythmOnly !== undefined && typeof choice.rhythmOnly !== "boolean") fail(`${path}.rhythmOnly`, "must be a boolean");
  const rhythmOnly = choice.rhythmOnly === true;
  if (scope === "tactical" && rhythmOnly) fail(`${path}.rhythmOnly`, "is allowed only for core choices");
  stringValue(choice.labelKey, `${path}.labelKey`); if (choice.requirements !== undefined) validateCondition(choice.requirements, `${path}.requirements`);
  if (choice.check !== undefined) {
    const check = objectValue(choice.check, `${path}.check`); exact(check, ["primary", "difficulty", "randomMin", "randomMax"], ["secondary", "secondaryWeightBps"], `${path}.check`);
    oneOf(check.primary, attributes, `${path}.check.primary`); if (check.secondary !== undefined) oneOf(check.secondary, attributes, `${path}.check.secondary`);
    integer(check.difficulty, `${path}.check.difficulty`, 0, 1000);
    if (check.secondaryWeightBps !== undefined) integer(check.secondaryWeightBps, `${path}.check.secondaryWeightBps`, 0, 10_000);
    if (check.randomMin !== -10 || check.randomMax !== 10) fail(`${path}.check`, "random range must be -10..10");
  }
  const outcomes = objectValue(choice.outcomes, `${path}.outcomes`); exact(outcomes, ["success"], ["greatSuccess", "costlySuccess", "failure"], `${path}.outcomes`);
  const ops = new Set<string>();
  for (const key of ["greatSuccess", "success", "costlySuccess", "failure"] as const) if (outcomes[key] !== undefined) for (const op of validateOutcome(outcomes[key], refs, eventIds, `${path}.outcomes.${key}`)) ops.add(op);
  if (scope === "core" && !rhythmOnly && ![...ops].some((op) => longTermOps.has(op))) fail(path, "core choice must change a long-term dimension");
  const choiceNext = choice.next === undefined ? [] : array(choice.next, `${path}.next`);
  choiceNext.forEach((entry, index) => validateTransition(entry, eventIds, `${path}.next[${index}]`));
  const hasDifferentNext = choiceNext.some((entry) => objectValue(entry, `${path}.next`).eventId !== currentEventId);
  if (scope === "core") {
    if ([...ops].some((op) => sessionOps.has(op))) fail(path, "core choice cannot use tactical session-local effects");
    if (rhythmOnly && !hasDifferentNext) fail(path, "rhythm-only core choice requires a next transition to a different event");
  } else {
    if ([...ops].some((op) => !sessionOps.has(op))) fail(path, "tactical choice can use only session-local effects");
    const meaningful = [...ops].some((op) => sessionOps.has(op)) || choice.check !== undefined || hasDifferentNext;
    if (!meaningful) fail(path, "tactical choice must be meaningful");
  }
  return id;
}

function referenceSets(value: unknown): ReferenceSets {
  const refs = objectValue(value, "pack.references");
  const keys: Array<keyof ContentReferences> = ["items", "components", "npcTemplates", "regions", "endings", "causes", "conditions"];
  exact(refs, keys, [], "pack.references");
  const result = {} as ReferenceSets;
  for (const key of keys) { const values = strings(refs[key], `pack.references.${key}`); unique(values, `pack.references.${key}`); result[key] = new Set(values); }
  return result;
}

function validateEvent(value: unknown, refs: ReferenceSets, eventIds: Set<string>, path: string): void {
  const event = objectValue(value, path);
  exact(event, ["id", "version", "kind", "titleKey", "tags", "weight", "fallback"], ["requirements", "actionAffinity", "cooldown", "choices", "onEnter", "ai", "telemetry"], path);
  stringValue(event.id, `${path}.id`); integer(event.version, `${path}.version`, 1); oneOf(event.kind, eventKinds, `${path}.kind`); stringValue(event.titleKey, `${path}.titleKey`);
  const tags = strings(event.tags, `${path}.tags`); unique(tags, `${path}.tags`); integer(event.weight, `${path}.weight`, 0);
  if (event.actionAffinity !== undefined) { const affinities = strings(event.actionAffinity, `${path}.actionAffinity`); unique(affinities, `${path}.actionAffinity`); affinities.forEach((action, index) => oneOf(action, actionTypes, `${path}.actionAffinity[${index}]`)); }
  if (event.requirements !== undefined) validateCondition(event.requirements, `${path}.requirements`);
  if (event.cooldown !== undefined) { const cooldown = objectValue(event.cooldown, `${path}.cooldown`); exact(cooldown, [], ["minNodesBetween", "maxOccurrences"], `${path}.cooldown`); if (cooldown.minNodesBetween !== undefined) integer(cooldown.minNodesBetween, `${path}.cooldown.minNodesBetween`, 0); if (cooldown.maxOccurrences !== undefined) integer(cooldown.maxOccurrences, `${path}.cooldown.maxOccurrences`, 1); }
  if (event.choices !== undefined) { const ids = array(event.choices, `${path}.choices`).map((choice, index) => validateChoice(choice, refs, eventIds, event.id as string, `${path}.choices[${index}]`)); unique(ids, `${path}.choices`); }
  if (event.onEnter !== undefined) array(event.onEnter, `${path}.onEnter`).forEach((effect, index) => validateEffect(effect, refs, `${path}.onEnter[${index}]`));
  if (event.ai !== undefined) jsonValue(event.ai, `${path}.ai`);
  const fallback = objectValue(event.fallback, `${path}.fallback`); exact(fallback, ["bodyKey"], ["titleKey"], `${path}.fallback`); stringValue(fallback.bodyKey, `${path}.fallback.bodyKey`); if (fallback.titleKey !== undefined) stringValue(fallback.titleKey, `${path}.fallback.titleKey`);
  if (event.telemetry !== undefined) for (const [key, entry] of Object.entries(objectValue(event.telemetry, `${path}.telemetry`))) stringValue(entry, `${path}.telemetry.${key}`);
}

function validateCauseTemplate(value: unknown, refs: ReferenceSets, eventIds: Set<string>, path: string): void {
  const template = objectValue(value, path); exact(template, ["id", "salience", "maturity", "actors", "themes", "linkedEventIds", "onActorUnavailable"], [], path);
  requireReference(template.id, refs.causes, `${path}.id`); integer(template.salience, `${path}.salience`, 1, 5);
  const maturity = objectValue(template.maturity, `${path}.maturity`); exact(maturity, [], ["minAgeDeltaYears", "minNodeDelta", "conditions"], `${path}.maturity`);
  if (maturity.minAgeDeltaYears !== undefined) integer(maturity.minAgeDeltaYears, `${path}.maturity.minAgeDeltaYears`, 0);
  if (maturity.minNodeDelta !== undefined) integer(maturity.minNodeDelta, `${path}.maturity.minNodeDelta`, 0);
  if (maturity.conditions !== undefined) array(maturity.conditions, `${path}.maturity.conditions`).forEach((condition, index) => validateCondition(condition, `${path}.maturity.conditions[${index}]`));
  const roles = array(template.actors, `${path}.actors`).map((entry, index) => { const actor = objectValue(entry, `${path}.actors[${index}]`); exact(actor, ["role", "required"], [], `${path}.actors[${index}]`); const role = stringValue(actor.role, `${path}.actors[${index}].role`); if (typeof actor.required !== "boolean") fail(`${path}.actors[${index}].required`, "must be a boolean"); return role; }); unique(roles, `${path}.actors`);
  const themes = strings(template.themes, `${path}.themes`); unique(themes, `${path}.themes`);
  const linked = strings(template.linkedEventIds, `${path}.linkedEventIds`); unique(linked, `${path}.linkedEventIds`); linked.forEach((id, index) => requireReference(id, eventIds, `${path}.linkedEventIds[${index}]`));
  const unavailable = objectValue(template.onActorUnavailable, `${path}.onActorUnavailable`); const action = oneOf(unavailable.action, new Set(["expire", "transform"]), `${path}.onActorUnavailable.action`);
  exact(unavailable, ["action"], action === "transform" ? ["targetCauseTemplateId"] : [], `${path}.onActorUnavailable`);
  if (action === "transform") requireReference(unavailable.targetCauseTemplateId, refs.causes, `${path}.onActorUnavailable.targetCauseTemplateId`);
}

function effectLists(event: EventDefinition): EffectSpec[][] {
  const lists: EffectSpec[][] = event.onEnter === undefined ? [] : [event.onEnter];
  for (const choice of event.choices ?? []) for (const tier of [choice.outcomes.greatSuccess, choice.outcomes.success, choice.outcomes.costlySuccess, choice.outcomes.failure]) if (tier !== undefined) lists.push(tier.effects);
  return lists;
}

function validateCauseBindings(events: EventDefinition[], templates: Map<string, CauseTemplate>): void {
  for (const event of events) for (const effects of effectLists(event)) for (const effect of effects) if (effect.op === "ADD_CAUSE") {
    const template = templates.get(effect.templateId); if (template === undefined) fail("effect.templateId", `unknown CauseTemplate ${effect.templateId}`);
    if (effect.salience !== template.salience) fail("effect.salience", "must match CauseTemplate salience");
    const roles = new Set(template.actors.map((actor) => actor.role));
    for (const role of Object.keys(effect.actorBindingKeys ?? {})) if (!roles.has(role)) fail(`effect.actorBindingKeys.${role}`, "unknown CauseTemplate role");
    for (const actor of template.actors) if (actor.required && (effect.actorBindingKeys?.[actor.role] === undefined || effect.actorBindingKeys[actor.role].length === 0)) fail(`effect.actorBindingKeys.${actor.role}`, "required actor binding is missing");
  }
}

function validateDestiny(value: unknown, refs: ReferenceSets, path: string): void {
  const destiny = objectValue(value, path);
  exact(destiny, ["id", "version", "profile", "titleKey", "descriptionKey", "advantage", "cost", "hook"], ["requiredUnlocks"], path);
  stringValue(destiny.id, `${path}.id`); integer(destiny.version, `${path}.version`, 1); oneOf(destiny.profile, destinyProfiles, `${path}.profile`);
  stringValue(destiny.titleKey, `${path}.titleKey`); stringValue(destiny.descriptionKey, `${path}.descriptionKey`);
  for (const key of ["advantage", "cost"] as const) {
    const modifier = objectValue(destiny[key], `${path}.${key}`); exact(modifier, ["target", "amount", "labelKey"], [], `${path}.${key}`);
    oneOf(modifier.target, destinyTargets, `${path}.${key}.target`); integer(modifier.amount, `${path}.${key}.amount`, 1); stringValue(modifier.labelKey, `${path}.${key}.labelKey`);
  }
  const hook = objectValue(destiny.hook, `${path}.hook`); exact(hook, ["kind", "refId", "labelKey"], [], `${path}.hook`);
  const kind = oneOf(hook.kind, new Set(["world", "person"]), `${path}.hook.kind`);
  requireReference(hook.refId, kind === "world" ? refs.regions : refs.npcTemplates, `${path}.hook.refId`); stringValue(hook.labelKey, `${path}.hook.labelKey`);
  if (destiny.requiredUnlocks !== undefined) { const unlocks = strings(destiny.requiredUnlocks, `${path}.requiredUnlocks`); unique(unlocks, `${path}.requiredUnlocks`); }
}

function normalizedDraft(pack: ContentPack | ContentPackDraft): unknown {
  const manifest = { schemaVersion: pack.manifest.schemaVersion, packId: pack.manifest.packId, rulesVersion: pack.manifest.rulesVersion, contentVersion: pack.manifest.contentVersion };
  const references = Object.fromEntries(Object.entries(pack.references).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, [...values].sort()]));
  const destinies = [...pack.destinies].sort((left, right) => left.id.localeCompare(right.id));
  const events = [...pack.events].sort((left, right) => left.id.localeCompare(right.id));
  const causeTemplates = [...pack.causeTemplates].sort((left, right) => left.id.localeCompare(right.id));
  return { manifest, references, destinies, events, causeTemplates, ...(pack.progressionPackId === undefined ? {} : { progressionPackId: pack.progressionPackId }) };
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const source = value as ObjectValue; const result: ObjectValue = {};
  for (const key of Object.keys(source).sort()) result[key] = canonicalValue(source[key]);
  return result;
}
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

export function canonicalPackJson(pack: ContentPack | ContentPackDraft): string { return JSON.stringify(canonicalValue(normalizedDraft(pack))); }
export function computePackChecksum(pack: ContentPack | ContentPackDraft): string { return hex(sha256Utf8(canonicalPackJson(pack))); }
export function sealContentPack(pack: ContentPackDraft): ContentPack {
  return { ...pack, manifest: { ...pack.manifest, checksum: computePackChecksum(pack) } };
}

export function validateContentPack(value: unknown, expectedContentVersion?: string): ContentPack {
  const pack = objectValue(value, "pack"); exact(pack, ["manifest", "references", "destinies", "events", "causeTemplates"], ["progressionPackId"], "pack");
  const manifest = objectValue(pack.manifest, "pack.manifest"); exact(manifest, ["schemaVersion", "packId", "rulesVersion", "contentVersion", "checksum"], [], "pack.manifest");
  if (manifest.schemaVersion !== 2) fail("pack.manifest.schemaVersion", "must be 2");
  stringValue(manifest.packId, "pack.manifest.packId"); stringValue(manifest.rulesVersion, "pack.manifest.rulesVersion");
  const contentVersion = stringValue(manifest.contentVersion, "pack.manifest.contentVersion");
  if (expectedContentVersion !== undefined && contentVersion !== expectedContentVersion) fail("pack.manifest.contentVersion", "does not match the locked contentVersion");
  const checksum = stringValue(manifest.checksum, "pack.manifest.checksum"); if (!/^[0-9a-f]{64}$/.test(checksum)) fail("pack.manifest.checksum", "must be lowercase SHA-256");
  if (pack.progressionPackId !== undefined) { const progression = validateProgressionPack(getProgressionPack(stringValue(pack.progressionPackId, "pack.progressionPackId"))); if (progression.rulesVersion !== manifest.rulesVersion) fail("pack.progressionPackId", "rulesVersion mismatch"); }
  const refs = referenceSets(pack.references);
  const destinies = array(pack.destinies, "pack.destinies"); const destinyIds = destinies.map((destiny, index) => stringValue(objectValue(destiny, `pack.destinies[${index}]`).id, `pack.destinies[${index}].id`)); unique(destinyIds, "pack.destinies");
  destinies.forEach((destiny, index) => validateDestiny(destiny, refs, `pack.destinies[${index}]`));
  const events = array(pack.events, "pack.events"); const eventIds = events.map((event, index) => stringValue(objectValue(event, `pack.events[${index}]`).id, `pack.events[${index}].id`)); unique(eventIds, "pack.events");
  const eventIdSet = new Set(eventIds); events.forEach((event, index) => validateEvent(event, refs, eventIdSet, `pack.events[${index}]`));
  const templates = array(pack.causeTemplates, "pack.causeTemplates"); const templateIds = templates.map((template, index) => stringValue(objectValue(template, `pack.causeTemplates[${index}]`).id, `pack.causeTemplates[${index}].id`)); unique(templateIds, "pack.causeTemplates");
  if (templateIds.length !== refs.causes.size || templateIds.some((id) => !refs.causes.has(id))) fail("pack.causeTemplates", "must define every Cause reference exactly once");
  templates.forEach((template, index) => validateCauseTemplate(template, refs, eventIdSet, `pack.causeTemplates[${index}]`));
  const templateMap = new Map((templates as CauseTemplate[]).map((template) => [template.id, template]));
  const causeLinkedEventIds = new Set([...templateMap.values()].flatMap((template) => template.linkedEventIds));
  if (!(events as EventDefinition[]).some((event) => (event.actionAffinity?.length ?? 0) === 0 && !causeLinkedEventIds.has(event.id))) fail("pack.events", "playable pack requires an ordinary fallback Event that is not Cause-linked");
  for (const template of templateMap.values()) if (template.onActorUnavailable.action === "transform") {
    const target = templateMap.get(template.onActorUnavailable.targetCauseTemplateId); if (target === undefined) fail(`pack.causeTemplates.${template.id}`, "transform target is undefined");
    const sourceRequired = new Set(template.actors.filter((actor) => actor.required).map((actor) => actor.role));
    for (const actor of target.actors) if (actor.required && !sourceRequired.has(actor.role)) fail(`pack.causeTemplates.${template.id}`, `transform cannot bind required target role ${actor.role}`);
  }
  validateCauseBindings(events as EventDefinition[], templateMap);
  if (computePackChecksum(value as ContentPack) !== checksum) fail("pack.manifest.checksum", "does not match canonical content");
  return value as ContentPack;
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreeze)) as T;
  if (typeof value !== "object" || value === null) return value;
  const result: ObjectValue = {}; for (const [key, entry] of Object.entries(value as ObjectValue)) result[key] = cloneAndFreeze(entry);
  return Object.freeze(result) as T;
}

export class ContentRegistry {
  readonly #byVersion = new Map<string, ContentPack>();
  register(value: unknown): ContentPack {
    const validated = validateContentPack(value); const stored = cloneAndFreeze(validated);
    const existing = this.#byVersion.get(stored.manifest.contentVersion);
    if (existing !== undefined && existing.manifest.checksum !== stored.manifest.checksum) fail("pack.manifest.contentVersion", "is already registered with different content");
    if (existing === undefined) this.#byVersion.set(stored.manifest.contentVersion, stored);
    return existing ?? stored;
  }
  get(contentVersion: string): ContentPack {
    const pack = this.#byVersion.get(contentVersion); if (pack === undefined) fail("contentVersion", `is not registered: ${contentVersion}`); return pack;
  }
  getEvent(contentVersion: string, eventId: string): EventDefinition {
    const event = this.get(contentVersion).events.find((candidate) => candidate.id === eventId); if (event === undefined) fail("eventId", `is not registered: ${eventId}`); return event;
  }
  getDestiny(contentVersion: string, destinyId: string): DestinyDefinition {
    const destiny = this.get(contentVersion).destinies.find((candidate) => candidate.id === destinyId); if (destiny === undefined) fail("destinyId", `is not registered: ${destinyId}`); return destiny;
  }
  getCauseTemplate(contentVersion: string, templateId: string): CauseTemplate {
    const template = this.get(contentVersion).causeTemplates.find((candidate) => candidate.id === templateId); if (template === undefined) fail("templateId", `is not registered: ${templateId}`); return template;
  }
  getProgression(contentVersion: string): ProgressionPack {
    const id = this.get(contentVersion).progressionPackId; if (id === undefined) fail("progressionPackId", "is not configured for contentVersion"); return getProgressionPack(id);
  }
}
