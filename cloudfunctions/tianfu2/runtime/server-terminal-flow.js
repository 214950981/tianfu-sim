// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/terminal-flow.ts
// Source sha256:   90e4b621384047d2bbcfadf41d9571a4a8d51038cc6092be3108b06443459466
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
 * UI04E-R1 — terminal presentation flow: exactly-once stage transitions.
 *
 * SCOPE
 *
 * This module owns *presentation/session* progression through the four terminal pages
 * `ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE` and nothing else. It is deliberately **not** in
 * Core/Content: it never mutates `GameState`, never invokes the reducer, never advances `stateVersion`,
 * never touches the RNG, never appends to the command log, never creates a Cause, never modifies NPC
 * state. The `StoredRun.terminal` sidecar is the only thing it writes about the *old* run.
 *
 * WHY THIS LIVES OUTSIDE `CommandGateway`
 *
 * The gateway owns envelope validation, command idempotency, `STATE_CONFLICT`, ownership and snapshot
 * cadence — all of which are *gameplay* concerns. Terminal flow is presentation/session orchestration:
 *   - the idempotency key is `terminalTransitionId` (NOT `commandId`);
 *   - there is no `expectedStateVersion` (the gameplay version never moves);
 *   - there is no reducer and no settlement, just a sidecar bump and an authoritative next stage.
 *
 * UI04E-R1 — `REBIRTH_RESULT -> NEXT_LIFE` is a SIDE-CAR-ONLY TRANSITION
 *
 * The rejected UI04E commit created a fresh offered RunState + bootstrap mapping inside this transaction
 * and returned `nextBootstrapId` + `nextRunId` to the caller. The Controller ruled that arriving at
 * NEXT_LIFE must remain a pure presentation transition — no new run, no new bootstrap document, no
 * next-run identifiers on the receipt.
 *
 * The next life is created later, only when the client explicitly invokes the *already-accepted*
 * `createRunOffer` RPC from a user action on the NEXT_LIFE page. That client-side action is responsible
 * for persisting a dedicated `pending` next-life bootstrap key, reusing it on retry/reload, and only
 * promoting it to the current bootstrap key after `createRunOffer` succeeds. None of that is the
 * server's responsibility — the server only enforces the exactly-once terminal transition and keeps
 * the old run's canonical gameplay bytes byte-identical.
 *
 * NEXT_LIFE MUST NOT MUTATE THE OLD RUN'S CANONICAL STATE
 *
 * The completed run is kept exactly as it settled. The sidecar bump from `REBIRTH_RESULT` to
 * `NEXT_LIFE` is the only thing this transaction writes about it. The next life lives in its own
 * document and is created by a separate client-driven `createRunOffer` call, never by this module.
 */

                                                                              
                                                                                                                                            

/** Strict, monotonic, four-edge terminal transition graph. Anything else fails closed at the call site. */
const TERMINAL_GRAPH                                                                               = {
  "advance-to-life-book": { from: "ENDING", to: "LIFE_BOOK" },
  "advance-to-rebirth-result": { from: "LIFE_BOOK", to: "REBIRTH_RESULT" },
  "advance-to-next-life": { from: "REBIRTH_RESULT", to: "NEXT_LIFE" }
};

/**
 * A new terminal sidecar for a run that has just reached an end-of-life status.
 *
 * The starting `stage` is `ENDING`, the starting `version` is `0`, and the transitions map is empty.
 * The sidecar is *absent* for runs the server has not yet declared end-of-life, so a missing sidecar
 * is the "no terminal projection" sentinel.
 */
function freshTerminalSidecar()                  { return { stage: "ENDING", version: 0, transitions: {} }; }

/**
 * Result shape the `advanceTerminal` RPC publishes to the client.
 *
 * UI04E-R1: the result NEVER carries next-run identifiers. The next life is created by a separate,
 * client-driven `createRunOffer` call, not by this RPC. The settlement here is a sidecar bump + an
 * authoritative stage advancement for the *old* run.
 */
                                        
                
                   
                               
                       
                  
 

