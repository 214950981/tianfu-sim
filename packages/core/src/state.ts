import { assertSafeInteger, clampInteger } from "./numeric.ts";
import { RNG_ALGORITHM_ID, RNG_STREAM_IDS, type RngState } from "./rng.ts";

export const RUN_STATUSES = ["offered", "active", "dying", "ended", "abandoned"] as const;
export const ACTION_TYPES = ["cultivate", "travel", "worldly", "pursuit"] as const;
export const CONDITION_KINDS = ["injury", "pillToxicity", "curse", "blessing", "pursued", "other"] as const;
export const DEATH_CAUSES = ["lifespan", "combat", "ambush", "exploration", "poison", "curse", "breakthrough", "injury", "cause", "special"] as const;

export type RunStatus = typeof RUN_STATUSES[number];
export type ActionType = typeof ACTION_TYPES[number];
export type ConditionKind = typeof CONDITION_KINDS[number];
export type DeathCause = string;
export interface RiskConditionInstance {
  id: string; definitionId: string; severity: 1 | 2 | 3; sourceRefs: string[];
  createdAge: number; createdNodeIndex: number; visibility: "explicit" | "hinted" | "hidden"; tags: string[];
}
export interface DeathRecord {
  deathCauseId: string; category: string; age: number; realmId: string; immediateSource: string;
  contributingSourceRefs: string[]; warningFacts: string[]; sourceCommandId?: string; sourceEventId?: string;
  sourceCauseId?: string; sourceActorId?: string; trace: Record<string, unknown>;
}
export interface InnateProfile { spiritualRoot: string; talentIds: string[]; majorDestinyId: string }
export interface InnateProfileOffer { selectionId: string; profile: InnateProfile }
export type CauseStatus = "dormant" | "eligible" | "echoed" | "resolved" | "expired";
export interface CauseInstance {
  causeId: string; templateId: string; originCommandId: string; originNodeIndex: number; originAge: number;
  actorIdsByRole: Record<string, string>; themes: string[]; salience: 1 | 2 | 3 | 4 | 5;
  visibility: "hidden" | "hint" | "journal"; state: CauseStatus;
  maturity: { minNode: number; minAge: number; conditions: unknown[] };
  eligibleSinceNode?: number; eligibleAge?: number; echoBudget: number; echoCount: number;
  facts: Record<string, string | number | boolean>; linkedEventIds: string[];
  resolution?: Record<string, unknown>;
}

