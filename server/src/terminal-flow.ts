/**
 * UI04E — terminal presentation flow: exactly-once stage transitions + NEXT_LIFE bootstrap rotation.
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
 *   - there is no reducer and no settlement, just a sidecar bump and an authoritative next stage;
 *   - on `REBIRTH_RESULT -> NEXT_LIFE` the response carries the freshly minted `bootstrapId` and `runId`
 *     of the next life, so the caller can re-bootstrap without going through `createRunOffer` directly.
 *
 * NEXT_LIFE MUST NOT RESET THE OLD RUN
 *
 * The completed run is kept exactly as it settled. Starting a new life is a *new* document: a fresh
 * `(playerId, nextBootstrapId) -> nextRunId` mapping is written inside the same transaction, and the
 * old run's terminal stage is left at `NEXT_LIFE`. A retry or reload of the same `terminalTransitionId`
 * recovers the same `(nextBootstrapId, nextRunId)` from the transition receipt — never a second fresh
 * life.
 */

import { createCommandLog, createOfferedRun, createRngState, selectDestinyCandidates, selectInnateProfileOffers, type MetaView } from "../../packages/core/src/index.ts";
import type { ContentRegistry } from "../../packages/content/src/registry.ts";
import type { GatewayStore, StoredRun, TerminalAction, TerminalSidecar, TerminalStage, TerminalTransitionRecord } from "./gateway-store.ts";
import { assertBootstrapId, runIdSeedFor } from "./identity.ts";
import { generateServerDestinyOffer } from "./destiny-offer.ts";

/** Strict, monotonic, four-edge terminal transition graph. Anything else fails closed at the call site. */
export const TERMINAL_GRAPH: Readonly<Record<TerminalAction, { from: TerminalStage; to: TerminalStage }>> = {
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
export function freshTerminalSidecar(): TerminalSidecar { return { stage: "ENDING", version: 0, transitions: {} }; }

/** Result shape the `advanceTerminal` RPC publishes to the client. */
export interface AdvanceTerminalResult {
  runId: string;
  playerId: string;
  terminalTransitionId: string;
  stage: TerminalStage;
  version: number;
  /** The next-life bootstrap key, only present when this transition settled `REBIRTH_RESULT -> NEXT_LIFE`. */
  nextBootstrapId?: string;
  /** The next-life run id, only present when this transition settled `REBIRTH_RESULT -> NEXT_LIFE`. */
  nextRunId?: string;
}

/**
 * Raised for every fail-closed terminal-flow condition. Each subclass carries the same `code` the
 * `ApplicationTransport` envelope already uses, so a host can map it to its own settlement envelope.
 */
export class TerminalFlowError extends Error {
  readonly code: "INVALID_COMMAND" | "INVALID_OPTION" | "STATE_CONFLICT" | "UNAUTHORIZED" | "TRANSIENT";
  readonly messageKey: string;
  readonly retryable: boolean;
  constructor(code: "INVALID_COMMAND" | "INVALID_OPTION" | "STATE_CONFLICT" | "UNAUTHORIZED" | "TRANSIENT", messageKey: string, retryable = false) {
    super(messageKey); this.name = "TerminalFlowError"; this.code = code; this.messageKey = messageKey; this.retryable = retryable;
  }
}

/** A bounded server-side entropy source — used only for the next-life run id and root seed. */
export interface TerminalEntropy { randomToken(): string }

/** What the terminal flow needs from the run + content layer to mint the next life. */
export interface AdvanceTerminalContext {
  store: GatewayStore;
  content: ContentRegistry;
  entropy: TerminalEntropy;
  playerId: string;
  rulesVersion: string;
  contentVersion: string;
  schemaVersion?: number;
  metaView?: MetaView;
  /** Mirror of `TianfuLiveService#offerFixture`; passed through so the next life looks like the first. */
  offerFixture?: unknown;
}

/** The accepted envelope shape for `advanceTerminal`. Validated and *not* trusted at the call site. */
export interface AdvanceTerminalRequest {
  runId: string;
  terminalTransitionId: string;
  expectedTerminalStage: TerminalStage;
  action: TerminalAction;
}

/**
 * Validates a `AdvanceTerminalRequest` envelope. Mirrors the gateway's defence-in-depth: a payload the
 * host or a tampered client can still produce must fail closed rather than be passed through.
 */
export function parseAdvanceTerminalRequest(value: unknown): AdvanceTerminalRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  const record = value as Record<string, unknown>;
  const runId = typeof record.runId === "string" && record.runId.length > 0 && record.runId.length <= 128 ? record.runId : "";
  const terminalTransitionId = typeof record.terminalTransitionId === "string" && record.terminalTransitionId.length > 0 && record.terminalTransitionId.length <= 128 ? record.terminalTransitionId : "";
  const expectedTerminalStage = typeof record.expectedTerminalStage === "string" ? (record.expectedTerminalStage as TerminalStage) : "";
  const action = typeof record.action === "string" ? (record.action as TerminalAction) : "";
  if (runId === "") throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  if (terminalTransitionId === "") throw new TerminalFlowError("INVALID_COMMAND", "command.invalid");
  if (!isTerminalStage(expectedTerminalStage)) throw new TerminalFlowError("INVALID_OPTION", "terminal.stage_unknown");
  if (!isTerminalAction(action)) throw new TerminalFlowError("INVALID_OPTION", "terminal.action_unknown");
  return { runId, terminalTransitionId, expectedTerminalStage, action };
}

