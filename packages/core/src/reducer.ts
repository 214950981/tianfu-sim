import { CommandValidationError, validateGameCommand, type AppErrorCode, type GameCommand } from "./command.ts";
import { advanceCauses, applyCauseEffects, selectCauseEcho, validateCauseChoice, type CauseContentAccess } from "./cause.ts";
import { applyEventEffects, assertA08ExecutableChoice, evaluateCondition, EventRuntimeError, isEventEligible, resolveCheck, resolveOutcome, type OutcomeTier } from "./event.ts";
import { assertNonNegativeInteger, assertSafeInteger, safeAdd } from "./numeric.ts";
import { createRngState, drawInt, type RngState, type RngTrace } from "./rng.ts";
import {
  projectRuleState,
  validateGameState,
  validateStateTransition,
  type ActionType,
  type GameState,
  type MetaView
} from "./state.ts";

export type ContentRegistry = Readonly<Record<string, unknown>>;
export interface RuleContext {
  rulesVersion: string; contentVersion: string; content: ContentRegistry; commandId: string;
  actorBindings?: Readonly<Record<string, string>>;
  actorStatusById?: Readonly<Record<string, "available" | "unavailable">>;
}
export interface ReduceInput { state: GameState; command: GameCommand; context: RuleContext }
export type DomainEffect = Readonly<Record<string, unknown>>;
export type Fact = Readonly<Record<string, unknown>>;
export interface RuleTrace {
  rngDraws: RngTrace[];
  director?: unknown[];
  selector?: unknown[];
  time?: unknown[];
}
export interface ReduceOutput {
  state: GameState;
  effects: DomainEffect[];
  narrativeFacts: Fact[];
  trace: RuleTrace;
}

export class ReducerError extends Error {
  readonly code: AppErrorCode;
  readonly messageKey: string;
  readonly retryable: boolean;
  constructor(code: AppErrorCode, messageKey: string, retryable = false) {
    super(messageKey);
    this.name = "ReducerError";
    this.code = code;
    this.messageKey = messageKey;
    this.retryable = retryable;
  }
}

export interface OfferedRunFixture {
  offerId: string;
  destinyIds: readonly [string, string, string];
  age: number;
  maxAge: number;
  runName: string;
  realm: { id: string; order: number; cultivation: number };
  attributes: { insight: number; body: number; spiritSense: number; fortune: number };
  resources: { spiritStone: number; items: Readonly<Record<string, number>> };
  rootTags?: readonly string[];
  titles?: readonly string[];
  availableActions: readonly ActionType[];
  world: {
    regionId: string;
    knownRegionIds: readonly string[];
    tags: readonly string[];
    factionStanding: Readonly<Record<string, number>>;
  };
  firstRun?: boolean;
}

export interface CreateOfferedRunInput {
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  runId: string;
  playerId: string;
  rootSeed: string;
  metaView: MetaView;
  fixture: OfferedRunFixture;
  initialRng?: RngState;
}

function cloneRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record));
}

export function createOfferedRun(input: CreateOfferedRunInput): GameState {
  const { fixture } = input;
  const state: GameState = {
    schemaVersion: input.schemaVersion,
    rulesVersion: input.rulesVersion,
    contentVersion: input.contentVersion,
    stateVersion: 0,
    run: {
      runId: input.runId,
      playerId: input.playerId,
      rootSeed: input.rootSeed,
      status: "offered",
      nodeIndex: 0,
      age: fixture.age,
      maxAge: fixture.maxAge,
      offer: { offerId: fixture.offerId, destinyIds: [...fixture.destinyIds] },
      realm: { ...fixture.realm },
      attributes: { ...fixture.attributes },
      resources: { spiritStone: fixture.resources.spiritStone, items: cloneRecord(fixture.resources.items) },
      conditions: [],
      identity: { runName: fixture.runName, rootTags: [...(fixture.rootTags ?? [])], titles: [...(fixture.titles ?? [])] },
      actions: { available: [...fixture.availableActions], pursuitCauseIds: [], recent: [] },
      events: { history: [] },
      causes: { byId: {} },
      npcs: { byId: {} },
      build: { techniques: [], artifacts: [], consumables: [], tagScores: {} },
      world: {
        regionId: fixture.world.regionId,
        knownRegionIds: [...fixture.world.knownRegionIds],
        tags: [...fixture.world.tags],
        factionStanding: cloneRecord(fixture.world.factionStanding)
      },
      rng: input.initialRng ?? createRngState(input.rulesVersion, input.rootSeed),
      director: { firstRun: fixture.firstRun ?? false, interventions: 0 }
    },
    metaView: {
      unlocks: [...input.metaView.unlocks],
      entitlements: [...input.metaView.entitlements],
      discoveries: [...input.metaView.discoveries]
    }
  };
  return validateGameState(state);
}

