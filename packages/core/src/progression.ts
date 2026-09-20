import { clampInteger, roundHalfUpPositive, safeAdd, safeMultiply } from "./numeric.ts";
import { outcomeTierForScore, resolveScoreCheck, type OutcomeTier } from "./event.ts";
import { drawInt, type RngState, type RngTrace } from "./rng.ts";
import type { GameState, InnateProfile, InnateProfileOffer } from "./state.ts";

export const PROGRESSION_MODIFIER_KEYS = ["cultivationGainRateDeltaBps", "foundationGainRateDeltaBps", "breakthroughDifficultyDelta", "breakthroughScoreDelta", "foundationRetentionDeltaBps", "failureCultivationLossDelta", "failureFoundationLossDelta"] as const;
export type ProgressionModifierKey = typeof PROGRESSION_MODIFIER_KEYS[number];
export interface ProgressionModifier { kind: ProgressionModifierKey; value: number; systemOwner: string }
export interface ProgressionHook { id: string; systemOwner: string; order: number }
export interface ProgressionDefinition { id: string; displayName: string; category: string; tags: string[]; modifiers: ProgressionModifier[]; hooks: ProgressionHook[]; requiresTags: string[]; forbidsTags: string[]; exclusiveGroups: string[]; systemOwners: string[] }
export interface SpiritualRootProfile extends ProgressionDefinition { elementTags: string[] }
export interface TalentDefinition extends ProgressionDefinition {}
export interface MajorDestinyDefinition extends ProgressionDefinition {}
export interface RealmDefinition { id: string; displayName: string; order: number; lifespanCap: number; retreatCultivationGain: number; retreatFoundationGain: number; breakthroughDifficulty?: number; nextRealmId?: string }
export interface ProgressionPack { id: string; version: number; rulesVersion: string; manifest: { realmCount: number; spiritualRootCount: number; talentCount: number; majorDestinyCount: number }; realms: RealmDefinition[]; spiritualRoots: SpiritualRootProfile[]; talents: TalentDefinition[]; majorDestinies: MajorDestinyDefinition[]; hookWhitelist: string[] }
export interface ProgressionContentAccess { getProgression(contentVersion: string): ProgressionPack }
export interface ProgressionAggregate { cultivationGainRateBps: number; foundationGainRateBps: number; breakthroughDifficultyDelta: number; breakthroughScoreDelta: number; foundationRetentionDeltaBps: number; failureCultivationLossDelta: number; failureFoundationLossDelta: number; sources: string[] }

function definitionMap<T extends { id: string }>(values: readonly T[]): Map<string, T> { return new Map(values.map((value) => [value.id, value])); }
export function profileDefinitions(pack: ProgressionPack, profile: InnateProfile): ProgressionDefinition[] {
  const roots = definitionMap(pack.spiritualRoots); const talents = definitionMap(pack.talents); const destinies = definitionMap(pack.majorDestinies);
  const root = roots.get(profile.spiritualRoot); const destiny = destinies.get(profile.majorDestinyId); if (root === undefined || destiny === undefined || profile.talentIds.length < 1) throw new RangeError("invalid InnateProfile references");
  const selectedTalents = profile.talentIds.map((id) => { const value = talents.get(id); if (value === undefined) throw new RangeError(`unknown talent ${id}`); return value; });
  if (new Set(profile.talentIds).size !== profile.talentIds.length) throw new RangeError("duplicate active talent");
  return [root, ...selectedTalents, destiny];
}

export function isValidInnateProfile(pack: ProgressionPack, profile: InnateProfile): boolean {
  let definitions: ProgressionDefinition[]; try { definitions = profileDefinitions(pack, profile); } catch { return false; }
  const tags = new Set(definitions.flatMap((definition) => definition.tags)); const groups = new Set<string>();
  for (const definition of definitions) {
    if (definition.requiresTags.some((tag) => !tags.has(tag)) || definition.forbidsTags.some((tag) => tags.has(tag))) return false;
    for (const group of definition.exclusiveGroups) { if (groups.has(group)) return false; groups.add(group); }
  }
  return true;
}

