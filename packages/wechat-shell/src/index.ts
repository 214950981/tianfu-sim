// UI04A: even the *type-only* command surface is taken from the client-safe wire boundary, so the
// shell package has no import of any kind — runtime or type — into gameplay Core.
//
// UI04C adds the first *value* import from that boundary: the application error-code vocabulary. The
// cloud RPC adapter validates a server error code against the one canonical list rather than keeping a
// second copy of it, so the two layers cannot drift.
import { APP_ERROR_CODES, type AppErrorCode, type CommandEnvelope, type CommandResult, type GameCommand } from "../../command-wire/src/index.ts";
import { CommandSubmissionController, RetryUnavailableError, SubmissionLockedError, canOrdinaryBack, type SubmissionSnapshot } from "../../application-ui/src/index.ts";
import type {
  ApplicationTransport,
  CurrentInteraction,
  InteractionState,
  PageState,
  PlatformStorage,
  PublicJson,
  PublicOption,
  PublicState,
  PublicViewModel
} from "../../platform-contract/src/index.ts";
export { RetryUnavailableError, SubmissionLockedError };

export interface WeChatPageShellModel {
  pageState: PublicViewModel["state"]["pageState"];
  interactionLocked: boolean;
  ordinaryBackAllowed: boolean;
  visibleEntries: { dailyChallenge: boolean; rewardedAd: boolean; commerce: boolean; share: boolean; aiNarrative: boolean };
  titleKey?: string;
  optionLabels: string[];
}

export function buildWeChatPageShell(view: PublicViewModel, submission: SubmissionSnapshot): WeChatPageShellModel {
  const capability = view.state.capabilities;
  const platformAvailable = capability.PlatformCapability;
  return {
    pageState: view.state.pageState,
    interactionLocked: submission.mutuallyExclusiveLocked,
    ordinaryBackAllowed: canOrdinaryBack(view.state.pageState, submission.interactionState),
    visibleEntries: {
      dailyChallenge: capability.DailyChallengeCapability,
      rewardedAd: platformAvailable && capability.RewardedAdCapability,
      commerce: platformAvailable && capability.CommerceCapability,
      share: platformAvailable && capability.ShareCapability,
      aiNarrative: capability.AiNarrativeCapability
    },
    ...(view.currentInteraction === undefined ? {} : { titleKey: view.currentInteraction.titleKey }),
    optionLabels: view.currentInteraction?.options.map((option) => option.labelKey) ?? []
  };
}

/**
 * UI02 platform-neutral intent mapping.
 *
 * The shell turns an already-projected, server-authoritative public entry into a GameCommand intent.
 * It performs no rule calculation of any kind: it does not compute eligibility, difficulty, odds,
 * cost or outcome. It only reads the projected availability flag and emits the matching command.
 */
export const CORE_ACTION_IDS = ["cultivate", "travel", "worldly", "pursuit"] as const;
export type CoreActionId = (typeof CORE_ACTION_IDS)[number];

export interface ShellIntent {
  intentId: string;
  labelKey: string;
  command: GameCommand;
  enabled: boolean;
}

function isCoreActionId(value: unknown): value is CoreActionId {
  return typeof value === "string" && (CORE_ACTION_IDS as readonly string[]).includes(value);
}