export interface TimeAdvance {
  previousAge: number;
  delta: number;
  nextAge: number;
  reachedMaxAge: boolean;
}

export function resolveTimeAdvance(age: number, maxAge: number, delta: number): TimeAdvance {
  assertNonNegativeInteger(age, "age");
  assertNonNegativeInteger(maxAge, "maxAge");
  assertNonNegativeInteger(delta, "delta");
  if (age > maxAge) throw new RangeError("age must not exceed maxAge");
  const remaining = maxAge - age;
  const reachedMaxAge = delta >= remaining;
  return {
    previousAge: age,
    delta,
    nextAge: reachedMaxAge ? maxAge : safeAdd(age, delta),
    reachedMaxAge
  };
}

function validateContext(state: GameState, context: RuleContext): void {
  if (typeof context !== "object" || context === null || typeof context.content !== "object" || context.content === null) {
    throw new ReducerError("INVALID_COMMAND", "context.invalid");
  }
  if (context.rulesVersion !== state.rulesVersion || context.contentVersion !== state.contentVersion) {
    throw new ReducerError("CONTENT_MISMATCH", "content.version_mismatch");
  }
  if (typeof context.commandId !== "string" || context.commandId.length === 0) throw new ReducerError("INVALID_COMMAND", "context.command_id_invalid");
  if (context.actorBindings !== undefined && (typeof context.actorBindings !== "object" || context.actorBindings === null || Array.isArray(context.actorBindings))) throw new ReducerError("INVALID_COMMAND", "context.actor_bindings_invalid");
  if (context.actorStatusById !== undefined && (typeof context.actorStatusById !== "object" || context.actorStatusById === null || Array.isArray(context.actorStatusById) || Object.values(context.actorStatusById).some((status) => status !== "available" && status !== "unavailable"))) throw new ReducerError("INVALID_COMMAND", "context.actor_status_invalid");
}

function startRun(state: GameState, command: Extract<GameCommand, { type: "START_RUN" }>): GameState {
  if (state.run.status !== "offered" || state.run.offer === undefined) throw new ReducerError("RUN_NOT_ACTIVE", "run.offer_consumed");
  if (command.offerId !== state.run.offer.offerId) throw new ReducerError("RUN_OFFER_MISMATCH", "run.offer_mismatch");
  if (!state.run.offer.destinyIds.includes(command.destinyId)) throw new ReducerError("INVALID_OPTION", "run.destiny_not_offered");
  const nextStateVersion = safeAdd(state.stateVersion, 1);
  const { offer: _consumedOffer, ...runWithoutOffer } = state.run;
  const next: GameState = {
    ...state,
    stateVersion: nextStateVersion,
    run: {
      ...runWithoutOffer,
      status: "active",
      identity: { ...state.run.identity, destinyId: command.destinyId }
    }
  };
  return validateStateTransition(state, next);
}

const ACTION_TIME_COSTS: Readonly<Record<string, Readonly<Record<ActionType, number>>>> = {
  "2.0.0": { cultivate: 3, travel: 2, worldly: 1, pursuit: 1 }
};

export function actionTimeCost(rulesVersion: string, action: ActionType): number {
  const cost = ACTION_TIME_COSTS[rulesVersion]?.[action];
  if (cost === undefined) throw new ReducerError("CONTENT_MISMATCH", "rules.action_time_unavailable");
  assertNonNegativeInteger(cost, "actionTimeCost");
  return cost;
}

