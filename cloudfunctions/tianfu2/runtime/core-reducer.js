// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/reducer.ts
// Source sha256:   918c4851ad81a7215c36efbc94e7991430ba5632c00770f0dac219356c7f29ce
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
var { CommandValidationError, validateGameCommand } = require("./core-command.js");
var { advanceCauses, applyCauseEffects, selectCauseEcho, validateCauseChoice } = require("./core-cause.js");
var { recordDirectorScene, selectDirectorEvent } = require("./core-director.js");
var { applyEventEffects, assertA08ExecutableChoice, evaluateCondition, EventRuntimeError, isEventEligible, recordEventOccurrence, resolveCheck, resolveOutcome } = require("./core-event.js");
var { assertNonNegativeInteger, assertSafeInteger, safeAdd } = require("./core-numeric.js");
var { createRngState } = require("./core-rng.js");
var { applyBreakthroughOutcome, applyRetreatProgression, isValidInnateProfile, resolveBreakthrough } = require("./core-progression.js");
var { buildRiskPresentation, injuryLevel, resolveThreat, threatDefinition } = require("./core-risk.js");
var { activeBuildProgressionSources, activeBuildRiskSources, applyBuildEffects } = require("./core-build.js");
var { applyNpcEffects, causeActorAvailability } = require("./core-npc.js");
var { currentParticipantBindings, eventInstanceId, materializeEventParticipants } = require("./core-participants.js");
var { projectRuleState, validateGameState, validateStateTransition } = require("./core-state.js");

                                                                
                              
                                                                                            
                                                   
                                                                          
 
                                                                                             
                                                             
                                                     
                            
                       
                       
                       
                   
 
                               
                   
                          
                         
                   
 

class ReducerError extends Error {
           code              ;
           messageKey        ;
           retryable         ;
  constructor(code              , messageKey        , retryable = false) {
    super(messageKey);
    this.name = "ReducerError";
    this.code = code;
    this.messageKey = messageKey;
    this.retryable = retryable;
  }
}

// The actor ids a selected P3 Cause echo was bound to, read from the exact selected CauseInstance that
// selectCauseEcho already returned (its causeId is the one persisted as events.current.triggeringCauseId).
// This is authoritative provenance, not a lookup: no templateId/role/salience/uniqueness heuristic, and no
// dependency on any other active Cause or on the current NpcInstance role index. A P3 DirectorSceneRecord
// therefore stores the actors the echo actually carried, which is what makes the P4 repeat gate exact even
// when several active core NPC instances share one role. Returns undefined when no causeId is available so
// the caller can record the scene without actorIds, exactly as before.
function selectedCauseActorIds(state           , causeId                    )                       {
  if (causeId === undefined) return undefined;
  const cause = state.run.causes.byId[causeId]; if (cause === undefined) return undefined;
  return [...new Set(Object.values(cause.actorIdsByRole))];
}

                                    
                  
                                                
                                                                                                                                                        
              
                 
                  
                                                                                                                  
                                                                                      
                                                                              
                               
                             
                                          
          
                     
                                      
                            
                                                      
    
                     
 

                                        
                        
                       
                         
                
                   
                   
                     
                             
                        
 

function cloneRecord(record                                  )                         {
  return Object.fromEntries(Object.entries(record));
}

