import { assertSafeInteger } from "../../core/src/numeric.ts";
import { PROGRESSION_MODIFIER_KEYS, type MajorDestinyDefinition, type ProgressionDefinition, type ProgressionModifier, type ProgressionPack, type SpiritualRootProfile, type TalentDefinition } from "../../core/src/progression.ts";

const OWNERS = new Set(["PROG01", "RISK01", "BUILD01", "NPC01", "DIRECTOR01", "COMBAT01", "CONTENT01"]);
export const PROGRESSION_HOOK_WHITELIST = ["progression.retreat.afterGain", "progression.breakthrough.afterOutcome"] as const;
const modifierKeys = new Set<string>(PROGRESSION_MODIFIER_KEYS); const hookIds = new Set<string>(PROGRESSION_HOOK_WHITELIST);

const modifier = (kind: ProgressionModifier["kind"], value: number): ProgressionModifier => ({ kind, value, systemOwner: "PROG01" });
const baseDefinition = (id: string, displayName: string, category: string, systemOwners: string[], modifiers: ProgressionModifier[] = []): ProgressionDefinition => ({ id, displayName, category, tags: [`category:${category}`], modifiers, hooks: [], requiresTags: [], forbidsTags: [], exclusiveGroups: [], systemOwners });

export const SPIRITUAL_ROOTS_V1: SpiritualRootProfile[] = [
  ["root.heavenly", "天灵根", ["element:pure"], [1800, -700, -15, -300]],
  ["root.dual", "双灵根", ["element:dual"], [800, 300, 0, 0]],
  ["root.triple", "三灵根", ["element:triple"], [-200, 900, 10, 300]],
  ["root.five-elements", "五行灵根", ["element:metal", "element:wood", "element:water", "element:fire", "element:earth"], [-1000, 1500, 20, 800]],
  ["root.variant", "异灵根", ["element:variant"], [1200, -500, 15, -100]],
  ["root.primordial", "混元灵根", ["element:primordial"], [-500, 700, -25, 500]],
  ["root.hidden", "隐灵根", ["element:hidden"], [-700, 300, -45, 300]],
  ["root.damaged", "残灵根", ["element:damaged"], [-1200, -200, 35, 1200]]
].map(([id, displayName, elementTags, values]) => ({ ...baseDefinition(id as string, displayName as string, "spiritual-root", ["PROG01"], [modifier("cultivationGainRateDeltaBps", (values as number[])[0]), modifier("foundationGainRateDeltaBps", (values as number[])[1]), modifier("breakthroughDifficultyDelta", (values as number[])[2]), modifier("foundationRetentionDeltaBps", (values as number[])[3])]), elementTags: elementTags as string[] }));

const talentGroups: Array<[string, string, string[], string[]]> = [
  ["cultivation", "修炼", ["悟道早慧", "灵息绵长", "静水流深", "百脉通达"], ["PROG01"]],
  ["foundation", "根基", ["守一", "根深", "内景自洽", "百脉归元"], ["PROG01"]],
  ["breakthrough", "破境", ["破关感应", "凝元", "临关定念", "余势不散"], ["PROG01"]],
  ["insight", "悟性神识", ["过目不忘", "洞微", "灵台清明", "一念通达"], ["DIRECTOR01"]],
  ["survival", "体魄生存", ["天生神力", "铜皮铁骨", "生机旺盛", "百毒耐受"], ["RISK01"]],
  ["combat", "战斗", ["剑心", "临阵敏锐", "借势", "守势"], ["COMBAT01"]],
  ["craft", "丹器", ["丹心通明", "火候精微", "器感", "材性辨识"], ["BUILD01"]],
  ["exploration", "探索", ["寻幽探秘", "识途", "察险", "古迹共鸣"], ["DIRECTOR01"]],
  ["fortune", "福缘资源", ["聚财", "惜福", "灵物感应", "小吉常随"], ["DIRECTOR01"]],
  ["social", "人际", ["人缘通达", "识人", "言信", "师缘"], ["NPC01"]],
  ["cause", "因果", ["记恩", "记仇", "因缘敏感", "了缘"], ["DIRECTOR01"]],
  ["mindset", "心性", ["心如止水", "坚忍", "临危不乱", "执念深"], ["RISK01"]]
];
export const TALENTS_V1: TalentDefinition[] = talentGroups.flatMap(([categoryId, category, names, owners]) => names.map((displayName, index) => baseDefinition(`talent.${categoryId}.${String(index + 1).padStart(2, "0")}`, displayName, category, owners)));

