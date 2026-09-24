/**
 * UI04B — WeChat client runtime artifact / packager bridge.
 *
 * The task turns the accepted client-safe controller (UI03 / UI04A) into a JavaScript runtime artifact
 * that physically lives under `miniprogramRoot`, so the WeChat packager can load it, WITHOUT creating a
 * second controller, a second submission controller or a second command codec. The accepted TypeScript
 * packages stay the single source of truth; the artifact is a deterministic derivation of them.
 *
 * This suite has five jobs:
 *   1. prove the derivation is deterministic and that a drift in either direction fails;
 *   2. prove the derivation is fail-closed — an edge out of the approved closure, a Node builtin, or a
 *      module syntax the transform does not understand must stop generation, not slip through;
 *   3. prove the committed artifact is bounded and loadable, with negative controls that show the audit
 *      and the smoke can actually fail;
 *   4. prove the artifact behaves like the accepted sources (differential E2E through the generated
 *      controller, with byte-identical submitted envelopes);
 *   5. prove UI04B changed nothing outside its scope: no page wiring, no default-route change, no new
 *      dependency, no gameplay / Content / server source touched, preview still fixture-driven.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { listRuntimeModules, nonLiteralRequireArguments } from "../tools/ui02-preview-fixture-module.mjs";
import {
  ARTIFACT_PATHS,
  FACADE_EXPORTS,
  FACADE_PATH,
  RUNTIME_DIR,
  RUNTIME_MODULES,
  RuntimeArtifactError,
  buildRuntimeArtifact,
  checkRuntimeArtifact,
  readCommitted,
  writeRuntimeArtifact
} from "../tools/ui04b-wechat-runtime-artifact.mjs";
import { auditWeChatRuntimeArtifact, facadeExportKeys } from "../tools/ui04b-wechat-runtime-audit.mjs";
import { EXPECTED_PUBLIC_API, FIXTURE_PATH, loadRuntimeArtifact, runSmoke } from "../tools/ui04b-wechat-runtime-smoke.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));
const sha256Of = (value) => createHash("sha256").update(value).digest("hex");
const plain = (value) => JSON.parse(JSON.stringify(value));

/** A reader that serves the real sources except for the injected overrides. */
const readerWith = (overrides) => (relative) =>
  Object.hasOwn(overrides, relative) ? overrides[relative] : read(relative);

/** Same algorithm the other scope pins were produced with: sha256 over sorted "<relpath>:<sha256(content)>\n". */
function treeDigestOf(relative) {
  const absolute = path.join(ROOT, relative);
  const walk = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  const files = (fs.statSync(absolute).isDirectory() ? walk(absolute) : [absolute])
    .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"))
    .sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update(":");
    digest.update(sha256Of(fs.readFileSync(path.join(ROOT, file))));
    digest.update("\n");
  }
  return digest.digest("hex");
}

/** Removes the line that requires `specifier`, and asserts the line really existed. */
function withoutRequire(source, specifier) {
  const needle = `require(${JSON.stringify(specifier)})`;
  const lines = source.split("\n");
  assert.equal(lines.some((line) => line.includes(needle)), true, "the mutation target must exist: " + needle);
  return lines.filter((line) => !line.includes(needle)).join("\n");
}

/**
 * A surgical replacement that refuses to be a silent no-op.
 *
 * A negative control built on `source.replace(needle, …)` passes for the wrong reason when `needle` is
 * absent — which is how a comment gets mutated instead of the call, or nothing at all. Every mutation in
 * this suite therefore asserts that its anchor exists first.
 */
function replaceOnce(source, needle, replacement) {
  assert.equal(source.includes(needle), true, "the mutation anchor must exist: " + JSON.stringify(needle));
  return source.replace(needle, replacement);
}

/** A copy of the committed artifact with selected files replaced. */
function artifactWith(overrides) {
  return { ...readCommitted(ROOT), ...overrides };
}

/** Every violation the audit reports for a mutated artifact. */
function violationsFor(files) {
  return auditWeChatRuntimeArtifact({ files }).violations;
}

