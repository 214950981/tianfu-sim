const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export function assertSafeInteger(value: number, name = "value"): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a finite safe integer`);
  }
  return value;
}

export function assertNonNegativeInteger(value: number, name = "value"): number {
  assertSafeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must be >= 0`);
  return value;
}

export function assertBps(value: number, name = "bps"): number {
  assertSafeInteger(value, name);
  if (value < 0 || value > 10_000) throw new RangeError(`${name} must be between 0 and 10000`);
  return value;
}

export function clampBps(value: number): number {
  assertSafeInteger(value);
  return Math.min(10_000, Math.max(0, value));
}

export function clampInteger(value: number, min: number, max: number): number {
  assertSafeInteger(value);
  assertSafeInteger(min, "min");
  assertSafeInteger(max, "max");
  if (max < min) throw new RangeError("max must be >= min");
  return Math.min(max, Math.max(min, value));
}

export function safeAdd(left: number, right: number): number {
  assertSafeInteger(left, "left");
  assertSafeInteger(right, "right");
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError("integer addition exceeds the safe range");
  return result;
}

export function safeMultiply(left: number, right: number): number {
  assertSafeInteger(left, "left");
  assertSafeInteger(right, "right");
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError("integer multiplication exceeds the safe range");
  return result;
}

export function roundHalfUpPositive(numerator: number, denominator: number): number {
  assertNonNegativeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) throw new RangeError("denominator must be > 0");
  return Math.floor(safeAdd(numerator, Math.floor(denominator / 2)) / denominator);
}

export function applyBps(value: number, bps: number): number {
  assertNonNegativeInteger(value);
  assertBps(bps);
  return roundHalfUpPositive(safeMultiply(value, bps), 10_000);
}

export function isSafeRuleInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_INTEGER;
}
