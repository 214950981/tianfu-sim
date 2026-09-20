import {
  PersistenceError,
  ReducerError,
  createCommandLog,
  createSnapshot,
  executeLoggedCommand,
  serializeCommandEnvelope,
  shouldCreateSnapshot,
  validateCommandEnvelope,
  validateGameState,
  type AppErrorCode,
  type CommandEnvelope,
  type CommandLog,
  type CommandResult,
  type GameState,
  type ReplayContext,
  type Snapshot
} from "../../packages/core/src/index.ts";
import { sha256Utf8 } from "../../packages/core/src/sha256.ts";

export const MAX_COMMAND_ENVELOPE_BYTES = 16_384;
export const MAX_GATEWAY_ID_LENGTH = 128;

export interface TrustedAuthContext { playerId: string }
export interface StoredRun {
  state: GameState;
  commandLog: CommandLog;
  lastSnapshot?: Snapshot;
  successfulCommandsSinceSnapshot: number;
}
interface IdempotencyRecord { payloadHash: string; result: CommandResult; runId: string; playerId: string }
interface TransactionView {
  getRun(runId: string): StoredRun | undefined;
  setRun(runId: string, value: StoredRun): void;
  getIdempotency(commandId: string): IdempotencyRecord | undefined;
  setIdempotency(commandId: string, value: IdempotencyRecord): void;
}

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

export class InMemoryGatewayStore {
  #runs = new Map<string, StoredRun>();
  #idempotency = new Map<string, IdempotencyRecord>();
  #tail: Promise<void> = Promise.resolve();