/**
 * Files this task must not touch. They are the evidence for "the fixture-driven preview was not converted
 * into live gameplay", "the default route did not move" and "no legacy page changed"; the accepted
 * UI02/UI02R1/UI04A digest pins already cover the rest of the tree, so this list stays deliberately short
 * and focused on UI04B's own risk.
 */
const UNTOUCHED_DIGESTS = {
  "miniprogram/app.json": "d22f149f3cc1fe06bec63a3f20cab78ecb64a5f9df9d0bba1e738ad54e5cb27f",
  "miniprogram/app.js": "cbf5be0fc91dd5ec1dfb69fff38b266edb508b9c884aaf84607f50ee1f08f1c0",
  "miniprogram/pages/v2-preview/v2-preview.js": "3ec078953ca4d369f43d371201c0bb69ff87cf6dfaf309b306a2824351406d5d",
  "miniprogram/pages/v2-preview/v2-preview.wxml": "b0f17f715a8fb58b6003d100c7e16a9c6ea1a148158c6f8da79ef22ebe81c97a",
  "miniprogram/pages/v2-preview/v2-preview.wxss": "836efbf3eac428511e0739b3616cc57bf3428a69629a6b6e741ae197727ec40c"
};

// ================================================================ 1. derivation is real and deterministic

test("UI04B_derivation: the artifact is derived from the accepted source modules, not hand-copied", () => {
  const artifact = buildRuntimeArtifact({});
  assert.deepEqual(
    artifact.closure,
    RUNTIME_MODULES.map((entry) => entry.source),
    "the runtime closure must be exactly the pinned client-safe modules"
  );
  for (const entry of RUNTIME_MODULES) {
    const generated = artifact.files[entry.artifact];
    assert.notEqual(generated, undefined, entry.artifact + " must be generated");
    assert.equal(
      generated.includes("// Source of truth: " + entry.source),
      true,
      entry.artifact + " must record its source of truth"
    );
    assert.equal(
      generated.includes("// Source sha256:   " + sha256Of(read(entry.source).replace(/\r\n/g, "\n"))),
      true,
      entry.artifact + " must record the source digest it was derived from"
    );
    // The derivation is a transform, not a paraphrase: every accepted export name survives verbatim.
    for (const name of artifact.exports[entry.source]) {
      assert.equal(artifact.files[entry.artifact].includes(name), true, `${entry.artifact} lost ${name}`);
    }
  }
  // The facade is generated too, and is bounded by the pinned allow-list rather than by whatever the
  // modules happen to export.
  assert.deepEqual(facadeExportKeys(artifact.files[FACADE_PATH]), EXPECTED_PUBLIC_API);
  assert.deepEqual(
    FACADE_EXPORTS.map((entry) => entry.name).sort(),
    EXPECTED_PUBLIC_API,
    "the generator's allow-list and the smoke's hard-coded expectation must agree"
  );
});

test("UI04B_determinism: repeated generation is byte-identical and writing is idempotent", () => {
  const first = buildRuntimeArtifact({});
  const second = buildRuntimeArtifact({});
  for (const artifactPath of ARTIFACT_PATHS) {
    assert.equal(first.files[artifactPath], second.files[artifactPath], artifactPath + " must be reproducible");
  }
  // CRLF normalisation: a checkout with different line endings must not change the output.
  const crlfReader = (relative) => read(relative).replace(/\n/g, "\r\n");
  const crlf = buildRuntimeArtifact({ read: crlfReader });
  for (const artifactPath of ARTIFACT_PATHS) {
    assert.equal(crlf.files[artifactPath], first.files[artifactPath], artifactPath + " must not depend on line endings");
  }
  // Idempotent write: a second --write round must be a no-op, not a churn loop.
  assert.deepEqual(writeRuntimeArtifact({ root: ROOT, artifact: first }), []);
  assert.equal(checkRuntimeArtifact({}).ok, true);
});

