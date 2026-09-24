// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/live-service.ts
// Source sha256:   e2e0b6d182ef4b3e90ed07c1cd18a8cf4a2d59be30f2ebaceb67c9a12f710065
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
 * UI04D — the authoritative server application service.
 *
 * ONE service owns the three RPC operations the live client already speaks (UI04C):
 *
 *   createRunOffer  -> { runId, playerId, rulesVersion, contentVersion, view }
 *   fetchView       -> { view }
 *   sendCommand     -> CommandResult
 *
 * It composes accepted pieces and adds no gameplay of its own:
 *
 *   - `CommandGateway` still owns envelope validation, idempotency, STATE_CONFLICT, ownership, snapshot
 *     cadence and the command log;
 *   - `ServerViewModelBuilder` still owns the public projection, so hidden Causes, the RNG state,
 *     internal traces and check specs never leave the server;
 *   - `generateServerDestinyOffer` still owns the offer, over the real CONTENT01 registry;
 *   - the store port is injected, so the same service runs on the in-memory store in tests and on
 *     CloudBase in the cloud function.
 *
 * IDENTITY
 *
 * The service is constructed *per request* with a `TrustedAuthContext` whose playerId was derived from
 * `cloud.getWXContext().OPENID` by the host. Nothing in the request body is ever treated as an identity:
 * `createRunOffer` ignores any client-sent playerId, `fetchView` and `sendCommand` compare the run's own
 * owner against the trusted one, and a mismatch is reported as `run.not_owned` — the same answer a
 * non-existent run gets, so a probe learns neither that a run exists nor anything about it.
 *
 * BOOTSTRAP IDEMPOTENCY
 *
 * `createRunOffer` takes a client-generated, locally persisted `bootstrapId`. The mapping
 * (playerId, bootstrapId) -> runId is settled inside the same transaction that creates the run, so a
 * retry after a network timeout or a page reload recovers the *same* offered run instead of
 * manufacturing another life. A different bootstrapId starts a new run, which is how a player eventually
 * gets a new life without the server ever trusting a client-supplied id.
 */

var { createCommandLog } = require("./core-index.js");
                                                                              
                                                                                     
var { CommandGateway } = require("./server-command-gateway.js");
                                                       
var { generateServerDestinyOffer } = require("./server-destiny-offer.js");
var { ServerViewModelBuilder } = require("./server-viewmodel.js");
var { assertBootstrapId, bootstrapKeyFor, runIdSeedFor } = require("./server-identity.js");
var { advanceTerminal, TerminalFlowError } = require("./server-terminal-flow.js");

/**
 * Server-only entropy. The host injects it (the cloud function uses `crypto.randomBytes`); a test injects
 * a counter. It is used for the run id and the root seed only — never for a rule outcome, which still
 * comes from the deterministic RNG the run locks at START_RUN.
 */
                                                        

/** The starting shape of a new life. Content-independent presentation defaults, not a balance change. */
                                   
              
                 
                  
                                                            
                                                                                      
                                                                    
                                                                                
                                                                                                                 
 

const DEFAULT_LIVE_OFFER_FIXTURE                   = {
  age: 24,
  maxAge: 100,
  runName: "未名",
  realm: { id: "mortal", order: 0, cultivation: 0 },
  attributes: { insight: 10, body: 10, spiritSense: 10, fortune: 10 },
  resources: { spiritStone: 0, items: {} },
  availableActions: ["cultivate", "travel", "worldly", "pursuit"],
  world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} }
};

                                     
                      
                           
                         
                           
                       
                         
                         
                      
                                  
                                            
 

                                                             
                                       
                
                   
                       
                         
                        
 

/** Raised for a run the trusted identity does not own — or one that does not exist. Deliberately the same. */
class RunUnavailableError extends Error {
           code = "UNAUTHORIZED";
  constructor() { super("run.not_owned"); this.name = "RunUnavailableError"; }
}

class TianfuLiveService {
           #auth                    ;
           #store              ;
           #content                 ;
           #entropy               ;
           #rulesVersion        ;
           #contentVersion        ;
           #schemaVersion        ;
           #metaView          ;
           #offerFixture                  ;
           #builder                        ;
           #gateway                ;

  constructor(options                    ) {
    if (typeof options?.auth?.playerId !== "string" || options.auth.playerId.length === 0) throw new RangeError("a trusted authoritative playerId is required");
    this.#auth = options.auth;
    this.#store = options.store;
    this.#content = options.content;
    this.#entropy = options.entropy;
    this.#rulesVersion = options.rulesVersion;
    this.#contentVersion = options.contentVersion;
    this.#schemaVersion = options.schemaVersion ?? 2;
    this.#metaView = options.metaView ?? { unlocks: [], entitlements: [], discoveries: [] };
    this.#offerFixture = options.offerFixture ?? DEFAULT_LIVE_OFFER_FIXTURE;
    this.#builder = new ServerViewModelBuilder(options.content, options.viewModel);
    // The gateway hands us the stored run (state + command log + terminal sidecar). The terminal-aware
    // overload projects the authoritative stage into the public ViewModel exactly the way fetchView is
    // supposed to — anything else would ship a PublicViewModel without the ENDING / LIFE_BOOK /
    // REBIRTH_RESULT / NEXT_LIFE pages a real dying run must reach.
    this.#gateway = new CommandGateway({ store: options.store, content: options.content                     , projectView: (state, stored) => stored === undefined ? this.#builder.build(state) : this.#builder.buildFromStoredRun(stored) });
  }

