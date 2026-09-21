import { evaluateCondition } from "./event.ts";
import { assertSafeInteger, clampInteger, roundHalfUpPositive, safeAdd, safeMultiply } from "./numeric.ts";
import { PROGRESSION_MODIFIER_KEYS, type ProgressionModifier, type ProgressionModifierSource } from "./progression.ts";
import { RISK_MODIFIER_KEYS, type RiskHook, type RiskModifier, type RiskModifierSource } from "./risk.ts";
import type { BuildAffinity, BuildEvidenceFact, BuildTransitionFact, GameState } from "./state.ts";

export const BUILD_STAGES = ["latent", "emerging", "formed", "refined"] as const;
export type BuildStage = typeof BUILD_STAGES[number];
export type BuildModifierKind = ProgressionModifier["kind"] | RiskModifier["kind"];
export interface BuildModifier { kind: BuildModifierKind; value: number; systemOwner: string }
export interface BuildHook { id: string; systemOwner: string; order: number }
export interface BuildStageDefinition { stage: BuildStage; labelKey: string; modifiers: BuildModifier[]; hooks: BuildHook[] }
export type BuildConditionExpr = unknown;
export interface BuildDefinition {
  id: string; displayName: string; familyTags: string[]; tags: string[]; stages: BuildStageDefinition[];
  modifiers: BuildModifier[]; hooks: BuildHook[]; requiresTags: string[]; forbidsTags: string[];
  compatibleWith: string[]; conflictsWith: string[]; parentBuildIds: string[];
  unlockConditions?: BuildConditionExpr[]; focusPressureBpsByBuildId?: Record<string, number>; systemOwners: string[];
}
export interface BuildRules {
  stageThresholds: Record<BuildStage, { min: number; max: number }>;
  defaultFocusPressureBps: number; dominantSwitchMargin: number;
  evidence: { min: number; max: number; guidelines: { minor: [number, number]; explicit: [number, number]; major: [number, number]; decisive: [number, number] } };
}
export interface BuildPack { id: string; version: number; rulesVersion: string; manifest: { buildCount: number }; rules: BuildRules; definitions: BuildDefinition[]; hookWhitelist: string[] }
export interface BuildContentAccess { getBuild(contentVersion: string): BuildPack }
export interface BuildEvidenceEffect { buildId: string; amount: number; reasonTag: string }
export interface BuildEvidenceSource { commandId: string; sourceRef: string }
export interface BuildApplication { state: GameState; facts: Array<BuildEvidenceFact | BuildTransitionFact> }
export interface DirectorBuildSignals {
  dominantBuildId?: string;
  builds: Array<{ buildId: string; stage: BuildStage; tags: string[] }>;
  recentEvidenceFacts: BuildEvidenceFact[];
  transitionFacts: BuildTransitionFact[];
}

const definitionIndexes = new WeakMap<BuildPack, Map<string, BuildDefinition>>();
function definitionIndex(pack: BuildPack): Map<string, BuildDefinition> {
  let index = definitionIndexes.get(pack); if (index === undefined) { index = new Map(pack.definitions.map((definition) => [definition.id, definition])); definitionIndexes.set(pack, index); } return index;
}
export function buildDefinition(pack: BuildPack, buildId: string): BuildDefinition { const definition = definitionIndex(pack).get(buildId); if (definition === undefined) throw new RangeError(`unknown BuildDefinition ${buildId}`); return definition; }

export function buildStage(rules: BuildRules, affinityBps: number): BuildStage {
  assertSafeInteger(affinityBps, "affinityBps"); if (affinityBps < 0 || affinityBps > 10_000) throw new RangeError("affinityBps must be 0..10000");
  for (const stage of [...BUILD_STAGES].reverse()) if (affinityBps >= rules.stageThresholds[stage].min) return stage;
  return "latent";
}
function stageRank(stage: BuildStage): number { return BUILD_STAGES.indexOf(stage); }
export function buildStageAtLeast(rules: BuildRules, affinityBps: number, expected: BuildStage): boolean { return stageRank(buildStage(rules, affinityBps)) >= stageRank(expected); }

function buildTags(state: GameState, pack: BuildPack): Set<string> {
  const tags = new Set([...state.run.identity.rootTags, ...state.run.world.tags]);
  for (const affinity of Object.values(state.run.build.affinities ?? {})) if (affinity.affinityBps > 0) for (const tag of buildDefinition(pack, affinity.buildId).tags) tags.add(tag);
  return tags;
}
function eligibleByTags(state: GameState, pack: BuildPack, definition: BuildDefinition): boolean { const tags = buildTags(state, pack); return definition.requiresTags.every((tag) => tags.has(tag)) && definition.forbidsTags.every((tag) => !tags.has(tag)); }

