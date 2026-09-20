import { assertBps, assertSafeInteger, safeAdd, scaleSignedByBps } from "./numeric.ts";
import { drawInt, type RngTrace } from "./rng.ts";
import type { DeathCause, GameState } from "./state.ts";

export type OutcomeTier = "greatSuccess" | "success" | "costlySuccess" | "failure";
export interface EventSessionState { flags: Record<string, boolean>; counters: Record<string, number>; tags: string[] }
export interface CheckResolution {
  state: GameState;
  tier: OutcomeTier;
  baseScore: number;
  rngRoll: number;
  finalScore: number;
  rngDraws: RngTrace[];
}

export class EventRuntimeError extends Error {
  readonly kind: "INVALID_EVENT" | "INVALID_OPTION" | "UNSUPPORTED_EFFECT";
  constructor(kind: "INVALID_EVENT" | "INVALID_OPTION" | "UNSUPPORTED_EFFECT", message: string) {
    super(message);
    this.name = "EventRuntimeError";
    this.kind = kind;
  }
}

type ObjectValue = Record<string, unknown>;
const logicalPaths = new Set(["run.age", "run.maxAge", "realm.order", "realm.cultivation", "attr.insight", "attr.body", "attr.spiritSense", "attr.fortune", "resource.spiritStone", "identity.tags", "world.tags", "world.regionId"]);
const attributes = new Set(["insight", "body", "spiritSense", "fortune"]);
const relationAxes = new Set(["affinity", "trust", "debt"]);
const causeStates = new Set(["dormant", "eligible", "echoed", "resolved", "expired"]);
const sessionOps = new Set(["setSessionFlag", "adjustSessionCounter", "addSessionTag", "removeSessionTag"]);
const deferredOps = new Set(["RELATION_DELTA", "GRANT_COMPONENT", "REMOVE_COMPONENT", "CREATE_NPC", "SET_NPC_STATUS"]);

