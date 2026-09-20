import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBps,
  assertBps,
  assertSafeInteger,
  clampBps,
  createRngState,
  drawBps,
  drawInt,
  drawUint32,
  normalizeXoshiroState,
  roundHalfUpPositive,
  safeAdd,
  safeMultiply
} from "../packages/core/src/index.ts";

function sequence(stream, count = 16) {
  let state = createRngState("2.0.0", "repeatable-seed");
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const draw = drawUint32(state, stream);
    state = draw.state;
    values.push(draw.value);
    assert.equal(draw.trace.index, index);
    assert.equal(draw.trace.stream, stream);
    assert.equal(draw.trace.u32, draw.value);
  }
  return values;
}

test("DET-001: same seed and stream remain identical across 100 runs", () => {
  const expected = sequence("event");
  for (let run = 0; run < 100; run += 1) assert.deepEqual(sequence("event"), expected);
});

test("DET-005: xoshiro128ss-v1 matches the golden vector", () => {
  let state = createRngState("2.0.0", "golden-seed");
  assert.deepEqual(state.streams.event.s, [1137076154, 3741420280, 1064336899, 1396082847]);
  const actual = [];
  for (let index = 0; index < 5; index += 1) {
    const draw = drawUint32(state, "event");
    state = draw.state;
    actual.push(draw.value);
  }
  assert.deepEqual(actual, [2729889173, 2725328737, 2738668089, 1297090597, 541249707]);
});

test("stream isolation: drawing offer never perturbs event", () => {
  let isolated = createRngState("2.0.0", "stream-isolation");
  const isolatedEvent = drawUint32(isolated, "event");

  let interleaved = createRngState("2.0.0", "stream-isolation");
  for (let index = 0; index < 20; index += 1) interleaved = drawUint32(interleaved, "offer").state;
  const interleavedEvent = drawUint32(interleaved, "event");

  assert.equal(interleavedEvent.value, isolatedEvent.value);
  assert.deepEqual(interleavedEvent.state.streams.event, isolatedEvent.state.streams.event);
});

test("all-zero xoshiro state sets the last word to one", () => {
  assert.deepEqual(normalizeXoshiroState([0, 0, 0, 0]), [0, 0, 0, 1]);
});

test("integer and bps draws are integral, bounded, and traced", () => {
  let state = createRngState("2.0.0", "integer-bounds");
  for (let index = 0; index < 100; index += 1) {
    const draw = drawInt(state, "check", -3, 3);
    state = draw.state;
    assert.ok(Number.isInteger(draw.value));
    assert.ok(draw.value >= -3 && draw.value <= 3);
    assert.ok(draw.trace.length >= 1);
  }
  const bps = drawBps(state, "check");
  assert.ok(Number.isInteger(bps.value));
  assert.ok(bps.value >= 0 && bps.value < 10_000);
});

test("numeric boundaries reject invalid and unsafe values", () => {
  for (const value of [NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertSafeInteger(value), RangeError);
  }
  for (const value of [-1, 10_001, 0.5]) assert.throws(() => assertBps(value), RangeError);
  assert.throws(() => safeAdd(Number.MAX_SAFE_INTEGER, 1), RangeError);
  assert.throws(() => safeMultiply(Number.MAX_SAFE_INTEGER, 2), RangeError);
  assert.throws(() => roundHalfUpPositive(-1, 1), RangeError);
  assert.throws(() => roundHalfUpPositive(1, 0), RangeError);
  assert.throws(() => drawInt(createRngState("2.0.0", "invalid"), "check", 2, 1), RangeError);
  assert.throws(() => drawInt(createRngState("2.0.0", "invalid"), "check", 0, 0x1_0000_0000), RangeError);
});

test("numeric helpers use integer basis-point semantics", () => {
  assert.equal(roundHalfUpPositive(4, 3), 1);
  assert.equal(roundHalfUpPositive(5, 3), 2);
  assert.equal(applyBps(3, 5_000), 2);
  assert.equal(clampBps(-5), 0);
  assert.equal(clampBps(12_000), 10_000);
});
