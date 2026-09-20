import { CommandValidationError, validateGameCommand, type AppErrorCode, type GameCommand } from "./command.ts";
import { applyEventEffects, assertA08ExecutableChoice, evaluateCondition, EventRuntimeError, isEventEligible, resolveCheck, resolveOutcome, type OutcomeTier } from "./event.ts";
import { assertNonNegativeInteger, assertSafeInteger, safeAdd } from "./numeric.ts";
import { createRngState, type RngState, type RngTrace } from "./rng.ts";
import {
  projectRuleState,
  validateGameState,
  validateStateTransition,
  type ActionType,
  type GameState,
  type MetaView
} from "./state.ts";

export type ContentRegistry = Readonly<Record<string, unknown>>;
export interface RuleContext { rulesVersion: string; contentVersion: string; content: ContentRegistry }
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

  let checkedState = state; let requestedTier: OutcomeTier = "success"; let rngDraws: RngTrace[] = []; let checkFact: RuntimeObject = { logicalRequests: 0 };
  if (choiceObject.check !== undefined) {
    const resolution = resolveCheck(state, choiceObject.check);
    checkedState = resolution.state; requestedTier = resolution.tier; rngDraws = resolution.rngDraws;
    checkFact = { logicalRequests: 1, baseScore: resolution.baseScore, rngRoll: resolution.rngRoll, finalScore: resolution.finalScore };
  }
  const resolved = resolveOutcome(choiceObject.outcomes, requestedTier);
  const applied = applyEventEffects(checkedState, resolved.outcome.effects, current.eventId);
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
  const next: GameState = { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) };
  validateStateTransition(state, next);
  const hasSessionState = Object.keys(applied.session.flags).length > 0 || Object.keys(applied.session.counters).length > 0 || applied.session.tags.length > 0;
  const effects: DomainEffect[] = [...applied.publicEffects];
  if (hasSessionState) effects.push({ type: "EVENT_SESSION", eventId: current.eventId, session: applied.session });
  return {
    state: next,
    effects,
    narrativeFacts: [{ type: "EVENT_OUTCOME", eventId: current.eventId, choiceId: command.optionId, requestedTier, appliedTier: resolved.appliedTier }],
    trace: { rngDraws, selector: [{ kind: "check", ...checkFact }], time: [{ ...timeAdvance }] }
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
  if (command.type !== "START_RUN") throw new ReducerError("INVALID_COMMAND", "command.not_implemented");
  const next = startRun(state, command);
  assertSafeInteger(next.stateVersion, "stateVersion");
  if (next.stateVersion !== state.stateVersion + 1) throw new ReducerError("TRANSIENT", "state.version_invariant");
  if (next.run.age > next.run.maxAge) throw new ReducerError("TRANSIENT", "state.lifespan_invariant");
  projectRuleState(next);
  return { state: next, effects: [], narrativeFacts: [], trace: { rngDraws: [] } };
}