type RuntimeObject = Record<string, unknown>;
function runtimeObject(value: unknown, message: string): RuntimeObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ReducerError("INVALID_OPTION", message);
  return value as RuntimeObject;
}
function eventFromContent(context: RuleContext, eventId: string): RuntimeObject {
  const source = context.content as { getEvent?: (contentVersion: string, id: string) => unknown };
  if (typeof source.getEvent !== "function") throw new ReducerError("CONTENT_MISMATCH", "content.event_registry_required");
  return runtimeObject(source.getEvent(context.contentVersion, eventId), "event.invalid");
}
function selectedTransition(transitionsValue: unknown, state: GameState, context: RuleContext): RuntimeObject | undefined {
  if (transitionsValue === undefined) return undefined;
  if (!Array.isArray(transitionsValue)) throw new ReducerError("INVALID_OPTION", "event.transitions_invalid");
  const eligible = transitionsValue.filter((value) => {
    const transition = runtimeObject(value, "event.transition_invalid");
    if (typeof transition.eventId !== "string") throw new ReducerError("INVALID_OPTION", "event.transition_invalid");
    if (transition.when !== undefined && !evaluateCondition(transition.when, state)) return false;
    return isEventEligible(eventFromContent(context, transition.eventId), state);
  });
  eligible.sort((leftValue, rightValue) => {
    const left = leftValue as RuntimeObject; const right = rightValue as RuntimeObject;
    const leftPriority = typeof left.priority === "number" ? left.priority : 0; const rightPriority = typeof right.priority === "number" ? right.priority : 0;
    return rightPriority === leftPriority ? String(left.eventId).localeCompare(String(right.eventId)) : rightPriority > leftPriority ? 1 : -1;
  });
  return eligible[0] as RuntimeObject | undefined;
}

interface ActionEventContentAccess {
  get(contentVersion: string): { events: readonly unknown[]; causeTemplates?: readonly { linkedEventIds: readonly string[] }[] };
}

function selectEventCandidate(state: GameState, action: ActionType, context: RuleContext): { state: GameState; rngDraws: RngTrace[]; trace: Record<string, unknown>[] } {
  const source = context.content as unknown as ActionEventContentAccess;
  if (typeof source.get !== "function") throw new ReducerError("CONTENT_MISMATCH", "content.event_registry_required");
  const pack = source.get(context.contentVersion); const events = pack.events;
  if (!Array.isArray(events)) throw new ReducerError("CONTENT_MISMATCH", "content.events_required");
  const causeLinkedEventIds = new Set((pack.causeTemplates ?? []).flatMap((template) => template.linkedEventIds));
  const eligible = events.filter((eventValue) => {
    const event = runtimeObject(eventValue, "event.invalid");
    return !causeLinkedEventIds.has(String(event.id)) && isEventEligible(event, state);
  }).map((eventValue) => runtimeObject(eventValue, "event.invalid"));
  const affinity = eligible.filter((event) => Array.isArray(event.actionAffinity) && event.actionAffinity.includes(action));
  const ordinary = eligible.filter((event) => event.actionAffinity === undefined || (Array.isArray(event.actionAffinity) && event.actionAffinity.length === 0));
  const tier = affinity.length > 0 ? "P4" : "P5";
  const candidates = (affinity.length > 0 ? affinity : ordinary).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (candidates.length === 0) throw new ReducerError("CONTENT_MISMATCH", "content.no_event_candidate");
  let selected = candidates[0]; let rng = state.run.rng; let rngDraws: RngTrace[] = [];
  if (candidates.length >= 2) {
    const draw = drawInt(rng, "event", 0, candidates.length - 1);
    rng = draw.state; rngDraws = [...draw.trace]; selected = candidates[draw.value];
  }
  const eventId = String(selected.id); const kind = String(selected.kind);
  return {
    state: { ...state, run: { ...state.run, rng, events: { ...state.run.events, current: { eventId, kind } } } },
    rngDraws,
    trace: [{ tier, action, candidates: candidates.map((event) => String(event.id)), eventId, logicalRequests: candidates.length >= 2 ? 1 : 0 }]
  };
}

