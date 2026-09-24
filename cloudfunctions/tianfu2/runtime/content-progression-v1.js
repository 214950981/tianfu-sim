// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/content/src/progression-v1.ts
// Source sha256:   07aaa93f681f5aaf4b0a0a006c8a14d8503fc8e155ec411accebb7df5a823c16
// Generator:       tools/ui04d-cloud-runtime-artifact.mjs
// Regenerate:      node tools/ui04d-cloud-runtime-artifact.mjs --write
//
// Deployable CommonJS derived mechanically from the accepted TypeScript module above: type syntax is
// erased with Node's built-in type stripper and ES module syntax is rewritten to plain CommonJS.
// Nothing here was hand-copied — there is exactly one reducer, one CommandGateway, one ViewModel
// builder and one CONTENT01, and they live in the source modules named above.
//
// The closure is pinned to the required server Core/Content modules only: no client package (except
// command-wire, which Core's command module re-exports), no content audit or simulation tooling, and no
// Node builtin or third-party dependency. See docs/UI04D_CLOUD_BACKEND.md.
var { assertSafeInteger } = require("./core-numeric.js");
var { PROGRESSION_MODIFIER_KEYS } = require("./core-progression.js");

const OWNERS = new Set(["PROG01", "RISK01", "BUILD01", "NPC01", "DIRECTOR01", "COMBAT01", "CONTENT01"]);
const PROGRESSION_HOOK_WHITELIST = ["progression.retreat.afterGain", "progression.breakthrough.afterOutcome"]         ;
const modifierKeys = new Set        (PROGRESSION_MODIFIER_KEYS); const hookIds = new Set        (PROGRESSION_HOOK_WHITELIST);

const modifier = (kind                             , value        )                      => ({ kind, value, systemOwner: "PROG01" });
const baseDefinition = (id        , displayName        , category        , systemOwners          , modifiers                        = [])                        => ({ id, displayName, category, tags: [`category:${category}`], modifiers, hooks: [], requiresTags: [], forbidsTags: [], exclusiveGroups: [], systemOwners });

const SPIRITUAL_ROOTS_V1                         = [
  ["root.heavenly", "天灵根", ["element:pure"], [1800, -700, -15, -300]],
  ["root.dual", "双灵根", ["element:dual"], [800, 300, 0, 0]],
  ["root.triple", "三灵根", ["element:triple"], [-200, 900, 10, 300]],
  ["root.five-elements", "五行灵根", ["element:metal", "element:wood", "element:water", "element:fire", "element:earth"], [-1000, 1500, 20, 800]],
  ["root.variant", "异灵根", ["element:variant"], [1200, -500, 15, -100]],
  ["root.primordial", "混元灵根", ["element:primordial"], [-500, 700, -25, 500]],
  ["root.hidden", "隐灵根", ["element:hidden"], [-700, 300, -45, 300]],
  ["root.damaged", "残灵根", ["element:damaged"], [-1200, -200, 35, 1200]]
].map(([id, displayName, elementTags, values]) => ({ ...baseDefinition(id          , displayName          , "spiritual-root", ["PROG01"], [modifier("cultivationGainRateDeltaBps", (values            )[0]), modifier("foundationGainRateDeltaBps", (values            )[1]), modifier("breakthroughDifficultyDelta", (values            )[2]), modifier("foundationRetentionDeltaBps", (values            )[3])]), elementTags: elementTags             }));

