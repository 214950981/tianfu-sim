import type { NpcPack } from "../../core/src/npc.ts";
import { ContentRegistry, validateContentPack, type ContentPack, type EffectSpec } from "./registry.ts";
import { CONTENT01_CAUSE_CHAINS, CONTENT01_ZH_CN } from "./content01-v1.ts";
import { NPC_CONTENT01_V1 } from "./npc-content01-v1.ts";

export interface ContentPlayabilityAuditReport {
  packVersion: string; eventCount: number; onboardingCount: number; ordinaryFallbackCount: number;
  eventsByAction: Record<string, number>; eventsByBuild: Record<string, number>; eventsByNpc: Record<string, number>; eventsByRisk: Record<string, number>; eventsBySalience: Record<string, number>;
  coreNpcCount: number; archetypeCount: number; causeChainCount: number; causeTemplateCount: number;
  unknownTags: number; invalidReferences: number; unreachableDefinitions: number; duplicateTitles: number; duplicateBodies: number;
  similarChoiceStructureCandidates: number; invalidChoiceCounts: number; invalidTextLengths: number; riskViolations: number; knowledgeLeakViolations: number;
  buildCoverage: Record<string, number>; npcCoverage: Record<string, number>; causeCoverage: Record<string, { origins: number; echoes: number }>;
  AIorNetworkDependencies: number;
}

function increment(target: Record<string, number>, key: string): void { target[key] = (target[key] ?? 0) + 1; }
function effects(event: ContentPack["events"][number]): EffectSpec[] { return (event.choices ?? []).flatMap((choice) => Object.values(choice.outcomes).flatMap((outcome) => outcome?.effects ?? [])); }
function duplicates(values: string[]): number { return values.length - new Set(values).size; }

