import { CommandValidationError, validateGameCommand, type AppErrorCode, type GameCommand } from "./command.ts";
import { advanceCauses, applyCauseEffects, selectCauseEcho, validateCauseChoice, type CauseContentAccess } from "./cause.ts";
import { recordDirectorScene, selectDirectorEvent, type DirectorContentAccess } from "./director.ts";
import { applyEventEffects, assertA08ExecutableChoice, evaluateCondition, EventRuntimeError, isEventEligible, recordEventOccurrence, resolveCheck, resolveOutcome, type OutcomeTier } from "./event.ts";
import { assertNonNegativeInteger, assertSafeInteger, safeAdd } from "./numeric.ts";
import { createRngState, type RngState, type RngTrace } from "./rng.ts";
import { applyBreakthroughOutcome, applyRetreatProgression, isValidInnateProfile, resolveBreakthrough, type ProgressionContentAccess } from "./progression.ts";
import { buildRiskPresentation, injuryLevel, resolveThreat, threatDefinition, type RiskContentAccess } from "./risk.ts";
import { activeBuildProgressionSources, activeBuildRiskSources, applyBuildEffects, type BuildContentAccess, type BuildPack } from "./build.ts";
import { applyNpcEffects, causeActorAvailability, type NpcContentAccess, type NpcPack } from "./npc.ts";
import { currentParticipantBindings, eventInstanceId, materializeEventParticipants, type ParticipantContentAccess } from "./participants.ts";
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
  innateProfiles?: readonly [import("./state.ts").InnateProfileOffer, import("./state.ts").InnateProfileOffer, import("./state.ts").InnateProfileOffer];
  age: number;
  maxAge: number;
  runName: string;
  realm: { id: string; order: number; cultivation: number; cultivationBps?: number; realmFoundationBps?: number };
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
      offer: { offerId: fixture.offerId, destinyIds: [...fixture.destinyIds], ...(fixture.innateProfiles === undefined ? {} : { innateProfiles: structuredClone([...fixture.innateProfiles]) as [import("./state.ts").InnateProfileOffer, import("./state.ts").InnateProfileOffer, import("./state.ts").InnateProfileOffer] }) },
      realm: { ...fixture.realm, cultivation: fixture.realm.cultivationBps ?? fixture.realm.cultivation, cultivationBps: fixture.realm.cultivationBps ?? fixture.realm.cultivation, realmFoundationBps: fixture.realm.realmFoundationBps ?? 0 },
      attributes: { ...fixture.attributes },
      resources: { spiritStone: fixture.resources.spiritStone, items: cloneRecord(fixture.resources.items) },
      conditions: [],
      risk: { conditions: [], exposureCount: 0 },
      identity: { runName: fixture.runName, rootTags: [...(fixture.rootTags ?? [])], titles: [...(fixture.titles ?? [])] },
      actions: { available: [...fixture.availableActions], pursuitCauseIds: [], recent: [] },
      events: { history: [], occurrences: {} },
      causes: { byId: {} },
      npcs: { nextNpcSequence: 1, byId: {}, roleIndex: {} },
      build: { techniques: [], artifacts: [], consumables: [], tagScores: {}, affinities: {}, evidenceFacts: [], transitionFacts: [], unlockedBuildIds: [] },
      world: {
        regionId: fixture.world.regionId,
        knownRegionIds: [...fixture.world.knownRegionIds],
        tags: [...fixture.world.tags],
        factionStanding: cloneRecord(fixture.world.factionStanding)
      },
      rng: input.initialRng ?? createRngState(input.rulesVersion, input.rootSeed),
      director: { profileId: fixture.firstRun === true ? "first_run" : "standard", recentScenes: [] }
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

