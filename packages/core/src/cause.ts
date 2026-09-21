import { evaluateCondition, isEventEligible, type EventRuntimeError } from "./event.ts";
import { safeAdd } from "./numeric.ts";
import { drawInt, type RngTrace } from "./rng.ts";
import type { CauseInstance, GameState } from "./state.ts";

export interface CauseActorRequirement { role: string; required: boolean }
export interface CauseTemplate {
  id: string; salience: 1 | 2 | 3 | 4 | 5;
  maturity: { minAgeDeltaYears?: number; minNodeDelta?: number; conditions?: unknown[] };
  actors: CauseActorRequirement[]; themes: string[]; linkedEventIds: string[];
  onActorUnavailable: { action: "expire" } | { action: "transform"; targetCauseTemplateId: string };
}
export interface CauseRuntimeContext {
  commandId: string;
  actorBindings?: Readonly<Record<string, string>>;
  actorStatusById?: Readonly<Record<string, "available" | "unavailable">>;
}
export interface CauseContentAccess {
  getCauseTemplate(contentVersion: string, templateId: string): CauseTemplate;
  getEvent(contentVersion: string, eventId: string): unknown;
}
export interface CauseSelectorResult { state: GameState; rngDraws: RngTrace[]; trace: Record<string, unknown>[] }

function invalid(message: string): never { throw new Error(`CAUSE_INVALID:${message}`); }
function object(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("effect must be object"); return value as Record<string, unknown>; }
function causeId(commandId: string, templateId: string, ordinal: number): string { return `cause:${commandId}:${ordinal}:${templateId}`; }
export function defaultEchoBudget(salience: number): number { return salience === 1 ? 0 : salience <= 3 ? 1 : salience === 4 ? 2 : salience === 5 ? 3 : invalid("salience"); }

function bindActors(template: CauseTemplate, actorBindingKeys: unknown, context: CauseRuntimeContext): Record<string, string> {
  const keys = actorBindingKeys === undefined ? {} : object(actorBindingKeys);
  const roles = new Map(template.actors.map((actor) => [actor.role, actor]));
  for (const role of Object.keys(keys)) if (!roles.has(role)) invalid(`unknown actor role ${role}`);
  const bound: Record<string, string> = {};
  for (const actor of template.actors) {
    const slot = keys[actor.role];
    if (slot !== undefined && typeof slot !== "string") invalid(`binding slot for ${actor.role}`);
    const actorId = typeof slot === "string" ? context.actorBindings?.[slot] : undefined;
    if (actor.required && (typeof actorId !== "string" || actorId.length === 0)) invalid(`required actor role ${actor.role}`);
    if (typeof actorId === "string" && actorId.length > 0) bound[actor.role] = actorId;
  }
  return bound;
}

function createCause(state: GameState, effect: Record<string, unknown>, template: CauseTemplate, context: CauseRuntimeContext, ordinal: number, inherited?: Record<string, string>): CauseInstance {
  if (effect.salience !== template.salience) invalid("salience must match template");
  const actorIdsByRole = inherited ?? bindActors(template, effect.actorBindingKeys, context);
  for (const actor of template.actors) if (actor.required && !actorIdsByRole[actor.role]) invalid(`required actor role ${actor.role}`);
  const id = causeId(context.commandId, template.id, ordinal);
  if (state.run.causes.byId[id] !== undefined) invalid("duplicate cause id");
  return {
    causeId: id, templateId: template.id, originCommandId: context.commandId, originNodeIndex: state.run.nodeIndex, originAge: state.run.age,
    actorIdsByRole: { ...actorIdsByRole }, themes: [...template.themes], salience: template.salience,
    visibility: (effect.visibility ?? "hidden") as CauseInstance["visibility"], state: "dormant",
    maturity: { minNode: safeAdd(state.run.nodeIndex, template.maturity.minNodeDelta ?? 0), minAge: safeAdd(state.run.age, template.maturity.minAgeDeltaYears ?? 0), conditions: [...(template.maturity.conditions ?? [])] },
    echoBudget: defaultEchoBudget(template.salience), echoCount: 0, facts: {}, linkedEventIds: [...template.linkedEventIds]
  };
}

export function validateCauseChoice(value: unknown, state: GameState, content: CauseContentAccess, contentVersion: string, context: CauseRuntimeContext): void {
  const choice = object(value); const outcomes = object(choice.outcomes);
  for (const tier of ["greatSuccess", "success", "costlySuccess", "failure"]) {
    if (outcomes[tier] === undefined) continue;
    const effects = object(outcomes[tier]).effects;
    if (!Array.isArray(effects)) invalid("effects");
    effects.forEach((raw, ordinal) => {
      const effect = object(raw);
      if (effect.op === "ADD_CAUSE") { const template = content.getCauseTemplate(contentVersion, String(effect.templateId)); createCause(state, effect, template, context, ordinal); }
      if (effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE") {
        const cause = state.run.causes.byId[String(effect.causeId)]; if (cause === undefined || cause.state === "resolved" || cause.state === "expired") invalid("cause is missing or terminal");
      }
    });
  }
}