/**
 * Raised for every fail-closed terminal-flow condition. Each subclass carries the same `code` the
 * `ApplicationTransport` envelope already uses, so a host can map it to its own settlement envelope.
 */
class TerminalFlowError extends Error {
           code                                                                                        ;
           messageKey        ;
           retryable         ;
  constructor(code                                                                                        , messageKey        , retryable = false) {
    super(messageKey); this.name = "TerminalFlowError"; this.code = code; this.messageKey = messageKey; this.retryable = retryable;
  }
}

/**
 * What the terminal flow needs from the run + content layer.
 *
 * UI04E-R1: removed `entropy`, `metaView`, `offerFixture`, and `schemaVersion`. The terminal flow no
 * longer mints the next life — it does not need any entropy, destiny fixtures, or metaView hints.
 */
                                         
                      
                           
                   
                       
                         
 

/** The accepted envelope shape for `advanceTerminal`. Validated and *not* trusted at the call site. */
                                         
                
                               
                                       
                         
 

/**
 * Validates a `AdvanceTerminalRequest` envelope. Mirrors the gateway's defence-in-depth: a payload the
 * host or a tampered client can still produce must fail closed rather than be passed through.
 */
function parseAdvanceTerminalRequest(value         )                         {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  const record = value                           ;
  const runId = typeof record.runId === "string" && record.runId.length > 0 && record.runId.length <= 128 ? record.runId : "";
  const terminalTransitionId = typeof record.terminalTransitionId === "string" && record.terminalTransitionId.length > 0 && record.terminalTransitionId.length <= 128 ? record.terminalTransitionId : "";
  const expectedTerminalStage = typeof record.expectedTerminalStage === "string" ? (record.expectedTerminalStage                 ) : "";
  const action = typeof record.action === "string" ? (record.action                  ) : "";
  if (runId === "") throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  if (terminalTransitionId === "") throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  if (!isTerminalStage(expectedTerminalStage)) throw new TerminalFlowError("INVALID_OPTION", "terminal.stage_unknown");
  if (!isTerminalAction(action)) throw new TerminalFlowError("INVALID_OPTION", "terminal.action_unknown");
  return { runId, terminalTransitionId, expectedTerminalStage, action };
}

function isTerminalStage(value        )                         {
  return value === "ENDING" || value === "LIFE_BOOK" || value === "REBIRTH_RESULT" || value === "NEXT_LIFE";
}
function isTerminalAction(value        )                          {
  return value === "advance-to-life-book" || value === "advance-to-rebirth-result" || value === "advance-to-next-life";
}

/**
 * The one-shot hash of the exact terminal transition request. Two requests with the same payload hash
 * are an exact retry; two with the same id and a different payload hash are a hostile/confused replay.
 * Uses Node's `crypto`-free `FNV-1a` so the module stays platform-neutral (the cloud host calls it too).
 */
