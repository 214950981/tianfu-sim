/**
 * UI04A negative control — a client runtime edge into gameplay Core.
 *
 * This file is NOT product code and is never imported by anything. It exists so
 * `tests/ui04a.test.mjs` can point `tools/ui04a-client-runtime-audit.mjs` at it and require a
 * non-zero exit: a green audit on the real roots is only meaningful if the audit can actually see
 * a forbidden gameplay runtime dependency.
 */
import { reduce } from "../../../packages/core/src/reducer.ts";

export const leakedReducer = reduce;
