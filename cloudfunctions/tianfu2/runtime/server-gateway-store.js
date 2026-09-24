// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/gateway-store.ts
// Source sha256:   49c307c28bf66d94b0fa21a09153d233ed59c804fac13eff6a10e0fe7593452d
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
 * UI04D — the CommandGateway persistence boundary.
 *
 * The accepted gateway semantics (idempotency, STATE_CONFLICT, ownership, snapshot cadence, replay)
 * do not change here; what changes is *how the gateway reaches durable state*. A11's gateway was
 * hard-wired to a synchronous in-memory map, which cannot be a cloud document store. This module
 * names the port instead:
 *
 *   - `GatewayStore.readRun` may now answer asynchronously, so a document read is legal;
 *   - `GatewayStore.transact` hands the operation a `GatewayTransactionView` whose reads may be
 *     asynchronous, so a CloudBase `runTransaction` can serve them;
 *   - the view grows exactly one new entity, `bootstrap`, because UI04D requires the
 *     OPENID + bootstrapId -> run mapping to be settled *in the same transaction* as the run it names.
 *     Without it a client retry after a timeout could not recover its own run.
 *
 * Everything above the port stays byte-for-byte the same logic: `CommandGateway` still validates the
 * envelope, still refuses a changed payload under a reused commandId, still compares
 * `expectedStateVersion` against the stored one and still settles through `executeLoggedCommand`.
 * `InMemoryGatewayStore` is preserved with its synchronous surface, so every accepted test keeps
 * working unchanged.
 */

var { createCommandLog, validateGameState } = require("./core-index.js");

/** A persisted run: the authoritative state, its command log and its snapshot bookkeeping. */
                            
                   
                         
                          
                                          
 

/** The settled result of one commandId, keyed by the hash of the exact envelope that produced it. */
                                                                                                                  

/**
 * The OPENID-derived owner + client bootstrapId -> run mapping.
 *
 * The bootstrap id is a *client-generated, locally persisted* value: it lets a retry or a reload ask
 * for "the run this device started" without the server ever trusting a client-supplied playerId.
 */
                                                                                         

/**
 * The transactional view a store hands to one gateway operation.
 *
 * Reads may be asynchronous (a document store answers over the network) while writes stay staged until
 * the store commits. `CommandGateway` awaits every read, so both shapes work, and an implementation
 * that has the value in hand may still answer synchronously.
 */
                                         
                                                                                
                                                
                                                                                                            
                                                                    
                                                                                                         
                                                                   
 

/** The whole persistence surface `CommandGateway` is allowed to use. */
                               
                                                                                 
                                                                                       
 

function clone   (value   )    { return structuredClone(value); }

/**
 * The synchronous in-memory store the accepted tests drive.
 *
 * `transact` serialises operations on a promise tail and stages copies of both maps, so a failing
 * operation commits nothing — that is what makes the timeout/idempotency proofs in
 * `tests/server-gateway.test.mjs` hold. Its public surface is unchanged by UI04D; it now also carries
 * the bootstrap map the new entity needs.
 */
class InMemoryGatewayStore                         {
  #runs = new Map                   ();
  #idempotency = new Map                           ();
  #bootstraps = new Map                         ();
  #tail                = Promise.resolve();

  seedRun(stateValue         )       {
    const state = validateGameState(stateValue);
    if (this.#runs.has(state.run.runId)) throw new RangeError("run already exists");
    this.#runs.set(state.run.runId, { state: clone(state), commandLog: createCommandLog(state), successfulCommandsSinceSnapshot: 0 });
  }
  readRun(runId        )                        { const stored = this.#runs.get(runId); return stored === undefined ? undefined : clone(stored); }
  readBootstrap(bootstrapKey        )                              { const stored = this.#bootstraps.get(bootstrapKey); return stored === undefined ? undefined : clone(stored); }

  async transact   (operation                                                  )             {
    const previous = this.#tail; let release = ()       => {};
    this.#tail = new Promise      ((resolve) => { release = resolve; }); await previous;
    const stagedRuns = new Map(this.#runs); const stagedIdempotency = new Map(this.#idempotency); const stagedBootstraps = new Map(this.#bootstraps);
    const view                         = {
      getRun: (runId) => stagedRuns.get(runId),
      setRun: (runId, value) => stagedRuns.set(runId, value),
      getIdempotency: (commandId) => stagedIdempotency.get(commandId),
      setIdempotency: (commandId, value) => stagedIdempotency.set(commandId, value),
      getBootstrap: (bootstrapKey) => stagedBootstraps.get(bootstrapKey),
      setBootstrap: (bootstrapKey, value) => stagedBootstraps.set(bootstrapKey, value)
    };
    try { const result = await operation(view); this.#runs = stagedRuns; this.#idempotency = stagedIdempotency; this.#bootstraps = stagedBootstraps; return result; }
    finally { release(); }
  }
}

module.exports = Object.assign({}, {
  InMemoryGatewayStore
});
