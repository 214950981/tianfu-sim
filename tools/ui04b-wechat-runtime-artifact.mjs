/**
 * UI04B — WeChat client runtime artifact generator and freshness check.
 *
 * WHY THIS EXISTS
 *
 * `project.config.json` sets `miniprogramRoot: "miniprogram/"`, while the accepted UI03/UI04A client
 * controller lives outside that root in TypeScript packages (`packages/command-wire`,
 * `packages/application-ui`, `packages/wechat-shell`). "The source path can be imported by Node" is not
 * the same claim as "the WeChat packager can load it": the packager reads the files under
 * `miniprogramRoot` as JavaScript, resolves `require("./x.js")` by static analysis, and cannot execute
 * TypeScript.
 *
 * So this tool MECHANICALLY DERIVES a committed, WeChat-loadable CommonJS runtime from those accepted
 * modules. It does not contain a second controller, a second submission controller or a second command
 * codec — it contains a transform. The accepted packages stay the single source of truth, and the
 * freshness check below fails when either side drifts.
 *
 * HOW THE TRANSFORM WORKS
 *
 *  1. Every source file is read as UTF-8 and its newlines normalised to LF, so the emitted bytes depend
 *     only on the source bytes and not on the checkout's line-ending settings.
 *  2. TypeScript type syntax is erased with Node's own built-in type stripper
 *     (`node:module` -> `stripTypeScriptTypes`, mode "strip"). That is the same code path Node uses to
 *     run this repository's `.ts` test fixtures directly, so the artifact is derived by the same
 *     toolchain that already executes the accepted sources — and it is a built-in, so no bundler,
 *     compiler or third-party runtime dependency is added (the task forbids one; the repository also
 *     has no `node_modules`).
 *  3. The remaining ES module syntax is rewritten to plain CommonJS: named `import { a, b } from "x"`
 *     becomes `var { a, b } = require("./x.js")`, `export { a }` becomes part of the module's
 *     `module.exports`, and `export <decl>` loses the keyword and is recorded for `module.exports`.
 *  4. A shallow header recording the exact source path and its sha256 follows the code, so a generated
 *     file can be traced back to the reviewed module it came from.
 *
 * FAIL-CLOSED BY CONSTRUCTION
 *
 * Anything this transform does not fully understand is an error, never a silent pass-through: an import
 * form that is not a named-braces import, an export form that is not a declaration or a named
 * re-export, a specifier that does not resolve to one of the pinned source modules, an import/export
 * token left behind after rewriting, a generated file that does not parse as JavaScript, or a runtime
 * closure that is not exactly the pinned set. In particular a bare specifier (`fs`, `node:fs`, any npm
 * package) is a hard failure, which is what keeps Node-only modules out of the artifact even if a
 * future edit to an accepted source introduced one.
 *
 * DETERMINISM
 *
 * `buildRuntimeArtifact()` is a pure function of the source bytes: no timestamps, no absolute paths, no
 * environment reads, no version stamps, sorted/reproducible ordering everywhere, LF line endings. Two
 * runs over the same sources produce byte-identical output, which `tests/ui04b.test.mjs` asserts
 * directly, and `--write` is idempotent.
 *
 * USAGE
 *
 *   node tools/ui04b-wechat-runtime-artifact.mjs          # freshness check; exit 1 when stale
 *   node tools/ui04b-wechat-runtime-artifact.mjs --write  # regenerate the committed artifact
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import vm from "node:vm";

import { nonLiteralRequireArguments, requireArguments } from "./ui02-preview-fixture-module.mjs";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Where the artifact lives: inside `miniprogramRoot` so the packager can see it. */
export const RUNTIME_DIR = "miniprogram/runtime";

/** The only module a page or a smoke should load. */
export const FACADE_PATH = RUNTIME_DIR + "/index.js";

/**
 * The pinned runtime closure of the artifact.
 *
 * `specifier` is the specifier another artifact module must use to reach this one, i.e. the packager
 * visible, statically analysable, sibling-relative form. `exports` is not pinned here on purpose — the
 * module exports whatever the accepted source exports; only the *facade* is bounded, below.
 */