export type NpcActualStatus = "active" | "missing" | "dead" | "departed";
export interface NpcRelationState { affinity: number; trust: number; debt: number; encounterCount: number }
export interface NpcKnowledgeState {
  met: boolean; knownFactIds: string[]; knownTraitTags: string[]; knownStatus?: NpcActualStatus;
  lastKnownAge?: number; lastKnownNodeIndex?: number;
}
export interface NpcMilestoneFact { type: string; age: number; nodeIndex: number; sourceRef: string; reasonTag: string }
export interface NpcInstance {
  npcId: string; definitionId?: string; archetypeId?: string; originKind: "core" | "generated"; displayName: string;
  traitTags: string[]; factIds: string[]; tags: string[]; roleTags: string[]; actualStatus: NpcActualStatus;
  relation: NpcRelationState; significance: number; promotedToA: boolean; knowledge: NpcKnowledgeState;
  createdAge: number; createdNodeIndex: number; lastEncounterAge: number; lastEncounterNodeIndex: number;
  encounterCount: number; milestoneFacts: NpcMilestoneFact[];
}
export type DirectorSlot = "P2" | "P3" | "P4" | "P5" | "P6" | "CONTINUATION";
export interface DirectorSceneRecord {
  eventId: string; nodeIndex: number; slot: DirectorSlot; salience: 1 | 2 | 3 | 4 | 5;
  topicTags: string[]; continuityTags: string[]; actorIds: string[]; buildIds: string[];
  causeId?: string; riskTier?: "low" | "caution" | "dangerous" | "lethal";
}
export interface DirectorState { profileId: "standard" | "first_run" | string; recentScenes: DirectorSceneRecord[] }
export interface EventOccurrenceState { occurrenceCount: number; lastOccurrenceNodeIndex: number }
export interface BuildAffinity { buildId: string; affinityBps: number; lifetimeEvidence: number; lastEvidenceNodeIndex: number }
interface BuildFactBase { id: string; buildId: string; source: string; sourceCommandId: string; age: number; nodeIndex: number; reasonTag: string }
export interface BuildEvidenceFact extends BuildFactBase { type: "BUILD_FIRST_EVIDENCE" | "BUILD_EVIDENCE"; amount: number; affinityBefore: number; affinityAfter: number }
export interface BuildTransitionFact extends BuildFactBase { type: "BUILD_STAGE_TRANSITION" | "BUILD_DOMINANT_FORMED" | "BUILD_DOMINANT_CHANGED" | "BUILD_REFINED" | "BUILD_BRANCH_UNLOCKED"; fromStage?: string; toStage?: string; fromBuildId?: string; toBuildId?: string }
export interface MetaState {
  playerId: string; metaCurrency: number; unlocks: string[]; discoveries: string[]; achievements: string[];
  cosmetics: string[]; entitlements: string[]; settings: Record<string, unknown>; stats: Record<string, number>;
}
export type MetaView = Pick<MetaState, "unlocks" | "entitlements" | "discoveries">;
export interface RunState {
  runId: string; playerId: string; rootSeed: string; status: RunStatus; nodeIndex: number; age: number; maxAge: number;
  offer?: { offerId: string; destinyIds: [string, string, string]; innateProfiles?: [InnateProfileOffer, InnateProfileOffer, InnateProfileOffer] };
  realm: { id: string; order: number; cultivation: number; cultivationBps?: number; realmFoundationBps?: number };
  attributes: { insight: number; body: number; spiritSense: number; fortune: number };
  resources: { spiritStone: number; items: Record<string, number> };
  conditions: Array<{ id: string; kind: ConditionKind; stacks: number; sourceRef: string; remainingNodes?: number }>;
  risk?: { conditions: RiskConditionInstance[]; exposureCount: number };
  identity: { runName: string; destinyId?: string; innateProfile?: InnateProfile; rootTags: string[]; factionId?: string; titles: string[] };
  actions: { available: ActionType[]; pursuitCauseIds: string[]; recent: ActionType[] };
  events: { current?: { eventId: string; kind: string; phase?: string; instanceId?: string; participantBindings?: Record<string, string>; triggeringCauseId?: string }; history: Array<{ eventId: string; nodeIndex: number; resultTier?: string }>; occurrences?: Record<string, EventOccurrenceState> };
  causes: { byId: Record<string, CauseInstance> };
  npcs: { nextNpcSequence: number; byId: Record<string, NpcInstance>; roleIndex: Record<string, string[]> };
  build: { techniques: string[]; artifacts: string[]; consumables: string[]; tagScores: Record<string, number>; mainPath?: string; secondaryPath?: string; affinities?: Record<string, BuildAffinity>; dominantBuildId?: string; evidenceFacts?: BuildEvidenceFact[]; transitionFacts?: BuildTransitionFact[]; unlockedBuildIds?: string[] };
  world: { regionId: string; knownRegionIds: string[]; tags: string[]; factionStanding: Record<string, number> };
  ending?: { endingId: string; deathCause?: DeathCause; sourceRef?: string; age: number; factIds: string[] };
  deathRecord?: DeathRecord;
  rng: RngState;
  director: DirectorState;
}
export interface GameState {
  schemaVersion: number; rulesVersion: string; contentVersion: string; stateVersion: number; run: RunState; metaView: MetaView;
}
export type RuleState = Pick<GameState, "schemaVersion" | "rulesVersion" | "contentVersion" | "stateVersion" | "run">;

const runStatusSet = new Set<string>(RUN_STATUSES);
const actionTypeSet = new Set<string>(ACTION_TYPES);
const conditionKindSet = new Set<string>(CONDITION_KINDS);
const npcOriginSet = new Set(["core", "generated"]);
const npcStatusSet = new Set(["active", "missing", "dead", "departed"]);
const causeStatusSet = new Set(["dormant", "eligible", "echoed", "resolved", "expired"]);

