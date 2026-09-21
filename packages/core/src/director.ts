import { projectDirectorBuildSignals, type BuildContentAccess, type BuildStage } from "./build.ts";
import { isEventEligible } from "./event.ts";
import { safeAdd } from "./numeric.ts";
import { buildRiskPresentation, threatDefinition, type RiskContentAccess } from "./risk.ts";
import { drawInt, type RngTrace } from "./rng.ts";
import type { ActionType, DirectorSceneRecord, DirectorSlot, GameState, NpcInstance } from "./state.ts";

export interface DirectorHints {
  salience: 1 | 2 | 3 | 4 | 5; baseWeight?: number; topicTags: string[]; continuityTags: string[];
  buildAffinityTags: string[]; npcRoleAffinityTags: string[]; worldAffinityTags: string[]; onboardingEligible?: boolean;
}
export interface DirectorRules {
  recentWindowSize: number; continuityWindow: number; noveltyWindow: number; firstRunWindowNodes: number;
  majorSalienceThreshold: number; majorGapNodes: number; randomDangerGapNodes: number;
  baseWeightDefault: number; baseWeightMin: number; baseWeightMax: number; actionAffinityBonus: number;
  buildEmergingBonus: number; buildFormedBonus: number; buildRefinedBonus: number; worldAffinityBonus: number;
  recentNpcContinuityBonus: number; continuityOverlapBonus: number; continuityBonusCap: number; topicNoveltyBonus: number;
  exactEventRecentPenalty: number; consecutiveTopicPenalty: number; consecutiveTopicPenaltyCap: number;
}
export interface DirectorPack { id: string; version: number; rulesVersion: string; systemOwners: string[]; rules: DirectorRules }
export interface DirectorIndexQuery { slot: "onboarding" | "coreNpc" | "contextual" | "ordinary"; action?: ActionType; buildTags?: string[]; worldTags?: string[]; npcRoleTags?: string[] }
export interface DirectorIndexQueryResult { eventIds: string[]; stats: { indexLookups: number; candidateIdsVisited: number; totalEvents: number } }
export interface DirectorContentAccess extends Partial<BuildContentAccess>, Partial<RiskContentAccess> {
  get(contentVersion: string): { directorPackId?: string; buildPackId?: string; riskPackId?: string };
  getDirector(contentVersion: string): DirectorPack;
  getEvent(contentVersion: string, eventId: string): unknown;
  queryDirectorCandidates(contentVersion: string, query: DirectorIndexQuery): DirectorIndexQueryResult;
}
export interface DirectorDecisionTrace {
  selectedPrecedenceLevel?: "P2" | "P4" | "P5" | "P6"; selectedSlot?: string; selectedEventId?: string;
  candidateCount: number; eligibleCandidateCount: number; selectedWeight?: number; exclusionReasonCounts: Record<string, number>;
  rngDrawIndexBefore: number; rngDrawIndexAfter: number; continuityReasons: string[]; logicalRngRequests: number;
  queryStats: DirectorIndexQueryResult["stats"];
}
export interface DirectorSelectionResult { state: GameState; rngDraws: RngTrace[]; trace: DirectorDecisionTrace }
interface DirectorEvent { id: string; kind: string; actionAffinity?: ActionType[]; directorHints?: DirectorHints; choices?: Array<{ threatId?: string }> }
interface ScoredCandidate { event: DirectorEvent; weight: number; reasons: string[]; actorIds: string[]; buildIds: string[]; riskTier: "low" | "caution" | "dangerous" | "lethal" }

