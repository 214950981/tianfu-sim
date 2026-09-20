import assert from "node:assert/strict";
import test from "node:test";

import { identity } from "../packages/core/src/index.ts";

test("Core identity is pure and preserves its input", () => {
  const input = Object.freeze({ value: 2 });
  assert.strictEqual(identity(input), input);
  assert.deepEqual(input, { value: 2 });
});
