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

export interface Relation { affinity: number; trust: number; debt: number }
export interface NpcInstance {
  npcId: string; templateId: string; tier: "S" | "A" | "B" | "C"; name: string; age: number; maxAge: number;
  realmId: string; regionId: string; factionId?: string; status: "active" | "missing" | "injured" | "dead" | "ascended";
  traits: string[]; goal: string; relation: Relation; importanceScore: number; memoryRefs: string[]; timelineCursor: number; tags: string[];
}
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
  events: { current?: { eventId: string; kind: string; phase?: string }; history: Array<{ eventId: string; nodeIndex: number; resultTier?: string }> };
  causes: { byId: Record<string, CauseInstance> };
  npcs: { byId: Record<string, NpcInstance> };
  build: { techniques: string[]; artifacts: string[]; consumables: string[]; tagScores: Record<string, number>; mainPath?: string; secondaryPath?: string };
  world: { regionId: string; knownRegionIds: string[]; tags: string[]; factionStanding: Record<string, number> };
  ending?: { endingId: string; deathCause?: DeathCause; sourceRef?: string; age: number; factIds: string[] };
  deathRecord?: DeathRecord;
  rng: RngState;
  director: { firstRun: boolean; interventions: number; last?: { nodeIndex: number; kind: string; reason: string } };
}
export interface GameState {
  schemaVersion: number; rulesVersion: string; contentVersion: string; stateVersion: number; run: RunState; metaView: MetaView;
}
export type RuleState = Pick<GameState, "schemaVersion" | "rulesVersion" | "contentVersion" | "stateVersion" | "run">;

const runStatusSet = new Set<string>(RUN_STATUSES);
const actionTypeSet = new Set<string>(ACTION_TYPES);
const conditionKindSet = new Set<string>(CONDITION_KINDS);
const npcTierSet = new Set(["S", "A", "B", "C"]);
const npcStatusSet = new Set(["active", "missing", "injured", "dead", "ascended"]);
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
  for (const key of ["npcId", "templateId", "name", "realmId", "regionId", "goal"] as const) stringValue(npc[key], `${path}.${key}`);
  optionalString(npc, "factionId", path);
  enumValue(npc.tier, npcTierSet, `${path}.tier`);
  enumValue(npc.status, npcStatusSet, `${path}.status`);
  integer(npc.age, `${path}.age`, 0); integer(npc.maxAge, `${path}.maxAge`, 0);
  if ((npc.age as number) > (npc.maxAge as number)) invalid(`${path}.age`, "must not exceed maxAge");
  integer(npc.importanceScore, `${path}.importanceScore`); integer(npc.timelineCursor, `${path}.timelineCursor`, 0);
  strings(npc.traits, `${path}.traits`); strings(npc.memoryRefs, `${path}.memoryRefs`); strings(npc.tags, `${path}.tags`);
  const relation = record(npc.relation, `${path}.relation`);
  integer(relation.affinity, `${path}.relation.affinity`, -100, 100);
  integer(relation.trust, `${path}.relation.trust`, -100, 100);
  integer(relation.debt, `${path}.relation.debt`, -3, 3);
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
  }
  for (const [index, entry] of array(events.history, `${path}.events.history`).entries()) {
    const event = record(entry, `${path}.events.history[${index}]`);
    stringValue(event.eventId, `${path}.events.history[${index}].eventId`); integer(event.nodeIndex, `${path}.events.history[${index}].nodeIndex`, 0); optionalString(event, "resultTier", `${path}.events.history[${index}]`);
  }
  const causes = record(record(run.causes, `${path}.causes`).byId, `${path}.causes.byId`);
  for (const [id, cause] of Object.entries(causes)) { validateCause(cause, `${path}.causes.byId.${id}`); if ((cause as CauseInstance).causeId !== id) invalid(`${path}.causes.byId.${id}.causeId`, "must match map key"); }
  const npcs = record(record(run.npcs, `${path}.npcs`).byId, `${path}.npcs.byId`);
  for (const [id, npc] of Object.entries(npcs)) validateNpc(npc, `${path}.npcs.byId.${id}`);
  const build = record(run.build, `${path}.build`);
  strings(build.techniques, `${path}.build.techniques`); strings(build.artifacts, `${path}.build.artifacts`); strings(build.consumables, `${path}.build.consumables`);
  integerRecord(build.tagScores, `${path}.build.tagScores`); optionalString(build, "mainPath", `${path}.build`); optionalString(build, "secondaryPath", `${path}.build`);
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
  const director = record(run.director, `${path}.director`);
  booleanValue(director.firstRun, `${path}.director.firstRun`); integer(director.interventions, `${path}.director.interventions`, 0);
  if (director.last !== undefined) {
    const last = record(director.last, `${path}.director.last`);
    integer(last.nodeIndex, `${path}.director.last.nodeIndex`, 0); stringValue(last.kind, `${path}.director.last.kind`); stringValue(last.reason, `${path}.director.last.reason`);
  }
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
