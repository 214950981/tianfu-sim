import { evaluateCondition, resolveScoreCheck, scoreCheckBase, type OutcomeTier } from "./event.ts";
import { clampInteger, safeAdd } from "./numeric.ts";
import type { GameState, RiskConditionInstance, DeathRecord } from "./state.ts";

export const RISK_MODIFIER_KEYS = ["riskScoreDelta", "riskDifficultyDelta", "consequenceSeverityDelta"] as const;
export type RiskModifierKey = typeof RISK_MODIFIER_KEYS[number];
export interface RiskModifier { kind: RiskModifierKey; value: number; systemOwner: string }
export interface RiskHook { id: string; systemOwner: string; order: number }
export interface RiskModifierSource { id: string; modifiers: RiskModifier[]; hooks: RiskHook[]; systemOwners: string[] }
export interface RiskConditionDefinition extends RiskModifierSource { tags: string[] }
export interface DeathCauseDefinition { id: string; category: string; displayName: string; tags: string[] }
export interface RiskConsequence {
  injuryDelta: number;
  conditionAdds: Array<{ definitionId: string; severity: 1 | 2 | 3; visibility: "explicit" | "hinted" | "hidden"; tags: string[] }>;
}
export interface ThreatDefinition extends RiskModifierSource {
  tags: string[];
  category: string;
  checkSpec: Readonly<Record<string, unknown>>;
  outcomeTable: Readonly<Record<OutcomeTier, RiskConsequence>>;
  lethalityPolicy?: { lethalOnFailure: true; requiresPublicWarning: true; prerequisites: unknown[] };
  deathCauseId?: string;
}
export interface RiskPack {
  id: string;
  version: number;
  rulesVersion: string;
  manifest: { threatCount: number; riskConditionCount: number; deathCauseCount: number };
  injuryScoreModifiers: Readonly<Record<"0" | "1" | "2" | "3", number>>;
  threats: ThreatDefinition[];
  riskConditions: RiskConditionDefinition[];
  deathCauses: DeathCauseDefinition[];
  hookWhitelist: string[];
}
export interface RiskContentAccess { getRisk(contentVersion: string): RiskPack }
export interface ThreatInstance {
  definitionId: string;
  sourceCauseId?: string;
  sourceActorId?: string;
}
export interface RiskPresentationData { tier: "low" | "caution" | "dangerous" | "lethal"; canBeFatal: boolean; reasons: string[] }
export interface RiskAggregate { riskScoreDelta: number; riskDifficultyDelta: number; consequenceSeverityDelta: number; sources: string[] }
export interface ResolveThreatOptions {
  commandId: string;
  sourceEventId?: string;
  sourceCauseId?: string;
  sourceActorId?: string;
  presentedRisk: RiskPresentationData;
  acceptedPublicWarning: boolean;
  modifierSources?: readonly RiskModifierSource[];
}
export interface RiskResolution {
  state: GameState;
  tier: OutcomeTier;
  presentation: RiskPresentationData;
  deathRecord?: DeathRecord;
  rngDraws: import("./rng.ts").RngTrace[];
  trace: Readonly<Record<string, unknown>>;
}

export class RiskResolutionError extends Error {
  constructor(message: string) { super(message); this.name = "RiskResolutionError"; }
}

export function threatDefinition(pack: RiskPack, id: string): ThreatDefinition {
  const definition = pack.threats.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new RiskResolutionError(`unknown ThreatDefinition ${id}`);
  return definition;
}

function conditionDefinition(pack: RiskPack, id: string): RiskConditionDefinition {
  const definition = pack.riskConditions.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new RiskResolutionError(`unknown RiskConditionDefinition ${id}`);
  return definition;
}

export function injuryLevel(state: GameState): 0 | 1 | 2 | 3 {
  return Math.min(3, state.run.conditions.filter((condition) => condition.kind === "injury").reduce((maximum, condition) => Math.max(maximum, condition.stacks), 0)) as 0 | 1 | 2 | 3;
}

