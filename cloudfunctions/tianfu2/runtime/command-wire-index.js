// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/command-wire/src/index.ts
// Source sha256:   402d9316ed1878d53705aba8e5f8a5f3dfcccb51739b927f28b725ac3edaa602
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
 * UI04A — client-safe command/envelope wire boundary.
 *
 * This module is the single source of truth for the *wire protocol*: command shapes, envelope
 * fields, validation, canonical JSON serialization and parsing, plus the application error codes.
 * It is protocol-level only. It contains no RuleState, reducer, RNG, outcome, progression, risk,
 * build, NPC, Director, Content or server logic, and it has **no imports at all** — not even from
 * `packages/core`. That is what lets a real miniprogram client bundle reach the codec without
 * dragging the gameplay Core dependency graph into the bundle.
 *
 * `packages/core/src/command.ts` re-exports this module verbatim, so every existing Core and
 * server caller keeps importing the same bindings from the same place and observes byte-identical
 * behaviour. See `docs/UI04A_CLIENT_WIRE_BOUNDARY.md`.
 *
 * Vocabulary note: `COMMAND_ACTION_IDS` below is the *protocol* action vocabulary, taken verbatim
 * from `.codex/contracts/command.ref` (`actionId:'cultivate'|'travel'|'worldly'|'pursuit'`).
 * The *rule-side* vocabulary (`ACTION_TYPES` in `packages/core/src/state.ts`) is a separate,
 * rule-owned constant; `tests/ui04a.test.mjs` pins the two to be equal so they cannot drift.
 */

const APP_ERROR_CODES = [
  "INVALID_COMMAND",
  "INVALID_OPTION",
  "STATE_CONFLICT",
  "UNAUTHORIZED",
  "CONTENT_MISMATCH",
  "RUN_NOT_ACTIVE",
  "RUN_OFFER_MISMATCH",
  "TRANSIENT"
]         ;

                                                          
                                                         

/** Protocol-level action ids, verbatim from `.codex/contracts/command.ref`. */
const COMMAND_ACTION_IDS = ["cultivate", "travel", "worldly", "pursuit"]         ;
                                                                  

                         
                                                                                  
                                                                                  
                                                                                 
                                    
                                                                      
                                                                  
                                                                 
                                        
                                        
                                               
                                                
                                                         
                                                                               
                                                            
                           
                                                    

                                                                       
                    
                   
                
                               
                       
                         
                                 
                      
                          
             
 

                                                                                           
              
                    
                       
                      
                            
                         
                                                                         
 

class CommandValidationError extends TypeError {
           code = "INVALID_COMMAND"         ;
}

                                           
const platforms = new Set(["wechat", "douyin", "dev"]);
const actionTypes = new Set        (COMMAND_ACTION_IDS);

function fail(path        , message        )        {
  throw new CommandValidationError(`${path}: ${message}`);
}

function objectValue(value         , path        )              {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "must be a plain object");
  return value               ;
}

