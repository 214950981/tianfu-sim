// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/live-content.ts
// Source sha256:   53b69eb2b96ad4c31f9a2388de859dc4ad37dc6c56673797b3abbb2a7c010790
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
/**
 * UI04D — the live content registry.
 *
 * The cloud backend must run the *real* content, not a fixture: the same CONTENT01 pack the accepted
 * simulator and preview generators use, with its CONTENT01 NPC pack registered alongside it. This module
 * is the only place that wiring lives, and it adds no content of its own — every pack it registers is an
 * accepted export from `packages/content`.
 *
 * CONTENT01 already names its dependencies by id (`progressionPackId`, `riskPackId`, `buildPackId`,
 * `npcPackId`, `directorPackId`); the registry resolves the first, third and fifth from its built-in
 * tables and the second from the module-level pack table. The NPC pack is the exception: `getNpcPack`
 * only knows the generic `npc.v1`, so CONTENT01's own NPC pack has to be registered explicitly before
 * the content pack that references it.
 */

var { ContentRegistry } = require("./content-registry.js");
var { NPC_CONTENT01_V1 } = require("./content-npc-content01-v1.js");
var { CONTENT01_PACK, CONTENT01_VERSION } = require("./content-content01-v1.js");

/** The content version the live service serves. */
const LIVE_CONTENT_VERSION = CONTENT01_VERSION;
/** The rules version locked by that pack; a run created here inherits it. */
const LIVE_RULES_VERSION = CONTENT01_PACK.manifest.rulesVersion;

/**
 * Builds the authoritative live registry.
 *
 * Deterministic and side-effect free apart from the registry itself: registering the same packs twice
 * yields an identical registry, so a cold cloud-function start reproduces the accepted content exactly.
 */
function createLiveContentRegistry()                  {
  const registry = new ContentRegistry();
  registry.registerNpcPack(NPC_CONTENT01_V1);
  registry.register(CONTENT01_PACK);
  return registry;
}

module.exports = Object.assign({}, {
  LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION,
  createLiveContentRegistry
});
