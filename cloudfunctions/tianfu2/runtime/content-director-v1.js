// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/content/src/director-v1.ts
// Source sha256:   4ab71ca6acb8d69c8c05a2596660f177d0c93bbd2fcc69b8685d8fb247312ebb
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
                                                               

                                           
function fail(path        , message        )        { throw new TypeError(`${path}: ${message}`); }
function object(value         , path        )              { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object"); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object"); return value               ; }
function exact(value             , required                   , path        )       { const allowed = new Set(required); for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed"); for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required"); }
function string(value         , path        )         { if (typeof value !== "string" || value.length === 0) fail(path, "must be non-empty string"); return value; }
function integer(value         , path        , min         , max         )         { if (typeof value !== "number" || !Number.isSafeInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) fail(path, "must be a safe integer in range"); return value; }
function json(value         , path        )       { if (value === null || typeof value === "string" || typeof value === "boolean") return; if (typeof value === "number") { integer(value, path); return; } if (Array.isArray(value)) { value.forEach((entry, index) => json(entry, `${path}[${index}]`)); return; } if (typeof value !== "object") fail(path, "executable value is forbidden"); for (const [key, entry] of Object.entries(object(value, path))) { if (["script", "eval", "function", "code"].includes(key)) fail(`${path}.${key}`, "dynamic code is forbidden"); json(entry, `${path}.${key}`); } }

function validateDirectorPack(value         )               {
  json(value, "directorPack"); const pack = object(value, "directorPack"); exact(pack, ["id", "version", "rulesVersion", "systemOwners", "rules"], "directorPack");
  string(pack.id, "directorPack.id"); integer(pack.version, "directorPack.version", 1); string(pack.rulesVersion, "directorPack.rulesVersion"); if (!Array.isArray(pack.systemOwners) || pack.systemOwners.length === 0 || pack.systemOwners.some((entry, index) => string(entry, `directorPack.systemOwners[${index}]`) !== "DIRECTOR01")) fail("directorPack.systemOwners", "must contain DIRECTOR01 only");
  const rules = object(pack.rules, "directorPack.rules"); exact(rules, ["recentWindowSize", "continuityWindow", "noveltyWindow", "firstRunWindowNodes", "majorSalienceThreshold", "majorGapNodes", "randomDangerGapNodes", "contextualGapScenes", "baseWeightDefault", "baseWeightMin", "baseWeightMax", "actionAffinityBonus", "buildEmergingBonus", "buildFormedBonus", "buildRefinedBonus", "worldAffinityBonus", "recentNpcContinuityBonus", "continuityOverlapBonus", "continuityBonusCap", "topicNoveltyBonus", "exactEventRecentPenalty", "consecutiveTopicPenalty", "consecutiveTopicPenaltyCap"], "directorPack.rules");
  for (const key of ["recentWindowSize", "continuityWindow", "noveltyWindow", "firstRunWindowNodes", "majorSalienceThreshold", "majorGapNodes", "randomDangerGapNodes", "contextualGapScenes", "baseWeightDefault", "baseWeightMin", "baseWeightMax", "actionAffinityBonus", "buildEmergingBonus", "buildFormedBonus", "buildRefinedBonus", "worldAffinityBonus", "recentNpcContinuityBonus", "continuityOverlapBonus", "continuityBonusCap", "topicNoveltyBonus", "exactEventRecentPenalty", "consecutiveTopicPenalty", "consecutiveTopicPenaltyCap"]) integer(rules[key], `directorPack.rules.${key}`, 0);
  if (rules.recentWindowSize !== 8 || rules.continuityWindow !== 3 || rules.firstRunWindowNodes !== 3 || rules.majorSalienceThreshold !== 4 || rules.majorGapNodes !== 2 || rules.randomDangerGapNodes !== 1 || rules.contextualGapScenes !== 2) fail("directorPack.rules", "v1 pacing constants are frozen");
  if (rules.baseWeightMin !== 1 || rules.baseWeightMax !== 1000 || rules.baseWeightDefault !== 100) fail("directorPack.rules", "v1 weight bounds/default are frozen");
  return value                ;
}

const DIRECTOR_V1               = validateDirectorPack({
  id: "director.v1", version: 1, rulesVersion: "2.0.0", systemOwners: ["DIRECTOR01"],
  rules: {
    recentWindowSize: 8, continuityWindow: 3, noveltyWindow: 4, firstRunWindowNodes: 3,
    majorSalienceThreshold: 4, majorGapNodes: 2, randomDangerGapNodes: 1, contextualGapScenes: 2,
    baseWeightDefault: 100, baseWeightMin: 1, baseWeightMax: 1000,
    actionAffinityBonus: 80, buildEmergingBonus: 25, buildFormedBonus: 50, buildRefinedBonus: 75,
    worldAffinityBonus: 40, recentNpcContinuityBonus: 50, continuityOverlapBonus: 30, continuityBonusCap: 60,
    topicNoveltyBonus: 20, exactEventRecentPenalty: 80, consecutiveTopicPenalty: 30, consecutiveTopicPenaltyCap: 60
  }
});

function getDirectorPack(id        )               { if (id !== DIRECTOR_V1.id) throw new TypeError(`unknown Director pack: ${id}`); return DIRECTOR_V1; }

module.exports = Object.assign({}, {
  validateDirectorPack,
  DIRECTOR_V1,
  getDirectorPack
});