const destinyGroups: Array<[string, string, string[], string[]]> = [
  ["breakthrough", "破境", ["破而后立", "向死而生", "厚积薄发", "天妒英才"], ["PROG01", "RISK01"]],
  ["years", "岁月", ["大器晚成", "少年得志", "岁月有偿", "枯木逢春"], ["RISK01"]],
  ["calamity", "劫数", ["劫数缠身", "福祸相依", "九死一生", "旧劫重临"], ["RISK01", "DIRECTOR01"]],
  ["fortune", "福运", ["鸿运照身", "小福长随", "失之东隅", "福尽则转"], ["DIRECTOR01"]],
  ["social", "人缘", ["贵人照命", "众生缘", "桃花入命", "孤星入命"], ["NPC01"]],
  ["cause", "因果", ["因果回环", "善缘不灭", "旧债催命", "一诺千金"], ["DIRECTOR01"]],
  ["encounter", "奇遇", ["奇缘频仍", "残卷引路", "宝地相逢", "山穷水尽"], ["DIRECTOR01", "CONTENT01"]],
  ["adversity", "逆境", ["劫后明心", "伤中悟道", "败中求变", "逆命而行"], ["RISK01", "PROG01"]],
  ["world", "天地", ["天门有隙", "尘缘深重", "四海为家", "命数难测"], ["DIRECTOR01"]]
];
export const MAJOR_DESTINIES_V1: MajorDestinyDefinition[] = destinyGroups.flatMap(([categoryId, category, names, owners]) => names.map((displayName, index) => baseDefinition(`destiny.major.${categoryId}.${String(index + 1).padStart(2, "0")}`, displayName, category, owners)));
export const PROGRESSION_EXPANSION_DESTINIES: MajorDestinyDefinition[] = ["宗门缘深", "散修之命", "乱世逢生", "名动一方"].map((name, index) => baseDefinition(`destiny.expansion.reserved.${String(index + 1).padStart(2, "0")}`, name, "未来Expansion Pack", ["CONTENT01"]));

export const PROGRESSION_V1: ProgressionPack = {
  id: "progression.v1", version: 1, rulesVersion: "2.0.0",
  manifest: { realmCount: 6, spiritualRootCount: 8, talentCount: 48, majorDestinyCount: 36 },
  realms: [
    { id: "mortal", displayName: "凡人", order: 0, lifespanCap: 80, retreatCultivationGain: 3200, retreatFoundationGain: 700, breakthroughDifficulty: 350, nextRealmId: "qi-refining" },
    { id: "qi-refining", displayName: "炼气", order: 1, lifespanCap: 120, retreatCultivationGain: 2800, retreatFoundationGain: 650, breakthroughDifficulty: 450, nextRealmId: "foundation-establishment" },
    { id: "foundation-establishment", displayName: "筑基", order: 2, lifespanCap: 180, retreatCultivationGain: 2400, retreatFoundationGain: 600, breakthroughDifficulty: 550, nextRealmId: "golden-core" },
    { id: "golden-core", displayName: "金丹", order: 3, lifespanCap: 300, retreatCultivationGain: 2000, retreatFoundationGain: 550, breakthroughDifficulty: 650, nextRealmId: "nascent-soul" },
    { id: "nascent-soul", displayName: "元婴", order: 4, lifespanCap: 500, retreatCultivationGain: 1600, retreatFoundationGain: 500, breakthroughDifficulty: 750, nextRealmId: "spirit-transformation" },
    { id: "spirit-transformation", displayName: "化神", order: 5, lifespanCap: 800, retreatCultivationGain: 1200, retreatFoundationGain: 450 }
  ],
  spiritualRoots: SPIRITUAL_ROOTS_V1, talents: TALENTS_V1, majorDestinies: MAJOR_DESTINIES_V1, hookWhitelist: [...PROGRESSION_HOOK_WHITELIST]
};

