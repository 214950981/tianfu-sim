import { activeBuildProgressionSources, activeBuildRiskSources, applyBuildEvidence, buildStage, type BuildPack } from "../../core/src/build.ts";
import { createOfferedRun } from "../../core/src/reducer.ts";
import { ruleStateHash } from "../../core/src/persistence.ts";
import { validateGameState } from "../../core/src/state.ts";
import { BUILD_V1, validateBuildPack } from "./build-v1.ts";

export interface BuildAuditResult {
  buildDefinitions: number; branchDefinitions: number; hybridDefinitions: number; invalidDefinitions: number; cycleViolations: number;
  modifierRange: Record<string, { min: number; max: number }>; hookConflicts: number; shortLifeFailures: number; longLifeFailures: number;
  determinismFailures: number; replayFailures: number; securityViolations: number;
}

function baseState() {
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "build-audit-v1", runId: "build-audit", playerId: "build-audit", rootSeed: "build-audit-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "audit", destinyIds: ["a", "b", "c"], age: 20, maxAge: 80, runName: "Build Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 0, body: 0, spiritSense: 0, fortune: 0 }, resources: { spiritStone: 0, items: {} }, availableActions: [], world: { regionId: "audit", knownRegionIds: ["audit"], tags: [], factionStanding: {} } } });
  return validateGameState({ ...offered, run: { ...offered.run, status: "active", offer: undefined, identity: { ...offered.run.identity, destinyId: "audit" } } });
}
function applySequence(pack: BuildPack, sequence: Array<[string, number]>): ReturnType<typeof baseState> { let state = baseState(); for (const [index, [buildId, amount]] of sequence.entries()) state = applyBuildEvidence(state, pack, { buildId, amount, reasonTag: `audit.${index}` }, { commandId: `audit:${index}`, sourceRef: "audit" }).state; return state; }
function countCycles(pack: BuildPack): number { const index = new Map(pack.definitions.map((definition) => [definition.id, definition])); let violations = 0; const visit = (id: string, path: Set<string>): void => { if (path.has(id)) { violations += 1; return; } const next = new Set(path); next.add(id); for (const parent of index.get(id)?.parentBuildIds ?? []) visit(parent, next); }; for (const definition of pack.definitions) visit(definition.id, new Set()); return violations; }

export function runBuildAudit(pack: BuildPack = BUILD_V1): BuildAuditResult {
  let invalidDefinitions = 0; try { validateBuildPack(pack); } catch { invalidDefinitions = 1; }
  const values = new Map<string, number[]>(); for (const definition of pack.definitions) for (const modifier of [...definition.modifiers, ...definition.stages.flatMap((stage) => stage.modifiers)]) { const list = values.get(modifier.kind) ?? []; list.push(modifier.value); values.set(modifier.kind, list); }
  const modifierRange = Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([kind, entries]) => [kind, { min: Math.min(...entries), max: Math.max(...entries) }]));
  const hooks = pack.definitions.flatMap((definition) => [...definition.hooks, ...definition.stages.flatMap((stage) => stage.hooks)].map((hook) => `${definition.id}:${hook.order}:${hook.id}`)); const hookConflicts = hooks.length - new Set(hooks).size;
  let shortLifeFailures = 0; const short = applySequence(pack, [["build.sword", 200], ["build.sword", 200], ["build.sword", 200]]); if (Object.values(short.run.build.affinities ?? {}).some((affinity) => buildStage(pack.rules, affinity.affinityBps) === "formed" || buildStage(pack.rules, affinity.affinityBps) === "refined")) shortLifeFailures += 1;
  let longLifeFailures = 0; const noEvidence = validateGameState({ ...baseState(), run: { ...baseState().run, nodeIndex: 35 } }); if (Object.keys(noEvidence.run.build.affinities ?? {}).length !== 0) longLifeFailures += 1;
  const focused = applySequence(pack, [["build.sword", 2500], ["build.sword", 2500], ["build.sword", 2500], ["build.sword", 2500]]); if (buildStage(pack.rules, focused.run.build.affinities?.["build.sword"]?.affinityBps ?? 0) !== "refined" || Object.keys(focused.run.build.affinities ?? {}).length !== 1) longLifeFailures += 1;
  const mixedSequence = Array.from({ length: 30 }, (_, index): [string, number] => [index % 2 === 0 ? "build.sword" : "build.body", 400]); const mixed = applySequence(pack, mixedSequence); if (Object.values(mixed.run.build.affinities ?? {}).every((affinity) => affinity.affinityBps === 10_000) || Object.keys(mixed.run.build.affinities ?? {}).length !== 2) longLifeFailures += 1;
  const sequence: Array<[string, number]> = [["build.sword", 2500], ["build.body", 1200], ["build.sword", 1800]]; const first = applySequence(pack, sequence); const second = applySequence(pack, sequence); let determinismFailures = JSON.stringify(first) === JSON.stringify(second) ? 0 : 1; const reversed = structuredClone(pack); reversed.definitions.reverse(); const third = applySequence(reversed, sequence); if (JSON.stringify(first.run.build) !== JSON.stringify(third.run.build)) determinismFailures += 1;
  let replayFailures = 0; try { const restored = validateGameState(JSON.parse(JSON.stringify(first))); if (ruleStateHash(first) !== ruleStateHash(restored)) replayFailures += 1; const extended = structuredClone(pack); extended.definitions.push({ ...structuredClone(pack.definitions[0]), id: "build.audit-extension", displayName: "Audit", compatibleWith: [], conflictsWith: [], parentBuildIds: [] }); extended.manifest.buildCount += 1; validateBuildPack(extended); if (ruleStateHash(first) !== ruleStateHash(restored)) replayFailures += 1; } catch { replayFailures += 1; }
  let securityViolations = 0; try { const executable = structuredClone(pack); (executable.definitions[0] as unknown as Record<string, unknown>).script = () => 1; validateBuildPack(executable); securityViolations += 1; } catch { /* required rejection */ }
  activeBuildProgressionSources(focused, pack); activeBuildRiskSources(focused, pack);
  return { buildDefinitions: pack.definitions.length, branchDefinitions: pack.definitions.filter((definition) => definition.parentBuildIds.length > 0).length, hybridDefinitions: pack.definitions.filter((definition) => definition.parentBuildIds.length > 1).length, invalidDefinitions, cycleViolations: countCycles(pack), modifierRange, hookConflicts, shortLifeFailures, longLifeFailures, determinismFailures, replayFailures, securityViolations };
}