function startRun(state: GameState, command: Extract<GameCommand, { type: "START_RUN" }>, context: RuleContext): GameState {
  if (state.run.status !== "offered" || state.run.offer === undefined) throw new ReducerError("RUN_NOT_ACTIVE", "run.offer_consumed");
  if (command.offerId !== state.run.offer.offerId) throw new ReducerError("RUN_OFFER_MISMATCH", "run.offer_mismatch");
  let destinyId: string; let innateProfile: import("./state.ts").InnateProfile | undefined;
  if (state.run.offer.innateProfiles !== undefined) {
    if (!("selectionId" in command) || typeof command.selectionId !== "string") throw new ReducerError("INVALID_OPTION", "run.innate_selection_required");
    const selection = state.run.offer.innateProfiles.find((candidate) => candidate.selectionId === command.selectionId); if (selection === undefined) throw new ReducerError("INVALID_OPTION", "run.innate_selection_not_offered");
    const progression = (context.content as unknown as ProgressionContentAccess).getProgression?.(context.contentVersion); if (progression === undefined || !isValidInnateProfile(progression, selection.profile)) throw new ReducerError("CONTENT_MISMATCH", "content.innate_profile_invalid");
    destinyId = selection.profile.majorDestinyId; innateProfile = structuredClone(selection.profile);
  } else {
    if (!("destinyId" in command) || typeof command.destinyId !== "string" || !state.run.offer.destinyIds.includes(command.destinyId)) throw new ReducerError("INVALID_OPTION", "run.destiny_not_offered"); destinyId = command.destinyId;
  }
  const nextStateVersion = safeAdd(state.stateVersion, 1);
  const { offer: _consumedOffer, ...runWithoutOffer } = state.run;
  const next: GameState = {
    ...state,
    stateVersion: nextStateVersion,
    run: {
      ...runWithoutOffer,
      status: "active",
      identity: { ...state.run.identity, destinyId, ...(innateProfile === undefined ? {} : { innateProfile }) }
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
  get(contentVersion: string): { buildPackId?: string; npcPackId?: string; directorPackId?: string };
}

function buildPackFromContext(context: RuleContext): BuildPack | undefined { const source = context.content as unknown as ActionEventContentAccess & Partial<BuildContentAccess>; const locked = source.get(context.contentVersion); return locked.buildPackId === undefined ? undefined : source.getBuild?.(context.contentVersion); }
function npcPackFromContext(context: RuleContext): NpcPack | undefined { const source = context.content as unknown as ActionEventContentAccess & Partial<NpcContentAccess>; const locked = source.get(context.contentVersion) as { npcPackId?: string }; return locked.npcPackId === undefined ? undefined : source.getNpc?.(context.contentVersion); }
function causeContextWithNpcState(state: GameState, context: RuleContext): RuleContext { return { ...context, actorBindings: currentParticipantBindings(state, context.actorBindings), actorStatusById: { ...(context.actorStatusById ?? {}), ...causeActorAvailability(state) } }; }

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
        ending: { endingId: "lifespan", deathCause: "lifespan" as const, sourceRef: context.commandId, age: timeAdvance.nextAge, factIds: [] },
        deathRecord: { deathCauseId: "death.lifespan", category: "lifespan", age: timeAdvance.nextAge, realmId: state.run.realm.id, immediateSource: "lifespan-hard-ceiling", contributingSourceRefs: [], warningFacts: ["risk.warning.lifespan-ceiling"], sourceCommandId: context.commandId, trace: { resolver: "lifespan-hard-ceiling", actionId: command.actionId, previousAge: timeAdvance.previousAge, actionTimeCost: timeAdvance.delta, maxAge: state.run.maxAge } }
      } : {})
    }
  };
  if (provisional.run.status === "active" && command.actionId === "cultivate" && provisional.run.identity.innateProfile !== undefined) {
    const progression = (context.content as unknown as ProgressionContentAccess).getProgression?.(context.contentVersion); if (progression === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.progression_required"); const buildPack = buildPackFromContext(context); provisional = applyRetreatProgression(provisional, progression, buildPack === undefined ? [] : activeBuildProgressionSources(provisional, buildPack));
  }
  const causeContent = context.content as unknown as CauseContentAccess;
  try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, causeContextWithNpcState(provisional, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let rngDraws: RngTrace[] = []; let selectorTrace: Record<string, unknown>[] = []; let participantFacts: Fact[] = [];
  if (provisional.run.status === "active") {
    const directorContent = context.content as unknown as DirectorContentAccess;
    const firstRunSelection = selectDirectorEvent(provisional, command.actionId, directorContent, ["P2"]);
    provisional = firstRunSelection.state; rngDraws.push(...firstRunSelection.rngDraws); selectorTrace.push(firstRunSelection.trace as unknown as Record<string, unknown>);
    if (provisional.run.events.current === undefined) {
      const causeSelection = selectCauseEcho(provisional, causeContent, context.contentVersion);
      provisional = causeSelection.state; rngDraws.push(...causeSelection.rngDraws); selectorTrace.push(...causeSelection.trace);
      const causeTrace = causeSelection.trace[0];
      if (provisional.run.events.current !== undefined) provisional = recordDirectorScene(provisional, provisional.run.events.current.eventId, directorContent, "P3", { causeId: typeof causeTrace?.causeId === "string" ? causeTrace.causeId : undefined });
    }
    if (provisional.run.events.current === undefined) {
      const directorSelection = selectDirectorEvent(provisional, command.actionId, directorContent, ["P4", "P5", "P6"]);
      provisional = directorSelection.state; rngDraws.push(...directorSelection.rngDraws); selectorTrace.push(directorSelection.trace as unknown as Record<string, unknown>);
      if (provisional.run.events.current === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.no_event_candidate");
    }
    if (provisional.run.events.current !== undefined) {
      try { const eventId = provisional.run.events.current.eventId; const materialized = materializeEventParticipants(provisional, context.content as unknown as ParticipantContentAccess, eventId, eventInstanceId(context.commandId, eventId)); provisional = recordEventOccurrence(materialized.state, eventId); rngDraws.push(...materialized.rngDraws); participantFacts = materialized.facts.map((fact) => ({ ...fact })); }
      catch { throw new ReducerError("CONTENT_MISMATCH", "content.event_participants_invalid"); }
    }
  } else {
    selectorTrace.push({ tier: "P0", result: "lifespan", eventRngRequests: 0 });
  }
  const next = validateStateTransition(state, { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) });
  return {
    state: next,
    effects: [],
    narrativeFacts: [{ type: "ACTION", actionId: command.actionId, actionTimeCost: delta }, ...participantFacts],
    trace: { rngDraws, selector: selectorTrace, time: [{ ...timeAdvance, actionId: command.actionId }] }
  };
}

function attemptBreakthrough(state: GameState, context: RuleContext): ReduceOutput {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  if (state.run.events.current !== undefined) throw new ReducerError("INVALID_COMMAND", "breakthrough.interaction_pending");
  if ((state.run.realm.cultivationBps ?? state.run.realm.cultivation) !== 10_000) throw new ReducerError("INVALID_OPTION", "breakthrough.cultivation_incomplete");
  const progression = (context.content as unknown as ProgressionContentAccess).getProgression?.(context.contentVersion); if (progression === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.progression_required");
  const buildPack = buildPackFromContext(context); const buildSources = buildPack === undefined ? [] : activeBuildProgressionSources(state, buildPack);
  let resolved; try { resolved = resolveBreakthrough(state, progression, buildSources); } catch { throw new ReducerError("INVALID_OPTION", "breakthrough.unavailable"); }
  let progressed; try { progressed = applyBreakthroughOutcome(resolved.state, progression, resolved.tier, context.commandId, buildSources); } catch { throw new ReducerError("INVALID_OPTION", "breakthrough.unavailable"); }
  let backlashDraws: RngTrace[] = []; let backlashTrace: Record<string, unknown> | undefined;
  if (resolved.tier === "failure" && injuryLevel(progressed) === 3) {
    const riskPack = (context.content as unknown as RiskContentAccess).getRisk?.(context.contentVersion);
    if (riskPack !== undefined) {
      const definition = threatDefinition(riskPack, "threat.breakthrough-backlash"); const presentation = buildRiskPresentation(progressed, definition);
      const backlash = resolveThreat(progressed, riskPack, { definitionId: definition.id }, { commandId: context.commandId, presentedRisk: presentation, acceptedPublicWarning: false, modifierSources: buildPack === undefined ? [] : activeBuildRiskSources(progressed, buildPack) });
      progressed = backlash.state; backlashDraws = backlash.rngDraws; backlashTrace = { ...backlash.trace };
    }
  }
  const next = validateStateTransition(state, { ...progressed, stateVersion: safeAdd(state.stateVersion, 1) }); const advanced = next.run.realm.id !== state.run.realm.id;
  return {
    state: next,
    effects: advanced ? [{ type: "REALM_ADVANCE", realmId: next.run.realm.id, outcomeTier: resolved.tier }] : [{ type: "BREAKTHROUGH_FAILED", realmId: next.run.realm.id }],
    narrativeFacts: [{ id: `fact:${context.commandId}:breakthrough`, type: "REALM_BREAKTHROUGH", sourceRef: context.commandId, data: { fromRealmId: state.run.realm.id, toRealmId: next.run.realm.id, outcomeTier: resolved.tier } }],
    trace: { rngDraws: [...resolved.rngDraws, ...backlashDraws], selector: [{ kind: "breakthrough-check", effectiveDifficulty: resolved.effectiveDifficulty, effectiveScore: resolved.effectiveScore, rngRoll: resolved.rngRoll, outcomeTier: resolved.tier }, ...(backlashTrace === undefined ? [] : [{ kind: "breakthrough-backlash", ...backlashTrace }])] }
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
  try { validateCauseChoice(choiceObject, state, causeContent, context.contentVersion, causeContextWithNpcState(state, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }

  let checkedState = state; let requestedTier: OutcomeTier = "success"; let rngDraws: RngTrace[] = []; let checkFact: RuntimeObject = { logicalRequests: 0 };
  if (choiceObject.threatId !== undefined) {
    const riskPack = (context.content as unknown as RiskContentAccess).getRisk?.(context.contentVersion); if (riskPack === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.risk_required");
    const threatId = String(choiceObject.threatId); const definition = threatDefinition(riskPack, threatId); const presentation = buildRiskPresentation(state, definition);
    const buildPack = buildPackFromContext(context); const risk = resolveThreat(state, riskPack, { definitionId: threatId }, { commandId: context.commandId, sourceEventId: current.eventId, presentedRisk: presentation, acceptedPublicWarning: presentation.canBeFatal, modifierSources: buildPack === undefined ? [] : activeBuildRiskSources(state, buildPack) });
    checkedState = risk.state; requestedTier = risk.tier; rngDraws = risk.rngDraws; checkFact = { logicalRequests: 1, risk: risk.trace };
  } else if (choiceObject.check !== undefined) {
    const resolution = resolveCheck(state, choiceObject.check);
    checkedState = resolution.state; requestedTier = resolution.tier; rngDraws = resolution.rngDraws;
    checkFact = { logicalRequests: 1, baseScore: resolution.baseScore, rngRoll: resolution.rngRoll, finalScore: resolution.finalScore };
  }
  const resolved = resolveOutcome(choiceObject.outcomes, requestedTier);
  const executableEffects = (resolved.outcome.effects as readonly unknown[]).map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || !("repeatBehavior" in value)) return value;
    const { repeatBehavior: _repeatBehavior, ...effect } = value as Record<string, unknown>; return effect;
  });
  let causeApplied: GameState;
  try { causeApplied = applyCauseEffects(checkedState, executableEffects, causeContent, context.contentVersion, causeContextWithNpcState(checkedState, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let npcApplied = causeApplied; let npcFacts: Fact[] = []; const npcPack = npcPackFromContext(context); const hasNpcEffects = executableEffects.some((value) => typeof value === "object" && value !== null && !Array.isArray(value) && ["ADJUST_NPC_RELATION", "ADD_NPC_SIGNIFICANCE", "REVEAL_NPC_FACT", "REVEAL_NPC_TRAIT", "REVEAL_NPC_STATUS", "SET_NPC_STATUS", "ADD_NPC_MILESTONE"].includes(String((value as RuntimeObject).op)));
  if (hasNpcEffects && npcPack === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.npc_required");
  if (npcPack !== undefined) { try { const result = applyNpcEffects(causeApplied, executableEffects, npcPack, { commandId: context.commandId, sourceRef: current.instanceId ?? current.eventId, actorBindings: currentParticipantBindings(causeApplied, context.actorBindings) }); npcApplied = result.state; npcFacts = result.facts.map((fact) => ({ ...fact })); } catch { throw new ReducerError("INVALID_OPTION", "npc.invalid"); } }
  let buildApplied = npcApplied; let buildFacts: Fact[] = []; const buildPack = buildPackFromContext(context);
  if (buildPack !== undefined) { try { const result = applyBuildEffects(npcApplied, executableEffects, buildPack, { commandId: context.commandId, sourceRef: current.eventId }); buildApplied = result.state; buildFacts = result.facts.map((fact) => ({ ...fact })); } catch { throw new ReducerError("INVALID_OPTION", "build.invalid"); } }
  const applied = applyEventEffects(buildApplied, executableEffects, current.eventId);
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
  const transition = provisional.run.status !== "active" ? undefined : selectedTransition(outcomeNext ?? choiceObject.next, provisional, context);
  if (transition !== undefined) {
    const targetId = transition.eventId as string; const target = eventFromContent(context, targetId);
    provisional = { ...provisional, run: { ...provisional.run, events: { ...provisional.run.events, current: { eventId: targetId, kind: String(target.kind) } } } };
    provisional = recordDirectorScene(provisional, targetId, context.content as unknown as DirectorContentAccess, "CONTINUATION");
  }
  if (provisional.run.status === "active") {
    try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, causeContextWithNpcState(provisional, context)); }
    catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  }
  let causeTrace: Record<string, unknown>[] = []; let causeRngDraws: RngTrace[] = []; let participantFacts: Fact[] = []; let participantRngDraws: RngTrace[] = [];
  if (provisional.run.status === "active" && provisional.run.events.current === undefined) {
    const selected = selectCauseEcho(provisional, causeContent, context.contentVersion); provisional = selected.state; causeTrace = selected.trace; causeRngDraws = selected.rngDraws;
    const selectedTrace = selected.trace[0];
    if (provisional.run.events.current !== undefined) provisional = recordDirectorScene(provisional, provisional.run.events.current.eventId, context.content as unknown as DirectorContentAccess, "P3", { causeId: typeof selectedTrace?.causeId === "string" ? selectedTrace.causeId : undefined });
  }
  if (provisional.run.status === "active" && provisional.run.events.current !== undefined) {
    try { const eventId = provisional.run.events.current.eventId; const materialized = materializeEventParticipants(provisional, context.content as unknown as ParticipantContentAccess, eventId, eventInstanceId(context.commandId, eventId)); provisional = recordEventOccurrence(materialized.state, eventId); participantRngDraws = materialized.rngDraws; participantFacts = materialized.facts.map((fact) => ({ ...fact })); }
    catch { throw new ReducerError("CONTENT_MISMATCH", "content.event_participants_invalid"); }
  }
  const next: GameState = { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) };
  validateStateTransition(state, next);
  const hasSessionState = Object.keys(applied.session.flags).length > 0 || Object.keys(applied.session.counters).length > 0 || applied.session.tags.length > 0;
  const effects: DomainEffect[] = [...applied.publicEffects];
  if (hasSessionState) effects.push({ type: "EVENT_SESSION", eventId: current.eventId, session: applied.session });
  return {
    state: next,
    effects,
    narrativeFacts: [{ type: "EVENT_OUTCOME", eventId: current.eventId, choiceId: command.optionId, requestedTier, appliedTier: resolved.appliedTier }, ...npcFacts, ...buildFacts, ...participantFacts],
    trace: { rngDraws: [...rngDraws, ...causeRngDraws, ...participantRngDraws], selector: [{ kind: "check", ...checkFact }, ...causeTrace], time: [{ ...timeAdvance }] }
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
  if (command.type === "ATTEMPT_BREAKTHROUGH") return attemptBreakthrough(state, input.context);
  if (command.type !== "START_RUN") throw new ReducerError("INVALID_COMMAND", "command.not_implemented");
  const next = startRun(state, command, input.context);
  assertSafeInteger(next.stateVersion, "stateVersion");
  if (next.stateVersion !== state.stateVersion + 1) throw new ReducerError("TRANSIENT", "state.version_invariant");
  if (next.run.age > next.run.maxAge) throw new ReducerError("TRANSIENT", "state.lifespan_invariant");
  projectRuleState(next);
  return { state: next, effects: [], narrativeFacts: [], trace: { rngDraws: [] } };
}
