// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/content/src/registry.ts
// Source sha256:   86204550d636a7bc05272324cdd877de7ee5a6fb6a77a82d3501ff0f41605678
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
var { assertSafeInteger } = require("./core-numeric.js");
var { sha256Utf8 } = require("./core-sha256.js");
var { ACTION_TYPES } = require("./core-state.js");
                                                                     
var { getProgressionPack, validateProgressionPack } = require("./content-progression-v1.js");
                                                       
var { getRiskPack, validateRiskPack } = require("./content-risk-v1.js");
                                                         
var { getBuildPack, validateBuildPack } = require("./content-build-v1.js");
                                                                                            
var { getNpcPack, validateNpcPack } = require("./content-npc-v1.js");
                                                                                                                            
var { getDirectorPack, validateDirectorPack } = require("./content-director-v1.js");

                         
                                                                  
                                                                      
                                                                                                
                           
                                                                                
                                                                                                       
                                                                   
                                                        
                                                                      
                                                                    
                                                                    
                                                                                          
                                      
                          
                                                                                  
                                                                      
                                             
                                                                              
                                                   
                                                                                                          
                                                                                                                                                               
                                                                                                               
                                                                                                          
                                                                                                             
                                                                                            
                                                                                                                                                                            
                                                                                                                             
                                                                                                                                                               
                                                             
                                                                   
                                                                       
                                          
                                               
                                                                                    
                                                         
                                                              
                                                             
                                            
                                                                                        
                                                                                             
                                                                                                                      
                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                     
                                  
                                                                                                                
                                                                                 
                                
                                
                       
                                                                         
                                                                          
    
                                                                                                                         
                                                                                                     
 
                                                                          
                                
                                          
                                                                                               
                                                                              
                                                                                                    
 
                                    
             
                  
                                                     
                   
                         
                                                                                                                                     
                                                                                                                                
                                                                      
                             
 
                                  
                   
                 
                       
                         
                   
 
                                    
                  
                       
                         
                    
                    
                   
                       
 
                                                                                                                                                                                                                                                                                                                                  
                                                                                                               

class ContentValidationError extends TypeError {
           code = "INVALID_CONTENT"         ;
}

                                           
                                                                     
const logicalPaths = new Set(["run.age", "run.maxAge", "realm.order", "realm.cultivation", "attr.insight", "attr.body", "attr.spiritSense", "attr.fortune", "resource.spiritStone", "identity.tags", "world.tags", "world.regionId", "injury.level"]);
const attributes = new Set(["insight", "body", "spiritSense", "fortune"]);
const relationAxes = new Set(["affinity", "trust", "debt"]);
const causeStates = new Set(["dormant", "eligible", "echoed", "resolved", "expired"]);
const eventKinds = new Set(["choice", "narrative", "combat", "breakthrough", "ending", "tutorial"]);
const conditionKinds = new Set(["injury", "pillToxicity", "curse", "blessing", "pursued", "other"]);
const destinyProfiles = new Set(["stable", "high-variance", "story-hook"]);
const destinyTargets = new Set(["insight", "body", "spiritSense", "fortune", "maxAge", "spiritStone"]);
const actionTypes = new Set        (ACTION_TYPES);
const sessionOps = new Set(["setSessionFlag", "adjustSessionCounter", "addSessionTag", "removeSessionTag"]);
const longTermOps = new Set(["ADD_RESOURCE", "REMOVE_RESOURCE", "ADD_ITEM", "REMOVE_ITEM", "ADD_CULTIVATION", "ADD_CONDITION", "REMOVE_CONDITION", "ADD_IDENTITY_TAG", "REMOVE_IDENTITY_TAG", "ADD_WORLD_TAG", "REMOVE_WORLD_TAG", "ADJUST_NPC_RELATION", "ADD_NPC_SIGNIFICANCE", "REVEAL_NPC_FACT", "REVEAL_NPC_TRAIT", "REVEAL_NPC_STATUS", "SET_NPC_STATUS", "ADD_NPC_MILESTONE", "ADD_CAUSE", "RESOLVE_CAUSE", "EXPIRE_CAUSE", "GRANT_COMPONENT", "REMOVE_COMPONENT", "SET_REGION", "OUTCOME_TIME_DELTA", "ADD_BUILD_EVIDENCE"]);
const REPEAT_SENSITIVE_EFFECT_OPS = new Set(["ADD_RESOURCE", "REMOVE_RESOURCE", "ADD_ITEM", "REMOVE_ITEM", "ADD_CULTIVATION", "ADD_CONDITION", "ADJUST_NPC_RELATION", "ADD_NPC_SIGNIFICANCE", "ADD_NPC_MILESTONE", "ADD_CAUSE", "RESOLVE_CAUSE", "EXPIRE_CAUSE", "GRANT_COMPONENT", "REMOVE_COMPONENT", "OUTCOME_TIME_DELTA", "ADD_BUILD_EVIDENCE"]);

