import { assertSafeInteger } from "../../core/src/numeric.ts";
import { RISK_MODIFIER_KEYS, type DeathCauseDefinition, type RiskConditionDefinition, type RiskConsequence, type RiskHook, type RiskModifier, type RiskPack, type ThreatDefinition } from "../../core/src/risk.ts";

const KNOWN_OWNERS = new Set(["RISK01", "PROG01", "BUILD01", "NPC01", "DIRECTOR01", "CONTENT01", "CAUSE01", "WORLD01"]);
const RISK_HOOK_WHITELIST = ["risk.beforeCheck", "risk.afterOutcome", "risk.beforeConsequence"];
const ATTRIBUTES = new Set(["insight", "body", "spiritSense", "fortune"]);
const VISIBILITY = new Set(["explicit", "hinted", "hidden"]);
const LOGICAL_PATHS = new Set(["run.age", "run.maxAge", "realm.order", "realm.cultivation", "attr.insight", "attr.body", "attr.spiritSense", "attr.fortune", "resource.spiritStone", "identity.tags", "world.tags", "world.regionId", "injury.level"]);

function modifier(kind: RiskModifier["kind"], value: number): RiskModifier { return { kind, value, systemOwner: "RISK01" }; }
function source(id: string, extra: Partial<RiskConditionDefinition> = {}): RiskConditionDefinition {
  return { id, tags: [], modifiers: [], hooks: [], systemOwners: ["RISK01"], ...extra };
}
function consequence(injuryDelta: number, conditionAdds: RiskConsequence["conditionAdds"] = []): RiskConsequence { return { injuryDelta, conditionAdds }; }
function check(primary: "insight" | "body" | "spiritSense" | "fortune", difficulty: number, secondary?: "insight" | "body" | "spiritSense" | "fortune"): Readonly<Record<string, unknown>> {
  return { primary, ...(secondary === undefined ? {} : { secondary, secondaryWeightBps: 5_000 }), difficulty, randomMin: -10, randomMax: 10 };
}
function outcomes(conditionId?: string): ThreatDefinition["outcomeTable"] {
  return {
    greatSuccess: consequence(0), success: consequence(0),
    costlySuccess: consequence(1, conditionId === undefined ? [] : [{ definitionId: conditionId, severity: 1, visibility: "explicit", tags: [] }]),
    failure: consequence(2, conditionId === undefined ? [] : [{ definitionId: conditionId, severity: 2, visibility: "explicit", tags: [] }])
  };
}
function lethalPolicy(): NonNullable<ThreatDefinition["lethalityPolicy"]> {
  return { lethalOnFailure: true, requiresPublicWarning: true, prerequisites: [{ gte: ["injury.level", 2] }] };
}
function threat(id: string, category: string, checkSpec: Readonly<Record<string, unknown>>, options: { conditionId?: string; lethal?: boolean; deathCauseId?: string; modifiers?: RiskModifier[] } = {}): ThreatDefinition {
  return { id, tags: [category], category, checkSpec, outcomeTable: outcomes(options.conditionId), ...(options.lethal ? { lethalityPolicy: lethalPolicy(), deathCauseId: options.deathCauseId } : {}), modifiers: options.modifiers ?? [], hooks: [], systemOwners: ["RISK01"] };
}

export const RISK_CONDITIONS_V1: RiskConditionDefinition[] = [
  source("risk-condition.poison", { tags: ["poison"], modifiers: [modifier("riskScoreDelta", -10)] }),
  source("risk-condition.curse", { tags: ["curse"], modifiers: [modifier("riskDifficultyDelta", 10)] }),
  source("risk-condition.deviation", { tags: ["cultivation", "deviation"], modifiers: [modifier("riskScoreDelta", -15)] }),
  source("risk-condition.old-injury", { tags: ["injury", "persistent"], modifiers: [modifier("consequenceSeverityDelta", 1)] }),
  source("risk-condition.soul-damage", { tags: ["soul"], modifiers: [modifier("riskDifficultyDelta", 15)] }),
  source("risk-condition.tribulation-mark", { tags: ["tribulation"], modifiers: [modifier("riskDifficultyDelta", 20)] })
];