export const RUNTIME_MODULES = [
  {
    source: "packages/command-wire/src/index.ts",
    artifact: RUNTIME_DIR + "/command-wire.js",
    specifier: "./command-wire.js"
  },
  {
    source: "packages/application-ui/src/index.ts",
    artifact: RUNTIME_DIR + "/application-ui.js",
    specifier: "./application-ui.js"
  },
  {
    source: "packages/wechat-shell/src/index.ts",
    artifact: RUNTIME_DIR + "/wechat-shell.js",
    specifier: "./wechat-shell.js"
  }
];

/**
 * The bounded public surface of the artifact, i.e. everything a later live page (UI04C) is allowed to
 * see. Nothing gameplay-shaped is here: the controller orchestrates, the storage adapter binds an
 * injected platform API, the cloud transport adapter binds an injected cloud-call API, the bootstrap
 * turns the authoritative `createRunOffer` payload into a session, and the rest are error types a
 * caller must be able to catch. Widening this list is a deliberate, reviewable act, and
 * `tests/ui04b.test.mjs` hard-codes the same set so the generator cannot widen the surface by itself.
 *
 * UI04C added exactly three entries — `createWeChatCloudTransport`, `bootstrapWeChatRun` and
 * `TransportProtocolError` — which is the whole live-client seam the page needs. The payload
 * validators (`parsePublicViewModel`, `parseRunOfferResult`) stay internal: the page never validates a
 * raw RPC payload itself, the adapters do it at the boundary.
 *
 * `WeChatRunController` also exposes `pageModel()`, which already returns the projected shell model,
 * the core/special intents and the archive view, so those builders are reachable through the controller
 * and do not need their own facade entry.
 */
export const FACADE_EXPORTS = [
  { name: "APP_ERROR_CODES", from: "./command-wire.js" },
  { name: "CommandValidationError", from: "./command-wire.js" },
  { name: "ArchiveUnavailableError", from: "./wechat-shell.js" },
  { name: "IntentUnavailableError", from: "./wechat-shell.js" },
  { name: "RetryUnavailableError", from: "./wechat-shell.js" },
  { name: "SubmissionLockedError", from: "./wechat-shell.js" },
  { name: "TransportProtocolError", from: "./wechat-shell.js" },
  { name: "TerminalUnavailableError", from: "./wechat-shell.js" },
  { name: "WeChatRunController", from: "./wechat-shell.js" },
  { name: "bootstrapWeChatRun", from: "./wechat-shell.js" },
  { name: "createWeChatCloudTransport", from: "./wechat-shell.js" },
  { name: "createWeChatPlatformStorage", from: "./wechat-shell.js" }
];

/** Every artifact path this tool owns, in emit order (facade last). */
export const ARTIFACT_PATHS = [...RUNTIME_MODULES.map((entry) => entry.artifact), FACADE_PATH];

/**
 * Every require() specifier the artifact is allowed to contain: the sibling modules, and nothing else.
 * No Node builtin, no npm package, no `node:` prefix, no path that leaves `miniprogram/runtime/`.
 */
export const ALLOWED_SPECIFIERS = RUNTIME_MODULES.map((entry) => entry.specifier);

/** Raised for every fail-closed condition. The message is the diagnosis; there is no partial output. */
export class RuntimeArtifactError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeArtifactError";
  }
}

/**
 * Marks which characters of `source` are code. Comments and string/template bodies are not, so a
 * documented specifier inside prose — and this repository documents specifiers heavily — is never read
 * as a real statement. Needed before any token scan: generated modules keep the accepted source's
 * comments, and `packages/command-wire` documents `packages/core` in its own doc block.
 */
export function codeMaskOf(source) {
  const mask = new Uint8Array(source.length);
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    mask[index] = 1;
    index += 1;
  }
  return mask;
}

/** Same masking the repository's other guards use, for scanning code rather than prose. */
export function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Module-scope `import`/`export` headings, located on code characters only.
 *
 * Every accepted client module declares its imports and exports at the start of a line, so a heading is
 * "the first code character of a line is `i` of import / `e` of export". Anything with code before it on
 * the same line is not a module heading and is left alone (there is no such case today; if one appears,
 * the leftover-token assertion below fails closed rather than emitting broken CommonJS).
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

