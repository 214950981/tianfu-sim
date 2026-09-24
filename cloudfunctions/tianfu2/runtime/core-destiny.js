// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/destiny.ts
// Source sha256:   fb3640545932090b0526f7c66c16434e51154a16932b52b478ac07f794ac558a
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
var { drawInt } = require("./core-rng.js");

                                   
                                       
                
                    
 

function selectDestinyCandidates(rng          , candidateIds                   )                   {
  if (!Array.isArray(candidateIds) || candidateIds.length < 3) throw new RangeError("at least three destiny candidates are required");
  const pool = [...candidateIds];
  if (pool.some((id) => typeof id !== "string" || id.length === 0)) throw new TypeError("destiny IDs must be non-empty strings");
  if (new Set(pool).size !== pool.length) throw new RangeError("destiny IDs must be unique");
  pool.sort((left, right) => left.localeCompare(right));
  const selected           = [];
  const trace             = [];
  let nextRng = rng;
  for (let index = 0; index < 3; index += 1) {
    const draw = drawInt(nextRng, "offer", 0, pool.length - 1);
    nextRng = draw.state;
    trace.push(...draw.trace);
    selected.push(pool.splice(draw.value, 1)[0]);
  }
  return { destinyIds: selected                            , rng: nextRng, trace };
}

module.exports = Object.assign({}, {
  selectDestinyCandidates
});
