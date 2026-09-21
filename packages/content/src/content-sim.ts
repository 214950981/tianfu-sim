import {
  activeBuildProgressionSources,
  aggregateProgressionModifiers,
  buildStage,
  createOfferedRun,
  realmDefinition,
  reduce,
  roundHalfUpPositive,
  type ActionType,
  type BuildStage,
  type GameState,
  type ReduceOutput
} from "../../core/src/index.ts";
import { BUILD_V1 } from "./build-v1.ts";
import { CONTENT01_CAUSE_CHAINS, CONTENT01_PACK, CONTENT01_VERSION } from "./content01-v1.ts";
import { NPC_CONTENT01_V1 } from "./npc-content01-v1.ts";
import { ContentRegistry, type ChoiceDefinition, type EventDefinition } from "./registry.ts";

export const CONTENT_SIM_POLICIES = ["cautious", "aggressive", "sword_seeking", "body_seeking", "alchemy_seeking", "fortune_seeking"] as const;
export type ContentSimPolicy = typeof CONTENT_SIM_POLICIES[number];
export type SimulationEndReason = "death" | "lifespan" | "ending" | "right_censored" | "other";
export type SimulationDirectorSlot = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type BuildEvidenceCategory = "ordinary_event" | "npc_event" | "cause_echo" | "risk_choice" | "other";

export interface ContentSimulationOptions {
  runsPerPolicy?: number;
  maxActions?: number;
  policies?: readonly ContentSimPolicy[];
  seedStart?: number;
  seedEndExclusive?: number;
}

interface CauseCounters { origins: number; eligible: number; echoes: number; resolved: number; expired: number; transformed: number }
interface RiskCounters { exposures: number; takeRisk: number; turnAway: number; deaths: number }
interface BreakthroughCounters { attempts: number; failures: number; successes: number; greatSuccesses: number }
interface BuildStageCounts { latent: number; emerging: number; formed: number; refined: number }

export interface CompactRunTelemetry {
  seed: number;
  policy: ContentSimPolicy;
  actionCount: number;
  nodeIndex: number;
  eventChoiceCount: number;
  commandCount: number;
  endReason: SimulationEndReason;
  runtimeFailure: boolean;
  deadlocked: boolean;
  realmStart: string;
  realmEnd: string;
  realmTransitions: string[];
  breakthroughs: BreakthroughCounters;
  breakthroughAttempts: number;
  breakthroughFailures: number;
  breakthroughSuccesses: number;
  breakthroughGreatSuccesses: number;
  cultivation: { maxBps: number; finalBps: number; cappedActions: number };
  foundation: { maxBps: number; finalBps: number; bankingActions: number };
  buildStages: Record<string, BuildStage>;
  dominantBuild?: string;
  buildEvidenceByCategory: Record<BuildEvidenceCategory, number>;
  buildEvidenceBySource: Record<BuildEvidenceCategory, number>;
  coreNpcEncounters: Record<string, number>;
  coreNpcEncounterIds: string[];
  generatedNpcEncounters: number;
  generatedNpcInstanceIds: string[];
  promotedGeneratedNpcCount: number;
  causeTotals: CauseCounters;
  causeOrigins: number;
  causeEligible: number;
  causeEchoes: number;
  causeResolved: number;
  causeExpired: number;
  causeTransformed: number;
  causesByTemplate: Record<string, CauseCounters>;
  maxEchoesPerCauseByTemplate: Record<string, number>;
  causeBindingsByCoreNpc: Record<string, number>;
  maxSameTemplateInstances: number;
  directorSlots: Record<SimulationDirectorSlot, number>;
  directorSlotCounts: Record<SimulationDirectorSlot, number>;
  eventSelections: Record<string, number>;
  eventSelectionCounts: Record<string, number>;
  first5EventIds: string[];
  maxEventRepeats: number;
  sameEventMaxOccurrencesPerRun: number;
  riskByThreat: Record<string, RiskCounters>;
  riskExposuresByThreat: Record<string, number>;
  riskDeathsByThreat: Record<string, number>;
  deathCategory?: string;
  deathCauseId?: string;
  AIcalls: 0;
}

