// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/content/src/npc-v1.ts
// Source sha256:   5f1a3e1c23518da5d1586da9a0b7f2006021adfc82304e7644a45f1f865f5dc9
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
                                                     

                                     
const owners = new Set(["NPC01", "CONTENT01", "DIRECTOR01", "CAUSE01", "RISK01", "BUILD01"]);
const statuses = new Set(["active", "missing", "dead", "departed"]);

function fail(path        , message        )        { throw new TypeError(`${path}: ${message}`); }
function object(value         , path        )        { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object"); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object"); return value         ; }
function exact(value       , required                   , optional                   , path        )       { const allowed = new Set([...required, ...optional]); for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed"); for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required"); }
function string(value         , path        )         { if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string"); return value; }
function integer(value         , path        , min         , max         )         { if (typeof value !== "number" || !Number.isSafeInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) fail(path, "must be a safe integer in range"); return value; }
function strings(value         , path        )           { if (!Array.isArray(value)) fail(path, "must be an array"); const result = value.map((entry, index) => string(entry, `${path}[${index}]`)); if (new Set(result).size !== result.length) fail(path, "must be unique"); return result; }
function known(values          , allowed             , path        )       { values.forEach((value, index) => { if (!allowed.has(value)) fail(`${path}[${index}]`, `unknown reference ${value}`); }); }
function systemOwners(value         , path        )           { const result = strings(value, path); if (result.length === 0) fail(path, "must not be empty"); known(result, owners, path); return result; }
function json(value         , path        )       { if (value === null || typeof value === "string" || typeof value === "boolean") return; if (typeof value === "number") { if (!Number.isSafeInteger(value)) fail(path, "must use finite safe integers"); return; } if (Array.isArray(value)) { value.forEach((entry, index) => json(entry, `${path}[${index}]`)); return; } if (typeof value !== "object") fail(path, "must be finite JSON without executable values"); for (const [key, entry] of Object.entries(object(value, path))) { if (["script", "eval", "function", "code"].includes(key)) fail(`${path}.${key}`, "dynamic code is forbidden"); json(entry, `${path}.${key}`); } }
function uniqueIds(values           , path        )           { const ids = values.map((entry, index) => string(object(entry, `${path}[${index}]`).id, `${path}[${index}].id`)); if (new Set(ids).size !== ids.length) fail(path, "IDs must be unique"); return ids; }

function validateNpcPack(value         )          {
  json(value, "npcPack"); const pack = object(value, "npcPack");
  exact(pack, ["id", "rulesVersion", "rules", "tags", "reasonTags", "systemOwners", "coreDefinitions", "archetypes", "namePools", "traits", "facts"], [], "npcPack");
  string(pack.id, "npcPack.id"); string(pack.rulesVersion, "npcPack.rulesVersion"); systemOwners(pack.systemOwners, "npcPack.systemOwners");
  const tagSet = new Set(strings(pack.tags, "npcPack.tags")); const reasonSet = new Set(strings(pack.reasonTags, "npcPack.reasonTags")); if (reasonSet.size === 0) fail("npcPack.reasonTags", "must not be empty");
  const rules = object(pack.rules, "npcPack.rules"); exact(rules, ["version", "promotionThreshold", "significance", "relation", "milestoneTypes"], [], "npcPack.rules"); integer(rules.version, "npcPack.rules.version", 1); const promotionThreshold = integer(rules.promotionThreshold, "npcPack.rules.promotionThreshold", 0, 10_000);
  const significance = object(rules.significance, "npcPack.rules.significance"); exact(significance, ["min", "max", "authoringMin", "authoringMax"], [], "npcPack.rules.significance"); const sigMin = integer(significance.min, "npcPack.rules.significance.min", 0); const sigMax = integer(significance.max, "npcPack.rules.significance.max", sigMin, 10_000); const authoringMin = integer(significance.authoringMin, "npcPack.rules.significance.authoringMin", 1); const authoringMax = integer(significance.authoringMax, "npcPack.rules.significance.authoringMax", authoringMin); if (promotionThreshold < sigMin || promotionThreshold > sigMax) fail("npcPack.rules.promotionThreshold", "must be inside significance bounds");
  const relation = object(rules.relation, "npcPack.rules.relation"); exact(relation, ["affinityMin", "affinityMax", "trustMin", "trustMax", "debtMin", "debtMax", "affinityThresholds", "trustThresholds", "majorChangeThreshold"], [], "npcPack.rules.relation");
  if (integer(relation.affinityMin, "affinityMin", -100, 100) !== -100 || integer(relation.affinityMax, "affinityMax", -100, 100) !== 100 || integer(relation.trustMin, "trustMin", -100, 100) !== -100 || integer(relation.trustMax, "trustMax", -100, 100) !== 100 || integer(relation.debtMin, "debtMin", -3, 3) !== -3 || integer(relation.debtMax, "debtMax", -3, 3) !== 3) fail("npcPack.rules.relation", "v1 relation bounds are frozen");
  const affinityThresholds = object(relation.affinityThresholds, "npcPack.rules.relation.affinityThresholds"); exact(affinityThresholds, ["hostileMax", "distantMax", "neutralMax", "warmMax"], [], "affinityThresholds"); const affinityValues = ["hostileMax", "distantMax", "neutralMax", "warmMax"].map((key) => integer(affinityThresholds[key], `affinityThresholds.${key}`, -100, 99)); if (!affinityValues.every((entry, index) => index === 0 || affinityValues[index - 1] < entry)) fail("affinityThresholds", "must be strictly increasing");
  const trustThresholds = object(relation.trustThresholds, "npcPack.rules.relation.trustThresholds"); exact(trustThresholds, ["waryMax", "guardedMax", "familiarMax", "trustedMax"], [], "trustThresholds"); const trustValues = ["waryMax", "guardedMax", "familiarMax", "trustedMax"].map((key) => integer(trustThresholds[key], `trustThresholds.${key}`, -100, 99)); if (!trustValues.every((entry, index) => index === 0 || trustValues[index - 1] < entry)) fail("trustThresholds", "must be strictly increasing"); integer(relation.majorChangeThreshold, "majorChangeThreshold", 1, 200);
  const milestoneTypes = strings(rules.milestoneTypes, "npcPack.rules.milestoneTypes"); if (milestoneTypes.length === 0) fail("npcPack.rules.milestoneTypes", "must not be empty");
  for (const status of statuses) if (status.length === 0) fail("status", "invalid");

  if (!Array.isArray(pack.namePools) || !Array.isArray(pack.traits) || !Array.isArray(pack.facts) || !Array.isArray(pack.coreDefinitions) || !Array.isArray(pack.archetypes)) fail("npcPack", "definition collections must be arrays");
  const namePoolIds = new Set(uniqueIds(pack.namePools, "npcPack.namePools")); const traitIds = new Set(uniqueIds(pack.traits, "npcPack.traits")); const factIds = new Set(uniqueIds(pack.facts, "npcPack.facts")); uniqueIds(pack.coreDefinitions, "npcPack.coreDefinitions"); uniqueIds(pack.archetypes, "npcPack.archetypes");
  const traitPoolIds = new Set        ();
  pack.namePools.forEach((raw, index) => { const item = object(raw, `namePools[${index}]`); exact(item, ["id", "names", "systemOwners"], [], `namePools[${index}]`); systemOwners(item.systemOwners, `namePools[${index}].systemOwners`); if (!Array.isArray(item.names) || item.names.length === 0) fail(`namePools[${index}].names`, "must not be empty"); const ids = item.names.map((rawName, nameIndex) => { const name = object(rawName, `namePools[${index}].names[${nameIndex}]`); exact(name, ["id", "displayName"], [], `namePools[${index}].names[${nameIndex}]`); string(name.displayName, `namePools[${index}].names[${nameIndex}].displayName`); return string(name.id, `namePools[${index}].names[${nameIndex}].id`); }); if (new Set(ids).size !== ids.length) fail(`namePools[${index}].names`, "IDs must be unique"); });
  pack.traits.forEach((raw, index) => { const item = object(raw, `traits[${index}]`); exact(item, ["id", "poolIds", "tags", "systemOwners"], [], `traits[${index}]`); const pools = strings(item.poolIds, `traits[${index}].poolIds`); pools.forEach((id) => traitPoolIds.add(id)); known(strings(item.tags, `traits[${index}].tags`), tagSet, `traits[${index}].tags`); systemOwners(item.systemOwners, `traits[${index}].systemOwners`); });
  pack.facts.forEach((raw, index) => { const item = object(raw, `facts[${index}]`); exact(item, ["id", "tags", "systemOwners"], [], `facts[${index}]`); known(strings(item.tags, `facts[${index}].tags`), tagSet, `facts[${index}].tags`); systemOwners(item.systemOwners, `facts[${index}].systemOwners`); });
  pack.coreDefinitions.forEach((raw, index) => { const item = object(raw, `coreDefinitions[${index}]`); exact(item, ["id", "displayName", "tags", "roleTags", "fixedTraitTags", "factDefinitions", "systemOwners"], [], `coreDefinitions[${index}]`); string(item.displayName, `coreDefinitions[${index}].displayName`); known(strings(item.tags, `coreDefinitions[${index}].tags`), tagSet, `coreDefinitions[${index}].tags`); known(strings(item.roleTags, `coreDefinitions[${index}].roleTags`), tagSet, `coreDefinitions[${index}].roleTags`); known(strings(item.fixedTraitTags, `coreDefinitions[${index}].fixedTraitTags`), traitIds, `coreDefinitions[${index}].fixedTraitTags`); known(strings(item.factDefinitions, `coreDefinitions[${index}].factDefinitions`), factIds, `coreDefinitions[${index}].factDefinitions`); systemOwners(item.systemOwners, `coreDefinitions[${index}].systemOwners`); });
  pack.archetypes.forEach((raw, index) => { const item = object(raw, `archetypes[${index}]`); exact(item, ["id", "displayLabel", "tags", "roleTags", "namePoolId", "traitPoolIds", "traitCount", "defaultFacts", "systemOwners"], [], `archetypes[${index}]`); string(item.displayLabel, `archetypes[${index}].displayLabel`); known(strings(item.tags, `archetypes[${index}].tags`), tagSet, `archetypes[${index}].tags`); known(strings(item.roleTags, `archetypes[${index}].roleTags`), tagSet, `archetypes[${index}].roleTags`); const poolId = string(item.namePoolId, `archetypes[${index}].namePoolId`); if (!namePoolIds.has(poolId)) fail(`archetypes[${index}].namePoolId`, "unknown NamePool"); const pools = strings(item.traitPoolIds, `archetypes[${index}].traitPoolIds`); pools.forEach((id) => { if (!traitPoolIds.has(id)) fail(`archetypes[${index}].traitPoolIds`, `unknown TraitPool ${id}`); }); const count = integer(item.traitCount, `archetypes[${index}].traitCount`, 0); const candidateCount = (pack.traits             ).filter((trait         ) => object(trait, "trait").poolIds instanceof Array && (object(trait, "trait").poolIds             ).some((id) => pools.includes(String(id)))).length; if (count > candidateCount) fail(`archetypes[${index}].traitCount`, "exceeds available unique traits"); known(strings(item.defaultFacts, `archetypes[${index}].defaultFacts`), factIds, `archetypes[${index}].defaultFacts`); systemOwners(item.systemOwners, `archetypes[${index}].systemOwners`); });
  return value           ;
}

const NPC_V1          = validateNpcPack({
  id: "npc.v1", rulesVersion: "2.0.0", systemOwners: ["NPC01"],
  tags: ["mentor", "wanderer", "merchant", "steadfast", "observant", "reserved", "generous", "npc-fixture"],
  reasonTags: ["npc.reason.first-encounter", "npc.reason.event", "npc.reason.aid", "npc.reason.conflict", "npc.reason.promise", "npc.reason.status", "npc.reason.cause"],
  rules: {
    version: 1, promotionThreshold: 3000,
    significance: { min: 0, max: 10000, authoringMin: 100, authoringMax: 3000 },
    relation: { affinityMin: -100, affinityMax: 100, trustMin: -100, trustMax: 100, debtMin: -3, debtMax: 3, affinityThresholds: { hostileMax: -41, distantMax: -11, neutralMax: 20, warmMax: 60 }, trustThresholds: { waryMax: -41, guardedMax: -11, familiarMax: 20, trustedMax: 60 }, majorChangeThreshold: 20 },
    milestoneTypes: ["firstEncounter", "majorRelationChange", "debtCreated", "debtResolved", "promotedToA", "statusChanged", "statusRevealed", "causeLinked", "importantPromise", "majorConflict", "majorAid"]
  },
  facts: [{ id: "npc.fact.identity", tags: ["npc-fixture"], systemOwners: ["NPC01"] }, { id: "npc.fact.trade", tags: ["merchant"], systemOwners: ["NPC01"] }],
  traits: [
    { id: "npc.trait.steadfast", poolIds: ["npc.trait-pool.common"], tags: ["steadfast"], systemOwners: ["NPC01"] },
    { id: "npc.trait.observant", poolIds: ["npc.trait-pool.common"], tags: ["observant"], systemOwners: ["NPC01"] },
    { id: "npc.trait.reserved", poolIds: ["npc.trait-pool.common"], tags: ["reserved"], systemOwners: ["NPC01"] },
    { id: "npc.trait.generous", poolIds: ["npc.trait-pool.common"], tags: ["generous"], systemOwners: ["NPC01"] }
  ],
  namePools: [{ id: "npc.name-pool.common", names: [{ id: "npc.name.an", displayName: "An" }, { id: "npc.name.luo", displayName: "Luo" }, { id: "npc.name.shen", displayName: "Shen" }, { id: "npc.name.yu", displayName: "Yu" }], systemOwners: ["NPC01"] }],
  coreDefinitions: [{ id: "dev.mysterious-mentor", displayName: "Mysterious Mentor", tags: ["mentor", "npc-fixture"], roleTags: ["mentor"], fixedTraitTags: ["npc.trait.reserved"], factDefinitions: ["npc.fact.identity"], systemOwners: ["NPC01"] }],
  archetypes: [
    { id: "npc.archetype.wanderer", displayLabel: "Wanderer", tags: ["wanderer"], roleTags: ["wanderer"], namePoolId: "npc.name-pool.common", traitPoolIds: ["npc.trait-pool.common"], traitCount: 2, defaultFacts: ["npc.fact.identity"], systemOwners: ["NPC01"] },
    { id: "npc.archetype.merchant", displayLabel: "Merchant", tags: ["merchant"], roleTags: ["merchant"], namePoolId: "npc.name-pool.common", traitPoolIds: ["npc.trait-pool.common"], traitCount: 2, defaultFacts: ["npc.fact.identity", "npc.fact.trade"], systemOwners: ["NPC01"] }
  ]
});

function getNpcPack(id        )          { if (id !== NPC_V1.id) throw new TypeError(`unknown NPC pack: ${id}`); return NPC_V1; }

module.exports = Object.assign({}, {
  validateNpcPack,
  NPC_V1,
  getNpcPack
});
