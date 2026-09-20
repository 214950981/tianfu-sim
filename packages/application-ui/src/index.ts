import { parseCommandEnvelope, serializeCommandEnvelope, type CommandEnvelope, type CommandResult, type GameCommand } from "../../core/src/index.ts";
import type { ApplicationTransport, InteractionState, PlatformStorage, PublicViewModel } from "../../platform-contract/src/index.ts";

export class SubmissionLockedError extends Error { constructor() { super("command submission is locked"); this.name = "SubmissionLockedError"; } }
export class RetryUnavailableError extends Error { constructor() { super("retry is unavailable"); this.name = "RetryUnavailableError"; } }
export interface CommandSession { playerId: string; runId: string; rulesVersion: string; contentVersion: string; clientBuild: string }
export interface SubmissionSnapshot { interactionState: InteractionState; mutuallyExclusiveLocked: boolean; requiresReconfirmation: boolean; pendingCommandId?: string; view?: PublicViewModel }

const pendingKey = (runId: string): string => `tianfu2:pending-command:${runId}`;

export class CommandSubmissionController {
  readonly #transport: ApplicationTransport;
  readonly #storage: PlatformStorage;
  readonly #session: CommandSession;
  readonly #commandIdFactory: () => string;
  #interactionState: InteractionState = "idle";
  #pending?: CommandEnvelope;
  #view?: PublicViewModel;
  #requiresReconfirmation = false;
  constructor(input: { transport: ApplicationTransport; storage: PlatformStorage; session: CommandSession; commandIdFactory: () => string; initialView?: PublicViewModel }) { this.#transport = input.transport; this.#storage = input.storage; this.#session = input.session; this.#commandIdFactory = input.commandIdFactory; this.#view = input.initialView; }
  snapshot(): SubmissionSnapshot { return { interactionState: this.#interactionState, mutuallyExclusiveLocked: this.#interactionState === "submitting", requiresReconfirmation: this.#requiresReconfirmation, ...(this.#pending === undefined ? {} : { pendingCommandId: this.#pending.commandId }), ...(this.#view === undefined ? {} : { view: this.#view }) }; }
  async submit(command: GameCommand): Promise<CommandResult> {
    if (this.#interactionState === "submitting") throw new SubmissionLockedError();
    if (this.#requiresReconfirmation) throw new RetryUnavailableError();
    const expectedStateVersion = this.#view?.state.stateVersion; if (expectedStateVersion === undefined) throw new Error("public ViewModel is required before submission");
    const commandId = this.#commandIdFactory(); if (typeof commandId !== "string" || commandId.length === 0) throw new Error("commandId factory returned an invalid id");
    this.#pending = { commandId, playerId: this.#session.playerId, runId: this.#session.runId, expectedStateVersion, rulesVersion: this.#session.rulesVersion, contentVersion: this.#session.contentVersion, clientPlatform: "wechat", clientBuild: this.#session.clientBuild, command };
    this.#interactionState = "submitting";
    await this.#persistPending(); return this.#dispatch();
  }
  async retry(): Promise<CommandResult> { if (this.#interactionState !== "retryableError" || this.#pending === undefined || this.#requiresReconfirmation) throw new RetryUnavailableError(); return this.#dispatch(); }
  async restorePending(): Promise<void> {
    const serialized = await this.#storage.getLocal(pendingKey(this.#session.runId)); if (serialized === null || serialized === "") return;
    const pending = parseCommandEnvelope(serialized); if (pending.runId !== this.#session.runId || pending.playerId !== this.#session.playerId) throw new Error("pending command owner mismatch");
    this.#pending = pending; this.#view = await this.#fetchView(); this.#interactionState = "retryableError"; this.#requiresReconfirmation = false;
  }
  async reconfirm(command: GameCommand): Promise<CommandResult> { if (!this.#requiresReconfirmation) throw new RetryUnavailableError(); this.#requiresReconfirmation = false; this.#interactionState = "idle"; return this.submit(command); }
  async #dispatch(): Promise<CommandResult> {
    if (this.#pending === undefined) throw new RetryUnavailableError(); const envelope = this.#pending; this.#interactionState = "submitting";
    try {
      const result = await this.#transport.sendCommand(envelope);
      if (result.ok) { this.#view = await this.#fetchView(); this.#interactionState = "confirmed"; this.#pending = undefined; await this.#clearPending(); return result; }
      if (result.error?.code === "STATE_CONFLICT") { this.#view = await this.#fetchView(); this.#interactionState = "retryableError"; this.#requiresReconfirmation = true; this.#pending = undefined; await this.#clearPending(); return result; }
      if (result.error?.retryable === true) { this.#interactionState = "retryableError"; return result; }
      this.#interactionState = "fatalError"; this.#pending = undefined; await this.#clearPending(); return result;
    } catch (error) { this.#interactionState = "retryableError"; throw error; }
  }
  async #fetchView(): Promise<PublicViewModel> { return await this.#transport.fetchView(this.#session.runId) as PublicViewModel; }
  #persistPending(): Promise<void> { return this.#storage.setLocal(pendingKey(this.#session.runId), serializeCommandEnvelope(this.#pending)); }
  #clearPending(): Promise<void> { return this.#storage.setLocal(pendingKey(this.#session.runId), ""); }
}

export function canOrdinaryBack(pageState: PublicViewModel["state"]["pageState"], interactionState: InteractionState): boolean {
  return !((pageState === "EVENT" || pageState === "SPECIAL_NODE") && interactionState !== "confirmed");
}
