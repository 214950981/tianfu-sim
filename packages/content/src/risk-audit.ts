import { createOfferedRun } from "../../core/src/reducer.ts";
import { aggregateRiskModifiers, buildRiskPresentation, resolveThreat, type RiskPack } from "../../core/src/risk.ts";
import { validateGameState } from "../../core/src/state.ts";
import { RISK_V1, validateRiskPack } from "./risk-v1.ts";

export interface RiskAuditResult {
  threatDefinitions: number;
  lethalThreats: number;
  warningViolations: number;
  directDeathViolations: number;
  earlyNodeViolations: number;
  hookConflicts: number;
  modifierRange: { riskScoreDelta: { min: number; max: number }; riskDifficultyDelta: { min: number; max: number } };
  deathRecordViolations: number;
  determinismFailures: number;
  securityViolations: number;
}

function auditState() {
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: "risk-audit", runId: "risk-audit", playerId: "risk-audit", rootSeed: "risk-audit-seed", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "risk-audit", destinyIds: ["a", "b", "c"], age: 20, maxAge: 80, runName: "Risk Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: -100, body: -100, spiritSense: -100, fortune: -100 }, resources: { spiritStone: 0, items: {} }, availableActions: [], world: { regionId: "audit", knownRegionIds: ["audit"], tags: [], factionStanding: {} } } });
  return validateGameState({ ...offered, run: { ...offered.run, status: "active", offer: undefined, identity: { ...offered.run.identity, destinyId: "audit-destiny" }, conditions: [{ id: "audit-injury", kind: "injury", stacks: 2, sourceRef: "audit" }] } });
}

function directDeathCount(content: unknown): number {
  const forbidden = new Set(["END_RUN", "killPlayer", "setDead", "forceDeath"]); let count = 0;
  const visit = (value: unknown): void => { if (Array.isArray(value)) { value.forEach(visit); return; } if (typeof value !== "object" || value === null) return; const record = value as Record<string, unknown>; if (typeof record.op === "string" && (forbidden.has(record.op) || /(?:kill|dead|death)/i.test(record.op))) count += 1; Object.values(record).forEach(visit); };
  visit(content); return count;
}

export function runRiskAudit(pack: RiskPack = RISK_V1, content: unknown = {}): RiskAuditResult {
  validateRiskPack(pack); const lethal = pack.threats.filter((threat) => threat.lethalityPolicy?.lethalOnFailure === true);
  const warningViolations = lethal.filter((threat) => threat.lethalityPolicy?.requiresPublicWarning !== true || threat.lethalityPolicy.prerequisites.length === 0).length;
  const hooks = pack.threats.flatMap((threat) => threat.hooks.map((hook) => `${hook.order}:${hook.id}:${threat.id}`)); const hookConflicts = hooks.length - new Set(hooks).size;
  const extreme = { id: "audit-extreme", hooks: [], systemOwners: ["RISK01"], modifiers: [{ kind: "riskScoreDelta" as const, value: -999, systemOwner: "RISK01" }, { kind: "riskDifficultyDelta" as const, value: 999, systemOwner: "RISK01" }] };
  const low = aggregateRiskModifiers([extreme]); const high = aggregateRiskModifiers([{ ...extreme, id: "audit-high", modifiers: [{ kind: "riskScoreDelta" as const, value: 999, systemOwner: "RISK01" }, { kind: "riskDifficultyDelta" as const, value: -999, systemOwner: "RISK01" }] }]);
  let earlyNodeViolations = 0; let deathRecordViolations = 0; let determinismFailures = 0;
  for (const threat of pack.threats) {
    const state = auditState(); const presentation = buildRiskPresentation(state, threat);
    if (presentation.canBeFatal) { try { resolveThreat(state, pack, { definitionId: threat.id }, { commandId: `audit:${threat.id}`, presentedRisk: presentation, acceptedPublicWarning: false }); earlyNodeViolations += 1; } catch { /* required rejection */ } }
    const options = { commandId: `audit:${threat.id}`, sourceEventId: "audit-event", presentedRisk: presentation, acceptedPublicWarning: presentation.canBeFatal };
    const first = resolveThreat(state, pack, { definitionId: threat.id }, options); const second = resolveThreat(state, pack, { definitionId: threat.id }, options);
    if (JSON.stringify(first) !== JSON.stringify(second)) determinismFailures += 1;
    if (first.deathRecord !== undefined) { const record = first.deathRecord; if (!record.deathCauseId || !record.category || !record.realmId || !record.immediateSource || record.warningFacts.length === 0 || JSON.stringify(record).includes("NaN") || JSON.stringify(record).includes("Infinity")) deathRecordViolations += 1; }
  }
  let securityViolations = 0; try { JSON.stringify(pack); } catch { securityViolations += 1; }
  return { threatDefinitions: pack.threats.length, lethalThreats: lethal.length, warningViolations, directDeathViolations: directDeathCount(content), earlyNodeViolations, hookConflicts, modifierRange: { riskScoreDelta: { min: low.riskScoreDelta, max: high.riskScoreDelta }, riskDifficultyDelta: { min: high.riskDifficultyDelta, max: low.riskDifficultyDelta } }, deathRecordViolations, determinismFailures, securityViolations };
}