function payloadHash(request                        )         {
  return fnv1a(JSON.stringify({ runId: request.runId, action: request.action, expectedTerminalStage: request.expectedTerminalStage }));
}
function fnv1a(value        )         {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Settles one terminal transition inside a single transaction. Exactly-once by `terminalTransitionId`.
 *
 * UI04E-R1 semantics — every settled transition is sidecar-only:
 *   - `getTerminalTransition(id)` already settled with the same payload -> returns the recorded result
 *     without mutating anything (an exact retry after a post-commit timeout sees the settled stage);
 *   - reused id with a different payload -> `INVALID_COMMAND` (refuse the confused replay);
 *   - the stored run is missing -> `UNAUTHORIZED` (same answer as a foreign run);
 *   - the run's stored playerId does not match the trusted one -> `UNAUTHORIZED`;
 *   - the run has not yet reached end-of-life (status is not `dying`/`ended` AND no `ending` fact)
 *     -> `INVALID_OPTION` (the terminal projection is not active yet);
 *   - the sidecar's `stage` does not match `expectedTerminalStage` -> `STATE_CONFLICT`;
 *   - the requested `action` is not a legal forward edge from `expectedTerminalStage` -> `INVALID_OPTION`.
 *
 * REBIRTH_RESULT -> NEXT_LIFE no longer creates a next-run document, no longer mints a next bootstrap
 * id, no longer writes a bootstrap mapping, and no longer carries next-run identifiers on the receipt.
 * The settlement ONLY bumps the old run's terminal sidecar to NEXT_LIFE; the next life is then created
 * by an explicit, client-driven `createRunOffer` call.
 */
async function advanceTerminal(requestValue         , context                        )                                 {
  const request = parseAdvanceTerminalRequest(requestValue);
  const graph = TERMINAL_GRAPH[request.action];
  if (graph.from !== request.expectedTerminalStage) throw new TerminalFlowError("INVALID_OPTION", "terminal.stage_action_mismatch");

  const settled = await context.store.transact(async (view) => {
    // 1. ownership — same answer as fetchView: a missing run and a foreign run are the same refusal.
    const stored = await view.getRun(request.runId);
    if (stored === undefined || stored.state.run.playerId !== context.playerId) throw new TerminalFlowError("UNAUTHORIZED", "run.not_owned");

    // 2. terminal projection is only active when gameplay has reached an end-of-life status with a fact.
    const reachedEnd = stored.state.run.status === "dying" || stored.state.run.status === "ended" || stored.state.run.ending !== undefined || stored.state.run.deathRecord !== undefined;
    if (!reachedEnd) throw new TerminalFlowError("INVALID_OPTION", "terminal.not_reached");

    // 3. exactly-once: a transitionId already settled returns the recorded result without mutating.
    //    Checked BEFORE stage drift because an exact retry after a post-commit timeout naturally
    //    arrives with the *pre-advance* expectedTerminalStage: the first settle already moved the
    //    stage forward. The prior receipt is the only authoritative signal of "this id already settled".
    const prior = await view.getTerminalTransition(request.terminalTransitionId);
    if (prior !== undefined) {
      if (prior.playerId !== context.playerId) throw new TerminalFlowError("UNAUTHORIZED", "auth.player_mismatch");
      if (prior.payloadHash !== payloadHash(request)) throw new TerminalFlowError("INVALID_COMMAND", "terminal.idempotency_conflict");
      return { ok: true, runId: request.runId, playerId: prior.playerId, terminalTransitionId: request.terminalTransitionId, stage: prior.toStage, version: prior.sequence };
    }

    // 4. current sidecar stage must match expectedTerminalStage — guards against stale-client advances.
    const currentStage                = stored.terminal?.stage ?? "ENDING";
    if (currentStage !== request.expectedTerminalStage) throw new TerminalFlowError("STATE_CONFLICT", "terminal.stage_drift");

    // 5. first settlement: bump sidecar and write the receipt.
    const nextStage                = graph.to;
    const nextVersion         = (stored.terminal?.version ?? 0) + 1;

    // 6. UI04E-R1 — every transition is sidecar-only. NEXT_LIFE no longer creates a next run,
    //    no longer mints a next bootstrap id, and no longer writes a bootstrap mapping. The next
    //    life is created by an explicit, client-driven `createRunOffer` call on the NEXT_LIFE page.
    const receipt                           = { payloadHash: payloadHash(request), action: request.action, fromStage: graph.from, toStage: nextStage, playerId: context.playerId, sequence: nextVersion };
    const sidecar                  = { stage: nextStage, version: nextVersion, transitions: { ...(stored.terminal?.transitions ?? {}), [request.terminalTransitionId]: receipt } };
    const preserved            = { state: stored.state, commandLog: stored.commandLog, successfulCommandsSinceSnapshot: stored.successfulCommandsSinceSnapshot, ...(stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }), terminal: sidecar };
    view.setRun(request.runId, preserved);
    view.setTerminalTransition(request.terminalTransitionId, receipt);
    return { ok: true, runId: request.runId, playerId: context.playerId, terminalTransitionId: request.terminalTransitionId, stage: nextStage, version: nextVersion };
  });

  return settled;
}

/** Re-export the canonical store type names so callers do not need a separate import. */

module.exports = Object.assign({}, {
  TERMINAL_GRAPH,
  freshTerminalSidecar,
  TerminalFlowError,
  parseAdvanceTerminalRequest,
  advanceTerminal
});
