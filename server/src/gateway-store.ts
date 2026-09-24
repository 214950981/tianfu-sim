/**
 * UI04D — the CommandGateway persistence boundary.
 *
 * The accepted gateway semantics (idempotency, STATE_CONFLICT, ownership, snapshot cadence, replay)
 * do not change here; what changes is *how the gateway reaches durable state*. A11's gateway was
 * hard-wired to a synchronous in-memory map, which cannot be a cloud document store. This module
 * names the port instead:
 *
 *   - `GatewayStore.readRun` may now answer asynchronously, so a document read is legal;
 *   - `GatewayStore.transact` hands the operation a `GatewayTransactionView` whose reads may be
 *     asynchronous, so a CloudBase `runTransaction` can serve them;
 *   - the view grows exactly one new entity, `bootstrap`, because UI04D requires the
 *     OPENID + bootstrapId -> run mapping to be settled *in the same transaction* as the run it names.
 *     Without it a client retry after a timeout could not recover its own run.
 *
 * Everything above the port stays byte-for-byte the same logic: `CommandGateway` still validates the
 * envelope, still refuses a changed payload under a reused commandId, still compares
 * `expectedStateVersion` against the stored one and still settles through `executeLoggedCommand`.
 * `InMemoryGatewayStore` is preserved with its synchronous surface, so every accepted test keeps
 * working unchanged.
 */

import { createCommandLog, validateGameState, type CommandLog, type CommandResult, type GameState, type Snapshot } from "../../packages/core/src/index.ts";

/**
 * UI04E — the terminal presentation sidecar attached to a stored run.
 *
 * It lives **outside RuleState** on purpose: the design treats terminal flow as presentation/session
 * orchestration, so settling an `ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE` transition must not
 * touch `stateVersion`, `age`, `nodeIndex`, `rng`, `commandLog`, snapshots, causes, NPC state, resources,
 * builds, or any other gameplay field. Every pure terminal transition is therefore byte-identical on the
 * canonical gameplay state — what changes here is `terminal`.
 *
 * `transitions` is the *exactly-once* idempotency table, by `terminalTransitionId`:
 *   - the first settlement of a given id writes the record and advances the stage;
 *   - an exact retry after a post-commit timeout reads the record and returns the settled stage without
 *     advancing;
 *   - a reused id with a different payload fails closed.
 */
export type TerminalStage = "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
export const TERMINAL_STAGES: readonly TerminalStage[] = ["ENDING", "LIFE_BOOK", "REBIRTH_RESULT", "NEXT_LIFE"];
export type TerminalAction = "advance-to-life-book" | "advance-to-rebirth-result" | "advance-to-next-life";
export const TERMINAL_ACTIONS: readonly TerminalAction[] = ["advance-to-life-book", "advance-to-rebirth-result", "advance-to-next-life"];

/** The transition a record settles — kept so an audit/UI knows exactly what was settled and when. */
export interface TerminalTransitionRecord {
  payloadHash: string;
  action: TerminalAction;
  fromStage: TerminalStage;
  toStage: TerminalStage;
  playerId: string;
  /** Monotonic, per-run. The first transition is 1. Used by an audit, not by settlement semantics. */
  sequence: number;
}

export interface TerminalSidecar {
  /** The authoritative terminal stage the server is currently displaying for this run. */
  stage: TerminalStage;
  /** Monotonic per-run terminal version. Bumps on every settled transition. */
  version: number;
  /** Exactly-once terminal transition receipts, keyed by `terminalTransitionId`. */
  transitions: Record<string, TerminalTransitionRecord>;
}

/** A persisted run: the authoritative state, its command log and its snapshot bookkeeping. */
export interface StoredRun {
  state: GameState;
  commandLog: CommandLog;
  lastSnapshot?: Snapshot;
  successfulCommandsSinceSnapshot: number;
  /** UI04E — bounded terminal presentation sidecar, kept outside RuleState by construction. */
  terminal?: TerminalSidecar;
}

/** The settled result of one commandId, keyed by the hash of the exact envelope that produced it. */
export interface IdempotencyRecord { payloadHash: string; result: CommandResult; runId: string; playerId: string }

/**
 * The OPENID-derived owner + client bootstrapId -> run mapping.
 *
 * The bootstrap id is a *client-generated, locally persisted* value: it lets a retry or a reload ask
 * for "the run this device started" without the server ever trusting a client-supplied playerId.
 */
export interface BootstrapRecord { playerId: string; bootstrapId: string; runId: string }