function recordValue(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
export function evaluateBuildCondition(value: unknown, state: GameState, pack: BuildPack, depth = 0): boolean {
  if (depth > 32) throw new RangeError("BuildConditionExpr nesting exceeds 32 levels"); const condition = recordValue(value); if (condition === undefined || Object.keys(condition).length !== 1) throw new TypeError("invalid BuildConditionExpr"); const op = Object.keys(condition)[0]; const operand = condition[op];
  if (op === "all" || op === "any") { if (!Array.isArray(operand)) throw new TypeError("invalid BuildConditionExpr group"); const values = operand.map((entry) => evaluateBuildCondition(entry, state, pack, depth + 1)); return op === "all" ? values.every(Boolean) : values.some(Boolean); }
  if (op === "not") return !evaluateBuildCondition(operand, state, pack, depth + 1);
  if (op === "buildAffinityGte") { if (!Array.isArray(operand) || operand.length !== 2 || typeof operand[0] !== "string" || typeof operand[1] !== "number" || !Number.isSafeInteger(operand[1])) throw new TypeError("invalid buildAffinityGte"); return (state.run.build.affinities?.[operand[0]]?.affinityBps ?? 0) >= operand[1]; }
  if (op === "buildStageIs") { if (!Array.isArray(operand) || operand.length !== 2 || typeof operand[0] !== "string" || !BUILD_STAGES.includes(operand[1] as BuildStage)) throw new TypeError("invalid buildStageIs"); return buildStage(pack.rules, state.run.build.affinities?.[operand[0]]?.affinityBps ?? 0) === operand[1]; }
  return evaluateCondition(value, state, depth);
}

function factBase(state: GameState, source: BuildEvidenceSource, buildId: string, reasonTag: string) { return { buildId, source: source.sourceRef, sourceCommandId: source.commandId, age: state.run.age, nodeIndex: state.run.nodeIndex, reasonTag }; }
function sortedAffinities(value: Record<string, BuildAffinity>): BuildAffinity[] { return Object.values(value).sort((left, right) => left.buildId.localeCompare(right.buildId)); }
function pressureBps(pack: BuildPack, source: BuildDefinition, targetId: string): number { return source.focusPressureBpsByBuildId?.[targetId] ?? pack.rules.defaultFocusPressureBps; }

function unlockBranches(state: GameState, pack: BuildPack, source: BuildEvidenceSource, reasonTag: string): BuildApplication {
  const unlocked = new Set(state.run.build.unlockedBuildIds ?? []); const facts: BuildTransitionFact[] = [];
  for (const definition of [...pack.definitions].sort((left, right) => left.id.localeCompare(right.id))) {
    if (definition.parentBuildIds.length === 0 || unlocked.has(definition.id) || !eligibleByTags(state, pack, definition)) continue;
    if (!definition.parentBuildIds.every((parentId) => buildStageAtLeast(pack.rules, state.run.build.affinities?.[parentId]?.affinityBps ?? 0, "formed"))) continue;
    if (!(definition.unlockConditions ?? []).every((condition) => evaluateBuildCondition(condition, state, pack))) continue;
    unlocked.add(definition.id); facts.push({ id: `build-transition:${source.commandId}:unlock:${definition.id}`, type: "BUILD_BRANCH_UNLOCKED", ...factBase(state, source, definition.id, reasonTag) });
  }
  if (facts.length === 0) return { state, facts };
  return { state: { ...state, run: { ...state.run, build: { ...state.run.build, unlockedBuildIds: [...unlocked].sort(), transitionFacts: [...(state.run.build.transitionFacts ?? []), ...facts] } } }, facts };
}

export function applyBuildEvidence(state: GameState, pack: BuildPack, effect: BuildEvidenceEffect, source: BuildEvidenceSource): BuildApplication {
  assertSafeInteger(effect.amount, "build evidence amount"); if (effect.amount < pack.rules.evidence.min || effect.amount > pack.rules.evidence.max) throw new RangeError("build evidence amount outside versioned range"); if (!effect.reasonTag) throw new TypeError("reasonTag is required");
  const definition = buildDefinition(pack, effect.buildId); if (!eligibleByTags(state, pack, definition)) throw new RangeError("BuildDefinition tag requirements are not satisfied");
  if (definition.parentBuildIds.length > 0 && !(state.run.build.unlockedBuildIds ?? []).includes(definition.id)) throw new RangeError("branch Build is not unlocked");
  const affinities = { ...(state.run.build.affinities ?? {}) }; const previous = affinities[definition.id] ?? { buildId: definition.id, affinityBps: 0, lifetimeEvidence: 0, lastEvidenceNodeIndex: state.run.nodeIndex };
  const facts: Array<BuildEvidenceFact | BuildTransitionFact> = [];
  const previousStage = buildStage(pack.rules, previous.affinityBps); const updated: BuildAffinity = { buildId: definition.id, affinityBps: clampInteger(safeAdd(previous.affinityBps, effect.amount), 0, 10_000), lifetimeEvidence: safeAdd(previous.lifetimeEvidence, effect.amount), lastEvidenceNodeIndex: state.run.nodeIndex }; affinities[definition.id] = updated;
  facts.push({ id: `build-evidence:${source.commandId}:${definition.id}`, type: previous.lifetimeEvidence === 0 ? "BUILD_FIRST_EVIDENCE" : "BUILD_EVIDENCE", amount: effect.amount, affinityBefore: previous.affinityBps, affinityAfter: updated.affinityBps, ...factBase(state, source, definition.id, effect.reasonTag) });
  const pressureFacts: BuildTransitionFact[] = [];
  for (const other of sortedAffinities(affinities)) {
    if (other.buildId === definition.id || other.affinityBps === 0) continue; const beforeStage = buildStage(pack.rules, other.affinityBps); const pressure = roundHalfUpPositive(safeMultiply(effect.amount, pressureBps(pack, definition, other.buildId)), 10_000); const after = Math.max(0, other.affinityBps - pressure); affinities[other.buildId] = { ...other, affinityBps: after }; const afterStage = buildStage(pack.rules, after);
    if (beforeStage !== afterStage) pressureFacts.push({ id: `build-transition:${source.commandId}:pressure:${other.buildId}`, type: "BUILD_STAGE_TRANSITION", fromStage: beforeStage, toStage: afterStage, ...factBase(state, source, other.buildId, `focus-pressure:${effect.reasonTag}`) });
  }
  const nextStage = buildStage(pack.rules, updated.affinityBps);
  if (nextStage !== previousStage) facts.push({ id: `build-transition:${source.commandId}:stage:${definition.id}`, type: "BUILD_STAGE_TRANSITION", fromStage: previousStage, toStage: nextStage, ...factBase(state, source, definition.id, effect.reasonTag) });
  if (nextStage === "refined" && previousStage !== "refined") facts.push({ id: `build-transition:${source.commandId}:refined:${definition.id}`, type: "BUILD_REFINED", fromStage: previousStage, toStage: "refined", ...factBase(state, source, definition.id, effect.reasonTag) });
  const oldDominant = state.run.build.dominantBuildId; let dominant = oldDominant; const formed = sortedAffinities(affinities).filter((affinity) => buildStageAtLeast(pack.rules, affinity.affinityBps, "formed")).sort((left, right) => right.affinityBps - left.affinityBps || left.buildId.localeCompare(right.buildId));
  if (dominant === undefined && formed.length > 0) dominant = formed[0].buildId;
  else if (dominant !== undefined) { const current = affinities[dominant]?.affinityBps ?? 0; const challenger = formed.filter((affinity) => affinity.buildId !== dominant && affinity.affinityBps >= safeAdd(current, pack.rules.dominantSwitchMargin))[0]; if (challenger !== undefined) dominant = challenger.buildId; }
  if (dominant !== oldDominant && dominant !== undefined) facts.push({ id: `build-transition:${source.commandId}:dominant:${dominant}`, type: oldDominant === undefined ? "BUILD_DOMINANT_FORMED" : "BUILD_DOMINANT_CHANGED", ...(oldDominant === undefined ? {} : { fromBuildId: oldDominant }), toBuildId: dominant, ...factBase(state, source, dominant, effect.reasonTag) });
  const evidenceFacts = [...(state.run.build.evidenceFacts ?? []), facts[0] as BuildEvidenceFact]; const transitionFacts = [...(state.run.build.transitionFacts ?? []), ...facts.slice(1).filter((fact): fact is BuildTransitionFact => fact.type !== "BUILD_EVIDENCE" && fact.type !== "BUILD_FIRST_EVIDENCE"), ...pressureFacts];
  let next: GameState = { ...state, run: { ...state.run, build: { ...state.run.build, affinities, ...(dominant === undefined ? {} : { dominantBuildId: dominant }), evidenceFacts, transitionFacts, unlockedBuildIds: [...(state.run.build.unlockedBuildIds ?? [])] } } };
  const unlocked = unlockBranches(next, pack, source, effect.reasonTag); next = unlocked.state; facts.push(...pressureFacts, ...unlocked.facts);
  return { state: next, facts };
}

export function applyBuildEffects(state: GameState, effects: readonly unknown[], pack: BuildPack, source: BuildEvidenceSource): BuildApplication {
  let next = state; const facts: Array<BuildEvidenceFact | BuildTransitionFact> = [];
  for (const value of effects) { const effect = recordValue(value); if (effect?.op !== "ADD_BUILD_EVIDENCE") continue; if (typeof effect.buildId !== "string" || typeof effect.amount !== "number" || typeof effect.reasonTag !== "string") throw new TypeError("invalid ADD_BUILD_EVIDENCE"); const applied = applyBuildEvidence(next, pack, { buildId: effect.buildId, amount: effect.amount, reasonTag: effect.reasonTag }, source); next = applied.state; facts.push(...applied.facts); }
  return { state: next, facts };
}

function activeDefinitions(state: GameState, pack: BuildPack): Array<{ definition: BuildDefinition; affinity: BuildAffinity; stages: BuildStageDefinition[] }> {
  return sortedAffinities(state.run.build.affinities ?? {}).filter((affinity) => affinity.affinityBps > 0).map((affinity) => { const definition = buildDefinition(pack, affinity.buildId); const rank = stageRank(buildStage(pack.rules, affinity.affinityBps)); return { definition, affinity, stages: definition.stages.filter((stage) => stageRank(stage.stage) <= rank) }; });
}
export function activeBuildProgressionSources(state: GameState, pack: BuildPack): ProgressionModifierSource[] {
  return activeDefinitions(state, pack).map(({ definition, stages }) => ({ id: definition.id, modifiers: [...definition.modifiers, ...stages.flatMap((stage) => stage.modifiers)].filter((modifier): modifier is ProgressionModifier => PROGRESSION_MODIFIER_KEYS.includes(modifier.kind as ProgressionModifier["kind"]) && modifier.systemOwner === "PROG01") })).filter((source) => source.modifiers.length > 0);
}
export function activeBuildRiskSources(state: GameState, pack: BuildPack): RiskModifierSource[] {
  return activeDefinitions(state, pack).map(({ definition, stages }) => ({ id: definition.id, modifiers: [...definition.modifiers, ...stages.flatMap((stage) => stage.modifiers)].filter((modifier): modifier is RiskModifier => RISK_MODIFIER_KEYS.includes(modifier.kind as RiskModifier["kind"]) && modifier.systemOwner === "RISK01"), hooks: [...definition.hooks, ...stages.flatMap((stage) => stage.hooks)].filter((hook): hook is RiskHook => hook.systemOwner === "RISK01"), systemOwners: [...definition.systemOwners] })).filter((source) => source.modifiers.length > 0 || source.hooks.length > 0);
}
export function orderedBuildHooks(state: GameState, pack: BuildPack): Array<BuildHook & { sourceId: string }> { const whitelist = new Set(pack.hookWhitelist); return activeDefinitions(state, pack).flatMap(({ definition, stages }) => [...definition.hooks, ...stages.flatMap((stage) => stage.hooks)].filter((hook) => hook.systemOwner === "BUILD01").map((hook) => ({ ...hook, sourceId: definition.id }))).map((hook) => { if (!whitelist.has(hook.id)) throw new RangeError(`unknown Build hook ${hook.id}`); return hook; }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id) || left.sourceId.localeCompare(right.sourceId)); }
export function projectDirectorBuildSignals(state: GameState, pack: BuildPack): DirectorBuildSignals { return { ...(state.run.build.dominantBuildId === undefined ? {} : { dominantBuildId: state.run.build.dominantBuildId }), builds: sortedAffinities(state.run.build.affinities ?? {}).map((affinity) => ({ buildId: affinity.buildId, stage: buildStage(pack.rules, affinity.affinityBps), tags: [...buildDefinition(pack, affinity.buildId).tags] })), recentEvidenceFacts: [...(state.run.build.evidenceFacts ?? [])].slice(-10), transitionFacts: [...(state.run.build.transitionFacts ?? [])].slice(-10) }; }
