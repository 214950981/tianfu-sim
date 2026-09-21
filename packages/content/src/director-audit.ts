import { createOfferedRun, createSnapshot, reduce, ruleStateHash, selectDirectorEvent, validateSnapshot, type GameState } from "../../core/src/index.ts";
import { DIRECTOR_V1, validateDirectorPack } from "./director-v1.ts";
import { ContentRegistry, validateContentPack, type ContentPack } from "./registry.ts";
import type { DirectorPack } from "../../core/src/director.ts";

export interface DirectorAuditReport {
  eventDefinitions: number; directorAnnotatedEvents: number; ordinaryFallbacks: number; onboardingEvents: number;
  invalidWeights: number; invalidTags: number; precedenceViolations: number; pacingViolations: number;
  dangerPacingViolations: number; determinismFailures: number; replayFailures: number; securityViolations: number;
}

function activeState(contentVersion: string): GameState {
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion, runId: "run:director-audit", playerId: "player:director-audit", rootSeed: "director-audit-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer:director-audit", destinyIds: ["a", "b", "c"], age: 20, maxAge: 80, runName: "Director Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }, firstRun: true } });
  return reduce({ state: offered, command: { type: "START_RUN", offerId: "offer:director-audit", destinyId: "a" }, context: { rulesVersion: "2.0.0", contentVersion, content: {}, commandId: "cmd:director-audit:start" } }).state;
}

export function runDirectorAudit(contentPack: ContentPack, directorPack: DirectorPack = DIRECTOR_V1): DirectorAuditReport {
  let invalidWeights = 0; let invalidTags = 0; let precedenceViolations = 0; let pacingViolations = 0; let dangerPacingViolations = 0; let determinismFailures = 0; let replayFailures = 0; let securityViolations = 0;
  try { validateDirectorPack(directorPack); validateContentPack(contentPack); } catch (error) { const message = String(error); if (/weight/i.test(message)) invalidWeights += 1; else if (/tag/i.test(message)) invalidTags += 1; else securityViolations += 1; }
  const serialized = JSON.stringify({ directorPack, contentPack });
  if (/"(?:eval|script|function|handler|callback|code)"\s*:/i.test(serialized)) securityViolations += 1;
  const registry = new ContentRegistry(); registry.registerDirectorPack(directorPack); registry.register(contentPack);
  const ordinaryFallbacks = registry.queryDirectorCandidates(contentPack.manifest.contentVersion, { slot: "ordinary" }).eventIds.length;
  const onboardingEvents = registry.queryDirectorCandidates(contentPack.manifest.contentVersion, { slot: "onboarding" }).eventIds.length;
  if (ordinaryFallbacks === 0) precedenceViolations += 1;
  const state = activeState(contentPack.manifest.contentVersion);
  const first = selectDirectorEvent(state, "cultivate", registry, ["P2", "P4", "P5", "P6"]);
  const second = selectDirectorEvent(state, "cultivate", registry, ["P2", "P4", "P5", "P6"]);
  if (JSON.stringify(first) !== JSON.stringify(second)) determinismFailures += 1;
  if (first.state.run.events.current === undefined) precedenceViolations += 1;
  if (first.state.run.director.recentScenes.length > directorPack.rules.recentWindowSize) pacingViolations += 1;
  try { const snapshot = validateSnapshot(JSON.parse(JSON.stringify(createSnapshot(first.state, 0)))); if (snapshot.ruleStateHash !== ruleStateHash(first.state) || JSON.stringify(snapshot.state.run.director) !== JSON.stringify(first.state.run.director)) replayFailures += 1; } catch { replayFailures += 1; }
  return { eventDefinitions: contentPack.events.length, directorAnnotatedEvents: contentPack.events.filter((event) => event.directorHints !== undefined).length, ordinaryFallbacks, onboardingEvents, invalidWeights, invalidTags, precedenceViolations, pacingViolations, dangerPacingViolations, determinismFailures, replayFailures, securityViolations };
}