export function aggregateRiskModifiers(sources: readonly RiskModifierSource[]): RiskAggregate {
  const totals: Record<RiskModifierKey, number> = { riskScoreDelta: 0, riskDifficultyDelta: 0, consequenceSeverityDelta: 0 };
  const ordered = [...sources].sort((left, right) => left.id.localeCompare(right.id));
  for (const source of ordered) {
    for (const modifier of [...source.modifiers].sort((left, right) => left.kind.localeCompare(right.kind) || left.value - right.value)) {
      if (modifier.systemOwner === "RISK01") totals[modifier.kind] = safeAdd(totals[modifier.kind], modifier.value);
    }
  }
  return {
    riskScoreDelta: clampInteger(totals.riskScoreDelta, -120, 120),
    riskDifficultyDelta: clampInteger(totals.riskDifficultyDelta, -120, 120),
    consequenceSeverityDelta: clampInteger(totals.consequenceSeverityDelta, -3, 3),
    sources: ordered.map((source) => source.id)
  };
}

export function orderedRiskHooks(pack: RiskPack, sources: readonly RiskModifierSource[]): Array<RiskHook & { sourceId: string }> {
  const whitelist = new Set(pack.hookWhitelist);
  return [...sources].sort((left, right) => left.id.localeCompare(right.id)).flatMap((source) => source.hooks.filter((hook) => hook.systemOwner === "RISK01").map((hook) => ({ ...hook, sourceId: source.id }))).map((hook) => {
    if (!whitelist.has(hook.id)) throw new RiskResolutionError(`unknown risk hook ${hook.id}`);
    return hook;
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id) || left.sourceId.localeCompare(right.sourceId));
}

function activeSources(state: GameState, pack: RiskPack, threat: ThreatDefinition, extras: readonly RiskModifierSource[] = []): RiskModifierSource[] {
  const conditionSources = (state.run.risk?.conditions ?? []).map((condition) => conditionDefinition(pack, condition.definitionId));
  return [threat, ...conditionSources, ...extras];
}

function lethalPrerequisitesMet(state: GameState, definition: ThreatDefinition): boolean {
  const policy = definition.lethalityPolicy;
  return policy !== undefined && policy.lethalOnFailure && policy.prerequisites.every((condition) => evaluateCondition(condition, state));
}

export function buildRiskPresentation(state: GameState, definition: ThreatDefinition): RiskPresentationData {
  const canBeFatal = lethalPrerequisitesMet(state, definition);
  const failure = definition.outcomeTable.failure;
  const tier: RiskPresentationData["tier"] = canBeFatal ? "lethal" : failure.injuryDelta >= 2 || failure.conditionAdds.some((condition) => condition.severity === 3) ? "dangerous" : definition.outcomeTable.costlySuccess.injuryDelta > 0 || definition.outcomeTable.costlySuccess.conditionAdds.length > 0 ? "caution" : "low";
  const reasons = [`risk.category.${definition.category}`];
  if (injuryLevel(state) > 0) reasons.push("risk.reason.injury");
  return { tier, canBeFatal, reasons };
}

function applyInjury(state: GameState, delta: number, sourceRef: string): GameState {
  if (delta <= 0) return state;
  const current = injuryLevel(state); const nextLevel = Math.min(3, safeAdd(current, delta));
  const injuryIndex = state.run.conditions.findIndex((condition) => condition.kind === "injury" && condition.stacks === current);
  const conditions = injuryIndex < 0
    ? [...state.run.conditions, { id: "condition.risk.injury", kind: "injury" as const, stacks: nextLevel, sourceRef }]
    : state.run.conditions.map((condition, index) => index === injuryIndex ? { ...condition, stacks: nextLevel, sourceRef } : condition);
  return { ...state, run: { ...state.run, conditions } };
}

function applyRiskConditions(state: GameState, additions: RiskConsequence["conditionAdds"], sourceRef: string): GameState {
  if (additions.length === 0) return state;
  const existing = state.run.risk?.conditions ?? []; const created: RiskConditionInstance[] = additions.map((addition, index) => ({
    id: `risk-condition:${sourceRef}:${addition.definitionId}:${index}`,
    definitionId: addition.definitionId,
    severity: addition.severity,
    sourceRefs: [sourceRef],
    createdAge: state.run.age,
    createdNodeIndex: state.run.nodeIndex,
    visibility: addition.visibility,
    tags: [...addition.tags]
  }));
  return { ...state, run: { ...state.run, risk: { conditions: [...existing, ...created], exposureCount: safeAdd(state.run.risk?.exposureCount ?? 0, 0) } } };
}