function fail(kind: EventRuntimeError["kind"], message: string): never { throw new EventRuntimeError(kind, message); }
function objectValue(value: unknown, path: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("INVALID_EVENT", `${path} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("INVALID_EVENT", `${path} must be a plain object`);
  return value as ObjectValue;
}
function exactKeys(value: ObjectValue, keys: readonly string[], path: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail("INVALID_EVENT", `${path} has unknown or missing fields`);
}
function tuple(value: unknown, min: number, max: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail("INVALID_EVENT", `${path} has invalid arity`);
  return value;
}
function stringValue(value: unknown, path: string): string { if (typeof value !== "string") fail("INVALID_EVENT", `${path} must be a string`); return value; }
function integer(value: unknown, path: string): number {
  if (typeof value !== "number") fail("INVALID_EVENT", `${path} must be a number`);
  try { assertSafeInteger(value, path); } catch { fail("INVALID_EVENT", `${path} must be a finite safe integer`); }
  return value;
}

export function resolveLogicalPath(state: GameState, path: string): unknown {
  if (!logicalPaths.has(path)) fail("INVALID_EVENT", `unknown logical path: ${path}`);
  switch (path) {
    case "run.age": return state.run.age;
    case "run.maxAge": return state.run.maxAge;
    case "realm.order": return state.run.realm.order;
    case "realm.cultivation": return state.run.realm.cultivation;
    case "attr.insight": return state.run.attributes.insight;
    case "attr.body": return state.run.attributes.body;
    case "attr.spiritSense": return state.run.attributes.spiritSense;
    case "attr.fortune": return state.run.attributes.fortune;
    case "resource.spiritStone": return state.run.resources.spiritStone;
    case "identity.tags": return state.run.identity.rootTags;
    case "world.tags": return state.run.world.tags;
    case "world.regionId": return state.run.world.regionId;
    default: return fail("INVALID_EVENT", `unknown logical path: ${path}`);
  }
}

export function evaluateCondition(value: unknown, state: GameState, depth = 0): boolean {
  if (depth > 32) fail("INVALID_EVENT", "condition nesting exceeds 32 levels");
  const condition = objectValue(value, "condition"); const keys = Object.keys(condition);
  if (keys.length !== 1) fail("INVALID_EVENT", "condition must contain exactly one operator");
  const op = keys[0]; const operand = condition[op];
  switch (op) {
    case "all": if (!Array.isArray(operand)) fail("INVALID_EVENT", "all must be an array"); return operand.every((entry) => evaluateCondition(entry, state, depth + 1));
    case "any": if (!Array.isArray(operand)) fail("INVALID_EVENT", "any must be an array"); return operand.some((entry) => evaluateCondition(entry, state, depth + 1));
    case "not": return !evaluateCondition(operand, state, depth + 1);
    case "eq": case "ne": {
      const pair = tuple(operand, 2, 2, op); const actual = resolveLogicalPath(state, stringValue(pair[0], `${op}[0]`));
      if (!["string", "number", "boolean"].includes(typeof pair[1])) fail("INVALID_EVENT", `${op}[1] must be scalar`);
      const equal = actual === pair[1]; return op === "eq" ? equal : !equal;
    }
    case "gte": case "lte": {
      const pair = tuple(operand, 2, 2, op); const actual = resolveLogicalPath(state, stringValue(pair[0], `${op}[0]`)); const expected = integer(pair[1], `${op}[1]`);
      if (typeof actual !== "number") fail("INVALID_EVENT", `${op} requires a numeric logical path`);
      return op === "gte" ? actual >= expected : actual <= expected;
    }
    case "hasTag": {
      const pair = tuple(operand, 2, 2, op); const path = stringValue(pair[0], "hasTag[0]");
      if (path !== "identity.tags" && path !== "world.tags") fail("INVALID_EVENT", "hasTag path is not allowed");
      return (resolveLogicalPath(state, path) as string[]).includes(stringValue(pair[1], "hasTag[1]"));
    }
    case "hasItem": { const pair = tuple(operand, 1, 2, op); const count = pair.length === 2 ? integer(pair[1], "hasItem[1]") : 1; if (count < 1) fail("INVALID_EVENT", "hasItem count must be positive"); return (state.run.resources.items[stringValue(pair[0], "hasItem[0]")] ?? 0) >= count; }
    case "buildTagGte": { const pair = tuple(operand, 2, 2, op); return (state.run.build.tagScores[stringValue(pair[0], "buildTagGte[0]")] ?? 0) >= integer(pair[1], "buildTagGte[1]"); }
    case "relationGte": case "relationLte": {
      const values = tuple(operand, 3, 3, op); const npcId = stringValue(values[0], `${op}[0]`); const axis = stringValue(values[1], `${op}[1]`);
      if (!relationAxes.has(axis)) fail("INVALID_EVENT", `unknown relation axis: ${axis}`);
      const relation = state.run.npcs.byId[npcId]?.relation[axis as "affinity" | "trust" | "debt"];
      if (relation === undefined) return false; const expected = integer(values[2], `${op}[2]`); return op === "relationGte" ? relation >= expected : relation <= expected;
    }
    case "causeStateIs": {
      const pair = tuple(operand, 2, 2, op); const cause = state.run.causes.byId[stringValue(pair[0], "causeStateIs[0]")]; const expected = stringValue(pair[1], "causeStateIs[1]");
      if (!causeStates.has(expected)) fail("INVALID_EVENT", `unknown cause state: ${expected}`); return cause?.state === expected;
    }
    case "npcStatusIs": { const pair = tuple(operand, 2, 2, op); return state.run.npcs.byId[stringValue(pair[0], "npcStatusIs[0]")]?.status === stringValue(pair[1], "npcStatusIs[1]"); }
    default: return fail("INVALID_EVENT", `unknown condition operator: ${op}`);
  }
}

export function resolveCheck(state: GameState, value: unknown): CheckResolution {
  const check = objectValue(value, "check");
  const allowed = new Set(["primary", "secondary", "secondaryWeightBps", "difficulty", "randomMin", "randomMax"]);
  for (const key of Object.keys(check)) if (!allowed.has(key)) fail("INVALID_EVENT", `check.${key} is not allowed`);
  for (const key of ["primary", "difficulty", "randomMin", "randomMax"]) if (!Object.hasOwn(check, key)) fail("INVALID_EVENT", `check.${key} is required`);
  const primaryKey = stringValue(check.primary, "check.primary"); if (!attributes.has(primaryKey)) fail("INVALID_EVENT", "invalid primary attribute");
  let secondary = 0;
  if (check.secondary !== undefined) { const key = stringValue(check.secondary, "check.secondary"); if (!attributes.has(key)) fail("INVALID_EVENT", "invalid secondary attribute"); secondary = state.run.attributes[key as keyof typeof state.run.attributes]; }
  const weight = check.secondaryWeightBps === undefined ? 5_000 : integer(check.secondaryWeightBps, "check.secondaryWeightBps");
  try { assertBps(weight, "secondaryWeightBps"); } catch { fail("INVALID_EVENT", "secondaryWeightBps must be 0..10000"); }
  const difficulty = integer(check.difficulty, "check.difficulty"); if (difficulty < 0 || difficulty > 1000) fail("INVALID_EVENT", "difficulty must be 0..1000");
  if (check.randomMin !== -10 || check.randomMax !== 10) fail("INVALID_EVENT", "check RNG range must be -10..10");
  const primary = state.run.attributes[primaryKey as keyof typeof state.run.attributes];
  const baseScore = safeAdd(primary, scaleSignedByBps(secondary, weight));
  const draw = drawInt(state.run.rng, "check", -10, 10);
  const finalScore = safeAdd(baseScore, draw.value);
  const tier = outcomeTierForScore(finalScore, difficulty);
  return { state: { ...state, run: { ...state.run, rng: draw.state } }, tier, baseScore, rngRoll: draw.value, finalScore, rngDraws: [...draw.trace] };
}

export function outcomeTierForScore(finalScore: number, difficulty: number): OutcomeTier {
  assertSafeInteger(finalScore, "finalScore"); assertSafeInteger(difficulty, "difficulty");
  if (difficulty < 0 || difficulty > 1000) throw new RangeError("difficulty must be 0..1000");
  return finalScore >= difficulty + 10 ? "greatSuccess" : finalScore >= difficulty ? "success" : finalScore >= difficulty - 10 ? "costlySuccess" : "failure";
}

export function resolveOutcome(outcomesValue: unknown, requestedTier: OutcomeTier): { outcome: ObjectValue; appliedTier: OutcomeTier } {
  const outcomes = objectValue(outcomesValue, "outcomes"); const success = objectValue(outcomes.success, "outcomes.success");
  if (requestedTier === "greatSuccess") return outcomes.greatSuccess === undefined ? { outcome: success, appliedTier: "success" } : { outcome: objectValue(outcomes.greatSuccess, "outcomes.greatSuccess"), appliedTier: "greatSuccess" };
  if (requestedTier === "success") return { outcome: success, appliedTier: "success" };
  if (requestedTier === "costlySuccess") return outcomes.costlySuccess === undefined ? { outcome: success, appliedTier: "success" } : { outcome: objectValue(outcomes.costlySuccess, "outcomes.costlySuccess"), appliedTier: "costlySuccess" };
  if (outcomes.failure !== undefined) return { outcome: objectValue(outcomes.failure, "outcomes.failure"), appliedTier: "failure" };
  if (outcomes.costlySuccess !== undefined) return { outcome: objectValue(outcomes.costlySuccess, "outcomes.costlySuccess"), appliedTier: "costlySuccess" };
  return { outcome: success, appliedTier: "success" };
}

export function isEventEligible(value: unknown, state: GameState): boolean {
  const event = objectValue(value, "event");
  if (event.requirements !== undefined && !evaluateCondition(event.requirements, state)) return false;
  if (event.cooldown === undefined) return true;
  const cooldown = objectValue(event.cooldown, "event.cooldown"); const eventId = stringValue(event.id, "event.id");
  const occurrences = state.run.events.history.filter((entry) => entry.eventId === eventId);
  if (cooldown.maxOccurrences !== undefined && occurrences.length >= integer(cooldown.maxOccurrences, "cooldown.maxOccurrences")) return false;
  if (cooldown.minNodesBetween !== undefined && occurrences.length > 0) {
    const lastNode = occurrences[occurrences.length - 1].nodeIndex;
    if (state.run.nodeIndex - lastNode <= integer(cooldown.minNodesBetween, "cooldown.minNodesBetween")) return false;
  }
  return true;
}

export function eligibleEvents(values: readonly unknown[], state: GameState): unknown[] {
  return values.filter((value) => isEventEligible(value, state));
}

export interface AppliedEventEffects { state: GameState; session: EventSessionState; publicEffects: ObjectValue[]; outcomeTimeDelta: number }

export function applyEventEffects(state: GameState, effectsValue: unknown, eventId: string): AppliedEventEffects {
  if (!Array.isArray(effectsValue)) fail("INVALID_EVENT", "outcome.effects must be an array");
  let next = state; let outcomeTimeDelta = 0;
  const session: EventSessionState = { flags: {}, counters: {}, tags: [] }; const publicEffects: ObjectValue[] = [];
  for (const value of effectsValue) {
    const effect = objectValue(value, "effect"); const op = stringValue(effect.op, "effect.op");
    if (deferredOps.has(op)) fail("UNSUPPORTED_EFFECT", `${op} is outside A08 execution scope`);
    switch (op) {
      case "ADD_RESOURCE": case "REMOVE_RESOURCE": {
        exactKeys(effect, ["op", "key", "amount"], "effect"); if (effect.key !== "spiritStone") fail("INVALID_EVENT", "unknown resource key"); const amount = integer(effect.amount, "effect.amount"); if (amount < 0) fail("INVALID_EVENT", "resource amount must be nonnegative");
        const delta = op === "ADD_RESOURCE" ? amount : -amount; const spiritStone = safeAdd(next.run.resources.spiritStone, delta); if (spiritStone < 0) fail("INVALID_OPTION", "insufficient spiritStone");
        next = { ...next, run: { ...next.run, resources: { ...next.run.resources, spiritStone } } }; break;
      }
      case "ADD_ITEM": case "REMOVE_ITEM": {
        exactKeys(effect, ["op", "itemId", "amount"], "effect"); const itemId = stringValue(effect.itemId, "effect.itemId"); const amount = integer(effect.amount, "effect.amount"); if (amount < 1) fail("INVALID_EVENT", "item amount must be positive");
        const current = next.run.resources.items[itemId] ?? 0; const count = safeAdd(current, op === "ADD_ITEM" ? amount : -amount); if (count < 0) fail("INVALID_OPTION", "insufficient item count"); const items = { ...next.run.resources.items }; if (count === 0) delete items[itemId]; else items[itemId] = count;
        next = { ...next, run: { ...next.run, resources: { ...next.run.resources, items } } }; break;
      }
      case "ADD_CULTIVATION": {
        exactKeys(effect, ["op", "amount"], "effect"); const cultivation = safeAdd(next.run.realm.cultivation, integer(effect.amount, "effect.amount")); if (cultivation < 0) fail("INVALID_OPTION", "cultivation cannot be negative"); next = { ...next, run: { ...next.run, realm: { ...next.run.realm, cultivation } } }; break;
      }
      case "ADD_CONDITION": {
        exactKeys(effect, ["op", "conditionId", "kind", "stacks"], "effect"); const conditionId = stringValue(effect.conditionId, "effect.conditionId"); if (next.run.conditions.some((entry) => entry.id === conditionId)) fail("INVALID_OPTION", "condition already exists");
        const kind = stringValue(effect.kind, "effect.kind") as GameState["run"]["conditions"][number]["kind"]; const stacks = integer(effect.stacks, "effect.stacks"); next = { ...next, run: { ...next.run, conditions: [...next.run.conditions, { id: conditionId, kind, stacks, sourceRef: eventId }] } }; break;
      }
      case "REMOVE_CONDITION": { exactKeys(effect, ["op", "conditionId"], "effect"); const id = stringValue(effect.conditionId, "effect.conditionId"); next = { ...next, run: { ...next.run, conditions: next.run.conditions.filter((entry) => entry.id !== id) } }; break; }
      case "ADD_IDENTITY_TAG": case "REMOVE_IDENTITY_TAG": case "ADD_WORLD_TAG": case "REMOVE_WORLD_TAG": {
        exactKeys(effect, ["op", "tag"], "effect"); const tag = stringValue(effect.tag, "effect.tag"); const identity = op.includes("IDENTITY"); const add = op.startsWith("ADD_"); const current = identity ? next.run.identity.rootTags : next.run.world.tags; const tags = add ? (current.includes(tag) ? [...current] : [...current, tag]) : current.filter((entry) => entry !== tag);
        next = identity ? { ...next, run: { ...next.run, identity: { ...next.run.identity, rootTags: tags } } } : { ...next, run: { ...next.run, world: { ...next.run.world, tags } } }; break;
      }
      case "SET_REGION": { exactKeys(effect, ["op", "regionId"], "effect"); next = { ...next, run: { ...next.run, world: { ...next.run.world, regionId: stringValue(effect.regionId, "effect.regionId") } } }; break; }
      case "OUTCOME_TIME_DELTA": { exactKeys(effect, ["op", "years"], "effect"); const years = integer(effect.years, "effect.years"); if (years < 0) fail("INVALID_EVENT", "time delta must be nonnegative"); outcomeTimeDelta = safeAdd(outcomeTimeDelta, years); break; }
      case "END_RUN": {
        const keys = effect.deathCause === undefined ? ["op", "endingId"] : ["op", "endingId", "deathCause"]; exactKeys(effect, keys, "effect");
        next = { ...next, run: { ...next.run, status: "ended", ending: { endingId: stringValue(effect.endingId, "effect.endingId"), ...(effect.deathCause === undefined ? {} : { deathCause: stringValue(effect.deathCause, "effect.deathCause") as DeathCause }), sourceRef: eventId, age: next.run.age, factIds: [] } } }; break;
      }
      case "ADD_CAUSE": case "RESOLVE_CAUSE": case "EXPIRE_CAUSE": break;
      case "setSessionFlag": { exactKeys(effect, ["op", "key", "value"], "effect"); const key = stringValue(effect.key, "effect.key"); if (typeof effect.value !== "boolean") fail("INVALID_EVENT", "session flag must be boolean"); session.flags[key] = effect.value; break; }
      case "adjustSessionCounter": { exactKeys(effect, ["op", "key", "delta"], "effect"); const key = stringValue(effect.key, "effect.key"); session.counters[key] = safeAdd(session.counters[key] ?? 0, integer(effect.delta, "effect.delta")); break; }
      case "addSessionTag": { exactKeys(effect, ["op", "tag"], "effect"); const tag = stringValue(effect.tag, "effect.tag"); if (!session.tags.includes(tag)) session.tags.push(tag); break; }
      case "removeSessionTag": { exactKeys(effect, ["op", "tag"], "effect"); const tag = stringValue(effect.tag, "effect.tag"); session.tags = session.tags.filter((entry) => entry !== tag); break; }
      default: fail("INVALID_EVENT", `unknown effect op: ${op}`);
    }
    publicEffects.push({ ...effect });
  }
  return { state: next, session, publicEffects, outcomeTimeDelta };
}

export function isSessionEffect(value: unknown): boolean { return sessionOps.has(stringValue(objectValue(value, "effect").op, "effect.op")); }

export function assertA08ExecutableChoice(value: unknown): void {
  const choice = objectValue(value, "choice"); const outcomes = objectValue(choice.outcomes, "choice.outcomes");
  for (const tier of ["greatSuccess", "success", "costlySuccess", "failure"]) {
    if (outcomes[tier] === undefined) continue;
    const outcome = objectValue(outcomes[tier], `choice.outcomes.${tier}`);
    if (!Array.isArray(outcome.effects)) fail("INVALID_EVENT", `choice.outcomes.${tier}.effects must be an array`);
    for (const effectValue of outcome.effects) {
      const op = stringValue(objectValue(effectValue, "effect").op, "effect.op");
      if (deferredOps.has(op)) fail("UNSUPPORTED_EFFECT", `${op} is outside A08 execution scope`);
    }
  }
}