function stringValue(value         , path        )         {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

/**
 * Same acceptance set and same failure text as the Core helper this boundary was extracted from:
 * a non-safe-integer is reported as "must be a finite safe integer". `Number.isSafeInteger` is the
 * only primitive needed, so the wire boundary stays dependency-free.
 */
function safeInteger(value         , path        , minimum         )         {
  if (typeof value !== "number") fail(path, "must be a number");
  if (!Number.isSafeInteger(value)) fail(path, "must be a finite safe integer");
  if (minimum !== undefined && value < minimum) fail(path, `must be >= ${minimum}`);
  return value;
}

function exactFields(value             , required                   , optional                    = [])       {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`command.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`command.${key}`, "is required");
}

function idFields(command             , type        , fields                   )       {
  exactFields(command, ["type", ...fields]);
  if (command.type !== type) fail("command.type", `must be ${type}`);
  for (const field of fields) stringValue(command[field], `command.${field}`);
}

function validateGameCommand(value         )              {
  const command = objectValue(value, "command");
  const type = stringValue(command.type, "command.type");
  switch (type) {
    case "START_RUN": {
      const hasDestiny = Object.hasOwn(command, "destinyId"); const hasSelection = Object.hasOwn(command, "selectionId");
      if (hasDestiny === hasSelection) fail("command", "must contain exactly one of destinyId or selectionId");
      idFields(command, type, ["offerId", hasSelection ? "selectionId" : "destinyId"]); break;
    }
    case "CHOOSE_ACTION": {
      exactFields(command, ["type", "actionId"], ["pursuitCauseId"]);
      const actionId = stringValue(command.actionId, "command.actionId");
      if (!actionTypes.has(actionId)) fail("command.actionId", "has an invalid value");
      if (command.pursuitCauseId !== undefined) stringValue(command.pursuitCauseId, "command.pursuitCauseId");
      break;
    }
    case "CHOOSE_EVENT_OPTION": idFields(command, type, ["eventId", "optionId"]); break;
    case "ATTEMPT_BREAKTHROUGH": exactFields(command, ["type"]); break;
    case "EQUIP_TECHNIQUE":
    case "EQUIP_ARTIFACT":
      exactFields(command, ["type", "componentId", "slot"]);
      stringValue(command.componentId, "command.componentId"); safeInteger(command.slot, "command.slot", 0);
      break;
    case "USE_ITEM": idFields(command, type, ["itemId"]); break;
    case "TRAVEL": idFields(command, type, ["regionId"]); break;
    case "JOIN_FACTION":
    case "LEAVE_FACTION": idFields(command, type, ["factionId"]); break;
    case "START_BREAKTHROUGH": idFields(command, type, ["targetRealmId"]); break;
    case "CHOOSE_BREAKTHROUGH_OPTION": idFields(command, type, ["sessionId", "optionId"]); break;
    case "RESPOND_NPC": idFields(command, type, ["npcId", "intentId"]); break;
    case "ABANDON_RUN": exactFields(command, ["type"]); break;
    case "CLAIM_META_UNLOCK": idFields(command, type, ["unlockId"]); break;
    default: fail("command.type", "has an invalid value");
  }
  return value               ;
}

function validateCommandEnvelope(value         )                  {
  const envelope = objectValue(value, "envelope");
  const required = ["commandId", "playerId", "runId", "expectedStateVersion", "rulesVersion", "contentVersion", "clientPlatform", "clientBuild", "command"];
  const optional = ["issuedAtClient"];
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(envelope)) if (!allowed.has(key)) fail(`envelope.${key}`, "is not allowed");
  for (const key of required) if (!Object.hasOwn(envelope, key)) fail(`envelope.${key}`, "is required");
  for (const key of ["commandId", "playerId", "runId", "rulesVersion", "contentVersion", "clientBuild"]         ) stringValue(envelope[key], `envelope.${key}`);
  safeInteger(envelope.expectedStateVersion, "envelope.expectedStateVersion", 0);
  const platform = stringValue(envelope.clientPlatform, "envelope.clientPlatform");
  if (!platforms.has(platform)) fail("envelope.clientPlatform", "has an invalid value");
  if (envelope.issuedAtClient !== undefined) safeInteger(envelope.issuedAtClient, "envelope.issuedAtClient");
  validateGameCommand(envelope.command);
  return value                   ;
}

function canonicalValue(value         )          {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  const source = value               ;
  const target              = {};
  for (const key of Object.keys(source).sort()) target[key] = canonicalValue(source[key]);
  return target;
}

function serializeCommandEnvelope(value         )         {
  return JSON.stringify(canonicalValue(validateCommandEnvelope(value)));
}

function parseCommandEnvelope(serialized        )                  {
  if (typeof serialized !== "string") fail("serialized", "must be a string");
  try { return validateCommandEnvelope(JSON.parse(serialized)); }
  catch (error) {
    if (error instanceof CommandValidationError) throw error;
    throw new CommandValidationError("serialized: must contain valid JSON");
  }
}

module.exports = Object.assign({}, {
  APP_ERROR_CODES,
  COMMAND_ACTION_IDS,
  CommandValidationError,
  validateGameCommand,
  validateCommandEnvelope,
  serializeCommandEnvelope,
  parseCommandEnvelope
});