  seedRun(stateValue: unknown): void {
    const state = validateGameState(stateValue); if (this.#runs.has(state.run.runId)) throw new RangeError("run already exists");
    this.#runs.set(state.run.runId, { state: clone(state), commandLog: createCommandLog(state), successfulCommandsSinceSnapshot: 0 });
  }
  readRun(runId: string): StoredRun | undefined { const stored = this.#runs.get(runId); return stored === undefined ? undefined : clone(stored); }
  async transact<T>(operation: (view: TransactionView) => Promise<T> | T): Promise<T> {
    const previous = this.#tail; let release = (): void => {};
    this.#tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
    const stagedRuns = new Map(this.#runs); const stagedIdempotency = new Map(this.#idempotency);
    const view: TransactionView = { getRun: (runId) => stagedRuns.get(runId), setRun: (runId, value) => stagedRuns.set(runId, value), getIdempotency: (commandId) => stagedIdempotency.get(commandId), setIdempotency: (commandId, value) => stagedIdempotency.set(commandId, value) };
    try { const result = await operation(view); this.#runs = stagedRuns; this.#idempotency = stagedIdempotency; return result; }
    finally { release(); }
  }
}

export interface CommandGatewayOptions {
  store: InMemoryGatewayStore;
  content: object;
  resolveContext?: (envelope: CommandEnvelope) => ReplayContext;
  beforeCommit?: (envelope: CommandEnvelope) => void | Promise<void>;
  afterCommit?: (envelope: CommandEnvelope) => void | Promise<void>;
}

export class CommandGateway {
  readonly #store: InMemoryGatewayStore;
  readonly #content: object;
  readonly #resolveContext: (envelope: CommandEnvelope) => ReplayContext;
  readonly #beforeCommit?: CommandGatewayOptions["beforeCommit"];
  readonly #afterCommit?: CommandGatewayOptions["afterCommit"];
  constructor(options: CommandGatewayOptions) { this.#store = options.store; this.#content = options.content; this.#resolveContext = options.resolveContext ?? (() => ({})); this.#beforeCommit = options.beforeCommit; this.#afterCommit = options.afterCommit; }

  async sendCommand(auth: TrustedAuthContext, envelopeValue: unknown): Promise<CommandResult> {
    const untrustedCommandId = commandIdFrom(envelopeValue); let envelope: CommandEnvelope;
    try {
      const serialized = JSON.stringify(envelopeValue); if (serialized === undefined || byteLength(serialized) > MAX_COMMAND_ENVELOPE_BYTES) return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.payload_too_large");
      envelope = validateCommandEnvelope(envelopeValue); if (!identifiersWithinLimit(envelope)) return failure(envelope.commandId, 0, "INVALID_COMMAND", "command.identifier_too_long");
    } catch { return failure(untrustedCommandId, 0, "INVALID_COMMAND", "command.invalid"); }
    if (typeof auth?.playerId !== "string" || auth.playerId.length === 0 || auth.playerId !== envelope.playerId) return failure(envelope.commandId, 0, "UNAUTHORIZED", "auth.player_mismatch");
    const fingerprint = payloadHash(envelope); let newlyCommitted = false;
    const result = await this.#store.transact(async (transaction) => {
      const prior = transaction.getIdempotency(envelope.commandId);
      if (prior !== undefined) {
        if (prior.playerId !== auth.playerId) return failure(envelope.commandId, prior.result.stateVersion, "UNAUTHORIZED", "auth.player_mismatch");
        if (prior.payloadHash !== fingerprint) return failure(envelope.commandId, prior.result.stateVersion, "INVALID_COMMAND", "command.idempotency_conflict");
        return clone(prior.result);
      }
      const settle = (settled: CommandResult): CommandResult => { transaction.setIdempotency(envelope.commandId, { payloadHash: fingerprint, result: settled, runId: envelope.runId, playerId: auth.playerId }); return settled; };
      const stored = transaction.getRun(envelope.runId); if (stored === undefined) return settle(failure(envelope.commandId, 0, "UNAUTHORIZED", "run.not_owned"));
      if (envelope.expectedStateVersion !== stored.state.stateVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "STATE_CONFLICT", "state.version_conflict"));
      if (stored.state.run.playerId !== auth.playerId || stored.state.run.playerId !== envelope.playerId) return settle(failure(envelope.commandId, stored.state.stateVersion, "UNAUTHORIZED", "run.not_owned"));
      if (stored.state.rulesVersion !== envelope.rulesVersion || stored.state.contentVersion !== envelope.contentVersion) return settle(failure(envelope.commandId, stored.state.stateVersion, "CONTENT_MISMATCH", "content.version_mismatch"));
      try {
        const context = this.#resolveContext(envelope); const executed = executeLoggedCommand(stored.state, stored.commandLog, envelope, context, this.#content as unknown as Readonly<Record<string, unknown>>);
        validateGameState(executed.output.state); const success: CommandResult = { ok: true, commandId: envelope.commandId, stateVersion: executed.output.state.stateVersion };
        const successes = stored.successfulCommandsSinceSnapshot + 1; const snapshotDue = shouldCreateSnapshot(successes, executed.output.state, envelope.command);
        const nextStored: StoredRun = { state: executed.output.state, commandLog: executed.commandLog, successfulCommandsSinceSnapshot: snapshotDue ? 0 : successes, ...(snapshotDue ? { lastSnapshot: createSnapshot(executed.output.state, executed.commandLog.baseSequence + executed.commandLog.entries.length) } : stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }) };
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

export interface ApplicationTransport {
  sendCommand(command: CommandEnvelope): Promise<CommandResult>;
  fetchView(runId: string): Promise<unknown>;
  createRunOffer(): Promise<unknown>;
}

export class GatewayApplicationTransport implements ApplicationTransport {
  readonly gateway: CommandGateway;
  readonly auth: TrustedAuthContext;
  constructor(gateway: CommandGateway, auth: TrustedAuthContext) { this.gateway = gateway; this.auth = auth; }
  sendCommand(command: CommandEnvelope): Promise<CommandResult> { return this.gateway.sendCommand(this.auth, command); }
  fetchView(_runId: string): Promise<unknown> { return Promise.reject(new Error("A11 transport implements sendCommand only")); }
  createRunOffer(): Promise<unknown> { return Promise.reject(new Error("A11 transport implements sendCommand only")); }
}
