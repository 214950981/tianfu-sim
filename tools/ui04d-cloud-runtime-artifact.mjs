/**
 * UI04D — deployable cloud runtime generator and freshness check.
 *
 * WHY THIS EXISTS
 *
 * `cloudfunctions/tianfu2` runs as a Node CommonJS module inside the WeChat cloud. It cannot execute
 * TypeScript, and it must not contain a *second* implementation of anything: no second reducer, no second
 * gateway, no second ViewModel builder, no second copy of CONTENT01. So this tool MECHANICALLY DERIVES a
 * committed CommonJS runtime from the accepted server / Core / Content TypeScript sources, exactly the way
 * `tools/ui04b-wechat-runtime-artifact.mjs` derives the client runtime from the accepted client packages.
 *
 * HOW THE TRANSFORM WORKS
 *
 *  1. Source bytes are read as UTF-8 with newlines normalised to LF, so the output depends only on the
 *     source bytes and not on checkout line endings.
 *  2. TypeScript type syntax is erased with Node's built-in type stripper (`node:module` ->
 *     `stripTypeScriptTypes`, mode "strip") — the same code path Node uses to run this repository's `.ts`
 *     tests, and a built-in, so no bundler and no new dependency.
 *  3. ES module syntax is rewritten to plain CommonJS: `import { a } from "x"` becomes
 *     `var { a } = require("./x.js")`, `export * from "x"` becomes a `require` plus an `Object.assign`
 *     into `module.exports`, and `export <decl>` loses the keyword and is published by name.
 *  4. A shallow provenance header records the exact source path and its sha256.
 *
 * FAIL-CLOSED BY CONSTRUCTION
 *
 * Anything the transform does not fully understand is an error: an unsupported module heading, a
 * specifier that is not one of the pinned modules, an `import`/`export` token left behind, a file that
 * does not parse as JavaScript, or a facade export the owning module does not actually publish. A bare
 * specifier (`fs`, `node:fs`, any npm package) is a hard failure, which is what keeps a Node-only or
 * third-party module out of the cloud package even if a future source edit introduced one.
 *
 * DETERMINISM
 *
 * `buildCloudRuntimeArtifact()` is a pure function of the source bytes: no timestamps, no absolute paths,
 * no environment reads, sorted ordering, LF line endings. Two runs produce byte-identical output and
 * `--write` is idempotent. The output whitespace is Node-version sensitive (it comes from Node's own type
 * stripper), so a freshness check must compare bytes strictly and the artifact must be regenerated after a
 * Node upgrade — which the committed sha256 header makes self-evident.
 *
 * USAGE
 *
 *   node tools/ui04d-cloud-runtime-artifact.mjs          # freshness check; exit 1 when stale
 *   node tools/ui04d-cloud-runtime-artifact.mjs --write  # regenerate the committed artifact
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import vm from "node:vm";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** The cloud function package that owns the artifact. */
export const CLOUD_FUNCTION_DIR = "cloudfunctions/tianfu2";
/** Where the generated runtime lives inside it. */
export const CLOUD_RUNTIME_DIR = CLOUD_FUNCTION_DIR + "/runtime";
/** The only module the cloud host (or a smoke) should load. */
export const CLOUD_FACADE_PATH = CLOUD_RUNTIME_DIR + "/index.js";

/**
 * The pinned runtime closure.
 *
 * It is the transitive closure of what the live service actually executes: the server application service
 * and the accepted Core / Content modules it calls. Deliberately absent:
 *
 *   - `packages/content/src/index.ts` — the content barrel also re-exports the audit and simulation
 *     tooling, which is development output and must not ship. `destiny-offer.ts` and `viewmodel.ts`
 *     import `ContentRegistry` from `registry.ts` directly instead.
 *   - `server/src/index.ts` — the dev barrel; nothing in the cloud loads a barrel of barrels.
 *   - every client package (`command-wire` excepted: Core's `command.ts` re-exports it, so it is part of
 *     the server closure by construction, not by choice).
 */
