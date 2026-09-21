import { createOfferedRun, isEventEligible, recordEventOccurrence, reduce, ruleStateHash, selectDirectorEvent, validateGameState, type GameState } from "../../core/src/index.ts";
import { ContentRegistry, REPEAT_SENSITIVE_EFFECT_OPS, validateContentPack, type ContentPack, type EffectSpec } from "./registry.ts";

export interface RecurrenceAuditSources { lifecycleContract: string; directorContract: string; coreSource: string }
export interface RecurrenceAuditReport {
  eventDefinitions: number;
  recurrenceDefinitions: number;
  invalidRecurrenceDefinitions: number;
  occurrenceCountViolations: number;
  cooldownViolations: number;
  duplicateCountOnRetry: number;
  repeatSafeViolations: number;
  directorPrecedenceDrift: number;
  lifecycleNumberingDrift: number;
  contentIdHardcodingViolations: number;
}

function active(content: ContentRegistry, pack: ContentPack): GameState {
  const offered = createOfferedRun({ schemaVersion: 2, rulesVersion: pack.manifest.rulesVersion, contentVersion: pack.manifest.contentVersion, runId: "run:recurrence-audit", playerId: "player:recurrence-audit", rootSeed: "recurrence-audit", metaView: { unlocks: [], entitlements: [], discoveries: [] }, fixture: { offerId: "offer:recurrence-audit", destinyIds: [pack.destinies[0]?.id ?? "a", pack.destinies[1]?.id ?? "b", pack.destinies[2]?.id ?? "c"], age: 20, maxAge: 200, runName: "Audit", realm: { id: "mortal", order: 0, cultivation: 0 }, attributes: { insight: 20, body: 20, spiritSense: 20, fortune: 20 }, resources: { spiritStone: 0, items: {} }, availableActions: ["cultivate", "travel", "worldly", "pursuit"], world: { regionId: pack.references.regions[0] ?? "dev.start", knownRegionIds: [pack.references.regions[0] ?? "dev.start"], tags: [], factionStanding: {} }, firstRun: true } });
  return reduce({ state: offered, command: { type: "START_RUN", offerId: offered.run.offer!.offerId, destinyId: offered.run.offer!.destinyIds[0] }, context: { rulesVersion: offered.rulesVersion, contentVersion: offered.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: "cmd:recurrence-audit:start" } }).state;
}

function effectLists(event: ContentPack["events"][number]): EffectSpec[][] {
  const result: EffectSpec[][] = event.onEnter === undefined ? [] : [event.onEnter];
  for (const choice of event.choices ?? []) for (const outcome of [choice.outcomes.greatSuccess, choice.outcomes.success, choice.outcomes.costlySuccess, choice.outcomes.failure]) if (outcome !== undefined) result.push(outcome.effects);
  return result;
}

export function runRecurrenceAudit(pack: ContentPack, sources: RecurrenceAuditSources): RecurrenceAuditReport {
  let invalidRecurrenceDefinitions = 0; let occurrenceCountViolations = 0; let cooldownViolations = 0; let duplicateCountOnRetry = 0; let repeatSafeViolations = 0; let directorPrecedenceDrift = 0;
  try { validateContentPack(pack); } catch { invalidRecurrenceDefinitions += 1; }
  for (const event of pack.events) if (event.cooldown !== undefined) {
    const { minNodesBetween, maxOccurrences, ...unknown } = event.cooldown as Record<string, unknown>;
    if (Object.keys(unknown).length > 0 || (minNodesBetween !== undefined && (!Number.isSafeInteger(minNodesBetween) || (minNodesBetween as number) < 0)) || (maxOccurrences !== undefined && (!Number.isSafeInteger(maxOccurrences) || (maxOccurrences as number) < 1))) invalidRecurrenceDefinitions += 1;
    if (maxOccurrences !== 1) {
      for (const effects of effectLists(event)) for (const effect of effects) if (REPEAT_SENSITIVE_EFFECT_OPS.has(effect.op) && effect.repeatBehavior !== "allow-cumulative") repeatSafeViolations += 1;
      for (const choice of event.choices ?? []) if (choice.threatId !== undefined && choice.riskRepeatBehavior !== "allow-repeat-resolution") repeatSafeViolations += 1;
    }
  }
  const content = new ContentRegistry(); content.register(pack); const state = active(content, pack); const selected = selectDirectorEvent(state, "travel", content, ["P2", "P4", "P5", "P6"]);
  if (selected.trace.selectedPrecedenceLevel !== "P2") directorPrecedenceDrift += 1;
  if (selected.state.run.events.occurrences !== state.run.events.occurrences) occurrenceCountViolations += 1;
  const output = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: "cmd:recurrence-audit:action" } });
  const retry = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: "travel" }, context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content: content as unknown as Readonly<Record<string, unknown>>, commandId: "cmd:recurrence-audit:action" } });
  const eventId = output.state.run.events.current?.eventId; if (eventId === undefined || output.state.run.events.occurrences?.[eventId]?.occurrenceCount !== 1) occurrenceCountViolations += 1;
  if (ruleStateHash(output.state) !== ruleStateHash(retry.state) || JSON.stringify(output.state.run.events.occurrences) !== JSON.stringify(retry.state.run.events.occurrences)) duplicateCountOnRetry += 1;
  const base = validateGameState({ ...state, run: { ...state.run, nodeIndex: 5 } }); const once = recordEventOccurrence(base, "audit.cooldown"); const definition = { id: "audit.cooldown", cooldown: { minNodesBetween: 1, maxOccurrences: 2 } };
  if (isEventEligible(definition, once) || !isEventEligible(definition, { ...once, run: { ...once.run, nodeIndex: 7 } })) cooldownViolations += 1;
  const lifecycleNumberingDrift = sources.lifecycleContract.includes("P0 terminal") || !["P1 terminal", "P2 first-run", "P3 eligible", "P4 active", "P5 build", "P6 ordinary"].every((value) => sources.lifecycleContract.includes(value)) || !sources.directorContract.includes("P1 terminal/lifespan") ? 1 : 0;
  const contentIdHardcodingViolations = /content01\.|cen-|pei-|jiang-|xie-|xu-/.test(sources.coreSource) ? 1 : 0;
  return { eventDefinitions: pack.events.length, recurrenceDefinitions: pack.events.filter((event) => event.cooldown !== undefined).length, invalidRecurrenceDefinitions, occurrenceCountViolations, cooldownViolations, duplicateCountOnRetry, repeatSafeViolations, directorPrecedenceDrift, lifecycleNumberingDrift, contentIdHardcodingViolations };
}