const talentGroups                                              = [
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
const TALENTS_V1                     = talentGroups.flatMap(([categoryId, category, names, owners]) => names.map((displayName, index) => baseDefinition(`talent.${categoryId}.${String(index + 1).padStart(2, "0")}`, displayName, category, owners)));

const destinyGroups                                              = [
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
const MAJOR_DESTINIES_V1                           = destinyGroups.flatMap(([categoryId, category, names, owners]) => names.map((displayName, index) => baseDefinition(`destiny.major.${categoryId}.${String(index + 1).padStart(2, "0")}`, displayName, category, owners)));
const PROGRESSION_EXPANSION_DESTINIES                           = ["宗门缘深", "散修之命", "乱世逢生", "名动一方"].map((name, index) => baseDefinition(`destiny.expansion.reserved.${String(index + 1).padStart(2, "0")}`, name, "未来Expansion Pack", ["CONTENT01"]));

const PROGRESSION_V1                  = {
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

function requireSafe(value         , path        )                          { if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(`${path} must be a safe integer`); }
function uniqueIds(values                           , path        )       { const ids = values.map((value) => value.id); if (ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) throw new TypeError(`${path} IDs must be unique non-empty strings`); }
function stringArray(value         , path        )           { if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0) || new Set(value).size !== value.length) throw new TypeError(`${path} must contain unique non-empty strings`); return value            ; }
function validateDefinition(value                       , path        , whitelist             )       {
  if (typeof value !== "object" || value === null || typeof value.id !== "string" || typeof value.displayName !== "string" || typeof value.category !== "string") throw new TypeError(`${path} invalid definition`);
  const allowed = new Set(["id", "displayName", "category", "tags", "modifiers", "hooks", "requiresTags", "forbidsTags", "exclusiveGroups", "systemOwners", "elementTags"]); if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError(`${path} contains an unknown field`);
  for (const key of ["tags", "requiresTags", "forbidsTags", "exclusiveGroups", "systemOwners"]         ) stringArray(value[key], `${path}.${key}`); if (!Array.isArray(value.modifiers) || !Array.isArray(value.hooks)) throw new TypeError(`${path} modifiers/hooks must be arrays`);
  if (value.systemOwners.length === 0 || value.systemOwners.some((owner) => !OWNERS.has(owner))) throw new TypeError(`${path}.systemOwners invalid`);
  for (const item of value.modifiers) { if (typeof item !== "object" || item === null || Object.keys(item).sort().join(",") !== "kind,systemOwner,value" || !modifierKeys.has(item.kind) || !OWNERS.has(item.systemOwner)) throw new TypeError(`${path}.modifier invalid`); requireSafe(item.value, `${path}.modifier.value`); }
  for (const hook of value.hooks) { if (typeof hook !== "object" || hook === null || Object.keys(hook).sort().join(",") !== "id,order,systemOwner" || !whitelist.has(hook.id) || !OWNERS.has(hook.systemOwner)) throw new TypeError(`${path}.hook invalid`); requireSafe(hook.order, `${path}.hook.order`); }
  const rejectExecutable = (entry         )       => { if (typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint" || entry === undefined) throw new TypeError(`${path} contains executable/non-JSON content`); if (Array.isArray(entry)) entry.forEach(rejectExecutable); else if (typeof entry === "object" && entry !== null) Object.values(entry).forEach(rejectExecutable); }; rejectExecutable(value);
  const serialized = JSON.stringify(value); if (serialized === undefined || /(?:eval\(|new Function)/.test(serialized)) throw new TypeError(`${path} contains executable content`);
}

function validateProgressionPack(pack                 )                  {
  if (pack.id.length === 0 || pack.version < 1 || pack.rulesVersion.length === 0) throw new TypeError("invalid progression pack identity");
  uniqueIds(pack.realms, "realms"); uniqueIds(pack.spiritualRoots, "spiritualRoots"); uniqueIds(pack.talents, "talents"); uniqueIds(pack.majorDestinies, "majorDestinies"); const whitelist = new Set(pack.hookWhitelist); if (whitelist.size !== pack.hookWhitelist.length) throw new TypeError("hook whitelist IDs must be unique");
  if (pack.manifest.realmCount !== pack.realms.length || pack.manifest.spiritualRootCount !== pack.spiritualRoots.length || pack.manifest.talentCount !== pack.talents.length || pack.manifest.majorDestinyCount !== pack.majorDestinies.length) throw new TypeError("progression manifest counts do not match content");
  const orders = new Set        (); for (const [index, realm] of pack.realms.entries()) { for (const key of ["order", "lifespanCap", "retreatCultivationGain", "retreatFoundationGain"]         ) { requireSafe(realm[key], `realms[${index}].${key}`); if (realm[key] < 0) throw new TypeError("realm values must be nonnegative"); } if (orders.has(realm.order)) throw new TypeError("realm order must be unique"); orders.add(realm.order); if (realm.breakthroughDifficulty !== undefined) { requireSafe(realm.breakthroughDifficulty, `realms[${index}].breakthroughDifficulty`); if (realm.breakthroughDifficulty < 0 || realm.breakthroughDifficulty > 1000) throw new TypeError("breakthroughDifficulty must be 0..1000"); } if (realm.nextRealmId !== undefined && !pack.realms.some((target) => target.id === realm.nextRealmId)) throw new TypeError("unknown nextRealmId"); }
  [...pack.spiritualRoots, ...pack.talents, ...pack.majorDestinies].forEach((definition, index) => validateDefinition(definition, `definitions[${index}]`, whitelist));
  pack.spiritualRoots.forEach((root, index) => { stringArray(root.elementTags, `spiritualRoots[${index}].elementTags`); });
  return pack;
}

function deepFreeze   (value   )    { if (Array.isArray(value)) value.forEach(deepFreeze); else if (typeof value === "object" && value !== null) Object.values(value                           ).forEach(deepFreeze); return Object.freeze(value); }
validateProgressionPack(PROGRESSION_V1); deepFreeze(PROGRESSION_V1); deepFreeze(PROGRESSION_EXPANSION_DESTINIES);
function getProgressionPack(id        )                  { if (id !== PROGRESSION_V1.id) throw new RangeError(`unknown progression pack ${id}`); return PROGRESSION_V1; }

module.exports = Object.assign({}, {
  PROGRESSION_HOOK_WHITELIST,
  SPIRITUAL_ROOTS_V1,
  TALENTS_V1,
  MAJOR_DESTINIES_V1,
  PROGRESSION_EXPANSION_DESTINIES,
  PROGRESSION_V1,
  validateProgressionPack,
  getProgressionPack
});
