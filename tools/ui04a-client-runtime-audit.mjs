#!/usr/bin/env node
/**
 * UI04A — client-runtime dependency audit.
 *
 * Walks the **runtime** import graph of the client packages and fails if that graph reaches the
 * gameplay Core package (`packages/core/**`, including its barrel and the compat shim), any Content
 * implementation (`packages/content/**`) or `server/**`.
 *
 * Why the graph and not a text grep: the boundary this task exists to create is a *runtime* one.
 * `import type ...` is erased by the compiler and therefore creates no runtime edge, so a type-only
 * import of a gameplay type is allowed and must NOT fail this audit. The audit proves that by
 * driving `tests/fixtures/ui04a-client-runtime/type-only-edge.ts` to exit 0 while
 * `.../forbidden-edge.ts` exits 1.
 *
 * Usage:
 *   node tools/ui04a-client-runtime-audit.mjs
 *   node tools/ui04a-client-runtime-audit.mjs --root <file> [--root <file> ...]
 *
 * Exit codes: 0 = every root's runtime closure is client-safe; 1 = at least one forbidden edge (or
 * an unresolvable specifier / a failed non-vacuity expectation).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const DEFAULT_ROOTS = [
  "packages/application-ui/src/index.ts",
  "packages/wechat-shell/src/index.ts"
];

/**
 * Either root is expected to reach these modules at runtime. A closure that lost the wire codec
 * would mean the audit is passing because the client stopped importing anything — vacuously green.
 * Keyed by the exact root path so an arbitrary negative-control fixture is not held to it.
 */
const REQUIRED_REACHABILITY = {
  "packages/application-ui/src/index.ts": ["packages/command-wire/src/index.ts"],
  "packages/wechat-shell/src/index.ts": ["packages/application-ui/src/index.ts", "packages/command-wire/src/index.ts"]
};

/** Forbidden runtime destinations, as repo-relative path prefixes. */
const FORBIDDEN_TREES = [
  { prefix: "packages/core/", label: "gameplay Core (including the Core barrel and the compat shim)" },
  { prefix: "packages/content/", label: "Content implementation" },
  { prefix: "server/", label: "server layer" }
];

/**
 * The gameplay modules the task names explicitly. `packages/core/**` is already fully forbidden —
 * this list exists only so a violation points at the exact module rather than at a package.
 */
const NAMED_GAMEPLAY_MODULES = [
  "packages/core/src/reducer.ts",
  "packages/core/src/state.ts",
  "packages/core/src/rng.ts",
  "packages/core/src/destiny.ts",
  "packages/core/src/event.ts",
  "packages/core/src/cause.ts",
  "packages/core/src/progression.ts",
  "packages/core/src/risk.ts",
  "packages/core/src/build.ts",
  "packages/core/src/npc.ts",
  "packages/core/src/director.ts",
  "packages/core/src/participants.ts",
  "packages/core/src/persistence.ts",
  "packages/core/src/index.ts",
  "packages/core/src/command.ts"
];

const SOURCE_EXTENSIONS = [".ts", ".mts", ".cts", ".mjs", ".js", ".cjs"];

const toRepoPath = (absolute) => relative(REPO_ROOT, absolute).split(sep).join("/");

/** `import type ... from`, `export type ... from`, `import { type A, type B } from`, `import {} from`. */
function isTypeOnlyClause(statement) {
  if (/^\s*(?:import|export)\s+type\b/.test(statement)) return true;
  const named = statement.match(/\{([\s\S]*?)\}/);
  if (named === null) return false;
  const clauses = named[1].split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (clauses.length === 0) return false;
  if (!clauses.every((entry) => /^type\s/.test(entry))) return false;
  // a default or namespace binding outside the braces is always a runtime binding
  const outside = statement.slice(0, statement.indexOf("{")).replace(/^\s*(?:import|export)\s*/, "").trim();
  return outside.length === 0;
}

/**
 * Runtime import/export specifiers of one file.
 *
 * Comments are stripped first so a documented specifier inside prose is never read as a real edge;
 * the specifiers themselves are string literals, so string bodies must NOT be masked.
 */
function runtimeSpecifiers(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const found = new Set();
  const statements = [];
  for (const pattern of [/\b(?:import|export)\b[^;]*?\sfrom\s*["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g]) {
    for (const match of code.matchAll(pattern)) statements.push({ statement: match[0], specifier: match[1] });
  }
  for (const { statement, specifier } of statements) {
    if (isTypeOnlyClause(statement)) continue;
    found.add(specifier);
  }
  for (const pattern of [/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const match of code.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

/** Resolves one relative specifier to an existing source file, or throws (fail closed). */
function resolveSpecifier(importerAbsolute, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null; // bare/package specifier: not a repo edge
  const base = resolve(dirname(importerAbsolute), specifier);
  const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => base + extension), ...SOURCE_EXTENSIONS.map((extension) => join(base, "index" + extension))];
  const hit = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (hit === undefined) throw new Error(`${toRepoPath(importerAbsolute)}: cannot resolve relative specifier "${specifier}"`);
  return hit;
}

function closureOf(rootAbsolute) {
  const closure = new Set();
  const queue = [rootAbsolute];
  while (queue.length > 0) {
    const file = queue.shift();
    if (closure.has(file)) continue;
    closure.add(file);
    for (const specifier of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved !== null && !closure.has(resolved)) queue.push(resolved);
    }
  }
  return [...closure].map(toRepoPath).sort();
}

/**
 * Audits every root's runtime closure. Pure: it reads the repository and returns a result, so a test
 * can import it and get the same verdict the CLI prints without spawning a child process.
 */
export function auditClientRuntime(roots = DEFAULT_ROOTS) {
  const normalizedRoots = roots.map((entry) => toRepoPath(resolve(REPO_ROOT, entry)));
  const violations = [];
  const report = [];
  for (const root of normalizedRoots) {
    const absolute = resolve(REPO_ROOT, root);
    if (!existsSync(absolute)) {
      violations.push(`${root}: audit root does not exist`);
      continue;
    }
    let closure;
    try {
      closure = closureOf(absolute);
    } catch (error) {
      violations.push(error.message);
      continue;
    }
    report.push(`${root}: runtime closure = [${closure.join(", ")}]`);

    for (const file of closure) {
      for (const { prefix, label } of FORBIDDEN_TREES) {
        if (!file.startsWith(prefix)) continue;
        const named = NAMED_GAMEPLAY_MODULES.includes(file) ? ` (gameplay module: ${file.split("/").pop()})` : "";
        violations.push(`${root}: forbidden client runtime dependency -> ${file}${named} [${label}]`);
      }
    }
    for (const required of REQUIRED_REACHABILITY[root] ?? []) {
      if (!closure.includes(required)) violations.push(`${root}: expected runtime closure to include ${required}; the audit would be vacuously green`);
    }
  }
  return { roots: normalizedRoots, violations, report };
}

export function formatAuditReport(result) {
  return result.violations.length > 0 ? result.violations.join("\n") : [...result.report, "UI04A client runtime boundary: PASS"].join("\n");
}

const isDirectRun = process.argv[1] !== undefined &&
  resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04a-client-runtime-audit.mjs");

if (isDirectRun) {
  const requested = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--root") requested.push(process.argv[index + 1]);
  }
  const result = auditClientRuntime(requested.length > 0 ? requested : DEFAULT_ROOTS);
  if (result.violations.length > 0) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(formatAuditReport(result));
  }
}
