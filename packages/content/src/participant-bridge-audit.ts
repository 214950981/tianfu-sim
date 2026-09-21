import { createOfferedRun, materializeEventParticipants, reduce, ruleStateHash, selectDirectorEvent, validateGameState, type GameState } from "../../core/src/index.ts";
import { ServerViewModelBuilder } from "../../../server/src/viewmodel.ts";
import { ContentRegistry, sealContentPack, validateContentPack, type ContentPack } from "./registry.ts";

export interface ParticipantBridgeAuditReport {
  eventDefinitions: number;
  participantDeclarations: number;
  duplicateParticipantBindings: number;
  orphanParticipantBindings: number;
  invalidNpcReferences: number;
  duplicateCoreInstances: number;
  materializationRngDrift: number;
  causeActorBindingFailures: number;
  knowledgeLeakViolations: number;
  directorSideEffectViolations: number;
}

function auditPack(source: ContentPack): ContentPack {
  const copy = structuredClone(source); const { checksum: _checksum, ...manifest } = copy.manifest;
  copy.events[0].participants = [
    { slot: "eventTarget", source: { kind: "core", npcDefinitionId: "dev.mysterious-mentor" } },
    { slot: "witness", source: { kind: "generated", archetypeId: "npc.archetype.wanderer" } }
  ];
  return sealContentPack({ ...copy, manifest: { ...manifest, contentVersion: `${manifest.contentVersion}-bridge-audit` } });
}

function active(content: ContentRegistry, contentVersion: string): GameState {
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: "run:bridge-audit", playerId: "player:bridge-audit", rootSeed: "bridge-audit-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer:bridge-audit", destinyIds: ["destiny.steady-foundation", "destiny.volatile-star", "destiny.hidden-mentor"], age: 20, maxAge: 100, runName: "Bridge Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }, firstRun: true } });
  return reduce({ state: offered, command: { type: "START_RUN", offerId: "offer:bridge-audit", destinyId: "destiny.steady-foundation" }, context: { rulesVersion: "2.0.0", contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: "cmd:bridge-audit:start" } }).state;
}

export function runParticipantBridgeAudit(source: ContentPack): ParticipantBridgeAuditReport {
  const pack = auditPack(source); let invalidNpcReferences = 0; let materializationRngDrift = 0; let causeActorBindingFailures = 0; let knowledgeLeakViolations = 0; let directorSideEffectViolations = 0; let orphanParticipantBindings = 0;
  try { validateContentPack(pack); } catch { invalidNpcReferences += 1; }
  const content = new ContentRegistry(); content.register(pack); const initial = active(content, pack.manifest.contentVersion);
  const selected = selectDirectorEvent(initial, "travel", content, ["P2", "P4", "P5", "P6"]); if (Object.keys(selected.state.run.npcs.byId).length !== 0) directorSideEffectViolations += 1;
  const eventId = selected.state.run.events.current?.eventId ?? pack.events[0].id; const selectedState = selected.state.run.events.current === undefined ? { ...selected.state, run: { ...selected.state.run, events: { ...selected.state.run.events, current: { eventId, kind: pack.events[0].kind } } } } : selected.state;
  const first = materializeEventParticipants(selectedState, content, eventId, `event:audit:${eventId}`); const second = materializeEventParticipants(selectedState, content, eventId, `event:audit:${eventId}`);
  if (ruleStateHash(first.state) !== ruleStateHash(second.state) || JSON.stringify(first.rngDraws) !== JSON.stringify(second.rngDraws)) materializationRngDrift += 1;
  try { validateGameState(first.state); } catch { orphanParticipantBindings += 1; }
  const coreIds = Object.values(first.state.run.npcs.byId).filter((npc) => npc.definitionId === "dev.mysterious-mentor").map((npc) => npc.npcId); const duplicateCoreInstances = Math.max(0, coreIds.length - 1);
  const choiceState = first.state.run.events.current?.eventId === pack.events[0].id ? first.state : { ...first.state, run: { ...first.state.run, events: { ...first.state.run.events, current: { eventId: pack.events[0].id, kind: pack.events[0].kind, instanceId: "event:audit:choice", participantBindings: first.state.run.events.current?.participantBindings } } } };
  try { const chosen = reduce({ state: choiceState, command: { type: "CHOOSE_EVENT_OPTION", eventId: pack.events[0].id, optionId: "rescue-stranger" }, context: { rulesVersion: choiceState.rulesVersion, contentVersion: choiceState.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: "cmd:bridge-audit:choice" } }).state; const cause = Object.values(chosen.run.causes.byId)[0]; if (cause?.actorIdsByRole.rescuedNpc !== choiceState.run.events.current?.participantBindings?.eventTarget) causeActorBindingFailures += 1; } catch { causeActorBindingFailures += 1; }
  const view = JSON.stringify(new ServerViewModelBuilder(content).build(first.state)); for (const secret of ["participantBindings", "actualStatus", "significance", "traitTags", "factIds", "rootSeed", "drawIndex"]) if (view.includes(`\"${secret}\"`)) knowledgeLeakViolations += 1;
  const slots = pack.events.flatMap((event) => event.participants?.map((participant) => `${event.id}:${participant.slot}`) ?? []); const duplicateParticipantBindings = slots.length - new Set(slots).size;
  return { eventDefinitions: pack.events.length, participantDeclarations: slots.length, duplicateParticipantBindings, orphanParticipantBindings, invalidNpcReferences, duplicateCoreInstances, materializationRngDrift, causeActorBindingFailures, knowledgeLeakViolations, directorSideEffectViolations };
}
