/**
 * UI04D — dependency and closure audit for the deployable cloud runtime.
 *
 * `tools/ui04d-cloud-runtime-artifact.mjs` owns generation; this tool audits the **committed bytes** as an
 * independent adversary. It does not trust the generator's own report: it re-reads
 * `cloudfunctions/tianfu2/runtime/`, rebuilds the runtime graph from the literal `require` calls, and fails
 * when the artifact reaches anything outside the approved server closure.
 *
 * The checks, all fail-closed:
 *
 *  A. FILE SET. The runtime directory contains exactly the pinned generated files.
 *  B. EDGES. Every `require` argument is a plain string literal and a sibling artifact. A bare specifier, a
 *     `node:` prefix or a path leaving the directory is a violation — that is the mechanical meaning of
 *     "no Node builtin and no npm dependency inside the generated runtime".
 *  C. CLOSURE. Walking the graph from the facade reaches every pinned module and nothing else, so neither
 *     an unreachable module nor a hidden dependency can hide in the directory.
 *  D. CONTENT POLICY. Comment-masked code must name no client source, no client runtime, no platform
 *     global, no content audit/simulation module and no database query on the transactional path.
 *  E. IT IS JAVASCRIPT. No TypeScript-only syntax survived, so "loadable" is not taken on trust.
 *  F. PROVENANCE. Every module records its source path and that source's current sha256.
 *  G. BOUNDED FACADE. The facade's `module.exports` keys equal the pinned allow-list.
 *  H. DEPENDENCY POLICY. Only `cloudfunctions/tianfu2/package.json` may depend on `wx-server-sdk`; no
 *     client manifest may. The hand-written host may require only the SDK, `crypto` and its own runtime.
 *
 * Usage:
 *   node tools/ui04d-cloud-runtime-audit.mjs
 *
 * Exit codes: 0 = the committed cloud package is exactly the approved server closure; 1 = a violation.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  CLOUD_ALLOWED_SPECIFIERS,
  CLOUD_ARTIFACT_PATHS,
  CLOUD_FACADE_EXPORTS,
  CLOUD_FACADE_PATH,
  CLOUD_FUNCTION_DIR,
  CLOUD_RUNTIME_DIR,
  CLOUD_RUNTIME_MODULES,
  REPO_ROOT,
  codeOnly,
  readCommitted,
  sha256
} from "./ui04d-cloud-runtime-artifact.mjs";

const HOST_PATH = CLOUD_FUNCTION_DIR + "/index.js";

/** Client-side and platform vocabulary that must never be reachable from a cloud module's code. */
const FORBIDDEN_TOKENS = [
  "miniprogram",
  "packages/wechat-shell",
  "packages/application-ui",
  "packages/platform-contract",
  "wx-server-sdk",
  "wx.cloud",
  "wx.request",
  "getStorageSync",
  "v2-preview"
];

/** Content modules that are development tooling, not runtime content. */
const FORBIDDEN_CONTENT_MODULES = ["content-sim", "-audit", "combo-audit", "recurrence-audit", "playability-audit"];

/** The CloudBase transactional path must address documents by id; a query inside one is not atomic. */
const FORBIDDEN_DB_QUERY = [["where query", /\.where\s*\(/]];

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

/** What the hand-written host is allowed to require, and nothing else. */
const ALLOWED_HOST_SPECIFIERS = ["wx-server-sdk", "crypto", "./runtime/index.js"];

function defaultRead(relative) { return fs.readFileSync(path.join(REPO_ROOT, relative), "utf8"); }

/** The property names a generated facade publishes, parsed from both publication forms. */
export function facadeExportKeys(source) {
  const code = codeOnly(source);
  const match = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/.exec(code);
  if (match === null) throw new Error(CLOUD_FACADE_PATH + ": module.exports object literal not found");
  const keys = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(entry);
      if (key === null) throw new Error(CLOUD_FACADE_PATH + ": unsupported export entry " + JSON.stringify(entry));
      return key[1];
    });
  for (const assignment of code.matchAll(/module\.exports\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g)) keys.push(assignment[1]);
  for (const assignment of code.matchAll(/module\.exports\s*\[\s*["']([^"']+)["']\s*\]\s*=/g)) keys.push(assignment[1]);
  return [...new Set(keys)].sort();
}