export function runContentPlayabilityAudit(pack: ContentPack, npcPack: NpcPack = NPC_CONTENT01_V1, localization: Readonly<Record<string, string>> = CONTENT01_ZH_CN): ContentPlayabilityAuditReport {
  let invalidReferences = 0; try { const registry = new ContentRegistry(); registry.registerNpcPack(npcPack); registry.register(pack); validateContentPack(pack, pack.manifest.contentVersion, { getNpcPack: (id) => id === npcPack.id ? npcPack : undefined }); } catch { invalidReferences += 1; }
  const eventsByAction: Record<string, number> = {}; const eventsByBuild: Record<string, number> = {}; const eventsByNpc: Record<string, number> = {}; const eventsByRisk: Record<string, number> = {}; const eventsBySalience: Record<string, number> = {};
  const titles: string[] = []; const bodies: string[] = []; const choiceStructures: string[] = []; let invalidChoiceCounts = 0; let invalidTextLengths = 0; let riskViolations = 0; let knowledgeLeakViolations = 0; let AIorNetworkDependencies = 0;
  const forbiddenKnowledge = /actualStatus|hiddenTrait|hiddenFact|echoBudget|salience|futureEventIds|drawIndex|rootSeed/i; const executable = /\b(?:eval|Function|fetch|https?:\/\/|WebSocket|openai|anthropic)\b/i;
  for (const event of pack.events) {
    for (const action of event.actionAffinity ?? []) increment(eventsByAction, action);
    for (const tag of event.directorHints?.buildAffinityTags ?? []) increment(eventsByBuild, tag);
    for (const role of event.directorHints?.npcRoleAffinityTags ?? []) increment(eventsByNpc, role);
    for (const choice of event.choices ?? []) if (choice.threatId !== undefined) increment(eventsByRisk, choice.threatId);
    increment(eventsBySalience, String(event.directorHints?.salience ?? 1));
    const title = localization[event.titleKey] ?? ""; const body = localization[event.fallback.bodyKey] ?? ""; titles.push(title); bodies.push(body);
    if ([...title].length < 2 || [...title].length > 8 || [...body].length < 40 || [...body].length > 180) invalidTextLengths += 1;
    const eventChoices = event.choices ?? []; if (eventChoices.length < 2 || eventChoices.length > 4) invalidChoiceCounts += 1;
    choiceStructures.push(eventChoices.map((choice) => `${choice.scope}:${choice.threatId ?? "none"}:${Object.values(choice.outcomes).flatMap((outcome) => outcome?.effects.map((effect: EffectSpec) => effect.op) ?? []).sort().join("+")}`).join("|"));
    const serialized = JSON.stringify(event); const publicText = [title, body, ...eventChoices.map((choice) => localization[choice.labelKey] ?? "")].join(" "); if (forbiddenKnowledge.test(publicText)) knowledgeLeakViolations += 1; if (executable.test(serialized)) AIorNetworkDependencies += 1;
    for (const choice of eventChoices) { const choiceValue = choice as unknown as Record<string, unknown>; if (choiceValue.riskHint !== undefined) riskViolations += 1; for (const effect of Object.values(choice.outcomes).flatMap((outcome) => outcome?.effects ?? [])) if (["killPlayer", "setDead", "forceDeath", "END_RUN"].includes(effect.op)) riskViolations += 1; }
  }
  const buildCoverage = Object.fromEntries(["sword", "body", "alchemy", "fortune"].map((id) => [id, eventsByBuild[id] ?? 0]));
  const npcCoverage: Record<string, number> = {}; for (const definition of npcPack.coreDefinitions) npcCoverage[definition.id] = pack.events.filter((event) => event.participants?.some((entry) => entry.source.kind === "core" && entry.source.npcDefinitionId === definition.id)).length;
  const allEffects = pack.events.flatMap((event) => effects(event)); const causeCoverage: Record<string, { origins: number; echoes: number }> = {};
  for (const chain of CONTENT01_CAUSE_CHAINS) { const templateIds = new Set<string>(chain.templates); causeCoverage[chain.id] = { origins: allEffects.filter((effect) => effect.op === "ADD_CAUSE" && templateIds.has(effect.templateId)).length, echoes: pack.causeTemplates.filter((template) => templateIds.has(template.id)).reduce((sum, template) => sum + template.linkedEventIds.length, 0) }; }
  const declared = new Set(pack.directorTags ?? []); const used = new Set(pack.events.flatMap((event) => event.directorHints === undefined ? [] : [...event.directorHints.topicTags, ...event.directorHints.continuityTags, ...event.directorHints.buildAffinityTags, ...event.directorHints.npcRoleAffinityTags, ...event.directorHints.worldAffinityTags]));
  const unknownTags = [...used].filter((tag) => !declared.has(tag)).length;
  const ordinaryFallbackCount = pack.events.filter((event) => (event.actionAffinity?.length ?? 0) === 0 && !pack.causeTemplates.some((template) => template.linkedEventIds.includes(event.id))).length;
  return {
    packVersion: pack.manifest.contentVersion, eventCount: pack.events.length, onboardingCount: pack.events.filter((event) => event.directorHints?.onboardingEligible === true).length, ordinaryFallbackCount,
    eventsByAction, eventsByBuild, eventsByNpc, eventsByRisk, eventsBySalience,
    coreNpcCount: npcPack.coreDefinitions.length, archetypeCount: npcPack.archetypes.length, causeChainCount: CONTENT01_CAUSE_CHAINS.length, causeTemplateCount: pack.causeTemplates.length,
    unknownTags, invalidReferences, unreachableDefinitions: pack.events.filter((event) => event.requirements !== undefined).length,
    duplicateTitles: duplicates(titles), duplicateBodies: duplicates(bodies), similarChoiceStructureCandidates: choiceStructures.length - new Set(choiceStructures).size,
    invalidChoiceCounts, invalidTextLengths, riskViolations, knowledgeLeakViolations, buildCoverage, npcCoverage, causeCoverage, AIorNetworkDependencies
  };
}