export function applyCauseEffects(state: GameState, effects: readonly unknown[], content: CauseContentAccess, contentVersion: string, context: CauseRuntimeContext): GameState {
  let next = state;
  effects.forEach((raw, ordinal) => {
    const effect = object(raw);
    if (effect.op === "ADD_CAUSE") {
      const template = content.getCauseTemplate(contentVersion, String(effect.templateId)); const cause = createCause(next, effect, template, context, ordinal);
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [cause.causeId]: cause } } } };
    } else if (effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE") {
      const id = String(effect.causeId); const current = next.run.causes.byId[id]; if (current === undefined || current.state === "resolved" || current.state === "expired") invalid("cause is missing or terminal");
      const updated: CauseInstance = { ...current, state: effect.op === "RESOLVE_CAUSE" ? "resolved" : "expired", resolution: { commandId: context.commandId, action: effect.op } };
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: updated } } } };
    }
  });
  return next;
}

export function advanceCauses(state: GameState, content: CauseContentAccess, contentVersion: string, context: CauseRuntimeContext): GameState {
  let next = state; let transformOrdinal = 10_000;
  for (const id of Object.keys(next.run.causes.byId).sort()) {
    const current = next.run.causes.byId[id]; if (current.state === "resolved" || current.state === "expired") continue;
    const template = content.getCauseTemplate(contentVersion, current.templateId);
    const unavailable = template.actors.some((actor) => actor.required && context.actorStatusById?.[current.actorIdsByRole[actor.role]] === "unavailable");
    if (unavailable) {
      if (template.onActorUnavailable.action === "expire") {
        const expired: CauseInstance = { ...current, state: "expired", resolution: { commandId: context.commandId, action: "actorUnavailable" } };
        next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: expired } } } };
      } else {
        const target = content.getCauseTemplate(contentVersion, template.onActorUnavailable.targetCauseTemplateId);
        const inherited: Record<string, string> = {}; for (const actor of target.actors) if (current.actorIdsByRole[actor.role]) inherited[actor.role] = current.actorIdsByRole[actor.role];
        const replacement = createCause(next, { salience: target.salience, visibility: current.visibility }, target, context, transformOrdinal++, inherited);
        const resolved: CauseInstance = { ...current, state: "resolved", resolution: { commandId: context.commandId, action: "transform", targetCauseId: replacement.causeId } };
        next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: resolved, [replacement.causeId]: replacement } } } };
      }
      continue;
    }
    if ((current.state === "dormant" || (current.state === "echoed" && current.echoBudget > 0)) && next.run.nodeIndex >= current.maturity.minNode && next.run.age >= current.maturity.minAge && current.maturity.conditions.every((condition) => evaluateCondition(condition, next))) {
      const eligible: CauseInstance = { ...current, state: "eligible", eligibleSinceNode: current.eligibleSinceNode ?? next.run.nodeIndex, eligibleAge: current.eligibleAge ?? next.run.age };
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: eligible } } } };
    }
  }
  return next;
}

export function selectCauseEcho(state: GameState, content: CauseContentAccess, contentVersion: string): CauseSelectorResult {
  const candidates = Object.values(state.run.causes.byId).filter((cause) => cause.state === "eligible" && cause.echoBudget > 0).sort((left, right) =>
    right.salience - left.salience || (left.eligibleSinceNode ?? 0) - (right.eligibleSinceNode ?? 0) || (left.eligibleAge ?? 0) - (right.eligibleAge ?? 0) || left.causeId.localeCompare(right.causeId));
  const selected = candidates[0]; if (selected === undefined) return { state, rngDraws: [], trace: [] };
  const eventIds = [...selected.linkedEventIds].sort().filter((eventId) => isEventEligible(content.getEvent(contentVersion, eventId), state));
  if (eventIds.length === 0) return { state, rngDraws: [], trace: [{ tier: "P3", causeId: selected.causeId, result: "no-linked-event" }] };
  let eventId = eventIds[0]; let rng = state.run.rng; let rngDraws: RngTrace[] = [];
  if (eventIds.length >= 2) { const draw = drawInt(rng, "event", 0, eventIds.length - 1); rng = draw.state; eventId = eventIds[draw.value]; rngDraws = [...draw.trace]; }
  const echoed: CauseInstance = { ...selected, state: "echoed", echoBudget: selected.echoBudget - 1, echoCount: selected.echoCount + 1 };
  const event = content.getEvent(contentVersion, eventId) as Record<string, unknown>;
  const next: GameState = { ...state, run: { ...state.run, rng, causes: { byId: { ...state.run.causes.byId, [selected.causeId]: echoed } }, events: { ...state.run.events, current: { eventId, kind: String(event.kind) } } } };
  return { state: next, rngDraws, trace: [{ tier: "P3", causeId: selected.causeId, priority: [selected.salience, selected.eligibleSinceNode, selected.eligibleAge, selected.causeId], candidates: eventIds, eventId, logicalRequests: eventIds.length >= 2 ? 1 : 0 }] };
}
