// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/identity.ts
// Source sha256:   eca62b0cbf5d435f0599e997e5465795a78a689d0ad3d0295033cdf11ecf3d13
// Generator:       tools/ui04d-cloud-runtime-artifact.mjs
// Regenerate:      node tools/ui04d-cloud-runtime-artifact.mjs --write
//
// Deployable CommonJS derived mechanically from the accepted TypeScript module above: type syntax is
// erased with Node's built-in type stripper and ES module syntax is rewritten to plain CommonJS.
// Nothing here was hand-copied — there is exactly one reducer, one CommandGateway, one ViewModel
// builder and one CONTENT01, and they live in the source modules named above.
//
// The closure is pinned to the required server Core/Content modules only: no client package (except
// command-wire, which Core's command module re-exports), no content audit or simulation tooling, and no
// Node builtin or third-party dependency. See docs/UI04D_CLOUD_BACKEND.md.
/**
 * UI04D — authoritative identity.
 *
 * The cloud host has exactly one source of truth about who is calling: `cloud.getWXContext().OPENID`,
 * which the platform puts in the request envelope and a client cannot forge. Everything the game needs
 * about a player is therefore *derived* from it:
 *
 *   - `playerId` is a stable opaque handle: sha256 over a domain-separated string, truncated. It is
 *     deterministic, so a cold handler instance derives the same id without a lookup, and it is opaque,
 *     so it leaks nothing about the OPENID and cannot be reversed into one;
 *   - the raw OPENID is never written into RuleState, never put in a command envelope, never published in
 *     a ViewModel and never returned to a client. Nothing in this module hands it back: the only
 *     function that receives it returns a digest.
 *
 * `bootstrapKey` / `runIdSeed` are likewise deterministic digests of (playerId, bootstrapId), which is
 * what makes a document id predictable: the CloudBase transaction path never needs a `where` query to
 * find a run or a bootstrap mapping — it addresses the document by id.
 */

var { sha256Utf8 } = require("./core-sha256.js");

/** Public prefix of an authoritative player handle. It is a handle, not a secret and not an OPENID. */
const PLAYER_ID_PREFIX = "p-";
const IDENTITY_SALT = "tianfu2/identity/v1";

function hex(bytes            )         { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function digest(value        )         { return hex(sha256Utf8(value)); }

/**
 * Validates the *trusted* OPENID. A request that arrives without one is not "an anonymous player": the
 * host must refuse it, because every ownership check downstream is keyed on this value.
 */
function assertTrustedOpenid(value         )         {
  if (typeof value !== "string" || value.length === 0) throw new RangeError("trusted OPENID is missing");
  if (value.length > 128) throw new RangeError("trusted OPENID is longer than 128 characters");
  if (/[\s]/.test(value)) throw new RangeError("trusted OPENID contains whitespace");
  return value;
}

/** The stable opaque player handle for a trusted OPENID. Same OPENID => same playerId, forever. */
function derivePlayerId(openid        )         {
  return PLAYER_ID_PREFIX + digest(`${IDENTITY_SALT}/player/${assertTrustedOpenid(openid)}`).slice(0, 40);
}

/** The deterministic document id of a bootstrap mapping. Never a `where` query. */
function bootstrapKeyFor(playerId        , bootstrapId        )         {
  return `${playerId}::${assertBootstrapId(bootstrapId)}`;
}

/**
 * Validates a client-supplied bootstrapId.
 *
 * It is a *recovery key the client generated and persisted*, not an identity the server trusts: it is
 * only ever used together with the trusted playerId, so a guessed or copied bootstrapId cannot reach
 * another player's run. Bounded and character-restricted because it becomes part of a document id.
 */
function assertBootstrapId(value         )         {
  if (typeof value !== "string" || value.length === 0) throw new RangeError("bootstrapId is missing");
  if (value.length > 96) throw new RangeError("bootstrapId is longer than 96 characters");
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) throw new RangeError("bootstrapId contains unsupported characters");
  return value;
}

/**
 * A deterministic run-id *seed* for (playerId, bootstrapId).
 *
 * The published runId is this digest plus a short suffix. Deriving it rather than storing a lookup makes
 * the run document id predictable, so "did this bootstrap already create a run?" is answered by
 * `doc(runId).get()` inside the transaction instead of a query.
 */
function runIdSeedFor(playerId        , bootstrapId        )         {
  return digest(`${IDENTITY_SALT}/run/${playerId}/${assertBootstrapId(bootstrapId)}`).slice(0, 32);
}

module.exports = Object.assign({}, {
  PLAYER_ID_PREFIX,
  assertTrustedOpenid,
  derivePlayerId,
  bootstrapKeyFor,
  assertBootstrapId,
  runIdSeedFor
});
