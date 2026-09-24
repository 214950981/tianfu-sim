// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/command.ts
// Source sha256:   5686c523d6fd5e105d7d68d061d85226a7ab38369e902c64b564e67493cf3a11
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
var __star0 = require("./command-wire-index.js");

/**
 * UI04A — compatibility re-export.
 *
 * The command/envelope wire codec moved verbatim to the client-safe, dependency-free
 * `packages/command-wire` boundary. This module stays in place so that every existing Core and
 * server caller — `./reducer.ts`, `./persistence.ts`, the Core barrel and `server/src/command-gateway.ts`
 * — keeps importing and re-exporting the *same* bindings from the *same* specifier, with identical
 * validation, canonical serialization and error semantics.
 *
 * The bindings are literally the same objects (`core.validateGameCommand === wire.validateGameCommand`),
 * not a second implementation; `tests/ui04a.test.mjs` asserts that identity so this file can never
 * drift into being a parallel definition. See `docs/UI04A_CLIENT_WIRE_BOUNDARY.md`.
 */

module.exports = Object.assign({}, __star0, {

});
