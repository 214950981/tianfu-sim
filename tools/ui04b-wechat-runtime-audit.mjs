/**
 * UI04B — generated-artifact audit for the WeChat client runtime.
 *
 * `tools/ui04b-wechat-runtime-artifact.mjs` owns generation; this tool audits the **committed bytes** as
 * an independent adversary. It does not trust the generator's own report: it re-reads
 * `miniprogram/runtime/`, rebuilds the artifact's runtime graph from its literal `require` calls, and
 * fails when the artifact reaches anything outside the approved client runtime closure.
 *
 * The checks, all fail-closed:
 *
 *  A. FILE SET. The committed directory contains exactly the four pinned files. An extra file is a
 *     violation, because that directory is generated output rather than a hand-managed source tree.
 *  B. EDGES. Every `require` argument in every artifact file is a plain string literal (the WeChat
 *     packager resolves dependencies by static analysis and cannot bundle a computed argument), and is
 *     exactly one of the sibling artifact specifiers. Anything else — a bare specifier, a `node:` prefix,
 *     a path that leaves `miniprogram/runtime/`, or a non-literal argument — is a violation. This is the
 *     mechanical meaning of "no Node-only runtime dependency in the artifact".
 *  C. CLOSURE. Walking that graph from the facade must reach every pinned module and nothing else, so
 *     neither an unreachable module nor a hidden dependency can hide inside the directory.
 *  D. FORBIDDEN CONTENT. Comment-masked code must not name `packages/core`, `packages/content` or
 *     `server`, and must not reference a Node runtime global. Scanned on *code only*: the generated
 *     modules legitimately keep the accepted sources' doc comments, and those comments discuss
 *     `packages/core` precisely because the boundary is what they document.
 *  E. IT IS JAVASCRIPT. Comment-masked code must contain no TypeScript-only syntax, so "the generated
 *     file is loadable" is not taken on trust.
 *  F. PROVENANCE. Each module file must carry the pinned source path and that source's current sha256.
 *     This catches a source edit that was not regenerated even before the byte comparison in `--write`
 *     mode would.
 *  G. BOUNDED FACADE. The facade's static `module.exports` keys must equal the pinned allow-list, so the
 *     published surface cannot silently grow.
 *
 * Usage:
 *   node tools/ui04b-wechat-runtime-audit.mjs
 *
 * Exit codes: 0 = the committed artifact is exactly the approved client runtime closure; 1 = a violation.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { nonLiteralRequireArguments, requireArguments } from "./ui02-preview-fixture-module.mjs";
import {
  ARTIFACT_PATHS,
  FACADE_PATH,
  FACADE_EXPORTS,
  REPO_ROOT,
  RUNTIME_DIR,
  RUNTIME_MODULES,
  codeOnly,
  sha256
} from "./ui04b-wechat-runtime-artifact.mjs";

/** Forbidden runtime destinations, named exactly the way a bad rewrite would spell them. */
const FORBIDDEN_TOKENS = [
  "packages/core/",
  "packages/content/",
  "server/src/",
  "packages/command-wire/src",
  "packages/application-ui/src",
  "packages/wechat-shell/src",
  "cloudfunctions/",
  "wx.request",
  "wx.cloud"
];