function projectedEntries(view: PublicViewModel, key: string): Record<string, PublicJson>[] {
  const value: PublicJson | undefined = view.state.publicRun[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, PublicJson> => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

/** Bounded to the four core action ids. Unknown or malformed projections are dropped, never guessed. */
export function mapCoreActionIntents(view: PublicViewModel): ShellIntent[] {
  return projectedEntries(view, "actions").flatMap((entry): ShellIntent[] => {
    if (!isCoreActionId(entry.actionId)) return [];
    return [{
      intentId: `core.${entry.actionId}`,
      labelKey: typeof entry.labelKey === "string" ? entry.labelKey : `action.${entry.actionId}`,
      command: { type: "CHOOSE_ACTION", actionId: entry.actionId },
      enabled: entry.enabled === true
    }];
  });
}

/**
 * Emits ATTEMPT_BREAKTHROUGH only from the server-projected public availability flag.
 * No client-side score, difficulty, modifier, RNG or outcome field is ever produced.
 */
export function mapSpecialActionIntents(view: PublicViewModel): ShellIntent[] {
  return projectedEntries(view, "specialActions").flatMap((entry): ShellIntent[] => {
    if (entry.actionId !== "attemptBreakthrough") return [];
    return [{
      intentId: "special.attemptBreakthrough",
      labelKey: typeof entry.labelKey === "string" ? entry.labelKey : "special.attemptBreakthrough",
      command: { type: "ATTEMPT_BREAKTHROUGH" },
      enabled: entry.available === true
    }];
  });
}

export interface ArchiveEntryView { entryId: string; kind: string; titleKey: string; summaryKey: string; data?: Record<string, PublicJson> }
export interface ArchiveCauseView { publicId: string; level: "explicit" | "hinted"; titleKey?: string; summaryKey: string }
export interface ArchiveBuildView { buildId: string; displayName?: string; stage: string; labelKey: string; dominant: boolean }
export interface ArchivePersonView { npcId: string; displayName: string; knownRoles: string[]; knownStatus: string; milestones: PublicJson[] }

/**
 * UI02 LIFE_ARCHIVE presentation projection: read-only, and a pure selection over the already-public
 * ViewModel. Hidden Causes are never sent by the server, so they cannot appear here even by accident;
 * this builder never re-derives or re-interprets Cause visibility.
 */
export interface WeChatArchiveModel {
  readOnly: true;
  runName?: string;
  history: ArchiveEntryView[];
  causes: ArchiveCauseView[];
  builds: ArchiveBuildView[];
  people: ArchivePersonView[];
  death?: Record<string, PublicJson>;
}

function asRecords(value: PublicJson | undefined): Record<string, PublicJson>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, PublicJson> => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}
const str = (value: PublicJson | undefined): string | undefined => (typeof value === "string" ? value : undefined);

export function buildArchiveView(view: PublicViewModel): WeChatArchiveModel {
  const run = view.state.publicRun;
  return {
    readOnly: true,
    ...(str(run.runName) === undefined ? {} : { runName: str(run.runName) as string }),
    history: view.history.entries.map((entry) => ({ entryId: entry.entryId, kind: entry.kind, titleKey: entry.titleKey, summaryKey: entry.summaryKey, ...(entry.data === undefined ? {} : { data: entry.data }) })),
    causes: view.state.publicCauses.map((cause) => ({ publicId: cause.publicId, level: cause.level, ...(cause.titleKey === undefined ? {} : { titleKey: cause.titleKey }), summaryKey: cause.summaryKey })),
    builds: asRecords(run.builds).flatMap((entry): ArchiveBuildView[] => {
      const buildId = str(entry.buildId);
      if (buildId === undefined) return [];
      return [{ buildId, ...(str(entry.displayName) === undefined ? {} : { displayName: str(entry.displayName) as string }), stage: str(entry.stage) ?? "latent", labelKey: str(entry.labelKey) ?? `build.${buildId}.latent`, dominant: entry.dominant === true }];
    }),
    people: asRecords(run.people).flatMap((entry): ArchivePersonView[] => {
      const npcId = str(entry.npcId);
      if (npcId === undefined) return [];
      return [{ npcId, displayName: str(entry.displayName) ?? npcId, knownRoles: Array.isArray(entry.knownRoles) ? entry.knownRoles.filter((role): role is string => typeof role === "string") : [], knownStatus: str(entry.knownStatus) ?? "unknown", milestones: Array.isArray(entry.milestones) ? entry.milestones : [] }];
    }),
    ...(run.death === undefined || typeof run.death !== "object" || Array.isArray(run.death) ? {} : { death: run.death as Record<string, PublicJson> })
  };
}

/* ================================================================================================
 * UI03 — WeChat 2.0 live session controller
 *
 * Presentation/session orchestration only. The controller:
 *   - loads the authoritative PublicViewModel through the injected ApplicationTransport;
 *   - turns a player intent into a GameCommand *only* by selecting an entry the server has already
 *     projected (core action / special action) or by reading the authoritative currentInteraction;
 *   - submits through CommandSubmissionController, which stays the single owner of the envelope,
 *     commandId, pending persistence, retry and STATE_CONFLICT reconfirmation semantics;
 *   - projects the next page model from the refreshed authoritative ViewModel.
 *
 * It never rolls RNG, never resolves an outcome, never computes eligibility/risk/breakthrough odds and
 * never mutates RuleState. Every gameplay page transition comes from a refreshed PublicViewModel.
 * See docs/UI03_LIVE_CONTROLLER.md.
 * ============================================================================================== */

export interface WeChatRunSession { playerId: string; runId: string; rulesVersion: string; contentVersion: string; clientBuild: string }

/**
 * The injected WeChat synchronous storage surface. The adapter is a *boundary*: the platform host
 * passes its own implementation (in a WeChat page, the `wx` storage functions) so this package never
 * references a platform global and Core/ViewModel code never sees one either.
 */
export interface WeChatStorageApi { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }

/** Binds the injected WeChat storage API to the platform-neutral PlatformStorage port. */
export function createWeChatPlatformStorage(api: WeChatStorageApi): PlatformStorage {
  return {
    getLocal(key: string): Promise<string | null> {
      // wx.getStorageSync returns "" (and in some hosts undefined) for a key that was never written.
      const value = api.getStorageSync(key);
      return Promise.resolve(typeof value === "string" && value.length > 0 ? value : null);
    },
    setLocal(key: string, value: string): Promise<void> { api.setStorageSync(key, value); return Promise.resolve(); }
  };
}

/** Raised when an intent names something the authoritative ViewModel does not currently enable. */
export class IntentUnavailableError extends Error {
  constructor(intent: string, reason: string) { super(`intent ${intent} is unavailable: ${reason}`); this.name = "IntentUnavailableError"; }
}
/** Raised when the read-only LIFE_ARCHIVE side page is not a legal local navigation from here. */
export class ArchiveUnavailableError extends Error {
  constructor(reason: string) { super(`LIFE_ARCHIVE is unavailable: ${reason}`); this.name = "ArchiveUnavailableError"; }
}

/**
 * A player intent, named the way the projection names it. The controller resolves it against the
 * *current* authoritative ViewModel at submission (and at reconfirmation) time, so a reconfirmation
 * after STATE_CONFLICT is automatically re-derived from the latest state.
 */
export type WeChatRunIntent =
  | { kind: "coreAction"; intentId: string }
  | { kind: "specialAction"; intentId: string }
  | { kind: "interactionOption"; optionId: string };

export interface WeChatDecisionView {
  interactionId: string;
  kind: CurrentInteraction["kind"];
  /** Authoritative current-event id published by the server; the only source of an EVENT command's eventId. */
  eventId?: string;
  titleKey: string;
  /**
   * UI04C — the authoritative public body of the interaction, passed through verbatim.
   *
   * The surface needs it to render what the server actually published: the destiny-offer candidate
   * list (innate: `selectionId` / spiritual root / talent / major destiny; legacy: `id` / profile /
   * title / advantage / cost / hook), and an event's public `bodyKey` plus participant slot names.
   * It is the same already-public projection `CurrentInteraction.body` carries, so passing it through
   * exposes no new field and lets the START_RUN derivation read the offer from the authoritative
   * source instead of a client-side guess. No label, outcome, eligibility, odds or id is computed here.
   */
  body: PublicJson;
  options: PublicOption[];
  interactionState: InteractionState;
}

export interface WeChatRunPageModel {
  pageState: PageState;
  runStatus: PublicState["runStatus"];
  stateVersion: number;
  shell: WeChatPageShellModel;
  coreIntents: ShellIntent[];
  specialIntents: ShellIntent[];
  interaction?: WeChatDecisionView;
  /** True only while the read-only LIFE_ARCHIVE overlay is open *over* an authoritative RUN_HOME. */
  archiveOpen: boolean;
  archive?: WeChatArchiveModel;
}

export interface WeChatRunControllerOptions {
  transport: ApplicationTransport;
  storage: PlatformStorage;
  session: WeChatRunSession;
  commandIdFactory: () => string;
  initialView?: PublicViewModel;
}

export class WeChatRunController {
  readonly #transport: ApplicationTransport;
  readonly #storage: PlatformStorage;
  readonly #session: WeChatRunSession;
  readonly #commandIdFactory: () => string;
  #submission: CommandSubmissionController;
  #archiveOpen = false;

  constructor(options: WeChatRunControllerOptions) {
    this.#transport = options.transport;
    this.#storage = options.storage;
    this.#session = options.session;
    this.#commandIdFactory = options.commandIdFactory;
    this.#submission = this.#newSubmission(options.initialView);
  }

  #newSubmission(view: PublicViewModel | undefined): CommandSubmissionController {
    return new CommandSubmissionController({
      transport: this.#transport,
      storage: this.#storage,
      session: this.#session,
      commandIdFactory: this.#commandIdFactory,
      ...(view === undefined ? {} : { initialView: view })
    });
  }

  /** Loads the authoritative ViewModel. The client's only source of a page state. */
  async load(): Promise<PublicViewModel> {
    if (this.#submission.snapshot().mutuallyExclusiveLocked) throw new SubmissionLockedError();
    const view = (await this.#transport.fetchView(this.#session.runId)) as PublicViewModel;
    this.#submission = this.#newSubmission(view);
    this.#archiveOpen = false;
    return view;
  }

  /** Restart recovery: reconnect to the authoritative state and to any still-pending command. */
  async restore(): Promise<void> {
    if (this.#submission.snapshot().view === undefined) await this.load();
    await this.#submission.restorePending();
  }

  view(): PublicViewModel | undefined { return this.#submission.snapshot().view; }
  submission(): SubmissionSnapshot { return this.#submission.snapshot(); }

  pageModel(): WeChatRunPageModel {
    const view = this.#requireView(); const submission = this.#submission.snapshot(); const interaction = view.currentInteraction;
    // The archive overlay is a *local read-only side page of RUN_HOME*. If the authoritative page state
    // moved on, the overlay is simply not part of the next model — no local state can keep it alive.
    const archiveOpen = this.#archiveOpen && view.state.pageState === "RUN_HOME";
    return {
      pageState: view.state.pageState,
      runStatus: view.state.runStatus,
      stateVersion: view.state.stateVersion,
      shell: buildWeChatPageShell(view, { ...submission, interactionState: this.#effectiveInteractionState(view) }),
      coreIntents: mapCoreActionIntents(view),
      specialIntents: mapSpecialActionIntents(view),
      ...(interaction === undefined ? {} : {
        interaction: {
          interactionId: interaction.interactionId,
          kind: interaction.kind,
          ...(interaction.eventId === undefined ? {} : { eventId: interaction.eventId }),
          titleKey: interaction.titleKey,
          body: interaction.body,
          options: interaction.options.map((option) => ({
            ...option,
            ...(option.riskPresentation === undefined ? {} : { riskPresentation: { ...option.riskPresentation, reasons: [...option.riskPresentation.reasons] } })
          })),
          interactionState: interaction.interactionState
        }
      }),
      archiveOpen,
      ...(archiveOpen ? { archive: buildArchiveView(view) } : {})
    };
  }

  /** Opens the read-only LIFE_ARCHIVE side page. Local navigation only: it submits nothing. */
  openArchive(): WeChatRunPageModel {
    const view = this.#requireView();
    if (view.state.pageState !== "RUN_HOME") throw new ArchiveUnavailableError(`the authoritative page state is ${view.state.pageState}, not RUN_HOME`);
    if (this.#submission.snapshot().mutuallyExclusiveLocked) throw new ArchiveUnavailableError("a command submission is in flight");
    this.#archiveOpen = true;
    return this.pageModel();
  }

  closeArchive(): WeChatRunPageModel { this.#archiveOpen = false; return this.pageModel(); }

  async submit(intent: WeChatRunIntent): Promise<CommandResult> { return await this.#submission.submit(this.#commandFor(intent)); }

  /** Explicit player reconfirmation after STATE_CONFLICT: a fresh commandId against the latest stateVersion. */
  async reconfirm(intent: WeChatRunIntent): Promise<CommandResult> { return await this.#submission.reconfirm(this.#commandFor(intent)); }

  /** Retry of a transient failure: the identical envelope (same commandId and payload) is re-sent. */
  async retry(): Promise<CommandResult> { return await this.#submission.retry(); }

  #requireView(): PublicViewModel {
    const view = this.#submission.snapshot().view;
    if (view === undefined) throw new Error("the authoritative ViewModel must be loaded before this operation");
    return view;
  }

  /**
   * The interaction state the surface must actually act on.
   *
   * `CommandSubmissionController` reports the state of the *command* it last handled, and it reports
   * `confirmed` after a command has settled. But whether the decision on screen is still open is an
   * authoritative fact, not a client memory: when a submission lands, the refreshed ViewModel carries
   * the *next* interaction (or none at all). So `confirmed` must never be projected onto whatever
   * interaction happens to be on screen — otherwise an action that produced a fresh, unresolved EVENT
   * would hand the player an ordinary back out of it, which the page-state contract forbids.
   * Client-side in-flight/failure states are still the client's to report.
   */
  #effectiveInteractionState(view: PublicViewModel): InteractionState {
    const state = this.#submission.snapshot().interactionState;
    if (state === "submitting" || state === "retryableError" || state === "fatalError") return state;
    return view.currentInteraction?.interactionState ?? "idle";
  }

  /**
   * Resolves an intent against the current authoritative ViewModel. Fails closed: an intent the server
   * has not projected (or has projected as unavailable), an option the current interaction does not
   * offer, or an interaction whose authoritative event id was not published all raise instead of
   * producing a command. No id, eligibility, risk or outcome is ever fabricated here.
   */
  #commandFor(intent: WeChatRunIntent): GameCommand {
    const view = this.#requireView();
    if (intent.kind === "coreAction") {
      const entry = mapCoreActionIntents(view).find((candidate) => candidate.intentId === intent.intentId);
      if (entry === undefined) throw new IntentUnavailableError(intent.intentId, "the authoritative ViewModel does not project this core action");
      if (entry.enabled !== true) throw new IntentUnavailableError(intent.intentId, "the authoritative ViewModel projects this core action as disabled");
      return entry.command;
    }
    if (intent.kind === "specialAction") {
      const entry = mapSpecialActionIntents(view).find((candidate) => candidate.intentId === intent.intentId);
      if (entry === undefined) throw new IntentUnavailableError(intent.intentId, "the authoritative ViewModel does not project this special action");
      if (entry.enabled !== true) throw new IntentUnavailableError(intent.intentId, "the authoritative ViewModel projects this special action as unavailable");
      return entry.command;
    }
    const pageState = view.state.pageState;
    const interaction = view.currentInteraction;
    // UI04C — DESTINY_OFFER selection. The offer is *pre-run*: the server publishes the offer as the
    // authoritative `currentInteraction` (interactionId === the run's offerId), with one option per
    // offered candidate. START_RUN is therefore derived strictly from that projection: the chosen
    // option must be one the server offered, and the candidate that owns it supplies the id the
    // reducer expects (innate offers key on `selectionId`, legacy offers on `destinyId`). A candidate
    // is never invented, and an ambiguous or unpublished body fails closed.
    if (pageState === "DESTINY_OFFER") {
      if (interaction === undefined || interaction.kind !== "destinyOffer") throw new IntentUnavailableError("interactionOption", "the authoritative DESTINY_OFFER page state carries no destiny offer");
      if (!interaction.options.some((option) => option.optionId === intent.optionId)) throw new IntentUnavailableError(intent.optionId, "the authoritative destiny offer does not offer this selection");
      const candidate = offerCandidateFor(interaction.body, intent.optionId);
      if (candidate === undefined) throw new IntentUnavailableError(intent.optionId, "the authoritative destiny offer does not publish exactly one candidate for this selection");
      if (candidate.selectionId !== undefined) return { type: "START_RUN", offerId: interaction.interactionId, selectionId: candidate.selectionId };
      if (candidate.destinyId !== undefined) return { type: "START_RUN", offerId: interaction.interactionId, destinyId: candidate.destinyId };
      throw new IntentUnavailableError(intent.optionId, "the authoritative destiny candidate publishes neither a selectionId nor a destinyId");
    }
    if (pageState !== "EVENT" && pageState !== "SPECIAL_NODE") throw new IntentUnavailableError("interactionOption", `the authoritative page state is ${pageState}, which carries no submittable interaction`);
    if (interaction === undefined) throw new IntentUnavailableError("interactionOption", "the authoritative page state carries no current interaction");
    if (interaction.eventId === undefined) throw new IntentUnavailableError("interactionOption", "the server did not publish the authoritative event id for this interaction");
    if (!interaction.options.some((option) => option.optionId === intent.optionId)) throw new IntentUnavailableError(intent.optionId, "the authoritative current interaction does not offer this option");
    return { type: "CHOOSE_EVENT_OPTION", eventId: interaction.eventId, optionId: intent.optionId };
  }
}

/** One authoritative destiny-offer candidate, reduced to the two ids a START_RUN may be derived from. */
interface OfferCandidateIds { selectionId?: string; destinyId?: string }

/**
 * Finds the single authoritative candidate that owns `optionId` in a destiny-offer body.
 *
 * The server publishes one option per offered candidate and the option id *is* that candidate's public
 * id: a PROG01 innate offer keys on `selectionId`, a legacy offer keys on the destiny `id`. Exactly one
 * candidate may own the selection — zero (a selection the offer does not publish) or more than one (an
 * ambiguous body) both fail closed, and a candidate that published both ids is refused rather than
 * guessed at. Nothing here invents an id or reads a rule value.
 */
function offerCandidateFor(body: PublicJson, optionId: string): OfferCandidateIds | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const candidates = (body as Record<string, PublicJson>).candidates;
  if (!Array.isArray(candidates)) return undefined;
  const matches: OfferCandidateIds[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, PublicJson>;
    const selectionId = typeof record.selectionId === "string" ? record.selectionId : undefined;
    const destinyId = typeof record.id === "string" ? record.id : undefined;
    if (selectionId !== optionId && destinyId !== optionId) continue;
    matches.push({ ...(selectionId === undefined ? {} : { selectionId }), ...(destinyId === undefined ? {} : { destinyId }) });
  }
  if (matches.length !== 1) return undefined;
  const only = matches[0];
  if (only.selectionId !== undefined && only.destinyId !== undefined) return undefined;
  return only;
}

/* ================================================================================================
 * UI04C — WeChat cloud RPC transport boundary, strict response validation and run bootstrap
 *
 * The live client reaches the authoritative server through the *injected* cloud-call API the host
 * page supplies, exactly as `createWeChatPlatformStorage` takes the host's synchronous storage
 * functions. This module therefore still references no platform global: it never names a `wx`/`tt`
 * object, it only calls the function it was handed. That is what lets a real page bind the WeChat
 * cloud host while the neutral package stays platform-free.
 *
 * The RPC surface is small and strict, and the adapter is fail-closed. Nothing the server returns is
 * trusted before it has been validated:
 *
 *   operation "createRunOffer"  -> { runId, playerId, rulesVersion, contentVersion, view: PublicViewModel }
 *                                  request may carry `{ bootstrapId }` (UI04D), a locally persisted
 *                                  recovery key: same device + same bootstrapId => same offered run
 *   operation "fetchView"       -> { view: PublicViewModel }
 *   operation "sendCommand"     -> CommandResult
 *
 * A response that is not exactly one of those shapes is rejected with `TransportProtocolError` rather
 * than passed on, and a response that carries server-only state (`rootSeed`, RNG state, a hidden
 * Cause, a check spec, difficulty, an internal trace, ...) is refused outright. The bootstrap the
 * client keeps is therefore only the authoritative public session metadata plus the authoritative
 * PublicViewModel — there is no second, client-side source of run truth. See docs/UI04C_LIVE_CLIENT.md.
 * ============================================================================================== */

export const CLOUD_RPC_OPERATIONS = ["createRunOffer", "fetchView", "sendCommand"] as const;
export type CloudRpcOperation = (typeof CLOUD_RPC_OPERATIONS)[number];

/** The cloud function the page binds by default when it does not name one. */
export const DEFAULT_CLOUD_FUNCTION_NAME = "tianfu2";

/** Raised when an RPC response is not the documented public shape, or carries server-only state. */
export class TransportProtocolError extends Error {
  constructor(message: string) { super(`rpc protocol violation: ${message}`); this.name = "TransportProtocolError"; }
}

/**
 * The injected cloud-call API. A WeChat host binds its own cloud function caller here; tests inject a
 * fake. Only `callFunction` is required, and only the `{ name, data }` request and a `result`-bearing
 * response are used, so the adapter does not depend on any host-specific extra field.
 */
export interface WeChatCloudCallApi {
  callFunction(input: { name: string; data: Record<string, unknown> }): Promise<unknown>;
}

export interface WeChatCloudTransportOptions {
  api: WeChatCloudCallApi;
  cloudFunctionName?: string;
}

/**
 * The validated result of the `createRunOffer` bootstrap RPC.
 *
 * UI04D: `playerId` joined this payload. It is the *server's* authoritative, opaque handle — derived from
 * the trusted WeChat OPENID and never the OPENID itself — because the command contract keys every
 * envelope and every ownership check on the same id the server will compare against. A client that
 * invented its own player id could not submit a command at all, so the value has to come from here.
 */
export interface WeChatRunOfferResult {
  runId: string;
  playerId: string;
  rulesVersion: string;
  contentVersion: string;
  view: PublicViewModel;
}

/**
 * What a live page supplies to bootstrap a run.
 *
 * `bootstrapId` is a *locally generated and persisted recovery key*, not an identity: the same device
 * re-sends it after a reload or a retry so the server returns the same offered run instead of
 * manufacturing another one. It says nothing about who the player is — that comes back from the server.
 */
export interface WeChatRunBootstrapInput {
  transport: ApplicationTransport;
  bootstrapId?: string;
  clientBuild: string;
}

/** What a live page needs to construct `WeChatRunController`: the session plus the authoritative view. */
export interface WeChatRunBootstrap {
  session: WeChatRunSession;
  view: PublicViewModel;
}

const PAGE_STATES: readonly string[] = ["START", "MODE_SELECT", "DESTINY_OFFER", "RUN_OPENING", "RUN_HOME", "EVENT", "SPECIAL_NODE", "LIFE_ARCHIVE", "ENDING", "LIFE_BOOK", "REBIRTH_RESULT", "NEXT_LIFE"];
const RUN_STATUSES: readonly string[] = ["offered", "active", "dying", "ended", "abandoned"];
const INTERACTION_STATES: readonly string[] = ["idle", "submitting", "confirmed", "retryableError", "fatalError"];
const INTERACTION_KINDS: readonly string[] = ["destinyOffer", "event", "specialNode", "ending", "rebirth"];
const applicationErrorCodes: readonly string[] = APP_ERROR_CODES;

/**
 * Server-only keys that must never reach the client. The ViewModel contract names these explicitly
 * (rootSeed / RNG state / hidden Causes / check spec / difficulty / internal trace / ...); none of them
 * is a legitimate member of the public projection, so finding one means the boundary is broken and the
 * response is refused rather than partially trusted.
 */
const FORBIDDEN_RESPONSE_KEYS: readonly string[] = [
  "rootSeed", "rng", "rngState", "drawIndex", "echoBudget", "salience", "selectorWeights",
  "futureEventIds", "checkSpec", "difficulty", "effectSpec", "internalTrace", "antiCheat",
  "hiddenCause", "hiddenCauses", "specialNotes", "serverSecret",
  // UI04D: the WeChat OPENID is the server's identity source and the client has no legitimate use for it.
  // A response that carries one is a boundary bug at best and an identity leak at worst, so it is refused
  // exactly like a leaked rootSeed rather than ignored.
  "openid", "openId", "OPENID", "unionid", "unionId", "UNIONID"
];
const MAX_RESPONSE_DEPTH = 64;
/** Identifier length limit, mirroring the server gateway's own bound so both sides reject the same input. */
const MAX_IDENTIFIER_LENGTH = 128;

function rpcRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TransportProtocolError(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function rpcString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TransportProtocolError(`${path} must be a non-empty string`);
  return value;
}
function rpcInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TransportProtocolError(`${path} must be a non-negative safe integer`);
  return value;
}
function rpcEnum(value: unknown, allowed: readonly string[], path: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) throw new TransportProtocolError(`${path} is missing or not one of ${allowed.join("/")}`);
  return value;
}
function rpcArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TransportProtocolError(`${path} must be an array`);
  return value;
}

/** Walks a response and refuses any server-only key. Depth-capped so a hostile payload cannot hang the client. */
function assertNoServerSecrets(value: unknown, path: string, depth = 0): void {
  if (depth > MAX_RESPONSE_DEPTH) throw new TransportProtocolError(`${path} is nested deeper than ${MAX_RESPONSE_DEPTH} levels`);
  if (Array.isArray(value)) { for (let index = 0; index < value.length; index += 1) assertNoServerSecrets(value[index], `${path}[${index}]`, depth + 1); return; }
  if (typeof value !== "object" || value === null) return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_RESPONSE_KEYS.includes(key)) throw new TransportProtocolError(`${path}.${key} carries server-only state and is refused`);
    assertNoServerSecrets((value as Record<string, unknown>)[key], `${path}.${key}`, depth + 1);
  }
}

/** Validates an authoritative PublicViewModel. Structural only: it never computes or re-derives a value. */
export function parsePublicViewModel(value: unknown, path = "PublicViewModel"): PublicViewModel {
  const view = rpcRecord(value, path);
  assertNoServerSecrets(view, path);
  const state = rpcRecord(view.state, `${path}.state`);
  rpcInteger(state.schemaVersion, `${path}.state.schemaVersion`);
  rpcString(state.rulesVersion, `${path}.state.rulesVersion`);
  rpcString(state.contentVersion, `${path}.state.contentVersion`);
  rpcInteger(state.stateVersion, `${path}.state.stateVersion`);
  rpcString(state.runId, `${path}.state.runId`);
  rpcEnum(state.pageState, PAGE_STATES, `${path}.state.pageState`);
  rpcEnum(state.runStatus, RUN_STATUSES, `${path}.state.runStatus`);
  rpcRecord(state.publicRun, `${path}.state.publicRun`);
  rpcRecord(state.capabilities, `${path}.state.capabilities`);
  rpcArray(state.publicCauses, `${path}.state.publicCauses`);
  const history = rpcRecord(view.history, `${path}.history`);
  rpcArray(history.entries, `${path}.history.entries`);
  const share = rpcRecord(view.share, `${path}.share`);
  rpcString(share.title, `${path}.share.title`);
  if (typeof share.summary !== "string") throw new TransportProtocolError(`${path}.share.summary must be a string`);
  rpcArray(share.facts, `${path}.share.facts`);
  if (view.currentInteraction !== undefined) {
    const interaction = rpcRecord(view.currentInteraction, `${path}.currentInteraction`);
    rpcString(interaction.interactionId, `${path}.currentInteraction.interactionId`);
    rpcEnum(interaction.kind, INTERACTION_KINDS, `${path}.currentInteraction.kind`);
    rpcString(interaction.titleKey, `${path}.currentInteraction.titleKey`);
    rpcEnum(interaction.interactionState, INTERACTION_STATES, `${path}.currentInteraction.interactionState`);
    if (interaction.body === undefined) throw new TransportProtocolError(`${path}.currentInteraction.body is required`);
    if (interaction.eventId !== undefined) rpcString(interaction.eventId, `${path}.currentInteraction.eventId`);
    for (const option of rpcArray(interaction.options, `${path}.currentInteraction.options`)) {
      const entry = rpcRecord(option, `${path}.currentInteraction.options[]`);
      rpcString(entry.optionId, `${path}.currentInteraction.options[].optionId`);
      rpcString(entry.labelKey, `${path}.currentInteraction.options[].labelKey`);
    }
  }
  return value as PublicViewModel;
}

/** Validates a `CommandResult`. The controller never sees an unvalidated settlement wrapper. */
function parseCommandResult(value: unknown): CommandResult {
  const result = rpcRecord(value, "sendCommand result");
  if (typeof result.ok !== "boolean") throw new TransportProtocolError("sendCommand result.ok must be a boolean");
  const commandId = rpcString(result.commandId, "sendCommand result.commandId");
  const stateVersion = rpcInteger(result.stateVersion, "sendCommand result.stateVersion");
  if (result.ok === true) return { ok: true, commandId, stateVersion };
  const error = rpcRecord(result.error, "sendCommand result.error");
  const code = rpcString(error.code, "sendCommand result.error.code");
  if (!applicationErrorCodes.includes(code)) throw new TransportProtocolError("sendCommand result.error.code is not an application error code");
  const messageKey = rpcString(error.messageKey, "sendCommand result.error.messageKey");
  if (typeof error.retryable !== "boolean") throw new TransportProtocolError("sendCommand result.error.retryable must be a boolean");
  const applicationCode = code as AppErrorCode;
  return { ok: false, commandId, stateVersion, error: { code: applicationCode, messageKey, retryable: error.retryable } };
}

/** Validates the `createRunOffer` bootstrap payload, including that the view describes the same run. */
export function parseRunOfferResult(value: unknown): WeChatRunOfferResult {
  const record = rpcRecord(value, "createRunOffer result");
  // The whole payload is scanned, not just the view: a secret smuggled in beside the view would be just
  // as reachable to the page as one inside it.
  assertNoServerSecrets(record, "createRunOffer result");
  const runId = rpcString(record.runId, "createRunOffer result.runId");
  const playerId = rpcString(record.playerId, "createRunOffer result.playerId");
  if (playerId.length > MAX_IDENTIFIER_LENGTH) throw new TransportProtocolError("createRunOffer result.playerId is longer than the command identifier limit");
  const rulesVersion = rpcString(record.rulesVersion, "createRunOffer result.rulesVersion");
  const contentVersion = rpcString(record.contentVersion, "createRunOffer result.contentVersion");
  const view = parsePublicViewModel(record.view, "createRunOffer result.view");
  if (view.state.runId !== runId) throw new TransportProtocolError("createRunOffer result.runId does not match the returned ViewModel");
  if (view.state.rulesVersion !== rulesVersion) throw new TransportProtocolError("createRunOffer result.rulesVersion does not match the returned ViewModel");
  if (view.state.contentVersion !== contentVersion) throw new TransportProtocolError("createRunOffer result.contentVersion does not match the returned ViewModel");
  return { runId, playerId, rulesVersion, contentVersion, view };
}

/** Unwraps the host's `{ result, errMsg }` response. A missing result is a transport failure, not a payload. */
async function callCloud(api: WeChatCloudCallApi, name: string, data: Record<string, unknown>): Promise<unknown> {
  const response = await api.callFunction({ name, data });
  const record = rpcRecord(response, "cloud call response");
  if (!Object.hasOwn(record, "result")) throw new TransportProtocolError("cloud call response carries no result");
  return record.result;
}

/**
 * Binds the injected cloud-call API to the platform-neutral `ApplicationTransport` port.
 *
 * Every operation validates its payload before returning it: `sendCommand` returns a validated
 * `CommandResult`, `fetchView` returns a validated `PublicViewModel`, and `createRunOffer` returns the
 * validated bootstrap payload. A protocol violation throws, which the submission controller classifies
 * as a retryable transport failure — never as a settled command.
 */
export function createWeChatCloudTransport(options: WeChatCloudTransportOptions): ApplicationTransport {
  const api = options.api;
  if (api === null || typeof api !== "object" || typeof api.callFunction !== "function") throw new TransportProtocolError("the cloud call API must expose callFunction");
  const name = options.cloudFunctionName === undefined || options.cloudFunctionName.length === 0 ? DEFAULT_CLOUD_FUNCTION_NAME : options.cloudFunctionName;
  return {
    async sendCommand(command: CommandEnvelope<GameCommand>): Promise<CommandResult> {
      return parseCommandResult(await callCloud(api, name, { operation: "sendCommand", command }));
    },
    async fetchView(runId: string): Promise<unknown> {
      const result = rpcRecord(await callCloud(api, name, { operation: "fetchView", runId: rpcString(runId, "fetchView runId") }), "fetchView result");
      return parsePublicViewModel(result.view, "fetchView result.view");
    },
    async createRunOffer(options?: { bootstrapId?: string }): Promise<unknown> {
      // The bootstrap id is a recovery key, not an identity: it is only sent when the caller has one, so
      // the accepted UI04C payload shape (`{ operation }`) is still exactly what a caller without one sends.
      const bootstrapId = typeof options?.bootstrapId === "string" && options.bootstrapId.length > 0 ? options.bootstrapId : undefined;
      const data = bootstrapId === undefined ? { operation: "createRunOffer" } : { operation: "createRunOffer", bootstrapId };
      return parseRunOfferResult(await callCloud(api, name, data));
    }
  };
}

/**
 * Creates the session and authoritative starting view for a live client.
 *
 * The bootstrap is the client's only source of run truth — and since UI04D that includes the *player
 * identity*. The run id, the locked rules/content versions, the authoritative opaque playerId and the
 * initial PublicViewModel all come from the `createRunOffer` response. That is not a convenience: the
 * command contract keys every envelope on `playerId`, and the server compares it against the OPENID it
 * derived, so a client-invented identity could never submit a command. The client contributes exactly
 * two things of its own: the `clientBuild` string and a locally persisted `bootstrapId`, which lets a
 * retry or a reload recover the same run instead of manufacturing another one.
 *
 * The response is validated twice, deliberately: the cloud adapter refuses a bad RPC payload at the
 * boundary, and this function refuses a bad payload from any transport implementation, so an
 * unvalidated or secret-bearing response can never become the client's session.
 */
export async function bootstrapWeChatRun(input: WeChatRunBootstrapInput): Promise<WeChatRunBootstrap> {
  const clientBuild = rpcString(input.clientBuild, "bootstrap clientBuild");
  const bootstrapId = typeof input.bootstrapId === "string" && input.bootstrapId.length > 0 ? input.bootstrapId : undefined;
  const offer = parseRunOfferResult(await input.transport.createRunOffer(bootstrapId === undefined ? undefined : { bootstrapId }));
  return {
    session: { playerId: offer.playerId, runId: offer.runId, rulesVersion: offer.rulesVersion, contentVersion: offer.contentVersion, clientBuild },
    view: offer.view
  };
}