function requireSafe(value: unknown, path: string): asserts value is number { if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(`${path} must be a safe integer`); }
function uniqueIds(values: readonly { id: string }[], path: string): void { const ids = values.map((value) => value.id); if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new TypeError(`${path} IDs must be unique non-empty strings`); }
function stringArray(value: unknown, path: string): string[] { if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0) || new Set(value).size !== value.length) throw new TypeError(`${path} must contain unique non-empty strings`); return value as string[]; }
function validateDefinition(value: ProgressionDefinition, path: string, whitelist: Set<string>): void {
  if (typeof value !== "object" || value === null || typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.category !== "string") throw new TypeError(`${path} invalid definition`);
  const allowed = new Set(["id", "displayName", "category", "tags", "modifiers", "hooks", "requiresTags", "forbidsTags", "exclusiveGroups", "systemOwners", "elementTags"]); if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`${path} contains an unknown field`);
  for (const key of ["tags", "requiresTags", "forbidsTags", "exclusiveGroups", "systemOwners"] as const) stringArray(value[key], `${path}.${key}`); if (!Array.isArray(value.modifiers) || !Array.isArray(value.hooks)) throw new TypeError(`${path} modifiers/hooks must be arrays`);
  if (value.systemOwners.length === 0 || value.systemOwners.some((owner) => !OWNERS.has(owner))) throw new TypeError(`${path}.systemOwners invalid`);
  for (const item of value.modifiers) { if (typeof item !== "object" || item === null || Object.keys(item).sort().join(",") !== "kind,systemOwner,value" || !modifierKeys.has(item.kind) || !OWNERS.has(item.systemOwner)) throw new TypeError(`${path}.modifier invalid`); requireSafe(item.value, `${path}.modifier.value`); }
  for (const hook of value.hooks) { if (typeof hook !== "object" || hook === null || Object.keys(hook).sort().join(",") !== "id,order,systemOwner" || !whitelist.has(hook.id) || !OWNERS.has(hook.systemOwner)) throw new TypeError(`${path}.hook invalid`); requireSafe(hook.order, `${path}.hook.order`); }
  const rejectExecutable = (entry: unknown): void => { if (typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint" || entry === undefined) throw new TypeError(`${path} contains executable/non-JSON content`); if (Array.isArray(entry)) entry.forEach(rejectExecutable); else if (typeof entry === "object" && entry !== null) Object.values(entry).forEach(rejectExecutable); }; rejectExecutable(value);
  const serialized = JSON.stringify(value); if (serialized === undefined || /(?:eval\(|new Function)/.test(serialized)) throw new TypeError(`${path} contains executable content`);
}

export function validateProgressionPack(pack: ProgressionPack): ProgressionPack {
  if (pack.id.length === 0 || pack.version < 1 || pack.rulesVersion.length === 0) throw new TypeError("invalid progression pack identity");
  uniqueIds(pack.realms, "realms"); uniqueIds(pack.spiritualRoots, "spiritualRoots"); uniqueIds(pack.talents, "talents"); uniqueIds(pack.majorDestinies, "majorDestinies"); const whitelist = new Set(pack.hookWhitelist); if (whitelist.size !== pack.hookWhitelist.length) throw new TypeError("hook whitelist IDs must be unique");
  if (pack.manifest.realmCount !== pack.realms.length || pack.manifest.spiritualRootCount !== pack.spiritualRoots.length || pack.manifest.talentCount !== pack.talents.length || pack.manifest.majorDestinyCount !== pack.majorDestinies.length) throw new TypeError("progression manifest counts do not match content");
  const orders = new Set<number>(); for (const [index, realm] of pack.realms.entries()) { for (const key of ["order", "lifespanCap", "retreatCultivationGain", "retreatFoundationGain"] as const) { requireSafe(realm[key], `realms[${index}].${key}`); if (realm[key] < 0) throw new TypeError("realm values must be nonnegative"); } if (orders.has(realm.order)) throw new TypeError("realm order must be unique"); orders.add(realm.order); if (realm.breakthroughDifficulty !== undefined) { requireSafe(realm.breakthroughDifficulty, `realms[${index}].breakthroughDifficulty`); if (realm.breakthroughDifficulty < 0 || realm.breakthroughDifficulty > 1000) throw new TypeError("breakthroughDifficulty must be 0..1000"); } if (realm.nextRealmId !== undefined && !pack.realms.some((target) => target.id === realm.nextRealmId)) throw new TypeError("unknown nextRealmId"); }
  [...pack.spiritualRoots, ...pack.talents, ...pack.majorDestinies].forEach((definition, index) => validateDefinition(definition, `definitions[${index}]`, whitelist));
  pack.spiritualRoots.forEach((root, index) => { stringArray(root.elementTags, `spiritualRoots[${index}].elementTags`); });
  return pack;
}

function deepFreeze<T>(value: T): T { if (Array.isArray(value)) value.forEach(deepFreeze); else if (typeof value === "object" && value !== null) Object.values(value as Record<string, unknown>).forEach(deepFreeze); return Object.freeze(value); }
validateProgressionPack(PROGRESSION_V1); deepFreeze(PROGRESSION_V1); deepFreeze(PROGRESSION_EXPANSION_DESTINIES);
export function getProgressionPack(id: string): ProgressionPack { if (id !== PROGRESSION_V1.id) throw new RangeError(`unknown progression pack ${id}`); return PROGRESSION_V1; }