test("UI04B_freshness: source drift and artifact drift both fail, with a diagnosis", () => {
  const committed = readCommitted(ROOT);
  assert.deepEqual(Object.keys(committed).sort(), [...ARTIFACT_PATHS].sort());

  const clean = checkRuntimeArtifact({});
  assert.equal(clean.ok, true, clean.problems.join("\n"));

  const driftedSource = checkRuntimeArtifact({
    read: readerWith({ "packages/wechat-shell/src/index.ts": read("packages/wechat-shell/src/index.ts") + "\n// drifted\n" })
  });
  assert.equal(driftedSource.ok, false, "a changed source must fail the freshness check");
  assert.equal(
    driftedSource.problems.some((problem) => problem.includes(RUNTIME_DIR + "/wechat-shell.js")),
    true,
    driftedSource.problems.join("\n")
  );

  const handEdited = checkRuntimeArtifact({
    files: artifactWith({ [FACADE_PATH]: committed[FACADE_PATH] + "\nmodule.exports.extra = 1;\n" })
  });
  assert.equal(handEdited.ok, false, "a hand-edited artifact must fail the freshness check");
  assert.equal(handEdited.problems.some((problem) => problem.includes("first difference")), true, handEdited.problems.join("\n"));

  const extraFile = checkRuntimeArtifact({ files: artifactWith({ [RUNTIME_DIR + "/extra.js"]: "module.exports = {};\n" }) });
  assert.equal(extraFile.ok, false, "an extra generated-looking file must fail the freshness check");
  assert.equal(extraFile.problems.some((problem) => problem.includes("extra.js")), true, extraFile.problems.join("\n"));
});

// ================================================================ 2. the derivation is fail-closed

test("UI04B_failclosed: growing the runtime closure or using a Node specifier stops generation", () => {
  const shell = read("packages/wechat-shell/src/index.ts");
  const ui = read("packages/application-ui/src/index.ts");
  const wire = read("packages/command-wire/src/index.ts");

  const cases = [
    {
      name: "an import of gameplay Core",
      overrides: { "packages/wechat-shell/src/index.ts": shell + '\nimport { reduce } from "../../core/src/index.ts";\n' },
      matches: /core\/src\/index\.ts/
    },
    {
      name: "an import of Content",
      overrides: { "packages/application-ui/src/index.ts": ui + '\nimport { ContentRegistry } from "../../content/src/index.ts";\n' },
      matches: /not one of the pinned client-safe source modules/
    },
    {
      name: "a Node builtin specifier",
      overrides: { "packages/command-wire/src/index.ts": wire + '\nimport { readFileSync } from "node:fs";\n' },
      matches: /is not a relative path/
    },
    {
      name: "a relative path that escapes the pinned set",
      overrides: { "packages/command-wire/src/index.ts": wire + '\nimport { Loader } from "../../core/src/loader.ts";\n' },
      matches: /not one of the pinned client-safe source modules/
    },
    {
      name: "an import form the transform does not implement",
      overrides: { "packages/command-wire/src/index.ts": wire + '\nimport * as fs from "./helpers.js";\n' },
      matches: /unsupported module heading/
    },
    {
      name: "a default export",
      overrides: { "packages/command-wire/src/index.ts": wire + "\nexport default function () {}\n" },
      matches: /unsupported module heading/
    }
  ];

  for (const entry of cases) {
    assert.throws(
      () => buildRuntimeArtifact({ read: readerWith(entry.overrides) }),
      (error) => {
        assert.equal(error instanceof RuntimeArtifactError, true, entry.name + " must raise the artifact error");
        assert.match(error.message, entry.matches, entry.name);
        return true;
      },
      entry.name + " must stop generation"
    );
  }
});