function invalid(path: string, message: string): never { throw new TypeError(`${path}: ${message}`); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "must be an object");
  return value as Record<string, unknown>;
}
function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "must be a string");
  return value;
}
function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "must be a boolean");
  return value;
}
function integer(value: unknown, path: string, min?: number, max?: number): number {
  if (typeof value !== "number") invalid(path, "must be a number");
  try { assertSafeInteger(value, path); } catch { invalid(path, "must be a finite safe integer"); }
  if (min !== undefined && value < min) invalid(path, `must be >= ${min}`);
  if (max !== undefined && value > max) invalid(path, `must be <= ${max}`);
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value;
}
function strings(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`));
}
function enumValue<T extends string>(value: unknown, values: Set<string>, path: string): T {
  const result = stringValue(value, path);
  if (!values.has(result)) invalid(path, "has an invalid value");
  return result as T;
}
function optionalString(object: Record<string, unknown>, key: string, path: string): void {
  if (object[key] !== undefined) stringValue(object[key], `${path}.${key}`);
}
function integerRecord(value: unknown, path: string): void {
  for (const [key, entry] of Object.entries(record(value, path))) integer(entry, `${path}.${key}`);
}
function safeRuleValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { integer(value, path); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => safeRuleValue(entry, `${path}[${index}]`)); return; }
  for (const [key, entry] of Object.entries(record(value, path))) safeRuleValue(entry, `${path}.${key}`);
}

function validateRng(value: unknown, path: string, rulesVersion: string, rootSeed: string): void {
  const rng = record(value, path);
  if (rng.algorithmId !== RNG_ALGORITHM_ID) invalid(`${path}.algorithmId`, `must be ${RNG_ALGORITHM_ID}`);
  if (stringValue(rng.rulesVersion, `${path}.rulesVersion`) !== rulesVersion) invalid(`${path}.rulesVersion`, "must match GameState.rulesVersion");
  if (stringValue(rng.rootSeed, `${path}.rootSeed`) !== rootSeed) invalid(`${path}.rootSeed`, "must match RunState.rootSeed");
  const streams = record(rng.streams, `${path}.streams`);
  for (const streamId of RNG_STREAM_IDS) {
    const stream = record(streams[streamId], `${path}.streams.${streamId}`);
    const words = array(stream.s, `${path}.streams.${streamId}.s`);
    if (words.length !== 4) invalid(`${path}.streams.${streamId}.s`, "must contain four words");
    words.forEach((word, index) => integer(word, `${path}.streams.${streamId}.s[${index}]`, 0, 0xffff_ffff));
    if (words.every((word) => word === 0)) invalid(`${path}.streams.${streamId}.s`, "must not be all zero");
    integer(stream.drawIndex, `${path}.streams.${streamId}.drawIndex`, 0);
  }
}

function validateNpc(value: unknown, path: string): void {
  const npc = record(value, path);
  for (const key of ["npcId", "displayName"] as const) stringValue(npc[key], `${path}.${key}`);
  optionalString(npc, "definitionId", path); optionalString(npc, "archetypeId", path);
  const originKind = enumValue<"core" | "generated">(npc.originKind, npcOriginSet, `${path}.originKind`);
  if (originKind === "core" ? npc.definitionId === undefined || npc.archetypeId !== undefined : npc.archetypeId === undefined || npc.definitionId !== undefined) invalid(path, "originKind must match exactly one definition source");
  enumValue(npc.actualStatus, npcStatusSet, `${path}.actualStatus`);
  for (const key of ["traitTags", "factIds", "tags", "roleTags"] as const) { const values = strings(npc[key], `${path}.${key}`); if (new Set(values).size !== values.length) invalid(`${path}.${key}`, "must be unique"); }
  const relation = record(npc.relation, `${path}.relation`);
  integer(relation.affinity, `${path}.relation.affinity`, -100, 100);
  integer(relation.trust, `${path}.relation.trust`, -100, 100);
  integer(relation.debt, `${path}.relation.debt`, -3, 3);
  integer(relation.encounterCount, `${path}.relation.encounterCount`, 0);
  integer(npc.significance, `${path}.significance`, 0, 10_000); booleanValue(npc.promotedToA, `${path}.promotedToA`);
  if (originKind === "core" && npc.promotedToA === true) invalid(`${path}.promotedToA`, "core NPC cannot be promoted to A");
  const knowledge = record(npc.knowledge, `${path}.knowledge`); booleanValue(knowledge.met, `${path}.knowledge.met`);
  const knownFacts = strings(knowledge.knownFactIds, `${path}.knowledge.knownFactIds`); const knownTraits = strings(knowledge.knownTraitTags, `${path}.knowledge.knownTraitTags`);
  if (knownFacts.some((id) => !(npc.factIds as string[]).includes(id))) invalid(`${path}.knowledge.knownFactIds`, "must be a subset of NPC facts");
  if (knownTraits.some((id) => !(npc.traitTags as string[]).includes(id))) invalid(`${path}.knowledge.knownTraitTags`, "must be a subset of NPC traits");
  if (knowledge.knownStatus !== undefined) enumValue(knowledge.knownStatus, npcStatusSet, `${path}.knowledge.knownStatus`);
  if ((knowledge.lastKnownAge === undefined) !== (knowledge.lastKnownNodeIndex === undefined)) invalid(`${path}.knowledge`, "last known age and node must be present together");
  if (knowledge.lastKnownAge !== undefined) { integer(knowledge.lastKnownAge, `${path}.knowledge.lastKnownAge`, 0); integer(knowledge.lastKnownNodeIndex, `${path}.knowledge.lastKnownNodeIndex`, 0); }
  for (const key of ["createdAge", "createdNodeIndex", "lastEncounterAge", "lastEncounterNodeIndex", "encounterCount"] as const) integer(npc[key], `${path}.${key}`, 0);
  if (npc.encounterCount !== relation.encounterCount) invalid(`${path}.encounterCount`, "must match relation.encounterCount");
  for (const [index, raw] of array(npc.milestoneFacts, `${path}.milestoneFacts`).entries()) { const fact = record(raw, `${path}.milestoneFacts[${index}]`); for (const key of ["type", "sourceRef", "reasonTag"] as const) stringValue(fact[key], `${path}.milestoneFacts[${index}].${key}`); integer(fact.age, `${path}.milestoneFacts[${index}].age`, 0); integer(fact.nodeIndex, `${path}.milestoneFacts[${index}].nodeIndex`, 0); }
}

function validateCause(value: unknown, path: string): void {
  const cause = record(value, path);
  for (const key of ["causeId", "templateId", "originCommandId"] as const) stringValue(cause[key], `${path}.${key}`);
  integer(cause.originNodeIndex, `${path}.originNodeIndex`, 0); integer(cause.originAge, `${path}.originAge`, 0);
  const actors = record(cause.actorIdsByRole, `${path}.actorIdsByRole`);
  for (const [role, actorId] of Object.entries(actors)) { if (role.length === 0) invalid(`${path}.actorIdsByRole`, "roles must be non-empty"); if (stringValue(actorId, `${path}.actorIdsByRole.${role}`).length === 0) invalid(`${path}.actorIdsByRole.${role}`, "must be non-empty"); }
  strings(cause.themes, `${path}.themes`); integer(cause.salience, `${path}.salience`, 1, 5);
  enumValue(cause.visibility, new Set(["hidden", "hint", "journal"]), `${path}.visibility`);
  enumValue(cause.state, causeStatusSet, `${path}.state`);
  const maturity = record(cause.maturity, `${path}.maturity`);
  integer(maturity.minNode, `${path}.maturity.minNode`, 0); integer(maturity.minAge, `${path}.maturity.minAge`, 0);
  array(maturity.conditions, `${path}.maturity.conditions`).forEach((entry, index) => safeRuleValue(entry, `${path}.maturity.conditions[${index}]`));
  if (cause.eligibleSinceNode !== undefined) integer(cause.eligibleSinceNode, `${path}.eligibleSinceNode`, 0);
  if (cause.eligibleAge !== undefined) integer(cause.eligibleAge, `${path}.eligibleAge`, 0);
  integer(cause.echoBudget, `${path}.echoBudget`, 0, 3); integer(cause.echoCount, `${path}.echoCount`, 0);
  const facts = record(cause.facts, `${path}.facts`); for (const [key, entry] of Object.entries(facts)) if (!["string", "number", "boolean"].includes(typeof entry)) invalid(`${path}.facts.${key}`, "must be scalar"); else if (typeof entry === "number") integer(entry, `${path}.facts.${key}`);
  strings(cause.linkedEventIds, `${path}.linkedEventIds`);
  if (cause.resolution !== undefined) safeRuleValue(cause.resolution, `${path}.resolution`);
}

function validateInnateProfile(value: unknown, path: string): void {
  const profile = record(value, path); stringValue(profile.spiritualRoot, `${path}.spiritualRoot`); strings(profile.talentIds, `${path}.talentIds`); stringValue(profile.majorDestinyId, `${path}.majorDestinyId`);
}

function validateRun(value: unknown, path: string, rulesVersion: string): asserts value is RunState {
  const run = record(value, path);
  for (const key of ["runId", "playerId", "rootSeed"] as const) stringValue(run[key], `${path}.${key}`);
  const status = enumValue<RunStatus>(run.status, runStatusSet, `${path}.status`);
  integer(run.nodeIndex, `${path}.nodeIndex`, 0); integer(run.age, `${path}.age`, 0); integer(run.maxAge, `${path}.maxAge`, 0);
  if ((run.age as number) > (run.maxAge as number)) invalid(`${path}.age`, "must not exceed maxAge");

  if (run.offer !== undefined) {
    const offer = record(run.offer, `${path}.offer`);
    stringValue(offer.offerId, `${path}.offer.offerId`);
    const destinyIds = strings(offer.destinyIds, `${path}.offer.destinyIds`);
    if (destinyIds.length !== 3) invalid(`${path}.offer.destinyIds`, "must contain exactly three ids");
    if (offer.innateProfiles !== undefined) {
      const profiles = array(offer.innateProfiles, `${path}.offer.innateProfiles`); if (profiles.length !== 3) invalid(`${path}.offer.innateProfiles`, "must contain exactly three offers");
      const selectionIds = profiles.map((entry, index) => { const item = record(entry, `${path}.offer.innateProfiles[${index}]`); const id = stringValue(item.selectionId, `${path}.offer.innateProfiles[${index}].selectionId`); validateInnateProfile(item.profile, `${path}.offer.innateProfiles[${index}].profile`); return id; });
      if (new Set(selectionIds).size !== selectionIds.length) invalid(`${path}.offer.innateProfiles`, "selection IDs must be unique");
    }
  }
  const identity = record(run.identity, `${path}.identity`);
  stringValue(identity.runName, `${path}.identity.runName`); optionalString(identity, "destinyId", `${path}.identity`); optionalString(identity, "factionId", `${path}.identity`);
  if (identity.innateProfile !== undefined) validateInnateProfile(identity.innateProfile, `${path}.identity.innateProfile`);
  strings(identity.rootTags, `${path}.identity.rootTags`); strings(identity.titles, `${path}.identity.titles`);
  if (status === "offered" && (run.offer === undefined || identity.destinyId !== undefined)) invalid(path, "offered requires an offer and no chosen destinyId");
  if (status === "active" && identity.destinyId === undefined) invalid(path, "active requires a chosen destinyId");

  const realm = record(run.realm, `${path}.realm`);
  stringValue(realm.id, `${path}.realm.id`); integer(realm.order, `${path}.realm.order`, 0); integer(realm.cultivation, `${path}.realm.cultivation`, 0);
  if ((realm.cultivationBps === undefined) !== (realm.realmFoundationBps === undefined)) invalid(`${path}.realm`, "progression BPS fields must be present together");
  if (realm.cultivationBps !== undefined) { integer(realm.cultivationBps, `${path}.realm.cultivationBps`, 0, 10_000); integer(realm.realmFoundationBps, `${path}.realm.realmFoundationBps`, 0, 10_000); if (realm.cultivation !== realm.cultivationBps) invalid(`${path}.realm.cultivation`, "must mirror cultivationBps"); }
  const attributes = record(run.attributes, `${path}.attributes`);
  for (const key of ["insight", "body", "spiritSense", "fortune"] as const) integer(attributes[key], `${path}.attributes.${key}`);
  const resources = record(run.resources, `${path}.resources`);
  integer(resources.spiritStone, `${path}.resources.spiritStone`, 0); integerRecord(resources.items, `${path}.resources.items`);
  for (const [index, entry] of array(run.conditions, `${path}.conditions`).entries()) {
    const condition = record(entry, `${path}.conditions[${index}]`);
    stringValue(condition.id, `${path}.conditions[${index}].id`); stringValue(condition.sourceRef, `${path}.conditions[${index}].sourceRef`);
    enumValue(condition.kind, conditionKindSet, `${path}.conditions[${index}].kind`);
    integer(condition.stacks, `${path}.conditions[${index}].stacks`, 0, 3);
    if (condition.remainingNodes !== undefined) integer(condition.remainingNodes, `${path}.conditions[${index}].remainingNodes`, 0);
  }
  if (run.risk !== undefined) {
    const risk = record(run.risk, `${path}.risk`); integer(risk.exposureCount, `${path}.risk.exposureCount`, 0);
    const ids = new Set<string>();
    for (const [index, entry] of array(risk.conditions, `${path}.risk.conditions`).entries()) {
      const condition = record(entry, `${path}.risk.conditions[${index}]`); const id = stringValue(condition.id, `${path}.risk.conditions[${index}].id`);
      if (ids.has(id)) invalid(`${path}.risk.conditions[${index}].id`, "must be unique"); ids.add(id);
      stringValue(condition.definitionId, `${path}.risk.conditions[${index}].definitionId`); integer(condition.severity, `${path}.risk.conditions[${index}].severity`, 1, 3);
      strings(condition.sourceRefs, `${path}.risk.conditions[${index}].sourceRefs`); integer(condition.createdAge, `${path}.risk.conditions[${index}].createdAge`, 0); integer(condition.createdNodeIndex, `${path}.risk.conditions[${index}].createdNodeIndex`, 0);
      enumValue(condition.visibility, new Set(["explicit", "hinted", "hidden"]), `${path}.risk.conditions[${index}].visibility`); strings(condition.tags, `${path}.risk.conditions[${index}].tags`);
    }
  }
  const actions = record(run.actions, `${path}.actions`);
  for (const key of ["available", "recent"] as const) array(actions[key], `${path}.actions.${key}`).forEach((entry, index) => enumValue(entry, actionTypeSet, `${path}.actions.${key}[${index}]`));
  strings(actions.pursuitCauseIds, `${path}.actions.pursuitCauseIds`);
  const events = record(run.events, `${path}.events`);
  if (events.current !== undefined) {
    const current = record(events.current, `${path}.events.current`);
    stringValue(current.eventId, `${path}.events.current.eventId`); stringValue(current.kind, `${path}.events.current.kind`); optionalString(current, "phase", `${path}.events.current`);
    optionalString(current, "instanceId", `${path}.events.current`);
    optionalString(current, "triggeringCauseId", `${path}.events.current`);
    if (current.participantBindings !== undefined) {
      const bindings = record(current.participantBindings, `${path}.events.current.participantBindings`);
      for (const [slot, npcId] of Object.entries(bindings)) {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slot)) invalid(`${path}.events.current.participantBindings.${slot}`, "has an invalid participant slot");
        stringValue(npcId, `${path}.events.current.participantBindings.${slot}`);
      }
    }
  }
  for (const [index, entry] of array(events.history, `${path}.events.history`).entries()) {
    const event = record(entry, `${path}.events.history[${index}]`);
    stringValue(event.eventId, `${path}.events.history[${index}].eventId`); integer(event.nodeIndex, `${path}.events.history[${index}].nodeIndex`, 0); optionalString(event, "resultTier", `${path}.events.history[${index}]`);
  }
  if (events.occurrences !== undefined) for (const [eventId, raw] of Object.entries(record(events.occurrences, `${path}.events.occurrences`))) {
    if (eventId.length === 0) invalid(`${path}.events.occurrences`, "eventId keys must be non-empty");
    const occurrence = record(raw, `${path}.events.occurrences.${eventId}`); const keys = Object.keys(occurrence);
    if (keys.length !== 2 || !keys.includes("occurrenceCount") || !keys.includes("lastOccurrenceNodeIndex")) invalid(`${path}.events.occurrences.${eventId}`, "has unknown or missing fields");
    integer(occurrence.occurrenceCount, `${path}.events.occurrences.${eventId}.occurrenceCount`, 1);
    integer(occurrence.lastOccurrenceNodeIndex, `${path}.events.occurrences.${eventId}.lastOccurrenceNodeIndex`, 0, run.nodeIndex as number);
  }
  const causes = record(record(run.causes, `${path}.causes`).byId, `${path}.causes.byId`);
  for (const [id, cause] of Object.entries(causes)) { validateCause(cause, `${path}.causes.byId.${id}`); if ((cause as CauseInstance).causeId !== id) invalid(`${path}.causes.byId.${id}.causeId`, "must match map key"); }
  const npcState = record(run.npcs, `${path}.npcs`); integer(npcState.nextNpcSequence, `${path}.npcs.nextNpcSequence`, 1);
  const npcs = record(npcState.byId, `${path}.npcs.byId`);
  for (const [id, npc] of Object.entries(npcs)) { validateNpc(npc, `${path}.npcs.byId.${id}`); if ((npc as NpcInstance).npcId !== id) invalid(`${path}.npcs.byId.${id}.npcId`, "must match map key"); }
  const roleIndex = record(npcState.roleIndex, `${path}.npcs.roleIndex`); for (const [role, rawIds] of Object.entries(roleIndex)) { if (role.length === 0) invalid(`${path}.npcs.roleIndex`, "role must be non-empty"); const ids = strings(rawIds, `${path}.npcs.roleIndex.${role}`); if (new Set(ids).size !== ids.length || ids.some((id) => !(id in npcs) || !(npcs[id] as NpcInstance).roleTags.includes(role))) invalid(`${path}.npcs.roleIndex.${role}`, "must contain unique matching NPC IDs"); }
  for (const npc of Object.values(npcs) as NpcInstance[]) for (const role of npc.roleTags) if (!(roleIndex[role] as string[] | undefined)?.includes(npc.npcId)) invalid(`${path}.npcs.roleIndex.${role}`, "must index every persistent NPC role");
  if (events.current !== undefined && (events.current as Record<string, unknown>).participantBindings !== undefined) for (const [slot, npcId] of Object.entries((events.current as { participantBindings: Record<string, string> }).participantBindings)) if (!(npcId in npcs)) invalid(`${path}.events.current.participantBindings.${slot}`, "must reference an existing NPC");
  const build = record(run.build, `${path}.build`);
  strings(build.techniques, `${path}.build.techniques`); strings(build.artifacts, `${path}.build.artifacts`); strings(build.consumables, `${path}.build.consumables`);
  integerRecord(build.tagScores, `${path}.build.tagScores`); optionalString(build, "mainPath", `${path}.build`); optionalString(build, "secondaryPath", `${path}.build`);
  if (build.affinities !== undefined) for (const [id, entry] of Object.entries(record(build.affinities, `${path}.build.affinities`))) { const affinity = record(entry, `${path}.build.affinities.${id}`); if (stringValue(affinity.buildId, `${path}.build.affinities.${id}.buildId`) !== id) invalid(`${path}.build.affinities.${id}.buildId`, "must match map key"); integer(affinity.affinityBps, `${path}.build.affinities.${id}.affinityBps`, 0, 10_000); integer(affinity.lifetimeEvidence, `${path}.build.affinities.${id}.lifetimeEvidence`, 0); integer(affinity.lastEvidenceNodeIndex, `${path}.build.affinities.${id}.lastEvidenceNodeIndex`, 0, run.nodeIndex as number); }
  optionalString(build, "dominantBuildId", `${path}.build`); if (build.dominantBuildId !== undefined && !(build.affinities !== undefined && Object.hasOwn(build.affinities as object, build.dominantBuildId as string))) invalid(`${path}.build.dominantBuildId`, "must reference an existing affinity");
  if (build.unlockedBuildIds !== undefined) { const ids = strings(build.unlockedBuildIds, `${path}.build.unlockedBuildIds`); if (new Set(ids).size !== ids.length) invalid(`${path}.build.unlockedBuildIds`, "must be unique"); }
  for (const key of ["evidenceFacts", "transitionFacts"] as const) if (build[key] !== undefined) for (const [index, value] of array(build[key], `${path}.build.${key}`).entries()) { const fact = record(value, `${path}.build.${key}[${index}]`); for (const stringKey of ["id", "type", "buildId", "source", "sourceCommandId", "reasonTag"]) stringValue(fact[stringKey], `${path}.build.${key}[${index}].${stringKey}`); integer(fact.age, `${path}.build.${key}[${index}].age`, 0); integer(fact.nodeIndex, `${path}.build.${key}[${index}].nodeIndex`, 0, run.nodeIndex as number); if (key === "evidenceFacts") { integer(fact.amount, `${path}.build.${key}[${index}].amount`, 0); integer(fact.affinityBefore, `${path}.build.${key}[${index}].affinityBefore`, 0, 10_000); integer(fact.affinityAfter, `${path}.build.${key}[${index}].affinityAfter`, 0, 10_000); } else for (const optional of ["fromStage", "toStage", "fromBuildId", "toBuildId"] as const) optionalString(fact, optional, `${path}.build.${key}[${index}]`); }
  const world = record(run.world, `${path}.world`);
  stringValue(world.regionId, `${path}.world.regionId`); strings(world.knownRegionIds, `${path}.world.knownRegionIds`); strings(world.tags, `${path}.world.tags`); integerRecord(world.factionStanding, `${path}.world.factionStanding`);
  if (run.ending !== undefined) {
    const ending = record(run.ending, `${path}.ending`);
    stringValue(ending.endingId, `${path}.ending.endingId`); optionalString(ending, "sourceRef", `${path}.ending`);
    if (ending.deathCause !== undefined) stringValue(ending.deathCause, `${path}.ending.deathCause`);
    integer(ending.age, `${path}.ending.age`, 0); strings(ending.factIds, `${path}.ending.factIds`);
  }
  if (run.deathRecord !== undefined) {
    const death = record(run.deathRecord, `${path}.deathRecord`);
    stringValue(death.deathCauseId, `${path}.deathRecord.deathCauseId`); stringValue(death.category, `${path}.deathRecord.category`); integer(death.age, `${path}.deathRecord.age`, 0);
    stringValue(death.realmId, `${path}.deathRecord.realmId`); stringValue(death.immediateSource, `${path}.deathRecord.immediateSource`); strings(death.contributingSourceRefs, `${path}.deathRecord.contributingSourceRefs`); strings(death.warningFacts, `${path}.deathRecord.warningFacts`);
    for (const key of ["sourceCommandId", "sourceEventId", "sourceCauseId", "sourceActorId"] as const) optionalString(death, key, `${path}.deathRecord`);
    record(death.trace, `${path}.deathRecord.trace`);
  }
  if (status === "ended" && run.ending === undefined) invalid(`${path}.ending`, "is required when status is ended");
  validateRng(run.rng, `${path}.rng`, rulesVersion, stringValue(run.rootSeed, `${path}.rootSeed`));
  const director = record(run.director, `${path}.director`); stringValue(director.profileId, `${path}.director.profileId`);
  for (const [index, raw] of array(director.recentScenes, `${path}.director.recentScenes`).entries()) { const scene = record(raw, `${path}.director.recentScenes[${index}]`); stringValue(scene.eventId, `${path}.director.recentScenes[${index}].eventId`); integer(scene.nodeIndex, `${path}.director.recentScenes[${index}].nodeIndex`, 0, run.nodeIndex as number); enumValue(scene.slot, new Set(["P2", "P3", "P4", "P5", "P6", "CONTINUATION"]), `${path}.director.recentScenes[${index}].slot`); integer(scene.salience, `${path}.director.recentScenes[${index}].salience`, 1, 5); for (const key of ["topicTags", "continuityTags", "actorIds", "buildIds"] as const) { const values = strings(scene[key], `${path}.director.recentScenes[${index}].${key}`); if (new Set(values).size !== values.length) invalid(`${path}.director.recentScenes[${index}].${key}`, "must be unique"); } optionalString(scene, "causeId", `${path}.director.recentScenes[${index}]`); if (scene.riskTier !== undefined) enumValue(scene.riskTier, new Set(["low", "caution", "dangerous", "lethal"]), `${path}.director.recentScenes[${index}].riskTier`); }
}

function validateMetaView(value: unknown, path: string): asserts value is MetaView {
  const view = record(value, path);
  strings(view.unlocks, `${path}.unlocks`); strings(view.entitlements, `${path}.entitlements`); strings(view.discoveries, `${path}.discoveries`);
}

export function validateGameState(value: unknown): GameState {
  const state = record(value, "state");
  integer(state.schemaVersion, "state.schemaVersion", 0); integer(state.stateVersion, "state.stateVersion", 0);
  const rulesVersion = stringValue(state.rulesVersion, "state.rulesVersion");
  stringValue(state.contentVersion, "state.contentVersion");
  validateRun(state.run, "state.run", rulesVersion); validateMetaView(state.metaView, "state.metaView");
  return value as GameState;
}

export function validateMetaState(value: unknown): MetaState {
  const meta = record(value, "meta");
  stringValue(meta.playerId, "meta.playerId"); integer(meta.metaCurrency, "meta.metaCurrency", 0);
  for (const key of ["unlocks", "discoveries", "achievements", "cosmetics", "entitlements"] as const) strings(meta[key], `meta.${key}`);
  record(meta.settings, "meta.settings"); integerRecord(meta.stats, "meta.stats");
  return value as MetaState;
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((entry, index) => structurallyEqual(entry, right[index]));
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null || Array.isArray(left) || Array.isArray(right)) return false;
  const leftRecord = left as Record<string, unknown>; const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord); const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && structurallyEqual(leftRecord[key], rightRecord[key]));
}

export function validateStateTransition(previousValue: unknown, nextValue: unknown): GameState {
  const previous = validateGameState(previousValue); const next = validateGameState(nextValue);
  if (previous.schemaVersion !== next.schemaVersion || previous.rulesVersion !== next.rulesVersion || previous.contentVersion !== next.contentVersion || previous.run.rootSeed !== next.run.rootSeed) {
    invalid("state", "schema/rules/content versions and rootSeed are immutable once offered");
  }
  if (previous.run.status === "ended" && !structurallyEqual(previous.run, next.run)) invalid("state.run", "ended Run rule fields are immutable");
  if (next.run.npcs.nextNpcSequence < previous.run.npcs.nextNpcSequence) invalid("state.run.npcs.nextNpcSequence", "must be monotonic");
  for (const [npcId, npc] of Object.entries(previous.run.npcs.byId)) { const nextNpc = next.run.npcs.byId[npcId]; if (nextNpc === undefined) invalid(`state.run.npcs.byId.${npcId}`, "persistent NPC cannot be removed"); if (nextNpc.significance < npc.significance) invalid(`state.run.npcs.byId.${npcId}.significance`, "must be monotonic"); if (npc.promotedToA && !nextNpc.promotedToA) invalid(`state.run.npcs.byId.${npcId}.promotedToA`, "cannot be demoted"); }
  for (const [buildId, affinity] of Object.entries(previous.run.build.affinities ?? {})) { const nextAffinity = next.run.build.affinities?.[buildId]; if (nextAffinity === undefined || nextAffinity.lifetimeEvidence < affinity.lifetimeEvidence) invalid(`state.run.build.affinities.${buildId}.lifetimeEvidence`, "must be monotonic"); }
  for (const [eventId, occurrence] of Object.entries(previous.run.events.occurrences ?? {})) { const nextOccurrence = next.run.events.occurrences?.[eventId]; if (nextOccurrence === undefined || nextOccurrence.occurrenceCount < occurrence.occurrenceCount || nextOccurrence.lastOccurrenceNodeIndex < occurrence.lastOccurrenceNodeIndex) invalid(`state.run.events.occurrences.${eventId}`, "must be monotonic"); }
  return next;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) result[key] = canonicalValue((value as Record<string, unknown>)[key]);
  return result;
}

export function projectRuleState(value: unknown): RuleState {
  const state = validateGameState(value);
  return canonicalValue({
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    stateVersion: state.stateVersion,
    run: state.run
  }) as RuleState;
}

export const clampConditionStacks = (value: number): number => clampInteger(value, 0, 3);
export const clampRelationScore = (value: number): number => clampInteger(value, -100, 100);
export const clampDebt = (value: number): number => clampInteger(value, -3, 3);
