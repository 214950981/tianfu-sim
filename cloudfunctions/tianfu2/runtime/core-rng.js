// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/rng.ts
// Source sha256:   cb116c3df59cf7402bd6287e39c56613744ea04c5153cc73963144780cacc2e8
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
var { sha256Utf8 } = require("./core-sha256.js");

const RNG_ALGORITHM_ID = "xoshiro128ss-v1"         ;
const RNG_STREAM_IDS = [
  "offer", "time", "event", "check", "npc", "npcTimeline", "combat", "breakthrough", "director", "world"
]         ;

                                                        
                                                                     
                                 
                           
                             
 
                           
                                                
                                
                            
                                                                  
 
                           
                               
                         
                       
 

const UINT32_RANGE = 0x1_0000_0000;
const streamIdSet = new Set        (RNG_STREAM_IDS);

function assertString(value         , name        )                          {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
}

function assertStreamId(value        )                               {
  if (!streamIdSet.has(value)) throw new RangeError(`unknown RNG stream: ${value}`);
}

function assertUint32(value        , name        )       {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) throw new RangeError(`${name} must be uint32`);
}

function normalizeXoshiroState(words                   )               {
  if (words.length !== 4) throw new RangeError("xoshiro state must contain four words");
  words.forEach((word, index) => assertUint32(word, `state[${index}]`));
  const state                                   = [words[0], words[1], words[2], words[3]];
  if (state.every((word) => word === 0)) state[3] = 1;
  return state;
}

function seedStream(rulesVersion        , rootSeed        , streamId             )               {
  assertString(rulesVersion, "rulesVersion");
  assertString(rootSeed, "rootSeed");
  assertStreamId(streamId);
  const digest = sha256Utf8(`tianfu2|rng|${rulesVersion}|${rootSeed}|${streamId}`);
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  return normalizeXoshiroState([
    view.getUint32(0, true),
    view.getUint32(4, true),
    view.getUint32(8, true),
    view.getUint32(12, true)
  ]);
}

function createRngState(rulesVersion        , rootSeed        )           {
  assertString(rulesVersion, "rulesVersion");
  assertString(rootSeed, "rootSeed");
  const streams = Object.fromEntries(RNG_STREAM_IDS.map((streamId) => [
    streamId,
    { s: seedStream(rulesVersion, rootSeed, streamId), drawIndex: 0 }
  ]))                                                  ;
  return { algorithmId: RNG_ALGORITHM_ID, rulesVersion, rootSeed, streams };
}

function rotateLeft(value        , bits        )         {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function nextXoshiro128ss(state              )                                                           {
  const normalized = normalizeXoshiroState(state);
  let [s0, s1, s2, s3] = normalized;
  const value = Math.imul(rotateLeft(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const shifted = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ shifted) >>> 0;
  s3 = rotateLeft(s3, 11);
  return { state: [s0, s1, s2, s3], value };
}

function drawUint32(state          , stream             )   
                           
                         
                           
  {
  assertStreamId(stream);
  const current = state.streams[stream];
  assertSafeInteger(current.drawIndex, "drawIndex");
  if (current.drawIndex < 0) throw new RangeError("drawIndex must be >= 0");
  const drawIndex = current.drawIndex;
  const next = nextXoshiro128ss(current.s);
  const nextDrawIndex = drawIndex + 1;
  if (!Number.isSafeInteger(nextDrawIndex)) throw new RangeError("drawIndex exceeds the safe range");
  return {
    state: {
      ...state,
      streams: { ...state.streams, [stream]: { s: next.state, drawIndex: nextDrawIndex } }
    },
    value: next.value,
    trace: { stream, index: drawIndex, u32: next.value }
  };
}

function drawInt(state          , stream             , min        , max        )   
                           
                         
                                      
  {
  assertSafeInteger(min, "min");
  assertSafeInteger(max, "max");
  if (max < min) throw new RangeError("max must be >= min");
  const range = max - min + 1;
  if (!Number.isSafeInteger(range) || range > UINT32_RANGE) {
    throw new RangeError("integer draw range must be between 1 and 2^32");
  }
  const limit = Math.floor(UINT32_RANGE / range) * range;
  const trace             = [];
  let nextState = state;
  while (true) {
    const draw = drawUint32(nextState, stream);
    nextState = draw.state;
    trace.push(draw.trace);
    if (draw.value < limit) return { state: nextState, value: min + (draw.value % range), trace };
  }
}

function drawBps(state          , stream             ) {
  return drawInt(state, stream, 0, 9_999);
}

module.exports = Object.assign({}, {
  RNG_ALGORITHM_ID,
  RNG_STREAM_IDS,
  normalizeXoshiroState,
  seedStream,
  createRngState,
  nextXoshiro128ss,
  drawUint32,
  drawInt,
  drawBps
});
