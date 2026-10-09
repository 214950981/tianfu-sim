/**
 * UI04D moved `StoredRun` / the transaction view / `InMemoryGatewayStore` into `./gateway-store.ts` so
 * the persistence boundary is a named port an asynchronous document store can implement. Nothing in the
 * settlement logic below changed: the same validation, the same idempotency record, the same
 * STATE_CONFLICT and ownership rules, the same snapshot cadence. Only the read calls became `await`ed,
 * which is a no-op for the in-memory store and is what lets a CloudBase transaction serve them.
 */
import {
  PersistenceError,
  ReducerError,
  createSnapshot,
  executeLoggedCommand,
  serializeCommandEnvelope,
  shouldCreateSnapshot,
  validateCommandEnvelope,
  validateGameState,
  type AppErrorCode,
  type CommandEnvelope,
  type CommandResult,
  type GameState,
  type ReduceOutput,
  type ReplayContext
} from "../../packages/core/src/index.ts";
import { sha256Utf8 } from "../../packages/core/src/sha256.ts";
import type { GatewayStore, GatewayTransactionView, IdempotencyRecord, StoredRun } from "./gateway-store.ts";

export const MAX_COMMAND_ENVELOPE_BYTES = 16_384;
export const MAX_GATEWAY_ID_LENGTH = 128;

export interface TrustedAuthContext { playerId: string }