export const CLOUD_RUNTIME_MODULES = [
  // ---- Core (pure rules engine)
  { source: "packages/core/src/numeric.ts" },
  { source: "packages/core/src/sha256.ts" },
  { source: "packages/core/src/rng.ts" },
  { source: "packages/core/src/state.ts" },
  { source: "packages/command-wire/src/index.ts" },
  { source: "packages/core/src/command.ts" },
  { source: "packages/core/src/event.ts" },
  { source: "packages/core/src/progression.ts" },
  { source: "packages/core/src/risk.ts" },
  { source: "packages/core/src/build.ts" },
  { source: "packages/core/src/npc.ts" },
  { source: "packages/core/src/destiny.ts" },
  { source: "packages/core/src/director.ts" },
  { source: "packages/core/src/participants.ts" },
  { source: "packages/core/src/cause.ts" },
  { source: "packages/core/src/persistence.ts" },
  { source: "packages/core/src/reducer.ts" },
  { source: "packages/core/src/index.ts" },
  // ---- Content (the real CONTENT01 pack and the packs it names)
  { source: "packages/content/src/progression-v1.ts" },
  { source: "packages/content/src/risk-v1.ts" },
  { source: "packages/content/src/build-v1.ts" },
  { source: "packages/content/src/npc-v1.ts" },
  { source: "packages/content/src/npc-content01-v1.ts" },
  { source: "packages/content/src/director-v1.ts" },
  { source: "packages/content/src/registry.ts" },
  { source: "packages/content/src/content01-v1.ts" },
  // ---- Server application layer
  { source: "server/src/gateway-store.ts" },
  { source: "server/src/identity.ts" },
  { source: "server/src/live-content.ts" },
  { source: "server/src/cloudbase-store.ts" },
  { source: "server/src/destiny-offer.ts" },
  { source: "server/src/command-gateway.ts" },
  { source: "server/src/viewmodel.ts" },
  { source: "server/src/terminal-flow.ts" },
  { source: "server/src/live-service.ts" }
].map((entry) => ({ ...entry, artifact: artifactPathFor(entry.source), specifier: specifierFor(entry.source) }));

