import type { CommandEnvelope, CommandResult, GameCommand } from "../../core/src/index.ts";

export const platformContractBoundary = "platform-contract" as const;

export type PageState = "START" | "MODE_SELECT" | "DESTINY_OFFER" | "RUN_OPENING" | "RUN_HOME" | "EVENT" | "SPECIAL_NODE" | "LIFE_ARCHIVE" | "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
export type InteractionState = "idle" | "submitting" | "confirmed" | "retryableError" | "fatalError";
export type PublicJson = string | number | boolean | null | PublicJson[] | { [key: string]: PublicJson };
export type RiskPresentation = Readonly<{
  tier: "low" | "caution" | "dangerous" | "lethal";
  canBeFatal: boolean;
  reasons: string[];
  level?: "safe" | "guarded" | "dangerous" | "unknown";
  labelKey?: string;
  detailKey?: string;
}>;
export type KnownCapability = "DailyChallengeCapability" | "AdCapability" | "RewardedAdCapability" | "CommerceCapability" | "ShareCapability" | "AiNarrativeCapability" | "PlatformCapability";
export type CapabilitySet = Readonly<Record<KnownCapability, boolean>>;

export interface PublicCause { publicId: string; level: "explicit" | "hinted"; titleKey?: string; summaryKey: string }
/**
 * UI04E — minimal terminal projection attached to `PublicState` for the four terminal pages
 * `ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE`. It carries only data already public in the
 * canonical projection: the authoritative stage/version, an already-public LIFE_BOOK slice, an
 * already-public REBIRTH_RESULT summary, and a NEXT_LIFE confirmation. Hidden Causes, rootSeed, RNG
 * state, internal traces and unrevealed NPC data are never reachable from here.
 */
export interface PublicTerminalProjection {
  stage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
  version: number;
  lifeBook?: Record<string, PublicJson>;
  rebirthResult?: Record<string, PublicJson>;
  nextLife?: Record<string, PublicJson>;
}
export interface PublicState {
  schemaVersion: number; rulesVersion: string; contentVersion: string; stateVersion: number; runId: string;
  pageState: PageState; runStatus: "offered" | "active" | "dying" | "ended" | "abandoned";
  publicRun: Record<string, PublicJson>; capabilities: CapabilitySet; publicCauses: PublicCause[];
  /** UI04E — present only on `ENDING | LIFE_BOOK | REBIRTH_RESULT | NEXT_LIFE`. Absent on every other page. */
  terminal?: PublicTerminalProjection;
}
export interface PublicOption { optionId: string; labelKey: string; riskPresentation?: RiskPresentation }
export interface CurrentInteraction {
  interactionId: string; kind: "destinyOffer" | "event" | "specialNode" | "ending" | "rebirth";
  titleKey: string; body: PublicJson; options: PublicOption[]; interactionState: InteractionState; retryCommandId?: string;
  /**
   * UI03 — the authoritative public id of the event this interaction is bound to, projected verbatim
   * from the run's current event. The COMMAND contract keys CHOOSE_EVENT_OPTION by `eventId`, so this
   * field is what lets a client build that command from the public ViewModel alone instead of
   * reconstructing the id from `interactionId` (which is an *instance* identity) or from a
   * presentation key. It carries no rule state: past event ids are already public in `history`.
   *
   * Absent for `destinyOffer`, which precedes any run event. See docs/UI03_LIVE_CONTROLLER.md.
   */
  eventId?: string;
}
export interface PublicHistoryEntry { entryId: string; kind: string; titleKey: string; summaryKey: string; data?: Record<string, PublicJson> }
export interface PublicHistory { entries: PublicHistoryEntry[] }
export interface ShareViewModel { title: string; summary: string; imageKey?: string; facts: Array<{ label: string; value: string }> }
export interface PublicViewModel { state: PublicState; currentInteraction?: CurrentInteraction; history: PublicHistory; share: ShareViewModel }

/**
 * UI04E — settles one terminal presentation transition. The RPC carries a `terminalTransitionId`
 * (the exactly-once key), the `expectedTerminalStage` (a guard against stale clients), and an
 * `action` naming the forward edge. A NEXT_LIFE settle additionally returns the next life's
 * `nextBootstrapId` and `nextRunId`. The success shape mirrors `CommandResult` in its failure form.
 */
export interface AdvanceTerminalOk {
  ok: true;
  terminalTransitionId: string;
  stage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
  version: number;
  nextBootstrapId?: string;
  nextRunId?: string;
}
export interface AdvanceTerminalError {
  ok: false;
  terminalTransitionId: string;
  error: { code: string; messageKey: string; retryable: boolean };
}
export type AdvanceTerminalResult = AdvanceTerminalOk | AdvanceTerminalError;

export interface ApplicationTransport {
  sendCommand(command: CommandEnvelope<GameCommand>): Promise<CommandResult>;
  fetchView(runId: string): Promise<unknown>;
  /**
   * Asks the server for a fresh offered run.
   *
   * UI04D made the request payload optional-but-real: `bootstrapId` is a client-generated, locally
   * persisted recovery key, so the same trusted identity plus the same id recovers the same run after a
   * retry or a reload instead of manufacturing another life. It is *not* an identity — the server still
   * derives the player from the trusted OPENID and ignores anything else it is sent.
   */
  createRunOffer(options?: { bootstrapId?: string }): Promise<unknown>;
  /**
   * UI04E — settles one terminal presentation transition. The RPC carries a `terminalTransitionId`
   * (the exactly-once key), the `expectedTerminalStage` (a guard against stale clients), and an
   * `action` naming the forward edge. A NEXT_LIFE settle additionally returns the next life's
   * `nextBootstrapId` and `nextRunId`. The result is a discriminated union so the controller can
   * branch on `ok` without an extra type cast.
   */
  advanceTerminal(request: {
    runId: string;
    terminalTransitionId: string;
    expectedTerminalStage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
    action: "advance-to-life-book" | "advance-to-rebirth-result" | "advance-to-next-life";
  }): Promise<AdvanceTerminalResult>;
}
export interface PlatformStorage { getLocal(key: string): Promise<string | null>; setLocal(key: string, value: string): Promise<void> }
