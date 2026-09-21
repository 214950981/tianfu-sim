import { buildStage, createOfferedRun, reduce, type ActionType, type GameState } from "../../core/src/index.ts";
import { BUILD_V1 } from "./build-v1.ts";
import { CONTENT01_PACK, CONTENT01_VERSION } from "./content01-v1.ts";
import { NPC_CONTENT01_V1 } from "./npc-content01-v1.ts";
import { ContentRegistry, type ChoiceDefinition, type EventDefinition } from "./registry.ts";

export const CONTENT_SIM_POLICIES = ["cautious", "aggressive", "sword_seeking", "body_seeking", "alchemy_seeking", "fortune_seeking"] as const;
export type ContentSimPolicy = typeof CONTENT_SIM_POLICIES[number];
export interface ContentSimulationOptions { runsPerPolicy?: number; horizon?: number }
export interface ContentSimulationReport {
  runs: number; runtimeFailures: number; deadlocks: number; nodesMin: number; nodesMedian: number; nodesMax: number;
  deaths: number; lifespanDeaths: number; riskDeaths: number; realmDistribution: Record<string, number>;
  formedBuildDistribution: Record<string, number>; refinedBuildDistribution: Record<string, number>; coreNpcEncounterDistribution: Record<string, number>;
  promotedGeneratedNpcCount: number; causeOriginCount: number; causeEchoCount: number; causeResolvedCount: number; causeExpiredCount: number;
  uniqueEventsSeen: number; eventSelectionFrequency: Record<string, number>; top10EventFrequency: Array<{ eventId: string; count: number }>;
  first5NodeSequenceDiversity: number; dominantBuildDistribution: Record<string, number>; npcEncounterDiversity: number; repeatViolations: number; AIcalls: 0;
}

function registry(): ContentRegistry { const content = new ContentRegistry(); content.registerNpcPack(NPC_CONTENT01_V1); content.register(CONTENT01_PACK); return content; }
const profiles = [
  { spiritualRoot: "root.heavenly", talentIds: ["talent.cultivation.01"], majorDestinyId: "destiny.major.breakthrough.01" },
  { spiritualRoot: "root.dual", talentIds: ["talent.cultivation.02"], majorDestinyId: "destiny.major.breakthrough.02" },
  { spiritualRoot: "root.triple", talentIds: ["talent.cultivation.03"], majorDestinyId: "destiny.major.breakthrough.03" }
];
function initial(content: ContentRegistry, policy: ContentSimPolicy, seed: number): GameState {
  const offers = profiles.map((profile, index) => ({ selectionId: `selection:${index}`, profile })) as [{ selectionId: string; profile: typeof profiles[number] }, { selectionId: string; profile: typeof profiles[number] }, { selectionId: string; profile: typeof profiles[number] }];
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: CONTENT01_VERSION, runId: `sim:${policy}:${seed}`, playerId: "player:content-sim", rootSeed: `content01:${policy}:${seed}`, metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: `offer:${policy}:${seed}`, destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"], innateProfiles: offers, age: 20, maxAge: 80, runName: "观世", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} }, firstRun: true } });
  const selectionId = offers[seed % offers.length].selectionId;
  return reduce({ state: offered, command: { type: "START_RUN", offerId: offered.run.offer!.offerId, selectionId }, context: { rulesVersion: offered.rulesVersion, contentVersion: offered.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: `sim:${policy}:${seed}:start` } }).state;
}
function action(policy: ContentSimPolicy, step: number): ActionType {
  const values: Record<ContentSimPolicy, ActionType[]> = { cautious: ["cultivate", "worldly"], aggressive: ["travel", "pursuit"], sword_seeking: ["cultivate", "travel"], body_seeking: ["cultivate", "travel"], alchemy_seeking: ["cultivate", "worldly"], fortune_seeking: ["pursuit", "travel"] };
  const actions = values[policy]; return actions[step % actions.length];
}
function desiredBuild(policy: ContentSimPolicy): string | undefined { return policy.endsWith("_seeking") ? policy.slice(0, -"_seeking".length) : undefined; }
function choose(policy: ContentSimPolicy, event: EventDefinition): ChoiceDefinition {
  const choices = event.choices ?? []; const find = (id: string) => choices.find((choice) => choice.id === id);
  if (choices.length === 0) throw new TypeError(`event has no choices: ${event.id}`);
  if (choices.some((choice) => choice.threatId !== undefined)) return (policy === "aggressive" ? find("take-risk") : find("turn-away")) ?? choices[0];
  if (choices.some((choice) => choice.id.startsWith("bind-"))) return policy === "cautious" ? find("decline") ?? choices[0] : choices[0];
  const target = desiredBuild(policy); if (target !== undefined && event.directorHints?.buildAffinityTags.includes(target)) return find("engage") ?? choices[0];
  return policy === "cautious" ? find("consider") ?? choices[0] : find("engage") ?? choices[0];
}
function increment(target: Record<string, number>, key: string): void { target[key] = (target[key] ?? 0) + 1; }
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }

export function runContentSimulation(options: ContentSimulationOptions = {}): ContentSimulationReport {
  const runsPerPolicy = options.runsPerPolicy ?? 100; const horizon = options.horizon ?? 40; const content = registry();
  let runtimeFailures = 0; let deadlocks = 0; let deaths = 0; let lifespanDeaths = 0; let riskDeaths = 0; let promotedGeneratedNpcCount = 0; let causeOriginCount = 0; let causeEchoCount = 0; let causeResolvedCount = 0; let causeExpiredCount = 0;
  const nodes: number[] = []; const realmDistribution: Record<string, number> = {}; const formedBuildDistribution: Record<string, number> = {}; const refinedBuildDistribution: Record<string, number> = {}; const coreNpcEncounterDistribution: Record<string, number> = {}; const eventSelectionFrequency: Record<string, number> = {}; const dominantBuildDistribution: Record<string, number> = {}; const firstSequences = new Set<string>(); const npcIds = new Set<string>();
  for (const policy of CONTENT_SIM_POLICIES) for (let seed = 0; seed < runsPerPolicy; seed += 1) {
    let state = initial(content, policy, seed); let step = 0; const sequence: string[] = [];
    try {
      while (state.run.status === "active" && state.run.nodeIndex < horizon) {
        const beforeVersion = state.stateVersion;
        if (state.run.events.current !== undefined) {
          const event = content.getEvent(state.contentVersion, state.run.events.current.eventId); if (sequence.at(-1) !== event.id) sequence.push(event.id);
          const selected = choose(policy, event); state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: event.id, optionId: selected.id }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: `sim:${policy}:${seed}:${step}:choice` } }).state;
        } else if (state.run.realm.cultivationBps === 10_000 && content.getProgression(state.contentVersion).realms.some((realm) => realm.id === state.run.realm.id && realm.nextRealmId !== undefined)) {
          state = reduce({ state, command: { type: "ATTEMPT_BREAKTHROUGH" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: `sim:${policy}:${seed}:${step}:breakthrough` } }).state;
        } else {
          state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: action(policy, step) }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: `sim:${policy}:${seed}:${step}:action` } }).state;
          if (state.run.events.current !== undefined) sequence.push(state.run.events.current.eventId);
        }
        if (state.stateVersion <= beforeVersion) { deadlocks += 1; break; } step += 1;
      }
    } catch { runtimeFailures += 1; }
    nodes.push(state.run.nodeIndex); increment(realmDistribution, state.run.realm.id);
    if (state.run.status === "dying" || state.run.status === "ended") { deaths += 1; if (state.run.deathRecord?.category === "lifespan") lifespanDeaths += 1; else riskDeaths += 1; }
    for (const affinity of Object.values(state.run.build.affinities ?? {})) { const stage = buildStage(BUILD_V1.rules, affinity.affinityBps); if (stage === "formed" || stage === "refined") increment(formedBuildDistribution, affinity.buildId); if (stage === "refined") increment(refinedBuildDistribution, affinity.buildId); }
    if (state.run.build.dominantBuildId !== undefined) increment(dominantBuildDistribution, state.run.build.dominantBuildId);
    for (const npc of Object.values(state.run.npcs.byId)) { npcIds.add(npc.npcId); if (npc.definitionId !== undefined) increment(coreNpcEncounterDistribution, npc.definitionId); if (npc.originKind === "generated" && npc.promotedToA) promotedGeneratedNpcCount += 1; }
    const causes = Object.values(state.run.causes.byId); causeOriginCount += causes.length; causeEchoCount += causes.reduce((sum, cause) => sum + cause.echoCount, 0); causeResolvedCount += causes.filter((cause) => cause.state === "resolved").length; causeExpiredCount += causes.filter((cause) => cause.state === "expired").length;
    for (const entry of state.run.events.history) increment(eventSelectionFrequency, entry.eventId); if (state.run.events.current !== undefined) increment(eventSelectionFrequency, state.run.events.current.eventId);
    firstSequences.add(sequence.slice(0, 5).join("|"));
  }
  const top10EventFrequency = Object.entries(eventSelectionFrequency).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 10).map(([eventId, count]) => ({ eventId, count }));
  const linked = new Set(CONTENT01_PACK.causeTemplates.flatMap((template) => template.linkedEventIds)); const ordinaryIds = new Set(CONTENT01_PACK.events.filter((event) => event.tags.includes("ordinary") && !linked.has(event.id)).map((event) => event.id)); const ordinaryTotal = Object.entries(eventSelectionFrequency).filter(([id]) => ordinaryIds.has(id)).reduce((sum, [, count]) => sum + count, 0); const repeatViolations = ordinaryTotal === 0 ? 0 : Object.entries(eventSelectionFrequency).filter(([id, count]) => ordinaryIds.has(id) && count * 100 > ordinaryTotal * 35).length;
  return { runs: CONTENT_SIM_POLICIES.length * runsPerPolicy, runtimeFailures, deadlocks, nodesMin: Math.min(...nodes), nodesMedian: median(nodes), nodesMax: Math.max(...nodes), deaths, lifespanDeaths, riskDeaths, realmDistribution, formedBuildDistribution, refinedBuildDistribution, coreNpcEncounterDistribution, promotedGeneratedNpcCount, causeOriginCount, causeEchoCount, causeResolvedCount, causeExpiredCount, uniqueEventsSeen: Object.keys(eventSelectionFrequency).length, eventSelectionFrequency, top10EventFrequency, first5NodeSequenceDiversity: firstSequences.size, dominantBuildDistribution, npcEncounterDiversity: npcIds.size, repeatViolations, AIcalls: 0 };
}