function deathRecord(state: GameState, pack: RiskPack, definition: ThreatDefinition, options: ResolveThreatOptions, trace: Readonly<Record<string, unknown>>): DeathRecord {
  const causeId = definition.deathCauseId;
  if (causeId === undefined || !pack.deathCauses.some((candidate) => candidate.id === causeId)) throw new RiskResolutionError("lethal Threat requires a registered DeathCauseDefinition");
  const contributing = [definition.id, options.sourceCauseId, options.sourceActorId].filter((value): value is string => value !== undefined).sort();
  return {
    deathCauseId: causeId,
    category: definition.category,
    age: state.run.age,
    realmId: state.run.realm.id,
    immediateSource: definition.id,
    contributingSourceRefs: contributing,
    warningFacts: [...options.presentedRisk.reasons],
    sourceCommandId: options.commandId,
    ...(options.sourceEventId === undefined ? {} : { sourceEventId: options.sourceEventId }),
    ...(options.sourceCauseId === undefined ? {} : { sourceCauseId: options.sourceCauseId }),
    ...(options.sourceActorId === undefined ? {} : { sourceActorId: options.sourceActorId }),
    trace: { ...trace }
  };
}

export function resolveThreat(state: GameState, pack: RiskPack, instance: ThreatInstance, options: ResolveThreatOptions): RiskResolution {
  const definition = threatDefinition(pack, instance.definitionId);
  const presentation = buildRiskPresentation(state, definition);
  if (JSON.stringify(presentation) !== JSON.stringify(options.presentedRisk)) throw new RiskResolutionError("RiskPresentation does not match authoritative pre-submit projection");
  if (presentation.canBeFatal && (!definition.lethalityPolicy?.requiresPublicWarning || !options.presentedRisk.canBeFatal || !options.acceptedPublicWarning)) throw new RiskResolutionError("lethal Threat requires an accepted public warning");
  const resolvedOptions: ResolveThreatOptions = { ...options, sourceCauseId: options.sourceCauseId ?? instance.sourceCauseId, sourceActorId: options.sourceActorId ?? instance.sourceActorId };
  const sources = activeSources(state, pack, definition, options.modifierSources); orderedRiskHooks(pack, sources);
  const aggregate = aggregateRiskModifiers(sources);
  const injuryPenalty = pack.injuryScoreModifiers[String(injuryLevel(state)) as "0" | "1" | "2" | "3"];
  const baseScore = safeAdd(scoreCheckBase(state, definition.checkSpec), safeAdd(injuryPenalty, aggregate.riskScoreDelta));
  const rawDifficulty = definition.checkSpec.difficulty;
  if (typeof rawDifficulty !== "number" || !Number.isSafeInteger(rawDifficulty)) throw new RiskResolutionError("invalid Threat CheckSpec difficulty");
  const effectiveDifficulty = clampInteger(safeAdd(rawDifficulty, aggregate.riskDifficultyDelta), 0, 1000);
  const checked = resolveScoreCheck(state, baseScore, effectiveDifficulty);
  const consequence = definition.outcomeTable[checked.tier];
  const severityDelta = aggregate.consequenceSeverityDelta;
  const injuryDelta = clampInteger(safeAdd(consequence.injuryDelta, severityDelta), 0, 3);
  const conditionAdds = consequence.conditionAdds.map((condition) => ({ ...condition, severity: clampInteger(safeAdd(condition.severity, severityDelta), 1, 3) as 1 | 2 | 3 }));
  let next = applyRiskConditions(applyInjury(checked.state, injuryDelta, options.commandId), conditionAdds, options.commandId);
  next = { ...next, run: { ...next.run, risk: { conditions: [...(next.run.risk?.conditions ?? [])], exposureCount: safeAdd(next.run.risk?.exposureCount ?? 0, 1) } } };
  const lethal = checked.tier === "failure" && presentation.canBeFatal;
  const trace = { resolver: "RISK01", threatId: definition.id, outcomeTier: checked.tier, baseScore, effectiveDifficulty, rngRoll: checked.rngRoll, injuryLevelBefore: injuryLevel(state), injuryLevelAfter: injuryLevel(next), modifierSources: aggregate.sources, lethal };
  let record: DeathRecord | undefined;
  if (lethal) {
    record = deathRecord(next, pack, definition, resolvedOptions, trace);
    next = { ...next, run: { ...next.run, status: "dying", deathRecord: record, ending: { endingId: `death:${record.deathCauseId}`, deathCause: record.category, sourceRef: options.commandId, age: next.run.age, factIds: [] } } };
  }
  return { state: next, tier: checked.tier, presentation, ...(record === undefined ? {} : { deathRecord: record }), rngDraws: checked.rngDraws, trace };
}
