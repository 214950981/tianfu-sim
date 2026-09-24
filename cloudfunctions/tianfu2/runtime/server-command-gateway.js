// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/command-gateway.ts
// Source sha256:   0cf256e4eec5a4e679810eb9fe321b6baacf3a7901bd338342de08f64bcdc3db
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
    if (this.#projectView === undefined) throw new Error("ViewModel builder is not configured"); return this.#projectView(stored.state);
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
        validateGameState(executed.output.state); const success                = { ok: true, commandId: envelope.commandId, stateVersion: executed.output.state.stateVersion };
        const successes = stored.successfulCommandsSinceSnapshot + 1; const snapshotDue = shouldCreateSnapshot(successes, executed.output.state, envelope.command);
        const nextStored            = { state: executed.output.state, commandLog: executed.commandLog, successfulCommandsSinceSnapshot: snapshotDue ? 0 : successes, ...(snapshotDue ? { lastSnapshot: createSnapshot(executed.output.state, executed.commandLog.baseSequence + executed.commandLog.entries.length) } : stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }) };
        if (this.#beforeCommit !== undefined) await this.#beforeCommit(envelope);
        transaction.setRun(envelope.runId, nextStored); settle(success); newlyCommitted = true; return success;
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