function createOfferedRun(input                       )            {
  const { fixture } = input;
  const state            = {
    schemaVersion: input.schemaVersion,
    rulesVersion: input.rulesVersion,
    contentVersion: input.contentVersion,
    stateVersion: 0,
    run: {
      runId: input.runId,
      playerId: input.playerId,
      rootSeed: input.rootSeed,
      status: "offered",
      nodeIndex: 0,
      age: fixture.age,
      maxAge: fixture.maxAge,
      offer: { offerId: fixture.offerId, destinyIds: [...fixture.destinyIds], ...(fixture.innateProfiles === undefined ? {} : { innateProfiles: structuredClone([...fixture.innateProfiles])                                                                                                                                }) },
      realm: { ...fixture.realm, cultivation: fixture.realm.cultivationBps ?? fixture.realm.cultivation, cultivationBps: fixture.realm.cultivationBps ?? fixture.realm.cultivation, realmFoundationBps: fixture.realm.realmFoundationBps ?? 0 },
      attributes: { ...fixture.attributes },
      resources: { spiritStone: fixture.resources.spiritStone, items: cloneRecord(fixture.resources.items) },
      conditions: [],
      risk: { conditions: [], exposureCount: 0 },
      identity: { runName: fixture.runName, rootTags: [...(fixture.rootTags ?? [])], titles: [...(fixture.titles ?? [])] },
      actions: { available: [...fixture.availableActions], pursuitCauseIds: [], recent: [] },
      events: { history: [], occurrences: {} },
      causes: { byId: {} },
      npcs: { nextNpcSequence: 1, byId: {}, roleIndex: {} },
      build: { techniques: [], artifacts: [], consumables: [], tagScores: {}, affinities: {}, evidenceFacts: [], transitionFacts: [], unlockedBuildIds: [] },
      world: {
        regionId: fixture.world.regionId,
        knownRegionIds: [...fixture.world.knownRegionIds],
        tags: [...fixture.world.tags],
        factionStanding: cloneRecord(fixture.world.factionStanding)
      },
      rng: input.initialRng ?? createRngState(input.rulesVersion, input.rootSeed),
      director: { profileId: fixture.firstRun === true ? "first_run" : "standard", recentScenes: [] }
    },
    metaView: {
      unlocks: [...input.metaView.unlocks],
      entitlements: [...input.metaView.entitlements],
      discoveries: [...input.metaView.discoveries]
    }
  };
  return validateGameState(state);
}

                              
                      
                
                  
                         
 

function resolveTimeAdvance(age        , maxAge        , delta        )              {
  assertNonNegativeInteger(age, "age");
  assertNonNegativeInteger(maxAge, "maxAge");
  assertNonNegativeInteger(delta, "delta");
  if (age > maxAge) throw new RangeError("age must not exceed maxAge");
  const remaining = maxAge - age;
  const reachedMaxAge = delta >= remaining;
  return {
    previousAge: age,
    delta,
    nextAge: reachedMaxAge ? maxAge : safeAdd(age, delta),
    reachedMaxAge
  };
}

function validateContext(state           , context             )       {
  if (typeof context !== "object" || context === null || typeof context.content !== "object" || context.content === null) {
    throw new ReducerError("INVALID_COMMAND", "context.invalid");
  }
  if (context.rulesVersion !== state.rulesVersion || context.contentVersion !== state.contentVersion) {
    throw new ReducerError("CONTENT_MISMATCH", "content.version_mismatch");
  }
  if (typeof context.commandId !== "string" || context.commandId.length === 0) throw new ReducerError("INVALID_COMMAND", "context.command_id_invalid");
  if (context.actorBindings !== undefined && (typeof context.actorBindings !== "object" || context.actorBindings === null || Array.isArray(context.actorBindings))) throw new ReducerError("INVALID_COMMAND", "context.actor_bindings_invalid");
  if (context.actorStatusById !== undefined && (typeof context.actorStatusById !== "object" || context.actorStatusById === null || Array.isArray(context.actorStatusById) || Object.values(context.actorStatusById).some((status) => status !== "available" && status !== "unavailable"))) throw new ReducerError("INVALID_COMMAND", "context.actor_status_invalid");
}

function startRun(state           , command                                             , context             )            {
  if (state.run.status !== "offered" || state.run.offer === undefined) throw new ReducerError("RUN_NOT_ACTIVE", "run.offer_consumed");
  if (command.offerId !== state.run.offer.offerId) throw new ReducerError("RUN_OFFER_MISMATCH", "run.offer_mismatch");
  let destinyId        ; let innateProfile                                                ;
  if (state.run.offer.innateProfiles !== undefined) {
    if (!("selectionId" in command) || typeof command.selectionId !== "string") throw new ReducerError("INVALID_OPTION", "run.innate_selection_required");
    const selection = state.run.offer.innateProfiles.find((candidate) => candidate.selectionId === command.selectionId); if (selection === undefined) throw new ReducerError("INVALID_OPTION", "run.innate_selection_not_offered");
    const progression = (context.content                                       ).getProgression?.(context.contentVersion); if (progression === undefined || !isValidInnateProfile(progression, selection.profile)) throw new ReducerError("CONTENT_MISMATCH", "content.innate_profile_invalid");
    destinyId = selection.profile.majorDestinyId; innateProfile = structuredClone(selection.profile);
  } else {
    if (!("destinyId" in command) || typeof command.destinyId !== "string" || !state.run.offer.destinyIds.includes(command.destinyId)) throw new ReducerError("INVALID_OPTION", "run.destiny_not_offered"); destinyId = command.destinyId;
  }
  const nextStateVersion = safeAdd(state.stateVersion, 1);
  const { offer: _consumedOffer, ...runWithoutOffer } = state.run;
  const next            = {
    ...state,
    stateVersion: nextStateVersion,
    run: {
      ...runWithoutOffer,
      status: "active",
      identity: { ...state.run.identity, destinyId, ...(innateProfile === undefined ? {} : { innateProfile }) }
    }
  };
  return validateStateTransition(state, next);
}

