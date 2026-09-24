// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/state.ts
// Source sha256:   6f8de988732d02014afa9c6906a6082cfb5a5d8300cca0d57e872f94c33bebc7
// Generator:       tools/ui04d-cloud-runtime-artifact.mjs
// Regenerate:      node tools/ui04d-cloud-runtime-artifact.mjs --write
//
// Deployable CommonJS derived mechanically from the accepted TypeScript module above: type syntax is
// erased with Node's built-in type stripper and ES module syntax is rewritten to plain CommonJS.
// Nothing here was hand-copied — there is exactly one reducer, one CommandGateway, one ViewModel
// builder and one CONTENT01, and they live in the source modules named above.
//
// The closure is pinned to the required server Core/Content modules only: no client package (except
// command-wire, which Core's command module re-exports), no content audit or simulation tooling, and no
// Node builtin or third-party dependency. See docs/UI04D_CLOUD_BACKEND.md.
var { assertSafeInteger, clampInteger } = require("./core-numeric.js");
var { RNG_ALGORITHM_ID, RNG_STREAM_IDS } = require("./core-rng.js");

const RUN_STATUSES = ["offered", "active", "dying", "ended", "abandoned"]         ;
const ACTION_TYPES = ["cultivate", "travel", "worldly", "pursuit"]         ;
const CONDITION_KINDS = ["injury", "pillToxicity", "curse", "blessing", "pursued", "other"]         ;
const DEATH_CAUSES = ["lifespan", "combat", "ambush", "exploration", "poison", "curse", "breakthrough", "injury", "cause", "special"]         ;

                                                    
                                                     
                                                           
                                
                                        
                                                                              
                                                                                                             
 
                              
                                                                                                
                                                                                                             
                                                                                 
 
                                                                                                     
                                                                                   
                                                                                     
                                
                                                                                                           
                                                                                        
                                                                
                                                                       
                                                                                          
                                                                             
                                       
 

                                                                         
                                                                                                           
                                    
                                                                                                
                                                     
 
                                                                                                                        
                              
                                                                                                                    
                                                                                                            
                                                                                                       
                                                                                                         
                                                             
 
                                                                             
                                      
                                                                                      
                                                                                        
                                                                          
 
                                                                                                                    
                                                                                                  
                                                                                                                                
                                                                                                                                                   
                                                                                                                                                                           
                                                                                                                                                                                                                                                                              
                            
                                                                                                           
                                                                                                                
 
                                                                                   
                           
                                                                                                                       
                                                                                                                                                   
                                                                                                                  
                                                                                      
                                                                    
                                                                                                                     
                                                                        
                                                                                                                                             
                                                                                        
                                                                                                                                                                                                                                                                                                          
                                                  
                                                                                                            
                                                                                                                                                                                                                                                                                                                                             
                                                                                                                 
                                                                                                             
                            
                
                          
 
                            
                                                                                                                               
 
                                                                                                                      

const runStatusSet = new Set        (RUN_STATUSES);
const actionTypeSet = new Set        (ACTION_TYPES);
const conditionKindSet = new Set        (CONDITION_KINDS);
const npcOriginSet = new Set(["core", "generated"]);
const npcStatusSet = new Set(["active", "missing", "dead", "departed"]);
const causeStatusSet = new Set(["dormant", "eligible", "echoed", "resolved", "expired"]);

