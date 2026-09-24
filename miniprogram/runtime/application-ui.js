// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/application-ui/src/index.ts
// Source sha256:   58d8d44f092eb9731a5b4f6816c5d52432a241a1ee9bd7312e163cf33929b529
// Generator:       tools/ui04b-wechat-runtime-artifact.mjs
// Regenerate:      node tools/ui04b-wechat-runtime-artifact.mjs --write
//
// WeChat-loadable CommonJS derived mechanically from the accepted TypeScript module above: type
// syntax is erased with Node's built-in type stripper and ES module syntax is rewritten to plain
// CommonJS. Nothing in this file was hand-copied — there is exactly one implementation of the
// client controller, the submission controller and the command codec, and it lives in the source
// module named above.
//
// The artifact's runtime closure is pinned to exactly:
//   packages/command-wire/src/index.ts
//   packages/application-ui/src/index.ts
//   packages/wechat-shell/src/index.ts
// and contains no packages/core, packages/content, server module, Node builtin or third-party
// dependency. See docs/UI04B_WECHAT_RUNTIME_ARTIFACT.md.
// UI04A: the command/envelope wire codec is imported from the client-safe `command-wire` boundary,
// never from the gameplay Core barrel. This is the client runtime's *only* source of command
// validation and canonical serialization, and `command-wire` itself has no imports at all.
var { parseCommandEnvelope, serializeCommandEnvelope } = require("./command-wire.js");
                                                                                                                                     

class SubmissionLockedError extends Error { constructor() { super("command submission is locked"); this.name = "SubmissionLockedError"; } }
class RetryUnavailableError extends Error { constructor() { super("retry is unavailable"); this.name = "RetryUnavailableError"; } }
                                                                                                                                      
                                                                                                                                                                                                

const pendingKey = (runId        )         => `tianfu2:pending-command:${runId}`;

class CommandSubmissionController {
           #transport                      ;
           #storage                 ;
           #session                ;
           #commandIdFactory              ;
  #interactionState                   = "idle";
  #pending                  ;
  #view                  ;
  #requiresReconfirmation = false;
  constructor(input                                                                                                                                                       ) { this.#transport = input.transport; this.#storage = input.storage; this.#session = input.session; this.#commandIdFactory = input.commandIdFactory; this.#view = input.initialView; }
  snapshot()                     { return { interactionState: this.#interactionState, mutuallyExclusiveLocked: this.#interactionState === "submitting", requiresReconfirmation: this.#requiresReconfirmation, ...(this.#pending === undefined ? {} : { pendingCommandId: this.#pending.commandId }), ...(this.#view === undefined ? {} : { view: this.#view }) }; }
  async submit(command             )                         {
    if (this.#interactionState === "submitting") throw new SubmissionLockedError();
    if (this.#requiresReconfirmation) throw new RetryUnavailableError();
    const expectedStateVersion = this.#view?.state.stateVersion; if (expectedStateVersion === undefined) throw new Error("public ViewModel is required before submission");
    const commandId = this.#commandIdFactory(); if (typeof commandId !== "string" || commandId.length === 0) throw new Error("commandId factory returned an invalid id");
    this.#pending = { commandId, playerId: this.#session.playerId, runId: this.#session.runId, expectedStateVersion, rulesVersion: this.#session.rulesVersion, contentVersion: this.#session.contentVersion, clientPlatform: "wechat", clientBuild: this.#session.clientBuild, command };
    this.#interactionState = "submitting";
    await this.#persistPending(); return this.#dispatch();
  }
  async retry()                         { if (this.#interactionState !== "retryableError" || this.#pending === undefined || this.#requiresReconfirmation) throw new RetryUnavailableError(); return this.#dispatch(); }
  async restorePending()                {
    const serialized = await this.#storage.getLocal(pendingKey(this.#session.runId)); if (serialized === null || serialized === "") return;
    const pending = parseCommandEnvelope(serialized); if (pending.runId !== this.#session.runId || pending.playerId !== this.#session.playerId) throw new Error("pending command owner mismatch");
    this.#pending = pending; this.#view = await this.#fetchView(); this.#interactionState = "retryableError"; this.#requiresReconfirmation = false;
  }
  async reconfirm(command             )                         { if (!this.#requiresReconfirmation) throw new RetryUnavailableError(); this.#requiresReconfirmation = false; this.#interactionState = "idle"; return this.submit(command); }
  async #dispatch()                         {
    if (this.#pending === undefined) throw new RetryUnavailableError(); const envelope = this.#pending; this.#interactionState = "submitting";
    try {
      const result = await this.#transport.sendCommand(envelope);
      if (result.ok) { this.#view = await this.#fetchView(); this.#interactionState = "confirmed"; this.#pending = undefined; await this.#clearPending(); return result; }
      if (result.error?.code === "STATE_CONFLICT") { this.#view = await this.#fetchView(); this.#interactionState = "retryableError"; this.#requiresReconfirmation = true; this.#pending = undefined; await this.#clearPending(); return result; }
      if (result.error?.retryable === true) { this.#interactionState = "retryableError"; return result; }
      this.#interactionState = "fatalError"; this.#pending = undefined; await this.#clearPending(); return result;
    } catch (error) { this.#interactionState = "retryableError"; throw error; }
  }
  async #fetchView()                           { return await this.#transport.fetchView(this.#session.runId)                   ; }
  #persistPending()                { return this.#storage.setLocal(pendingKey(this.#session.runId), serializeCommandEnvelope(this.#pending)); }
  #clearPending()                { return this.#storage.setLocal(pendingKey(this.#session.runId), ""); }
}

function canOrdinaryBack(pageState                                       , interactionState                  )          {
  return !((pageState === "EVENT" || pageState === "SPECIAL_NODE") && interactionState !== "confirmed");
}

module.exports = {
  SubmissionLockedError,
  RetryUnavailableError,
  CommandSubmissionController,
  canOrdinaryBack
};
