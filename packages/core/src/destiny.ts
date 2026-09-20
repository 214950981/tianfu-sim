import { drawInt, type RngState, type RngTrace } from "./rng.ts";

export interface DestinySelection {
  destinyIds: [string, string, string];
  rng: RngState;
  trace: RngTrace[];
}

export function selectDestinyCandidates(rng: RngState, candidateIds: readonly string[]): DestinySelection {
  if (!Array.isArray(candidateIds) || candidateIds.length < 3) throw new RangeError("at least three destiny candidates are required");
  const pool = [...candidateIds];
  if (pool.some((id) => typeof id !== "string" || id.length === 0)) throw new TypeError("destiny IDs must be non-empty strings");
  if (new Set(pool).size !== pool.length) throw new RangeError("destiny IDs must be unique");
  pool.sort((left, right) => left.localeCompare(right));
  const selected: string[] = [];
  const trace: RngTrace[] = [];
  let nextRng = rng;
  for (let index = 0; index < 3; index += 1) {
    const draw = drawInt(nextRng, "offer", 0, pool.length - 1);
    nextRng = draw.state;
    trace.push(...draw.trace);
    selected.push(pool.splice(draw.value, 1)[0]);
  }
  return { destinyIds: selected as [string, string, string], rng: nextRng, trace };
}
