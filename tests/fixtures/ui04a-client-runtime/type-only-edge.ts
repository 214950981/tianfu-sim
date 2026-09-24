/**
 * UI04A control — a *type-only* import of a gameplay type.
 *
 * The compiler erases it, so it creates no runtime edge and must therefore NOT fail
 * `tools/ui04a-client-runtime-audit.mjs`. This control is what proves the audit walks the runtime
 * graph instead of substring-matching the word `packages/core`.
 *
 * Not product code; never imported.
 */
import type { GameState } from "../../../packages/core/src/state.ts";

export type LeakedStateShape = GameState;