export interface ContentSimulationReport {
  config: { policies: ContentSimPolicy[]; seedStart: number; seedEndExclusive: number; maxActions: number };
  runs: number;
  runtimeFailures: number;
  deadlocks: number;
  actionsMin: number;
  actionsMedian: number;
  actionsAverage: number;
  actionsMax: number;
  nodesMin: number;
  nodesMedian: number;
  nodesAverage: number;
  nodesMax: number;
  rightCensoredRuns: number;
  endReasonDistribution: Record<SimulationEndReason, number>;
  deaths: number;
  lifespanDeaths: number;
  riskDeaths: number;
  deathCauseDistribution: Record<string, number>;
  realmDistribution: Record<string, number>;
  realmTransitionDistribution: Record<string, number>;
  breakthrough: BreakthroughCounters;
  buildStageDistribution: Record<string, BuildStageCounts>;
  formedBuildDistribution: Record<string, number>;
  refinedBuildDistribution: Record<string, number>;
  dominantBuildDistribution: Record<string, number>;
  buildEvidenceByCategory: Record<BuildEvidenceCategory, number>;
  coreNpcEncounterDistribution: Record<string, number>;
  coreNpcRepeatEncounterDistribution: Record<string, number>;
  coreNpcCauseBindingDistribution: Record<string, number>;
  generatedNpcEncounterCount: number;
  generatedNpcInstanceCount: number;
  promotedGeneratedNpcCount: number;
  causeOriginCount: number;
  causeEligibleCount: number;
  causeEchoCount: number;
  causeResolvedCount: number;
  causeExpiredCount: number;
  causeTransformedCount: number;
  causeByTemplate: Record<string, CauseCounters & { maxEchoesPerCauseInstance: number; maxSameTemplateInstancesPerRun: number }>;
  causeByChain: Record<string, CauseCounters & { maxEchoesPerCauseInstance: number; maxSameTemplateInstancesPerRun: number }>;
  coreNpcMetrics: Record<string, { encounterRuns: number; eventSelections: number; maxSelectionsInOneRun: number; medianSelectionsPerEncounterRun: number; causeBindings: number }>;
  directorSlotDistribution: Record<SimulationDirectorSlot, number>;
  riskByThreat: Record<string, RiskCounters>;
  riskByPolicy: Record<string, Record<string, RiskCounters>>;
  uniqueEventsSeen: number;
  eventSelectionFrequency: Record<string, number>;
  top10EventFrequency: Array<{ eventId: string; count: number }>;
  first5NodeSequenceDiversity: number;
  npcEncounterDiversity: number;
  repeatViolations: number;
  policyMetrics: Record<string, {
    runs: number; actionsAverage: number; nodesAverage: number; nodesMedian: number; deaths: number; rightCensoredRuns: number;
    realmDistribution: Record<string, number>; breakthroughs: BreakthroughCounters; causeEchoes: number; npcEncounters: number;
    targetBuildFormationRate: number; targetBuildRefinedRate: number;
  }>;
  runTelemetry: CompactRunTelemetry[];
  AIcalls: 0;
}

function registry(): ContentRegistry {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
}

const profiles = [
  { spiritualRoot: "root.heavenly", talentIds: ["talent.cultivation.01"], majorDestinyId: "destiny.major.breakthrough.01" },
  { spiritualRoot: "root.dual", talentIds: ["talent.cultivation.02"], majorDestinyId: "destiny.major.breakthrough.02" },
  { spiritualRoot: "root.triple", talentIds: ["talent.cultivation.03"], majorDestinyId: "destiny.major.breakthrough.03" }
] as const;

function initial(content: ContentRegistry, policy: ContentSimPolicy, seed: number): GameState {
  const offers = profiles.map((profile, index) => ({ selectionId: `selection:${index}`, profile: { spiritualRoot: profile.spiritualRoot, talentIds: [...profile.talentIds], majorDestinyId: profile.majorDestinyId } })) as [
    { selectionId: string; profile: { spiritualRoot: string; talentIds: string[]; majorDestinyId: string } },
    { selectionId: string; profile: { spiritualRoot: string; talentIds: string[]; majorDestinyId: string } },
    { selectionId: string; profile: { spiritualRoot: string; talentIds: string[]; majorDestinyId: string } }
  ];
  const offered = createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `sim:${policy}:${seed}`,
    playerId: "player:content-sim",
    rootSeed: `content01:${policy}:${seed}`,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:${policy}:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      innateProfiles: offers,
      age: 20,
      maxAge: 80,
      runName: "观世",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  });
  const selectionId = offers[seed % offers.length].selectionId;
  return reduce({ state: offered, command: { type: "START_RUN", offerId: offered.run.offer!.offerId, selectionId }, context: simulationContext(content, offered, `sim:${policy}:${seed}:start`) }).state;
}

const ACTION_PLAN: Record<ContentSimPolicy, readonly ActionType[]> = {
  cautious: ["cultivate", "worldly"],
  aggressive: ["travel", "pursuit", "travel", "cultivate"],
  sword_seeking: ["cultivate", "travel"],
  body_seeking: ["cultivate", "travel"],
  alchemy_seeking: ["cultivate", "worldly"],
  fortune_seeking: ["pursuit", "travel", "pursuit", "cultivate"]
};

