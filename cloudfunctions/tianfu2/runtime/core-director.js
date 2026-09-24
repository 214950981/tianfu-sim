// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/director.ts
// Source sha256:   230f6d1e744cc69403c662546c4e5f67e2d098fbed0a694dd698ba24b458849a
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
var { projectDirectorBuildSignals } = require("./core-build.js");
var { isEventEligible } = require("./core-event.js");
var { safeAdd } = require("./core-numeric.js");
var { buildRiskPresentation, threatDefinition } = require("./core-risk.js");
var { drawInt } = require("./core-rng.js");
                                                                                                        

                                
                                                                                                  
                                                                                                                        
 
                                
                                                                                                         
                                                                                                                   
                                                                                                       
                                                                                                              
                                                                                                                          
                                                                                                       
 
                                                                                                                                 
                                                                                                                                                                                           
                                                                                                                                                   
                                                                                                        
                                                                                                      
                                                    
                                                             
                                                                                                       
 
                                        
                                                                                                       
                                                                                                                                 
                                                                                                                 
                                                
 
                                                                                                                 
                                                                                                                                                          
                                                                                                                                                                                   

function eventObject(value         )                { if (typeof value !== "object" || value === null || Array.isArray(value) || typeof (value                           ).id !== "string" || typeof (value                           ).kind !== "string") throw new TypeError("invalid Director EventDefinition"); return value                 ; }
function canonical(values                   )           { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function normalizedDirectorHints(event               , rules               )                                         { const hints = event.directorHints; if (hints === undefined) return { salience: 1, baseWeight: rules.baseWeightDefault, topicTags: [], continuityTags: [], buildAffinityTags: [], npcRoleAffinityTags: [], worldAffinityTags: [] }; return { ...hints, baseWeight: hints.baseWeight ?? rules.baseWeightDefault, topicTags: canonical(hints.topicTags), continuityTags: canonical(hints.continuityTags), buildAffinityTags: canonical(hints.buildAffinityTags), npcRoleAffinityTags: canonical(hints.npcRoleAffinityTags), worldAffinityTags: canonical(hints.worldAffinityTags) }; }

function roleTagsFor(state           , originKind                           )           { const roles           = []; for (const role of Object.keys(state.run.npcs.roleIndex).sort()) if (state.run.npcs.roleIndex[role].some((id) => { const npc = state.run.npcs.byId[id]; return npc?.originKind === originKind && npc.actualStatus === "active" && npc.knowledge.met; })) roles.push(role); return roles; }
function matchingActorIds(state           , roles                   , originKind                            )           { const ids           = []; for (const role of canonical(roles)) { const id = [...(state.run.npcs.roleIndex[role] ?? [])].sort().find((candidate) => { const npc = state.run.npcs.byId[candidate]; return npc !== undefined && npc.actualStatus === "active" && npc.knowledge.met && (originKind === undefined || npc.originKind === originKind); }); if (id !== undefined) ids.push(id); } return canonical(ids); }
// Same-core-NPC consecutive-scene gate (DIRECTOR01). A core NPC that carried the immediately preceding scene
// must not carry this one as well. Only the single most recent record is consulted, so one intervening scene
// with no matching core actor clears the gate on its own - no counter, timer, or state field is needed.
// This reads DirectorSceneRecord.actorIds verbatim and nothing else: no content lookup, no role re-derivation.
// Every recorded scene carries the actors it was actually bound to (the reducer persists the selected Cause's
// actorIdsByRole on P3 records), so the intersection is exact and cannot rebind a same-role sibling.
function coreNpcRepeatGate(state           , coreActorIds                   )          {
  const previous = state.run.director.recentScenes.at(-1); if (previous === undefined) return false;
  return coreActorIds.some((id) => previous.actorIds.includes(id));
}
// P5 contextual pacing gate (DIRECTOR01). Strict P1-P6 precedence is preserved: this only removes P5
// candidates from the eligible set, so the selector can fall through to the P6 ordinary fallback at
// nodes where P4 is also empty. Without it the P5 contextual tier is populated at essentially every
// node (measured 5205/5205), which permanently shadows P6 and makes the ordinary fallback dead.
// The gate counts DirectorSceneRecords, not node distance: a P5 candidate is ineligible while any of
// the last `contextualGapScenes` records was itself a P5 scene. Two later non-P5 scenes therefore
// reopen P5 on their own. It reads only the existing bounded recentScenes ring - no counter, timer,
// or new state field - and consumes no RNG.
function contextualGapGate(state           , rules               )          {
  const window = rules.contextualGapScenes; if (window <= 0) return false;
  return state.run.director.recentScenes.slice(-window).some((scene) => scene.slot === "P5");
}
function riskPreview(state           , event               , content                       , contentVersion        )                                             { const severity = { low: 0, caution: 1, dangerous: 2, lethal: 3 }         ; let result                        = "low"; for (const choice of event.choices ?? []) { if (choice.threatId === undefined) continue; if (content.getRisk === undefined) throw new TypeError("Director risk preview requires locked RiskPack"); const preview = buildRiskPresentation(state, threatDefinition(content.getRisk(contentVersion), choice.threatId)); if (severity[preview.tier] > severity[result]) result = preview.tier; } return result; }
function stageBonus(stage            , rules               )         { return stage === "refined" ? rules.buildRefinedBonus : stage === "formed" ? rules.buildFormedBonus : stage === "emerging" ? rules.buildEmergingBonus : 0; }
function increment(counts                        , reason        )       { counts[reason] = (counts[reason] ?? 0) + 1; }
function recentWithin(state           , nodes        , predicate                                         )          { return state.run.director.recentScenes.some((scene) => state.run.nodeIndex - scene.nodeIndex <= nodes && predicate(scene)); }

function scoreDirectorEvent(state           , eventValue         , action            , content                       , slot                           )                                                                                                                                                                                   {
  const pack = content.getDirector(state.contentVersion); const rules = pack.rules; const event = eventObject(eventValue); const hints = normalizedDirectorHints(event, rules); const riskTier = riskPreview(state, event, content, state.contentVersion);
  if (!isEventEligible(event, state)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "event-ineligible" };
  if (slot === "P2" && !(state.run.director.profileId === "first_run" && state.run.nodeIndex <= rules.firstRunWindowNodes && hints.onboardingEligible === true)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "not-onboarding" };
  const coreActorIds = matchingActorIds(state, hints.npcRoleAffinityTags, "core"); if (slot === "P4" && coreActorIds.length === 0) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "no-core-npc" };
  if (slot === "P4" && coreNpcRepeatGate(state, coreActorIds)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "core-npc-repeat-gate" };
  if (slot === "P5" && contextualGapGate(state, rules)) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "contextual-gap" };
  if ((slot === "P5" || slot === "P6") && hints.salience >= rules.majorSalienceThreshold && recentWithin(state, rules.majorGapNodes, (scene) => scene.salience >= rules.majorSalienceThreshold && scene.slot !== "P3" && scene.slot !== "CONTINUATION")) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "major-gap" };
  if ((slot === "P5" || slot === "P6") && (riskTier === "dangerous" || riskTier === "lethal") && recentWithin(state, rules.randomDangerGapNodes, (scene) => scene.riskTier === "dangerous" || scene.riskTier === "lethal")) return { eligible: false, weight: 0, reasons: [], actorIds: [], buildIds: [], riskTier, exclusionReason: "danger-gap" };
  let weight = hints.baseWeight; const reasons           = [];
  if (event.actionAffinity?.includes(action)) { weight = safeAdd(weight, rules.actionAffinityBonus); reasons.push("action-affinity"); }
  let buildIds           = []; if (hints.buildAffinityTags.length > 0 && content.get(state.contentVersion).buildPackId !== undefined && content.getBuild !== undefined) { const signals = projectDirectorBuildSignals(state, content.getBuild(state.contentVersion)); const matching = signals.builds.filter((build) => build.tags.some((tag) => hints.buildAffinityTags.includes(tag))).sort((left, right) => stageBonus(right.stage, rules) - stageBonus(left.stage, rules) || left.buildId.localeCompare(right.buildId)); if (matching.length > 0) { const strongest = matching[0]; const bonus = stageBonus(strongest.stage, rules); if (bonus > 0) { weight = safeAdd(weight, bonus); reasons.push(`build-${strongest.stage}`); buildIds = [strongest.buildId]; } } }
  if (hints.worldAffinityTags.some((tag) => state.run.world.tags.includes(tag))) { weight = safeAdd(weight, rules.worldAffinityBonus); reasons.push("world-affinity"); }
  const actorIds = matchingActorIds(state, hints.npcRoleAffinityTags); const recentActorIds = new Set(state.run.director.recentScenes.flatMap((scene) => scene.actorIds)); if (actorIds.some((id) => recentActorIds.has(id))) { weight = safeAdd(weight, rules.recentNpcContinuityBonus); reasons.push("npc-continuity"); }
  const recentContinuity = new Set(state.run.director.recentScenes.slice(-rules.continuityWindow).flatMap((scene) => scene.continuityTags)); const overlaps = hints.continuityTags.filter((tag) => recentContinuity.has(tag)); if (overlaps.length > 0) { const bonus = Math.min(rules.continuityBonusCap, overlaps.length * rules.continuityOverlapBonus); weight = safeAdd(weight, bonus); reasons.push(...overlaps.map((tag) => `continuity:${tag}`)); }
  const primaryTopic = hints.topicTags[0]; if (primaryTopic !== undefined && !state.run.director.recentScenes.slice(-rules.noveltyWindow).some((scene) => scene.topicTags.includes(primaryTopic))) { weight = safeAdd(weight, rules.topicNoveltyBonus); reasons.push("topic-novelty"); }
  if (state.run.director.recentScenes.some((scene) => scene.eventId === event.id)) { weight = safeAdd(weight, -rules.exactEventRecentPenalty); reasons.push("event-repeat-penalty"); }
  if (primaryTopic !== undefined) { let repeats = 0; for (const scene of [...state.run.director.recentScenes].reverse()) { if (scene.topicTags[0] !== primaryTopic) break; repeats += 1; } if (repeats > 0) { const penalty = Math.min(rules.consecutiveTopicPenaltyCap, repeats * rules.consecutiveTopicPenalty); weight = safeAdd(weight, -penalty); reasons.push("topic-repeat-penalty"); } }
  return { eligible: weight > 0, weight, reasons, actorIds: slot === "P4" ? coreActorIds : actorIds, buildIds, riskTier, ...(weight > 0 ? {} : { exclusionReason: "nonpositive-weight" }) };
}

