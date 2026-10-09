// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/command-gateway.ts
// Source sha256:   9fad6012fc7bbc7b562f14622cc3e1140285411f46105a9341da40aff61c4578
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
 * UI04D moved `StoredRun` / the transaction view / `InMemoryGatewayStore` into `./gateway-store.ts` so
 * the persistence boundary is a named port an asynchronous document store can implement. Nothing in the
 * settlement logic below changed: the same validation, the same idempotency record, the same
 * STATE_CONFLICT and ownership rules, the same snapshot cadence. Only the read calls became `await`ed,
 * which is a no-op for the in-memory store and is what lets a CloudBase transaction serve them.
 */
var { PersistenceError, ReducerError, createSnapshot, executeLoggedCommand, serializeCommandEnvelope, shouldCreateSnapshot, validateCommandEnvelope, validateGameState } = require("./core-index.js");
var { sha256Utf8 } = require("./core-sha256.js");
                                                                                                             

const MAX_COMMAND_ENVELOPE_BYTES = 16_384;
const MAX_GATEWAY_ID_LENGTH = 128;

                                                        

function clone   (value   )    { return structuredClone(value); }
function hex(bytes            )         { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function payloadHash(envelope                 )         { return hex(sha256Utf8(serializeCommandEnvelope(envelope))); }
function failure(commandId        , stateVersion        , code              , messageKey        , retryable = false)                {
  return { ok: false, commandId, stateVersion, error: { code, messageKey, retryable } };
}
function commandIdFrom(value         )         {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const commandId = (value                           ).commandId; return typeof commandId === "string" ? commandId : "";
}
function byteLength(value        )         { return new TextEncoder().encode(value).length; }
function identifiersWithinLimit(envelope                 )          {
  return [envelope.commandId, envelope.playerId, envelope.runId, envelope.rulesVersion, envelope.contentVersion, envelope.clientBuild].every((value) => value.length <= MAX_GATEWAY_ID_LENGTH);
}

/**
 * PLAYUX01 — turns the reducer's real output into the result surface's receipt.
 *
 * WHY THE AUTHORITY ORDER MATTERS
 * The product spec ranks the data sources: the authoritative receipt first, then a diff of the public
 * view before and after submission, then a minimal compatibility projection. This function is the first
 * rank, and it is only possible because the reducer already reports what it applied. Nothing here is
 * inferred, and nothing is fabricated: an effect the reducer did not apply cannot appear.
 *
 * WHAT IS DELIBERATELY NOT PROJECTED
 * `trace` is dropped, so the RNG state, the roll and the selector never leave the server. NPC effects are
 * reduced to their public edge only (`npc.relevance`), because an `ADJUST_NPC_RELATION` carries hidden
 * affinity and trust numbers the player has not earned the right to read. Cause effects are reported by
 * state transition ("这段因果了结") rather than by echoing the op, so no hidden cause id or template leaks.
 *
 * WHY A ZERO-EFFECT CHOICE IS AN HONEST ANSWER
 * The spec asks for a clear "nothing gained" outcome when a choice changes nothing measurable. An option
 * can settle a real time cost and no resource gain at all — `OUTCOME_TIME_DELTA` is a registered op. So
 * when nothing is reported here, `changed` is false and the client writes "此行没有明显收获" rather than
 * inventing a gain. An empty effects list is a true statement about the settlement, not a missing message.
 */
function resultReceipt(output              , envelope                 )                                                                     {
  const lines                            = [];
  for (const effect of output.effects) {
    if (typeof effect !== "object" || effect === null) continue;
    const op = String((effect                           ).op);
    if (op === "ADD_CULTIVATION") lines.push({ kind: "cultivation", labelKey: "result.cultivation", delta: (effect                           ).amount });
    else if (op === "ADD_RESOURCE") lines.push({ kind: "resource", labelKey: "result.resource", resource: (effect                           ).key, delta: (effect                           ).amount });
    else if (op === "ADD_BUILD_EVIDENCE") lines.push({ kind: "build", labelKey: "result.build_evidence", buildId: (effect                           ).buildId, delta: (effect                           ).amount });
    else if (op === "OUTCOME_TIME_DELTA") lines.push({ kind: "time", labelKey: "result.time", years: (effect                           ).years });
    else if (op === "RESOLVE_CAUSE") lines.push({ kind: "cause", labelKey: "result.cause_resolved" });
    else if (op === "EXPIRE_CAUSE") lines.push({ kind: "cause", labelKey: "result.cause_expired" });
    else if (op === "ADD_CAUSE") lines.push({ kind: "cause", labelKey: "result.cause_planted" });
    else if (["ADD_NPC_SIGNIFICANCE", "ADJUST_NPC_RELATION", "REVEAL_NPC_FACT", "REVEAL_NPC_TRAIT", "REVEAL_NPC_STATUS"].includes(op)) lines.push({ kind: "npc", labelKey: "result.npc_noted" });
    else if (["GAIN_ITEM", "ADD_ITEM", "CONSUME_ITEM"].includes(op)) lines.push({ kind: "item", labelKey: "result.item" });
  }
  // PLAYUX01 (B1) — `eventId` is added only when the command actually carries one.
  //
  // It used to be written unconditionally as `(envelope.command).eventId`, so a START_RUN or a
  // CHOOSE_ACTION receipt held an `eventId` key whose value was `undefined`. The idempotency store
  // persists the receipt as JSON, and JSON drops an undefined value, so a duplicate submission read back
  // from the store no longer matched the freshly built result — `tests/ui04d.test.mjs` compares them
  // field for field and fails on exactly that. A receipt that cannot survive its own storage round trip
  // is not an authoritative record of a settlement, which is the whole point of keeping one.
  const narrative                          = { changed: lines.length > 0, lines };
  const settledEventId = (envelope.command                         ).eventId;
  if (typeof settledEventId === "string" && settledEventId.length > 0) narrative.eventId = settledEventId;
  const outcome = output.narrativeFacts.find((fact) => (fact                      ).type === "EVENT_OUTCOME")                                                             ;
  // Same round-trip rule as `eventId` above: an absent value must be an absent key, never a key the
  // store drops on the way to disk.
  if (outcome !== undefined) {
    if (typeof outcome.choiceId === "string" && outcome.choiceId.length > 0) narrative.choiceId = outcome.choiceId;
    if (typeof outcome.appliedTier === "string" && outcome.appliedTier.length > 0) narrative.appliedTier = outcome.appliedTier;
  }
  return { domainEffects: lines, narrative };
}

                                        
                      
                  
                                                                
                                                                     
                                                                    
                                                                  
 

class CommandGateway {
           #store              ;
           #content        ;
           #resolveContext                                              ;
           #beforeCommit                                        ;
           #afterCommit                                       ;
           #projectView                                       ;
  constructor(options                       ) { this.#store = options.store; this.#content = options.content; this.#resolveContext = options.resolveContext ?? (() => ({})); this.#beforeCommit = options.beforeCommit; this.#afterCommit = options.afterCommit; this.#projectView = options.projectView; }

  async fetchView(auth                    , runId        )                   {
    const stored = await this.#store.readRun(runId); if (stored === undefined || stored.state.run.playerId !== auth.playerId) throw new Error("UNAUTHORIZED");
    if (this.#projectView === undefined) throw new Error("ViewModel builder is not configured"); return this.#projectView(stored.state, stored);
  }

  async sendCommand(auth                    , envelopeValue         )                         {
    const untrustedCommandId = commandIdFrom(envelopeValue); let envelope                 ;
    try {
      const serialized = JSON.stringify(envelopeValue); if (serialized === undefined || byteLength(serialized) > MAX_COMMAND_ENVELOPE_BYTES) return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.payload_too_large");
      envelope = validateCommandEnvelope(envelopeValue); if (!identifiersWithinLimit(envelope)) return failure(envelope.commandId, 0, "INVALID_COMMAND", "command.identifier_too_long");
    } catch { return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.invalid"); }
    if (typeof auth?.playerId !== "string" || auth.playerId.length === 0 || auth.playerId !== envelope.playerId) return failure(envelope.commandId, 0, "UNAUTHORIZED", "auth.player_mismatch");
    const fingerprint = payloadHash(envelope); let newlyCommitted = false;
    const result = await this.#store.transact(async (transaction                        ) => {
      const prior = await transaction.getIdempotency(envelope.commandId);
      if (prior !== undefined) {
        if (prior.playerId !== auth.playerId) return failure(envelope.commandId, prior.result.stateVersion, "UNAUTHORIZED", "auth.player_mismatch");
        if (prior.payloadHash !== fingerprint) return failure(envelope.commandId, prior.result.stateVersion, "INVALID_COMMAND", "command.idempotency_conflict");
        return clone(prior.result);
      }
      const settle = (settled               )                => { transaction.setIdempotency(envelope.commandId, { payloadHash: fingerprint, result: settled, runId: envelope.runId, playerId: auth.playerId }); return settled; };
      const stored = await transaction.getRun(envelope.runId); if (stored === undefined) return settle(failure(envelope.commandId, 0, "UNAUTHORIZED", "run.not_owned"));
      if (envelope.expectedStateVersion !== stored.state.stateVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "STATE_CONFLICT", "state.version_conflict"));
      if (stored.state.run.playerId !== auth.playerId || stored.state.run.playerId !== envelope.playerId) return settle(failure(envelope.commandId, stored.state.stateVersion, "UNAUTHORIZED", "run.not_owned"));
      if (stored.state.rulesVersion !== envelope.rulesVersion || stored.state.contentVersion !== envelope.contentVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "CONTENT_MISMATCH", "content.version_mismatch"));
      try {
        const context = this.#resolveContext(envelope); const executed = executeLoggedCommand(stored.state, stored.commandLog, envelope, context, this.#content                                                );
        validateGameState(executed.output.state);
        // PLAYUX01: the result surface is fed from the authoritative receipt, not from a client-side
        // guess. `output.effects` is exactly what the reducer really applied (applyEventEffects pushes
        // each one into publicEffects), so "修为 0→150 (+150)" is a statement about settled state rather
        // than a prediction. It is attached here, inside the transaction, so it is written into the same
        // idempotency record as the result: a replay of the same commandId returns this identical receipt,
        // which is what makes the surface show the same outcome at most once per choice.
        const receipt                = { ok: true, commandId: envelope.commandId, stateVersion: executed.output.state.stateVersion, ...resultReceipt(executed.output, envelope) };
        const successes = stored.successfulCommandsSinceSnapshot + 1; const snapshotDue = shouldCreateSnapshot(successes, executed.output.state, envelope.command);
        const nextStored            = { state: executed.output.state, commandLog: executed.commandLog, successfulCommandsSinceSnapshot: snapshotDue ? 0 : successes, ...(snapshotDue ? { lastSnapshot: createSnapshot(executed.output.state, executed.commandLog.baseSequence + executed.commandLog.entries.length) } : stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }) };
        if (this.#beforeCommit !== undefined) await this.#beforeCommit(envelope);
        transaction.setRun(envelope.runId, nextStored); settle(receipt); newlyCommitted = true; return receipt;
      } catch (error) {
        if (error instanceof ReducerError) return settle(failure(envelope.commandId, stored.state.stateVersion, error.code, error.messageKey, error.retryable));
        if (error instanceof PersistenceError) return failure(envelope.commandId, stored.state.stateVersion, "TRANSIENT", "persistence.invalid", true);
        return failure(envelope.commandId, stored.state.stateVersion, "TRANSIENT", "gateway.failure", true);
      }
    });
    if (newlyCommitted && this.#afterCommit !== undefined) await this.#afterCommit(envelope);
    return clone(result);
  }
}

                                       
                                                                
                                             
     
                                                                                                       
                                                                                                        
                                                                                  
     
                                                                       
 

class GatewayApplicationTransport                                 {
           gateway                ;
           auth                    ;
  constructor(gateway                , auth                    ) { this.gateway = gateway; this.auth = auth; }
  sendCommand(command                 )                         { return this.gateway.sendCommand(this.auth, command); }
  fetchView(runId        )                   { return this.gateway.fetchView(this.auth, runId); }
  createRunOffer(_options                           )                   { return Promise.reject(new Error("A11 transport implements sendCommand only")); }
}

module.exports = Object.assign({}, {
  MAX_COMMAND_ENVELOPE_BYTES,
  MAX_GATEWAY_ID_LENGTH,
  CommandGateway,
  GatewayApplicationTransport
});