function plannedAction(policy: ContentSimPolicy, actionCount: number): ActionType {
  const plan = ACTION_PLAN[policy];
  return plan[actionCount % plan.length];
}
function desiredBuild(policy: ContentSimPolicy): string | undefined { return policy.endsWith("_seeking") ? policy.slice(0, -"_seeking".length) : undefined; }
function choose(policy: ContentSimPolicy, event: EventDefinition): ChoiceDefinition {
  const choices = event.choices ?? [];
  const find = (id: string): ChoiceDefinition | undefined => choices.find((choice) => choice.id === id);
  if (choices.length === 0) throw new TypeError(`event has no choices: ${event.id}`);
  if (choices.some((choice) => choice.threatId !== undefined)) return (policy === "aggressive" ? find("take-risk") : find("turn-away")) ?? choices[0];
  if (choices.some((choice) => choice.id.startsWith("bind-"))) return policy === "cautious" ? find("decline") ?? choices[0] : choices[0];
  const target = desiredBuild(policy);
  if (target !== undefined && event.directorHints?.buildAffinityTags.includes(target)) return find("engage") ?? choices[0];
  return policy === "cautious" ? find("consider") ?? choices[0] : find("engage") ?? choices[0];
}

function simulationContext(content: ContentRegistry, state: GameState, commandId: string) {
  return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId };
}
function increment(target: Record<string, number>, key: string, amount = 1): void { target[key] = (target[key] ?? 0) + amount; }
function incrementCause(target: Record<string, CauseCounters>, key: string, field: keyof CauseCounters, amount = 1): void {
  const value = target[key] ?? { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0 };
  value[field] += amount; target[key] = value;
}
function incrementRisk(target: Record<string, RiskCounters>, key: string, field: keyof RiskCounters, amount = 1): void {
  const value = target[key] ?? { exposures: 0, takeRisk: 0, turnAway: 0, deaths: 0 };
  value[field] += amount; target[key] = value;
}
function median(values: readonly number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function emptySlots(): Record<SimulationDirectorSlot, number> { return { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0 }; }
function emptyEvidence(): Record<BuildEvidenceCategory, number> { return { ordinary_event: 0, npc_event: 0, cause_echo: 0, risk_choice: 0, other: 0 }; }
function emptyBreakthroughs(): BreakthroughCounters { return { attempts: 0, failures: 0, successes: 0, greatSuccesses: 0 }; }

const causeEventIds = new Set(CONTENT01_PACK.causeTemplates.flatMap((template) => template.linkedEventIds));

function evidenceCategory(event: EventDefinition, choice: ChoiceDefinition): BuildEvidenceCategory {
  if (choice.threatId !== undefined) return "risk_choice";
  if (causeEventIds.has(event.id)) return "cause_echo";
  if ((event.participants?.length ?? 0) > 0) return "npc_event";
  return "ordinary_event";
}

function shouldAttemptBreakthrough(state: GameState, content: ContentRegistry): boolean {
  if ((state.run.realm.cultivationBps ?? state.run.realm.cultivation) !== 10_000 || state.run.identity.innateProfile === undefined) return false;
  const pack = content.getProgression(state.contentVersion);
  const realm = realmDefinition(pack, state.run.realm.id);
  if (realm.nextRealmId === undefined || realm.breakthroughDifficulty === undefined) return false;
  const buildPack = content.getBuild(state.contentVersion);
  const aggregate = aggregateProgressionModifiers(pack, state.run.identity.innateProfile, activeBuildProgressionSources(state, buildPack));
  const effectiveDifficulty = Math.max(100, Math.min(950, realm.breakthroughDifficulty + aggregate.breakthroughDifficultyDelta));
  const effectiveScore = roundHalfUpPositive(state.run.realm.realmFoundationBps ?? 0, 10) + aggregate.breakthroughScoreDelta;
  return effectiveScore >= effectiveDifficulty - 10;
}

function selectorSlots(output: ReduceOutput, slots: Record<SimulationDirectorSlot, number>): void {
  for (const raw of output.trace.selector ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const selected = entry.selectedPrecedenceLevel;
    if (typeof selected === "string" && ["P2", "P4", "P5", "P6"].includes(selected) && typeof entry.selectedEventId === "string") increment(slots, selected);
    if (entry.tier === "P3" && typeof entry.eventId === "string") increment(slots, "P3");
    if (entry.tier === "P0" && entry.result === "lifespan") increment(slots, "P1");
  }
}

function observeNpcTransitions(before: GameState, after: GameState, core: Record<string, number>, generatedIds: Set<string>): number {
  let generatedEncounters = 0;
  for (const npc of Object.values(after.run.npcs.byId)) {
    const previous = before.run.npcs.byId[npc.npcId]?.encounterCount ?? 0;
    const delta = Math.max(0, npc.encounterCount - previous);
    if (delta === 0) continue;
    if (npc.definitionId !== undefined) increment(core, npc.definitionId, delta);
    if (npc.originKind === "generated") { generatedEncounters += delta; generatedIds.add(npc.npcId); }
  }
  return generatedEncounters;
}

function observeCauseTransitions(before: GameState, after: GameState, byTemplate: Record<string, CauseCounters>, bindings: Record<string, number>, everEligible: Set<string>): CauseCounters {
  const delta: CauseCounters = { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0 };
  for (const cause of Object.values(after.run.causes.byId)) {
    const previous = before.run.causes.byId[cause.causeId];
    if (previous === undefined) {
      delta.origins += 1; incrementCause(byTemplate, cause.templateId, "origins");
      for (const actorId of Object.values(cause.actorIdsByRole)) {
        const definitionId = after.run.npcs.byId[actorId]?.definitionId;
        if (definitionId !== undefined) increment(bindings, definitionId);
      }
    }
    if ((cause.state === "eligible" || cause.echoCount > 0) && !everEligible.has(cause.causeId)) { everEligible.add(cause.causeId); delta.eligible += 1; incrementCause(byTemplate, cause.templateId, "eligible"); }
    const echoes = cause.echoCount - (previous?.echoCount ?? 0);
    if (echoes > 0) { delta.echoes += echoes; incrementCause(byTemplate, cause.templateId, "echoes", echoes); }
    if (cause.state === "resolved" && previous?.state !== "resolved") {
      delta.resolved += 1; incrementCause(byTemplate, cause.templateId, "resolved");
      if (cause.resolution?.action === "transform") { delta.transformed += 1; incrementCause(byTemplate, cause.templateId, "transformed"); }
    }
    if (cause.state === "expired" && previous?.state !== "expired") { delta.expired += 1; incrementCause(byTemplate, cause.templateId, "expired"); }
  }
  return delta;
}

function addCauseCounters(target: CauseCounters, delta: CauseCounters): void { for (const key of Object.keys(target) as Array<keyof CauseCounters>) target[key] += delta[key]; }
function addBreakthroughCounters(target: BreakthroughCounters, delta: BreakthroughCounters): void { for (const key of Object.keys(target) as Array<keyof BreakthroughCounters>) target[key] += delta[key]; }

function runOne(content: ContentRegistry, policy: ContentSimPolicy, seed: number, maxActions: number): CompactRunTelemetry {
  let state = initial(content, policy, seed);
  const realmStart = state.run.realm.id;
  let actionCount = 0; let eventChoiceCount = 0; let commandCount = 0; let cappedActions = 0; let bankingActions = 0;
  let maxCultivation = state.run.realm.cultivationBps ?? state.run.realm.cultivation; let maxFoundation = state.run.realm.realmFoundationBps ?? 0;
  let runtimeFailure = false; let deadlocked = false; let generatedNpcEncounters = 0;
  const realmTransitions: string[] = []; const breakthroughs = emptyBreakthroughs(); const buildEvidenceByCategory = emptyEvidence();
  const coreNpcEncounters: Record<string, number> = {}; const generatedIds = new Set<string>();
  const causeTotals: CauseCounters = { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0 };
  const causesByTemplate: Record<string, CauseCounters> = {}; const causeBindingsByCoreNpc: Record<string, number> = {}; const everEligibleCauseIds = new Set<string>();
  const directorSlots = emptySlots(); const eventSelections: Record<string, number> = {}; const first5EventIds: string[] = []; const riskByThreat: Record<string, RiskCounters> = {};
  const guardLimit = maxActions * 12 + 100;

  try {
    while (state.run.status === "active" && commandCount < guardLimit) {
      const currentEventId = state.run.events.current?.eventId;
      if (currentEventId === undefined && actionCount >= maxActions && !shouldAttemptBreakthrough(state, content)) break;
      const before = state;
      let output: ReduceOutput;
      let buildCategory: BuildEvidenceCategory = "other";

      if (currentEventId !== undefined) {
        const event = content.getEvent(state.contentVersion, currentEventId);
        const selected = choose(policy, event);
        buildCategory = evidenceCategory(event, selected);
        increment(eventSelections, event.id);
        if (first5EventIds.length < 5) first5EventIds.push(event.id);
        if (selected.threatId !== undefined) {
          incrementRisk(riskByThreat, selected.threatId, "exposures");
          incrementRisk(riskByThreat, selected.threatId, "takeRisk");
        } else {
          const threat = event.choices?.find((choice) => choice.threatId !== undefined)?.threatId;
          if (threat !== undefined) { incrementRisk(riskByThreat, threat, "exposures"); incrementRisk(riskByThreat, threat, "turnAway"); }
        }
        output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: event.id, optionId: selected.id }, context: simulationContext(content, state, `sim:${policy}:${seed}:${commandCount}:choice`) });
        eventChoiceCount += 1;
      } else if (shouldAttemptBreakthrough(state, content)) {
        output = reduce({ state, command: { type: "ATTEMPT_BREAKTHROUGH" }, context: simulationContext(content, state, `sim:${policy}:${seed}:${commandCount}:breakthrough`) });
        breakthroughs.attempts += 1;
        const tier = (output.trace.selector?.find((entry) => typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).kind === "breakthrough-check") as Record<string, unknown> | undefined)?.outcomeTier;
        if (tier === "failure") breakthroughs.failures += 1;
        else { breakthroughs.successes += 1; if (tier === "greatSuccess") breakthroughs.greatSuccesses += 1; }
      } else {
        const cultivationAtCap = (state.run.realm.cultivationBps ?? state.run.realm.cultivation) === 10_000;
        const actionId = cultivationAtCap ? "cultivate" : plannedAction(policy, actionCount);
        if (cultivationAtCap) { cappedActions += 1; bankingActions += 1; }
        output = reduce({ state, command: { type: "CHOOSE_ACTION", actionId }, context: simulationContext(content, state, `sim:${policy}:${seed}:${commandCount}:action`) });
        actionCount += 1;
      }

      state = output.state; commandCount += 1;
      if (state.stateVersion <= before.stateVersion) { deadlocked = true; break; }
      selectorSlots(output, directorSlots);
      generatedNpcEncounters += observeNpcTransitions(before, state, coreNpcEncounters, generatedIds);
      addCauseCounters(causeTotals, observeCauseTransitions(before, state, causesByTemplate, causeBindingsByCoreNpc, everEligibleCauseIds));
      if (state.run.realm.id !== before.run.realm.id) realmTransitions.push(`${before.run.realm.id}->${state.run.realm.id}`);
      const newBuildFacts = (state.run.build.evidenceFacts?.length ?? 0) - (before.run.build.evidenceFacts?.length ?? 0);
      if (newBuildFacts > 0) increment(buildEvidenceByCategory, buildCategory, newBuildFacts);
      maxCultivation = Math.max(maxCultivation, state.run.realm.cultivationBps ?? state.run.realm.cultivation);
      maxFoundation = Math.max(maxFoundation, state.run.realm.realmFoundationBps ?? 0);
    }
    if (state.run.status === "active" && commandCount >= guardLimit) deadlocked = true;
  } catch {
    runtimeFailure = true;
  }

  const buildStages = Object.fromEntries(BUILD_V1.definitions.map((definition) => [definition.id, buildStage(BUILD_V1.rules, state.run.build.affinities?.[definition.id]?.affinityBps ?? 0)]));
  const templateCounts: Record<string, number> = {};
  for (const cause of Object.values(state.run.causes.byId)) increment(templateCounts, cause.templateId);
  const maxEchoesPerCauseByTemplate: Record<string, number> = {};
  for (const cause of Object.values(state.run.causes.byId)) maxEchoesPerCauseByTemplate[cause.templateId] = Math.max(maxEchoesPerCauseByTemplate[cause.templateId] ?? 0, cause.echoCount);
  const maxSameTemplateInstances = Math.max(0, ...Object.values(templateCounts));
  let endReason: SimulationEndReason = "other";
  if (state.run.status === "active" && actionCount >= maxActions) endReason = "right_censored";
  else if (state.run.deathRecord?.category === "lifespan") endReason = "lifespan";
  else if (state.run.deathRecord !== undefined) endReason = "death";
  else if (state.run.status === "dying" || state.run.status === "ended") endReason = "ending";
  if (state.run.deathRecord !== undefined) {
    const threatId = typeof state.run.deathRecord.trace.threatId === "string" ? state.run.deathRecord.trace.threatId : state.run.deathRecord.immediateSource;
    incrementRisk(riskByThreat, threatId, "deaths");
  }
  return {
    seed, policy, actionCount, nodeIndex: state.run.nodeIndex, eventChoiceCount, commandCount, endReason, runtimeFailure, deadlocked,
    realmStart, realmEnd: state.run.realm.id, realmTransitions, breakthroughs,
    breakthroughAttempts: breakthroughs.attempts, breakthroughFailures: breakthroughs.failures, breakthroughSuccesses: breakthroughs.successes, breakthroughGreatSuccesses: breakthroughs.greatSuccesses,
    cultivation: { maxBps: maxCultivation, finalBps: state.run.realm.cultivationBps ?? state.run.realm.cultivation, cappedActions },
    foundation: { maxBps: maxFoundation, finalBps: state.run.realm.realmFoundationBps ?? 0, bankingActions },
    buildStages, ...(state.run.build.dominantBuildId === undefined ? {} : { dominantBuild: state.run.build.dominantBuildId }), buildEvidenceByCategory, buildEvidenceBySource: { ...buildEvidenceByCategory },
    coreNpcEncounters, coreNpcEncounterIds: Object.keys(coreNpcEncounters).sort(), generatedNpcEncounters, generatedNpcInstanceIds: [...generatedIds].sort(), promotedGeneratedNpcCount: Object.values(state.run.npcs.byId).filter((npc) => npc.originKind === "generated" && npc.promotedToA).length,
    causeTotals, causeOrigins: causeTotals.origins, causeEligible: causeTotals.eligible, causeEchoes: causeTotals.echoes, causeResolved: causeTotals.resolved, causeExpired: causeTotals.expired, causeTransformed: causeTotals.transformed,
    causesByTemplate, maxEchoesPerCauseByTemplate, causeBindingsByCoreNpc, maxSameTemplateInstances,
    directorSlots, directorSlotCounts: { ...directorSlots }, eventSelections, eventSelectionCounts: { ...eventSelections }, first5EventIds,
    maxEventRepeats: Math.max(0, ...Object.values(eventSelections)), sameEventMaxOccurrencesPerRun: Math.max(0, ...Object.values(eventSelections)), riskByThreat,
    riskExposuresByThreat: Object.fromEntries(Object.entries(riskByThreat).map(([id, value]) => [id, value.exposures])), riskDeathsByThreat: Object.fromEntries(Object.entries(riskByThreat).map(([id, value]) => [id, value.deaths])),
    ...(state.run.deathRecord === undefined ? {} : { deathCategory: state.run.deathRecord.category, deathCauseId: state.run.deathRecord.deathCauseId }), AIcalls: 0
  };
}