function appendScene(state           , event               , content                       , slot              , details                                                                                                             = {})            { const rules = content.getDirector(state.contentVersion).rules; const hints = normalizedDirectorHints(event, rules); const scene                      = { eventId: event.id, nodeIndex: state.run.nodeIndex, slot, salience: hints.salience, topicTags: hints.topicTags, continuityTags: hints.continuityTags, actorIds: canonical(details.actorIds ?? []), buildIds: canonical(details.buildIds ?? []), ...(details.causeId === undefined ? {} : { causeId: details.causeId }), ...(details.riskTier === undefined ? {} : { riskTier: details.riskTier }) }; const recentScenes = [...state.run.director.recentScenes, scene].slice(-rules.recentWindowSize); return { ...state, run: { ...state.run, director: { ...state.run.director, recentScenes } } }; }
function recordDirectorScene(state           , eventId        , content                       , slot              , details                                                                 = {})            { const event = eventObject(content.getEvent(state.contentVersion, eventId)); return appendScene(state, event, content, slot, { ...details, riskTier: riskPreview(state, event, content, state.contentVersion) }); }

function queryForSlot(state           , action            , slot                           , content                       )                           { const buildTags = content.get(state.contentVersion).buildPackId === undefined || content.getBuild === undefined ? [] : canonical(projectDirectorBuildSignals(state, content.getBuild(state.contentVersion)).builds.filter((build) => build.stage !== "latent").flatMap((build) => build.tags)); const coreRoles = roleTagsFor(state, "core"); const generatedRoles = roleTagsFor(state, "generated"); const query                     = slot === "P2" ? { slot: "onboarding" } : slot === "P4" ? { slot: "coreNpc", npcRoleTags: coreRoles } : slot === "P5" ? { slot: "contextual", action, buildTags, worldTags: [...state.run.world.tags], npcRoleTags: generatedRoles } : { slot: "ordinary" }; return content.queryDirectorCandidates(state.contentVersion, query); }