/** `packages/core/src/state.ts` -> `core-state.js` (flat, so the closure cannot hide in a subdirectory). */
function slugFor(source) {
  return source
    .replace(/^packages\//, "")
    .replace(/\/src\//, "/")
    .replace(/\.ts$/, "")
    .replace(/\//g, "-");
}
function artifactPathFor(source) { return CLOUD_RUNTIME_DIR + "/" + slugFor(source) + ".js"; }
function specifierFor(source) { return "./" + slugFor(source) + ".js"; }

/**
 * The bounded surface the cloud host is allowed to see.
 *
 * Host wiring (`createTianfuLiveService` over an injected store and entropy), the CloudBase store and its
 * deterministic document-id helper, the live CONTENT01 registry, identity derivation, and the error type a
 * host must catch to answer "this run is not yours". Nothing RNG-shaped, nothing reducer-shaped beyond the
 * gateway that owns settlement, and no client symbol.
 */
export const CLOUD_FACADE_EXPORTS = [
  { name: "TianfuLiveService", from: specifierFor("server/src/live-service.ts") },
  { name: "createTianfuLiveService", from: specifierFor("server/src/live-service.ts") },
  { name: "RunUnavailableError", from: specifierFor("server/src/live-service.ts") },
  { name: "CloudBaseGatewayStore", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "documentIdFor", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "RUNS_COLLECTION", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "COMMANDS_COLLECTION", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "BOOTSTRAPS_COLLECTION", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "TERMINAL_TRANSITIONS_COLLECTION", from: specifierFor("server/src/cloudbase-store.ts") },
  { name: "createLiveContentRegistry", from: specifierFor("server/src/live-content.ts") },
  { name: "LIVE_CONTENT_VERSION", from: specifierFor("server/src/live-content.ts") },
  { name: "LIVE_RULES_VERSION", from: specifierFor("server/src/live-content.ts") },
  { name: "derivePlayerId", from: specifierFor("server/src/identity.ts") },
  { name: "assertTrustedOpenid", from: specifierFor("server/src/identity.ts") },
  { name: "bootstrapKeyFor", from: specifierFor("server/src/identity.ts") },
  { name: "runIdSeedFor", from: specifierFor("server/src/identity.ts") },
  { name: "CommandGateway", from: specifierFor("server/src/command-gateway.ts") },
  { name: "InMemoryGatewayStore", from: specifierFor("server/src/gateway-store.ts") },
  { name: "ServerViewModelBuilder", from: specifierFor("server/src/viewmodel.ts") },
  { name: "generateServerDestinyOffer", from: specifierFor("server/src/destiny-offer.ts") },
  { name: "TerminalFlowError", from: specifierFor("server/src/terminal-flow.ts") },
  { name: "parseAdvanceTerminalRequest", from: specifierFor("server/src/terminal-flow.ts") }
];

/** Every artifact path this tool owns, in emit order (facade last). */
export const CLOUD_ARTIFACT_PATHS = [...CLOUD_RUNTIME_MODULES.map((entry) => entry.artifact), CLOUD_FACADE_PATH];

/** The only require() specifiers the artifact may contain: its own siblings. */
export const CLOUD_ALLOWED_SPECIFIERS = CLOUD_RUNTIME_MODULES.map((entry) => entry.specifier);

/** Raised for every fail-closed condition. The message is the diagnosis; there is no partial output. */
export class CloudRuntimeArtifactError extends Error {
  constructor(message) { super(message); this.name = "CloudRuntimeArtifactError"; }
}

/**
 * Marks which characters of `source` are code. Comments and string/template bodies are not, so a
 * documented specifier inside prose is never read as a real statement — and these modules document their
 * boundaries heavily.
 */
export function codeMaskOf(source) {
  const mask = new Uint8Array(source.length);
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") { while (index < source.length && source[index] !== "\n") index += 1; continue; }
    if (character === "/" && next === "*") { index += 2; while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1; index += 2; continue; }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character; index += 1;
      while (index < source.length) {
        if (source[index] === "\\") { index += 2; continue; }
        if (source[index] === quote) { index += 1; break; }
        index += 1;
      }
      continue;
    }
    mask[index] = 1; index += 1;
  }
  return mask;
}

/** Same masking the repository's other guards use, for scanning code rather than prose. */
export function codeOnly(source) { return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1"); }

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

/**
 * Offsets where a module statement begins: the first *code* character of a line is `i` of import or
 * `e` of export, followed by a non-identifier character. Multi-line `import { … } from "…"` headings are
 * handled by the statement regexes below, which are anchored at these offsets and span newlines.
 */
function moduleHeadings(source, mask) {
  const headings = [];
  let lineStart = 0;
  while (lineStart <= source.length) {
    let lineEnd = source.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = source.length;
    let cursor = lineStart;
    while (cursor < lineEnd && mask[cursor] !== 1) cursor += 1;
    if (cursor < lineEnd && (source.startsWith("import", cursor) || source.startsWith("export", cursor))) {
      const boundary = source[cursor + 6];
      if (boundary === undefined || !/[\w$]/.test(boundary)) headings.push(cursor);
    }
    if (lineEnd === source.length) break;
    lineStart = lineEnd + 1;
  }
  return headings;
}

/** Resolves one relative specifier to a pinned module. A bare or "node:" specifier is a hard failure. */
function resolveToPinned(importerSource, specifier) {
  if (!specifier.startsWith(".")) {
    throw new CloudRuntimeArtifactError(
      `${importerSource}: specifier ${JSON.stringify(specifier)} is not a relative path. The cloud runtime may ` +
        `only depend on the pinned server/Core/Content modules; a bare, absolute or "node:" specifier would pull ` +
        `a Node-only or third-party module into the cloud package.`
    );
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importerSource), specifier));
  const hit = CLOUD_RUNTIME_MODULES.find((entry) => entry.source === base);
  if (hit === undefined) {
    throw new CloudRuntimeArtifactError(
      `${importerSource}: specifier ${JSON.stringify(specifier)} resolves to ${JSON.stringify(base)}, which is not one ` +
        `of the pinned cloud runtime modules. Growing the closure is a scope decision, not a consequence of an import edit.`
    );
  }
  return hit;
}

