/**
 * UI04D — `cloudfunctions/tianfu2`: the authoritative 2.0 cloud host.
 *
 * WHAT THIS FILE IS
 *
 * A thin host, deliberately. It contains no reducer, no gateway, no ViewModel builder, no content and no
 * rule of any kind: every decision is made by the generated runtime in `./runtime/`, which is derived
 * mechanically from the accepted `server/src` + `packages/core` + `packages/content` TypeScript sources
 * (`node tools/ui04d-cloud-runtime-artifact.mjs --write`). If a gameplay question ever needs answering
 * here, the answer belongs in the source modules, not in this file.
 *
 * WHAT IT OWNS
 *
 *  1. **Identity.** The only trusted fact about the caller is `cloud.getWXContext().OPENID`, which the
 *     platform puts in the request envelope and a client cannot forge. It is converted once into an opaque
 *     `playerId` and then discarded — never echoed, never stored in RuleState, never returned.
 *  2. **The database handle.** `cloud.database()` is wrapped in the CloudBase gateway store, which uses
 *     server-side transactions and deterministic document ids.
 *  3. **Server-only entropy.** Run ids and root seeds come from `crypto`, never from the client and never
 *     from `Math.random()`.
 *  4. **Dispatch.** Three operations, exactly the ones the live client speaks: `createRunOffer`,
 *     `fetchView`, `sendCommand`.
 *
 * WHAT IT NEVER DOES
 *
 * It never reads a `playerId`, an `OPENID`, a `rootSeed`, an RNG state or any rule/state field out of
 * `event`. Such fields are ignored, not sanitised: the client has no say in any of them. A run's owner is
 * always the OPENID-derived id compared against the run the server itself stored.
 */

const cloud = require("wx-server-sdk");
const crypto = require("crypto");

/**
 * CloudBase may run this function on Node 16, which has no `structuredClone`. The accepted sources use it
 * only for defensive copies of plain JSON values (a stored run, a command result, a content template), so
 * a JSON round-trip is an exact substitute here. On Node 17+ the native implementation is kept.
 *
 * The shim is installed *before* the runtime is required: the generated modules clone content at load time.
 */
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = function (value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  };
}

const runtime = require("./runtime/index.js");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** The locked versions the live content registry publishes. A run created here inherits them. */
const RULES_VERSION = runtime.LIVE_RULES_VERSION;
const CONTENT_VERSION = runtime.LIVE_CONTENT_VERSION;

/** Server-only entropy. Never used for a rule outcome — only for a run identity and its root seed. */
const entropy = {
  randomToken: function () {
    return crypto.randomBytes(24).toString("hex");
  }
};

let cachedRegistry = null;
function contentRegistry() {
  if (cachedRegistry === null) cachedRegistry = runtime.createLiveContentRegistry();
  return cachedRegistry;
}

let cachedStore = null;
function gatewayStore() {
  if (cachedStore === null) cachedStore = new runtime.CloudBaseGatewayStore({ database: cloud.database() });
  return cachedStore;
}

/** A settlement wrapper the client's fail-closed parser already understands. */
function failure(code, messageKey, retryable) {
  return { ok: false, commandId: "", stateVersion: 0, error: { code: code, messageKey: messageKey, retryable: retryable === true } };
}

/**
 * Builds the per-request service.
 *
 * `event` is passed in only to make the "nothing is read from it" claim auditable: the function takes it
 * and touches none of its fields. Identity comes from `getWXContext()`, everything else from the modules.
 */
function serviceFor() {
  const openid = runtime.assertTrustedOpenid(cloud.getWXContext().OPENID);
  return runtime.createTianfuLiveService({
    store: gatewayStore(),
    content: contentRegistry(),
    entropy: entropy,
    auth: { playerId: runtime.derivePlayerId(openid) },
    rulesVersion: RULES_VERSION,
    contentVersion: CONTENT_VERSION
  });
}

exports.main = async (event) => {
  const data = event !== null && typeof event === "object" ? event : {};
  const operation = data.operation;

  try {
    if (operation === "createRunOffer") {
      // `bootstrapId` is the one client-supplied value that is trusted — as a *recovery key*, not as an
      // identity: it only ever selects among runs already owned by the OPENID-derived playerId.
      return await serviceFor().createRunOffer({ bootstrapId: data.bootstrapId });
    }
    if (operation === "fetchView") {
      try {
        return { view: await serviceFor().fetchView(data.runId) };
      } catch (error) {
        // A run that does not exist and a run that belongs to someone else are the same answer here, so
        // this endpoint cannot be used to probe which run ids exist.
        if (error instanceof runtime.RunUnavailableError) return failure("UNAUTHORIZED", "run.not_owned", false);
        throw error;
      }
    }
    if (operation === "sendCommand") {
      // The envelope is validated by the gateway; the host neither inspects nor rewrites it.
      return await serviceFor().sendCommand(data.command);
    }
    return failure("INVALID_COMMAND", "command.unknown_operation", false);
  } catch (error) {
    // Logged, never echoed: the client gets a bounded, retryable envelope and no server detail.
    console.error("[tianfu2] unexpected failure:", error);
    if (error instanceof RangeError || error instanceof TypeError) return failure("INVALID_COMMAND", "command.invalid", false);
    return failure("INTERNAL", "error.unknown", true);
  }
};
