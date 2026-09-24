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

import { ContentRegistry } from "../../packages/content/src/registry.ts";
import { NPC_CONTENT01_V1 } from "../../packages/content/src/npc-content01-v1.ts";
import { CONTENT01_PACK, CONTENT01_VERSION } from "../../packages/content/src/content01-v1.ts";

/** The content version the live service serves. */
export const LIVE_CONTENT_VERSION = CONTENT01_VERSION;
/** The rules version locked by that pack; a run created here inherits it. */
export const LIVE_RULES_VERSION = CONTENT01_PACK.manifest.rulesVersion;

/**
 * Builds the authoritative live registry.
 *
 * Deterministic and side-effect free apart from the registry itself: registering the same packs twice
 * yields an identical registry, so a cold cloud-function start reproduces the accepted content exactly.
 */
export function createLiveContentRegistry(): ContentRegistry {
  const registry = new ContentRegistry();
  registry.registerNpcPack(NPC_CONTENT01_V1);
  registry.register(CONTENT01_PACK);
  return registry;
}
