// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/cause.ts
// Source sha256:   d21902f289071bce6f3b84819b26cfc7577beda8d0a178a1ec122e2d65a4413a
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
var { evaluateCondition, isEventEligible } = require("./core-event.js");
var { safeAdd } = require("./core-numeric.js");
var { causeActorAvailability } = require("./core-npc.js");
var { drawInt } = require("./core-rng.js");
                                                           

                                                                          
                                
                                          
                                                                                         
                                                                              
                                                                                                    
 
                                      
                    
                                                   
                                                                          
                             
 
                                     
                                                                              
                                                             
 
                                                                                                                 

function invalid(message        )        { throw new Error(`CAUSE_INVALID:${message}`); }
function object(value         )                          { if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("effect must be object"); return value                           ; }
function causeId(commandId        , templateId        , ordinal        )         { return `cause:${commandId}:${ordinal}:${templateId}`; }
function defaultEchoBudget(salience        )         { return salience === 1 ? 0 : salience <= 3 ? 1 : salience === 4 ? 2 : salience === 5 ? 3 : invalid("salience"); }

// The triggering-Cause reference is only meaningful when the authoritative current scene was produced by a P3
// Cause echo. That provenance is exactly the persisted events.current.triggeringCauseId, which is observable
// and hashable. The runtime Cause context is not authoritative for this question: a caller can supply one
// directly, so accepting it here would let an untriggered scene resolve an arbitrary Cause and would turn a
// cross-scene bug into a silent success. Outside a Cause-triggered scene the reference fails closed.
function boundTriggeringCauseId(state           )                     { return state.run.events.current?.triggeringCauseId; }

function causeResolutionTarget(effect                         , state           )         {
  if (effect.triggeringCause === true) {
    const bound = boundTriggeringCauseId(state);
    if (bound === undefined) invalid("triggering cause reference outside a Cause-triggered scene");
    return bound;
  }
  return String(effect.causeId);
}

function assertCauseResolvable(state           , id        )       {
  const cause = state.run.causes.byId[id];
  if (cause === undefined || cause.state === "resolved" || cause.state === "expired") invalid("cause is missing or terminal");
}

function bindActors(template               , actorBindingKeys         , context                     )                         {
  const keys = actorBindingKeys === undefined ? {} : object(actorBindingKeys);
  const roles = new Map(template.actors.map((actor) => [actor.role, actor]));
  for (const role of Object.keys(keys)) if (!roles.has(role)) invalid(`unknown actor role ${role}`);
  const bound                         = {};
  for (const actor of template.actors) {
    const slot = keys[actor.role];
    if (slot !== undefined && typeof slot !== "string") invalid(`binding slot for ${actor.role}`);
    const actorId = typeof slot === "string" ? context.actorBindings?.[slot] : undefined;
    if (actor.required && (typeof actorId !== "string" || actorId.length === 0)) invalid(`required actor role ${actor.role}`);
    if (typeof actorId === "string" && actorId.length > 0) bound[actor.role] = actorId;
  }
  return bound;
}

function createCause(state           , effect                         , template               , context                     , ordinal        , inherited                         )                {
  if (effect.salience !== template.salience) invalid("salience must match template");
  const actorIdsByRole = inherited ?? bindActors(template, effect.actorBindingKeys, context);
  for (const actor of template.actors) if (actor.required && !actorIdsByRole[actor.role]) invalid(`required actor role ${actor.role}`);
  const id = causeId(context.commandId, template.id, ordinal);
  if (state.run.causes.byId[id] !== undefined) invalid("duplicate cause id");
  return {
    causeId: id, templateId: template.id, originCommandId: context.commandId, originNodeIndex: state.run.nodeIndex, originAge: state.run.age,
    actorIdsByRole: { ...actorIdsByRole }, themes: [...template.themes], salience: template.salience,
    visibility: (effect.visibility ?? "hidden")                               , state: "dormant",
    maturity: { minNode: safeAdd(state.run.nodeIndex, template.maturity.minNodeDelta ?? 0), minAge: safeAdd(state.run.age, template.maturity.minAgeDeltaYears ?? 0), conditions: [...(template.maturity.conditions ?? [])] },
    echoBudget: defaultEchoBudget(template.salience), echoCount: 0, facts: {}, linkedEventIds: [...template.linkedEventIds]
  };
}

function validateCauseChoice(value         , state           , content                    , contentVersion        , context                     )       {
  const choice = object(value); const outcomes = object(choice.outcomes);
  for (const tier of ["greatSuccess", "success", "costlySuccess", "failure"]) {
    if (outcomes[tier] === undefined) continue;
    const effects = object(outcomes[tier]).effects;
    if (!Array.isArray(effects)) invalid("effects");
    effects.forEach((raw, ordinal) => {
      const effect = object(raw);
      if (effect.op === "ADD_CAUSE") { const template = content.getCauseTemplate(contentVersion, String(effect.templateId)); createCause(state, effect, template, context, ordinal); }
      if (effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE") assertCauseResolvable(state, causeResolutionTarget(effect, state));
    });
  }
}

function applyCauseEffects(state           , effects                    , content                    , contentVersion        , context                     )            {
  let next = state;
  effects.forEach((raw, ordinal) => {
    const effect = object(raw);
    if (effect.op === "ADD_CAUSE") {
      const template = content.getCauseTemplate(contentVersion, String(effect.templateId)); const cause = createCause(next, effect, template, context, ordinal);
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [cause.causeId]: cause } } } };
    } else if (effect.op === "RESOLVE_CAUSE" || effect.op === "EXPIRE_CAUSE") {
      const id = causeResolutionTarget(effect, next); assertCauseResolvable(next, id);
      const current = next.run.causes.byId[id];
      const updated                = { ...current, state: effect.op === "RESOLVE_CAUSE" ? "resolved" : "expired", resolution: { commandId: context.commandId, action: effect.op } };
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: updated } } } };
    }
  });
  return next;
}

