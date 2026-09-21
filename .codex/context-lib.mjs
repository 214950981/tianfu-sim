import fs from "node:fs";
import path from "node:path";

const ALLOWED_FIELDS = new Set(["id", "title", "phase", "read", "optional_read", "requiredContracts", "optionalContracts", "blockers", "inspect_first", "in", "out", "allowedScope", "forbiddenScope", "accept", "tests"]);
const LIST_FIELDS = new Set(["read", "optional_read", "requiredContracts", "optionalContracts", "blockers", "inspect_first", "in", "out", "allowedScope", "forbiddenScope", "accept", "tests"]);
const TASK_ID = /^[A-Z][A-Z0-9_]*$/;

export class ContextLoaderError extends Error {
  constructor(code, message, exitCode = 2) { super(`${code}: ${message}`); this.name = "ContextLoaderError"; this.code = code; this.exitCode = exitCode; }
}

function scalar(value) { const trimmed = value.trim(); if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1); return trimmed; }
function inlineList(value, source, key) { const trimmed = value.trim(); if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) throw new ContextLoaderError("MALFORMED_TASK", `${source} ${key} must be a YAML list`); const body = trimmed.slice(1, -1).trim(); return body === "" ? [] : body.split(",").map(scalar).filter(Boolean); }
function assertDataOnly(text, source) { if (/!!(?:js|javascript)|<%|\b(?:eval|Function)\s*\(/i.test(text)) throw new ContextLoaderError("UNSAFE_TASK_DEFINITION", `${source} contains executable syntax`); }

export function parseTaskDefinition(text, source = "task.yaml") {
  assertDataOnly(text, source);
  const result = {}; const seen = new Set(); const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index]; if (line.trim() === "" || line.trimStart().startsWith("#")) { index += 1; continue; }
    if (/\t/.test(line)) throw new ContextLoaderError("MALFORMED_TASK", `${source}:${index + 1} tabs are forbidden`);
    const match = /^([A-Za-z][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (!match) throw new ContextLoaderError("MALFORMED_TASK", `${source}:${index + 1} unsupported YAML structure`);
    const [, key, rest = ""] = match; if (!ALLOWED_FIELDS.has(key)) throw new ContextLoaderError("MALFORMED_TASK", `${source}:${index + 1} unknown field ${key}`); if (seen.has(key)) throw new ContextLoaderError("MALFORMED_TASK", `${source}:${index + 1} duplicate field ${key}`); seen.add(key);
    if (LIST_FIELDS.has(key)) {
      if (rest.trim() !== "") result[key] = inlineList(rest, source, key);
      else { const values = []; index += 1; while (index < lines.length) { const item = /^  -\s+(.+)$/.exec(lines[index]); if (!item) break; values.push(scalar(item[1])); index += 1; } result[key] = values; continue; }
    } else { if (rest.trim() === "") throw new ContextLoaderError("MALFORMED_TASK", `${source}:${index + 1} ${key} requires a scalar`); result[key] = scalar(rest); }
    index += 1;
  }
  if (!TASK_ID.test(result.id ?? "")) throw new ContextLoaderError("MALFORMED_TASK", `${source} has invalid id`);
  if (typeof result.title !== "string" || result.title.length === 0) throw new ContextLoaderError("MALFORMED_TASK", `${source} has no title`);
  if (typeof result.phase !== "string" || !/^[0-9]+$/.test(result.phase)) throw new ContextLoaderError("MALFORMED_TASK", `${source} has invalid phase`);
  const task = {
    taskId: result.id, title: result.title, phase: Number(result.phase),
    requiredContracts: result.requiredContracts ?? result.read ?? [], optionalContracts: result.optionalContracts ?? result.optional_read ?? [],
    blockers: result.blockers ?? [], allowedScope: result.allowedScope ?? result.in ?? [], forbiddenScope: result.forbiddenScope ?? result.out ?? [],
    inspectFirst: result.inspect_first ?? [], acceptance: result.accept ?? [], tests: result.tests ?? [], usesLegacyRead: result.requiredContracts === undefined, raw: text, source
  };
  for (const key of ["requiredContracts", "optionalContracts", "blockers", "allowedScope", "forbiddenScope", "inspectFirst", "acceptance", "tests"]) if (new Set(task[key]).size !== task[key].length) throw new ContextLoaderError("MALFORMED_TASK", `${source} has duplicate ${key} entries`);
  return task;
}

function inside(parent, child) { const relative = path.relative(parent, child); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
function assertTaskDirectory(repoRoot, taskDirectory) { const codexRoot = path.resolve(repoRoot, ".codex"); const resolved = path.resolve(taskDirectory); if (!inside(codexRoot, resolved)) throw new ContextLoaderError("UNSAFE_TASK_DIRECTORY", "task directory must stay inside repository .codex"); return resolved; }

export function indexTaskDefinitions(definitions) {
  const tasks = new Map(); for (const task of definitions) { if (tasks.has(task.taskId)) throw new ContextLoaderError("DUPLICATE_TASK_ID", task.taskId); tasks.set(task.taskId, task); } return tasks;
}

export function discoverTaskDefinitions({ repoRoot, taskDirectory = path.join(repoRoot, ".codex", "tasks") }) {
  const safeDirectory = assertTaskDirectory(repoRoot, taskDirectory); const files = fs.readdirSync(safeDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name) && entry.name.toUpperCase() !== "INDEX.YAML").map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  const definitions = files.map((file) => parseTaskDefinition(fs.readFileSync(path.join(safeDirectory, file), "utf8"), path.relative(repoRoot, path.join(safeDirectory, file)).replaceAll("\\", "/")));
  return indexTaskDefinitions(definitions);
}

function validateResourcePath(repoRoot, rel, strictContract) {
  if (typeof rel !== "string" || rel.length === 0 || rel.includes("\0") || path.isAbsolute(rel)) throw new ContextLoaderError("UNSAFE_CONTRACT_PATH", String(rel));
  const normalized = rel.replaceAll("\\", "/"); const segments = normalized.split("/"); if (segments.includes("..") || segments.includes(".")) throw new ContextLoaderError("UNSAFE_CONTRACT_PATH", rel);
  const valid = strictContract ? /^\.codex\/contracts\/[a-z0-9][a-z0-9-]*\.(?:ref|yaml)$/ : /^\.codex\/(?:contracts\/[A-Za-z0-9][A-Za-z0-9_-]*\.(?:ref|yaml)|[A-Za-z0-9][A-Za-z0-9_-]*\.yaml)$/;
  if (!valid.test(normalized)) throw new ContextLoaderError("INVALID_CONTRACT_NAME", rel);
  const resolved = path.resolve(repoRoot, ...segments); const codexRoot = path.resolve(repoRoot, ".codex"); if (!inside(codexRoot, resolved)) throw new ContextLoaderError("UNSAFE_CONTRACT_PATH", rel); return { rel: normalized, resolved };
}

function decisionEntries(text) { const matches = [...text.matchAll(/^  - id:\s*([A-Z0-9_]+)\s*$/gm)]; return matches.map((match, index) => ({ id: match[1], text: text.slice(match.index, matches[index + 1]?.index ?? text.length).trimEnd() })); }

export function loadTaskContext(taskId, { repoRoot, taskDirectory = path.join(repoRoot, ".codex", "tasks"), decisionsPath = path.join(repoRoot, ".codex", "DECISIONS.yaml") } = {}) {
  const normalizedId = String(taskId ?? "").toUpperCase(); if (!TASK_ID.test(normalizedId)) throw new ContextLoaderError("UNKNOWN_TASK_ID", String(taskId ?? ""));
  const tasks = discoverTaskDefinitions({ repoRoot, taskDirectory }); const task = tasks.get(normalizedId); if (task === undefined) throw new ContextLoaderError("UNKNOWN_TASK_ID", normalizedId);
  const required = task.requiredContracts.map((rel) => validateResourcePath(repoRoot, rel, !task.usesLegacyRead)); const optional = task.optionalContracts.map((rel) => validateResourcePath(repoRoot, rel, true));
  const loadedContracts = required.map(({ rel, resolved }) => { let text; try { text = fs.readFileSync(resolved, "utf8"); } catch { throw new ContextLoaderError("MISSING_REQUIRED_CONTRACT", rel, 3); } return { rel, text }; });
  const optionalContracts = optional.map(({ rel, resolved }) => { try { return { rel, present: true, text: fs.readFileSync(resolved, "utf8") }; } catch { return { rel, present: false }; } });
  const decisionsText = task.blockers.length === 0 ? "" : fs.readFileSync(decisionsPath, "utf8"); const decisions = decisionEntries(decisionsText); const blockerEntries = []; let blocked = false;
  for (const blocker of task.blockers) { const hit = decisions.find((entry) => entry.id === blocker); if (hit === undefined) { blockerEntries.push({ id: blocker, missing: true }); blocked = true; } else { const resolved = /\n\s*status:\s*resolved\s*(?:\n|$)/.test(`\n${hit.text}`); blockerEntries.push({ ...hit, resolved }); if (!resolved) blocked = true; } }
  if (blocked) throw new ContextLoaderError("BLOCKED", `resolve listed decision(s): ${task.blockers.join(",")}`, 3);
  return { task, loadedContracts, optionalContracts, blockerEntries };
}

export function formatTaskContext(context) {
  const { task } = context; const lines = [`=== ${task.source} ===`, task.raw.trimEnd(), "", "=== task-context ===", `taskId: ${task.taskId}`, `phase: ${task.phase}`, `requiredContracts: [${task.requiredContracts.join(",")}]`, `optionalContracts: [${task.optionalContracts.join(",")}]`, `blockers: [${task.blockers.join(",")}]`, `allowedScope: [${task.allowedScope.join(" | ")}]`, `forbiddenScope: [${task.forbiddenScope.join(" | ")}]`];
  for (const blocker of context.blockerEntries) lines.push("", `=== decision:${blocker.id} ===`, blocker.text);
  for (const contract of context.loadedContracts) lines.push("", `=== ${contract.rel} ===`, contract.text.trimEnd());
  for (const contract of context.optionalContracts) lines.push("", `=== optional:${contract.rel} (${contract.present ? "loaded" : "missing"}) ===`, ...(contract.present ? [contract.text.trimEnd()] : []));
  return `${lines.join("\n")}\n`;
}
