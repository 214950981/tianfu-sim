/**
 * UI04B — Node-executable CommonJS smoke for the generated WeChat client runtime artifact.
 *
 * WHAT THIS PROVES
 *
 * `tools/ui04b-wechat-runtime-artifact.mjs` proves the artifact is *derived* from the accepted sources,
 * and `tools/ui04b-wechat-runtime-audit.mjs` proves it is *bounded*. This smoke proves the other half:
 * the committed bytes are a loadable CommonJS module whose behaviour is the accepted behaviour.
 *
 *  1. LOADABILITY. `miniprogram/runtime/index.js` is executed in a fresh `node:vm` context as CommonJS:
 *     `exports`/`module`/`require` are supplied and nothing else. There is no `wx`, no `tt`, no `Page`,
 *     no `Component`, no `getApp` and no `process` in that context, so a reference to any of them would
 *     throw during load. The load succeeding is the proof that loading this artifact neither requires a
 *     platform host nor executes server code.
 *  2. THE BOUNDED SURFACE EXISTS. The facade publishes exactly the pinned client orchestration API — the
 *     controller, the injected-storage adapter and the public error types a caller must be able to catch.
 *  3. IT IS THE SAME CODE, NOT A LOOK-ALIKE. Every exported function that can be exercised over the
 *     committed public fixtures is run twice — once from the generated CommonJS and once from the
 *     accepted TypeScript module — and the results must be deeply equal. The envelopes the generated
 *     controller submits must be byte-identical to the ones the TypeScript controller submits.
 *
 * Cross-realm note: values produced inside the `vm` context have that realm's prototypes, so
 * `assert.deepStrictEqual` against a host value fails even when the printed contents are identical.
 * Every comparison normalises through `JSON.parse(JSON.stringify(...))`, and every collection is
 * re-materialised in the host realm before comparison.
 *
 * USAGE
 *
 *   node tools/ui04b-wechat-runtime-smoke.mjs      # exit 1 on any failed check
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import { ARTIFACT_PATHS, FACADE_PATH, REPO_ROOT, RUNTIME_DIR } from "./ui04b-wechat-runtime-artifact.mjs";

/**
 * The exact public surface the artifact is allowed to publish, hard-coded here so neither the generator
 * nor the test can widen the surface by agreeing with itself.
 */
export const EXPECTED_PUBLIC_API = [
  "APP_ERROR_CODES",
  "ArchiveUnavailableError",
  "CommandValidationError",
  "IntentUnavailableError",
  "RetryUnavailableError",
  "SubmissionLockedError",
  "WeChatRunController",
  "createWeChatPlatformStorage"
];

export const FIXTURE_PATH = "miniprogram/pages/v2-preview/v2-fixtures.json";

/**
 * Loads every committed artifact file in one shared `node:vm` context as CommonJS.
 *
 * Each file is compiled inside the context and invoked through a CommonJS module wrapper, so top-level
 * `var`/`function` declarations stay module-scoped exactly as they would under WeChat's CommonJS loader.
 * The context exposes no platform and no Node global, and `requested` records every specifier the module
 * system was actually asked for, so the smoke can observe the artifact's real runtime graph instead of
 * trusting the pinned list.
 */
export function loadRuntimeArtifact({ root = REPO_ROOT } = {}) {
  const directory = path.join(root, RUNTIME_DIR);
  const context = vm.createContext({});
  const realm = vm.runInContext("({ Error, TypeError, Promise, JSON, Object, Array })", context);
  const modules = new Map();
  const cache = new Map();
  const requested = [];

  function load(absolute) {
    if (cache.has(absolute)) return cache.get(absolute);
    const filename = path.relative(root, absolute).replace(/\\/g, "/");
    const moduleObject = { exports: {} };
    cache.set(absolute, moduleObject.exports);
    modules.set(filename, moduleObject.exports);
    const wrapper = vm.runInContext(`(function (exports, module, require) {\n${fs.readFileSync(absolute, "utf8")}\n})`, context, {
      filename
    });
    wrapper(moduleObject.exports, moduleObject, (specifier) => {
      if (!requested.includes(specifier)) requested.push(specifier);
      if (typeof specifier !== "string" || !/^\.\.?\//.test(specifier)) {
        throw new Error("non-relative specifier: " + String(specifier));
      }
      const resolved = path.resolve(path.dirname(absolute), specifier);
      if (!resolved.startsWith(directory + path.sep)) {
        throw new Error("specifier escapes the artifact directory: " + specifier);
      }
      return load(resolved);
    });
    cache.set(absolute, moduleObject.exports);
    modules.set(filename, moduleObject.exports);
    return moduleObject.exports;
  }

  const facade = load(path.join(root, FACADE_PATH));
  return { facade, modules, requested, realm, context, load: (relative) => modules.get(relative.replace(/\\/g, "/")), root };
}