function chooseAction(state: GameState, command: Extract<GameCommand, { type: "CHOOSE_ACTION" }>, context: RuleContext): ReduceOutput {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  if (state.run.events.current !== undefined) throw new ReducerError("INVALID_COMMAND", "action.interaction_pending");
  if (!state.run.actions.available.includes(command.actionId)) throw new ReducerError("INVALID_OPTION", "action.unavailable");
  const delta = actionTimeCost(state.rulesVersion, command.actionId);
  const timeAdvance = resolveTimeAdvance(state.run.age, state.run.maxAge, delta);
  let provisional: GameState = {
    ...state,
    run: {
      ...state.run,
      age: timeAdvance.nextAge,
      nodeIndex: safeAdd(state.run.nodeIndex, 1),
      ...(timeAdvance.reachedMaxAge ? {
        status: "dying" as const,
        ending: { endingId: "lifespan", deathCause: "lifespan" as const, sourceRef: context.commandId, age: timeAdvance.nextAge, factIds: [] }
      } : {})
    }
  };
  const causeContent = context.content as unknown as CauseContentAccess;
  try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, context); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let rngDraws: RngTrace[] = []; let selectorTrace: Record<string, unknown>[] = [];
  if (provisional.run.status === "active") {
    const causeSelection = selectCauseEcho(provisional, causeContent, context.contentVersion);
    provisional = causeSelection.state; rngDraws = [...causeSelection.rngDraws]; selectorTrace = [...causeSelection.trace];
    if (provisional.run.events.current === undefined) {
      const eventSelection = selectEventCandidate(provisional, command.actionId, context);
      provisional = eventSelection.state; rngDraws.push(...eventSelection.rngDraws); selectorTrace.push(...eventSelection.trace);
    }
  } else {
    selectorTrace.push({ tier: "P0", result: "lifespan", eventRngRequests: 0 });
  }
  const next = validateStateTransition(state, { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) });
  return {
    state: next,
    effects: [],
    narrativeFacts: [{ type: "ACTION", actionId: command.actionId, actionTimeCost: delta }],
    trace: { rngDraws, selector: selectorTrace, time: [{ ...timeAdvance, actionId: command.actionId }] }
  };
}