export function aggregateProgressionModifiers(pack: ProgressionPack, profile: InnateProfile): ProgressionAggregate {
  const definitions = profileDefinitions(pack, profile).sort((left, right) => left.id.localeCompare(right.id));
  const totals: Record<ProgressionModifierKey, number> = Object.fromEntries(PROGRESSION_MODIFIER_KEYS.map((key) => [key, 0])) as Record<ProgressionModifierKey, number>;
  for (const definition of definitions) for (const modifier of [...definition.modifiers].sort((left, right) => left.kind.localeCompare(right.kind) || left.value - right.value)) if (modifier.systemOwner === "PROG01") totals[modifier.kind] = safeAdd(totals[modifier.kind], modifier.value);
  return {
    cultivationGainRateBps: clampInteger(safeAdd(10_000, totals.cultivationGainRateDeltaBps), 5_000, 16_000),
    foundationGainRateBps: clampInteger(safeAdd(10_000, totals.foundationGainRateDeltaBps), 5_000, 16_000),
    breakthroughDifficultyDelta: totals.breakthroughDifficultyDelta,
    breakthroughScoreDelta: clampInteger(totals.breakthroughScoreDelta, -120, 120),
    foundationRetentionDeltaBps: totals.foundationRetentionDeltaBps,
    failureCultivationLossDelta: totals.failureCultivationLossDelta,
    failureFoundationLossDelta: totals.failureFoundationLossDelta,
    sources: definitions.map((definition) => definition.id)
  };
}

export function orderedProgressionHooks(pack: ProgressionPack, profile: InnateProfile): Array<ProgressionHook & { sourceId: string }> {
  const whitelist = new Set(pack.hookWhitelist); return profileDefinitions(pack, profile).flatMap((definition) => definition.hooks.filter((hook) => hook.systemOwner === "PROG01").map((hook) => ({ ...hook, sourceId: definition.id }))).map((hook) => { if (!whitelist.has(hook.id)) throw new RangeError(`unknown progression hook ${hook.id}`); return hook; }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id) || left.sourceId.localeCompare(right.sourceId));
}

export function realmDefinition(pack: ProgressionPack, realmId: string): RealmDefinition { const value = pack.realms.find((realm) => realm.id === realmId); if (value === undefined) throw new RangeError(`unknown realm ${realmId}`); return value; }
export function cultivationStage(cultivationBps: number): "early" | "mid" | "late" | "complete" { if (cultivationBps >= 10_000) return "complete"; if (cultivationBps >= 6_667) return "late"; if (cultivationBps >= 3_334) return "mid"; return "early"; }

export function applyRetreatProgression(state: GameState, pack: ProgressionPack): GameState {
  const profile = state.run.identity.innateProfile; if (profile === undefined) return state;
  const realm = realmDefinition(pack, state.run.realm.id); const aggregate = aggregateProgressionModifiers(pack, profile);
  const cultivation = state.run.realm.cultivationBps ?? state.run.realm.cultivation; const foundation = state.run.realm.realmFoundationBps ?? 0;
  const cultivationGain = roundHalfUpPositive(safeMultiply(realm.retreatCultivationGain, aggregate.cultivationGainRateBps), 10_000);
  const foundationGain = roundHalfUpPositive(safeMultiply(realm.retreatFoundationGain, aggregate.foundationGainRateBps), 10_000);
  const cultivationBps = Math.min(10_000, safeAdd(cultivation, cultivationGain)); const realmFoundationBps = Math.min(10_000, safeAdd(foundation, foundationGain));
  return { ...state, run: { ...state.run, realm: { ...state.run.realm, cultivation: cultivationBps, cultivationBps, realmFoundationBps } } };
}

function injuryPlusOne(state: GameState, sourceRef: string): GameState {
  const id = "condition.progression.breakthrough-injury"; const existing = state.run.conditions.find((condition) => condition.id === id);
  const conditions = existing === undefined ? [...state.run.conditions, { id, kind: "injury" as const, stacks: 1, sourceRef }] : state.run.conditions.map((condition) => condition.id === id ? { ...condition, stacks: Math.min(3, condition.stacks + 1), sourceRef } : condition);
  return { ...state, run: { ...state.run, conditions } };
}