/** The next `;` on a code character, or -1. */
function statementEnd(source, mask, from) {
  for (let index = from; index < source.length; index += 1) {
    if (mask[index] === 1 && source[index] === ";") return index;
  }
  return -1;
}

/** Resolves one relative specifier from `importerSource` to a pinned RUNTIME_MODULES entry. */
function resolveToPinned(importerSource, specifier) {
  if (!specifier.startsWith(".")) {
    throw new RuntimeArtifactError(
      `${importerSource}: specifier ${JSON.stringify(specifier)} is not a relative path. The WeChat artifact may ` +
        `only depend on the pinned client-safe source modules; a bare, absolute or "node:" specifier would pull ` +
        `a Node-only or third-party module into the miniprogram package.`
    );
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importerSource), specifier));
  const candidates = [base, base + ".ts", base + "/index.ts"];
  const hit = RUNTIME_MODULES.find((entry) => candidates.includes(entry.source));
  if (hit === undefined) {
    throw new RuntimeArtifactError(
      `${importerSource}: specifier ${JSON.stringify(specifier)} resolves to ${JSON.stringify(base)}, which is not ` +
        `one of the pinned client-safe source modules (${RUNTIME_MODULES.map((entry) => entry.source).join(", ")}). ` +
        `Growing the artifact's runtime closure is a scope decision, not a silent consequence of an import edit.`
    );
  }
  return hit;
}

/**
 * Rewrites one already type-stripped module to CommonJS.
 *
 * Returns `{ code, exports }` where `exports` are the names the module publishes, in declaration order.
 */
export function toCommonJs(strippedSource, sourcePath) {
  // The stripper appends a `//# sourceURL=<source path>` marker. That path does not exist inside the
  // miniprogram package, so it is dropped rather than shipped as a misleading DevTools hint.
  const source = strippedSource.replace(/\n*\/\/# sourceURL=[^\n]*\n*$/, "\n");
  const mask = codeMaskOf(source);
  const edits = [];
  const exported = [];

  for (const start of moduleHeadings(source, mask)) {
    const rest = source.slice(start);

    const reExport = /^export\s*\{([^}]*)\}\s*;/.exec(rest);
    if (reExport !== null) {
      for (const entry of reExport[1].split(",")) {
        const name = entry.trim();
        if (name.length === 0) continue;
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
          throw new RuntimeArtifactError(`${sourcePath}: unsupported re-export entry ${JSON.stringify(name)}`);
        }
        exported.push(name);
      }
      edits.push({ start, end: start + reExport[0].length, text: "" });
      continue;
    }

    const namedImport = /^import\s*\{([^}]*)\}\s*from\s*(["'])([^"']+)\2\s*;/.exec(rest);
    if (namedImport !== null) {
      const bindings = namedImport[1]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      if (bindings.length === 0) {
        throw new RuntimeArtifactError(`${sourcePath}: import from ${JSON.stringify(namedImport[3])} has no bindings`);
      }
      for (const binding of bindings) {
        if (!/^[A-Za-z_$][\w$]*$/.test(binding)) {
          throw new RuntimeArtifactError(`${sourcePath}: unsupported import binding ${JSON.stringify(binding)}`);
        }
      }
      const target = resolveToPinned(sourcePath, namedImport[3]);
      edits.push({
        start,
        end: start + namedImport[0].length,
        text: `var { ${bindings.join(", ")} } = require(${JSON.stringify(target.specifier)});`
      });
      continue;
    }

    const declaration = /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(rest);
    if (declaration !== null) {
      exported.push(declaration[1]);
      // Drop exactly the `export` keyword and the single space that follows it.
      const keywordEnd = start + "export".length;
      if (source[keywordEnd] !== " ") {
        throw new RuntimeArtifactError(`${sourcePath}: unexpected characters after "export" at offset ${start}`);
      }
      edits.push({ start, end: keywordEnd + 1, text: "" });
      continue;
    }

    throw new RuntimeArtifactError(
      `${sourcePath}: unsupported module heading ${JSON.stringify(rest.slice(0, 60))}. The generator only rewrites ` +
        `named imports, named re-exports and const/let/var/function/class declarations; everything else fails closed ` +
        `instead of being emitted unrewritten.`
    );
  }

  // Apply from the end so earlier offsets stay valid. String.replace is deliberately not used: it would
  // mangle replacements containing `$`.
  let code = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }

  const body = code.replace(/\s+$/, "");
  const exported_ = exported.filter((name, index) => exported.indexOf(name) === index);
  return {
    code: body + "\n\nmodule.exports = {\n" + exported_.map((name) => "  " + name).join(",\n") + "\n};\n",
    exports: exported_
  };
}

