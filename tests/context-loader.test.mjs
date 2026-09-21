import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ContextLoaderError, formatTaskContext, indexTaskDefinitions, loadTaskContext, parseTaskDefinition } from "../.codex/context-lib.mjs";
import { runPhase2DriftAudit } from "../tools/phase2-drift-audit.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(repoRoot, ".codex", "tests", "fixtures", "tasks", name);
function expectCode(code) { return (error) => error instanceof ContextLoaderError && error.code === code; }

test("A01-A12 remain discoverable with their legacy read/in/out schema", () => { for (let index = 1; index <= 12; index += 1) { const id = `A${String(index).padStart(2, "0")}`; const context = loadTaskContext(id, { repoRoot }); assert.equal(context.task.taskId, id); assert.equal(context.task.phase, 1); } });
for (const id of ["PROG01", "RISK01", "BUILD01", "NPC01", "DIRECTOR01"]) test(`${id} loads declared Phase 2 contracts and scope`, () => { const context = loadTaskContext(id, { repoRoot }); assert.equal(context.task.phase, 2); assert.ok(context.loadedContracts.length > 0); assert.ok(context.task.allowedScope.length > 0); assert.ok(context.task.forbiddenScope.length > 0); });
test("unknown taskId fails stably", () => assert.throws(() => loadTaskContext("DOES_NOT_EXIST", { repoRoot }), expectCode("UNKNOWN_TASK_ID")));
test("missing required contract fails stably", () => assert.throws(() => loadTaskContext("MISSING_REQUIRED", { repoRoot, taskDirectory: fixture("missing") }), expectCode("MISSING_REQUIRED_CONTRACT")));
test("missing optional contract is reported but does not fail", () => { const context = loadTaskContext("OPTIONAL_MISSING", { repoRoot, taskDirectory: fixture("optional") }); assert.equal(context.optionalContracts[0].present, false); });
test("malformed task definition is rejected", () => assert.throws(() => parseTaskDefinition("id: BAD\ntitle: bad\nunknown: value\n", "bad.yaml"), expectCode("MALFORMED_TASK")));
test("duplicate taskId is rejected", () => { const text = "id: DUPLICATE\ntitle: duplicate\nphase: 2\nrequiredContracts: []\n"; const a = parseTaskDefinition(text, "a.yaml"); const b = parseTaskDefinition(text, "b.yaml"); assert.throws(() => indexTaskDefinitions([a, b]), expectCode("DUPLICATE_TASK_ID")); });
test("path traversal and unsafe contract paths are rejected", () => assert.throws(() => loadTaskContext("UNSAFE_PATH", { repoRoot, taskDirectory: fixture("unsafe") }), (error) => error instanceof ContextLoaderError && ["UNSAFE_CONTRACT_PATH", "INVALID_CONTRACT_NAME"].includes(error.code)));
test("arbitrary execution syntax is rejected as data", () => assert.throws(() => parseTaskDefinition("id: EXEC\ntitle: bad\nphase: 2\nrequiredContracts: []\nscript: eval('x')\n", "exec.yaml"), (error) => error instanceof ContextLoaderError && ["UNSAFE_TASK_DEFINITION", "MALFORMED_TASK"].includes(error.code)));
test("TEST_PHASE2_EXTENSION is discovered without loader changes", () => { const context = loadTaskContext("TEST_PHASE2_EXTENSION", { repoRoot, taskDirectory: fixture("extension") }); assert.deepEqual(context.task.requiredContracts, [".codex/contracts/state.ref", ".codex/contracts/numeric.ref"]); assert.equal(context.loadedContracts.length, 2); });
test("context output and contract order are deterministic", () => { const first = formatTaskContext(loadTaskContext("DIRECTOR01", { repoRoot })); const second = formatTaskContext(loadTaskContext("DIRECTOR01", { repoRoot })); assert.equal(first, second); assert.ok(first.indexOf("director.ref") < first.indexOf("event.ref")); });
test("Phase 2 historical drift audit is deterministic and clean", () => { const first = runPhase2DriftAudit(repoRoot); const second = runPhase2DriftAudit(repoRoot); assert.deepEqual(first, second); assert.equal(first.status, "PASS"); assert.deepEqual(first.tasks.map((entry) => [entry.taskId, entry.status]), [["PROG01", "PASS"], ["RISK01", "PASS"], ["BUILD01", "PASS"], ["NPC01", "PASS"], ["DIRECTOR01", "PASS"]]); });
