// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/persistence.ts
// Source sha256:   ddc311f4fcbe5940dd3e08506d8a1a3a7bbbb10787046279fc13098dbfb3b00e
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
var { validateCommandEnvelope } = require("./core-command.js");
var { reduce } = require("./core-reducer.js");
var { sha256Utf8 } = require("./core-sha256.js");
var { projectRuleState, validateGameState } = require("./core-state.js");

const SNAPSHOT_SCHEMA_VERSION = 1         ;
const COMMAND_LOG_SCHEMA_VERSION = 1         ;
const PERIODIC_SNAPSHOT_INTERVAL = 3         ;

                                
                                                   
                                                                          
 
                           
                                                        
                             
                       
                         
                
                       
                          
                        
                   
 
                                  
                   
                            
                         
                             
                              
 
                             
                                                             
                       
                         
                
                   
                       
                             
 
                                                                                                                                                                     

class PersistenceError extends TypeError {          code = "INVALID_PERSISTENCE"         ; }
                                           
function fail(path        , message        )        { throw new PersistenceError(`${path}: ${message}`); }
function object(value         , path        )              { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object"); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object"); return value               ; }
function exact(value             , required                   , optional                   , path        )       { const allowed = new Set([...required, ...optional]); for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key}`, "is not allowed"); for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required"); }
function string(value         , path        )         { if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string"); return value; }
function integer(value         , path        , minimum = 0)         { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail(path, `must be a safe integer >= ${minimum}`); return value; }
function hash(value         , path        )         { const result = string(value, path); if (!/^[0-9a-f]{64}$/.test(result)) fail(path, "must be a lowercase SHA-256 hash"); return result; }
function hex(bytes            )         { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

function canonicalRuleStateJson(value         )         { return JSON.stringify(projectRuleState(value)); }
function ruleStateHash(value         )         { return hex(sha256Utf8(canonicalRuleStateJson(value))); }

function validateReplayContext(value         , path        )                {
  const context = object(value, path); exact(context, [], ["actorBindings", "actorStatusById"], path);
  if (context.actorBindings !== undefined) for (const [slot, actorId] of Object.entries(object(context.actorBindings, `${path}.actorBindings`))) { string(slot, `${path}.actorBindings slot`); string(actorId, `${path}.actorBindings.${slot}`); }
  if (context.actorStatusById !== undefined) for (const [actorId, status] of Object.entries(object(context.actorStatusById, `${path}.actorStatusById`))) { string(actorId, `${path}.actorStatusById actorId`); if (status !== "available" && status !== "unavailable") fail(`${path}.actorStatusById.${actorId}`, "has an invalid status"); }
  return value                 ;
}

function createSnapshot(stateValue         , commandSequence        )           {
  const state = validateGameState(stateValue); integer(commandSequence, "commandSequence");
  return { snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION, stateSchemaVersion: state.schemaVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, runId: state.run.runId, stateVersion: state.stateVersion, commandSequence, ruleStateHash: ruleStateHash(state), state };
}

function validateSnapshot(value         )           {
  const snapshot = object(value, "snapshot");
  exact(snapshot, ["snapshotSchemaVersion", "stateSchemaVersion", "rulesVersion", "contentVersion", "runId", "stateVersion", "commandSequence", "ruleStateHash", "state"], [], "snapshot");
  if (snapshot.snapshotSchemaVersion !== SNAPSHOT_SCHEMA_VERSION) fail("snapshot.snapshotSchemaVersion", "unsupported schema; migrate or reject explicitly");
  const state = validateGameState(snapshot.state); integer(snapshot.stateSchemaVersion, "snapshot.stateSchemaVersion"); integer(snapshot.stateVersion, "snapshot.stateVersion"); integer(snapshot.commandSequence, "snapshot.commandSequence");
  if (snapshot.stateSchemaVersion !== state.schemaVersion || snapshot.stateVersion !== state.stateVersion || snapshot.rulesVersion !== state.rulesVersion || snapshot.contentVersion !== state.contentVersion || snapshot.runId !== state.run.runId) fail("snapshot", "metadata does not match state");
  if (hash(snapshot.ruleStateHash, "snapshot.ruleStateHash") !== ruleStateHash(state)) fail("snapshot.ruleStateHash", "does not match canonical RuleState");
  return value            ;
}

function createCommandLog(stateValue         , baseSequence = 0)             {
  const state = validateGameState(stateValue); integer(baseSequence, "baseSequence");
  return { commandLogSchemaVersion: COMMAND_LOG_SCHEMA_VERSION, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, runId: state.run.runId, playerId: state.run.playerId, baseSequence, entries: [] };
}

function validateCommandLog(value         )             {
  const log = object(value, "commandLog"); exact(log, ["commandLogSchemaVersion", "rulesVersion", "contentVersion", "runId", "playerId", "baseSequence", "entries"], [], "commandLog");
  if (log.commandLogSchemaVersion !== COMMAND_LOG_SCHEMA_VERSION) fail("commandLog.commandLogSchemaVersion", "unsupported schema; migrate or reject explicitly");
  string(log.rulesVersion, "commandLog.rulesVersion"); string(log.contentVersion, "commandLog.contentVersion"); string(log.runId, "commandLog.runId"); string(log.playerId, "commandLog.playerId");
  const baseSequence = integer(log.baseSequence, "commandLog.baseSequence"); if (!Array.isArray(log.entries)) fail("commandLog.entries", "must be an array");
  const commandIds = new Set        ();
  log.entries.forEach((raw, index) => {
    const entry = object(raw, `commandLog.entries[${index}]`); exact(entry, ["sequence", "envelope", "context", "resultStateVersion", "resultRuleStateHash"], [], `commandLog.entries[${index}]`);
    if (integer(entry.sequence, `commandLog.entries[${index}].sequence`) !== baseSequence + index + 1) fail(`commandLog.entries[${index}].sequence`, "must be contiguous and ordered");
    const envelope = validateCommandEnvelope(entry.envelope); if (commandIds.has(envelope.commandId)) fail(`commandLog.entries[${index}].envelope.commandId`, "must be unique"); commandIds.add(envelope.commandId);
    if (envelope.rulesVersion !== log.rulesVersion || envelope.contentVersion !== log.contentVersion || envelope.runId !== log.runId || envelope.playerId !== log.playerId) fail(`commandLog.entries[${index}].envelope`, "metadata does not match Command Log");
    validateReplayContext(entry.context, `commandLog.entries[${index}].context`); integer(entry.resultStateVersion, `commandLog.entries[${index}].resultStateVersion`); hash(entry.resultRuleStateHash, `commandLog.entries[${index}].resultRuleStateHash`);
  });
  return value              ;
}

function executeLoggedCommand(stateValue         , logValue         , envelopeValue         , contextValue         , content                                   )                                                   {
  const state = validateGameState(stateValue); const log = validateCommandLog(logValue); const envelope = validateCommandEnvelope(envelopeValue); const context = validateReplayContext(contextValue, "context");
  if (state.rulesVersion !== log.rulesVersion || state.contentVersion !== log.contentVersion || state.run.runId !== log.runId || state.run.playerId !== log.playerId) fail("state", "metadata does not match Command Log");
  const lastEntry = log.entries.at(-1); if (lastEntry !== undefined && (lastEntry.resultStateVersion !== state.stateVersion || lastEntry.resultRuleStateHash !== ruleStateHash(state))) fail("commandLog", "last checkpoint does not match current state");
  if (envelope.rulesVersion !== state.rulesVersion || envelope.contentVersion !== state.contentVersion || envelope.runId !== state.run.runId || envelope.playerId !== state.run.playerId) fail("envelope", "metadata does not match state");
  if (envelope.expectedStateVersion !== state.stateVersion) fail("envelope.expectedStateVersion", "does not match current stateVersion");
  const output = reduce({ state, command: envelope.command, context: { rulesVersion: envelope.rulesVersion, contentVersion: envelope.contentVersion, content, commandId: envelope.commandId, ...context } });
  const sequence = log.baseSequence + log.entries.length + 1;
  const entry                  = { sequence, envelope, context, resultStateVersion: output.state.stateVersion, resultRuleStateHash: ruleStateHash(output.state) };
  return { output, commandLog: { ...log, entries: [...log.entries, entry] } };
}

function replayCommandLog(input                                                                                                                 )               {
  if ((input.initialState === undefined) === (input.snapshot === undefined)) fail("replay", "provide exactly one of initialState or snapshot");
  const log = validateCommandLog(input.commandLog); let state           ; let sequence        ;
  if (input.snapshot !== undefined) {
    const snapshot = validateSnapshot(input.snapshot); state = snapshot.state; sequence = snapshot.commandSequence;
    if (snapshot.rulesVersion !== log.rulesVersion || snapshot.contentVersion !== log.contentVersion || snapshot.runId !== log.runId || state.run.playerId !== log.playerId) fail("replay", "Snapshot and Command Log metadata mismatch");
    if (log.baseSequence > sequence) fail("commandLog.baseSequence", "cannot skip commands after Snapshot");
    const checkpoint = log.entries.find((entry) => entry.sequence === sequence); if (checkpoint !== undefined && checkpoint.resultRuleStateHash !== snapshot.ruleStateHash) fail("replay", "Snapshot hash does not match Command Log checkpoint");
    if (sequence > log.baseSequence && checkpoint === undefined) fail("replay", "Command Log does not cover Snapshot sequence");
  } else {
    state = validateGameState(input.initialState); sequence = 0;
    if (log.baseSequence !== 0) fail("commandLog.baseSequence", "initial replay requires baseSequence 0");
    if (state.rulesVersion !== log.rulesVersion || state.contentVersion !== log.contentVersion || state.run.runId !== log.runId || state.run.playerId !== log.playerId) fail("replay", "Initial State and Command Log metadata mismatch");
  }
  const checkpoints                              = [];
  for (const entry of log.entries) {
    if (entry.sequence <= sequence) continue;
    if (entry.sequence !== sequence + 1) fail("commandLog.entries", "replay sequence has a gap");
    if (entry.envelope.expectedStateVersion !== state.stateVersion) fail(`commandLog.entries[${entry.sequence}].envelope.expectedStateVersion`, "does not match replay stateVersion");
    let output              ; try { output = reduce({ state, command: entry.envelope.command, context: { rulesVersion: entry.envelope.rulesVersion, contentVersion: entry.envelope.contentVersion, content: input.content, commandId: entry.envelope.commandId, ...entry.context } }); }
    catch { fail(`commandLog.entries[${entry.sequence}]`, "command replay failed"); }
    const resultHash = ruleStateHash(output.state); if (output.state.stateVersion !== entry.resultStateVersion || resultHash !== entry.resultRuleStateHash) fail(`commandLog.entries[${entry.sequence}]`, "replay checkpoint mismatch");
    state = output.state; sequence = entry.sequence; checkpoints.push({ sequence, stateVersion: state.stateVersion, ruleStateHash: resultHash });
  }
  return { state, finalRuleStateHash: ruleStateHash(state), checkpoints };
}

function shouldCreateSnapshot(successfulCommandsSinceSnapshot        , stateValue         , command                                                          )          {
  const state = validateGameState(stateValue); integer(successfulCommandsSinceSnapshot, "successfulCommandsSinceSnapshot");
  return successfulCommandsSinceSnapshot >= PERIODIC_SNAPSHOT_INTERVAL || state.run.status === "ended" || command.type === "START_BREAKTHROUGH" || command.type === "CHOOSE_BREAKTHROUGH_OPTION" || command.type === "SUBMIT_CHALLENGE";
}

module.exports = Object.assign({}, {
  SNAPSHOT_SCHEMA_VERSION,
  COMMAND_LOG_SCHEMA_VERSION,
  PERIODIC_SNAPSHOT_INTERVAL,
  PersistenceError,
  canonicalRuleStateJson,
  ruleStateHash,
  createSnapshot,
  validateSnapshot,
  createCommandLog,
  validateCommandLog,
  executeLoggedCommand,
  replayCommandLog,
  shouldCreateSnapshot
});