/** Header shared by every generated module. Contains the provenance of the single source of truth. */
function moduleHeader(sourcePath, sourceDigest) {
  return [
    "// GENERATED FILE — DO NOT HAND-EDIT.",
    "//",
    "// Source of truth: " + sourcePath,
    "// Source sha256:   " + sourceDigest,
    "// Generator:       tools/ui04b-wechat-runtime-artifact.mjs",
    "// Regenerate:      node tools/ui04b-wechat-runtime-artifact.mjs --write",
    "//",
    "// WeChat-loadable CommonJS derived mechanically from the accepted TypeScript module above: type",
    "// syntax is erased with Node's built-in type stripper and ES module syntax is rewritten to plain",
    "// CommonJS. Nothing in this file was hand-copied — there is exactly one implementation of the",
    "// client controller, the submission controller and the command codec, and it lives in the source",
    "// module named above.",
    "//",
    "// The artifact's runtime closure is pinned to exactly:",
    ...RUNTIME_MODULES.map((entry) => "//   " + entry.source),
    "// and contains no packages/core, packages/content, server module, Node builtin or third-party",
    "// dependency. See docs/UI04B_WECHAT_RUNTIME_ARTIFACT.md.",
    ""
  ].join("\n");
}

function facadeHeader(sources) {
  return [
    "// GENERATED FILE — DO NOT HAND-EDIT.",
    "//",
    "// UI04B — the bounded WeChat client runtime facade, and the single entry point a page should load.",
    "// Generator:  tools/ui04b-wechat-runtime-artifact.mjs",
    "// Regenerate: node tools/ui04b-wechat-runtime-artifact.mjs --write",
    "//",
    "// Each export below is re-published verbatim from a generated module that was mechanically derived",
    "// from its accepted TypeScript source, so the facade adds no implementation of its own:",
    ...sources.map((entry) => "//   " + entry),
    "//",
    "// The surface is deliberately bounded: controller orchestration, the injected-storage adapter and the",
    "// public error types a caller must be able to catch. No gameplay Core, Content or server symbol is",
    "// reachable through it. See docs/UI04B_WECHAT_RUNTIME_ARTIFACT.md.",
    ""
  ].join("\n");
}

function facadeSource() {
  const modules = [...new Set(FACADE_EXPORTS.map((entry) => entry.from))].sort();
  const aliases = new Map(modules.map((specifier, index) => [specifier, "dep" + index]));
  const lines = [];
  for (const specifier of modules) {
    lines.push("var " + aliases.get(specifier) + " = require(" + JSON.stringify(specifier) + ");");
  }
  lines.push("");
  lines.push("module.exports = {");
  const ordered = [...FACADE_EXPORTS].sort((left, right) => (left.name < right.name ? -1 : 1));
  ordered.forEach((entry, index) => {
    const tail = index === ordered.length - 1 ? "" : ",";
    lines.push("  " + entry.name + ": " + aliases.get(entry.from) + "." + entry.name + tail);
  });
  lines.push("};");
  return facadeHeader(RUNTIME_MODULES.map((entry) => entry.source)).replace(/\n$/, "\n") + lines.join("\n") + "\n";
}

/** Erases TypeScript type syntax. A failure here is fatal: an unstripped file is not loadable. */
function stripTypes(source, sourcePath) {
  try {
    return module.stripTypeScriptTypes(source, { mode: "strip", sourceUrl: sourcePath });
  } catch (error) {
    throw new RuntimeArtifactError(
      `${sourcePath}: Node's type stripper refused this module (${error.message}). The artifact cannot be derived ` +
        `from it. Use mode "transform" only if the source genuinely needs TypeScript-only syntax such as enums.`
    );
  }
}