function invalid(path        , message        )        { throw new TypeError(`${path}: ${message}`); }
function record(value         , path        )                          {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "must be an object");
  return value                           ;
}
function stringValue(value         , path        )         {
  if (typeof value !== "string") invalid(path, "must be a string");
  return value;
}
function booleanValue(value         , path        )          {
  if (typeof value !== "boolean") invalid(path, "must be a boolean");
  return value;
}
function integer(value         , path        , min         , max         )         {
  if (typeof value !== "number") invalid(path, "must be a number");
  try { assertSafeInteger(value, path); } catch { invalid(path, "must be a finite safe integer"); }
  if (min !== undefined && value < min) invalid(path, `must be >= ${min}`);
  if (max !== undefined && value > max) invalid(path, `must be <= ${max}`);
  return value;
}
function array(value         , path        )            {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  return value;
}
function strings(value         , path        )           {
  return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`));
}
function enumValue                  (value         , values             , path        )    {
  const result = stringValue(value, path);
  if (!values.has(result)) invalid(path, "has an invalid value");
  return result     ;
}
function optionalString(object                         , key        , path        )       {
  if (object[key] !== undefined) stringValue(object[key], `${path}.${key}`);
}
function integerRecord(value         , path        )       {
  for (const [key, entry] of Object.entries(record(value, path))) integer(entry, `${path}.${key}`);
}
function safeRuleValue(value         , path        )       {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { integer(value, path); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => safeRuleValue(entry, `${path}[${index}]`)); return; }
  for (const [key, entry] of Object.entries(record(value, path))) safeRuleValue(entry, `${path}.${key}`);
}

function validateRng(value         , path        , rulesVersion        , rootSeed        )       {
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

function validateNpc(value         , path        )       {
  const npc = record(value, path);
  for (const key of ["npcId", "displayName"]         ) stringValue(npc[key], `${path}.${key}`);
  optionalString(npc, "definitionId", path); optionalString(npc, "archetypeId", path);
  const originKind = enumValue                      (npc.originKind, npcOriginSet, `${path}.originKind`);
  if (originKind === "core" ? npc.definitionId === undefined || npc.archetypeId !== undefined : npc.archetypeId === undefined || npc.definitionId !== undefined) invalid(path, "originKind must match exactly one definition source");
  enumValue(npc.actualStatus, npcStatusSet, `${path}.actualStatus`);
  for (const key of ["traitTags", "factIds", "tags", "roleTags"]         ) { const values = strings(npc[key], `${path}.${key}`); if (new Set(values).size !== values.length) invalid(`${path}.${key}`, "must be unique"); }
  const relation = record(npc.relation, `${path}.relation`);
  integer(relation.affinity, `${path}.relation.affinity`, -100, 100);
  integer(relation.trust, `${path}.relation.trust`, -100, 100);
  integer(relation.debt, `${path}.relation.debt`, -3, 3);
  integer(relation.encounterCount, `${path}.relation.encounterCount`, 0);
  integer(npc.significance, `${path}.significance`, 0, 10_000); booleanValue(npc.promotedToA, `${path}.promotedToA`);
  if (originKind === "core" && npc.promotedToA === true) invalid(`${path}.promotedToA`, "core NPC cannot be promoted to A");
  const knowledge = record(npc.knowledge, `${path}.knowledge`); booleanValue(knowledge.met, `${path}.knowledge.met`);
  const knownFacts = strings(knowledge.knownFactIds, `${path}.knowledge.knownFactIds`); const knownTraits = strings(knowledge.knownTraitTags, `${path}.knowledge.knownTraitTags`);
  if (knownFacts.some((id) => !(npc.factIds            ).includes(id))) invalid(`${path}.knowledge.knownFactIds`, "must be a subset of NPC facts");
  if (knownTraits.some((id) => !(npc.traitTags            ).includes(id))) invalid(`${path}.knowledge.knownTraitTags`, "must be a subset of NPC traits");
  if (knowledge.knownStatus !== undefined) enumValue(knowledge.knownStatus, npcStatusSet, `${path}.knowledge.knownStatus`);
  if ((knowledge.lastKnownAge === undefined) !== (knowledge.lastKnownNodeIndex === undefined)) invalid(`${path}.knowledge`, "last known age and node must be present together");
  if (knowledge.lastKnownAge !== undefined) { integer(knowledge.lastKnownAge, `${path}.knowledge.lastKnownAge`, 0); integer(knowledge.lastKnownNodeIndex, `${path}.knowledge.lastKnownNodeIndex`, 0); }
  for (const key of ["createdAge", "createdNodeIndex", "lastEncounterAge", "lastEncounterNodeIndex", "encounterCount"]         ) integer(npc[key], `${path}.${key}`, 0);
  if (npc.encounterCount !== relation.encounterCount) invalid(`${path}.encounterCount`, "must match relation.encounterCount");
  for (const [index, raw] of array(npc.milestoneFacts, `${path}.milestoneFacts`).entries()) { const fact = record(raw, `${path}.milestoneFacts[${index}]`); for (const key of ["type", "sourceRef", "reasonTag"]         ) stringValue(fact[key], `${path}.milestoneFacts[${index}].${key}`); integer(fact.age, `${path}.milestoneFacts[${index}].age`, 0); integer(fact.nodeIndex, `${path}.milestoneFacts[${index}].nodeIndex`, 0); }
}

function validateCause(value         , path        )       {
  const cause = record(value, path);
  for (const key of ["causeId", "templateId", "originCommandId"]         ) stringValue(cause[key], `${path}.${key}`);
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

function validateInnateProfile(value         , path        )       {
  const profile = record(value, path); stringValue(profile.spiritualRoot, `${path}.spiritualRoot`); strings(profile.talentIds, `${path}.talentIds`); stringValue(profile.majorDestinyId, `${path}.majorDestinyId`);
}

function validateRun(value         , path        , rulesVersion        )                            {
  const run = record(value, path);
  for (const key of ["runId", "playerId", "rootSeed"]         ) stringValue(run[key], `${path}.${key}`);
  const status = enumValue           (run.status, runStatusSet, `${path}.status`);
  integer(run.nodeIndex, `${path}.nodeIndex`, 0); integer(run.age, `${path}.age`, 0); integer(run.maxAge, `${path}.maxAge`, 0);
  if ((run.age          ) > (run.maxAge          )) invalid(`${path}.age`, "must not exceed maxAge");

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
  for (const key of ["insight", "body", "spiritSense", "fortune"]         ) integer(attributes[key], `${path}.attributes.${key}`);
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
    const ids = new Set        ();
    for (const [index, entry] of array(risk.conditions, `${path}.risk.conditions`).entries()) {
      const condition = record(entry, `${path}.risk.conditions[${index}]`); const id = stringValue(condition.id, `${path}.risk.conditions[${index}].id`);
      if (ids.has(id)) invalid(`${path}.risk.conditions[${index}].id`, "must be unique"); ids.add(id);
      stringValue(condition.definitionId, `${path}.risk.conditions[${index}].definitionId`); integer(condition.severity, `${path}.risk.conditions[${index}].severity`, 1, 3);
      strings(condition.sourceRefs, `${path}.risk.conditions[${index}].sourceRefs`); integer(condition.createdAge, `${path}.risk.conditions[${index}].createdAge`, 0); integer(condition.createdNodeIndex, `${path}.risk.conditions[${index}].createdNodeIndex`, 0);
      enumValue(condition.visibility, new Set(["explicit", "hinted", "hidden"]), `${path}.risk.conditions[${index}].visibility`); strings(condition.tags, `${path}.risk.conditions[${index}].tags`);
    }
  }
  const actions = record(run.actions, `${path}.actions`);
  for (const key of ["available", "recent"]         ) array(actions[key], `${path}.actions.${key}`).forEach((entry, index) => enumValue(entry, actionTypeSet, `${path}.actions.${key}[${index}]`));
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
    integer(occurrence.lastOccurrenceNodeIndex, `${path}.events.occurrences.${eventId}.lastOccurrenceNodeIndex`, 0, run.nodeIndex          );
  }
  const causes = record(record(run.causes, `${path}.causes`).byId, `${path}.causes.byId`);
  for (const [id, cause] of Object.entries(causes)) { validateCause(cause, `${path}.causes.byId.${id}`); if ((cause                 ).causeId !== id) invalid(`${path}.causes.byId.${id}.causeId`, "must match map key"); }
  const npcState = record(run.npcs, `${path}.npcs`); integer(npcState.nextNpcSequence, `${path}.npcs.nextNpcSequence`, 1);
  const npcs = record(npcState.byId, `${path}.npcs.byId`);
  for (const [id, npc] of Object.entries(npcs)) { validateNpc(npc, `${path}.npcs.byId.${id}`); if ((npc               ).npcId !== id) invalid(`${path}.npcs.byId.${id}.npcId`, "must match map key"); }
  const roleIndex = record(npcState.roleIndex, `${path}.npcs.roleIndex`); for (const [role, rawIds] of Object.entries(roleIndex)) { if (role.length === 0) invalid(`${path}.npcs.roleIndex`, "role must be non-empty"); const ids = strings(rawIds, `${path}.npcs.roleIndex.${role}`); if (new Set(ids).size !== ids.length || ids.some((id) => !(id in npcs) || !(npcs[id]               ).roleTags.includes(role))) invalid(`${path}.npcs.roleIndex.${role}`, "must contain unique matching NPC IDs"); }
  for (const npc of Object.values(npcs)                 ) for (const role of npc.roleTags) if (!(roleIndex[role]                        )?.includes(npc.npcId)) invalid(`${path}.npcs.roleIndex.${role}`, "must index every persistent NPC role");
  if (events.current !== undefined && (events.current                           ).participantBindings !== undefined) for (const [slot, npcId] of Object.entries((events.current                                                   ).participantBindings)) if (!(npcId in npcs)) invalid(`${path}.events.current.participantBindings.${slot}`, "must reference an existing NPC");
  const build = record(run.build, `${path}.build`);
  strings(build.techniques, `${path}.build.techniques`); strings(build.artifacts, `${path}.build.artifacts`); strings(build.consumables, `${path}.build.consumables`);
  integerRecord(build.tagScores, `${path}.build.tagScores`); optionalString(build, "mainPath", `${path}.build`); optionalString(build, "secondaryPath", `${path}.build`);
  if (build.affinities !== undefined) for (const [id, entry] of Object.entries(record(build.affinities, `${path}.build.affinities`))) { const affinity = record(entry, `${path}.build.affinities.${id}`); if (stringValue(affinity.buildId, `${path}.build.affinities.${id}.buildId`) !== id) invalid(`${path}.build.affinities.${id}.buildId`, "must match map key"); integer(affinity.affinityBps, `${path}.build.affinities.${id}.affinityBps`, 0, 10_000); integer(affinity.lifetimeEvidence, `${path}.build.affinities.${id}.lifetimeEvidence`, 0); integer(affinity.lastEvidenceNodeIndex, `${path}.build.affinities.${id}.lastEvidenceNodeIndex`, 0, run.nodeIndex          ); }
  optionalString(build, "dominantBuildId", `${path}.build`); if (build.dominantBuildId !== undefined && !(build.affinities !== undefined && Object.hasOwn(build.affinities          , build.dominantBuildId          ))) invalid(`${path}.build.dominantBuildId`, "must reference an existing affinity");
  if (build.unlockedBuildIds !== undefined) { const ids = strings(build.unlockedBuildIds, `${path}.build.unlockedBuildIds`); if (new Set(ids).size !== ids.length) invalid(`${path}.build.unlockedBuildIds`, "must be unique"); }
  for (const key of ["evidenceFacts", "transitionFacts"]         ) if (build[key] !== undefined) for (const [index, value] of array(build[key], `${path}.build.${key}`).entries()) { const fact = record(value, `${path}.build.${key}[${index}]`); for (const stringKey of ["id", "type", "buildId", "source", "sourceCommandId", "reasonTag"]) stringValue(fact[stringKey], `${path}.build.${key}[${index}].${stringKey}`); integer(fact.age, `${path}.build.${key}[${index}].age`, 0); integer(fact.nodeIndex, `${path}.build.${key}[${index}].nodeIndex`, 0, run.nodeIndex          ); if (key === "evidenceFacts") { integer(fact.amount, `${path}.build.${key}[${index}].amount`, 0); integer(fact.affinityBefore, `${path}.build.${key}[${index}].affinityBefore`, 0, 10_000); integer(fact.affinityAfter, `${path}.build.${key}[${index}].affinityAfter`, 0, 10_000); } else for (const optional of ["fromStage", "toStage", "fromBuildId", "toBuildId"]         ) optionalString(fact, optional, `${path}.build.${key}[${index}]`); }
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
    for (const key of ["sourceCommandId", "sourceEventId", "sourceCauseId", "sourceActorId"]         ) optionalString(death, key, `${path}.deathRecord`);
    record(death.trace, `${path}.deathRecord.trace`);
  }
  if (status === "ended" && run.ending === undefined) invalid(`${path}.ending`, "is required when status is ended");
  validateRng(run.rng, `${path}.rng`, rulesVersion, stringValue(run.rootSeed, `${path}.rootSeed`));
  const director = record(run.director, `${path}.director`); stringValue(director.profileId, `${path}.director.profileId`);
  for (const [index, raw] of array(director.recentScenes, `${path}.director.recentScenes`).entries()) { const scene = record(raw, `${path}.director.recentScenes[${index}]`); stringValue(scene.eventId, `${path}.director.recentScenes[${index}].eventId`); integer(scene.nodeIndex, `${path}.director.recentScenes[${index}].nodeIndex`, 0, run.nodeIndex          ); enumValue(scene.slot, new Set(["P2", "P3", "P4", "P5", "P6", "CONTINUATION"]), `${path}.director.recentScenes[${index}].slot`); integer(scene.salience, `${path}.director.recentScenes[${index}].salience`, 1, 5); for (const key of ["topicTags", "continuityTags", "actorIds", "buildIds"]         ) { const values = strings(scene[key], `${path}.director.recentScenes[${index}].${key}`); if (new Set(values).size !== values.length) invalid(`${path}.director.recentScenes[${index}].${key}`, "must be unique"); } optionalString(scene, "causeId", `${path}.director.recentScenes[${index}]`); if (scene.riskTier !== undefined) enumValue(scene.riskTier, new Set(["low", "caution", "dangerous", "lethal"]), `${path}.director.recentScenes[${index}].riskTier`); }
}

function validateMetaView(value         , path        )                            {
  const view = record(value, path);
  strings(view.unlocks, `${path}.unlocks`); strings(view.entitlements, `${path}.entitlements`); strings(view.discoveries, `${path}.discoveries`);
}

function validateGameState(value         )            {
  const state = record(value, "state");
  integer(state.schemaVersion, "state.schemaVersion", 0); integer(state.stateVersion, "state.stateVersion", 0);
  const rulesVersion = stringValue(state.rulesVersion, "state.rulesVersion");
  stringValue(state.contentVersion, "state.contentVersion");
  validateRun(state.run, "state.run", rulesVersion); validateMetaView(state.metaView, "state.metaView");
  return value             ;
}

function validateMetaState(value         )            {
  const meta = record(value, "meta");
  stringValue(meta.playerId, "meta.playerId"); integer(meta.metaCurrency, "meta.metaCurrency", 0);
  for (const key of ["unlocks", "discoveries", "achievements", "cosmetics", "entitlements"]         ) strings(meta[key], `meta.${key}`);
  record(meta.settings, "meta.settings"); integerRecord(meta.stats, "meta.stats");
  return value             ;
}

function structurallyEqual(left         , right         )          {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((entry, index) => structurallyEqual(entry, right[index]));
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null || Array.isArray(left) || Array.isArray(right)) return false;
  const leftRecord = left                           ; const rightRecord = right                           ;
  const leftKeys = Object.keys(leftRecord); const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && structurallyEqual(leftRecord[key], rightRecord[key]));
}

function validateStateTransition(previousValue         , nextValue         )            {
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

function canonicalValue(value         )          {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const result                          = {};
  for (const key of Object.keys(value                           ).sort()) result[key] = canonicalValue((value                           )[key]);
  return result;
}

function projectRuleState(value         )            {
  const state = validateGameState(value);
  return canonicalValue({
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    stateVersion: state.stateVersion,
    run: state.run
  })             ;
}

const clampConditionStacks = (value        )         => clampInteger(value, 0, 3);
const clampRelationScore = (value        )         => clampInteger(value, -100, 100);
const clampDebt = (value        )         => clampInteger(value, -3, 3);

module.exports = Object.assign({}, {
  RUN_STATUSES,
  ACTION_TYPES,
  CONDITION_KINDS,
  DEATH_CAUSES,
  validateGameState,
  validateMetaState,
  validateStateTransition,
  projectRuleState,
  clampConditionStacks,
  clampRelationScore,
  clampDebt
});
