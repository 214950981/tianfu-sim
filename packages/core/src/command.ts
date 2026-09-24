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
export * from "../../command-wire/src/index.ts";
