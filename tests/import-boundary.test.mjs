import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("clean Core passes the import boundary", () => {
  const result = spawnSync(process.execPath, ["tools/check-import-boundaries.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("forbidden Core fixture fails the import boundary", () => {
  const result = spawnSync(
    process.execPath,
    ["tools/check-import-boundaries.mjs", "--root", "tests/fixtures/core-forbidden"],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden import/);
});