function eventObject(value: unknown): DirectorEvent { if (typeof value !== "object" || value === null || Array.isArray(value) || typeof (value as Record<string, unknown>).id !== "string" || typeof (value as Record<string, unknown>).kind !== "string") throw new TypeError("invalid Director EventDefinition"); return value as DirectorEvent; }
function canonical(values: readonly string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
export function normalizedDirectorHints(event: DirectorEvent, rules: DirectorRules): DirectorHints & { baseWeight: number } { const hints = event.directorHints; if (hints === undefined) return { salience: 1, baseWeight: rules.baseWeightDefault, topicTags: [], continuityTags: [], buildAffinityTags: [], npcRoleAffinityTags: [], worldAffinityTags: [] }; return { ...hints, baseWeight: hints.baseWeight ?? rules.baseWeightDefault, topicTags: canonical(hints.topicTags), continuityTags: canonical(hints.continuityTags), buildAffinityTags: canonical(hints.buildAffinityTags), npcRoleAffinityTags: canonical(hints.npcRoleAffinityTags), worldAffinityTags: canonical(hints.worldAffinityTags) }; }

function roleTagsFor(state: GameState, originKind: NpcInstance["originKind"]): string[] { const roles: string[] = []; for (const role of Object.keys(state.run.npcs.roleIndex).sort()) if (state.run.npcs.roleIndex[role].some((id) => { const npc = state.run.npcs.byId[id]; return npc?.originKind === originKind && npc.actualStatus === "active" && npc.knowledge.met; })) roles.push(role); return roles; }
function matchingActorIds(state: GameState, roles: readonly string[], originKind?: NpcInstance["originKind"]): string[] { const ids: string[] = []; for (const role of canonical(roles)) { const id = [...(state.run.npcs.roleIndex[role] ?? [])].sort().find((candidate) => { const npc = state.run.npcs.byId[candidate]; return npc !== undefined && npc.actualStatus === "active" && npc.knowledge.met && (originKind === undefined || npc.originKind === originKind); }); if (id !== undefined) ids.push(id); } return canonical(ids); }
function riskPreview(state: GameState, event: DirectorEvent, content: DirectorContentAccess, contentVersion: string): "low" | "caution" | "dangerous" | "lethal" { const severity = { low: 0, caution: 1, dangerous: 2, lethal: 3 } as const; let result: keyof typeof severity = "low"; for (const choice of event.choices ?? []) { if (choice.threatId === undefined) continue; if (content.getRisk === undefined) throw new TypeError("Director risk preview requires locked RiskPack"); const preview = buildRiskPresentation(state, threatDefinition(content.getRisk(contentVersion), choice.threatId)); if (severity[preview.tier] > severity[result]) result = preview.tier; } return result; }
function stageBonus(stage: BuildStage, rules: DirectorRules): number { return stage === "refined" ? rules.buildRefinedBonus : stage === "formed" ? rules.buildFormedBonus : stage === "emerging" ? rules.buildEmergingBonus : 0; }
function increment(counts: Record<string, number>, reason: string): void { counts[reason] = (counts[reason] ?? 0) + 1; }
function recentWithin(state: GameState, nodes: number, predicate: (scene: DirectorSceneRecord) => boolean): boolean { return state.run.director.recentScenes.some((scene) => state.run.nodeIndex - scene.nodeIndex <= nodes && predicate(scene)); }

export function scoreDirectorEvent(state: GameState, eventValue: unknown, action: ActionType, content: DirectorContentAccess, slot: "P2" | "P4" | "P5" | "P6"): { eligible: boolean; weight: number; reasons: string[]; actorIds: string[]; buildIds: string[]; riskTier: "low" | "caution" | "dangerous" | "lethal"; exclusionReason?: string } {
  const pack = content.getDirector(state.contentVersion); const rules = pack.rules; const event = eventObject(eventValue); const hints = normalizedDirectorHints(event, rules); const riskTier = riskPreview(state, event, content, state.contentVersion);
  if (!isEventEligible(event, state)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "event-ineligible" };
  if (slot === "P2" && !(state.run.director.profileId === "first_run" && state.run.nodeIndex <= rules.firstRunWindowNodes && hints.onboardingEligible === true)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "not-onboarding" };
  const coreActorIds = matchingActorIds(state, hints.npcRoleAffinityTags, "core"); if (slot === "P4" && coreActorIds.length === 0) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "no-core-npc" };
  if ((slot === "P5" || slot === "P6") && hints.salience >= rules.majorSalienceThreshold && recentWithin(state, rules.majorGapNodes, (scene) => scene.salience >= rules.majorSalienceThreshold && scene.slot !== "P3" && scene.slot !== "CONTINUATION")) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "major-gap" };
  if ((slot === "P5" || slot === "P6") && (riskTier === "dangerous" || riskTier === "lethal") && recentWithin(state, rules.randomDangerGapNodes, (scene) => scene.riskTier === "dangerous" || scene.riskTier === "lethal")) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "danger-gap" };
  let weight = hints.baseWeight; const reasons: string[] = [];
  if (event.actionAffinity?.includes(action)) { weight = safeAdd(weight, rules.actionAffinityBonus); reasons.push("action-affinity"); }
  let buildIds: string[] = []; if (hints.buildAffinityTags.length > 0 && content.get(state.contentVersion).buildPackId !== undefined && content.getBuild !== undefined) { const signals = projectDirectorBuildSignals(state, content.getBuild(state.contentVersion)); const matching = signals.builds.filter((build) => build.tags.some((tag) => hints.buildAffinityTags.includes(tag))).sort((left, right) => stageBonus(right.stage, rules) - stageBonus(left.stage, rules) || left.buildId.localeCompare(right.buildId)); if (matching.length > 0) { const strongest = matching[0]; const bonus = stageBonus(strongest.stage, rules); if (bonus > 0) { weight = safeAdd(weight, bonus); reasons.push(`build-${strongest.stage}`); buildIds = [strongest.buildId]; } } }
  if (hints.worldAffinityTags.some((tag) => state.run.world.tags.includes(tag))) { weight = safeAdd(weight, rules.worldAffinityBonus); reasons.push("world-affinity"); }
  const actorIds = matchingActorIds(state, hints.npcRoleAffinityTags); const recentActorIds = new Set(state.run.director.recentScenes.flatMap((scene) => scene.actorIds)); if (actorIds.some((id) => recentActorIds.has(id))) { weight = safeAdd(weight, rules.recentNpcContinuityBonus); reasons.push("npc-continuity"); }
  const recentContinuity = new Set(state.run.director.recentScenes.slice(-rules.continuityWindow).flatMap((scene) => scene.continuityTags)); const overlaps = hints.continuityTags.filter((tag) => recentContinuity.has(tag)); if (overlaps.length > 0) { const bonus = Math.min(rules.continuityBonusCap, overlaps.length * rules.continuityOverlapBonus); weight = safeAdd(weight, bonus); reasons.push(...overlaps.map((tag) => `continuity:${tag}`)); }
  const primaryTopic = hints.topicTags[0]; if (primaryTopic !== undefined && !state.run.director.recentScenes.slice(-rules.noveltyWindow).some((scene) => scene.topicTags.includes(primaryTopic))) { weight = safeAdd(weight, rules.topicNoveltyBonus); reasons.push("topic-novelty"); }
  if (state.run.director.recentScenes.some((scene) => scene.eventId === event.id)) { weight = safeAdd(weight, -rules.exactEventRecentPenalty); reasons.push("event-repeat-penalty"); }
  if (primaryTopic !== undefined) { let repeats = 0; for (const scene of [...state.run.director.recentScenes].reverse()) { if (scene.topicTags[0] !== primaryTopic) break; repeats += 1; } if (repeats > 0) { const penalty = Math.min(rules.consecutiveTopicPenaltyCap, repeats * rules.consecutiveTopicPenalty); weight = safeAdd(weight, -penalty); reasons.push("topic-repeat-penalty"); } }
  return { eligible: weight > 0, weight, reasons, actorIds: slot === "P4" ? coreActorIds : actorIds, buildIds, riskTier, ...(weight > 0 ? {} : { exclusionReason: "nonpositive-weight" }) };
}