/**
 * Audits the committed cloud package. Pure: it reads the repository (or an injected `files` map, which is
 * how the negative controls in `tests/ui04d.test.mjs` drive it) and returns a verdict.
 */
export function auditCloudRuntime({ root = REPO_ROOT, files, read = defaultRead } = {}) {
  const committed = files ?? readCommitted(root);
  const violations = [];
  const report = [];

  // ---------------------------------------------------------------- A. file set
  const actual = Object.keys(committed).sort();
  const expected = [...CLOUD_ARTIFACT_PATHS].sort();
  for (const missing of expected.filter((entry) => !actual.includes(entry))) violations.push(`${missing}: missing from the committed runtime`);
  for (const extra of actual.filter((entry) => !expected.includes(entry))) violations.push(`${extra}: unexpected file inside ${CLOUD_RUNTIME_DIR}; that directory holds generated output only`);
  if (violations.length === 0) report.push(`${CLOUD_RUNTIME_DIR}: exactly ${expected.length} generated files, as pinned`);

  // ---------------------------------------------------------------- B/C. edges and closure
  const graph = {};
  for (const artifactPath of actual) {
    const source = committed[artifactPath];
    const targets = [];
    for (const match of source.matchAll(/require\s*\(([^)]*)\)/g)) {
      const argument = match[1].trim();
      const literal = /^(["'])([^"']+)\1$/.exec(argument);
      if (literal === null) {
        violations.push(`${artifactPath}: non-literal require argument ${JSON.stringify(argument)}`);
        continue;
      }
      if (!CLOUD_ALLOWED_SPECIFIERS.includes(literal[2])) {
        violations.push(`${artifactPath}: require(${JSON.stringify(literal[2])}) is outside the approved server closure`);
        continue;
      }
      targets.push(CLOUD_RUNTIME_DIR + "/" + literal[2].replace(/^\.\//, ""));
    }
    graph[artifactPath] = targets;
  }
  if (!(CLOUD_FACADE_PATH in graph)) violations.push(`${CLOUD_FACADE_PATH}: the facade is missing, so its closure cannot be checked`);

  const reached = new Set();
  const queue = CLOUD_FACADE_PATH in graph ? [CLOUD_FACADE_PATH] : [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of graph[current] ?? []) queue.push(next);
  }
  for (const pinned of CLOUD_ARTIFACT_PATHS) {
    if (!reached.has(pinned)) violations.push(`${CLOUD_FACADE_PATH}: runtime closure does not reach ${pinned}`);
  }
  for (const extra of [...reached].filter((entry) => !CLOUD_ARTIFACT_PATHS.includes(entry))) {
    violations.push(`${CLOUD_FACADE_PATH}: runtime closure reaches ${extra}, which is not part of the pinned artifact`);
  }
  report.push(`closure: ${reached.size} modules reachable from the facade`);

  // ---------------------------------------------------------------- D/E. content policy
  for (const artifactPath of actual) {
    const masked = codeOnly(committed[artifactPath]);
    for (const entry of FORBIDDEN_TOKENS) {
      if (masked.includes(entry)) violations.push(`${artifactPath}: code references ${entry}, which must not be reachable from the cloud runtime`);
    }
    for (const entry of FORBIDDEN_CONTENT_MODULES) {
      if (masked.includes(entry)) violations.push(`${artifactPath}: code references the development-only module ${entry}`);
    }
    for (const [name, pattern] of FORBIDDEN_TS_SYNTAX) {
      if (pattern.test(masked)) violations.push(`${artifactPath}: left-over TypeScript syntax (${name}); the file is not loadable JavaScript`);
    }
  }
  // The transactional path is the store module and only that module; a query there would break atomicity.
  const storePath = CLOUD_RUNTIME_DIR + "/server-cloudbase-store.js";
  if (storePath in committed) {
    const masked = codeOnly(committed[storePath]);
    for (const [name, pattern] of FORBIDDEN_DB_QUERY) {
      if (pattern.test(masked)) violations.push(`${storePath}: ${name} on the transactional path; document access must be by deterministic id`);
    }
  } else violations.push(`${storePath}: the CloudBase store module is missing from the committed runtime`);

  // ---------------------------------------------------------------- F. provenance
  for (const entry of CLOUD_RUNTIME_MODULES) {
    const source = committed[entry.artifact];
    if (source === undefined) continue;
    const digest = sha256(read(entry.source).replace(/\r\n/g, "\n"));
    if (!source.includes("// Source of truth: " + entry.source + "\n")) violations.push(`${entry.artifact}: does not record ${entry.source} as its source of truth`);
    if (!source.includes("// Source sha256:   " + digest + "\n")) {
      violations.push(
        `${entry.artifact}: provenance digest does not match the current ${entry.source}. Either the accepted source ` +
          `changed without regeneration, or the generated file was hand-edited. Regenerate with ` +
          `"node tools/ui04d-cloud-runtime-artifact.mjs --write".`
      );
    }
  }
  report.push(`provenance: ${CLOUD_RUNTIME_MODULES.length} modules record their source digest`);

  // ---------------------------------------------------------------- G. bounded facade
  if (CLOUD_FACADE_PATH in committed) {
    let keys = [];
    try {
      keys = facadeExportKeys(committed[CLOUD_FACADE_PATH]);
    } catch (error) {
      violations.push(error.message);
    }
    const allowList = CLOUD_FACADE_EXPORTS.map((entry) => entry.name).sort();
    for (const missing of allowList.filter((entry) => !keys.includes(entry))) violations.push(`${CLOUD_FACADE_PATH}: no longer publishes the pinned export ${missing}`);
    for (const extra of keys.filter((entry) => !allowList.includes(entry))) violations.push(`${CLOUD_FACADE_PATH}: publishes ${extra}, which is not on the pinned bounded surface`);
    report.push(`${CLOUD_FACADE_PATH}: publishes exactly [${keys.join(", ")}]`);
  }

  // ---------------------------------------------------------------- H. dependency policy
  const hostFile = read(HOST_PATH);
  const hostSpecifiers = [...hostFile.matchAll(/require\s*\(\s*(["'])([^"']+)\1\s*\)/g)].map((match) => match[2]);
  for (const specifier of hostSpecifiers) {
    if (!ALLOWED_HOST_SPECIFIERS.includes(specifier)) {
      violations.push(`${HOST_PATH}: require(${JSON.stringify(specifier)}) is not an approved cloud host dependency (${ALLOWED_HOST_SPECIFIERS.join(", ")})`);
    }
  }
  report.push(`${HOST_PATH}: requires [${[...new Set(hostSpecifiers)].sort().join(", ")}]`);

  const cloudPackage = JSON.parse(read(CLOUD_FUNCTION_DIR + "/package.json"));
  if (Object.keys(cloudPackage.dependencies ?? {}).join(",") !== "wx-server-sdk") {
    violations.push(`${CLOUD_FUNCTION_DIR}/package.json: may depend on wx-server-sdk and nothing else`);
  }
  // The two manifests a client build actually reads. `cloudfunctions/syncPlayerData` is the accepted 1.0
  // cloud function and is *supposed* to depend on the SDK; it is not a client manifest.
  for (const manifest of ["package.json", "miniprogram/app.json"]) {
    const text = read(manifest);
    if (text.includes("wx-server-sdk")) violations.push(`${manifest}: a client manifest must not depend on wx-server-sdk`);
  }
  report.push("dependency policy: wx-server-sdk is confined to the cloud function package");

  for (const artifactPath of actual) report.push(`${artifactPath}: ${Buffer.byteLength(committed[artifactPath], "utf8")} bytes`);

  return { ok: violations.length === 0, violations, report, graph };
}

export function formatAuditReport(result) {
  return result.violations.length > 0 ? result.violations.join("\n") : [...result.report, "UI04D cloud runtime audit: PASS"].join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04d-cloud-runtime-audit.mjs");

if (isDirectRun) {
  const result = auditCloudRuntime({});
  if (result.violations.length > 0) {
    console.error(result.violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(formatAuditReport(result));
  }
}