/** Re-materialises a cross-realm value in the host realm so strict comparison is meaningful. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * Re-materialises a host-realm value *inside* the `vm` realm.
 *
 * The command codec rejects anything whose prototype is not the realm's own `Object.prototype`, which is
 * correct for an ordinary run (a real client is one realm) but means a host-realm literal cannot be fed
 * to the generated codec in a test. Round-tripping through the realm's own `JSON.parse` produces exactly
 * the plain objects a WeChat page would hand it.
 */
const inRealm = (context, value) => vm.runInContext("(JSON.parse(" + JSON.stringify(JSON.stringify(value)) + "))", context);

function fakeStorage() {
  const written = new Map();
  return {
    getLocal: (key) => Promise.resolve(written.has(key) ? written.get(key) : null),
    setLocal: (key, value) => {
      written.set(key, value);
      return Promise.resolve();
    }
  };
}

/**
 * A transport that never touches the network: it serves a scripted public ViewModel and keeps every
 * envelope it was asked to send, so the two controllers' submissions can be compared byte for byte.
 */
function scriptedTransport(view, nextView) {
  const sent = [];
  let current = view;
  return {
    sent,
    transport: {
      fetchView: () => Promise.resolve(current),
      createRunOffer: () => Promise.resolve(null),
      sendCommand: (envelope) => {
        sent.push(envelope);
        const result = { ok: true, commandId: envelope.commandId, stateVersion: envelope.expectedStateVersion + 1 };
        if (nextView !== undefined) current = nextView;
        return Promise.resolve(result);
      }
    }
  };
}

const sessionFor = (view) => ({
  playerId: "player:ui04b-smoke",
  runId: view.state.runId,
  rulesVersion: view.state.rulesVersion,
  contentVersion: view.state.contentVersion,
  clientBuild: "ui04b-smoke"
});

function counterFactory() {
  let count = 0;
  return () => "cmd:ui04b-smoke:" + (count += 1);
}

/** Fixture entries that carry a server-projected public ViewModel. */
export function fixtureViews(root) {
  const fixtures = JSON.parse(fs.readFileSync(path.join(root, "miniprogram/pages/v2-preview/v2-fixtures.json"), "utf8"));
  const out = [];
  for (const collection of ["entry", "states", "variants"]) {
    const entries = fixtures[collection] ?? {};
    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      if (entry !== null && typeof entry === "object" && entry.view !== undefined) out.push({ key: collection + "." + key, view: entry.view });
    }
  }
  return out;
}

const failureText = async (run) => {
  try {
    const value = await run();
    return "resolved: " + JSON.stringify(plain(value));
  } catch (error) {
    return error.name + ": " + error.message;
  }
};

/**
 * Runs the smoke. It only reads the repository and returns the verdict instead of exiting, so a test can
 * consume it in-process.
 */