/**
 * The transactional view a store hands to one gateway operation.
 *
 * Reads may be asynchronous (a document store answers over the network) while writes stay staged until
 * the store commits. `CommandGateway` awaits every read, so both shapes work, and an implementation
 * that has the value in hand may still answer synchronously.
 */
export interface GatewayTransactionView {
  getRun(runId: string): Promise<StoredRun | undefined> | StoredRun | undefined;
  setRun(runId: string, value: StoredRun): void;
  getIdempotency(commandId: string): Promise<IdempotencyRecord | undefined> | IdempotencyRecord | undefined;
  setIdempotency(commandId: string, value: IdempotencyRecord): void;
  getBootstrap(bootstrapKey: string): Promise<BootstrapRecord | undefined> | BootstrapRecord | undefined;
  setBootstrap(bootstrapKey: string, value: BootstrapRecord): void;
  /**
   * UI04E — terminal transition settlement. Read returns the receipt recorded for an already-settled
   * `terminalTransitionId`; the service writes a fresh receipt and returns `undefined` on first settle.
   * A second write under the same id would fail closed at the service layer, not the storage layer.
   */
  getTerminalTransition(terminalTransitionId: string): Promise<TerminalTransitionRecord | undefined> | TerminalTransitionRecord | undefined;
  setTerminalTransition(terminalTransitionId: string, value: TerminalTransitionRecord): void;
}

/** The whole persistence surface `CommandGateway` is allowed to use. */
export interface GatewayStore {
  readRun(runId: string): Promise<StoredRun | undefined> | StoredRun | undefined;
  transact<T>(operation: (view: GatewayTransactionView) => Promise<T> | T): Promise<T>;
}

function clone<T>(value: T): T { return structuredClone(value); }

/**
 * The synchronous in-memory store the accepted tests drive.
 *
 * `transact` serialises operations on a promise tail and stages copies of both maps, so a failing
 * operation commits nothing — that is what makes the timeout/idempotency proofs in
 * `tests/server-gateway.test.mjs` hold. Its public surface is unchanged by UI04D; it now also carries
 * the bootstrap map the new entity needs.
 */
export class InMemoryGatewayStore implements GatewayStore {
  #runs = new Map<string, StoredRun>();
  #idempotency = new Map<string, IdempotencyRecord>();
  #bootstraps = new Map<string, BootstrapRecord>();
  /** UI04E — terminal transition receipts, keyed by `terminalTransitionId`. */
  #terminalTransitions = new Map<string, TerminalTransitionRecord>();
  #tail: Promise<void> = Promise.resolve();

  seedRun(stateValue: unknown): void {
    const state = validateGameState(stateValue);
    if (this.#runs.has(state.run.runId)) throw new RangeError("run already exists");
    this.#runs.set(state.run.runId, { state: clone(state), commandLog: createCommandLog(state), successfulCommandsSinceSnapshot: 0 });
  }
  readRun(runId: string): StoredRun | undefined { const stored = this.#runs.get(runId); return stored === undefined ? undefined : clone(stored); }
  readBootstrap(bootstrapKey: string): BootstrapRecord | undefined { const stored = this.#bootstraps.get(bootstrapKey); return stored === undefined ? undefined : clone(stored); }

  async transact<T>(operation: (view: GatewayTransactionView) => Promise<T> | T): Promise<T> {
    const previous = this.#tail; let release = (): void => {};
    this.#tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
    const stagedRuns = new Map(this.#runs); const stagedIdempotency = new Map(this.#idempotency); const stagedBootstraps = new Map(this.#bootstraps); const stagedTerminalTransitions = new Map(this.#terminalTransitions);
    const view: GatewayTransactionView = {
      getRun: (runId) => stagedRuns.get(runId),
      setRun: (runId, value) => stagedRuns.set(runId, value),
      getIdempotency: (commandId) => stagedIdempotency.get(commandId),
      setIdempotency: (commandId, value) => stagedIdempotency.set(commandId, value),
      getBootstrap: (bootstrapKey) => stagedBootstraps.get(bootstrapKey),
      setBootstrap: (bootstrapKey, value) => stagedBootstraps.set(bootstrapKey, value),
      getTerminalTransition: (terminalTransitionId) => stagedTerminalTransitions.get(terminalTransitionId),
      setTerminalTransition: (terminalTransitionId, value) => stagedTerminalTransitions.set(terminalTransitionId, value)
    };
    try { const result = await operation(view); this.#runs = stagedRuns; this.#idempotency = stagedIdempotency; this.#bootstraps = stagedBootstraps; this.#terminalTransitions = stagedTerminalTransitions; return result; }
    finally { release(); }
  }
}