function appendScene(state: GameState, event: DirectorEvent, content: DirectorContentAccess, slot: DirectorSlot, details: { actorIds?: string[]; buildIds?: string[]; causeId?: string; riskTier?: DirectorSceneRecord["riskTier"] } = {}): GameState { const rules = content.getDirector(state.contentVersion).rules; const hints = normalizedDirectorHints(event, rules); const scene: DirectorSceneRecord = { eventId: event.id, nodeIndex: state.run.nodeIndex, slot, salience: hints.salience, topicTags: hints.topicTags, continuityTags: hints.continuityTags, actorIds: canonical(details.actorIds ?? []), buildIds: canonical(details.buildIds ?? []), ...(details.causeId === undefined ? {} : { causeId: details.causeId }), ...(details.riskTier === undefined ? {} : { riskTier: details.riskTier }) }; const recentScenes = [...state.run.director.recentScenes, scene].slice(-rules.recentWindowSize); return { ...state, run: { ...state.run, director: { ...state.run.director, recentScenes } } }; }
export function recordDirectorScene(state: GameState, eventId: string, content: DirectorContentAccess, slot: DirectorSlot, details: { actorIds?: string[]; buildIds?: string[]; causeId?: string } = {}): GameState { const event = eventObject(content.getEvent(state.contentVersion, eventId)); return appendScene(state, event, content, slot, { ...details, riskTier: riskPreview(state, event, content, state.contentVersion) }); }

