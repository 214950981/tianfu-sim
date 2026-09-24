// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/cloudbase-store.ts
// Source sha256:   f06088b65685fb140bfbe44d46529f67ec432113864e542d551d52ffd625f40b
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
 * UI04D — CloudBase document-database gateway store.
 *
 * This is a *port implementation*, not a second gateway: it answers exactly the `GatewayStore`
 * questions `CommandGateway` asks (read a run, transact over runs / command idempotency / bootstrap
 * mappings) and it changes none of the settlement semantics. Everything that makes a command settle
 * once — the payload fingerprint, the STATE_CONFLICT version comparison, the ownership check, the
 * snapshot cadence — still lives in `CommandGateway`.
 *
 * THREE PROPERTIES THE CLOUD DEPLOYMENT NEEDS
 *
 *  1. **Deterministic document ids.** Every id is a hex digest of its logical key (run id, commandId,
 *     playerId+bootstrapId), so the transactional path never queries: it addresses a document. A CloudBase
 *     transaction supports server-side `doc()` reads and writes; a `where` query inside one is exactly the
 *     thing that does not work, and it is also what would make the transaction non-atomic. There is no
 *     `.where(` anywhere in this file, and a test asserts that at source level.
 *  2. **Read-your-writes inside the transaction.** Writes are staged in the view and flushed after the
 *     operation resolves, still inside `runTransaction`. So a second read of the same run in one
 *     settlement sees the staged value, and an operation that throws flushes nothing.
 *  3. **Cold-start safe.** Nothing is cached between calls: every transaction re-reads, so a fresh
 *     handler instance settles against the same documents as the one that timed out.
 *
 * The database object is *injected*. This module names no SDK, so the same implementation runs against
 * the real `cloud.database()` in the cloud function and against a fake in tests.
 */

var { sha256Utf8 } = require("./core-sha256.js");
                                                                                                                                                        

/** The minimal CloudBase document-database surface this store uses. */
                                                                                
                                         
                                        
                                                                  
 
                                           
                                          
                                                                                                             
                                                  
 
                                                                                        
                                
                                                     
                                                                                                          
 

/** Collection names. Document ids inside each are hex digests, so the names carry the human meaning. */
const RUNS_COLLECTION = "tianfu2_runs";
const COMMANDS_COLLECTION = "tianfu2_commands";
const BOOTSTRAPS_COLLECTION = "tianfu2_bootstraps";
/** UI04E — exactly-once terminal transition receipts, addressed by `terminalTransitionId`. */
const TERMINAL_TRANSITIONS_COLLECTION = "tianfu2_terminal_transitions";

const ID_LENGTH = 32;