export const DEATH_CAUSES_V1: DeathCauseDefinition[] = [
  ["death.lifespan", "lifespan", "寿元耗尽"], ["death.combat", "combat", "战斗身亡"], ["death.exploration", "exploration", "探索遇难"],
  ["death.poison", "poison", "毒发身亡"], ["death.curse", "curse", "诅咒侵蚀"], ["death.injury", "injury", "伤重不治"],
  ["death.cause", "cause", "因果索命"], ["death.breakthrough", "breakthrough", "破境劫难"], ["death.special", "special", "特殊灾劫"]
].map(([id, category, displayName]) => ({ id, category, displayName, tags: [category] }));

export const THREATS_V1: ThreatDefinition[] = [
  threat("threat.combat", "combat", check("body", 45, "spiritSense"), { lethal: true, deathCauseId: "death.combat" }),
  threat("threat.ambush", "combat", check("spiritSense", 50, "fortune"), { lethal: true, deathCauseId: "death.combat" }),
  threat("threat.dangerous-exploration", "exploration", check("insight", 50, "fortune"), { lethal: true, deathCauseId: "death.exploration" }),
  threat("threat.poison", "poison", check("body", 55), { conditionId: "risk-condition.poison", lethal: true, deathCauseId: "death.poison" }),
  threat("threat.curse", "curse", check("spiritSense", 55, "insight"), { conditionId: "risk-condition.curse", lethal: true, deathCauseId: "death.curse" }),
  threat("threat.critical-injury", "injury", check("body", 60), { conditionId: "risk-condition.old-injury", lethal: true, deathCauseId: "death.injury" }),
  threat("threat.cause-revenge", "cause", check("fortune", 55, "spiritSense"), { lethal: true, deathCauseId: "death.cause" }),
  threat("threat.breakthrough-backlash", "breakthrough", check("body", 45, "spiritSense"), { conditionId: "risk-condition.deviation" }),
  threat("threat.special-catastrophe", "special", check("spiritSense", 70, "fortune"), { conditionId: "risk-condition.tribulation-mark", lethal: true, deathCauseId: "death.special" })
];

export const RISK_V1: RiskPack = {
  id: "risk.v1", version: 1, rulesVersion: "2.0.0",
  manifest: { threatCount: THREATS_V1.length, riskConditionCount: RISK_CONDITIONS_V1.length, deathCauseCount: DEATH_CAUSES_V1.length },
  injuryScoreModifiers: { "0": 0, "1": -10, "2": -25, "3": -45 },
  threats: THREATS_V1, riskConditions: RISK_CONDITIONS_V1, deathCauses: DEATH_CAUSES_V1, hookWhitelist: RISK_HOOK_WHITELIST
};

