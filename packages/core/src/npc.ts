import { clampInteger, safeAdd } from "./numeric.ts";
import { drawInt, type RngTrace } from "./rng.ts";
import type { GameState, NpcActualStatus, NpcInstance, NpcMilestoneFact } from "./state.ts";

export interface NpcDefinition {
  id: string; displayName: string; tags: string[]; roleTags: string[]; fixedTraitTags: string[];
  factDefinitions: string[]; systemOwners: string[];
}
export interface NpcArchetypeDefinition {
  id: string; displayLabel: string; tags: string[]; roleTags: string[]; namePoolId: string;
  traitPoolIds: string[]; traitCount: number; defaultFacts: string[]; systemOwners: string[];
}
export interface NpcNameEntry { id: string; displayName: string }
export interface NpcNamePoolDefinition { id: string; names: NpcNameEntry[]; systemOwners: string[] }
export interface NpcTraitDefinition { id: string; poolIds: string[]; tags: string[]; systemOwners: string[] }
export interface NpcFactDefinition { id: string; tags: string[]; systemOwners: string[] }
export interface NpcRules {
  version: number;
  promotionThreshold: number;
  significance: { min: number; max: number; authoringMin: number; authoringMax: number };
  relation: {
    affinityMin: number; affinityMax: number; trustMin: number; trustMax: number; debtMin: number; debtMax: number;
    affinityThresholds: { hostileMax: number; distantMax: number; neutralMax: number; warmMax: number };
    trustThresholds: { waryMax: number; guardedMax: number; familiarMax: number; trustedMax: number };
    majorChangeThreshold: number;
  };
  milestoneTypes: string[];
}
export interface NpcPack {
  id: string; rulesVersion: string; rules: NpcRules; tags: string[]; reasonTags: string[]; systemOwners: string[];
  coreDefinitions: NpcDefinition[]; archetypes: NpcArchetypeDefinition[]; namePools: NpcNamePoolDefinition[];
  traits: NpcTraitDefinition[]; facts: NpcFactDefinition[];
}
export interface NpcContentAccess { getNpc(contentVersion: string): NpcPack }
export interface NpcEffectContext { commandId: string; sourceRef: string; actorBindings?: Readonly<Record<string, string>> }
export interface NpcMutationResult { state: GameState; facts: Readonly<Record<string, unknown>>[] }
export interface NpcSpawnResult extends NpcMutationResult { npc: NpcInstance; rngDraws: RngTrace[] }

const actualStatuses = new Set<NpcActualStatus>(["active", "missing", "dead", "departed"]);