export async function runSmoke({ root = REPO_ROOT } = {}) {
  const checks = [];
  const failures = [];
  const check = (name, run) => {
    try {
      run();
      checks.push(name);
    } catch (error) {
      failures.push(name + " :: " + error.message);
    }
  };
  const checkAsync = async (name, run) => {
    try {
      await run();
      checks.push(name);
    } catch (error) {
      failures.push(name + " :: " + error.message);
    }
  };

  const loaded = loadRuntimeArtifact({ root });
  const { facade, modules, requested, realm, context } = loaded;
  const shell = modules.get("miniprogram/runtime/wechat-shell.js");
  const ui = modules.get("miniprogram/runtime/application-ui.js");
  const wire = modules.get("miniprogram/runtime/command-wire.js");
  const acceptedShell = await import(pathToFileURL(path.join(root, "packages/wechat-shell/src/index.ts")).href);
  const acceptedUi = await import(pathToFileURL(path.join(root, "packages/application-ui/src/index.ts")).href);
  const acceptedWire = await import(pathToFileURL(path.join(root, "packages/command-wire/src/index.ts")).href);
  const views = fixtureViews(root);

  check("smoke: the artifact loaded as CommonJS with no platform or Node global in scope", () => {
    for (const forbidden of ["wx", "tt", "Page", "Component", "getApp", "process", "child_process", "Buffer", "setTimeout", "require"]) {
      assert.equal(vm.runInContext("typeof " + forbidden, context), "undefined", forbidden + " must not exist in the module scope");
    }
    assert.deepEqual([...modules.keys()].sort(), [...ARTIFACT_PATHS].sort(), "the loader executed exactly the pinned files");
    assert.deepEqual([...requested].sort(), ["./application-ui.js", "./command-wire.js", "./wechat-shell.js"], "runtime graph");
  });

  check("smoke: the facade publishes exactly the pinned bounded client orchestration surface", () => {
    assert.deepEqual([...Object.keys(facade)].sort(), EXPECTED_PUBLIC_API);
    assert.equal(typeof facade.WeChatRunController, "function");
    assert.equal(typeof facade.createWeChatPlatformStorage, "function");
    assert.equal(Array.isArray(facade.APP_ERROR_CODES), true);
    assert.deepEqual(plain(facade.APP_ERROR_CODES), plain(acceptedWire.APP_ERROR_CODES));
    assert.equal(typeof facade.CommandValidationError, "function");
  });

  check("smoke: the transform lost no export of any accepted client module", () => {
    for (const [generated, accepted] of [
      [wire, acceptedWire],
      [ui, acceptedUi],
      [shell, acceptedShell]
    ]) {
      const generatedKeys = [...Object.keys(generated)].sort();
      for (const name of Object.keys(accepted).sort()) {
        assert.equal(generatedKeys.includes(name), true, name + " is missing from the generated module");
      }
      assert.deepEqual(
        generatedKeys.filter((name) => typeof generated[name] === "function"),
        [...Object.keys(accepted)].filter((name) => typeof accepted[name] === "function").sort()
      );
    }
  });

  check("smoke: the public error types behave like the accepted source", () => {
    const generatedValidation = new facade.CommandValidationError("command.type: has an invalid value");
    const acceptedValidation = new acceptedWire.CommandValidationError("command.type: has an invalid value");
    assert.equal(generatedValidation.code, "INVALID_COMMAND");
    assert.equal(generatedValidation instanceof facade.CommandValidationError, true);
    assert.equal(generatedValidation instanceof realm.TypeError, true, "the wire error must still be a TypeError");
    assert.equal(generatedValidation.message, acceptedValidation.message);
    assert.equal(String(generatedValidation), String(acceptedValidation));

    assert.equal(new facade.RetryUnavailableError().message, new acceptedUi.RetryUnavailableError().message);
    assert.equal(new facade.SubmissionLockedError().message, new acceptedUi.SubmissionLockedError().message);
    assert.equal(new facade.RetryUnavailableError() instanceof realm.Error, true);
    assert.equal(new facade.IntentUnavailableError("a", "b").message, new acceptedShell.IntentUnavailableError("a", "b").message);
    assert.equal(new facade.ArchiveUnavailableError("a").message, new acceptedShell.ArchiveUnavailableError("a").message);
    assert.equal(new facade.IntentUnavailableError("a", "b") instanceof realm.Error, true);
  });

  await checkAsync("smoke: createWeChatPlatformStorage binds an injected storage API exactly as the source does", async () => {
    const generatedCalls = [];
    const acceptedCalls = [];
    const generatedApi = {
      getStorageSync: (key) => (generatedCalls.push(["get", key]), key === "present" ? "value" : ""),
      setStorageSync: (key, value) => generatedCalls.push(["set", key, value])
    };
    const acceptedApi = {
      getStorageSync: (key) => (acceptedCalls.push(["get", key]), key === "present" ? "value" : ""),
      setStorageSync: (key, value) => acceptedCalls.push(["set", key, value])
    };
    const generated = facade.createWeChatPlatformStorage(generatedApi);
    const accepted = acceptedShell.createWeChatPlatformStorage(acceptedApi);
    for (const key of ["absent", "present"]) {
      assert.equal(await generated.getLocal(key), await accepted.getLocal(key), "getLocal(" + key + ")");
    }
    await generated.setLocal("tianfu2:pending-command:run", "{}");
    await accepted.setLocal("tianfu2:pending-command:run", "{}");
    assert.deepEqual(generatedCalls, acceptedCalls);
    assert.equal(await generated.getLocal("absent"), null, "an empty wx storage value must read as null");
  });

  check("smoke: every fixture-projection builder returns the same value as the accepted source", () => {
    assert.equal(views.length >= 6, true, "expected the committed fixtures to cover the entry flow and the in-life states, got " + views.length);
    const snapshot = { interactionState: "idle", mutuallyExclusiveLocked: false, requiresReconfirmation: false };
    for (const { key, view } of views) {
      assert.deepEqual(plain(shell.buildWeChatPageShell(view, snapshot)), plain(acceptedShell.buildWeChatPageShell(view, snapshot)), key + " shell");
      assert.deepEqual(plain(shell.mapCoreActionIntents(view)), plain(acceptedShell.mapCoreActionIntents(view)), key + " core intents");
      assert.deepEqual(plain(shell.mapSpecialActionIntents(view)), plain(acceptedShell.mapSpecialActionIntents(view)), key + " special intents");
      assert.deepEqual(plain(shell.buildArchiveView(view)), plain(acceptedShell.buildArchiveView(view)), key + " archive");
    }
    for (const pageState of ["START", "RUN_HOME", "EVENT", "SPECIAL_NODE", "LIFE_ARCHIVE", "ENDING"]) {
      for (const state of ["idle", "submitting", "confirmed", "retryableError", "fatalError"]) {
        assert.equal(ui.canOrdinaryBack(pageState, state), acceptedUi.canOrdinaryBack(pageState, state), pageState + "/" + state);
      }
    }
  });

  await checkAsync("smoke: the wire codec produces byte-identical canonical envelopes and identical failures", async () => {
    const base = {
      commandId: "cmd:ui04b-smoke:1",
      playerId: "player:ui04b-smoke",
      runId: "run:ui04b-smoke",
      expectedStateVersion: 7,
      rulesVersion: "2.0.0",
      contentVersion: "2.0.0",
      clientPlatform: "wechat",
      clientBuild: "ui04b-smoke"
    };
    const valid = [
      { type: "START_RUN", offerId: "offer-1", destinyId: "destiny-1" },
      { type: "CHOOSE_ACTION", actionId: "cultivate" },
      { type: "ATTEMPT_BREAKTHROUGH" },
      { type: "CHOOSE_EVENT_OPTION", eventId: "dev.first-choice", optionId: "continue" }
    ];
    for (const command of valid) {
      const envelope = { ...base, command };
      const generatedBytes = wire.serializeCommandEnvelope(inRealm(context, envelope));
      const acceptedBytes = acceptedWire.serializeCommandEnvelope(envelope);
      assert.equal(generatedBytes, acceptedBytes, JSON.stringify(command));
      assert.equal(
        JSON.parse(generatedBytes).command.type,
        acceptedWire.parseCommandEnvelope(acceptedBytes).command.type
      );
    }
    for (const malformed of [
      { ...base, command: { type: "CHOOSE_ACTION", actionId: "not-an-action" } },
      { ...base, command: { type: "START_RUN", offerId: "o" } },
      { ...base, command: { type: "START_RUN", offerId: "o", destinyId: "d", selectionId: "s" } },
      { ...base, command: { type: "CHOOSE_EVENT_OPTION", eventId: "e" } },
      { ...base, clientPlatform: "playstation" },
      { ...base, extra: true },
      { ...base, expectedStateVersion: 1.5 },
      { ...base, command: null }
    ]) {
      const generated = await failureText(() => wire.serializeCommandEnvelope(inRealm(context, malformed)));
      const accepted = await failureText(() => acceptedWire.serializeCommandEnvelope(malformed));
      assert.equal(generated, accepted, JSON.stringify(malformed.command));
      // The wire error does not rename itself, so `.name` stays the inherited "TypeError" — the same
      // identity the accepted source has. What must hold is the class and the code.
      let thrown = null;
      try {
        wire.serializeCommandEnvelope(inRealm(context, malformed));
      } catch (error) {
        thrown = error;
      }
      assert.notEqual(thrown, null, "a malformed envelope must be rejected");
      assert.equal(thrown instanceof facade.CommandValidationError, true, "must be the published wire error class");
      assert.equal(thrown instanceof realm.TypeError, true, "must remain a TypeError");
      assert.equal(thrown.code, "INVALID_COMMAND");
      assert.equal(generated.startsWith("TypeError"), true, "the accepted source reports the inherited name");
    }
    assert.equal(
      await failureText(() => wire.parseCommandEnvelope("{not json")),
      await failureText(() => acceptedWire.parseCommandEnvelope("{not json"))
    );
  });

  await checkAsync("smoke: the generated controller orchestrates the accepted flow identically end to end", async () => {
    const home = views.find((entry) => entry.view.state.pageState === "RUN_HOME");
    const event = views.find((entry) => entry.view.state.pageState === "EVENT");
    assert.notEqual(home, undefined, "the fixtures must contain a RUN_HOME view");
    assert.notEqual(event, undefined, "the fixtures must contain an EVENT view");

    const generatedSide = scriptedTransport(home.view, event.view);
    const acceptedSide = scriptedTransport(home.view, event.view);
    const generated = new facade.WeChatRunController({
      transport: generatedSide.transport,
      storage: fakeStorage(),
      session: sessionFor(home.view),
      commandIdFactory: counterFactory()
    });
    const accepted = new acceptedShell.WeChatRunController({
      transport: acceptedSide.transport,
      storage: fakeStorage(),
      session: sessionFor(home.view),
      commandIdFactory: counterFactory()
    });

    await generated.load();
    await accepted.load();
    assert.deepEqual(plain(generated.pageModel()), plain(accepted.pageModel()));
    assert.equal(generated.pageModel().pageState, "RUN_HOME");

    assert.deepEqual(plain(generated.openArchive()), plain(accepted.openArchive()));
    assert.equal(generated.pageModel().archiveOpen, true);
    assert.deepEqual(plain(generated.closeArchive()), plain(accepted.closeArchive()));
    assert.equal(generated.pageModel().archiveOpen, false);

    const generatedResult = await generated.submit({ kind: "coreAction", intentId: "core.cultivate" });
    const acceptedResult = await accepted.submit({ kind: "coreAction", intentId: "core.cultivate" });
    assert.equal(generatedResult.ok, true, JSON.stringify(plain(generatedResult)));
    assert.equal(acceptedResult.ok, true, JSON.stringify(plain(acceptedResult)));
    assert.deepEqual(plain(generated.pageModel()), plain(accepted.pageModel()));
    assert.equal(generated.pageModel().pageState, "EVENT");

    // The envelopes the two controllers handed to their transport must be byte-identical: one
    // implementation of the command, the envelope codec and the commandId discipline. The generated
    // envelope is a value of the artifact's own realm, so it is serialized by the generated codec, and
    // the accepted codec serializes the same data re-materialised in this realm.
    assert.equal(generatedSide.sent.length, 1);
    assert.equal(acceptedSide.sent.length, 1);
    assert.equal(
      wire.serializeCommandEnvelope(generatedSide.sent[0]),
      acceptedWire.serializeCommandEnvelope(plain(generatedSide.sent[0]))
    );
    assert.equal(generatedSide.sent[0].commandId, acceptedSide.sent[0].commandId);
    assert.equal(plain(generatedSide.sent[0]).command.actionId, "cultivate");
    assert.deepEqual(plain(generated.submission()), plain(accepted.submission()));

    for (const intent of [
      { kind: "coreAction", intentId: "core.does-not-exist" },
      { kind: "interactionOption", optionId: "not-an-offered-option" },
      { kind: "specialAction", intentId: "special.attemptBreakthrough" }
    ]) {
      assert.equal(await failureText(() => generated.submit(intent)), await failureText(() => accepted.submit(intent)), JSON.stringify(intent));
    }
  });

  return { ok: failures.length === 0, checks, failures };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui04b-wechat-runtime-smoke.mjs");

if (isDirectRun) {
  const result = await runSmoke({});
  for (const name of result.checks) console.log("PASS " + name);
  for (const failure of result.failures) console.error("FAIL " + failure);
  console.log(`UI04B WeChat runtime CommonJS smoke: ${result.checks.length} checks passed, ${result.failures.length} failed`);
  if (!result.ok) process.exitCode = 1;
}