function defaultRead(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

/**
 * Builds the whole artifact in memory. Pure: the only input is `read(relativeSourcePath) -> string`, so a
 * test can inject a mutated source and observe the generator's verdict without touching the worktree.
 */
export function buildRuntimeArtifact({ read = defaultRead } = {}) {
  const files = {};
  const sources = [];
  const exports = {};

  for (const entry of RUNTIME_MODULES) {
    const raw = read(entry.source);
    if (typeof raw !== "string") throw new RuntimeArtifactError(`${entry.source}: reader returned a non-string`);
    const source = raw.replace(/\r\n/g, "\n");
    const digest = sha256(source);
    sources.push({ path: entry.source, sha256: digest, bytes: Buffer.byteLength(source, "utf8") });

    const stripped = stripTypes(source, entry.source);
    const converted = toCommonJs(stripped, entry.source);
    exports[entry.source] = converted.exports;

    const code = moduleHeader(entry.source, digest) + converted.code;
    assertCommonJs(code, entry.source, entry.artifact);
    files[entry.artifact] = code;
  }

  const facade = facadeSource();
  assertCommonJs(facade, "tools/ui04b-wechat-runtime-artifact.mjs (facade)", FACADE_PATH);
  files[FACADE_PATH] = facade;

  // The transform must have actually produced the surface it claims: importing a name that the accepted
  // source no longer exports would otherwise emit `var { Gone } = require(...)` and only fail at runtime.
  for (const entry of FACADE_EXPORTS) {
    const owner = RUNTIME_MODULES.find((candidate) => candidate.specifier === entry.from);
    if (owner === undefined) {
      throw new RuntimeArtifactError(`facade export ${entry.name} names unknown module ${entry.from}`);
    }
    if (!exports[owner.source].includes(entry.name)) {
      throw new RuntimeArtifactError(
        `facade export ${entry.name} is not exported by ${owner.source}; the facade would publish undefined`
      );
    }
  }

  return { files, sources, exports, closure: RUNTIME_MODULES.map((entry) => entry.source) };
}

/**
 * Asserts a generated file is valid JavaScript and stays inside the approved runtime closure.
 *
 * `new vm.Script` compiles without executing, so this catches leftover TypeScript syntax and broken
 * CommonJS without registering handlers or touching a platform global.
 */
export function assertCommonJs(code, label, artifactPath) {
  try {
    new vm.Script(code, { filename: artifactPath });
  } catch (error) {
    throw new RuntimeArtifactError(`${artifactPath}: generated code does not parse as JavaScript (${error.message})`);
  }

  const masked = codeOnly(code);
  const leftovers = masked.match(/(^|\n)[ \t]*(import|export)\b/g);
  if (leftovers !== null) {
    throw new RuntimeArtifactError(
      `${artifactPath}: ${leftovers.length} module statement(s) survived the CommonJS rewrite (${leftovers
        .map((entry) => entry.trim())
        .join(", ")}). The result would not be loadable with CommonJS require.`
    );
  }

  const nonLiteral = nonLiteralRequireArguments(code);
  if (nonLiteral.length > 0) {
    throw new RuntimeArtifactError(
      `${artifactPath}: non-literal require argument(s) ${JSON.stringify(nonLiteral)}. The WeChat packager builds ` +
        `the dependency graph by static analysis, so every require argument must be a plain string literal.`
    );
  }
  for (const call of requireArguments(code)) {
    if (!ALLOWED_SPECIFIERS.includes(call.specifier)) {
      throw new RuntimeArtifactError(
        `${artifactPath}: require(${JSON.stringify(call.specifier)}) is outside the pinned artifact set ` +
          `(${ALLOWED_SPECIFIERS.join(", ")}). Only sibling artifact modules may be required.`
      );
    }
  }

  // Types are gone or the file is not JavaScript. Scanned on code characters only: the kept source doc
  // comments legitimately discuss TypeScript syntax.
  for (const marker of [
    ["import type", /\bimport\s+type\b/],
    ["export type", /\bexport\s+type\b/],
    ["interface declaration", /\binterface\s+[A-Za-z_$]/],
    ["as const", /\bas\s+const\b/],
    ["satisfies operator", /\bsatisfies\b/],
    ["readonly modifier", /\breadonly\s/],
    ["declare modifier", /\bdeclare\s+(?:const|let|var|function|class|interface|type)\b/],
    ["enum declaration", /\benum\s+[A-Za-z_$]/],
    ["angle-bracket type argument", /\bfunction\s+[A-Za-z_$][\w$]*\s*</]
  ]) {
    if (marker[1].test(masked)) {
      throw new RuntimeArtifactError(
        `${artifactPath}: left-over TypeScript syntax (${marker[0]}); the file is not loadable JavaScript`
      );
    }
  }
}

/**
 * Compares the generated artifact with the committed one. `files` lets a test compare against an injected
 * artifact, and `read` lets a test inject a drifted source.
 */
export function checkRuntimeArtifact({ root = REPO_ROOT, read = defaultRead, files } = {}) {
  const artifact = buildRuntimeArtifact({ read });
  const committed = files ?? readCommitted(root);
  const problems = [];

  for (const artifactPath of ARTIFACT_PATHS) {
    if (!(artifactPath in committed)) {
      problems.push(`${artifactPath}: missing from the committed artifact`);
      continue;
    }
    if (committed[artifactPath] === artifact.files[artifactPath]) continue;
    problems.push(
      `${artifactPath}: committed bytes differ from a fresh generation (${describeFirstDifference(
        committed[artifactPath],
        artifact.files[artifactPath]
      )}). Either the accepted source drifted, or the generated file was hand-edited. Regenerate with ` +
        `"node tools/ui04b-wechat-runtime-artifact.mjs --write".`
    );
  }

  const unexpected = Object.keys(committed).filter(
    (relative) => relative.startsWith(RUNTIME_DIR + "/") && !ARTIFACT_PATHS.includes(relative)
  );
  for (const relative of unexpected) {
    problems.push(`${relative}: unexpected file inside ${RUNTIME_DIR}; that directory is generated, not hand-managed`);
  }

  return { ok: problems.length === 0, problems, artifact, committed };
}

/** Every committed file under `miniprogram/runtime/`, as repo-relative path -> source. */
export function readCommitted(root) {
  const directory = path.join(root, RUNTIME_DIR);
  const files = {};
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(directory, entry.name);
    files[RUNTIME_DIR + "/" + entry.name] = fs.readFileSync(absolute, "utf8");
  }
  return files;
}

