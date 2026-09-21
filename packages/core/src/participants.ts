import type { RngTrace } from "./rng.ts";
import { instantiateCoreNpcDefinition, spawnNpcFromArchetypeDefinition, type NpcArchetypeDefinition, type NpcContentAccess, type NpcDefinition } from "./npc.ts";
import type { GameState } from "./state.ts";

export type EventParticipantRequirement =
  | { slot: string; source: { kind: "core"; npcDefinitionId: string } }
  | { slot: string; source: { kind: "generated"; archetypeId: string } };

export interface ParticipantEventDefinition { id: string; kind: string; participants?: readonly EventParticipantRequirement[] }
export interface ParticipantContentAccess extends NpcContentAccess {
  getEvent(contentVersion: string, eventId: string): ParticipantEventDefinition;
  getNpcDefinition(contentVersion: string, definitionId: string): NpcDefinition;
  getNpcArchetype(contentVersion: string, archetypeId: string): NpcArchetypeDefinition;
}
export interface ParticipantMaterializationResult {
  state: GameState;
  rngDraws: RngTrace[];
  facts: Readonly<Record<string, unknown>>[];
}

function fail(message: string): never { throw new TypeError(message); }
export function eventInstanceId(commandId: string, eventId: string): string {
  if (commandId.length === 0 || eventId.length === 0) fail("event instance identity requires commandId and eventId");
  return `event:${commandId}:${eventId}`;
}

export function materializeEventParticipants(state: GameState, content: ParticipantContentAccess, eventId: string, instanceId: string): ParticipantMaterializationResult {
  const current = state.run.events.current;
  if (current === undefined || current.eventId !== eventId) fail("participant materialization requires the current event");
  if (current.instanceId !== undefined && current.instanceId !== instanceId) fail("event instance identity mismatch");
  if (current.participantBindings !== undefined) {
    if (current.instanceId !== undefined) return { state, rngDraws: [], facts: [] };
    return { state: { ...state, run: { ...state.run, events: { ...state.run.events, current: { ...current, instanceId } } } }, rngDraws: [], facts: [] };
  }
  const event = content.getEvent(state.contentVersion, eventId);
  const requirements = [...(event.participants ?? [])].sort((left, right) => left.slot.localeCompare(right.slot));
  let next = state; const bindings: Record<string, string> = {}; const rngDraws: RngTrace[] = []; const facts: Readonly<Record<string, unknown>>[] = [];
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

export function currentParticipantBindings(state: GameState, supplied?: Readonly<Record<string, string>>): Readonly<Record<string, string>> | undefined {
  const participants = state.run.events.current?.participantBindings;
  if (participants === undefined) return supplied;
  return { ...(supplied ?? {}), ...participants };
}
