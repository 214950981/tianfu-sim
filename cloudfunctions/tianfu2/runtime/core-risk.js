// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/risk.ts
// Source sha256:   07b27850ee4c1f38a52476077623691ccfffc0ac111e3c79cb68b8e0a8e7dbec
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
var { evaluateCondition, resolveScoreCheck, scoreCheckBase } = require("./core-event.js");
var { clampInteger, safeAdd } = require("./core-numeric.js");
                                                                                

const RISK_MODIFIER_KEYS = ["riskScoreDelta", "riskDifficultyDelta", "consequenceSeverityDelta"]         ;
                                                                
                                                                                           
                                                                            
                                                                                                                        
                                                                                      
                                                                                                           
                                  
                      
                                                                                                                                    
 
                                                              
                 
                   
                                               
                                                               
                                                                                                     
                        
 
                           
             
                  
                       
                                                                                         
                                                                        
                              
                                            
                                      
                          
 
                                                                                
                                 
                       
                         
                         
 
                                                                                                                                  
                                                                                                                                           
                                       
                    
                         
                         
                         
                                      
                                 
                                                  
 
                                 
                   
                    
                                     
                            
                                          
                                           
 

class RiskResolutionError extends Error {
  constructor(message        ) { super(message); this.name = "RiskResolutionError"; }
}

function threatDefinition(pack          , id        )                   {
  const definition = pack.threats.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new RiskResolutionError(`unknown ThreatDefinition ${id}`);
  return definition;
}

function conditionDefinition(pack          , id        )                          {
  const definition = pack.riskConditions.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new RiskResolutionError(`unknown RiskConditionDefinition ${id}`);
  return definition;
}

function injuryLevel(state           )                {
  return Math.min(3, state.run.conditions.filter((condition) => condition.kind === "injury").reduce((maximum, condition) => Math.max(maximum, condition.stacks), 0))                 ;
}