test("UI04B_failclosed: losing a module the facade publishes stops generation", () => {
  // The module silently stops exporting the controller: a facade that published `undefined` would be a
  // broken artifact, so generation must refuse instead.
  const shell = read("packages/wechat-shell/src/index.ts").replace("export class WeChatRunController {", "class WeChatRunController {");
  assert.equal(shell.includes("export class WeChatRunController"), false, "the mutation must really remove the export");
  assert.throws(
    () => buildRuntimeArtifact({ read: readerWith({ "packages/wechat-shell/src/index.ts": shell }) }),
    /WeChatRunController is not exported by packages\/wechat-shell\/src\/index\.ts/
  );
});

// ================================================================ 3. bounded, loadable, and the audits are not fake-green

test("UI04B_artifact_audit: the committed artifact is exactly the approved client runtime closure", () => {
  const result = auditWeChatRuntimeArtifact({});
  assert.deepEqual(result.violations, [], result.violations.join("\n"));
  assert.deepEqual(Object.keys(result.graph).sort(), [...ARTIFACT_PATHS].sort());
  assert.deepEqual([...new Set(RUNTIME_MODULES.map((entry) => entry.specifier))].sort(), [
    "./application-ui.js",
    "./command-wire.js",
    "./wechat-shell.js"
  ]);
});

test("UI04B_artifact_audit: the audit detects a forbidden edge, a Node builtin and a non-literal require", () => {
  const committed = readCommitted(ROOT);
  const shellPath = RUNTIME_DIR + "/wechat-shell.js";
  const uiPath = RUNTIME_DIR + "/application-ui.js";
  const facadePath = FACADE_PATH;

  const forbiddenEdge = violationsFor(
    artifactWith({ [shellPath]: committed[shellPath] + '\nvar core = require("../../packages/core/src/index.ts");\n' })
  );
  assert.equal(forbiddenEdge.length > 0, true, "an edge into gameplay Core must be caught");
  assert.equal(forbiddenEdge.some((entry) => entry.includes("outside the approved client runtime closure")), true, forbiddenEdge.join("\n"));
  assert.equal(forbiddenEdge.some((entry) => entry.includes("packages/core")), true, forbiddenEdge.join("\n"));

  const nodeBuiltin = violationsFor(artifactWith({ [uiPath]: committed[uiPath] + '\nvar fs = require("fs");\n' }));
  assert.equal(nodeBuiltin.some((entry) => entry.includes("outside the approved client runtime closure")), true, nodeBuiltin.join("\n"));

  const nodePrefixed = violationsFor(artifactWith({ [facadePath]: committed[facadePath] + '\nvar child = require("node:child_process");\n' }));
  assert.equal(nodePrefixed.some((entry) => entry.includes("node:child_process")), true, nodePrefixed.join("\n"));

  const nonLiteral = violationsFor(
    artifactWith({ [facadePath]: replaceOnce(committed[facadePath], 'require("./command-wire.js")', "require(MODULE_NAME)") })
  );
  assert.equal(nonLiteral.some((entry) => entry.includes("non-literal require argument")), true, nonLiteral.join("\n"));
});