function validateOptions(options: ContentSimulationOptions): { policies: ContentSimPolicy[]; seedStart: number; seedEndExclusive: number; maxActions: number } {
  const policies = [...(options.policies ?? CONTENT_SIM_POLICIES)];
  const seedStart = options.seedStart ?? 0;
  const seedEndExclusive = options.seedEndExclusive ?? (options.runsPerPolicy === undefined ? 100 : seedStart + options.runsPerPolicy);
  const maxActions = options.maxActions ?? 50;
  if (policies.length === 0 || new Set(policies).size !== policies.length || policies.some((policy) => !CONTENT_SIM_POLICIES.includes(policy))) throw new RangeError("policies must be unique known policies");
  for (const [name, value] of [["seedStart", seedStart], ["seedEndExclusive", seedEndExclusive], ["maxActions", maxActions]] as const) if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`);
  if (seedStart < 0 || seedEndExclusive <= seedStart || maxActions < 1) throw new RangeError("invalid simulation range");
  return { policies, seedStart, seedEndExclusive, maxActions };
}

export function runContentSimulation(options: ContentSimulationOptions = {}): ContentSimulationReport {
  const config = validateOptions(options); const content = registry(); const runTelemetry: CompactRunTelemetry[] = [];
  for (const policy of config.policies) for (let seed = config.seedStart; seed < config.seedEndExclusive; seed += 1) runTelemetry.push(runOne(content, policy, seed, config.maxActions));
  const actions = runTelemetry.map((run) => run.actionCount); const nodes = runTelemetry.map((run) => run.nodeIndex);
  const endReasonDistribution = { death: 0, lifespan: 0, ending: 0, right_censored: 0, other: 0 } satisfies Record<SimulationEndReason, number>;
  const deathCauseDistribution: Record<string, number> = {}; const realmDistribution: Record<string, number> = {}; const realmTransitionDistribution: Record<string, number> = {};
  const breakthrough = emptyBreakthroughs(); const buildStageDistribution: Record<string, BuildStageCounts> = {}; const formedBuildDistribution: Record<string, number> = {}; const refinedBuildDistribution: Record<string, number> = {}; const dominantBuildDistribution: Record<string, number> = {}; const buildEvidenceByCategory = emptyEvidence();
  const coreNpcEncounterDistribution: Record<string, number> = {}; const coreNpcRepeatEncounterDistribution: Record<string, number> = {}; const coreNpcCauseBindingDistribution: Record<string, number> = {}; const generatedNpcInstances = new Set<string>();
  const causeByTemplate: ContentSimulationReport["causeByTemplate"] = {}; const causeByChain: ContentSimulationReport["causeByChain"] = {}; const directorSlotDistribution = emptySlots(); const riskByThreat: Record<string, RiskCounters> = {}; const riskByPolicy: Record<string, Record<string, RiskCounters>> = {}; const eventSelectionFrequency: Record<string, number> = {}; const npcIds = new Set<string>();
  const firstSequences = new Set<string>();
  for (const run of runTelemetry) {
    endReasonDistribution[run.endReason] += 1; increment(realmDistribution, run.realmEnd); addBreakthroughCounters(breakthrough, run.breakthroughs);
    if (run.deathCauseId !== undefined) increment(deathCauseDistribution, run.deathCauseId);
    for (const transition of run.realmTransitions) increment(realmTransitionDistribution, transition);
    for (const [buildId, stage] of Object.entries(run.buildStages)) {
      const counts = buildStageDistribution[buildId] ?? { latent: 0, emerging: 0, formed: 0, refined: 0 }; counts[stage] += 1; buildStageDistribution[buildId] = counts;
      if (stage === "formed" || stage === "refined") increment(formedBuildDistribution, buildId); if (stage === "refined") increment(refinedBuildDistribution, buildId);
    }
    if (run.dominantBuild !== undefined) increment(dominantBuildDistribution, run.dominantBuild);
    for (const [key, value] of Object.entries(run.buildEvidenceByCategory)) increment(buildEvidenceByCategory, key, value);
    for (const [npcId, count] of Object.entries(run.coreNpcEncounters)) { increment(coreNpcEncounterDistribution, npcId, count); if (count > 1) increment(coreNpcRepeatEncounterDistribution, npcId, count - 1); npcIds.add(npcId); }
    for (const [npcId, count] of Object.entries(run.causeBindingsByCoreNpc)) increment(coreNpcCauseBindingDistribution, npcId, count);
    for (const id of run.generatedNpcInstanceIds) { generatedNpcInstances.add(`${run.policy}:${run.seed}:${id}`); npcIds.add(id); }
    for (const [templateId, counters] of Object.entries(run.causesByTemplate)) {
      const aggregate = causeByTemplate[templateId] ?? { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0, maxEchoesPerCauseInstance: 0, maxSameTemplateInstancesPerRun: 0 };
      for (const key of ["origins", "eligible", "echoes", "resolved", "expired", "transformed"] as const) aggregate[key] += counters[key];
      aggregate.maxEchoesPerCauseInstance = Math.max(aggregate.maxEchoesPerCauseInstance, run.maxEchoesPerCauseByTemplate[templateId] ?? 0);
      aggregate.maxSameTemplateInstancesPerRun = Math.max(aggregate.maxSameTemplateInstancesPerRun, counters.origins); causeByTemplate[templateId] = aggregate;
    }
    for (const [key, value] of Object.entries(run.directorSlots)) increment(directorSlotDistribution, key, value);
    const policyRisk = riskByPolicy[run.policy] ?? {};
    for (const [threatId, counters] of Object.entries(run.riskByThreat)) for (const key of ["exposures", "takeRisk", "turnAway", "deaths"] as const) { incrementRisk(riskByThreat, threatId, key, counters[key]); incrementRisk(policyRisk, threatId, key, counters[key]); }
    riskByPolicy[run.policy] = policyRisk;
    for (const [eventId, count] of Object.entries(run.eventSelections)) increment(eventSelectionFrequency, eventId, count);
    firstSequences.add(run.first5EventIds.join("|"));
  }
  for (const template of [...CONTENT01_PACK.causeTemplates].sort((left, right) => left.id.localeCompare(right.id))) causeByTemplate[template.id] ??= { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0, maxEchoesPerCauseInstance: 0, maxSameTemplateInstancesPerRun: 0 };
  const threatIds = content.getRisk(CONTENT01_VERSION).threats.map((threat) => threat.id).sort();
  for (const threatId of threatIds) riskByThreat[threatId] ??= { exposures: 0, takeRisk: 0, turnAway: 0, deaths: 0 };
  for (const policy of config.policies) {
    const values = riskByPolicy[policy] ?? {};
    for (const threatId of threatIds) values[threatId] ??= { exposures: 0, takeRisk: 0, turnAway: 0, deaths: 0 };
    riskByPolicy[policy] = values;
  }
  for (const chain of CONTENT01_CAUSE_CHAINS) {
    const aggregate = { origins: 0, eligible: 0, echoes: 0, resolved: 0, expired: 0, transformed: 0, maxEchoesPerCauseInstance: 0, maxSameTemplateInstancesPerRun: 0 };
    for (const templateId of chain.templates) {
      const value = causeByTemplate[templateId]; if (value === undefined) continue;
      for (const key of ["origins", "eligible", "echoes", "resolved", "expired", "transformed"] as const) aggregate[key] += value[key];
      aggregate.maxEchoesPerCauseInstance = Math.max(aggregate.maxEchoesPerCauseInstance, value.maxEchoesPerCauseInstance);
    }
    for (const run of runTelemetry) aggregate.maxSameTemplateInstancesPerRun = Math.max(aggregate.maxSameTemplateInstancesPerRun, chain.templates.reduce((sum, templateId) => sum + (run.causesByTemplate[templateId]?.origins ?? 0), 0));
    causeByChain[chain.id] = aggregate;
  }
  const top10EventFrequency = Object.entries(eventSelectionFrequency).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 10).map(([eventId, count]) => ({ eventId, count }));
  const linked = new Set(CONTENT01_PACK.causeTemplates.flatMap((template) => template.linkedEventIds)); const ordinaryIds = new Set(CONTENT01_PACK.events.filter((event) => event.tags.includes("ordinary") && !linked.has(event.id)).map((event) => event.id)); const ordinaryTotal = Object.entries(eventSelectionFrequency).filter(([id]) => ordinaryIds.has(id)).reduce((sum, [, count]) => sum + count, 0); const repeatViolations = ordinaryTotal === 0 ? 0 : Object.entries(eventSelectionFrequency).filter(([id, count]) => ordinaryIds.has(id) && count * 100 > ordinaryTotal * 35).length;
  const policyMetrics: ContentSimulationReport["policyMetrics"] = {};
  for (const policy of config.policies) {
    const runs = runTelemetry.filter((run) => run.policy === policy); const policyNodes = runs.map((run) => run.nodeIndex); const policyActions = runs.map((run) => run.actionCount); const realms: Record<string, number> = {}; const attempts = emptyBreakthroughs();
    for (const run of runs) { increment(realms, run.realmEnd); addBreakthroughCounters(attempts, run.breakthroughs); }
    const target = desiredBuild(policy); const targetId = target === undefined ? undefined : `build.${target}`;
    const formed = targetId === undefined ? 0 : runs.filter((run) => ["formed", "refined"].includes(run.buildStages[targetId])).length; const refined = targetId === undefined ? 0 : runs.filter((run) => run.buildStages[targetId] === "refined").length;
    policyMetrics[policy] = { runs: runs.length, actionsAverage: average(policyActions), nodesAverage: average(policyNodes), nodesMedian: median(policyNodes), deaths: runs.filter((run) => run.deathCategory !== undefined).length, rightCensoredRuns: runs.filter((run) => run.endReason === "right_censored").length, realmDistribution: realms, breakthroughs: attempts, causeEchoes: runs.reduce((sum, run) => sum + run.causeTotals.echoes, 0), npcEncounters: runs.reduce((sum, run) => sum + Object.values(run.coreNpcEncounters).reduce((inner, value) => inner + value, 0) + run.generatedNpcEncounters, 0), targetBuildFormationRate: targetId === undefined ? 0 : formed / runs.length, targetBuildRefinedRate: targetId === undefined ? 0 : refined / runs.length };
  }
  const coreNpcMetrics: ContentSimulationReport["coreNpcMetrics"] = {};
  for (const definition of NPC_CONTENT01_V1.coreDefinitions) {
    const selections = runTelemetry.map((run) => run.coreNpcEncounters[definition.id] ?? 0).filter((count) => count > 0);
    coreNpcMetrics[definition.id] = { encounterRuns: selections.length, eventSelections: selections.reduce((sum, count) => sum + count, 0), maxSelectionsInOneRun: Math.max(0, ...selections), medianSelectionsPerEncounterRun: median(selections), causeBindings: coreNpcCauseBindingDistribution[definition.id] ?? 0 };
  }
  const deaths = runTelemetry.filter((run) => run.deathCategory !== undefined).length; const lifespanDeaths = runTelemetry.filter((run) => run.deathCategory === "lifespan").length;
  return {
    config, runs: runTelemetry.length, runtimeFailures: runTelemetry.filter((run) => run.runtimeFailure).length, deadlocks: runTelemetry.filter((run) => run.deadlocked).length,
    actionsMin: Math.min(...actions), actionsMedian: median(actions), actionsAverage: average(actions), actionsMax: Math.max(...actions), nodesMin: Math.min(...nodes), nodesMedian: median(nodes), nodesAverage: average(nodes), nodesMax: Math.max(...nodes), rightCensoredRuns: endReasonDistribution.right_censored, endReasonDistribution,
    deaths, lifespanDeaths, riskDeaths: deaths - lifespanDeaths, deathCauseDistribution, realmDistribution, realmTransitionDistribution, breakthrough,
    buildStageDistribution, formedBuildDistribution, refinedBuildDistribution, dominantBuildDistribution, buildEvidenceByCategory,
    coreNpcEncounterDistribution, coreNpcRepeatEncounterDistribution, coreNpcCauseBindingDistribution,
    generatedNpcEncounterCount: runTelemetry.reduce((sum, run) => sum + run.generatedNpcEncounters, 0), generatedNpcInstanceCount: generatedNpcInstances.size, promotedGeneratedNpcCount: runTelemetry.reduce((sum, run) => sum + run.promotedGeneratedNpcCount, 0),
    causeOriginCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.origins, 0), causeEligibleCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.eligible, 0), causeEchoCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.echoes, 0), causeResolvedCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.resolved, 0), causeExpiredCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.expired, 0), causeTransformedCount: runTelemetry.reduce((sum, run) => sum + run.causeTotals.transformed, 0), causeByTemplate, causeByChain, coreNpcMetrics,
    directorSlotDistribution, riskByThreat, riskByPolicy, uniqueEventsSeen: Object.keys(eventSelectionFrequency).length, eventSelectionFrequency, top10EventFrequency, first5NodeSequenceDiversity: firstSequences.size, npcEncounterDiversity: npcIds.size, repeatViolations, policyMetrics, runTelemetry, AIcalls: 0
  };
}