function queryForSlot(state: GameState, action: ActionType, slot: "P2" | "P4" | "P5" | "P6", content: DirectorContentAccess): DirectorIndexQueryResult { const buildTags = content.get(state.contentVersion).buildPackId === undefined || content.getBuild === undefined ? [] : canonical(projectDirectorBuildSignals(state, content.getBuild(state.contentVersion)).builds.filter((build) => build.stage !== "latent").flatMap((build) => build.tags)); const coreRoles = roleTagsFor(state, "core"); const generatedRoles = roleTagsFor(state, "generated"); const query: DirectorIndexQuery = slot === "P2" ? { slot: "onboarding" } : slot === "P4" ? { slot: "coreNpc", npcRoleTags: coreRoles } : slot === "P5" ? { slot: "contextual", action, buildTags, worldTags: [...state.run.world.tags], npcRoleTags: generatedRoles } : { slot: "ordinary" }; return content.queryDirectorCandidates(state.contentVersion, query); }

export function selectDirectorEvent(state: GameState, action: ActionType, content: DirectorContentAccess, slots: readonly ("P2" | "P4" | "P5" | "P6")[]): DirectorSelectionResult {
  const before = state.run.rng.streams.director.drawIndex; const exclusionReasonCounts: Record<string, number> = {}; let lastStats = { indexLookups: 0, candidateIdsVisited: 0, totalEvents: 0 }; let lastCandidateCount = 0;
  for (const slot of slots) {
    if (slot === "P2" && !(state.run.director.profileId === "first_run" && state.run.nodeIndex <= content.getDirector(state.contentVersion).rules.firstRunWindowNodes)) continue;
    const query = queryForSlot(state, action, slot, content); lastStats = query.stats; lastCandidateCount = query.eventIds.length; const candidates: ScoredCandidate[] = [];
    for (const eventId of query.eventIds) { const event = eventObject(content.getEvent(state.contentVersion, eventId)); const scored = scoreDirectorEvent(state, event, action, content, slot); if (!scored.eligible) { increment(exclusionReasonCounts, scored.exclusionReason ?? "ineligible"); continue; } candidates.push({ event, weight: scored.weight, reasons: scored.reasons, actorIds: scored.actorIds, buildIds: scored.buildIds, riskTier: scored.riskTier }); }
    candidates.sort((left, right) => left.event.id.localeCompare(right.event.id)); if (candidates.length === 0) continue;
    let selected = candidates[0]; let rng = state.run.rng; let rngDraws: RngTrace[] = []; let logicalRngRequests = 0;
    if (candidates.length >= 2) { let total = 0; for (const candidate of candidates) total = safeAdd(total, candidate.weight); const draw = drawInt(rng, "director", 1, total); rng = draw.state; rngDraws = [...draw.trace]; logicalRngRequests = 1; let cursor = draw.value; for (const candidate of candidates) { cursor -= candidate.weight; if (cursor <= 0) { selected = candidate; break; } } }
    let next: GameState = { ...state, run: { ...state.run, rng, events: { ...state.run.events, current: { eventId: selected.event.id, kind: selected.event.kind } } } }; next = appendScene(next, selected.event, content, slot, { actorIds: selected.actorIds, buildIds: selected.buildIds, riskTier: selected.riskTier });
    return { state: next, rngDraws, trace: { selectedPrecedenceLevel: slot, selectedSlot: slot === "P2" ? "onboarding" : slot === "P4" ? "coreNpc" : slot === "P5" ? "contextual" : "ordinary", selectedEventId: selected.event.id, candidateCount: query.eventIds.length, eligibleCandidateCount: candidates.length, selectedWeight: selected.weight, exclusionReasonCounts, rngDrawIndexBefore: before, rngDrawIndexAfter: rng.streams.director.drawIndex, continuityReasons: selected.reasons, logicalRngRequests, queryStats: query.stats } };
  }
  return { state, rngDraws: [], trace: { candidateCount: lastCandidateCount, eligibleCandidateCount: 0, exclusionReasonCounts, rngDrawIndexBefore: before, rngDrawIndexAfter: before, continuityReasons: [], logicalRngRequests: 0, queryStats: lastStats } };
}
