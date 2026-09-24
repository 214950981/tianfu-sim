// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/content/src/npc-content01-v1.ts
// Source sha256:   4420469b4e566506c686cb542ba38aff20d39072cf905b0a7e44b82fbfc6eb77
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
                                                                                            
var { NPC_V1, validateNpcPack } = require("./content-npc-v1.js");

const owner = ["NPC01", "CONTENT01"];
const tags = [
  "sword", "promise", "rivalry", "wounded", "wanderer", "alchemy", "healer", "medicine", "debt", "pragmatic",
  "body", "survival", "injury", "discipline", "fortune", "exploration", "secret", "risk", "opportunity", "mortal",
  "human-world", "memory", "time", "sect-disciple", "apprentice", "monster-hunter", "merchant", "traveler", "ruin-explorer",
  "dangerous", "steadfast", "observant", "reserved", "generous", "cautious", "bold", "patient", "honest"
];

const traits = [
  ["steadfast", ["steadfast"]], ["observant", ["observant"]], ["reserved", ["reserved"]], ["generous", ["generous"]],
  ["cautious", ["cautious"]], ["bold", ["bold"]], ["patient", ["patient"]], ["honest", ["honest"]]
].map(([id, traitTags]) => ({ id: `content01.trait.${id}`, poolIds: ["content01.trait-pool.common"], tags: traitTags            , systemOwners: owner }));

const facts = ["identity", "profession", "old-wound", "mortal-years", "trade"].map((id) => ({ id: `content01.fact.${id}`, tags: [id === "old-wound" ? "wounded" : id === "mortal-years" ? "time" : id === "trade" ? "merchant" : "memory"], systemOwners: owner }));

const CONTENT01_CORE_NPCS                  = [
  { id: "content01.npc.pei-zhaochuan", displayName: "裴照川", tags: ["sword", "promise", "rivalry", "wounded", "wanderer"], roleTags: ["sword", "wanderer"], fixedTraitTags: ["content01.trait.steadfast", "content01.trait.bold"], factDefinitions: ["content01.fact.identity", "content01.fact.old-wound"], systemOwners: owner },
  { id: "content01.npc.jiang-xuewu", displayName: "姜雪芜", tags: ["alchemy", "healer", "medicine", "debt", "pragmatic"], roleTags: ["alchemy", "healer"], fixedTraitTags: ["content01.trait.observant", "content01.trait.cautious"], factDefinitions: ["content01.fact.identity", "content01.fact.profession"], systemOwners: owner },
  { id: "content01.npc.cen-bugui", displayName: "岑不归", tags: ["body", "survival", "injury", "discipline", "wanderer"], roleTags: ["body", "wanderer"], fixedTraitTags: ["content01.trait.reserved", "content01.trait.patient"], factDefinitions: ["content01.fact.identity", "content01.fact.profession"], systemOwners: owner },
  { id: "content01.npc.xie-tingchao", displayName: "谢听潮", tags: ["fortune", "exploration", "secret", "risk", "opportunity"], roleTags: ["fortune", "ruin-explorer"], fixedTraitTags: ["content01.trait.observant", "content01.trait.bold"], factDefinitions: ["content01.fact.identity", "content01.fact.profession"], systemOwners: owner },
  { id: "content01.npc.xu-changan", displayName: "许长安", tags: ["mortal", "human-world", "promise", "memory", "time"], roleTags: ["mortal", "traveler"], fixedTraitTags: ["content01.trait.honest", "content01.trait.patient"], factDefinitions: ["content01.fact.identity", "content01.fact.mortal-years"], systemOwners: owner }
];

const archetype = (id        , displayLabel        , roleTags          , archetypeTags = roleTags)                         => ({
  id: `content01.archetype.${id}`, displayLabel, tags: archetypeTags, roleTags, namePoolId: "content01.name-pool.common",
  traitPoolIds: ["content01.trait-pool.common"], traitCount: 2, defaultFacts: ["content01.fact.identity"], systemOwners: owner
});

const CONTENT01_ARCHETYPES                           = [
  archetype("wandering-cultivator", "游方修士", ["wanderer"]),
  archetype("sect-disciple", "宗门弟子", ["sect-disciple"]),
  archetype("alchemy-apprentice", "丹师学徒", ["apprentice", "alchemy"]),
  archetype("monster-hunter", "猎妖人", ["monster-hunter", "survival"]),
  archetype("merchant-cultivator", "行商修士", ["merchant"]),
  archetype("mortal-traveler", "凡俗旅人", ["traveler", "mortal"]),
  archetype("ruin-explorer", "遗迹寻踪者", ["ruin-explorer", "exploration"]),
  archetype("dangerous-cultivator", "危险修士", ["dangerous", "wanderer"], ["dangerous", "risk", "wanderer"])
];

const NPC_CONTENT01_V1          = validateNpcPack({
  id: "npc.content01.v1", rulesVersion: "2.0.0", systemOwners: owner,
  tags,
  reasonTags: NPC_V1.reasonTags,
  rules: NPC_V1.rules,
  facts,
  traits,
  namePools: [{
    id: "content01.name-pool.common",
    names: ["沈砚", "陆微", "白榆", "闻舟", "祝青", "宁晦", "宋辞", "林照", "顾遥", "温迟", "杜衡", "叶川"].map((displayName, index) => ({ id: `content01.name.${String(index + 1).padStart(2, "0")}`, displayName })),
    systemOwners: owner
  }],
  coreDefinitions: CONTENT01_CORE_NPCS,
  archetypes: CONTENT01_ARCHETYPES
});

module.exports = Object.assign({}, {
  CONTENT01_CORE_NPCS,
  CONTENT01_ARCHETYPES,
  NPC_CONTENT01_V1
});