test("UI04B_artifact_audit: the audit detects unreachable modules, extra files, unsigned bytes and TypeScript syntax", () => {
  const committed = readCommitted(ROOT);
  const wirePath = RUNTIME_DIR + "/command-wire.js";
  const shellPath = RUNTIME_DIR + "/wechat-shell.js";
  const facadePath = FACADE_PATH;

  // Cut both incoming edges to the lower two modules: they stay in the directory but become unreachable,
  // which only a real closure walk from the facade can notice.
  const unreachable = violationsFor(
    artifactWith({
      [facadePath]: withoutRequire(committed[facadePath], "./command-wire.js"),
      [shellPath]: withoutRequire(committed[shellPath], "./application-ui.js")
    })
  );
  assert.equal(unreachable.some((entry) => entry.includes("does not reach " + wirePath)), true, unreachable.join("\n"));
  assert.equal(
    unreachable.some((entry) => entry.includes("does not reach " + RUNTIME_DIR + "/application-ui.js")),
    true,
    unreachable.join("\n")
  );

  const extraFile = violationsFor(artifactWith({ [RUNTIME_DIR + "/unreviewed.js"]: "module.exports = {};\n" }));
  assert.equal(extraFile.some((entry) => entry.includes("unexpected file")), true, extraFile.join("\n"));

  const unsignedBytes = violationsFor(
    artifactWith({ [shellPath]: replaceOnce(committed[shellPath], "// Source sha256:", "// Source digest:") })
  );
  assert.equal(unsignedBytes.some((entry) => entry.includes("provenance digest does not match")), true, unsignedBytes.join("\n"));

  const unlabelled = violationsFor(
    artifactWith({
      [shellPath]: replaceOnce(committed[shellPath], "// Source of truth: packages/wechat-shell/src/index.ts\n", "")
    })
  );
  assert.equal(unlabelled.some((entry) => entry.includes("does not record packages/wechat-shell/src/index.ts as its source of truth")), true, unlabelled.join("\n"));

  const tsSyntax = violationsFor(
    artifactWith({
      [wirePath]: replaceOnce(committed[wirePath], "function validateGameCommand", "const ids = [] as const;\nfunction validateGameCommand")
    })
  );
  assert.equal(tsSyntax.some((entry) => entry.includes("left-over TypeScript syntax")), true, tsSyntax.join("\n"));

  const gameplayCopy = violationsFor(
    artifactWith({ [wirePath]: committed[wirePath] + "\nvar interior = 'packages/core/src/reducer.ts';\n" })
  );
  assert.equal(gameplayCopy.some((entry) => entry.includes("code references packages/core/")), true, gameplayCopy.join("\n"));

  const grownFacade = violationsFor(
    artifactWith({ [facadePath]: committed[facadePath] + "\nmodule.exports.reduce = dep1.mapCoreActionIntents;\n" })
  );
  assert.equal(grownFacade.some((entry) => entry.includes("not on the pinned bounded surface")), true, grownFacade.join("\n"));

  const shrunkFacade = violationsFor(
    artifactWith({
      [facadePath]: replaceOnce(committed[facadePath], "  WeChatRunController: dep1.WeChatRunController,\n", "")
    })
  );
  assert.equal(shrunkFacade.some((entry) => entry.includes("no longer publishes the pinned public export")), true, shrunkFacade.join("\n"));
});

test("UI04B_packager: every miniprogram module — the artifact included — uses static literal requires only", () => {
  const modules = listRuntimeModules(ROOT);
  for (const artifactPath of ARTIFACT_PATHS) {
    assert.equal(modules.includes(artifactPath), true, artifactPath + " must be inside miniprogramRoot");
  }
  const offenders = modules
    .map((relative) => ({ relative, bad: nonLiteralRequireArguments(read(relative)) }))
    .filter((entry) => entry.bad.length > 0);
  assert.deepEqual(offenders, [], "the WeChat packager only bundles statically analysable require arguments");
});

test("UI04B_smoke: the committed artifact loads as CommonJS and is the accepted code, not a look-alike", async () => {
  const result = await runSmoke({ root: ROOT });
  assert.deepEqual(result.failures, [], result.failures.join("\n"));
  assert.equal(result.ok, true);
  assert.equal(result.checks.length >= 8, true, `expected a substantive smoke, got ${result.checks.length} checks`);
  for (const required of [
    "smoke: the artifact loaded as CommonJS with no platform or Node global in scope",
    "smoke: the facade publishes exactly the pinned bounded client orchestration surface",
    "smoke: the generated controller orchestrates the accepted flow identically end to end"
  ]) {
    assert.equal(result.checks.includes(required), true, "missing smoke check: " + required);
  }
});

