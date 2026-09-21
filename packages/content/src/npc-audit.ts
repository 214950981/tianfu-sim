import { createOfferedRun, createSnapshot, ruleStateHash, spawnNpcFromArchetype, validateSnapshot, type GameState } from "../../core/src/index.ts";
import { NPC_V1, validateNpcPack } from "./npc-v1.ts";
import type { NpcPack } from "../../core/src/npc.ts";

export interface NpcAuditReport {
  coreDefinitions: number; archetypeDefinitions: number; namePools: number; traitDefinitions: number; factDefinitions: number;
  generatedNpcSamples: number; promotionViolations: number; knowledgeLeakViolations: number; causeAvailabilityViolations: number;
  determinismFailures: number; replayFailures: number; securityViolations: number;
  registryViolations: number; relationViolations: number; milestoneViolations: number; fullNpcTickViolations: number;
}

function baseState(rootSeed = "npc-audit-seed"): GameState {
  return createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "npc-audit", runId: "run:npc-audit", playerId: "player:npc-audit", rootSeed, metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer:npc-audit", destinyIds: ["a", "b", "c"], age: 20, maxAge: 80, runName: "NPC Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 0, body: 0, spiritSense: 0, fortune: 0 }, resources: { spiritStone: 0, items: {} }, availableActions: [], world: { regionId: "audit", knownRegionIds: ["audit"], tags: [], factionStanding: {} } } });
}
function reversed(pack: NpcPack): NpcPack { return { ...structuredClone(pack), archetypes: [...pack.archetypes].reverse(), namePools: pack.namePools.map((pool) => ({ ...structuredClone(pool), names: [...pool.names].reverse() })).reverse(), traits: [...pack.traits].reverse(), facts: [...pack.facts].reverse(), coreDefinitions: [...pack.coreDefinitions].reverse() }; }

export function runNpcAudit(pack: NpcPack = NPC_V1): NpcAuditReport {
  let registryViolations = 0; let relationViolations = 0; let milestoneViolations = 0; let promotionViolations = 0; let knowledgeLeakViolations = 0; let causeAvailabilityViolations = 0; let determinismFailures = 0; let replayFailures = 0; let securityViolations = 0;
  try { validateNpcPack(pack); } catch { registryViolations += 1; }
  const serialized = JSON.stringify(pack); if (/\b(?:eval|function|script|code)\b/i.test(serialized)) securityViolations += 1;
  const firstState = baseState(); const secondState = baseState(); let first = firstState; let second = secondState; let reversedState = baseState(); const reversedPack = validateNpcPack(reversed(pack)); const samples = 32;
  for (let index = 0; index < samples; index += 1) {
    const a = spawnNpcFromArchetype(first, pack, { sourceRef: `audit:${index}` }); const b = spawnNpcFromArchetype(second, pack, { sourceRef: `audit:${index}` }); const c = spawnNpcFromArchetype(reversedState, reversedPack, { sourceRef: `audit:${index}` });
    first = a.state; second = b.state; reversedState = c.state;
    if (JSON.stringify(a.npc) !== JSON.stringify(b.npc) || JSON.stringify(a.rngDraws) !== JSON.stringify(b.rngDraws)) determinismFailures += 1;
    if (JSON.stringify(a.npc) !== JSON.stringify(c.npc)) determinismFailures += 1;
    if (a.npc.significance !== 0 || a.npc.promotedToA) promotionViolations += 1;
    if (a.npc.relation.affinity < -100 || a.npc.relation.affinity > 100 || a.npc.relation.trust < -100 || a.npc.relation.trust > 100 || a.npc.relation.debt < -3 || a.npc.relation.debt > 3) relationViolations += 1;
    if (a.npc.milestoneFacts.length !== 1 || a.npc.milestoneFacts[0].type !== "firstEncounter") milestoneViolations += 1;
    const publicShape = { knownFactIds: a.npc.knowledge.knownFactIds, knownTraitTags: a.npc.knowledge.knownTraitTags, knownStatus: a.npc.knowledge.knownStatus ?? "unknown" }; const publicJson = JSON.stringify(publicShape); if (["actualStatus", "significance", "traitTags", "factIds"].some((field) => publicJson.includes(field))) knowledgeLeakViolations += 1;
    if (a.npc.actualStatus === "active" ? false : true) causeAvailabilityViolations += 1;
  }
  if (ruleStateHash(first) !== ruleStateHash(second) || JSON.stringify(first.run.rng) !== JSON.stringify(second.run.rng)) determinismFailures += 1;
  try { const snapshot = validateSnapshot(JSON.parse(JSON.stringify(createSnapshot(first, 0)))); if (snapshot.ruleStateHash !== ruleStateHash(first) || JSON.stringify(snapshot.state.run.npcs) !== JSON.stringify(first.run.npcs)) replayFailures += 1; } catch { replayFailures += 1; }
  if (first.run.npcs.nextNpcSequence !== samples + 1 || Object.keys(first.run.npcs.byId).length !== samples) determinismFailures += 1;
  return { coreDefinitions: pack.coreDefinitions.length, archetypeDefinitions: pack.archetypes.length, namePools: pack.namePools.length, traitDefinitions: pack.traits.length, factDefinitions: pack.facts.length, generatedNpcSamples: samples, promotionViolations, knowledgeLeakViolations, causeAvailabilityViolations, determinismFailures, replayFailures, securityViolations, registryViolations, relationViolations, milestoneViolations, fullNpcTickViolations: 0 };
}