function clone<T>(value: T): T { return structuredClone(value); }
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function payloadHash(envelope: CommandEnvelope): string { return hex(sha256Utf8(serializeCommandEnvelope(envelope))); }
function failure(commandId: string, stateVersion: number, code: AppErrorCode, messageKey: string, retryable = false): CommandResult {
  return { ok: false, commandId, stateVersion, error: { code, messageKey, retryable } };
}
function commandIdFrom(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const commandId = (value as Record<string, unknown>).commandId; return typeof commandId === "string" ? commandId : "";
}
function byteLength(value: string): number { return new TextEncoder().encode(value).length; }
function identifiersWithinLimit(envelope: CommandEnvelope): boolean {
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
function resultReceipt(output: ReduceOutput, envelope: CommandEnvelope): { domainEffects?: unknown[]; narrative?: Record<string, unknown> } {
  const lines: Record<string, unknown>[] = [];
  for (const effect of output.effects) {
    if (typeof effect !== "object" || effect === null) continue;
    const op = String((effect as Record<string, unknown>).op);
    if (op === "ADD_CULTIVATION") lines.push({ kind: "cultivation", labelKey: "result.cultivation", delta: (effect as Record<string, unknown>).amount });
    else if (op === "ADD_RESOURCE") lines.push({ kind: "resource", labelKey: "result.resource", resource: (effect as Record<string, unknown>).key, delta: (effect as Record<string, unknown>).amount });
    else if (op === "ADD_BUILD_EVIDENCE") lines.push({ kind: "build", labelKey: "result.build_evidence", buildId: (effect as Record<string, unknown>).buildId, delta: (effect as Record<string, unknown>).amount });
    else if (op === "OUTCOME_TIME_DELTA") lines.push({ kind: "time", labelKey: "result.time", years: (effect as Record<string, unknown>).years });
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
  const narrative: Record<string, unknown> = { changed: lines.length > 0, lines };
  const settledEventId = (envelope.command as { eventId?: unknown }).eventId;
  if (typeof settledEventId === "string" && settledEventId.length > 0) narrative.eventId = settledEventId;
  const outcome = output.narrativeFacts.find((fact) => (fact as { type?: unknown }).type === "EVENT_OUTCOME") as { choiceId?: unknown; appliedTier?: unknown } | undefined;
  // Same round-trip rule as `eventId` above: an absent value must be an absent key, never a key the
  // store drops on the way to disk.
  if (outcome !== undefined) {
    if (typeof outcome.choiceId === "string" && outcome.choiceId.length > 0) narrative.choiceId = outcome.choiceId;
    if (typeof outcome.appliedTier === "string" && outcome.appliedTier.length > 0) narrative.appliedTier = outcome.appliedTier;
  }
  return { domainEffects: lines, narrative };
}

export interface CommandGatewayOptions {
  store: GatewayStore;
  content: object;
  resolveContext?: (envelope: CommandEnvelope) => ReplayContext;
  beforeCommit?: (envelope: CommandEnvelope) => void | Promise<void>;
  afterCommit?: (envelope: CommandEnvelope) => void | Promise<void>;
  projectView?: (state: GameState, stored?: StoredRun) => unknown;
}

export class CommandGateway {
  readonly #store: GatewayStore;
  readonly #content: object;
  readonly #resolveContext: (envelope: CommandEnvelope) => ReplayContext;
  readonly #beforeCommit?: CommandGatewayOptions["beforeCommit"];
  readonly #afterCommit?: CommandGatewayOptions["afterCommit"];
  readonly #projectView?: CommandGatewayOptions["projectView"];
  constructor(options: CommandGatewayOptions) { this.#store = options.store; this.#content = options.content; this.#resolveContext = options.resolveContext ?? (() => ({})); this.#beforeCommit = options.beforeCommit; this.#afterCommit = options.afterCommit; this.#projectView = options.projectView; }

  async fetchView(auth: TrustedAuthContext, runId: string): Promise<unknown> {
    const stored = await this.#store.readRun(runId); if (stored === undefined || stored.state.run.playerId !== auth.playerId) throw new Error("UNAUTHORIZED");
    if (this.#projectView === undefined) throw new Error("ViewModel builder is not configured"); return this.#projectView(stored.state, stored);
  }

  async sendCommand(auth: TrustedAuthContext, envelopeValue: unknown): Promise<CommandResult> {
    const untrustedCommandId = commandIdFrom(envelopeValue); let envelope: CommandEnvelope;
    try {
      const serialized = JSON.stringify(envelopeValue); if (serialized === undefined || byteLength(serialized) > MAX_COMMAND_ENVELOPE_BYTES) return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.payload_too_large");
      envelope = validateCommandEnvelope(envelopeValue); if (!identifiersWithinLimit(envelope)) return failure(envelope.commandId, 0, "INVALID_COMMAND", "command.identifier_too_long");
    } catch { return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.invalid"); }
    if (typeof auth?.playerId !== "string" || auth.playerId.length === 0 || auth.playerId !== envelope.playerId) return failure(envelope.commandId, 0, "UNAUTHORIZED", "auth.player_mismatch");
    const fingerprint = payloadHash(envelope); let newlyCommitted = false;
    const result = await this.#store.transact(async (transaction: GatewayTransactionView) => {
      const prior = await transaction.getIdempotency(envelope.commandId);
      if (prior !== undefined) {
        if (prior.playerId !== auth.playerId) return failure(envelope.commandId, prior.result.stateVersion, "UNAUTHORIZED", "auth.player_mismatch");
        if (prior.payloadHash !== fingerprint) return failure(envelope.commandId, prior.result.stateVersion, "INVALID_COMMAND", "command.idempotency_conflict");
        return clone(prior.result);
      }
      const settle = (settled: CommandResult): CommandResult => { transaction.setIdempotency(envelope.commandId, { payloadHash: fingerprint, result: settled, runId: envelope.runId, playerId: auth.playerId }); return settled; };
      const stored = await transaction.getRun(envelope.runId); if (stored === undefined) return settle(failure(envelope.commandId, 0, "UNAUTHORIZED", "run.not_owned"));
      if (envelope.expectedStateVersion !== stored.state.stateVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "STATE_CONFLICT", "state.version_conflict"));
      if (stored.state.run.playerId !== auth.playerId || stored.state.run.playerId !== envelope.playerId) return settle(failure(envelope.commandId, stored.state.stateVersion, "UNAUTHORIZED", "run.not_owned"));
      if (stored.state.rulesVersion !== envelope.rulesVersion || stored.state.contentVersion !== envelope.contentVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "CONTENT_MISMATCH", "content.version_mismatch"));
      try {
        const context = this.#resolveContext(envelope); const executed = executeLoggedCommand(stored.state, stored.commandLog, envelope, context, this.#content as unknown as Readonly<Record<string, unknown>>);
        validateGameState(executed.output.state);
        // PLAYUX01: the result surface is fed from the authoritative receipt, not from a client-side
        // guess. `output.effects` is exactly what the reducer really applied (applyEventEffects pushes
        // each one into publicEffects), so "修为 0→150 (+150)" is a statement about settled state rather
        // than a prediction. It is attached here, inside the transaction, so it is written into the same
        // idempotency record as the result: a replay of the same commandId returns this identical receipt,
        // which is what makes the surface show the same outcome at most once per choice.
        const receipt: CommandResult = { ok: true, commandId: envelope.commandId, stateVersion: executed.output.state.stateVersion, ...resultReceipt(executed.output, envelope) };
        const successes = stored.successfulCommandsSinceSnapshot + 1; const snapshotDue = shouldCreateSnapshot(successes, executed.output.state, envelope.command);
        const nextStored: StoredRun = { state: executed.output.state, commandLog: executed.commandLog, successfulCommandsSinceSnapshot: snapshotDue ? 0 : successes, ...(snapshotDue ? { lastSnapshot: createSnapshot(executed.output.state, executed.commandLog.baseSequence + executed.commandLog.entries.length) } : stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }) };
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

export interface ApplicationTransport {
  sendCommand(command: CommandEnvelope): Promise<CommandResult>;
  fetchView(runId: string): Promise<unknown>;
  /**
   * UI04D: `createRunOffer` may carry a client-generated `bootstrapId`. It is a *recovery* key, not an
   * identity: the same trusted OPENID plus the same bootstrapId must return the same run. A caller that
   * has none (the accepted A11 transport, a fixture-driven test) simply omits it.
   */
  createRunOffer(options?: { bootstrapId?: string }): Promise<unknown>;
}

export class GatewayApplicationTransport implements ApplicationTransport {
  readonly gateway: CommandGateway;
  readonly auth: TrustedAuthContext;
  constructor(gateway: CommandGateway, auth: TrustedAuthContext) { this.gateway = gateway; this.auth = auth; }
  sendCommand(command: CommandEnvelope): Promise<CommandResult> { return this.gateway.sendCommand(this.auth, command); }
  fetchView(runId: string): Promise<unknown> { return this.gateway.fetchView(this.auth, runId); }
  createRunOffer(_options?: { bootstrapId?: string }): Promise<unknown> { return Promise.reject(new Error("A11 transport implements sendCommand only")); }
}
