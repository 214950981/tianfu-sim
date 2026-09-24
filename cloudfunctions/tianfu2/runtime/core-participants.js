// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/participants.ts
// Source sha256:   affe7c956b5b083e0100d1cd8c2ae86dc80345eb0e3bfe83db10e11b185586bb
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
                                         
var { instantiateCoreNpcDefinition, spawnNpcFromArchetypeDefinition } = require("./core-npc.js");
                                            

                                         
                                                                       
                                                                         

                                                                                                                               
                                                                    
                                                                                
                                                                                
                                                                                       
 
                                                   
                   
                       
                                             
 

function fail(message        )        { throw new TypeError(message); }
function eventInstanceId(commandId        , eventId        )         {
  if (commandId.length === 0 || eventId.length === 0) fail("event instance identity requires commandId and eventId");
  return `event:${commandId}:${eventId}`;
}

function materializeEventParticipants(state           , content                          , eventId        , instanceId        )                                   {
  const current = state.run.events.current;
  if (current === undefined || current.eventId !== eventId) fail("participant materialization requires the current event");
  if (current.instanceId !== undefined && current.instanceId !== instanceId) fail("event instance identity mismatch");
  if (current.participantBindings !== undefined) {
    if (current.instanceId !== undefined) return { state, rngDraws: [], facts: [] };
    return { state: { ...state, run: { ...state.run, events: { ...state.run.events, current: { ...current, instanceId } } } }, rngDraws: [], facts: [] };
  }
  const event = content.getEvent(state.contentVersion, eventId);
  const requirements = [...(event.participants ?? [])].sort((left, right) => left.slot.localeCompare(right.slot));
  let next = state; const bindings                         = {}; const rngDraws             = []; const facts                                      = [];
  for (const requirement of requirements) {
    if (bindings[requirement.slot] !== undefined) fail(`duplicate participant slot ${requirement.slot}`);
    if (requirement.source.kind === "core") {
      const definition = content.getNpcDefinition(state.contentVersion, requirement.source.npcDefinitionId);
      const result = instantiateCoreNpcDefinition(next, definition, instanceId); next = result.state; bindings[requirement.slot] = result.npc.npcId; facts.push(...result.facts);
    } else {
      const pack = content.getNpc(state.contentVersion); const archetype = content.getNpcArchetype(state.contentVersion, requirement.source.archetypeId);
      const result = spawnNpcFromArchetypeDefinition(next, pack, archetype, { sourceRef: instanceId }); next = result.state; bindings[requirement.slot] = result.npc.npcId; rngDraws.push(...result.rngDraws); facts.push(...result.facts);
    }
  }
  next = { ...next, run: { ...next.run, events: { ...next.run.events, current: { ...current, instanceId, participantBindings: bindings } } } };
  return { state: next, rngDraws, facts };
}

function currentParticipantBindings(state           , supplied                                   )                                               {
  const participants = state.run.events.current?.participantBindings;
  if (participants === undefined) return supplied;
  return { ...(supplied ?? {}), ...participants };
}

module.exports = Object.assign({}, {
  eventInstanceId,
  materializeEventParticipants,
  currentParticipantBindings
});