function hex(bytes            )         { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
/** A deterministic, character-safe document id for a logical key. Hex only: safe as a CloudBase `_id`. */
function documentIdFor(kind        , key        )         { return hex(sha256Utf8(`tianfu2/${kind}/${key}`)).slice(0, ID_LENGTH); }

/** Strips CloudBase-managed fields and normalises to plain JSON, so a stored doc is byte-stable. */
function toDocument(value         )                          {
  const plain = JSON.parse(JSON.stringify(value))                           ;
  for (const key of Object.keys(plain)) if (key.startsWith("_")) delete plain[key];
  return plain;
}
function fromDocument   (data         )                {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  return JSON.parse(JSON.stringify(data))     ;
}

/** A stored run must actually be a run; a half-written document must fail loudly, not behave like one. */
function asStoredRun(data         )                        {
  const record = fromDocument                         (data);
  if (record === undefined || record.state === undefined || record.commandLog === undefined) return undefined;
  return record                        ;
}

                                                                                                                                                                                

class CloudBaseGatewayStore                         {
           #database               ;
           #runs        ;
           #commands        ;
           #bootstraps        ;
           #terminalTransitions        ;

  constructor(options                              ) {
    if (options === null || typeof options !== "object" || options.database === undefined) throw new RangeError("a CloudBase database handle is required");
    this.#database = options.database;
    this.#runs = options.collections?.runs ?? RUNS_COLLECTION;
    this.#commands = options.collections?.commands ?? COMMANDS_COLLECTION;
    this.#bootstraps = options.collections?.bootstraps ?? BOOTSTRAPS_COLLECTION;
    this.#terminalTransitions = options.collections?.terminalTransitions ?? TERMINAL_TRANSITIONS_COLLECTION;
  }

  async readRun(runId        )                                 {
    const snapshot = await this.#database.collection(this.#runs).doc(documentIdFor("run", runId)).get();
    return asStoredRun(snapshot?.data);
  }

  /**
   * Runs one gateway settlement inside a server-side transaction.
   *
   * The operation decides; the store only serves reads and flushes exactly what the operation staged. A
   * thrown operation therefore commits nothing at all, which is what keeps a failed reducer or an
   * unexpected error from leaving a half-settled run behind.
   */
  async transact   (operation                                                  )             {
    return await this.#database.runTransaction(async (transaction) => {
      const stagedRuns = new Map                   ();
      const stagedIdempotency = new Map                           ();
      const stagedBootstraps = new Map                         ();
      const stagedTerminalTransitions = new Map                                  ();

      const read = async (collection        , kind        , key        )                   => {
        const snapshot = await transaction.collection(collection).doc(documentIdFor(kind, key)).get();
        return snapshot?.data;
      };
      const view                         = {
        getRun: async (runId) => {
          const staged = stagedRuns.get(runId);
          if (staged !== undefined) return staged;
          return asStoredRun(await read(this.#runs, "run", runId));
        },
        setRun: (runId, value) => { stagedRuns.set(runId, value); },
        getIdempotency: async (commandId) => {
          const staged = stagedIdempotency.get(commandId);
          if (staged !== undefined) return staged;
          return fromDocument                   (await read(this.#commands, "command", commandId));
        },
        setIdempotency: (commandId, value) => { stagedIdempotency.set(commandId, value); },
        getBootstrap: async (bootstrapKey) => {
          const staged = stagedBootstraps.get(bootstrapKey);
          if (staged !== undefined) return staged;
          return fromDocument                 (await read(this.#bootstraps, "bootstrap", bootstrapKey));
        },
        setBootstrap: (bootstrapKey, value) => { stagedBootstraps.set(bootstrapKey, value); },
        getTerminalTransition: async (terminalTransitionId) => {
          const staged = stagedTerminalTransitions.get(terminalTransitionId);
          if (staged !== undefined) return staged;
          return fromDocument                          (await read(this.#terminalTransitions, "terminal-transition", terminalTransitionId));
        },
        setTerminalTransition: (terminalTransitionId, value) => { stagedTerminalTransitions.set(terminalTransitionId, value); }
      };

      const result = await operation(view);
      for (const [runId, value] of stagedRuns) await transaction.collection(this.#runs).doc(documentIdFor("run", runId)).set({ data: toDocument(value) });
      for (const [commandId, value] of stagedIdempotency) await transaction.collection(this.#commands).doc(documentIdFor("command", commandId)).set({ data: { ...toDocument(value), commandId } });
      for (const [bootstrapKey, value] of stagedBootstraps) await transaction.collection(this.#bootstraps).doc(documentIdFor("bootstrap", bootstrapKey)).set({ data: { ...toDocument(value), bootstrapKey } });
      for (const [terminalTransitionId, value] of stagedTerminalTransitions) await transaction.collection(this.#terminalTransitions).doc(documentIdFor("terminal-transition", terminalTransitionId)).set({ data: { ...toDocument(value), terminalTransitionId } });
      return result;
    });
  }
}

module.exports = Object.assign({}, {
  RUNS_COLLECTION,
  COMMANDS_COLLECTION,
  BOOTSTRAPS_COLLECTION,
  TERMINAL_TRANSITIONS_COLLECTION,
  documentIdFor,
  CloudBaseGatewayStore
});