function aggregateRiskModifiers(sources                               )                {
  const totals                                  = { riskScoreDelta: 0, riskDifficultyDelta: 0, consequenceSeverityDelta: 0 };
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

function orderedRiskHooks(pack          , sources                               )                                         {
  const whitelist = new Set(pack.hookWhitelist);
  return [...sources].sort((left, right) => left.id.localeCompare(right.id)).flatMap((source) => source.hooks.filter((hook) => hook.systemOwner === "RISK01").map((hook) => ({ ...hook, sourceId: source.id }))).map((hook) => {
    if (!whitelist.has(hook.id)) throw new RiskResolutionError(`unknown risk hook ${hook.id}`);
    return hook;
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id) || left.sourceId.localeCompare(right.sourceId));
}

function activeSources(state           , pack          , threat                  , extras                                = [])                       {
  const conditionSources = (state.run.risk?.conditions ?? []).map((condition) => conditionDefinition(pack, condition.definitionId));
  return [threat, ...conditionSources, ...extras];
}

function lethalPrerequisitesMet(state           , definition                  )          {
  const policy = definition.lethalityPolicy;
  return policy !== undefined && policy.lethalOnFailure && policy.prerequisites.every((condition) => evaluateCondition(condition, state));
}

function buildRiskPresentation(state           , definition                  )                       {
  const canBeFatal = lethalPrerequisitesMet(state, definition);
  const failure = definition.outcomeTable.failure;
  const tier                               = canBeFatal ? "lethal" : failure.injuryDelta >= 2 || failure.conditionAdds.some((condition) => condition.severity === 3) ? "dangerous" : definition.outcomeTable.costlySuccess.injuryDelta > 0 || definition.outcomeTable.costlySuccess.conditionAdds.length > 0 ? "caution" : "low";
  const reasons = [`risk.category.${definition.category}`];
  if (injuryLevel(state) > 0) reasons.push("risk.reason.injury");
  return { tier, canBeFatal, reasons };
}

function applyInjury(state           , delta        , sourceRef        )            {
  if (delta <= 0) return state;
  const current = injuryLevel(state); const nextLevel = Math.min(3, safeAdd(current, delta));
  const injuryIndex = state.run.conditions.findIndex((condition) => condition.kind === "injury" && condition.stacks === current);
  const conditions = injuryIndex < 0
    ? [...state.run.conditions, { id: "condition.risk.injury", kind: "injury"         , stacks: nextLevel, sourceRef }]
    : state.run.conditions.map((condition, index) => index === injuryIndex ? { ...condition, stacks: nextLevel, sourceRef } : condition);
  return { ...state, run: { ...state.run, conditions } };
}

function applyRiskConditions(state           , additions                                  , sourceRef        )            {
  if (additions.length === 0) return state;
  const existing = state.run.risk?.conditions ?? []; const created                          = additions.map((addition, index) => ({
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

function deathRecord(state           , pack          , definition                  , options                      , trace                                   )              {
  const causeId = definition.deathCauseId;
  if (causeId === undefined || !pack.deathCauses.some((candidate) => candidate.id === causeId)) throw new RiskResolutionError("lethal Threat requires a registered DeathCauseDefinition");
  const contributing = [definition.id, options.sourceCauseId, options.sourceActorId].filter((value)                  => value !== undefined).sort();
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

function resolveThreat(state           , pack          , instance                , options                      )                 {
  const definition = threatDefinition(pack, instance.definitionId);
  const presentation = buildRiskPresentation(state, definition);
  if (JSON.stringify(presentation) !== JSON.stringify(options.presentedRisk)) throw new RiskResolutionError("RiskPresentation does not match authoritative pre-submit projection");
  if (presentation.canBeFatal && (!definition.lethalityPolicy?.requiresPublicWarning || !options.presentedRisk.canBeFatal || !options.acceptedPublicWarning)) throw new RiskResolutionError("lethal Threat requires an accepted public warning");
  const resolvedOptions                       = { ...options, sourceCauseId: options.sourceCauseId ?? instance.sourceCauseId, sourceActorId: options.sourceActorId ?? instance.sourceActorId };
  const sources = activeSources(state, pack, definition, options.modifierSources); orderedRiskHooks(pack, sources);
  const aggregate = aggregateRiskModifiers(sources);
  const injuryPenalty = pack.injuryScoreModifiers[String(injuryLevel(state))                         ];
  const baseScore = safeAdd(scoreCheckBase(state, definition.checkSpec), safeAdd(injuryPenalty, aggregate.riskScoreDelta));
  const rawDifficulty = definition.checkSpec.difficulty;
  if (typeof rawDifficulty !== "number" || !Number.isSafeInteger(rawDifficulty)) throw new RiskResolutionError("invalid Threat CheckSpec difficulty");
  const effectiveDifficulty = clampInteger(safeAdd(rawDifficulty, aggregate.riskDifficultyDelta), 0, 1000);
  const checked = resolveScoreCheck(state, baseScore, effectiveDifficulty);
  const consequence = definition.outcomeTable[checked.tier];
  const severityDelta = aggregate.consequenceSeverityDelta;
  const injuryDelta = clampInteger(safeAdd(consequence.injuryDelta, severityDelta), 0, 3);
  const conditionAdds = consequence.conditionAdds.map((condition) => ({ ...condition, severity: clampInteger(safeAdd(condition.severity, severityDelta), 1, 3)              }));
  let next = applyRiskConditions(applyInjury(checked.state, injuryDelta, options.commandId), conditionAdds, options.commandId);
  next = { ...next, run: { ...next.run, risk: { conditions: [...(next.run.risk?.conditions ?? [])], exposureCount: safeAdd(next.run.risk?.exposureCount ?? 0, 1) } } };
  const lethal = checked.tier === "failure" && presentation.canBeFatal;
  const trace = { resolver: "RISK01", threatId: definition.id, outcomeTier: checked.tier, baseScore, effectiveDifficulty, rngRoll: checked.rngRoll, injuryLevelBefore: injuryLevel(state), injuryLevelAfter: injuryLevel(next), modifierSources: aggregate.sources, lethal };
  let record                         ;
  if (lethal) {
    record = deathRecord(next, pack, definition, resolvedOptions, trace);
    next = { ...next, run: { ...next.run, status: "dying", deathRecord: record, ending: { endingId: `death:${record.deathCauseId}`, deathCause: record.category, sourceRef: options.commandId, age: next.run.age, factIds: [] } } };
  }
  return { state: next, tier: checked.tier, presentation, ...(record === undefined ? {} : { deathRecord: record }), rngDraws: checked.rngDraws, trace };
}

module.exports = Object.assign({}, {
  RISK_MODIFIER_KEYS,
  RiskResolutionError,
  threatDefinition,
  injuryLevel,
  aggregateRiskModifiers,
  orderedRiskHooks,
  buildRiskPresentation,
  resolveThreat
});