function advanceCauses(state           , content                    , contentVersion        , context                     )            {
  let next = state; let transformOrdinal = 10_000;
  for (const id of Object.keys(next.run.causes.byId).sort()) {
    const current = next.run.causes.byId[id]; if (current.state === "resolved" || current.state === "expired") continue;
    const template = content.getCauseTemplate(contentVersion, current.templateId);
    const unavailable = template.actors.some((actor) => actor.required && context.actorStatusById?.[current.actorIdsByRole[actor.role]] === "unavailable");
    if (unavailable) {
      if (template.onActorUnavailable.action === "expire") {
        const expired                = { ...current, state: "expired", resolution: { commandId: context.commandId, action: "actorUnavailable" } };
        next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: expired } } } };
      } else {
        const target = content.getCauseTemplate(contentVersion, template.onActorUnavailable.targetCauseTemplateId);
        const inherited                         = {}; for (const actor of target.actors) if (current.actorIdsByRole[actor.role]) inherited[actor.role] = current.actorIdsByRole[actor.role];
        const replacement = createCause(next, { salience: target.salience, visibility: current.visibility }, target, context, transformOrdinal++, inherited);
        const resolved                = { ...current, state: "resolved", resolution: { commandId: context.commandId, action: "transform", targetCauseId: replacement.causeId } };
        next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: resolved, [replacement.causeId]: replacement } } } };
      }
      continue;
    }
    if ((current.state === "dormant" || (current.state === "echoed" && current.echoBudget > 0)) && next.run.nodeIndex >= current.maturity.minNode && next.run.age >= current.maturity.minAge && current.maturity.conditions.every((condition) => evaluateCondition(condition, next))) {
      const eligible                = { ...current, state: "eligible", eligibleSinceNode: current.eligibleSinceNode ?? next.run.nodeIndex, eligibleAge: current.eligibleAge ?? next.run.age };
      next = { ...next, run: { ...next.run, causes: { byId: { ...next.run.causes.byId, [id]: eligible } } } };
    }
  }
  return next;
}

function selectCauseEcho(state           , content                    , contentVersion        , context                      )                      {
  const candidates = Object.values(state.run.causes.byId).filter((cause) => cause.state === "eligible" && cause.echoBudget > 0).sort((left, right) =>
    right.salience - left.salience || (left.eligibleSinceNode ?? 0) - (right.eligibleSinceNode ?? 0) || (left.eligibleAge ?? 0) - (right.eligibleAge ?? 0) || left.causeId.localeCompare(right.causeId));
  const selected = candidates[0]; if (selected === undefined) return { state, rngDraws: [], trace: [] };
  const eventIds = [...selected.linkedEventIds].sort().filter((eventId) => isEventEligible(content.getEvent(contentVersion, eventId), echoEligibilityState(state, selected, context)));
  if (eventIds.length === 0) return { state, rngDraws: [], trace: [{ tier: "P3", causeId: selected.causeId, result: "no-linked-event" }] };
  let eventId = eventIds[0]; let rng = state.run.rng; let rngDraws             = [];
  if (eventIds.length >= 2) { const draw = drawInt(rng, "event", 0, eventIds.length - 1); rng = draw.state; eventId = eventIds[draw.value]; rngDraws = [...draw.trace]; }
  const echoed                = { ...selected, state: "echoed", echoBudget: selected.echoBudget - 1, echoCount: selected.echoCount + 1 };
  const event = content.getEvent(contentVersion, eventId)                           ;
  // The exact selected Cause is bound onto the authoritative current scene. This is what makes a
  // triggeringCause closure reference resolvable to this instance and no other, with no lookup afterwards.
  const next            = { ...state, run: { ...state.run, rng, causes: { byId: { ...state.run.causes.byId, [selected.causeId]: echoed } }, events: { ...state.run.events, current: { eventId, kind: String(event.kind), triggeringCauseId: selected.causeId } } } };
  return { state: next, rngDraws, trace: [{ tier: "P3", causeId: selected.causeId, priority: [selected.salience, selected.eligibleSinceNode, selected.eligibleAge, selected.causeId], candidates: eventIds, eventId, logicalRequests: eventIds.length >= 2 ? 1 : 0 }] };
}

// A P3 echo is the only place a Cause binding becomes authoritative, so Linked-Event eligibility must be
// judged with exactly the visible actor bindings that echo would persist: the bound cause actors override
// context slots, and Cause-owned actor availability is authoritative over stale context status. The echoed
// binding becomes the authoritative current-scene participantBindings during materialization, so a Linked
// Event whose actor requirement is satisfied only by this Cause is still a legal P3 candidate.
function echoEligibilityState(state           , cause               , context                      )            {
  if (context === undefined) return state;
  const current = state.run.events.current;
  if (current === undefined || current.participantBindings === undefined) return state;
  const merged                         = { ...cause.actorIdsByRole };
  for (const [slot, npcId] of Object.entries(current.participantBindings)) if (merged[slot] === undefined) merged[slot] = npcId;
  return { ...state, run: { ...state.run, events: { ...state.run.events, current: { ...current, participantBindings: merged } } } };
}

module.exports = Object.assign({}, {
  defaultEchoBudget,
  boundTriggeringCauseId,
  validateCauseChoice,
  applyCauseEffects,
  advanceCauses,
  selectCauseEcho
});