function describeFirstDifference(left, right) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const limit = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < limit; index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return `first difference at line ${index + 1}: committed ${JSON.stringify(
        (leftLines[index] ?? "<absent>").slice(0, 80)
      )}, regenerated ${JSON.stringify((rightLines[index] ?? "<absent>").slice(0, 80))}`;
    }
  }
  return "length-only difference";
}

export function writeRuntimeArtifact({ root = REPO_ROOT, artifact }) {
  const built = artifact ?? buildRuntimeArtifact();
  const written = [];
  for (const artifactPath of ARTIFACT_PATHS) {
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
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04b-wechat-runtime-artifact.mjs");

if (isDirectRun) {
  const write = process.argv.includes("--write");
  if (write) {
    const written = writeRuntimeArtifact({});
    if (written.length === 0) console.log(`${RUNTIME_DIR}: already up to date (idempotent write)`);
    else for (const artifactPath of written) console.log("wrote " + artifactPath);
  }
  const result = checkRuntimeArtifact({});
  for (const source of result.artifact.sources) {
    console.log(`source ${source.path}: sha256 ${source.sha256} (${source.bytes} bytes)`);
  }
  for (const artifactPath of ARTIFACT_PATHS) {
    console.log(`artifact ${artifactPath}: ${Buffer.byteLength(result.artifact.files[artifactPath], "utf8")} bytes`);
  }
  if (result.ok) {
    console.log("UI04B WeChat runtime artifact: PASS (deterministic regeneration matches the committed bytes)");
  } else {
    console.error(result.problems.join("\n"));
    process.exitCode = 1;
  }
}