function fail(message: string): never { throw new TypeError(message); }
function object(value: unknown, path: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path} must be an object`); return value as Record<string, unknown>; }
function string(value: unknown, path: string): string { if (typeof value !== "string" || value.length === 0) fail(`${path} must be a non-empty string`); return value; }
function integer(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(`${path} must be a safe integer`); return value; }
function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], path: string): void { const allowed = new Set([...required, ...optional]); for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key} is not allowed`); for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key} is required`); }

function definition(pack: NpcPack, id: string): NpcDefinition { const result = pack.coreDefinitions.find((entry) => entry.id === id); if (result === undefined) fail(`unknown NpcDefinition ${id}`); return result; }
function archetype(pack: NpcPack, id: string): NpcArchetypeDefinition { const result = pack.archetypes.find((entry) => entry.id === id); if (result === undefined) fail(`unknown NpcArchetypeDefinition ${id}`); return result; }
function milestone(npc: NpcInstance, type: string, state: GameState, sourceRef: string, reasonTag: string): NpcMilestoneFact {
  return { type, age: state.run.age, nodeIndex: state.run.nodeIndex, sourceRef, reasonTag };
}
function canonicalUnique(values: readonly string[]): string[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function selectCanonical<T extends { id: string }>(values: readonly T[], rng: GameState["run"]["rng"]): { value: T; rng: GameState["run"]["rng"]; draws: RngTrace[] } {
  const candidates = [...values].sort((left, right) => left.id.localeCompare(right.id));
  if (candidates.length === 0) fail("NPC selection has no candidates");
  if (candidates.length === 1) return { value: candidates[0], rng, draws: [] };
  const selected = drawInt(rng, "npc", 0, candidates.length - 1);
  return { value: candidates[selected.value], rng: selected.state, draws: [...selected.trace] };
}

export function effectiveNpcTier(npc: NpcInstance, rules: NpcRules): "S" | "A" | "B" {
  if (npc.originKind === "core") return "S";
  return npc.promotedToA || npc.significance >= rules.promotionThreshold ? "A" : "B";
}
export function npcAvailability(npc: NpcInstance): "available" | "unavailable" { return npc.actualStatus === "active" ? "available" : "unavailable"; }
export function causeActorAvailability(state: GameState): Record<string, "available" | "unavailable"> {
  const ids = new Set(Object.values(state.run.causes.byId).flatMap((cause) => Object.values(cause.actorIdsByRole)));
  const result: Record<string, "available" | "unavailable"> = {};
  for (const id of [...ids].sort()) { const npc = state.run.npcs.byId[id]; if (npc !== undefined) result[id] = npcAvailability(npc); }
  return result;
}

function initialNpc(state: GameState, input: Pick<NpcInstance, "npcId" | "definitionId" | "archetypeId" | "originKind" | "displayName" | "traitTags" | "factIds" | "tags" | "roleTags">, sourceRef: string): NpcInstance {
  const first = milestone({} as NpcInstance, "firstEncounter", state, sourceRef, "npc.reason.first-encounter");
  return {
    ...input, actualStatus: "active", relation: { affinity: 0, trust: 0, debt: 0, encounterCount: 1 }, significance: 0,
    promotedToA: false, knowledge: { met: true, knownFactIds: [], knownTraitTags: [], knownStatus: "active", lastKnownAge: state.run.age, lastKnownNodeIndex: state.run.nodeIndex },
    createdAge: state.run.age, createdNodeIndex: state.run.nodeIndex, lastEncounterAge: state.run.age, lastEncounterNodeIndex: state.run.nodeIndex,
    encounterCount: 1, milestoneFacts: [first]
  };
}
function addNpc(state: GameState, npc: NpcInstance, nextNpcSequence = state.run.npcs.nextNpcSequence): GameState {
  if (state.run.npcs.byId[npc.npcId] !== undefined) fail(`NPC ID already exists: ${npc.npcId}`);
  return { ...state, run: { ...state.run, npcs: { nextNpcSequence, byId: { ...state.run.npcs.byId, [npc.npcId]: npc } } } };
}

export function instantiateCoreNpc(state: GameState, pack: NpcPack, definitionId: string, sourceRef: string): NpcSpawnResult {
  const source = definition(pack, definitionId); const npcId = `npc:core:${source.id}`;
  const npc = initialNpc(state, { npcId, definitionId: source.id, originKind: "core", displayName: source.displayName, traitTags: canonicalUnique(source.fixedTraitTags), factIds: canonicalUnique(source.factDefinitions), tags: canonicalUnique(source.tags), roleTags: canonicalUnique(source.roleTags) }, sourceRef);
  const next = addNpc(state, npc);
  return { state: next, npc, rngDraws: [], facts: [{ type: "NPC_FIRST_ENCOUNTER", npcId, sourceRef }] };
}

export interface SpawnNpcInput { archetypeId?: string; eligibleArchetypeIds?: readonly string[]; sourceRef: string }
export function spawnNpcFromArchetype(state: GameState, pack: NpcPack, input: SpawnNpcInput): NpcSpawnResult {
  const eligibleIds = input.eligibleArchetypeIds === undefined ? undefined : new Set(input.eligibleArchetypeIds);
  const candidates = pack.archetypes.filter((entry) => (input.archetypeId === undefined || entry.id === input.archetypeId) && (eligibleIds === undefined || eligibleIds.has(entry.id)));
  let rng = state.run.rng; const draws: RngTrace[] = [];
  const archetypeChoice = selectCanonical(candidates, rng); const source = archetypeChoice.value; rng = archetypeChoice.rng; draws.push(...archetypeChoice.draws);
  const pool = pack.namePools.find((entry) => entry.id === source.namePoolId); if (pool === undefined) fail(`unknown NpcNamePoolDefinition ${source.namePoolId}`);
  const nameChoice = selectCanonical(pool.names, rng); rng = nameChoice.rng; draws.push(...nameChoice.draws);
  const availableTraits = pack.traits.filter((entry) => entry.poolIds.some((poolId) => source.traitPoolIds.includes(poolId))).sort((left, right) => left.id.localeCompare(right.id));
  if (source.traitCount > availableTraits.length) fail(`archetype ${source.id} has insufficient traits`);
  const selectedTraits: NpcTraitDefinition[] = []; const remaining = [...availableTraits];
  while (selectedTraits.length < source.traitCount) {
    const choice = selectCanonical(remaining, rng); rng = choice.rng; draws.push(...choice.draws); selectedTraits.push(choice.value); remaining.splice(remaining.findIndex((entry) => entry.id === choice.value.id), 1);
  }
  const sequence = state.run.npcs.nextNpcSequence; if (!Number.isSafeInteger(sequence) || sequence < 1) fail("nextNpcSequence must be a positive safe integer");
  const nextSequence = safeAdd(sequence, 1); const npcId = `npc:generated:${sequence.toString().padStart(8, "0")}`;
  const npc = initialNpc(state, { npcId, archetypeId: source.id, originKind: "generated", displayName: nameChoice.value.displayName, traitTags: selectedTraits.map((entry) => entry.id).sort(), factIds: canonicalUnique(source.defaultFacts), tags: canonicalUnique([...source.tags, ...selectedTraits.flatMap((entry) => entry.tags)]), roleTags: canonicalUnique(source.roleTags) }, input.sourceRef);
  const withRng: GameState = { ...state, run: { ...state.run, rng } };
  const next = addNpc(withRng, npc, nextSequence);
  return { state: next, npc, rngDraws: draws, facts: [{ type: "NPC_FIRST_ENCOUNTER", npcId, archetypeId: source.id, sourceRef: input.sourceRef }] };
}

function targetNpcId(effect: Record<string, unknown>, context: NpcEffectContext): string {
  const hasId = effect.npcId !== undefined; const hasBinding = effect.actorBindingKey !== undefined;
  if (hasId === hasBinding) fail("NPC effect requires exactly one of npcId or actorBindingKey");
  if (hasId) return string(effect.npcId, "effect.npcId");
  const slot = string(effect.actorBindingKey, "effect.actorBindingKey"); const id = context.actorBindings?.[slot]; if (id === undefined || id.length === 0) fail(`missing actor binding ${slot}`); return id;
}
function encountered(npc: NpcInstance, state: GameState): NpcInstance {
  return { ...npc, lastEncounterAge: state.run.age, lastEncounterNodeIndex: state.run.nodeIndex, encounterCount: safeAdd(npc.encounterCount, 1), relation: { ...npc.relation, encounterCount: safeAdd(npc.relation.encounterCount, 1) } };
}
function replaceNpc(state: GameState, npc: NpcInstance): GameState { return { ...state, run: { ...state.run, npcs: { ...state.run.npcs, byId: { ...state.run.npcs.byId, [npc.npcId]: npc } } } }; }
function appendMilestone(npc: NpcInstance, fact: NpcMilestoneFact): NpcInstance { return { ...npc, milestoneFacts: [...npc.milestoneFacts, fact] }; }
function ensureReason(pack: NpcPack, value: unknown): string { const reason = string(value, "effect.reasonTag"); if (!pack.reasonTags.includes(reason)) fail(`unknown NPC reasonTag ${reason}`); return reason; }

export function applyNpcEffects(state: GameState, effectsValue: unknown, pack: NpcPack, context: NpcEffectContext): NpcMutationResult {
  if (!Array.isArray(effectsValue)) fail("NPC effects must be an array");
  let next = state; const facts: Readonly<Record<string, unknown>>[] = []; const encounteredIds = new Set<string>();
  for (const raw of effectsValue) {
    const effect = object(raw, "effect"); const op = string(effect.op, "effect.op");
    if (!["ADJUST_NPC_RELATION", "ADD_NPC_SIGNIFICANCE", "REVEAL_NPC_FACT", "REVEAL_NPC_TRAIT", "REVEAL_NPC_STATUS", "SET_NPC_STATUS", "ADD_NPC_MILESTONE"].includes(op)) continue;
    const npcId = targetNpcId(effect, context); let npc = next.run.npcs.byId[npcId]; if (npc === undefined) fail(`unknown NPC ${npcId}`);
    if (!encounteredIds.has(npcId)) { npc = encountered(npc, next); encounteredIds.add(npcId); }
    const targetFields = effect.npcId === undefined ? ["actorBindingKey"] : ["npcId"];
    if (op === "ADJUST_NPC_RELATION") {
      exact(effect, ["op", ...targetFields, "reasonTag"], ["affinityDelta", "trustDelta", "debtDelta"], "effect"); const reasonTag = ensureReason(pack, effect.reasonTag);
      if (effect.affinityDelta === undefined && effect.trustDelta === undefined && effect.debtDelta === undefined) fail("relation adjustment requires a delta");
      const before = npc.relation; const affinity = clampInteger(safeAdd(before.affinity, effect.affinityDelta === undefined ? 0 : integer(effect.affinityDelta, "effect.affinityDelta")), pack.rules.relation.affinityMin, pack.rules.relation.affinityMax);
      const trust = clampInteger(safeAdd(before.trust, effect.trustDelta === undefined ? 0 : integer(effect.trustDelta, "effect.trustDelta")), pack.rules.relation.trustMin, pack.rules.relation.trustMax);
      const debt = clampInteger(safeAdd(before.debt, effect.debtDelta === undefined ? 0 : integer(effect.debtDelta, "effect.debtDelta")), pack.rules.relation.debtMin, pack.rules.relation.debtMax);
      npc = { ...npc, relation: { ...before, affinity, trust, debt } };
      if (Math.abs(affinity - before.affinity) >= pack.rules.relation.majorChangeThreshold || Math.abs(trust - before.trust) >= pack.rules.relation.majorChangeThreshold) { npc = appendMilestone(npc, milestone(npc, "majorRelationChange", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_MAJOR_RELATION_CHANGE", npcId, reasonTag }); }
      if (before.debt === 0 && debt !== 0) { npc = appendMilestone(npc, milestone(npc, "debtCreated", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_DEBT_CREATED", npcId, direction: debt > 0 ? "npcOwesPlayer" : "playerOwesNpc", reasonTag }); }
      if (before.debt !== 0 && debt === 0) { npc = appendMilestone(npc, milestone(npc, "debtResolved", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_DEBT_RESOLVED", npcId, reasonTag }); }
    } else if (op === "ADD_NPC_SIGNIFICANCE") {
      exact(effect, ["op", ...targetFields, "amount", "reasonTag"], [], "effect"); const amount = integer(effect.amount, "effect.amount"); if (amount < pack.rules.significance.authoringMin || amount > pack.rules.significance.authoringMax) fail("significance amount outside authoring range"); const reasonTag = ensureReason(pack, effect.reasonTag);
      const significance = clampInteger(safeAdd(npc.significance, amount), pack.rules.significance.min, pack.rules.significance.max); const promoted = npc.originKind === "generated" && (npc.promotedToA || significance >= pack.rules.promotionThreshold);
      npc = { ...npc, significance, promotedToA: promoted };
      if (!npc.promotedToA && promoted) fail("promotion invariant failed");
      const wasPromoted = next.run.npcs.byId[npcId].promotedToA;
      if (!wasPromoted && promoted) { npc = appendMilestone(npc, milestone(npc, "promotedToA", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_PROMOTED_TO_A", npcId, reasonTag }); }
    } else if (op === "REVEAL_NPC_FACT") {
      exact(effect, ["op", ...targetFields, "factId", "reasonTag"], [], "effect"); const factId = string(effect.factId, "effect.factId"); ensureReason(pack, effect.reasonTag); if (!pack.facts.some((entry) => entry.id === factId) || !npc.factIds.includes(factId)) fail(`unknown or unavailable NPC fact ${factId}`); npc = { ...npc, knowledge: { ...npc.knowledge, knownFactIds: canonicalUnique([...npc.knowledge.knownFactIds, factId]) } }; facts.push({ type: "NPC_FACT_REVEALED", npcId, factId });
    } else if (op === "REVEAL_NPC_TRAIT") {
      exact(effect, ["op", ...targetFields, "traitTag", "reasonTag"], [], "effect"); const traitTag = string(effect.traitTag, "effect.traitTag"); ensureReason(pack, effect.reasonTag); if (!pack.traits.some((entry) => entry.id === traitTag) || !npc.traitTags.includes(traitTag)) fail(`unknown or unavailable NPC trait ${traitTag}`); npc = { ...npc, knowledge: { ...npc.knowledge, knownTraitTags: canonicalUnique([...npc.knowledge.knownTraitTags, traitTag]) } }; facts.push({ type: "NPC_TRAIT_REVEALED", npcId, traitTag });
    } else if (op === "REVEAL_NPC_STATUS") {
      exact(effect, ["op", ...targetFields, "reasonTag"], [], "effect"); const reasonTag = ensureReason(pack, effect.reasonTag); npc = { ...npc, knowledge: { ...npc.knowledge, knownStatus: npc.actualStatus, lastKnownAge: next.run.age, lastKnownNodeIndex: next.run.nodeIndex } }; npc = appendMilestone(npc, milestone(npc, "statusRevealed", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_STATUS_REVEALED", npcId, status: npc.actualStatus, reasonTag });
    } else if (op === "SET_NPC_STATUS") {
      exact(effect, ["op", ...targetFields, "targetStatus", "revealToPlayer", "reasonTag"], [], "effect"); const targetStatus = string(effect.targetStatus, "effect.targetStatus") as NpcActualStatus; if (!actualStatuses.has(targetStatus)) fail(`invalid NPC status ${targetStatus}`); if (typeof effect.revealToPlayer !== "boolean") fail("effect.revealToPlayer must be boolean"); const reasonTag = ensureReason(pack, effect.reasonTag); npc = { ...npc, actualStatus: targetStatus, ...(effect.revealToPlayer ? { knowledge: { ...npc.knowledge, knownStatus: targetStatus, lastKnownAge: next.run.age, lastKnownNodeIndex: next.run.nodeIndex } } : {}) }; npc = appendMilestone(npc, milestone(npc, "statusChanged", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_STATUS_CHANGED", npcId, status: targetStatus, public: effect.revealToPlayer, reasonTag }); if (effect.revealToPlayer) { npc = appendMilestone(npc, milestone(npc, "statusRevealed", next, context.sourceRef, reasonTag)); facts.push({ type: "NPC_STATUS_REVEALED", npcId, status: targetStatus, reasonTag }); }
    } else {
      exact(effect, ["op", ...targetFields, "type", "sourceRef", "reasonTag"], [], "effect"); const type = string(effect.type, "effect.type"); if (!pack.rules.milestoneTypes.includes(type)) fail(`unknown milestone type ${type}`); const reasonTag = ensureReason(pack, effect.reasonTag); npc = appendMilestone(npc, { type, age: next.run.age, nodeIndex: next.run.nodeIndex, sourceRef: string(effect.sourceRef, "effect.sourceRef"), reasonTag }); facts.push({ type: "NPC_MILESTONE", npcId, milestoneType: type, reasonTag });
    }
    next = replaceNpc(next, npc);
  }
  return { state: next, facts };
}

export function affinitySemantic(value: number, rules: NpcRules): "hostile" | "distant" | "neutral" | "warm" | "close" { const t = rules.relation.affinityThresholds; return value <= t.hostileMax ? "hostile" : value <= t.distantMax ? "distant" : value <= t.neutralMax ? "neutral" : value <= t.warmMax ? "warm" : "close"; }
export function trustSemantic(value: number, rules: NpcRules): "wary" | "guarded" | "familiar" | "trusted" | "deeplyTrusted" { const t = rules.relation.trustThresholds; return value <= t.waryMax ? "wary" : value <= t.guardedMax ? "guarded" : value <= t.familiarMax ? "familiar" : value <= t.trustedMax ? "trusted" : "deeplyTrusted"; }
export function debtSemantic(value: number): { direction: "playerOwesNpc" | "none" | "npcOwesPlayer"; count: number } { return value < 0 ? { direction: "playerOwesNpc", count: -value } : value > 0 ? { direction: "npcOwesPlayer", count: value } : { direction: "none", count: 0 }; }