function selectDirectorEvent(state           , action            , content                       , slots                                        )                          {
  const before = state.run.rng.streams.director.drawIndex; const exclusionReasonCounts                         = {}; let lastStats = { indexLookups: 0, candidateIdsVisited: 0, totalEvents: 0 }; let lastCandidateCount = 0;
  for (const slot of slots) {
    if (slot === "P2" && !(state.run.director.profileId === "first_run" && state.run.nodeIndex <= content.getDirector(state.contentVersion).rules.firstRunWindowNodes)) continue;
    const query = queryForSlot(state, action, slot, content); lastStats = query.stats; lastCandidateCount = query.eventIds.length; const candidates                    = [];
    for (const eventId of query.eventIds) { const event = eventObject(content.getEvent(state.contentVersion, eventId)); const scored = scoreDirectorEvent(state, event, action, content, slot); if (!scored.eligible) { increment(exclusionReasonCounts, scored.exclusionReason ?? "ineligible"); continue; } candidates.push({ event, weight: scored.weight, reasons: scored.reasons, actorIds: scored.actorIds, buildIds: scored.buildIds, riskTier: scored.riskTier }); }
    candidates.sort((left, right) => left.event.id.localeCompare(right.event.id)); if (candidates.length === 0) continue;
    let selected = candidates[0]; let rng = state.run.rng; let rngDraws             = []; let logicalRngRequests = 0;
    if (candidates.length >= 2) { let total = 0; for (const candidate of candidates) total = safeAdd(total, candidate.weight); const draw = drawInt(rng, "director", 1, total); rng = draw.state; rngDraws = [...draw.trace]; logicalRngRequests = 1; let cursor = draw.value; for (const candidate of candidates) { cursor -= candidate.weight; if (cursor <= 0) { selected = candidate; break; } } }
    let next            = { ...state, run: { ...state.run, rng, events: { ...state.run.events, current: { eventId: selected.event.id, kind: selected.event.kind } } } }; next = appendScene(next, selected.event, content, slot, { actorIds: selected.actorIds, buildIds: selected.buildIds, riskTier: selected.riskTier });
    return { state: next, rngDraws, trace: { selectedPrecedenceLevel: slot, selectedSlot: slot === "P2" ? "onboarding" : slot === "P4" ? "coreNpc" : slot === "P5" ? "contextual" : "ordinary", selectedEventId: selected.event.id, candidateCount: query.eventIds.length, eligibleCandidateCount: candidates.length, selectedWeight: selected.weight, exclusionReasonCounts, rngDrawIndexBefore: before, rngDrawIndexAfter: rng.streams.director.drawIndex, continuityReasons: selected.reasons, logicalRngRequests, queryStats: query.stats } };
  }
  return { state, rngDraws: [], trace: { candidateCount: lastCandidateCount, eligibleCandidateCount: 0, exclusionReasonCounts, rngDrawIndexBefore: before, rngDrawIndexAfter: before, continuityReasons: [], logicalRngRequests: 0, queryStats: lastStats } };
}

module.exports = Object.assign({}, {
  normalizedDirectorHints,
  scoreDirectorEvent,
  recordDirectorScene,
  selectDirectorEvent
});