export function applyBreakthroughOutcome(state: GameState, pack: ProgressionPack, tier: OutcomeTier, commandId: string): GameState {
  const profile = state.run.identity.innateProfile; if (profile === undefined) throw new RangeError("InnateProfile is required"); const current = realmDefinition(pack, state.run.realm.id); if (current.nextRealmId === undefined) throw new RangeError("realm has no ordinary successor"); const target = realmDefinition(pack, current.nextRealmId); const aggregate = aggregateProgressionModifiers(pack, profile);
  const cultivation = state.run.realm.cultivationBps ?? state.run.realm.cultivation; const foundation = state.run.realm.realmFoundationBps ?? 0;
  if (tier === "failure") {
    const cultivationLoss = Math.max(0, safeAdd(2_500, aggregate.failureCultivationLossDelta)); const foundationLoss = Math.max(0, safeAdd(1_000, aggregate.failureFoundationLossDelta));
    const failed = { ...state, run: { ...state.run, realm: { ...state.run.realm, cultivation: Math.max(0, cultivation - cultivationLoss), cultivationBps: Math.max(0, cultivation - cultivationLoss), realmFoundationBps: Math.max(0, foundation - foundationLoss) } } };
    return injuryPlusOne(failed, commandId);
  }
  const baseRetention = tier === "greatSuccess" ? 6_000 : tier === "success" ? 4_500 : 3_000; const retentionBps = clampInteger(safeAdd(baseRetention, aggregate.foundationRetentionDeltaBps), 1_500, 8_000); const retained = roundHalfUpPositive(safeMultiply(foundation, retentionBps), 10_000);
  let advanced: GameState = { ...state, run: { ...state.run, maxAge: Math.max(state.run.maxAge, target.lifespanCap), realm: { ...state.run.realm, id: target.id, order: target.order, cultivation: 0, cultivationBps: 0, realmFoundationBps: retained } } };
  if (tier === "costlySuccess") advanced = injuryPlusOne(advanced, commandId); return advanced;
}

export function resolveBreakthrough(state: GameState, pack: ProgressionPack): { state: GameState; tier: OutcomeTier; effectiveDifficulty: number; effectiveScore: number; rngRoll: number; rngDraws: RngTrace[] } {
  const profile = state.run.identity.innateProfile; if (profile === undefined) throw new RangeError("InnateProfile is required"); const realm = realmDefinition(pack, state.run.realm.id); if (realm.breakthroughDifficulty === undefined || realm.nextRealmId === undefined) throw new RangeError("realm cannot attempt an ordinary breakthrough"); const aggregate = aggregateProgressionModifiers(pack, profile);
  const foundation = state.run.realm.realmFoundationBps ?? 0; const foundationScore = roundHalfUpPositive(foundation, 10); const effectiveDifficulty = clampInteger(safeAdd(realm.breakthroughDifficulty, aggregate.breakthroughDifficultyDelta), 100, 950); const effectiveScore = safeAdd(foundationScore, aggregate.breakthroughScoreDelta);
  const check = resolveScoreCheck(state, effectiveScore, effectiveDifficulty); return { state: check.state, tier: check.tier, effectiveDifficulty, effectiveScore, rngRoll: check.rngRoll, rngDraws: check.rngDraws };
}

function chooseOne<T>(rng: RngState, values: readonly T[]): { value: T; rng: RngState; trace: RngTrace[] } { const draw = drawInt(rng, "offer", 0, values.length - 1); return { value: values[draw.value], rng: draw.state, trace: [...draw.trace] }; }
export function selectInnateProfileOffers(rng: RngState, pack: ProgressionPack): { offers: [InnateProfileOffer, InnateProfileOffer, InnateProfileOffer]; rng: RngState; trace: RngTrace[] } {
  const roots = [...pack.spiritualRoots].sort((a, b) => a.id.localeCompare(b.id)); const talents = [...pack.talents].sort((a, b) => a.id.localeCompare(b.id)); const destinies = [...pack.majorDestinies].sort((a, b) => a.id.localeCompare(b.id)); if (roots.length < 2 || talents.length < 1 || destinies.length < 3) throw new RangeError("insufficient InnateProfile offer content");
  let nextRng = rng; const trace: RngTrace[] = []; const offers: InnateProfileOffer[] = []; const destinyPool = [...destinies]; let firstRootId = "";
  for (let index = 0; index < 3; index += 1) {
    const rootPool = index === 1 ? roots.filter((root) => root.id !== firstRootId) : roots; const rootPick = chooseOne(nextRng, rootPool); nextRng = rootPick.rng; trace.push(...rootPick.trace); if (index === 0) firstRootId = rootPick.value.id;
    const talentPick = chooseOne(nextRng, talents); nextRng = talentPick.rng; trace.push(...talentPick.trace);
    const destinyPick = chooseOne(nextRng, destinyPool); nextRng = destinyPick.rng; trace.push(...destinyPick.trace); destinyPool.splice(destinyPool.findIndex((value) => value.id === destinyPick.value.id), 1);
    const profile = { spiritualRoot: rootPick.value.id, talentIds: [talentPick.value.id], majorDestinyId: destinyPick.value.id }; const selectionId = `innate.${index + 1}.${profile.spiritualRoot}.${profile.talentIds[0]}.${profile.majorDestinyId}`; offers.push({ selectionId, profile });
  }
  return { offers: offers as [InnateProfileOffer, InnateProfileOffer, InnateProfileOffer], rng: nextRng, trace };
}