function fail(path        , message        )        { throw new ContentValidationError(`${path}: ${message}`); }
function objectValue(value         , path        )              {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
  return value               ;
}
function exact(value             , required                   , optional                    = [], path = "value")       {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required");
}
function stringValue(value         , path        )         {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value;
}
function integer(value         , path        , min         , max         )         {
  if (typeof value !== "number") fail(path, "must be a number");
  try { assertSafeInteger(value, path); } catch { fail(path, "must be a finite safe integer"); }
  if (min !== undefined && value < min) fail(path, `must be >= ${min}`);
  if (max !== undefined && value > max) fail(path, `must be <= ${max}`);
  return value;
}
function array(value         , path        )            { if (!Array.isArray(value)) fail(path, "must be an array"); return value; }
function strings(value         , path        )           { return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`)); }
function oneOf(value         , allowed             , path        )         { const result = stringValue(value, path); if (!allowed.has(result)) fail(path, "has an invalid value"); return result; }
function tuple(value         , minLength        , maxLength        , path        )            {
  const result = array(value, path);
  if (result.length < minLength || result.length > maxLength) fail(path, `must contain ${minLength}${minLength === maxLength ? "" : `..${maxLength}`} values`);
  return result;
}
function unique(values          , path        )       {
  const seen = new Set        ();
  for (const value of values) { if (seen.has(value)) fail(path, `contains duplicate id ${value}`); seen.add(value); }
}
function jsonValue(value         , path        )       {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { integer(value, path); return; }
  if (Array.isArray(value)) { value.forEach((entry, index) => jsonValue(entry, `${path}[${index}]`)); return; }
  for (const [key, entry] of Object.entries(objectValue(value, path))) jsonValue(entry, `${path}.${key}`);
}

function validateCondition(value         , path        , depth = 0)       {
  if (depth > 32) fail(path, "nesting exceeds 32 levels");
  const condition = objectValue(value, path);
  const keys = Object.keys(condition);
  if (keys.length !== 1) fail(path, "must contain exactly one operator");
  const op = keys[0]; const operand = condition[op];
  switch (op) {
    case "all": case "any": array(operand, `${path}.${op}`).forEach((entry, index) => validateCondition(entry, `${path}.${op}[${index}]`, depth + 1)); break;
    case "not": validateCondition(operand, `${path}.not`, depth + 1); break;
    case "eq": case "ne": {
      const pair = tuple(operand, 2, 2, `${path}.${op}`); oneOf(pair[0], logicalPaths, `${path}.${op}[0]`);
      if (!["string", "number", "boolean"].includes(typeof pair[1])) fail(`${path}.${op}[1]`, "must be scalar");
      if (typeof pair[1] === "number") integer(pair[1], `${path}.${op}[1]`);
      break;
    }
    case "gte": case "lte": { const pair = tuple(operand, 2, 2, `${path}.${op}`); oneOf(pair[0], logicalPaths, `${path}.${op}[0]`); integer(pair[1], `${path}.${op}[1]`); break; }
    case "hasTag": { const pair = tuple(operand, 2, 2, `${path}.hasTag`); oneOf(pair[0], new Set(["identity.tags", "world.tags"]), `${path}.hasTag[0]`); stringValue(pair[1], `${path}.hasTag[1]`); break; }
    case "hasItem": { const pair = tuple(operand, 1, 2, `${path}.hasItem`); stringValue(pair[0], `${path}.hasItem[0]`); if (pair.length === 2) integer(pair[1], `${path}.hasItem[1]`, 1); break; }
    case "buildTagGte": { const pair = tuple(operand, 2, 2, `${path}.buildTagGte`); stringValue(pair[0], `${path}.buildTagGte[0]`); integer(pair[1], `${path}.buildTagGte[1]`); break; }
    case "relationGte": case "relationLte": { const values = tuple(operand, 3, 3, `${path}.${op}`); stringValue(values[0], `${path}.${op}[0]`); oneOf(values[1], relationAxes, `${path}.${op}[1]`); integer(values[2], `${path}.${op}[2]`); break; }
    case "causeStateIs": { const pair = tuple(operand, 2, 2, `${path}.causeStateIs`); stringValue(pair[0], `${path}.causeStateIs[0]`); oneOf(pair[1], causeStates, `${path}.causeStateIs[1]`); break; }
    case "npcStatusIs": { const pair = tuple(operand, 2, 2, `${path}.npcStatusIs`); stringValue(pair[0], `${path}.npcStatusIs[0]`); stringValue(pair[1], `${path}.npcStatusIs[1]`); break; }
    default: fail(path, `unknown condition operator ${op}`);
  }
}

function requireReference(id         , set             , path        )         {
  const result = stringValue(id, path);
  if (!set.has(result)) fail(path, `unknown reference ${result}`);
  return result;
}

function validateNpcTarget(effect             , path        )                    { const hasId = effect.npcId !== undefined; const hasBinding = effect.actorBindingKey !== undefined; if (hasId === hasBinding) fail(path, "requires exactly one of npcId or actorBindingKey"); const key = hasId ? "npcId" : "actorBindingKey"; stringValue(effect[key], `${path}.${key}`); return [key]; }
function validateNpcReason(effect             , npcPack                     , path        )       { if (npcPack === undefined) fail(path, "requires a locked NPC pack"); const reason = stringValue(effect.reasonTag, `${path}.reasonTag`); if (!npcPack.reasonTags.includes(reason)) fail(`${path}.reasonTag`, `unknown NPC reason tag ${reason}`); }

function validateEffect(value         , refs               , buildPack                       , npcPack                     , path        )         {
  const source = objectValue(value, path); const repeatBehavior = source.repeatBehavior;
  if (repeatBehavior !== undefined && repeatBehavior !== "allow-cumulative") fail(`${path}.repeatBehavior`, "must be allow-cumulative");
  const effect = { ...source }; delete effect.repeatBehavior; const op = stringValue(effect.op, `${path}.op`);
  switch (op) {
    case "ADD_RESOURCE": case "REMOVE_RESOURCE": exact(effect, ["op", "key", "amount"], [], path); if (effect.key !== "spiritStone") fail(`${path}.key`, "must be spiritStone"); integer(effect.amount, `${path}.amount`, 0); break;
    case "ADD_ITEM": case "REMOVE_ITEM": exact(effect, ["op", "itemId", "amount"], [], path); requireReference(effect.itemId, refs.items, `${path}.itemId`); integer(effect.amount, `${path}.amount`, 1); break;
    case "ADD_CULTIVATION": exact(effect, ["op", "amount"], [], path); integer(effect.amount, `${path}.amount`); break;
    case "ADD_CONDITION": exact(effect, ["op", "conditionId", "kind", "stacks"], [], path); requireReference(effect.conditionId, refs.conditions, `${path}.conditionId`); oneOf(effect.kind, conditionKinds, `${path}.kind`); integer(effect.stacks, `${path}.stacks`, 0, 3); break;
    case "REMOVE_CONDITION": exact(effect, ["op", "conditionId"], [], path); requireReference(effect.conditionId, refs.conditions, `${path}.conditionId`); break;
    case "ADD_IDENTITY_TAG": case "REMOVE_IDENTITY_TAG": case "ADD_WORLD_TAG": case "REMOVE_WORLD_TAG": exact(effect, ["op", "tag"], [], path); stringValue(effect.tag, `${path}.tag`); break;
    case "ADJUST_NPC_RELATION": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "reasonTag"], ["affinityDelta", "trustDelta", "debtDelta"], path); validateNpcReason(effect, npcPack, path); if (effect.affinityDelta === undefined && effect.trustDelta === undefined && effect.debtDelta === undefined) fail(path, "requires at least one relation delta"); for (const key of ["affinityDelta", "trustDelta", "debtDelta"]         ) if (effect[key] !== undefined) integer(effect[key], `${path}.${key}`); break; }
    case "ADD_NPC_SIGNIFICANCE": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "amount", "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); integer(effect.amount, `${path}.amount`, npcPack .rules.significance.authoringMin, npcPack .rules.significance.authoringMax); break; }
    case "REVEAL_NPC_FACT": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "factId", "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); const factId = stringValue(effect.factId, `${path}.factId`); if (!npcPack .facts.some((entry) => entry.id === factId)) fail(`${path}.factId`, `unknown NPC fact ${factId}`); break; }
    case "REVEAL_NPC_TRAIT": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "traitTag", "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); const traitTag = stringValue(effect.traitTag, `${path}.traitTag`); if (!npcPack .traits.some((entry) => entry.id === traitTag)) fail(`${path}.traitTag`, `unknown NPC trait ${traitTag}`); break; }
    case "REVEAL_NPC_STATUS": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); break; }
    case "SET_NPC_STATUS": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "targetStatus", "revealToPlayer", "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); oneOf(effect.targetStatus, new Set(["active", "missing", "dead", "departed"]), `${path}.targetStatus`); if (typeof effect.revealToPlayer !== "boolean") fail(`${path}.revealToPlayer`, "must be boolean"); break; }
    case "ADD_NPC_MILESTONE": { const target = validateNpcTarget(effect, path); exact(effect, ["op", ...target, "type", "sourceRef", "reasonTag"], [], path); validateNpcReason(effect, npcPack, path); const type = stringValue(effect.type, `${path}.type`); if (!npcPack .rules.milestoneTypes.includes(type)) fail(`${path}.type`, `unknown milestone type ${type}`); stringValue(effect.sourceRef, `${path}.sourceRef`); break; }
    case "ADD_CAUSE": exact(effect, ["op", "templateId", "salience"], ["visibility", "actorBindingKeys"], path); requireReference(effect.templateId, refs.causes, `${path}.templateId`); integer(effect.salience, `${path}.salience`, 1, 5); if (effect.visibility !== undefined) oneOf(effect.visibility, new Set(["hidden", "hint", "journal"]), `${path}.visibility`); if (effect.actorBindingKeys !== undefined) for (const [role, slot] of Object.entries(objectValue(effect.actorBindingKeys, `${path}.actorBindingKeys`))) { stringValue(role, `${path}.actorBindingKeys role`); stringValue(slot, `${path}.actorBindingKeys.${role}`); } break;
    case "RESOLVE_CAUSE": case "EXPIRE_CAUSE": { const hasCauseId = effect.causeId !== undefined; const hasTriggering = effect.triggeringCause !== undefined; if (hasCauseId === hasTriggering) fail(path, "requires exactly one of causeId or triggeringCause"); if (hasCauseId) { exact(effect, ["op", "causeId"], [], path); stringValue(effect.causeId, `${path}.causeId`); } else { exact(effect, ["op", "triggeringCause"], [], path); if (effect.triggeringCause !== true) fail(`${path}.triggeringCause`, "must be true"); } break; }
    case "GRANT_COMPONENT": case "REMOVE_COMPONENT": exact(effect, ["op", "componentId"], [], path); requireReference(effect.componentId, refs.components, `${path}.componentId`); break;
    case "SET_REGION": exact(effect, ["op", "regionId"], [], path); requireReference(effect.regionId, refs.regions, `${path}.regionId`); break;
    case "OUTCOME_TIME_DELTA": exact(effect, ["op", "years"], [], path); integer(effect.years, `${path}.years`, 0); break;
    case "ADD_BUILD_EVIDENCE": exact(effect, ["op", "buildId", "amount", "reasonTag"], [], path); if (buildPack === undefined || !buildPack.definitions.some((definition) => definition.id === effect.buildId)) fail(`${path}.buildId`, "unknown BuildDefinition"); integer(effect.amount, `${path}.amount`, buildPack.rules.evidence.min, buildPack.rules.evidence.max); stringValue(effect.reasonTag, `${path}.reasonTag`); break;
    case "setSessionFlag": exact(effect, ["op", "key", "value"], [], path); stringValue(effect.key, `${path}.key`); if (typeof effect.value !== "boolean") fail(`${path}.value`, "must be a boolean"); break;
    case "adjustSessionCounter": exact(effect, ["op", "key", "delta"], [], path); stringValue(effect.key, `${path}.key`); integer(effect.delta, `${path}.delta`); break;
    case "addSessionTag": case "removeSessionTag": exact(effect, ["op", "tag"], [], path); stringValue(effect.tag, `${path}.tag`); break;
    default: fail(`${path}.op`, `unknown effect ${op}`);
  }
  if (repeatBehavior !== undefined && !REPEAT_SENSITIVE_EFFECT_OPS.has(op)) fail(`${path}.repeatBehavior`, "is allowed only for repeat-sensitive effects");
  return op;
}

function validateTransition(value         , eventIds             , path        )       {
  const transition = objectValue(value, path); exact(transition, ["eventId"], ["when", "priority"], path);
  requireReference(transition.eventId, eventIds, `${path}.eventId`);
  if (transition.when !== undefined) validateCondition(transition.when, `${path}.when`);
  if (transition.priority !== undefined) integer(transition.priority, `${path}.priority`);
}

function validateOutcome(value         , refs               , eventIds             , buildPack                       , npcPack                     , path        )              {
  const outcome = objectValue(value, path); exact(outcome, ["effects"], ["next", "fallbackKey"], path);
  const ops = new Set(array(outcome.effects, `${path}.effects`).map((effect, index) => validateEffect(effect, refs, buildPack, npcPack, `${path}.effects[${index}]`)));
  if (outcome.next !== undefined) array(outcome.next, `${path}.next`).forEach((entry, index) => validateTransition(entry, eventIds, `${path}.next[${index}]`));
  if (outcome.fallbackKey !== undefined) stringValue(outcome.fallbackKey, `${path}.fallbackKey`);
  return ops;
}

function validateChoice(value         , refs               , eventIds             , threatIds             , buildPack                       , npcPack                     , currentEventId        , path        )         {
  const choice = objectValue(value, path); exact(choice, ["id", "scope", "labelKey", "outcomes"], ["rhythmOnly", "requirements", "check", "threatId", "riskRepeatBehavior", "next"], path);
  const id = stringValue(choice.id, `${path}.id`); const scope = oneOf(choice.scope, new Set(["core", "tactical"]), `${path}.scope`);
  if (choice.rhythmOnly !== undefined && typeof choice.rhythmOnly !== "boolean") fail(`${path}.rhythmOnly`, "must be a boolean");
  const rhythmOnly = choice.rhythmOnly === true;
  if (scope === "tactical" && rhythmOnly) fail(`${path}.rhythmOnly`, "is allowed only for core choices");
  stringValue(choice.labelKey, `${path}.labelKey`); if (choice.requirements !== undefined) validateCondition(choice.requirements, `${path}.requirements`);
  if (choice.threatId !== undefined) requireReference(choice.threatId, threatIds, `${path}.threatId`);
  if (choice.riskRepeatBehavior !== undefined && choice.riskRepeatBehavior !== "allow-repeat-resolution") fail(`${path}.riskRepeatBehavior`, "must be allow-repeat-resolution");
  if (choice.riskRepeatBehavior !== undefined && choice.threatId === undefined) fail(`${path}.riskRepeatBehavior`, "requires threatId");
  if (choice.threatId !== undefined && choice.check !== undefined) fail(path, "risk choice uses its ThreatDefinition CheckSpec and cannot declare a second check");
  if (choice.check !== undefined) {
    const check = objectValue(choice.check, `${path}.check`); exact(check, ["primary", "difficulty", "randomMin", "randomMax"], ["secondary", "secondaryWeightBps"], `${path}.check`);
    oneOf(check.primary, attributes, `${path}.check.primary`); if (check.secondary !== undefined) oneOf(check.secondary, attributes, `${path}.check.secondary`);
    integer(check.difficulty, `${path}.check.difficulty`, 0, 1000);
    if (check.secondaryWeightBps !== undefined) integer(check.secondaryWeightBps, `${path}.check.secondaryWeightBps`, 0, 10_000);
    if (check.randomMin !== -10 || check.randomMax !== 10) fail(`${path}.check`, "random range must be -10..10");
  }
  const outcomes = objectValue(choice.outcomes, `${path}.outcomes`); exact(outcomes, ["success"], ["greatSuccess", "costlySuccess", "failure"], `${path}.outcomes`);
  const ops = new Set        ();
  for (const key of ["greatSuccess", "success", "costlySuccess", "failure"]         ) if (outcomes[key] !== undefined) for (const op of validateOutcome(outcomes[key], refs, eventIds, buildPack, npcPack, `${path}.outcomes.${key}`)) ops.add(op);
  if (scope === "core" && !rhythmOnly && choice.threatId === undefined && ![...ops].some((op) => longTermOps.has(op))) fail(path, "core choice must change a long-term dimension");
  const choiceNext = choice.next === undefined ? [] : array(choice.next, `${path}.next`);
  choiceNext.forEach((entry, index) => validateTransition(entry, eventIds, `${path}.next[${index}]`));
  const hasDifferentNext = choiceNext.some((entry) => objectValue(entry, `${path}.next`).eventId !== currentEventId);
  if (scope === "core") {
    if ([...ops].some((op) => sessionOps.has(op))) fail(path, "core choice cannot use tactical session-local effects");
    if (rhythmOnly && !hasDifferentNext) fail(path, "rhythm-only core choice requires a next transition to a different event");
  } else {
    if ([...ops].some((op) => !sessionOps.has(op))) fail(path, "tactical choice can use only session-local effects");
    const meaningful = [...ops].some((op) => sessionOps.has(op)) || choice.check !== undefined || choice.threatId !== undefined || hasDifferentNext;
    if (!meaningful) fail(path, "tactical choice must be meaningful");
  }
  return id;
}

function validateRepeatSafety(event             , path        )       {
  if (event.cooldown === undefined) return;
  const cooldown = objectValue(event.cooldown, `${path}.cooldown`);
  if (cooldown.maxOccurrences === 1) return;
  const requireEffects = (effectsValue         , effectsPath        )       => {
    for (const [index, raw] of array(effectsValue, effectsPath).entries()) {
      const effect = objectValue(raw, `${effectsPath}[${index}]`); const op = stringValue(effect.op, `${effectsPath}[${index}].op`);
      if (REPEAT_SENSITIVE_EFFECT_OPS.has(op) && effect.repeatBehavior !== "allow-cumulative") fail(`${effectsPath}[${index}].repeatBehavior`, "repeatable Event requires an explicit allow-cumulative declaration");
    }
  };
  if (event.onEnter !== undefined) requireEffects(event.onEnter, `${path}.onEnter`);
  for (const [choiceIndex, rawChoice] of array(event.choices ?? [], `${path}.choices`).entries()) {
    const choice = objectValue(rawChoice, `${path}.choices[${choiceIndex}]`);
    if (choice.threatId !== undefined && choice.riskRepeatBehavior !== "allow-repeat-resolution") fail(`${path}.choices[${choiceIndex}].riskRepeatBehavior`, "repeatable risk Choice requires an explicit allow-repeat-resolution declaration");
    const outcomes = objectValue(choice.outcomes, `${path}.choices[${choiceIndex}].outcomes`);
    for (const tier of ["greatSuccess", "success", "costlySuccess", "failure"]) if (outcomes[tier] !== undefined) requireEffects(objectValue(outcomes[tier], `${path}.choices[${choiceIndex}].outcomes.${tier}`).effects, `${path}.choices[${choiceIndex}].outcomes.${tier}.effects`);
  }
}

function referenceSets(value         )                {
  const refs = objectValue(value, "pack.references");
  const keys                                 = ["items", "components", "npcTemplates", "regions", "endings", "causes", "conditions"];
  exact(refs, keys, [], "pack.references");
  const result = {}                 ;
  for (const key of keys) { const values = strings(refs[key], `pack.references.${key}`); unique(values, `pack.references.${key}`); result[key] = new Set(values); }
  return result;
}

function validateDirectorHints(value         , directorPack                          , directorTags             , path        )       { if (directorPack === undefined) fail(path, "requires a locked Director pack"); const hints = objectValue(value, path); exact(hints, ["salience", "topicTags", "continuityTags", "buildAffinityTags", "npcRoleAffinityTags", "worldAffinityTags"], ["baseWeight", "onboardingEligible"], path); integer(hints.salience, `${path}.salience`, 1, 5); if (hints.baseWeight !== undefined) integer(hints.baseWeight, `${path}.baseWeight`, directorPack.rules.baseWeightMin, directorPack.rules.baseWeightMax); for (const key of ["topicTags", "continuityTags", "buildAffinityTags", "npcRoleAffinityTags", "worldAffinityTags"]         ) { const values = strings(hints[key], `${path}.${key}`); unique(values, `${path}.${key}`); values.forEach((tag, index) => { if (!directorTags.has(tag)) fail(`${path}.${key}[${index}]`, `unknown Director tag ${tag}`); }); } if (hints.onboardingEligible !== undefined && typeof hints.onboardingEligible !== "boolean") fail(`${path}.onboardingEligible`, "must be boolean"); }

function validateEvent(value         , refs               , eventIds             , threatIds             , buildPack                       , npcPack                     , directorPack                          , directorTags             , path        )       {
  const event = objectValue(value, path);
  exact(event, ["id", "version", "kind", "titleKey", "tags", "weight", "fallback"], ["requirements", "actionAffinity", "directorHints", "participants", "cooldown", "choices", "onEnter", "ai", "telemetry"], path);
  stringValue(event.id, `${path}.id`); integer(event.version, `${path}.version`, 1); oneOf(event.kind, eventKinds, `${path}.kind`); stringValue(event.titleKey, `${path}.titleKey`);
  const tags = strings(event.tags, `${path}.tags`); unique(tags, `${path}.tags`); integer(event.weight, `${path}.weight`, 0);
  if (event.actionAffinity !== undefined) { const affinities = strings(event.actionAffinity, `${path}.actionAffinity`); unique(affinities, `${path}.actionAffinity`); affinities.forEach((action, index) => oneOf(action, actionTypes, `${path}.actionAffinity[${index}]`)); }
  if (event.directorHints !== undefined) validateDirectorHints(event.directorHints, directorPack, directorTags, `${path}.directorHints`);
  if (event.participants !== undefined) {
    if (npcPack === undefined) fail(`${path}.participants`, "requires a locked NPC pack");
    const coreIds = new Set(npcPack .coreDefinitions.map((entry) => entry.id)); const archetypeIds = new Set(npcPack .archetypes.map((entry) => entry.id));
    const slots = array(event.participants, `${path}.participants`).map((entry, index) => {
      const participant = objectValue(entry, `${path}.participants[${index}]`); exact(participant, ["slot", "source"], [], `${path}.participants[${index}]`);
      const slot = stringValue(participant.slot, `${path}.participants[${index}].slot`); if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slot)) fail(`${path}.participants[${index}].slot`, "must be a safe event-local slot");
      const source = objectValue(participant.source, `${path}.participants[${index}].source`); const kind = oneOf(source.kind, new Set(["core", "generated"]), `${path}.participants[${index}].source.kind`);
      if (kind === "core") { exact(source, ["kind", "npcDefinitionId"], [], `${path}.participants[${index}].source`); requireReference(source.npcDefinitionId, coreIds, `${path}.participants[${index}].source.npcDefinitionId`); }
      else { exact(source, ["kind", "archetypeId"], [], `${path}.participants[${index}].source`); requireReference(source.archetypeId, archetypeIds, `${path}.participants[${index}].source.archetypeId`); }
      return slot;
    });
    unique(slots, `${path}.participants`);
  }
  if (event.requirements !== undefined) validateCondition(event.requirements, `${path}.requirements`);
  if (event.cooldown !== undefined) { const cooldown = objectValue(event.cooldown, `${path}.cooldown`); exact(cooldown, [], ["minNodesBetween", "maxOccurrences"], `${path}.cooldown`); if (cooldown.minNodesBetween !== undefined) integer(cooldown.minNodesBetween, `${path}.cooldown.minNodesBetween`, 0); if (cooldown.maxOccurrences !== undefined) integer(cooldown.maxOccurrences, `${path}.cooldown.maxOccurrences`, 1); }
  if (event.choices !== undefined) { const ids = array(event.choices, `${path}.choices`).map((choice, index) => validateChoice(choice, refs, eventIds, threatIds, buildPack, npcPack, event.id          , `${path}.choices[${index}]`)); unique(ids, `${path}.choices`); }
  if (event.onEnter !== undefined) array(event.onEnter, `${path}.onEnter`).forEach((effect, index) => validateEffect(effect, refs, buildPack, npcPack, `${path}.onEnter[${index}]`));
  validateRepeatSafety(event, path);
  if (event.ai !== undefined) jsonValue(event.ai, `${path}.ai`);
  const fallback = objectValue(event.fallback, `${path}.fallback`); exact(fallback, ["bodyKey"], ["titleKey"], `${path}.fallback`); stringValue(fallback.bodyKey, `${path}.fallback.bodyKey`); if (fallback.titleKey !== undefined) stringValue(fallback.titleKey, `${path}.fallback.titleKey`);
  if (event.telemetry !== undefined) for (const [key, entry] of Object.entries(objectValue(event.telemetry, `${path}.telemetry`))) stringValue(entry, `${path}.telemetry.${key}`);
}

function validateCauseTemplate(value         , refs               , eventIds             , path        )       {
  const template = objectValue(value, path); exact(template, ["id", "salience", "maturity", "actors", "themes", "linkedEventIds", "onActorUnavailable"], [], path);
  requireReference(template.id, refs.causes, `${path}.id`); integer(template.salience, `${path}.salience`, 1, 5);
  const maturity = objectValue(template.maturity, `${path}.maturity`); exact(maturity, [], ["minAgeDeltaYears", "minNodeDelta", "conditions"], `${path}.maturity`);
  if (maturity.minAgeDeltaYears !== undefined) integer(maturity.minAgeDeltaYears, `${path}.maturity.minAgeDeltaYears`, 0);
  if (maturity.minNodeDelta !== undefined) integer(maturity.minNodeDelta, `${path}.maturity.minNodeDelta`, 0);
  if (maturity.conditions !== undefined) array(maturity.conditions, `${path}.maturity.conditions`).forEach((condition, index) => validateCondition(condition, `${path}.maturity.conditions[${index}]`));
  const roles = array(template.actors, `${path}.actors`).map((entry, index) => { const actor = objectValue(entry, `${path}.actors[${index}]`); exact(actor, ["role", "required"], [], `${path}.actors[${index}]`); const role = stringValue(actor.role, `${path}.actors[${index}].role`); if (typeof actor.required !== "boolean") fail(`${path}.actors[${index}].required`, "must be a boolean"); return role; }); unique(roles, `${path}.actors`);
  const themes = strings(template.themes, `${path}.themes`); unique(themes, `${path}.themes`);
  const linked = strings(template.linkedEventIds, `${path}.linkedEventIds`); unique(linked, `${path}.linkedEventIds`); linked.forEach((id, index) => requireReference(id, eventIds, `${path}.linkedEventIds[${index}]`));
  const unavailable = objectValue(template.onActorUnavailable, `${path}.onActorUnavailable`); const action = oneOf(unavailable.action, new Set(["expire", "transform"]), `${path}.onActorUnavailable.action`);
  exact(unavailable, ["action"], action === "transform" ? ["targetCauseTemplateId"] : [], `${path}.onActorUnavailable`);
  if (action === "transform") requireReference(unavailable.targetCauseTemplateId, refs.causes, `${path}.onActorUnavailable.targetCauseTemplateId`);
}

function effectLists(event                 )                 {
  const lists                 = event.onEnter === undefined ? [] : [event.onEnter];
  for (const choice of event.choices ?? []) for (const tier of [choice.outcomes.greatSuccess, choice.outcomes.success, choice.outcomes.costlySuccess, choice.outcomes.failure]) if (tier !== undefined) lists.push(tier.effects);
  return lists;
}

function validateCauseBindings(events                   , templates                            )       {
  for (const event of events) for (const effects of effectLists(event)) for (const effect of effects) if (effect.op === "ADD_CAUSE") {
    const template = templates.get(effect.templateId); if (template === undefined) fail("effect.templateId", `unknown CauseTemplate ${effect.templateId}`);
    if (effect.salience !== template.salience) fail("effect.salience", "must match CauseTemplate salience");
    const roles = new Set(template.actors.map((actor) => actor.role));
    for (const role of Object.keys(effect.actorBindingKeys ?? {})) if (!roles.has(role)) fail(`effect.actorBindingKeys.${role}`, "unknown CauseTemplate role");
    for (const actor of template.actors) if (actor.required && (effect.actorBindingKeys?.[actor.role] === undefined || effect.actorBindingKeys[actor.role].length === 0)) fail(`effect.actorBindingKeys.${actor.role}`, "required actor binding is missing");
  }
}

// A triggeringCause:true reference is legal only where an authoritative triggering Cause can exist: the Event must
// be a Cause-linked event, i.e. some CauseTemplate.linkedEventIds must contain it. That is the whole content-level
// requirement, and it is deliberately stated in terms of Cause echo semantics rather than any particular actor role.
// Cause actor roles are content meaning (rescuedNpc, master, debtor, enemy, witness, ...) and are never renamed or
// reserved for this mechanism. Safety comes from the runtime reading the persisted events.current.triggeringCauseId,
// never from a role name: an unbound scene fails closed at resolution regardless of how the Cause was authored.
function validateTriggeringCauseReferences(events                   , templates                            )       {
  const linked = new Set        ();
  for (const template of templates.values()) for (const eventId of template.linkedEventIds) linked.add(eventId);
  for (const event of events) for (const effects of effectLists(event)) for (const effect of effects) {
    if ((effect.op !== "RESOLVE_CAUSE" && effect.op !== "EXPIRE_CAUSE") || !("triggeringCause" in effect)) continue;
    if (!linked.has(event.id)) fail(`pack.events.${event.id}`, "triggeringCause reference requires this Event to be linked from a CauseTemplate");
  }
}

function validateDestiny(value         , refs               , path        )       {
  const destiny = objectValue(value, path);
  exact(destiny, ["id", "version", "profile", "titleKey", "descriptionKey", "advantage", "cost", "hook"], ["requiredUnlocks"], path);
  stringValue(destiny.id, `${path}.id`); integer(destiny.version, `${path}.version`, 1); oneOf(destiny.profile, destinyProfiles, `${path}.profile`);
  stringValue(destiny.titleKey, `${path}.titleKey`); stringValue(destiny.descriptionKey, `${path}.descriptionKey`);
  for (const key of ["advantage", "cost"]         ) {
    const modifier = objectValue(destiny[key], `${path}.${key}`); exact(modifier, ["target", "amount", "labelKey"], [], `${path}.${key}`);
    oneOf(modifier.target, destinyTargets, `${path}.${key}.target`); integer(modifier.amount, `${path}.${key}.amount`, 1); stringValue(modifier.labelKey, `${path}.${key}.labelKey`);
  }
  const hook = objectValue(destiny.hook, `${path}.hook`); exact(hook, ["kind", "refId", "labelKey"], [], `${path}.hook`);
  const kind = oneOf(hook.kind, new Set(["world", "person"]), `${path}.hook.kind`);
  requireReference(hook.refId, kind === "world" ? refs.regions : refs.npcTemplates, `${path}.hook.refId`); stringValue(hook.labelKey, `${path}.hook.labelKey`);
  if (destiny.requiredUnlocks !== undefined) { const unlocks = strings(destiny.requiredUnlocks, `${path}.requiredUnlocks`); unique(unlocks, `${path}.requiredUnlocks`); }
}

function normalizedDraft(pack                                )          {
  const manifest = { schemaVersion: pack.manifest.schemaVersion, packId: pack.manifest.packId, rulesVersion: pack.manifest.rulesVersion, contentVersion: pack.manifest.contentVersion };
  const references = Object.fromEntries(Object.entries(pack.references).sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [key, [...values].sort()]));
  const destinies = [...pack.destinies].sort((left, right) => left.id.localeCompare(right.id));
  const events = [...pack.events].sort((left, right) => left.id.localeCompare(right.id));
  const causeTemplates = [...pack.causeTemplates].sort((left, right) => left.id.localeCompare(right.id));
  return { manifest, references, destinies, events, causeTemplates, ...(pack.progressionPackId === undefined ? {} : { progressionPackId: pack.progressionPackId }), ...(pack.riskPackId === undefined ? {} : { riskPackId: pack.riskPackId }), ...(pack.buildPackId === undefined ? {} : { buildPackId: pack.buildPackId }), ...(pack.npcPackId === undefined ? {} : { npcPackId: pack.npcPackId }), ...(pack.directorPackId === undefined ? {} : { directorPackId: pack.directorPackId }), ...(pack.directorTags === undefined ? {} : { directorTags: [...pack.directorTags].sort() }) };
}
function canonicalValue(value         )          {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const source = value               ; const result              = {};
  for (const key of Object.keys(source).sort()) result[key] = canonicalValue(source[key]);
  return result;
}
function hex(bytes            )         { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function canonicalPackJson(pack                                )         { return JSON.stringify(canonicalValue(normalizedDraft(pack))); }
function computePackChecksum(pack                                )         { return hex(sha256Utf8(canonicalPackJson(pack))); }
function sealContentPack(pack                  )              {
  return { ...pack, manifest: { ...pack.manifest, checksum: computePackChecksum(pack) } };
}

function validateContentPack(value         , expectedContentVersion         , dependencies                                                                                                                                                                         )              {
  const pack = objectValue(value, "pack"); exact(pack, ["manifest", "references", "destinies", "events", "causeTemplates"], ["progressionPackId", "riskPackId", "buildPackId", "npcPackId", "directorPackId", "directorTags"], "pack");
  const manifest = objectValue(pack.manifest, "pack.manifest"); exact(manifest, ["schemaVersion", "packId", "rulesVersion", "contentVersion", "checksum"], [], "pack.manifest");
  if (manifest.schemaVersion !== 2) fail("pack.manifest.schemaVersion", "must be 2");
  stringValue(manifest.packId, "pack.manifest.packId"); stringValue(manifest.rulesVersion, "pack.manifest.rulesVersion");
  const contentVersion = stringValue(manifest.contentVersion, "pack.manifest.contentVersion");
  if (expectedContentVersion !== undefined && contentVersion !== expectedContentVersion) fail("pack.manifest.contentVersion", "does not match the locked contentVersion");
  const checksum = stringValue(manifest.checksum, "pack.manifest.checksum"); if (!/^[0-9a-f]{64}$/.test(checksum)) fail("pack.manifest.checksum", "must be lowercase SHA-256");
  if (pack.progressionPackId !== undefined) { const progression = validateProgressionPack(getProgressionPack(stringValue(pack.progressionPackId, "pack.progressionPackId"))); if (progression.rulesVersion !== manifest.rulesVersion) fail("pack.progressionPackId", "rulesVersion mismatch"); }
  const riskPack = pack.riskPackId === undefined ? undefined : validateRiskPack(getRiskPack(stringValue(pack.riskPackId, "pack.riskPackId"))); if (riskPack !== undefined && riskPack.rulesVersion !== manifest.rulesVersion) fail("pack.riskPackId", "rulesVersion mismatch");
  const threatIds = new Set(riskPack?.threats.map((threat) => threat.id) ?? []);
  const buildPackId = pack.buildPackId === undefined ? undefined : stringValue(pack.buildPackId, "pack.buildPackId"); const buildPack = buildPackId === undefined ? undefined : validateBuildPack(dependencies?.getBuildPack?.(buildPackId) ?? getBuildPack(buildPackId)); if (buildPack !== undefined && buildPack.rulesVersion !== manifest.rulesVersion) fail("pack.buildPackId", "rulesVersion mismatch");
  const npcPackId = pack.npcPackId === undefined ? undefined : stringValue(pack.npcPackId, "pack.npcPackId"); const npcPack = npcPackId === undefined ? undefined : validateNpcPack(dependencies?.getNpcPack?.(npcPackId) ?? getNpcPack(npcPackId)); if (npcPack !== undefined && npcPack.rulesVersion !== manifest.rulesVersion) fail("pack.npcPackId", "rulesVersion mismatch");
  const directorPackId = pack.directorPackId === undefined ? undefined : stringValue(pack.directorPackId, "pack.directorPackId"); const directorPack = directorPackId === undefined ? undefined : validateDirectorPack(dependencies?.getDirectorPack?.(directorPackId) ?? getDirectorPack(directorPackId)); if (directorPack !== undefined && directorPack.rulesVersion !== manifest.rulesVersion) fail("pack.directorPackId", "rulesVersion mismatch"); const directorTagValues = pack.directorTags === undefined ? [] : strings(pack.directorTags, "pack.directorTags"); unique(directorTagValues, "pack.directorTags"); const directorTags = new Set(directorTagValues);
  const refs = referenceSets(pack.references);
  if (npcPack !== undefined) for (const id of refs.npcTemplates) if (!npcPack.coreDefinitions.some((definition) => definition.id === id)) fail("pack.references.npcTemplates", `unknown NpcDefinition ${id}`);
  const destinies = array(pack.destinies, "pack.destinies"); const destinyIds = destinies.map((destiny, index) => stringValue(objectValue(destiny, `pack.destinies[${index}]`).id, `pack.destinies[${index}].id`)); unique(destinyIds, "pack.destinies");
  destinies.forEach((destiny, index) => validateDestiny(destiny, refs, `pack.destinies[${index}]`));
  const events = array(pack.events, "pack.events"); const eventIds = events.map((event, index) => stringValue(objectValue(event, `pack.events[${index}]`).id, `pack.events[${index}].id`)); unique(eventIds, "pack.events");
  const eventIdSet = new Set(eventIds); events.forEach((event, index) => validateEvent(event, refs, eventIdSet, threatIds, buildPack, npcPack, directorPack, directorTags, `pack.events[${index}]`));
  const templates = array(pack.causeTemplates, "pack.causeTemplates"); const templateIds = templates.map((template, index) => stringValue(objectValue(template, `pack.causeTemplates[${index}]`).id, `pack.causeTemplates[${index}].id`)); unique(templateIds, "pack.causeTemplates");
  if (templateIds.length !== refs.causes.size || templateIds.some((id) => !refs.causes.has(id))) fail("pack.causeTemplates", "must define every Cause reference exactly once");
  templates.forEach((template, index) => validateCauseTemplate(template, refs, eventIdSet, `pack.causeTemplates[${index}]`));
  const templateMap = new Map((templates                   ).map((template) => [template.id, template]));
  const causeLinkedEventIds = new Set([...templateMap.values()].flatMap((template) => template.linkedEventIds));
  if (!(events                     ).some((event) => (event.actionAffinity?.length ?? 0) === 0 && !causeLinkedEventIds.has(event.id))) fail("pack.events", "playable pack requires an ordinary fallback Event that is not Cause-linked");
  for (const template of templateMap.values()) if (template.onActorUnavailable.action === "transform") {
    const target = templateMap.get(template.onActorUnavailable.targetCauseTemplateId); if (target === undefined) fail(`pack.causeTemplates.${template.id}`, "transform target is undefined");
    const sourceRequired = new Set(template.actors.filter((actor) => actor.required).map((actor) => actor.role));
    for (const actor of target.actors) if (actor.required && !sourceRequired.has(actor.role)) fail(`pack.causeTemplates.${template.id}`, `transform cannot bind required target role ${actor.role}`);
  }
  validateCauseBindings(events                     , templateMap);
  validateTriggeringCauseReferences(events                     , templateMap);
  if (computePackChecksum(value               ) !== checksum) fail("pack.manifest.checksum", "does not match canonical content");
  return value               ;
}

function cloneAndFreeze   (value   )    {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreeze))     ;
  if (typeof value !== "object" || value === null) return value;
  const result              = {}; for (const [key, entry] of Object.entries(value               )) result[key] = cloneAndFreeze(entry);
  return Object.freeze(result)     ;
}

                                                                                                                                                                                                                                                                            
function addIndex(map                       , key        , eventId        )       { const values = map.get(key) ?? []; if (!values.includes(eventId)) { values.push(eventId); values.sort(); map.set(key, values); } }
function buildDirectorIndex(pack             )                      { const index                      = { eventById: new Map(pack.events.map((event) => [event.id, event])), ordinary: [], onboarding: [], action: new Map(), buildTag: new Map(), worldTag: new Map(), npcRoleTag: new Map(), totalEvents: pack.events.length }; const causeLinked = new Set(pack.causeTemplates.flatMap((template) => template.linkedEventIds)); for (const event of pack.events) { if (causeLinked.has(event.id)) continue; if ((event.actionAffinity?.length ?? 0) === 0) index.ordinary.push(event.id); for (const action of event.actionAffinity ?? []) addIndex(index.action, action, event.id); const hints = event.directorHints; if (hints?.onboardingEligible === true) index.onboarding.push(event.id); for (const tag of hints?.buildAffinityTags ?? []) addIndex(index.buildTag, tag, event.id); for (const tag of hints?.worldAffinityTags ?? []) addIndex(index.worldTag, tag, event.id); for (const tag of hints?.npcRoleAffinityTags ?? []) addIndex(index.npcRoleTag, tag, event.id); } index.ordinary.sort(); index.onboarding.sort(); return index; }
function queryIndex(index                     , query                    )                           { const ids = new Set        (); let indexLookups = 0; let candidateIdsVisited = 0; const add = (values                               ) => { indexLookups += 1; if (values === undefined) return; candidateIdsVisited += values.length; values.forEach((id) => ids.add(id)); }; if (query.slot === "onboarding") add(index.onboarding); else if (query.slot === "ordinary") add(index.ordinary); else if (query.slot === "coreNpc") for (const tag of query.npcRoleTags ?? []) add(index.npcRoleTag.get(tag)); else { if (query.action !== undefined) add(index.action.get(query.action)); for (const tag of query.buildTags ?? []) add(index.buildTag.get(tag)); for (const tag of query.worldTags ?? []) add(index.worldTag.get(tag)); for (const tag of query.npcRoleTags ?? []) add(index.npcRoleTag.get(tag)); } return { eventIds: [...ids].sort(), stats: { indexLookups, candidateIdsVisited, totalEvents: index.totalEvents } }; }

class ContentRegistry {
           #byVersion = new Map                     ();
           #buildPacks = new Map                   ([["build.v1", getBuildPack("build.v1")]]);
           #npcPacks = new Map                 ([["npc.v1", getNpcPack("npc.v1")]]);
           #npcDefinitionIndexes = new Map                                    ([["npc.v1", new Map(getNpcPack("npc.v1").coreDefinitions.map((entry) => [entry.id, entry]))]]);
           #npcArchetypeIndexes = new Map                                             ([["npc.v1", new Map(getNpcPack("npc.v1").archetypes.map((entry) => [entry.id, entry]))]]);
           #directorPacks = new Map                      ([["director.v1", getDirectorPack("director.v1")]]);
           #directorIndexes = new Map                             ();
  registerBuildPack(value         )            { const validated = validateBuildPack(value); const stored = cloneAndFreeze(validated); const existing = this.#buildPacks.get(stored.id); if (existing !== undefined && JSON.stringify(canonicalValue(existing)) !== JSON.stringify(canonicalValue(stored))) fail("buildPack.id", "is already registered with different content"); if (existing === undefined) this.#buildPacks.set(stored.id, stored); return existing ?? stored; }
  registerNpcPack(value         )          { const validated = validateNpcPack(value); const stored = cloneAndFreeze(validated); const existing = this.#npcPacks.get(stored.id); if (existing !== undefined && JSON.stringify(canonicalValue(existing)) !== JSON.stringify(canonicalValue(stored))) fail("npcPack.id", "is already registered with different content"); if (existing === undefined) { this.#npcPacks.set(stored.id, stored); this.#npcDefinitionIndexes.set(stored.id, new Map(stored.coreDefinitions.map((entry) => [entry.id, entry]))); this.#npcArchetypeIndexes.set(stored.id, new Map(stored.archetypes.map((entry) => [entry.id, entry]))); } return existing ?? stored; }
  registerDirectorPack(value         )               { const validated = validateDirectorPack(value); const stored = cloneAndFreeze(validated); const existing = this.#directorPacks.get(stored.id); if (existing !== undefined && JSON.stringify(canonicalValue(existing)) !== JSON.stringify(canonicalValue(stored))) fail("directorPack.id", "is already registered with different content"); if (existing === undefined) this.#directorPacks.set(stored.id, stored); return existing ?? stored; }
  register(value         )              {
    const validated = validateContentPack(value, undefined, { getBuildPack: (id) => this.#buildPacks.get(id), getNpcPack: (id) => this.#npcPacks.get(id), getDirectorPack: (id) => this.#directorPacks.get(id) }); const stored = cloneAndFreeze(validated);
    const existing = this.#byVersion.get(stored.manifest.contentVersion);
    if (existing !== undefined && existing.manifest.checksum !== stored.manifest.checksum) fail("pack.manifest.contentVersion", "is already registered with different content");
    if (existing === undefined) { this.#byVersion.set(stored.manifest.contentVersion, stored); this.#directorIndexes.set(stored.manifest.contentVersion, buildDirectorIndex(stored)); }
    return existing ?? stored;
  }
  get(contentVersion        )              {
    const pack = this.#byVersion.get(contentVersion); if (pack === undefined) fail("contentVersion", `is not registered: ${contentVersion}`); return pack;
  }
  getEvent(contentVersion        , eventId        )                  {
    const event = this.#directorIndexes.get(contentVersion)?.eventById.get(eventId); if (event === undefined) fail("eventId", `is not registered: ${eventId}`); return event;
  }
  getDestiny(contentVersion        , destinyId        )                    {
    const destiny = this.get(contentVersion).destinies.find((candidate) => candidate.id === destinyId); if (destiny === undefined) fail("destinyId", `is not registered: ${destinyId}`); return destiny;
  }
  getCauseTemplate(contentVersion        , templateId        )                {
    const template = this.get(contentVersion).causeTemplates.find((candidate) => candidate.id === templateId); if (template === undefined) fail("templateId", `is not registered: ${templateId}`); return template;
  }
  getProgression(contentVersion        )                  {
    const id = this.get(contentVersion).progressionPackId; if (id === undefined) fail("progressionPackId", "is not configured for contentVersion"); return getProgressionPack(id);
  }
  getRisk(contentVersion        )           {
    const id = this.get(contentVersion).riskPackId; if (id === undefined) fail("riskPackId", "is not configured for contentVersion"); return getRiskPack(id);
  }
  getBuild(contentVersion        )            {
    const id = this.get(contentVersion).buildPackId; if (id === undefined) fail("buildPackId", "is not configured for contentVersion"); const pack = this.#buildPacks.get(id); if (pack === undefined) fail("buildPackId", `is not registered: ${id}`); return pack;
  }
  getNpc(contentVersion        )          {
    const id = this.get(contentVersion).npcPackId; if (id === undefined) fail("npcPackId", "is not configured for contentVersion"); const pack = this.#npcPacks.get(id); if (pack === undefined) fail("npcPackId", `is not registered: ${id}`); return pack;
  }
  getNpcDefinition(contentVersion        , definitionId        )                { const pack = this.getNpc(contentVersion); const definition = this.#npcDefinitionIndexes.get(pack.id)?.get(definitionId); if (definition === undefined) fail("npcDefinitionId", `is not registered: ${definitionId}`); return definition; }
  getNpcArchetype(contentVersion        , archetypeId        )                         { const pack = this.getNpc(contentVersion); const archetype = this.#npcArchetypeIndexes.get(pack.id)?.get(archetypeId); if (archetype === undefined) fail("archetypeId", `is not registered: ${archetypeId}`); return archetype; }
  getDirector(contentVersion        )               { const id = this.get(contentVersion).directorPackId; if (id === undefined) fail("directorPackId", "is not configured for contentVersion"); const pack = this.#directorPacks.get(id); if (pack === undefined) fail("directorPackId", `is not registered: ${id}`); return pack; }
  queryDirectorCandidates(contentVersion        , query                    )                           { this.get(contentVersion); const index = this.#directorIndexes.get(contentVersion); if (index === undefined) fail("contentVersion", `has no Director index: ${contentVersion}`); return queryIndex(index, query); }
}

module.exports = Object.assign({}, {
  ContentValidationError,
  REPEAT_SENSITIVE_EFFECT_OPS,
  canonicalPackJson,
  computePackChecksum,
  sealContentPack,
  validateContentPack,
  ContentRegistry
});