function chooseEventOption(state: GameState, command: Extract<GameCommand, { type: "CHOOSE_EVENT_OPTION" }>, context: RuleContext): ReduceOutput {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  const current = state.run.events.current;
  if (current === undefined || current.eventId !== command.eventId) throw new ReducerError("INVALID_OPTION", "event.not_current");
  const event = eventFromContent(context, current.eventId);
  if (!isEventEligible(event, state)) throw new ReducerError("INVALID_OPTION", "event.ineligible");
  if (!Array.isArray(event.choices)) throw new ReducerError("INVALID_OPTION", "event.has_no_choices");
  const choice = event.choices.find((value) => runtimeObject(value, "choice.invalid").id === command.optionId);
  if (choice === undefined) throw new ReducerError("INVALID_OPTION", "event.option_invalid");
  const choiceObject = runtimeObject(choice, "choice.invalid");
  if (choiceObject.requirements !== undefined && !evaluateCondition(choiceObject.requirements, state)) throw new ReducerError("INVALID_OPTION", "event.option_ineligible");
  assertA08ExecutableChoice(choiceObject);
  const causeContent = context.content as unknown as CauseContentAccess;
  try { validateCauseChoice(choiceObject, state, causeContent, context.contentVersion, context); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }

  let checkedState = state; let requestedTier: OutcomeTier = "success"; let rngDraws: RngTrace[] = []; let checkFact: RuntimeObject = { logicalRequests: 0 };
  if (choiceObject.check !== undefined) {
    const resolution = resolveCheck(state, choiceObject.check);
    checkedState = resolution.state; requestedTier = resolution.tier; rngDraws = resolution.rngDraws;
    checkFact = { logicalRequests: 1, baseScore: resolution.baseScore, rngRoll: resolution.rngRoll, finalScore: resolution.finalScore };
  }
  const resolved = resolveOutcome(choiceObject.outcomes, requestedTier);
  let causeApplied: GameState;
  try { causeApplied = applyCauseEffects(checkedState, resolved.outcome.effects as readonly unknown[], causeContent, context.contentVersion, context); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  const applied = applyEventEffects(causeApplied, resolved.outcome.effects, current.eventId);
  const timeAdvance = resolveTimeAdvance(applied.state.run.age, applied.state.run.maxAge, applied.outcomeTimeDelta);
  const nextNodeIndex = safeAdd(applied.state.run.nodeIndex, 1);
  const { current: _resolvedCurrent, ...eventsWithoutCurrent } = applied.state.run.events;
  let provisional: GameState = {
    ...applied.state,
    run: {
      ...applied.state.run,
      nodeIndex: nextNodeIndex,
      age: timeAdvance.nextAge,
      status: applied.state.run.status === "ended" ? "ended" : timeAdvance.reachedMaxAge ? "dying" : applied.state.run.status,
      events: {
        ...eventsWithoutCurrent,
        history: [...applied.state.run.events.history, { eventId: current.eventId, nodeIndex: state.run.nodeIndex, resultTier: requestedTier }]
      }
    }
  };
  const outcomeNext = resolved.outcome.next;
  const transition = provisional.run.status === "ended" ? undefined : selectedTransition(outcomeNext ?? choiceObject.next, provisional, context);
  if (transition !== undefined) {
    const targetId = transition.eventId as string; const target = eventFromContent(context, targetId);
    provisional = { ...provisional, run: { ...provisional.run, events: { ...provisional.run.events, current: { eventId: targetId, kind: String(target.kind) } } } };
  }
  try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, context); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let causeTrace: Record<string, unknown>[] = []; let causeRngDraws: RngTrace[] = [];
  if (provisional.run.status === "active" && provisional.run.events.current === undefined) {
    const selected = selectCauseEcho(provisional, causeContent, context.contentVersion); provisional = selected.state; causeTrace = selected.trace; causeRngDraws = selected.rngDraws;
  }
  const next: GameState = { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) };
  validateStateTransition(state, next);
  const hasSessionState = Object.keys(applied.session.flags).length > 0 || Object.keys(applied.session.counters).length > 0 || applied.session.tags.length > 0;
  const effects: DomainEffect[] = [...applied.publicEffects];
  if (hasSessionState) effects.push({ type: "EVENT_SESSION", eventId: current.eventId, session: applied.session });
  return {
    state: next,
    effects,
    narrativeFacts: [{ type: "EVENT_OUTCOME", eventId: current.eventId, choiceId: command.optionId, requestedTier, appliedTier: resolved.appliedTier }],
    trace: { rngDraws: [...rngDraws, ...causeRngDraws], selector: [{ kind: "check", ...checkFact }, ...causeTrace], time: [{ ...timeAdvance }] }
  };
}

export function reduce(input: ReduceInput): ReduceOutput {
  const state = validateGameState(input.state);
  validateContext(state, input.context);
  let command: GameCommand;
  try { command = validateGameCommand(input.command); }
  catch (error) {
    if (error instanceof CommandValidationError) throw new ReducerError("INVALID_COMMAND", "command.invalid");
    throw error;
  }
  if (command.type === "CHOOSE_EVENT_OPTION") {
    try { return chooseEventOption(state, command, input.context); }
    catch (error) {
      if (error instanceof ReducerError) throw error;
      if (error instanceof EventRuntimeError) throw new ReducerError(error.kind === "INVALID_OPTION" ? "INVALID_OPTION" : "INVALID_COMMAND", `event.${error.kind.toLowerCase()}`);
      throw error;
    }
  }
  if (command.type === "CHOOSE_ACTION") return chooseAction(state, command, input.context);
  if (command.type !== "START_RUN") throw new ReducerError("INVALID_COMMAND", "command.not_implemented");
  const next = startRun(state, command);
  assertSafeInteger(next.stateVersion, "stateVersion");
  if (next.stateVersion !== state.stateVersion + 1) throw new ReducerError("TRANSIENT", "state.version_invariant");
  if (next.run.age > next.run.maxAge) throw new ReducerError("TRANSIENT", "state.lifespan_invariant");
  projectRuleState(next);
  return { state: next, effects: [], narrativeFacts: [], trace: { rngDraws: [] } };
}