test("UI04B_smoke: the smoke can fail — the loadability and surface assertions are real", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ui04b-smoke-"));
  try {
    fs.mkdirSync(path.join(temporary, RUNTIME_DIR), { recursive: true });
    for (const artifactPath of ARTIFACT_PATHS) {
      fs.writeFileSync(path.join(temporary, artifactPath), read(artifactPath), "utf8");
    }

    // Baseline: the copied artifact loads and publishes exactly the pinned surface.
    const clean = loadRuntimeArtifact({ root: temporary });
    assert.deepEqual([...Object.keys(clean.facade)].sort(), EXPECTED_PUBLIC_API);

    // Negative control 1 — a grown public surface must be visible to the smoke's assertion.
    fs.writeFileSync(
      path.join(temporary, FACADE_PATH),
      read(FACADE_PATH) + "\nmodule.exports.wxRequest = function () {};\n",
      "utf8"
    );
    const grown = loadRuntimeArtifact({ root: temporary });
    assert.notDeepEqual([...Object.keys(grown.facade)].sort(), EXPECTED_PUBLIC_API, "the smoke's surface assertion must be able to fail");

    // Negative control 2 — a non-relative require must not be silently resolved by the loader.
    fs.writeFileSync(
      path.join(temporary, FACADE_PATH),
      replaceOnce(read(FACADE_PATH), 'require("./wechat-shell.js")', 'require("fs")'),
      "utf8"
    );
    assert.throws(
      () => loadRuntimeArtifact({ root: temporary }),
      /non-relative specifier/,
      "a Node builtin reached through the artifact must fail the loader"
    );

    // Negative control 3 — a require that escapes the artifact directory must not be followed.
    fs.writeFileSync(
      path.join(temporary, FACADE_PATH),
      replaceOnce(read(FACADE_PATH), 'require("./wechat-shell.js")', 'require("../../packages/wechat-shell/src/index.ts")'),
      "utf8"
    );
    assert.throws(() => loadRuntimeArtifact({ root: temporary }), /escapes the artifact directory/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("UI04B_smoke: the fixture-driven preview still renders from fixtures, not from the runtime", () => {
  // UI04B must not turn the dev preview into live gameplay. Nothing outside the generated directory may
  // require the runtime; when UI04C wires a page it will have to say so on purpose, in its own task.
  const consumers = listRuntimeModules(ROOT)
    .filter((relative) => !relative.startsWith(RUNTIME_DIR + "/"))
    .filter((relative) => {
      const source = read(relative);
      return source.includes("runtime/index.js") || source.includes("./runtime/") || source.includes("WeChatRunController");
    });
  assert.deepEqual(consumers, [], "no miniprogram page may load the runtime in UI04B");

  for (const [relative, digest] of Object.entries(UNTOUCHED_DIGESTS)) {
    assert.equal(sha256Of(read(relative)), digest, relative + " must be byte-identical to the UI04B task base");
  }
  const preview = read("miniprogram/pages/v2-preview/v2-preview.js");
  assert.equal(preview.includes("v2-fixtures.js"), true, "the preview must still be fixture-driven");
});

// ================================================================ 4. registration and scope

test("UI04B_registration: the generator, audit, smoke and dedicated suite are registered", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.scripts["test:ui04b"], "node --test tests/ui04b.test.mjs");
  assert.equal(pkg.scripts.test.split(" ").includes("tests/ui04b.test.mjs"), true, "the aggregate must run UI04B");
  assert.equal(pkg.scripts["ui04b:artifact"], "node tools/ui04b-wechat-runtime-artifact.mjs");
  assert.equal(pkg.scripts["ui04b:artifact:write"], "node tools/ui04b-wechat-runtime-artifact.mjs --write");
  assert.equal(pkg.scripts["ui04b:audit"], "node tools/ui04b-wechat-runtime-audit.mjs");
  assert.equal(pkg.scripts["ui04b:smoke"], "node tools/ui04b-wechat-runtime-smoke.mjs");
  for (const relative of ["tools/ui04b-wechat-runtime-artifact.mjs", "tools/ui04b-wechat-runtime-audit.mjs", "tools/ui04b-wechat-runtime-smoke.mjs", "tests/ui04b.test.mjs"]) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, relative);
  }
});