const RE_IMPORT_NAMED = /^import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2\s*;?/;
const RE_IMPORT_BARE = /^import\s+(["'])([^"']+)\1\s*;?/;
const RE_EXPORT_STAR = /^export\s*\*\s*from\s*(["'])([^"']+)\1\s*;?/;
const RE_EXPORT_NAMED = /^export\s*\{([\s\S]*?)\}\s*;?/;
const RE_EXPORT_DECL = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;

/**
 * Rewrites one already type-stripped module to CommonJS.
 *
 * Returns `{ code, exports }`, where `exports` are the names the module publishes in declaration order.
 * Every unsupported heading throws: emitting a half-rewritten file would only fail later, at require time,
 * inside a cloud function, with no useful message.
 */
export function toCloudCommonJs(strippedSource, sourcePath) {
  // The stripper appends `//# sourceURL=<path>`; that path does not exist in the cloud package.
  const source = strippedSource.replace(/\n*\/\/# sourceURL=[^\n]*\n*$/, "\n");
  const mask = codeMaskOf(source);
  const edits = [];
  const exported = [];
  const stars = [];

  for (const start of moduleHeadings(source, mask)) {
    const rest = source.slice(start);

    const star = RE_EXPORT_STAR.exec(rest);
    if (star !== null) {
      const target = resolveToPinned(sourcePath, star[2]);
      stars.push(target.specifier);
      edits.push({ start, end: start + star[0].length, text: "" });
      continue;
    }

    const namedImport = RE_IMPORT_NAMED.exec(rest);
    if (namedImport !== null) {
      const bindings = namedImport[1].split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      if (bindings.length === 0) throw new CloudRuntimeArtifactError(`${sourcePath}: import from ${JSON.stringify(namedImport[3])} has no bindings`);
      for (const binding of bindings) {
        if (!/^[A-Za-z_$][\w$]*$/.test(binding)) throw new CloudRuntimeArtifactError(`${sourcePath}: unsupported import binding ${JSON.stringify(binding)}`);
      }
      const target = resolveToPinned(sourcePath, namedImport[3]);
      edits.push({ start, end: start + namedImport[0].length, text: `var { ${bindings.join(", ")} } = require(${JSON.stringify(target.specifier)});` });
      continue;
    }

    const bareImport = RE_IMPORT_BARE.exec(rest);
    if (bareImport !== null) throw new CloudRuntimeArtifactError(`${sourcePath}: side-effect import ${JSON.stringify(bareImport[2])} is not supported`);

    const namedExport = RE_EXPORT_NAMED.exec(rest);
    if (namedExport !== null) {
      for (const entry of namedExport[1].split(",")) {
        const name = entry.trim();
        if (name.length === 0) continue;
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new CloudRuntimeArtifactError(`${sourcePath}: unsupported re-export entry ${JSON.stringify(name)}`);
        exported.push(name);
      }
      edits.push({ start, end: start + namedExport[0].length, text: "" });
      continue;
    }

    const declaration = RE_EXPORT_DECL.exec(rest);
    if (declaration !== null) {
      exported.push(declaration[1]);
      const keywordEnd = start + "export".length;
      if (source[keywordEnd] !== " ") throw new CloudRuntimeArtifactError(`${sourcePath}: unexpected characters after "export" at offset ${start}`);
      edits.push({ start, end: keywordEnd + 1, text: "" });
      continue;
    }

    throw new CloudRuntimeArtifactError(
      `${sourcePath}: unsupported module heading ${JSON.stringify(rest.slice(0, 60))}. The generator rewrites named ` +
        `imports, star re-exports, named re-exports and const/let/var/function/class declarations; everything else ` +
        `fails closed instead of being emitted unrewritten.`
    );
  }

  // Apply from the end so earlier offsets stay valid. String.replace is deliberately avoided: it would
  // mangle replacements containing `$`.
  let code = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }

  const body = code.replace(/\s+$/, "");
  const own = exported.filter((name, index) => exported.indexOf(name) === index);
  const assignments = [
    ...stars.map((specifier, index) => `__star${index}`),
    "{\n" + own.map((name) => "  " + name).join(",\n") + "\n}"
  ];
  const header = [
    ...stars.map((specifier, index) => `var __star${index} = require(${JSON.stringify(specifier)});`),
    ...(stars.length > 0 ? [""] : [])
  ].join("\n");
  return {
    code: header + (header.length > 0 ? "\n" : "") + body + "\n\nmodule.exports = Object.assign({}, " + assignments.join(", ") + ");\n",
    exports: own
  };
}

/** Header shared by every generated module: the provenance of the single source of truth. */
function moduleHeader(sourcePath, sourceDigest) {
  return [
    "// GENERATED FILE — DO NOT HAND-EDIT.",
    "//",
    "// Source of truth: " + sourcePath,
    "// Source sha256:   " + sourceDigest,
    "// Generator:       tools/ui04d-cloud-runtime-artifact.mjs",
    "// Regenerate:      node tools/ui04d-cloud-runtime-artifact.mjs --write",
    "//",
    "// Deployable CommonJS derived mechanically from the accepted TypeScript module above: type syntax is",
    "// erased with Node's built-in type stripper and ES module syntax is rewritten to plain CommonJS.",
    "// Nothing here was hand-copied — there is exactly one reducer, one CommandGateway, one ViewModel",
    "// builder and one CONTENT01, and they live in the source modules named above.",
    "//",
    "// The closure is pinned to the required server Core/Content modules only: no client package (except",
    "// command-wire, which Core's command module re-exports), no content audit or simulation tooling, and no",
    "// Node builtin or third-party dependency. See docs/UI04D_CLOUD_BACKEND.md.",
    ""
  ].join("\n");
}

function facadeSource() {
  const modules = [...new Set(CLOUD_FACADE_EXPORTS.map((entry) => entry.from))].sort();
  const aliases = new Map(modules.map((specifier, index) => [specifier, "dep" + index]));
  const lines = [];
  for (const specifier of modules) lines.push("var " + aliases.get(specifier) + " = require(" + JSON.stringify(specifier) + ");");
  lines.push("");
  lines.push("module.exports = {");
  const ordered = [...CLOUD_FACADE_EXPORTS].sort((left, right) => (left.name < right.name ? -1 : 1));
  ordered.forEach((entry, index) => {
    lines.push("  " + entry.name + ": " + aliases.get(entry.from) + "." + entry.name + (index === ordered.length - 1 ? "" : ","));
  });
  lines.push("};");
  const header = [
    "// GENERATED FILE — DO NOT HAND-EDIT.",
    "//",
    "// UI04D — the bounded cloud runtime facade, and the single entry point a cloud host should load.",
    "// Generator:  tools/ui04d-cloud-runtime-artifact.mjs",
    "// Regenerate: node tools/ui04d-cloud-runtime-artifact.mjs --write",
    "//",
    "// Each export is re-published verbatim from a generated module mechanically derived from its accepted",
    "// TypeScript source, so the facade adds no implementation of its own. The surface is deliberately",
    "// bounded: host wiring, the CloudBase store, the live CONTENT01 registry, identity derivation and the",
    "// ownership error a host must catch. See docs/UI04D_CLOUD_BACKEND.md.",
    ""
  ].join("\n");
  return header + lines.join("\n") + "\n";
}

/** Erases TypeScript type syntax. A failure here is fatal: an unstripped file is not loadable. */
function stripTypes(source, sourcePath) {
  try {
    return module.stripTypeScriptTypes(source, { mode: "strip", sourceUrl: sourcePath });
  } catch (error) {
    throw new CloudRuntimeArtifactError(
      `${sourcePath}: Node's type stripper refused this module (${error.message}). The artifact cannot be derived ` +
        `from it. Use mode "transform" only if the source genuinely needs TypeScript-only syntax such as enums.`
    );
  }
}

function defaultRead(relative) { return fs.readFileSync(path.join(REPO_ROOT, relative), "utf8"); }

/**
 * Builds the whole artifact in memory. Pure: the only input is `read(relativeSourcePath) -> string`, so a
 * test can inject a drifted source and observe the verdict without touching the worktree.
 */
export function buildCloudRuntimeArtifact({ read = defaultRead } = {}) {
  const files = {};
  const sources = [];
  const exports = {};

  for (const entry of CLOUD_RUNTIME_MODULES) {
    const raw = read(entry.source);
    if (typeof raw !== "string") throw new CloudRuntimeArtifactError(`${entry.source}: reader returned a non-string`);
    const source = raw.replace(/\r\n/g, "\n");
    const digest = sha256(source);
    sources.push({ path: entry.source, sha256: digest, bytes: Buffer.byteLength(source, "utf8") });

    const converted = toCloudCommonJs(stripTypes(source, entry.source), entry.source);
    exports[entry.source] = converted.exports;
    const code = moduleHeader(entry.source, digest) + converted.code;
    assertCloudCommonJs(code, entry.source, entry.artifact);
    files[entry.artifact] = code;
  }

  const facade = facadeSource();
  assertCloudCommonJs(facade, "tools/ui04d-cloud-runtime-artifact.mjs (facade)", CLOUD_FACADE_PATH);
  files[CLOUD_FACADE_PATH] = facade;

  // The transform must have produced the surface it claims: publishing a name the accepted source no longer
  // exports would emit `dep.X` === undefined and only fail at runtime inside the cloud function.
  for (const entry of CLOUD_FACADE_EXPORTS) {
    const owner = CLOUD_RUNTIME_MODULES.find((candidate) => candidate.specifier === entry.from);
    if (owner === undefined) throw new CloudRuntimeArtifactError(`facade export ${entry.name} names unknown module ${entry.from}`);
    if (!exports[owner.source].includes(entry.name)) {
      throw new CloudRuntimeArtifactError(`facade export ${entry.name} is not exported by ${owner.source}; the facade would publish undefined`);
    }
  }

  return { files, sources, exports, closure: CLOUD_RUNTIME_MODULES.map((entry) => entry.source) };
}

/**
 * Asserts a generated file is valid JavaScript and stays inside the approved closure.
 *
 * `new vm.Script` compiles without executing, which catches leftover TypeScript syntax and broken CommonJS
 * without touching a platform global.
 */
export function assertCloudCommonJs(code, label, artifactPath) {
  try {
    new vm.Script(code, { filename: artifactPath });
  } catch (error) {
    throw new CloudRuntimeArtifactError(`${artifactPath}: generated code does not parse as JavaScript (${error.message})`);
  }

  const masked = codeOnly(code);
  const leftovers = masked.match(/(^|\n)[ \t]*(import|export)\b/g);
  if (leftovers !== null) {
    throw new CloudRuntimeArtifactError(
      `${artifactPath}: ${leftovers.length} module statement(s) survived the CommonJS rewrite (${leftovers
        .map((entry) => entry.trim()).join(", ")}). The result would not be loadable with require.`
    );
  }

  // Every require argument must be a plain string literal *and* a sibling artifact, or the cloud package
  // would depend on something that is not in it.
  for (const match of code.matchAll(/require\s*\(([^)]*)\)/g)) {
    const argument = match[1].trim();
    const literal = /^(["'])([^"']+)\1$/.exec(argument);
    if (literal === null) {
      throw new CloudRuntimeArtifactError(`${artifactPath}: non-literal require argument ${JSON.stringify(argument)}`);
    }
    if (!CLOUD_ALLOWED_SPECIFIERS.includes(literal[2])) {
      throw new CloudRuntimeArtifactError(
        `${artifactPath}: require(${JSON.stringify(literal[2])}) is outside the pinned cloud runtime set ` +
          `(${CLOUD_ALLOWED_SPECIFIERS.length} sibling modules). Only generated siblings may be required.`
      );
    }
  }

  for (const [name, pattern] of [
    ["import type", /\bimport\s+type\b/],
    ["export type", /\bexport\s+type\b/],
    ["interface declaration", /\binterface\s+[A-Za-z_$]/],
    ["as const", /\bas\s+const\b/],
    ["satisfies operator", /\bsatisfies\b/],
    ["readonly modifier", /\breadonly\s/],
    ["declare modifier", /\bdeclare\s+(?:const|let|var|function|class|interface|type)\b/],
    ["enum declaration", /\benum\s+[A-Za-z_$]/]
  ]) {
    if (pattern.test(masked)) {
      throw new CloudRuntimeArtifactError(`${artifactPath}: left-over TypeScript syntax (${name}); the file is not loadable JavaScript`);
    }
  }
}

/** Compares a freshly generated artifact with the committed one. */
export function checkCloudRuntimeArtifact({ root = REPO_ROOT, read = defaultRead, files } = {}) {
  const artifact = buildCloudRuntimeArtifact({ read });
  const committed = files ?? readCommitted(root);
  const problems = [];

  for (const artifactPath of CLOUD_ARTIFACT_PATHS) {
    if (!(artifactPath in committed)) { problems.push(`${artifactPath}: missing from the committed artifact`); continue; }
    if (committed[artifactPath] === artifact.files[artifactPath]) continue;
    problems.push(
      `${artifactPath}: committed bytes differ from a fresh generation (${describeFirstDifference(
        committed[artifactPath], artifact.files[artifactPath]
      )}). Either the accepted source drifted, or the generated file was hand-edited. Regenerate with ` +
        `"node tools/ui04d-cloud-runtime-artifact.mjs --write".`
    );
  }
  for (const relative of Object.keys(committed).filter((entry) => !CLOUD_ARTIFACT_PATHS.includes(entry))) {
    problems.push(`${relative}: unexpected file inside ${CLOUD_RUNTIME_DIR}; that directory is generated, not hand-managed`);
  }

  return { ok: problems.length === 0, problems, artifact, committed };
}

/** Every committed file under `cloudfunctions/tianfu2/runtime/`. */
export function readCommitted(root) {
  const directory = path.join(root, CLOUD_RUNTIME_DIR);
  const files = {};
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files[CLOUD_RUNTIME_DIR + "/" + entry.name] = fs.readFileSync(path.join(directory, entry.name), "utf8");
  }
  return files;
}

function describeFirstDifference(left, right) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const limit = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < limit; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return `first difference at line ${index + 1}: committed ${JSON.stringify((leftLines[index] ?? "<absent>").slice(0, 80))}, regenerated ${JSON.stringify((rightLines[index] ?? "<absent>").slice(0, 80))}`;
    }
  }
  return "length-only difference";
}

export function writeCloudRuntimeArtifact({ root = REPO_ROOT, artifact }) {
  const built = artifact ?? buildCloudRuntimeArtifact();
  const written = [];
  for (const artifactPath of CLOUD_ARTIFACT_PATHS) {
    const absolute = path.join(root, artifactPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const previous = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
    if (previous === built.files[artifactPath]) continue;
    fs.writeFileSync(absolute, built.files[artifactPath], "utf8");
    written.push(artifactPath);
  }
  return written;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04d-cloud-runtime-artifact.mjs");

if (isDirectRun) {
  const write = process.argv.includes("--write");
  if (write) {
    const written = writeCloudRuntimeArtifact({});
    if (written.length === 0) console.log(`${CLOUD_RUNTIME_DIR}: already up to date (idempotent write)`);
    else for (const artifactPath of written) console.log("wrote " + artifactPath);
  }
  const result = checkCloudRuntimeArtifact({});
  for (const source of result.artifact.sources) console.log(`source ${source.path}: sha256 ${source.sha256} (${source.bytes} bytes)`);
  for (const artifactPath of CLOUD_ARTIFACT_PATHS) console.log(`artifact ${artifactPath}: ${Buffer.byteLength(result.artifact.files[artifactPath], "utf8")} bytes`);
  if (result.ok) console.log("UI04D cloud runtime artifact: PASS (deterministic regeneration matches the committed bytes)");
  else { console.error(result.problems.join("\n")); process.exitCode = 1; }
}
