// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/numeric.ts
// Source sha256:   79a9dc2fc2c009c9d180bfa90698efa928a36ac8a6678ea028e5940d8a98e2e6
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
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function assertSafeInteger(value        , name = "value")         {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a finite safe integer`);
  }
  return value;
}

function assertNonNegativeInteger(value        , name = "value")         {
  assertSafeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must be >= 0`);
  return value;
}

function assertBps(value        , name = "bps")         {
  assertSafeInteger(value, name);
  if (value < 0 || value > 10_000) throw new RangeError(`${name} must be between 0 and 10000`);
  return value;
}

function clampBps(value        )         {
  assertSafeInteger(value);
  return Math.min(10_000, Math.max(0, value));
}

function clampInteger(value        , min        , max        )         {
  assertSafeInteger(value);
  assertSafeInteger(min, "min");
  assertSafeInteger(max, "max");
  if (max < min) throw new RangeError("max must be >= min");
  return Math.min(max, Math.max(min, value));
}

function safeAdd(left        , right        )         {
  assertSafeInteger(left, "left");
  assertSafeInteger(right, "right");
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError("integer addition exceeds the safe range");
  return result;
}

function safeMultiply(left        , right        )         {
  assertSafeInteger(left, "left");
  assertSafeInteger(right, "right");
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError("integer multiplication exceeds the safe range");
  return result;
}

function roundHalfUpPositive(numerator        , denominator        )         {
  assertNonNegativeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) throw new RangeError("denominator must be > 0");
  return Math.floor(safeAdd(numerator, Math.floor(denominator / 2)) / denominator);
}

function applyBps(value        , bps        )         {
  assertNonNegativeInteger(value);
  assertBps(bps);
  return roundHalfUpPositive(safeMultiply(value, bps), 10_000);
}

function scaleSignedByBps(value        , bps        )         {
  assertSafeInteger(value);
  assertBps(bps);
  if (value === 0 || bps === 0) return 0;
  const magnitude = roundHalfUpPositive(safeMultiply(Math.abs(value), bps), 10_000);
  return value < 0 ? -magnitude : magnitude;
}

function isSafeRuleInteger(value         )                  {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_INTEGER;
}

module.exports = Object.assign({}, {
  assertSafeInteger,
  assertNonNegativeInteger,
  assertBps,
  clampBps,
  clampInteger,
  safeAdd,
  safeMultiply,
  roundHalfUpPositive,
  applyBps,
  scaleSignedByBps,
  isSafeRuleInteger
});