test("UI04B_docs: the artifact, its ownership, the packager seam and the remaining UI04C work are documented", () => {
  const doc = read("docs/UI04B_WECHAT_RUNTIME_ARTIFACT.md");
  for (const phrase of [
    "miniprogram/runtime",
    "packages/command-wire/src/index.ts",
    "packages/application-ui/src/index.ts",
    "packages/wechat-shell/src/index.ts",
    "ui04b:artifact",
    "ui04b:audit",
    "ui04b:smoke",
    "checkFixtureRequire",
    "UI04C",
    "stripTypeScriptTypes"
  ]) {
    assert.equal(doc.includes(phrase), true, "the documentation must mention " + phrase);
  }
  // The residual risks that this repository genuinely cannot prove must be written down, not implied.
  assert.equal(doc.includes("DevTools"), true, "the manual DevTools verification must be listed");
});

test("UI04B_scope: no new dependency, no bundler, no route change and no page wiring", () => {
  const pkg = readJson("package.json");
  assert.deepEqual(Object.keys(pkg.devDependencies), ["typescript"], "the only devDependency must stay the pinned typescript");
  assert.equal(pkg.dependencies, undefined, "no runtime dependency may be added");
  assert.equal(Object.keys(pkg.devDependencies).some((name) => /esbuild|webpack|rollup|vite|parcel|swc/.test(name)), false);
  for (const forbidden of ["esbuild.config.mjs", "webpack.config.js", "rollup.config.mjs", "vite.config.ts"]) {
    assert.equal(fs.existsSync(path.join(ROOT, forbidden)), false, forbidden + " must not exist");
  }

  const project = readJson("project.config.json");
  assert.equal(project.miniprogramRoot, "miniprogram/");
  assert.equal(FACADE_PATH.startsWith(project.miniprogramRoot), true, "the artifact must live inside miniprogramRoot");

  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[0], "pages/start/start", "the default route must not move");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-preview/v2-preview");
  assert.deepEqual(app.tabBar.list.map((entry) => entry.pagePath), ["pages/game/game", "pages/rank/rank"]);
  assert.equal(app.pages.some((page) => page.includes("runtime")), false, "UI04B must not register a page");

  const artifactCode = ARTIFACT_PATHS.map((artifactPath) => read(artifactPath)).join("\n");
  for (const forbidden of ["wx.request", "wx.cloud", "callFunction", "cloudfunctions"]) {
    assert.equal(artifactCode.includes(forbidden), false, "the artifact must not reference " + forbidden);
  }
  assert.equal(artifactCode.includes("v2-preview"), false, "the artifact must not depend on the dev preview");
  assert.equal(read(FIXTURE_PATH).includes("rootSeed"), false, "the public fixture must stay public-only");
});

test("UI04B_scope: the trees UI02/UI02R1 do not already pin are untouched by this task", () => {
  // UI02R1 already pins core, Content, server, platform-contract, application-ui, wechat-shell and the 1.0
  // pages with their exact file lists. These four are the gaps this task could have widened — the wire
  // package the artifact is derived from, the 1.0 cloudfunctions tree, the preview page manifest, and the
  // dev preview's fixture module sibling — so they are pinned here with the identical algorithm.
  const expected = {
    "packages/command-wire/src": "2ec21e2128bf742dea1e89993e10178c4dbade4623b9c7172e03a6711494352f",
    cloudfunctions: "482f6ce918366228e92b05cf33849322936773c95769ee7da194fbf482d70fc5",
    "miniprogram/pages/v2-preview": "99cea159ea16bd2bbba98ee06db94f9d7602c01e559482ee96d618b2e4ad329c",
    "miniprogram/pages/v2-preview/v2-preview.json": "b529428057cc32edcc20e4b340b84a680ca674fd9c3e4add8078015f0b02bdd1"
  };
  for (const [relative, digest] of Object.entries(expected)) {
    assert.equal(treeDigestOf(relative), digest, relative + " must be byte-equivalent to the UI04B task base");
  }
  // Cross-check the algorithm itself against a digest UI02R1 computed independently for the same tree.
  assert.equal(treeDigestOf("server/src"), "5609f8335f03d445137de30fa9f6af5047ca876ebe885e4544f8d864824620df");
});