function isTerminalStage(value: string): value is TerminalStage {
  return value === "ENDING" || value === "LIFE_BOOK" || value === "REBIRTH_RESULT" || value === "NEXT_LIFE";
}
function isTerminalAction(value: string): value is TerminalAction {
  return value === "advance-to-life-book" || value === "advance-to-rebirth-result" || value === "advance-to-next-life";
}

/**
 * The one-shot hash of the exact terminal transition request. Two requests with the same payload hash
 * are an exact retry; two with the same id and a different payload hash are a hostile/confused replay.
 * Uses Node's `crypto`-free `FNV-1a` so the module stays platform-neutral (the cloud host calls it too).
 */
function payloadHash(request: AdvanceTerminalRequest): string {
  return fnv1a(JSON.stringify({ runId: request.runId, action: request.action, expectedTerminalStage: request.expectedTerminalStage }));
}
function fnv1a(value: string): string {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Settles one terminal transition inside a single transaction. Exactly-once by `terminalTransitionId`.
 *
 * Behaviour:
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
 * On `REBIRTH_RESULT -> NEXT_LIFE` the same transaction mints a fresh `(nextBootstrapId, nextRunId)`
 * pair under the trusted player, writes the bootstrap mapping, creates the offered RunState through
 * the *real* `createOfferedRun` factory, and persists the (nextBootstrapId, nextRunId) on the receipt
 * itself so an exact retry recovers them deterministically. The canonical gameplay bytes of the old
 * run are unchanged because the sidecar is the only thing it writes about it; the new run lives in its
 * own document.
 */
export async function advanceTerminal(requestValue: unknown, context: AdvanceTerminalContext): Promise<AdvanceTerminalResult> {
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
      if (graph.to === "NEXT_LIFE") {
        if (prior.nextBootstrapId === undefined || prior.nextRunId === undefined) {
          // The receipt survived but NEXT_LIFE fields are missing — fail closed rather than invent a new life.
          throw new TerminalFlowError("TRANSIENT", "terminal.next_life_lost");
        }
        return { ok: true, runId: request.runId, playerId: prior.playerId, terminalTransitionId: request.terminalTransitionId, stage: prior.toStage, version: prior.sequence, nextBootstrapId: prior.nextBootstrapId, nextRunId: prior.nextRunId };
      }
      return { ok: true, runId: request.runId, playerId: prior.playerId, terminalTransitionId: request.terminalTransitionId, stage: prior.toStage, version: prior.sequence };
    }

    // 4. current sidecar stage must match expectedTerminalStage — guards against stale-client advances.
    const currentStage: TerminalStage = stored.terminal?.stage ?? "ENDING";
    if (currentStage !== request.expectedTerminalStage) throw new TerminalFlowError("STATE_CONFLICT", "terminal.stage_drift");

    // 5. first settlement: bump sidecar and write the receipt.
    const nextStage: TerminalStage = graph.to;
    const nextVersion: number = (stored.terminal?.version ?? 0) + 1;

    // 6. NEXT_LIFE is a *new document*, never a reset. The old run's terminal sidecar is updated to
    //    NEXT_LIFE *without* mutating canonical gameplay state.
    if (nextStage === "NEXT_LIFE") {
      const nextBootstrap = assertBootstrapId(context.entropy.randomToken());
      const nextRunId = `run-${runIdSeedFor(context.playerId, nextBootstrap)}`;
      const fixture = (context.offerFixture ?? {}) as Record<string, unknown>;
      const nextRootSeed = assertBootstrapId(context.entropy.randomToken());
      // Use the real destiny offer generator — it knows whether to produce innate-profile offers
      // (progression.v1) or legacy destiny lists, and validates the selection.
      const generated = generateServerDestinyOffer({
        schemaVersion: context.schemaVersion ?? 2,
        rulesVersion: context.rulesVersion,
        contentVersion: context.contentVersion,
        runId: nextRunId,
        playerId: context.playerId,
        rootSeed: nextRootSeed,
        metaView: context.metaView ?? { unlocks: [], entitlements: [], discoveries: [] },
        content: context.content,
        fixture: {
          offerId: `offer-${nextRunId}`,
          age: typeof fixture.age === "number" ? fixture.age : 24,
          maxAge: typeof fixture.maxAge === "number" ? fixture.maxAge : 100,
          runName: typeof fixture.runName === "string" ? fixture.runName : "未名",
          realm: (fixture.realm as { id: string; order: number; cultivation: number }) ?? { id: "mortal", order: 0, cultivation: 0 },
          attributes: (fixture.attributes as { insight: number; body: number; spiritSense: number; fortune: number }) ?? { insight: 10, body: 10, spiritSense: 10, fortune: 10 },
          resources: (fixture.resources as { spiritStone: number; items: Record<string, number> }) ?? { spiritStone: 0, items: {} },
          availableActions: (fixture.availableActions as readonly ("cultivate" | "travel" | "worldly" | "pursuit")[]) ?? ["cultivate", "travel", "worldly", "pursuit"],
          world: (fixture.world as { regionId: string; knownRegionIds: string[]; tags: string[]; factionStanding: Record<string, number> }) ?? { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} }
        }
      });
      const offered = generated.state;

      const receipt: TerminalTransitionRecord = {
        payloadHash: payloadHash(request),
        action: request.action,
        fromStage: graph.from,
        toStage: nextStage,
        playerId: context.playerId,
        sequence: nextVersion,
        nextBootstrapId: nextBootstrap,
        nextRunId
      };

      view.setRun(nextRunId, { state: offered, commandLog: createCommandLog(offered), successfulCommandsSinceSnapshot: 0 });
      view.setBootstrap(`${context.playerId}::${nextBootstrap}`, { playerId: context.playerId, bootstrapId: nextBootstrap, runId: nextRunId });
      view.setTerminalTransition(request.terminalTransitionId, receipt);

      // Old run: bump terminal sidecar to NEXT_LIFE WITHOUT mutating canonical gameplay state.
      const oldSidecar: TerminalSidecar = { stage: nextStage, version: nextVersion, transitions: { ...(stored.terminal?.transitions ?? {}), [request.terminalTransitionId]: receipt } };
      const preserved: StoredRun = { state: stored.state, commandLog: stored.commandLog, successfulCommandsSinceSnapshot: stored.successfulCommandsSinceSnapshot, ...(stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }), terminal: oldSidecar };
      view.setRun(request.runId, preserved);

      return { ok: true, runId: request.runId, playerId: context.playerId, terminalTransitionId: request.terminalTransitionId, stage: nextStage, version: nextVersion, nextBootstrapId: nextBootstrap, nextRunId };
    }

    // Non-NEXT_LIFE: pure presentation transition. Canonical gameplay state is unchanged.
    const receipt: TerminalTransitionRecord = { payloadHash: payloadHash(request), action: request.action, fromStage: graph.from, toStage: nextStage, playerId: context.playerId, sequence: nextVersion };
    const sidecar: TerminalSidecar = { stage: nextStage, version: nextVersion, transitions: { ...(stored.terminal?.transitions ?? {}), [request.terminalTransitionId]: receipt } };
    const preserved: StoredRun = { state: stored.state, commandLog: stored.commandLog, successfulCommandsSinceSnapshot: stored.successfulCommandsSinceSnapshot, ...(stored.lastSnapshot === undefined ? {} : { lastSnapshot: stored.lastSnapshot }), terminal: sidecar };
    view.setRun(request.runId, preserved);
    view.setTerminalTransition(request.terminalTransitionId, receipt);
    return { ok: true, runId: request.runId, playerId: context.playerId, terminalTransitionId: request.terminalTransitionId, stage: nextStage, version: nextVersion };
  });

  return settled;
}

/** Re-export the canonical store type names so callers do not need a separate import. */
export type { StoredRun, TerminalStage, TerminalAction, TerminalSidecar, TerminalTransitionRecord };