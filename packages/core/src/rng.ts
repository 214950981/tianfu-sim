import { assertSafeInteger } from "./numeric.ts";
import { sha256Utf8 } from "./sha256.ts";

export const RNG_ALGORITHM_ID = "xoshiro128ss-v1" as const;
export const RNG_STREAM_IDS = [
  "offer", "time", "event", "check", "npc", "npcTimeline", "combat", "breakthrough", "director", "world"
] as const;

export type RngStreamId = typeof RNG_STREAM_IDS[number];
export type XoshiroState = readonly [number, number, number, number];
export interface RngStreamState {
  readonly s: XoshiroState;
  readonly drawIndex: number;
}
export interface RngState {
  readonly algorithmId: typeof RNG_ALGORITHM_ID;
  readonly rulesVersion: string;
  readonly rootSeed: string;
  readonly streams: Readonly<Record<RngStreamId, RngStreamState>>;
}
export interface RngTrace {
  readonly stream: RngStreamId;
  readonly index: number;
  readonly u32: number;
}

const UINT32_RANGE = 0x1_0000_0000;
const streamIdSet = new Set<string>(RNG_STREAM_IDS);

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
}

function assertStreamId(value: string): asserts value is RngStreamId {
  if (!streamIdSet.has(value)) throw new RangeError(`unknown RNG stream: ${value}`);
}

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) throw new RangeError(`${name} must be uint32`);
}

export function normalizeXoshiroState(words: readonly number[]): XoshiroState {
  if (words.length !== 4) throw new RangeError("xoshiro state must contain four words");
  words.forEach((word, index) => assertUint32(word, `state[${index}]`));
  const state: [number, number, number, number] = [words[0], words[1], words[2], words[3]];
  if (state.every((word) => word === 0)) state[3] = 1;
  return state;
}

export function seedStream(rulesVersion: string, rootSeed: string, streamId: RngStreamId): XoshiroState {
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

export function createRngState(rulesVersion: string, rootSeed: string): RngState {
  assertString(rulesVersion, "rulesVersion");
  assertString(rootSeed, "rootSeed");
  const streams = Object.fromEntries(RNG_STREAM_IDS.map((streamId) => [
    streamId,
    { s: seedStream(rulesVersion, rootSeed, streamId), drawIndex: 0 }
  ])) as unknown as Record<RngStreamId, RngStreamState>;
  return { algorithmId: RNG_ALGORITHM_ID, rulesVersion, rootSeed, streams };
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export function nextXoshiro128ss(state: XoshiroState): { readonly state: XoshiroState; readonly value: number } {
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

export function drawUint32(state: RngState, stream: RngStreamId): {
  readonly state: RngState;
  readonly value: number;
  readonly trace: RngTrace;
} {
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

export function drawInt(state: RngState, stream: RngStreamId, min: number, max: number): {
  readonly state: RngState;
  readonly value: number;
  readonly trace: readonly RngTrace[];
} {
  assertSafeInteger(min, "min");
  assertSafeInteger(max, "max");
  if (max < min) throw new RangeError("max must be >= min");
  const range = max - min + 1;
  if (!Number.isSafeInteger(range) || range > UINT32_RANGE) {
    throw new RangeError("integer draw range must be between 1 and 2^32");
  }
  const limit = Math.floor(UINT32_RANGE / range) * range;
  const trace: RngTrace[] = [];
  let nextState = state;
  while (true) {
    const draw = drawUint32(nextState, stream);
    nextState = draw.state;
    trace.push(draw.trace);
    if (draw.value < limit) return { state: nextState, value: min + (draw.value % range), trace };
  }
}

export function drawBps(state: RngState, stream: RngStreamId) {
  return drawInt(state, stream, 0, 9_999);
}