function fail(path: string, message: string): never { throw new TypeError(`${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object"); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, required: string[], optional: string[], path: string): void { const allowed = new Set([...required, ...optional]); for (const key of required) if (!Object.hasOwn(value, key)) fail(path, `missing ${key}`); for (const key of Object.keys(value)) if (!allowed.has(key)) fail(path, `unknown field ${key}`); }
function string(value: unknown, path: string): string { if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string"); return value; }
function integer(value: unknown, path: string, min?: number, max?: number): number { if (typeof value !== "number") fail(path, "must be an integer"); try { assertSafeInteger(value, path); } catch { fail(path, "must be a finite safe integer"); } if (min !== undefined && value < min) fail(path, `must be >= ${min}`); if (max !== undefined && value > max) fail(path, `must be <= ${max}`); return value; }
function strings(value: unknown, path: string): string[] { if (!Array.isArray(value)) fail(path, "must be an array"); const result = value.map((entry, index) => string(entry, `${path}[${index}]`)); if (new Set(result).size !== result.length) fail(path, "must be unique"); return result; }
function safeJson(value: unknown, path: string): void { if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || value === undefined || (typeof value === "number" && !Number.isFinite(value))) fail(path, "must be finite JSON data"); if (Array.isArray(value)) value.forEach((entry, index) => safeJson(entry, `${path}[${index}]`)); else if (typeof value === "object" && value !== null) for (const [key, entry] of Object.entries(value)) safeJson(entry, `${path}.${key}`); }
function tuple(value: unknown, length: number, path: string): unknown[] { if (!Array.isArray(value) || value.length !== length) fail(path, `must contain ${length} items`); return value; }
function validateCondition(value: unknown, path: string, depth = 0): void {
  if (depth > 32) fail(path, "condition nesting exceeds 32 levels"); const item = object(value, path); const keys = Object.keys(item); if (keys.length !== 1) fail(path, "ConditionExpr must have exactly one operator"); const op = keys[0]; const operand = item[op];
  if (op === "all" || op === "any") { if (!Array.isArray(operand)) fail(`${path}.${op}`, "must be an array"); operand.forEach((entry, index) => validateCondition(entry, `${path}.${op}[${index}]`, depth + 1)); return; }
  if (op === "not") { validateCondition(operand, `${path}.not`, depth + 1); return; }
  if (op === "eq" || op === "ne") { const pair = tuple(operand, 2, `${path}.${op}`); if (!LOGICAL_PATHS.has(string(pair[0], `${path}.${op}[0]`))) fail(`${path}.${op}[0]`, "unknown logical path"); safeJson(pair[1], `${path}.${op}[1]`); return; }
  if (op === "gte" || op === "lte") { const pair = tuple(operand, 2, `${path}.${op}`); if (!LOGICAL_PATHS.has(string(pair[0], `${path}.${op}[0]`))) fail(`${path}.${op}[0]`, "unknown logical path"); integer(pair[1], `${path}.${op}[1]`); return; }
  if (op === "hasTag") { const pair = tuple(operand, 2, `${path}.hasTag`); if (!new Set(["identity.tags", "world.tags"]).has(string(pair[0], `${path}.hasTag[0]`))) fail(`${path}.hasTag[0]`, "unknown tag path"); string(pair[1], `${path}.hasTag[1]`); return; }
  if (op === "hasItem") { if (!Array.isArray(operand) || operand.length < 1 || operand.length > 2) fail(`${path}.hasItem`, "invalid arity"); string(operand[0], `${path}.hasItem[0]`); if (operand[1] !== undefined) integer(operand[1], `${path}.hasItem[1]`, 1); return; }
  if (op === "buildTagGte") { const pair = tuple(operand, 2, `${path}.buildTagGte`); string(pair[0], `${path}.buildTagGte[0]`); integer(pair[1], `${path}.buildTagGte[1]`); return; }
  if (op === "relationGte" || op === "relationLte") { const parts = tuple(operand, 3, `${path}.${op}`); string(parts[0], `${path}.${op}[0]`); if (!new Set(["affinity", "trust", "debt"]).has(string(parts[1], `${path}.${op}[1]`))) fail(`${path}.${op}[1]`, "unknown relation axis"); integer(parts[2], `${path}.${op}[2]`); return; }
  if (op === "causeStateIs") { const pair = tuple(operand, 2, `${path}.causeStateIs`); string(pair[0], `${path}.causeStateIs[0]`); if (!new Set(["dormant", "eligible", "echoed", "resolved", "expired"]).has(string(pair[1], `${path}.causeStateIs[1]`))) fail(`${path}.causeStateIs[1]`, "unknown cause state"); return; }
  if (op === "npcStatusIs") { const pair = tuple(operand, 2, `${path}.npcStatusIs`); string(pair[0], `${path}.npcStatusIs[0]`); string(pair[1], `${path}.npcStatusIs[1]`); return; }
  fail(path, `unknown condition operator ${op}`);
}
function validateModifier(value: unknown, path: string): void { const item = object(value, path); exact(item, ["kind", "value", "systemOwner"], [], path); if (!RISK_MODIFIER_KEYS.includes(string(item.kind, `${path}.kind`) as RiskModifier["kind"])) fail(`${path}.kind`, "unknown risk modifier"); integer(item.value, `${path}.value`); if (!KNOWN_OWNERS.has(string(item.systemOwner, `${path}.systemOwner`))) fail(`${path}.systemOwner`, "unknown system owner"); }
function validateHook(value: unknown, whitelist: Set<string>, path: string): void { const item = object(value, path); exact(item, ["id", "systemOwner", "order"], [], path); if (!whitelist.has(string(item.id, `${path}.id`))) fail(`${path}.id`, "hook is not registered"); if (!KNOWN_OWNERS.has(string(item.systemOwner, `${path}.systemOwner`))) fail(`${path}.systemOwner`, "unknown system owner"); integer(item.order, `${path}.order`); }
function validateSource(value: unknown, whitelist: Set<string>, path: string): Record<string, unknown> { const item = object(value, path); strings(item.systemOwners, `${path}.systemOwners`).forEach((owner) => { if (!KNOWN_OWNERS.has(owner)) fail(`${path}.systemOwners`, `unknown owner ${owner}`); }); if (!Array.isArray(item.modifiers)) fail(`${path}.modifiers`, "must be an array"); item.modifiers.forEach((entry, index) => validateModifier(entry, `${path}.modifiers[${index}]`)); if (!Array.isArray(item.hooks)) fail(`${path}.hooks`, "must be an array"); item.hooks.forEach((entry, index) => validateHook(entry, whitelist, `${path}.hooks[${index}]`)); return item; }
function validateConsequence(value: unknown, conditionIds: Set<string>, path: string): void { const item = object(value, path); exact(item, ["injuryDelta", "conditionAdds"], [], path); integer(item.injuryDelta, `${path}.injuryDelta`, 0, 3); if (!Array.isArray(item.conditionAdds)) fail(`${path}.conditionAdds`, "must be an array"); item.conditionAdds.forEach((entry, index) => { const addition = object(entry, `${path}.conditionAdds[${index}]`); exact(addition, ["definitionId", "severity", "visibility", "tags"], [], `${path}.conditionAdds[${index}]`); if (!conditionIds.has(string(addition.definitionId, `${path}.conditionAdds[${index}].definitionId`))) fail(`${path}.conditionAdds[${index}]`, "unknown RiskConditionDefinition"); integer(addition.severity, `${path}.conditionAdds[${index}].severity`, 1, 3); if (!VISIBILITY.has(string(addition.visibility, `${path}.conditionAdds[${index}].visibility`))) fail(`${path}.conditionAdds[${index}].visibility`, "unknown visibility"); strings(addition.tags, `${path}.conditionAdds[${index}].tags`); }); }
function validateCheck(value: unknown, path: string): void { const item = object(value, path); exact(item, ["primary", "difficulty", "randomMin", "randomMax"], ["secondary", "secondaryWeightBps"], path); if (!ATTRIBUTES.has(string(item.primary, `${path}.primary`))) fail(`${path}.primary`, "unknown attribute"); if (item.secondary !== undefined && !ATTRIBUTES.has(string(item.secondary, `${path}.secondary`))) fail(`${path}.secondary`, "unknown attribute"); integer(item.difficulty, `${path}.difficulty`, 0, 1000); if (item.secondaryWeightBps !== undefined) integer(item.secondaryWeightBps, `${path}.secondaryWeightBps`, 0, 10_000); if (item.randomMin !== -10 || item.randomMax !== 10) fail(path, "check range must be -10..10"); }

export function validateRiskPack(value: unknown): RiskPack {
  safeJson(value, "riskPack"); const pack = object(value, "riskPack"); exact(pack, ["id", "version", "rulesVersion", "manifest", "injuryScoreModifiers", "threats", "riskConditions", "deathCauses", "hookWhitelist"], [], "riskPack");
  string(pack.id, "riskPack.id"); integer(pack.version, "riskPack.version", 1); string(pack.rulesVersion, "riskPack.rulesVersion"); const whitelist = new Set(strings(pack.hookWhitelist, "riskPack.hookWhitelist"));
  const injury = object(pack.injuryScoreModifiers, "riskPack.injuryScoreModifiers"); exact(injury, ["0", "1", "2", "3"], [], "riskPack.injuryScoreModifiers"); [["0",0],["1",-10],["2",-25],["3",-45]].forEach(([key, expected]) => { if (integer(injury[String(key)], `riskPack.injuryScoreModifiers.${key}`) !== expected) fail(`riskPack.injuryScoreModifiers.${key}`, "does not match risk v1"); });
  if (!Array.isArray(pack.riskConditions) || !Array.isArray(pack.deathCauses) || !Array.isArray(pack.threats)) fail("riskPack", "definition registries must be arrays");
  const conditionIds = new Set<string>(); pack.riskConditions.forEach((entry, index) => { const item = validateSource(entry, whitelist, `riskPack.riskConditions[${index}]`); exact(item, ["id", "tags", "modifiers", "hooks", "systemOwners"], [], `riskPack.riskConditions[${index}]`); const id = string(item.id, `riskPack.riskConditions[${index}].id`); if (conditionIds.has(id)) fail("riskPack.riskConditions", `duplicate ${id}`); conditionIds.add(id); strings(item.tags, `riskPack.riskConditions[${index}].tags`); });
  const deathIds = new Set<string>(); pack.deathCauses.forEach((entry, index) => { const item = object(entry, `riskPack.deathCauses[${index}]`); exact(item, ["id", "category", "displayName", "tags"], [], `riskPack.deathCauses[${index}]`); const id = string(item.id, `riskPack.deathCauses[${index}].id`); if (deathIds.has(id)) fail("riskPack.deathCauses", `duplicate ${id}`); deathIds.add(id); string(item.category, `riskPack.deathCauses[${index}].category`); string(item.displayName, `riskPack.deathCauses[${index}].displayName`); strings(item.tags, `riskPack.deathCauses[${index}].tags`); });
  const threatIds = new Set<string>(); pack.threats.forEach((entry, index) => { const path = `riskPack.threats[${index}]`; const item = validateSource(entry, whitelist, path); exact(item, ["id", "tags", "category", "checkSpec", "outcomeTable", "modifiers", "hooks", "systemOwners"], ["lethalityPolicy", "deathCauseId"], path); const id = string(item.id, `${path}.id`); if (threatIds.has(id)) fail("riskPack.threats", `duplicate ${id}`); threatIds.add(id); strings(item.tags, `${path}.tags`); string(item.category, `${path}.category`); validateCheck(item.checkSpec, `${path}.checkSpec`); const outcomesValue = object(item.outcomeTable, `${path}.outcomeTable`); exact(outcomesValue, ["greatSuccess", "success", "costlySuccess", "failure"], [], `${path}.outcomeTable`); for (const tier of ["greatSuccess", "success", "costlySuccess", "failure"]) validateConsequence(outcomesValue[tier], conditionIds, `${path}.outcomeTable.${tier}`); if (item.lethalityPolicy !== undefined) { const policy = object(item.lethalityPolicy, `${path}.lethalityPolicy`); exact(policy, ["lethalOnFailure", "requiresPublicWarning", "prerequisites"], [], `${path}.lethalityPolicy`); if (policy.lethalOnFailure !== true || policy.requiresPublicWarning !== true) fail(`${path}.lethalityPolicy`, "lethal flags must be true"); if (!Array.isArray(policy.prerequisites) || policy.prerequisites.length === 0) fail(`${path}.lethalityPolicy.prerequisites`, "must contain a whitelist ConditionExpr"); policy.prerequisites.forEach((condition, conditionIndex) => validateCondition(condition, `${path}.lethalityPolicy.prerequisites[${conditionIndex}]`)); const deathCauseId = string(item.deathCauseId, `${path}.deathCauseId`); if (!deathIds.has(deathCauseId)) fail(`${path}.deathCauseId`, "unknown DeathCauseDefinition"); } else if (item.deathCauseId !== undefined) fail(`${path}.deathCauseId`, "requires lethalityPolicy"); });
  const manifest = object(pack.manifest, "riskPack.manifest"); exact(manifest, ["threatCount", "riskConditionCount", "deathCauseCount"], [], "riskPack.manifest"); if (integer(manifest.threatCount, "riskPack.manifest.threatCount") !== threatIds.size || integer(manifest.riskConditionCount, "riskPack.manifest.riskConditionCount") !== conditionIds.size || integer(manifest.deathCauseCount, "riskPack.manifest.deathCauseCount") !== deathIds.size) fail("riskPack.manifest", "counts do not match registries");
  return value as RiskPack;
}

function deepFreeze<T>(value: T): T { if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze)) as T; if (typeof value !== "object" || value === null) return value; const result: Record<string, unknown> = {}; for (const [key, entry] of Object.entries(value as Record<string, unknown>)) result[key] = deepFreeze(entry); return Object.freeze(result) as T; }
const PACKS = new Map([[RISK_V1.id, deepFreeze(validateRiskPack(RISK_V1))]]);
export function getRiskPack(id: string): RiskPack { const pack = PACKS.get(id); if (pack === undefined) throw new RangeError(`unknown risk pack ${id}`); return pack; }