  /**
   * Creates — or recovers — this device's offered run.
   *
   * One transaction decides everything: read the bootstrap mapping, and either return the run it names
   * or generate a fresh CONTENT01 destiny offer, write it and record the mapping. A retry that lands
   * after the first commit therefore cannot create a second run, and a retry that lands after a *failed*
   * commit finds no mapping and does create one — exactly once.
   */
  async createRunOffer(input                      = {})                                {
    const bootstrapId = input.bootstrapId === undefined ? assertBootstrapId(this.#entropy.randomToken()) : assertBootstrapId(input.bootstrapId);
    const playerId = this.#auth.playerId;
    const bootstrapKey = bootstrapKeyFor(playerId, bootstrapId);
    const runId = `run-${runIdSeedFor(playerId, bootstrapId)}`;

    const settled = await this.#store.transact(async (view) => {
      const mapped = await view.getBootstrap(bootstrapKey);
      if (mapped !== undefined && mapped.playerId === playerId) {
        // Cross-player collisions are impossible by construction (the key is derived from playerId), but a
        // hostile or corrupted document must still fail closed rather than hand over another run.
        const stored = await view.getRun(mapped.runId);
        if (stored !== undefined && stored.state.run.playerId === playerId) return { runId: mapped.runId, state: stored.state };
      }
      const existing = await view.getRun(runId);
      if (existing !== undefined && existing.state.run.playerId === playerId) {
        view.setBootstrap(bootstrapKey, { playerId, bootstrapId, runId });
        return { runId, state: existing.state };
      }
      // Server-only entropy: the root seed never leaves the cloud and is never client-chosen.
      const rootSeed = assertBootstrapId(this.#entropy.randomToken());
      const generated = generateServerDestinyOffer({
        schemaVersion: this.#schemaVersion,
        rulesVersion: this.#rulesVersion,
        contentVersion: this.#contentVersion,
        runId,
        playerId,
        rootSeed,
        metaView: this.#metaView,
        content: this.#content,
        fixture: { offerId: `offer-${runId}`, ...this.#offerFixture }
      });
      const state = generated.state;
      view.setRun(runId, { state, commandLog: createCommandLog(state), successfulCommandsSinceSnapshot: 0 });
      view.setBootstrap(bootstrapKey, { playerId, bootstrapId, runId });
      return { runId, state };
    });

    return {
      runId: settled.runId,
      playerId,
      rulesVersion: this.#rulesVersion,
      contentVersion: this.#contentVersion,
      view: this.#builder.build(settled.state)
    };
  }

  /**
   * The authoritative view of a run the caller owns.
   *
   * A missing run and a foreign run produce the *same* refusal, so this endpoint cannot be used to probe
   * which run ids exist.
   */
  async fetchView(runId        )                           {
    if (typeof runId !== "string" || runId.length === 0 || runId.length > 128) throw new RunUnavailableError();
    try {
      return (await this.#gateway.fetchView(this.#auth, runId))                   ;
    } catch {
      throw new RunUnavailableError();
    }
  }

  /** Settles one command through the accepted gateway. The envelope is never trusted, only validated. */
  async sendCommand(envelope         )                         {
    return await this.#gateway.sendCommand(this.#auth, envelope);
  }

  /**
   * UI04E-R1 — settles one *terminal presentation* transition through `terminal-flow.ts`.
   *
   * The terminal flow is **not** routed through `CommandGateway` on purpose: there is no reducer, no
   * `expectedStateVersion`, no command log entry, and no reducer-settled result. The idempotency key
   * is `terminalTransitionId`, the sidecar bump is the only state change.
   *
   * UI04E-R1: `advanceTerminal` NEVER creates the next run. The next life is created by an explicit,
   * client-driven `createRunOffer` call on the NEXT_LIFE page; that call carries a freshly minted
   * (and locally persisted) next-life bootstrap id, so the server still has bootstrap idempotency.
   * Pure presentation transitions are guaranteed to leave canonical gameplay bytes (stateVersion, age,
   * nodeIndex, RNG, commandLog, snapshot, causes, NPC state, resources, builds, history) untouched.
   * The contract tests prove this directly by snapshotting `JSON.stringify(state)` before and after.
   */
  async advanceTerminal(request         )                                 {
    const context                         = {
      store: this.#store,
      content: this.#content,
      playerId: this.#auth.playerId,
      rulesVersion: this.#rulesVersion,
      contentVersion: this.#contentVersion
    };
    try {
      return await advanceTerminal(request, context);
    } catch (error) {
      if (error instanceof TerminalFlowError) {
        // Re-throw so the cloud host can map it to its own settlement envelope (same shape as sendCommand).
        throw error;
      }
      // CloudBase transactions can throw PostCommitTimeoutError when the platform commits but loses
      // the response. For terminal flow this means the transition *did* settle — but we cannot
      // surface the result here because the document is committed and the receipts are durable. The
      // caller retries with the same terminalTransitionId and the exactly-once path returns the
      // recorded result. Map the platform timeout to TRANSIENT/retryable so the cloud host turns it
      // into a settled, retryable envelope.
      if (error && typeof error === "object" && (error                     ).name === "PostCommitTimeoutError") {
        throw new TerminalFlowError("TRANSIENT", "terminal.post_commit_timeout", true);
      }
      throw error;
    }
  }
}

/** Builds the per-request service a cloud host hands to its dispatcher. */
function createTianfuLiveService(options                    )                    {
  return new TianfuLiveService(options);
}

module.exports = Object.assign({}, {
  DEFAULT_LIVE_OFFER_FIXTURE,
  RunUnavailableError,
  TianfuLiveService,
  createTianfuLiveService
});