const ACTION_TIME_COSTS                                                                 = {
  "2.0.0": { cultivate: 3, travel: 2, worldly: 1, pursuit: 1 }
};

function actionTimeCost(rulesVersion        , action            )         {
  const cost = ACTION_TIME_COSTS[rulesVersion]?.[action];
  if (cost === undefined) throw new ReducerError("CONTENT_MISMATCH", "rules.action_time_unavailable");
  assertNonNegativeInteger(cost, "actionTimeCost");
  return cost;
}

                                             
function runtimeObject(value         , message        )                {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ReducerError("INVALID_OPTION", message);
  return value                 ;
}
function eventFromContent(context             , eventId        )                {
  const source = context.content                                                                  ;
  if (typeof source.getEvent !== "function") throw new ReducerError("CONTENT_MISMATCH", "content.event_registry_required");
  return runtimeObject(source.getEvent(context.contentVersion, eventId), "event.invalid");
}
function selectedTransition(transitionsValue         , state           , context             )                            {
  if (transitionsValue === undefined) return undefined;
  if (!Array.isArray(transitionsValue)) throw new ReducerError("INVALID_OPTION", "event.transitions_invalid");
  const eligible = transitionsValue.filter((value) => {
    const transition = runtimeObject(value, "event.transition_invalid");
    if (typeof transition.eventId !== "string") throw new ReducerError("INVALID_OPTION", "event.transition_invalid");
    if (transition.when !== undefined && !evaluateCondition(transition.when, state)) return false;
    return isEventEligible(eventFromContent(context, transition.eventId), state);
  });
  eligible.sort((leftValue, rightValue) => {
    const left = leftValue                 ; const right = rightValue                 ;
    const leftPriority = typeof left.priority === "number" ? left.priority : 0; const rightPriority = typeof right.priority === "number" ? right.priority : 0;
    return rightPriority === leftPriority ? String(left.eventId).localeCompare(String(right.eventId)) : rightPriority > leftPriority ? 1 : -1;
  });
  return eligible[0]                             ;
}

                                    
                                                                                                     
 

function buildPackFromContext(context             )                        { const source = context.content                                                                     ; const locked = source.get(context.contentVersion); return locked.buildPackId === undefined ? undefined : source.getBuild?.(context.contentVersion); }
function npcPackFromContext(context             )                      { const source = context.content                                                                   ; const locked = source.get(context.contentVersion)                          ; return locked.npcPackId === undefined ? undefined : source.getNpc?.(context.contentVersion); }
// Cause effect resolution forwards the visible actor bindings and Cause-owned actor availability. The
// triggering Cause is deliberately NOT forwarded here: it is read from the authoritative current scene by
// the Cause module, so a caller-supplied context can never manufacture a Cause binding.
function causeContextWithNpcState(state           , context             )              { return { ...context, actorBindings: currentParticipantBindings(state, context.actorBindings), actorStatusById: { ...(context.actorStatusById ?? {}), ...causeActorAvailability(state) } }; }