/** Node-runtime-only globals. Referencing one would mean the artifact is not a browser-like runtime module. */
const FORBIDDEN_NODE_GLOBALS = [
  ["process", /\bprocess\s*\./],
  ["__dirname", /\b__dirname\b/],
  ["__filename", /\b__filename\b/],
  ["Buffer", /\bBuffer\s*\./],
  ["child_process", /\bchild_process\b/],
  ["node: builtin", /\brequire\s*\(\s*["']node:/],
  ["fs/path/os/url builtin", /\brequire\s*\(\s*["'](?:fs|path|os|url|crypto|util|events|stream|net|http|https|vm|worker_threads)["']/]
];

/** TypeScript-only syntax. Its presence means the type stripper did not run, so the file is not loadable. */
const FORBIDDEN_TS_SYNTAX = [
  ["import type", /\bimport\s+type\b/],
  ["export type", /\bexport\s+type\b/],
  ["interface declaration", /\binterface\s+[A-Za-z_$]/],
  ["as const", /\bas\s+const\b/],
  ["satisfies operator", /\bsatisfies\b/],
  ["readonly modifier", /\breadonly\s/],
  ["declare modifier", /\bdeclare\s+(?:const|let|var|function|class|interface|type)\b/],
  ["enum declaration", /\benum\s+[A-Za-z_$]/]
];

/** The exact specifiers the artifact is allowed to use: sibling modules, nothing else. */
const ALLOWED_SPECIFIERS = RUNTIME_MODULES.map((entry) => entry.specifier);

function readCommittedFiles(root) {
  const directory = path.join(root, RUNTIME_DIR);
  const files = {};
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files[RUNTIME_DIR + "/" + entry.name] = fs.readFileSync(path.join(directory, entry.name), "utf8");
  }
  return files;
}

function defaultReadable(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

/**
 * The published property names of a generated facade, parsed statically from its code.
 *
 * Both publication forms count: the `module.exports = { … }` literal and any later direct assignment
 * (`module.exports.name = …`, `module.exports["name"] = …`). Reading only the literal would let a later
 * assignment widen the public surface without the audit noticing.
 */
export function facadeExportKeys(source) {
  const code = codeOnly(source);
  const match = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/.exec(code);
  if (match === null) throw new Error(FACADE_PATH + ": module.exports object literal not found");
  const keys = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(entry);
      if (key === null) throw new Error(FACADE_PATH + ": unsupported export entry " + JSON.stringify(entry));
      return key[1];
    });
  for (const assignment of code.matchAll(/module\.exports\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g)) keys.push(assignment[1]);
  for (const assignment of code.matchAll(/module\.exports\s*\[\s*["']([^"']+)["']\s*\]\s*=/g)) keys.push(assignment[1]);
  return [...new Set(keys)].sort();
}

/**
 * Audits the committed artifact. Pure: it reads the repository (or an injected `files` map, which is how
 * the negative controls in `tests/ui04b.test.mjs` drive it) and returns a verdict.
 */
export function auditWeChatRuntimeArtifact({ root = REPO_ROOT, files, read = defaultReadable } = {}) {
  const committed = files ?? readCommittedFiles(root);
  const violations = [];
  const report = [];

  // ---------------------------------------------------------------- A. file set
  const actual = Object.keys(committed).sort();
  const expected = [...ARTIFACT_PATHS].sort();
  for (const missing of expected.filter((entry) => !actual.includes(entry))) {
    violations.push(`${missing}: missing from the committed artifact`);
  }
  for (const extra of actual.filter((entry) => !expected.includes(entry))) {
    violations.push(`${extra}: unexpected file inside ${RUNTIME_DIR}; that directory holds generated output only`);
  }
  if (violations.length === 0) report.push(`${RUNTIME_DIR}: exactly ${expected.length} generated files, as pinned`);

  // ---------------------------------------------------------------- B/C. edges and closure
  const graph = {};
  for (const artifactPath of actual) {
    const source = committed[artifactPath];

    const nonLiteral = nonLiteralRequireArguments(source);
    for (const raw of nonLiteral) {
      violations.push(
        `${artifactPath}: non-literal require argument ${JSON.stringify(raw)}; the WeChat packager resolves ` +
          `dependencies by static analysis, so the argument must be a plain string literal`
      );
    }
    const targets = [];
    for (const call of requireArguments(source)) {
      if (call.specifier === null) continue; // already reported above
      if (!ALLOWED_SPECIFIERS.includes(call.specifier)) {
        violations.push(
          `${artifactPath}: require(${JSON.stringify(call.specifier)}) is outside the approved client runtime ` +
            `closure (${ALLOWED_SPECIFIERS.join(", ")})`
        );
        continue;
      }
      targets.push(RUNTIME_DIR + "/" + call.specifier.replace(/^\.\//, ""));
    }
    graph[artifactPath] = targets;
  }
  if (!(FACADE_PATH in graph)) violations.push(`${FACADE_PATH}: the facade is missing, so its closure cannot be checked`);

  const reached = new Set();
  const queue = FACADE_PATH in graph ? [FACADE_PATH] : [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of graph[current] ?? []) queue.push(next);
  }
  for (const pinned of ARTIFACT_PATHS) {
    if (!reached.has(pinned)) violations.push(`${FACADE_PATH}: runtime closure does not reach ${pinned}`);
  }
  for (const extra of [...reached].filter((entry) => !ARTIFACT_PATHS.includes(entry))) {
    violations.push(`${FACADE_PATH}: runtime closure reaches ${extra}, which is not part of the pinned artifact`);
  }
  for (const artifactPath of reached) {
    report.push(`${artifactPath}: requires [${(graph[artifactPath] ?? []).join(", ")}]`);
  }

  // ---------------------------------------------------------------- D/E. content policy
  for (const artifactPath of actual) {
    const masked = codeOnly(committed[artifactPath]);
    for (const token of FORBIDDEN_TOKENS) {
      if (masked.includes(token)) violations.push(`${artifactPath}: code references ${token}, which must not be reachable from the artifact`);
    }
    for (const [name, pattern] of FORBIDDEN_NODE_GLOBALS) {
      if (pattern.test(masked)) violations.push(`${artifactPath}: code references the Node-only runtime global ${name}`);
    }
    for (const [name, pattern] of FORBIDDEN_TS_SYNTAX) {
      if (pattern.test(masked)) violations.push(`${artifactPath}: left-over TypeScript syntax (${name}); the file is not loadable JavaScript`);
    }
  }

  // ---------------------------------------------------------------- F. provenance
  for (const entry of RUNTIME_MODULES) {
    const source = committed[entry.artifact];
    if (source === undefined) continue;
    const digest = sha256(read(entry.source).replace(/\r\n/g, "\n"));
    if (!source.includes("// Source of truth: " + entry.source + "\n")) {
      violations.push(`${entry.artifact}: does not record ${entry.source} as its source of truth`);
    }
    if (!source.includes("// Source sha256:   " + digest + "\n")) {
      violations.push(
        `${entry.artifact}: provenance digest does not match the current ${entry.source}. Either the accepted source ` +
          `changed without regeneration, or the generated file was hand-edited. Regenerate with ` +
          `"node tools/ui04b-wechat-runtime-artifact.mjs --write".`
      );
    }
    report.push(`${entry.artifact}: derived from ${entry.source} (sha256 ${digest.slice(0, 12)}…)`);
  }

  // ---------------------------------------------------------------- G. bounded facade
  if (FACADE_PATH in committed) {
    let keys;
    try {
      keys = facadeExportKeys(committed[FACADE_PATH]);
    } catch (error) {
      violations.push(error.message);
      keys = [];
    }
    const allowList = FACADE_EXPORTS.map((entry) => entry.name).sort();
    for (const missing of allowList.filter((entry) => !keys.includes(entry))) {
      violations.push(`${FACADE_PATH}: no longer publishes the pinned public export ${missing}`);
    }
    for (const extra of keys.filter((entry) => !allowList.includes(entry))) {
      violations.push(`${FACADE_PATH}: publishes ${extra}, which is not on the pinned bounded surface`);
    }
    report.push(`${FACADE_PATH}: publishes exactly [${keys.join(", ")}]`);
  }

  for (const artifactPath of actual) {
    report.push(`${artifactPath}: ${Buffer.byteLength(committed[artifactPath], "utf8")} bytes`);
  }

  return { ok: violations.length === 0, violations, report, graph };
}

export function formatAuditReport(result) {
  return result.violations.length > 0
    ? result.violations.join("\n")
    : [...result.report, "UI04B WeChat runtime artifact: PASS"].join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04b-wechat-runtime-audit.mjs");

if (isDirectRun) {
  const result = auditWeChatRuntimeArtifact({});
  if (result.violations.length > 0) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(formatAuditReport(result));
  }
}