function chooseAction(state           , command                                                 , context             )               {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  if (state.run.events.current !== undefined) throw new ReducerError("INVALID_COMMAND", "action.interaction_pending");
  if (!state.run.actions.available.includes(command.actionId)) throw new ReducerError("INVALID_OPTION", "action.unavailable");
  const delta = actionTimeCost(state.rulesVersion, command.actionId);
  const timeAdvance = resolveTimeAdvance(state.run.age, state.run.maxAge, delta);
  let provisional            = {
    ...state,
    run: {
      ...state.run,
      age: timeAdvance.nextAge,
      nodeIndex: safeAdd(state.run.nodeIndex, 1),
      ...(timeAdvance.reachedMaxAge ? {
        status: "dying"         ,
        ending: { endingId: "lifespan", deathCause: "lifespan"         , sourceRef: context.commandId, age: timeAdvance.nextAge, factIds: [] },
        deathRecord: { deathCauseId: "death.lifespan", category: "lifespan", age: timeAdvance.nextAge, realmId: state.run.realm.id, immediateSource: "lifespan-hard-ceiling", contributingSourceRefs: [], warningFacts: ["risk.warning.lifespan-ceiling"], sourceCommandId: context.commandId, trace: { resolver: "lifespan-hard-ceiling", actionId: command.actionId, previousAge: timeAdvance.previousAge, actionTimeCost: timeAdvance.delta, maxAge: state.run.maxAge } }
      } : {})
    }
  };
  if (provisional.run.status === "active" && command.actionId === "cultivate" && provisional.run.identity.innateProfile !== undefined) {
    const progression = (context.content                                       ).getProgression?.(context.contentVersion); if (progression === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.progression_required"); const buildPack = buildPackFromContext(context); provisional = applyRetreatProgression(provisional, progression, buildPack === undefined ? [] : activeBuildProgressionSources(provisional, buildPack));
  }
  const causeContent = context.content                                 ;
  try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, causeContextWithNpcState(provisional, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let rngDraws             = []; let selectorTrace                            = []; let participantFacts         = [];
  if (provisional.run.status === "active") {
    const directorContent = context.content                                    ;
    const firstRunSelection = selectDirectorEvent(provisional, command.actionId, directorContent, ["P2"]);
    provisional = firstRunSelection.state; rngDraws.push(...firstRunSelection.rngDraws); selectorTrace.push(firstRunSelection.trace                                      );
    if (provisional.run.events.current === undefined) {
      const causeSelection = selectCauseEcho(provisional, causeContent, context.contentVersion, causeContextWithNpcState(provisional, context));
      provisional = causeSelection.state; rngDraws.push(...causeSelection.rngDraws); selectorTrace.push(...causeSelection.trace);
      const causeTrace = causeSelection.trace[0];
      const selectedCauseId = typeof causeTrace?.causeId === "string" ? causeTrace.causeId : undefined;
      if (provisional.run.events.current !== undefined) provisional = recordDirectorScene(provisional, provisional.run.events.current.eventId, directorContent, "P3", { causeId: selectedCauseId, ...(selectedCauseActorIds(provisional, selectedCauseId) === undefined ? {} : { actorIds: selectedCauseActorIds(provisional, selectedCauseId) }) });
    }
    if (provisional.run.events.current === undefined) {
      const directorSelection = selectDirectorEvent(provisional, command.actionId, directorContent, ["P4", "P5", "P6"]);
      provisional = directorSelection.state; rngDraws.push(...directorSelection.rngDraws); selectorTrace.push(directorSelection.trace                                      );
      if (provisional.run.events.current === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.no_event_candidate");
    }
    if (provisional.run.events.current !== undefined) {
      try { const eventId = provisional.run.events.current.eventId; const materialized = materializeEventParticipants(provisional, context.content                                       , eventId, eventInstanceId(context.commandId, eventId)); provisional = recordEventOccurrence(materialized.state, eventId); rngDraws.push(...materialized.rngDraws); participantFacts = materialized.facts.map((fact) => ({ ...fact })); }
      catch { throw new ReducerError("CONTENT_MISMATCH", "content.event_participants_invalid"); }
    }
  } else {
    selectorTrace.push({ tier: "P0", result: "lifespan", eventRngRequests: 0 });
  }
  const next = validateStateTransition(state, { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) });
  return {
    state: next,
    effects: [],
    narrativeFacts: [{ type: "ACTION", actionId: command.actionId, actionTimeCost: delta }, ...participantFacts],
    trace: { rngDraws, selector: selectorTrace, time: [{ ...timeAdvance, actionId: command.actionId }] }
  };
}

function attemptBreakthrough(state           , context             )               {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  if (state.run.events.current !== undefined) throw new ReducerError("INVALID_COMMAND", "breakthrough.interaction_pending");
  if ((state.run.realm.cultivationBps ?? state.run.realm.cultivation) !== 10_000) throw new ReducerError("INVALID_OPTION", "breakthrough.cultivation_incomplete");
  const progression = (context.content                                       ).getProgression?.(context.contentVersion); if (progression === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.progression_required");
  const buildPack = buildPackFromContext(context); const buildSources = buildPack === undefined ? [] : activeBuildProgressionSources(state, buildPack);
  let resolved; try { resolved = resolveBreakthrough(state, progression, buildSources); } catch { throw new ReducerError("INVALID_OPTION", "breakthrough.unavailable"); }
  let progressed; try { progressed = applyBreakthroughOutcome(resolved.state, progression, resolved.tier, context.commandId, buildSources); } catch { throw new ReducerError("INVALID_OPTION", "breakthrough.unavailable"); }
  let backlashDraws             = []; let backlashTrace                                     ;
  if (resolved.tier === "failure" && injuryLevel(progressed) === 3) {
    const riskPack = (context.content                                ).getRisk?.(context.contentVersion);
    if (riskPack !== undefined) {
      const definition = threatDefinition(riskPack, "threat.breakthrough-backlash"); const presentation = buildRiskPresentation(progressed, definition);
      const backlash = resolveThreat(progressed, riskPack, { definitionId: definition.id }, { commandId: context.commandId, presentedRisk: presentation, acceptedPublicWarning: false, modifierSources: buildPack === undefined ? [] : activeBuildRiskSources(progressed, buildPack) });
      progressed = backlash.state; backlashDraws = backlash.rngDraws; backlashTrace = { ...backlash.trace };
    }
  }
  const next = validateStateTransition(state, { ...progressed, stateVersion: safeAdd(state.stateVersion, 1) }); const advanced = next.run.realm.id !== state.run.realm.id;
  return {
    state: next,
    effects: advanced ? [{ type: "REALM_ADVANCE", realmId: next.run.realm.id, outcomeTier: resolved.tier }] : [{ type: "BREAKTHROUGH_FAILED", realmId: next.run.realm.id }],
    narrativeFacts: [{ id: `fact:${context.commandId}:breakthrough`, type: "REALM_BREAKTHROUGH", sourceRef: context.commandId, data: { fromRealmId: state.run.realm.id, toRealmId: next.run.realm.id, outcomeTier: resolved.tier } }],
    trace: { rngDraws: [...resolved.rngDraws, ...backlashDraws], selector: [{ kind: "breakthrough-check", effectiveDifficulty: resolved.effectiveDifficulty, effectiveScore: resolved.effectiveScore, rngRoll: resolved.rngRoll, outcomeTier: resolved.tier }, ...(backlashTrace === undefined ? [] : [{ kind: "breakthrough-backlash", ...backlashTrace }])] }
  };
}

function chooseEventOption(state           , command                                                       , context             )               {
  if (state.run.status !== "active") throw new ReducerError("RUN_NOT_ACTIVE", "run.not_active");
  const current = state.run.events.current;
  if (current === undefined || current.eventId !== command.eventId) throw new ReducerError("INVALID_OPTION", "event.not_current");
  const event = eventFromContent(context, current.eventId);
  if (!isEventEligible(event, state, { checkRecurrence: false })) throw new ReducerError("INVALID_OPTION", "event.ineligible");
  if (!Array.isArray(event.choices)) throw new ReducerError("INVALID_OPTION", "event.has_no_choices");
  const choice = event.choices.find((value) => runtimeObject(value, "choice.invalid").id === command.optionId);
  if (choice === undefined) throw new ReducerError("INVALID_OPTION", "event.option_invalid");
  const choiceObject = runtimeObject(choice, "choice.invalid");
  if (choiceObject.requirements !== undefined && !evaluateCondition(choiceObject.requirements, state)) throw new ReducerError("INVALID_OPTION", "event.option_ineligible");
  assertA08ExecutableChoice(choiceObject);
  const causeContent = context.content                                 ;
  try { validateCauseChoice(choiceObject, state, causeContent, context.contentVersion, causeContextWithNpcState(state, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }

  let checkedState = state; let requestedTier              = "success"; let rngDraws             = []; let checkFact                = { logicalRequests: 0 };
  if (choiceObject.threatId !== undefined) {
    const riskPack = (context.content                                ).getRisk?.(context.contentVersion); if (riskPack === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.risk_required");
    const threatId = String(choiceObject.threatId); const definition = threatDefinition(riskPack, threatId); const presentation = buildRiskPresentation(state, definition);
    const buildPack = buildPackFromContext(context); const risk = resolveThreat(state, riskPack, { definitionId: threatId }, { commandId: context.commandId, sourceEventId: current.eventId, presentedRisk: presentation, acceptedPublicWarning: presentation.canBeFatal, modifierSources: buildPack === undefined ? [] : activeBuildRiskSources(state, buildPack) });
    checkedState = risk.state; requestedTier = risk.tier; rngDraws = risk.rngDraws; checkFact = { logicalRequests: 1, risk: risk.trace };
  } else if (choiceObject.check !== undefined) {
    const resolution = resolveCheck(state, choiceObject.check);
    checkedState = resolution.state; requestedTier = resolution.tier; rngDraws = resolution.rngDraws;
    checkFact = { logicalRequests: 1, baseScore: resolution.baseScore, rngRoll: resolution.rngRoll, finalScore: resolution.finalScore };
  }
  const resolved = resolveOutcome(choiceObject.outcomes, requestedTier);
  const executableEffects = (resolved.outcome.effects                      ).map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || !("repeatBehavior" in value)) return value;
    const { repeatBehavior: _repeatBehavior, ...effect } = value                           ; return effect;
  });
  let causeApplied           ;
  try { causeApplied = applyCauseEffects(checkedState, executableEffects, causeContent, context.contentVersion, causeContextWithNpcState(checkedState, context)); }
  catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  let npcApplied = causeApplied; let npcFacts         = []; const npcPack = npcPackFromContext(context); const hasNpcEffects = executableEffects.some((value) => typeof value === "object" && value !== null && !Array.isArray(value) && ["ADJUST_NPC_RELATION", "ADD_NPC_SIGNIFICANCE", "REVEAL_NPC_FACT", "REVEAL_NPC_TRAIT", "REVEAL_NPC_STATUS", "SET_NPC_STATUS", "ADD_NPC_MILESTONE"].includes(String((value                 ).op)));
  if (hasNpcEffects && npcPack === undefined) throw new ReducerError("CONTENT_MISMATCH", "content.npc_required");
  if (npcPack !== undefined) { try { const result = applyNpcEffects(causeApplied, executableEffects, npcPack, { commandId: context.commandId, sourceRef: current.instanceId ?? current.eventId, actorBindings: currentParticipantBindings(causeApplied, context.actorBindings) }); npcApplied = result.state; npcFacts = result.facts.map((fact) => ({ ...fact })); } catch { throw new ReducerError("INVALID_OPTION", "npc.invalid"); } }
  let buildApplied = npcApplied; let buildFacts         = []; const buildPack = buildPackFromContext(context);
  if (buildPack !== undefined) { try { const result = applyBuildEffects(npcApplied, executableEffects, buildPack, { commandId: context.commandId, sourceRef: current.eventId }); buildApplied = result.state; buildFacts = result.facts.map((fact) => ({ ...fact })); } catch { throw new ReducerError("INVALID_OPTION", "build.invalid"); } }
  const applied = applyEventEffects(buildApplied, executableEffects, current.eventId);
  const timeAdvance = resolveTimeAdvance(applied.state.run.age, applied.state.run.maxAge, applied.outcomeTimeDelta);
  const nextNodeIndex = safeAdd(applied.state.run.nodeIndex, 1);
  const { current: _resolvedCurrent, ...eventsWithoutCurrent } = applied.state.run.events;
  let provisional            = {
    ...applied.state,
    run: {
      ...applied.state.run,
      nodeIndex: nextNodeIndex,
      age: timeAdvance.nextAge,
      status: applied.state.run.status === "ended" ? "ended" : timeAdvance.reachedMaxAge ? "dying" : applied.state.run.status,
      events: {
        ...eventsWithoutCurrent,
        history: [...applied.state.run.events.history, { eventId: current.eventId, nodeIndex: state.run.nodeIndex, resultTier: requestedTier }]
      }
    }
  };
  const outcomeNext = resolved.outcome.next;
  const transition = provisional.run.status !== "active" ? undefined : selectedTransition(outcomeNext ?? choiceObject.next, provisional, context);
  if (transition !== undefined) {
    const targetId = transition.eventId          ; const target = eventFromContent(context, targetId);
    provisional = { ...provisional, run: { ...provisional.run, events: { ...provisional.run.events, current: { eventId: targetId, kind: String(target.kind) } } } };
    provisional = recordDirectorScene(provisional, targetId, context.content                                    , "CONTINUATION");
  }
  if (provisional.run.status === "active") {
    try { provisional = advanceCauses(provisional, causeContent, context.contentVersion, causeContextWithNpcState(provisional, context)); }
    catch { throw new ReducerError("INVALID_OPTION", "cause.invalid"); }
  }
  let causeTrace                            = []; let causeRngDraws             = []; let participantFacts         = []; let participantRngDraws             = [];
  if (provisional.run.status === "active" && provisional.run.events.current === undefined) {
    const selected = selectCauseEcho(provisional, causeContent, context.contentVersion); provisional = selected.state; causeTrace = selected.trace; causeRngDraws = selected.rngDraws;
    const selectedTrace = selected.trace[0];
    if (provisional.run.events.current !== undefined) {
      const selectedCauseId = typeof selectedTrace?.causeId === "string" ? selectedTrace.causeId : undefined;
      const causeActorIds = selectedCauseActorIds(provisional, selectedCauseId);
      provisional = recordDirectorScene(provisional, provisional.run.events.current.eventId, context.content                                    , "P3", { causeId: selectedCauseId, ...(causeActorIds === undefined ? {} : { actorIds: causeActorIds }) });
    }
  }
  if (provisional.run.status === "active" && provisional.run.events.current !== undefined) {
    try { const eventId = provisional.run.events.current.eventId; const materialized = materializeEventParticipants(provisional, context.content                                       , eventId, eventInstanceId(context.commandId, eventId)); provisional = recordEventOccurrence(materialized.state, eventId); participantRngDraws = materialized.rngDraws; participantFacts = materialized.facts.map((fact) => ({ ...fact })); }
    catch { throw new ReducerError("CONTENT_MISMATCH", "content.event_participants_invalid"); }
  }
  const next            = { ...provisional, stateVersion: safeAdd(state.stateVersion, 1) };
  validateStateTransition(state, next);
  const hasSessionState = Object.keys(applied.session.flags).length > 0 || Object.keys(applied.session.counters).length > 0 || applied.session.tags.length > 0;
  const effects                 = [...applied.publicEffects];
  if (hasSessionState) effects.push({ type: "EVENT_SESSION", eventId: current.eventId, session: applied.session });
  return {
    state: next,
    effects,
    narrativeFacts: [{ type: "EVENT_OUTCOME", eventId: current.eventId, choiceId: command.optionId, requestedTier, appliedTier: resolved.appliedTier }, ...npcFacts, ...buildFacts, ...participantFacts],
    trace: { rngDraws: [...rngDraws, ...causeRngDraws, ...participantRngDraws], selector: [{ kind: "check", ...checkFact }, ...causeTrace], time: [{ ...timeAdvance }] }
  };
}

function reduce(input             )               {
  const state = validateGameState(input.state);
  validateContext(state, input.context);
  let command             ;
  try { command = validateGameCommand(input.command); }
  catch (error) {
    if (error instanceof CommandValidationError) throw new ReducerError("INVALID_COMMAND", "command.invalid");
    throw error;
  }
  if (command.type === "CHOOSE_EVENT_OPTION") {
    try { return chooseEventOption(state, command, input.context); }
    catch (error) {
      if (error instanceof ReducerError) throw error;
      if (error instanceof EventRuntimeError) throw new ReducerError(error.kind === "INVALID_OPTION" ? "INVALID_OPTION" : "INVALID_COMMAND", `event.${error.kind.toLowerCase()}`);
      throw error;
    }
  }
  if (command.type === "CHOOSE_ACTION") return chooseAction(state, command, input.context);
  if (command.type === "ATTEMPT_BREAKTHROUGH") return attemptBreakthrough(state, input.context);
  if (command.type !== "START_RUN") throw new ReducerError("INVALID_COMMAND", "command.not_implemented");
  const next = startRun(state, command, input.context);
  assertSafeInteger(next.stateVersion, "stateVersion");
  if (next.stateVersion !== state.stateVersion + 1) throw new ReducerError("TRANSIENT", "state.version_invariant");
  if (next.run.age > next.run.maxAge) throw new ReducerError("TRANSIENT", "state.lifespan_invariant");
  projectRuleState(next);
  return { state: next, effects: [], narrativeFacts: [], trace: { rngDraws: [] } };
}

module.exports = Object.assign({}, {
  ReducerError,
  createOfferedRun,
  resolveTimeAdvance,
  actionTimeCost,
  reduce
});
