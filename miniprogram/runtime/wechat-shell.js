// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/wechat-shell/src/index.ts
// Source sha256:   1e73f1cccd6e63037a3032bbcaadc91ace7fd051c7b6424403c57b54d5e67949
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
// UI04A: even the *type-only* command surface is taken from the client-safe wire boundary, so the
// shell package has no import of any kind — runtime or type — into gameplay Core.
                                                                                  
var { CommandSubmissionController, RetryUnavailableError, SubmissionLockedError, canOrdinaryBack } = require("./application-ui.js");
             
                       
                     
                   
            
                  
             
               
              
                 
                                              


                                       
                                                   
                             
                               
                                                                                                                            
                    
                         
 

function buildWeChatPageShell(view                 , submission                    )                       {
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
const CORE_ACTION_IDS = ["cultivate", "travel", "worldly", "pursuit"]         ;
                                                            

                              
                   
                   
                       
                   
 

function isCoreActionId(value         )                        {
  return typeof value === "string" && (CORE_ACTION_IDS                     ).includes(value);
}

function projectedEntries(view                 , key        )                               {
  const value                         = view.state.publicRun[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry)                                      => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}

/** Bounded to the four core action ids. Unknown or malformed projections are dropped, never guessed. */
function mapCoreActionIntents(view                 )                {
  return projectedEntries(view, "actions").flatMap((entry)                => {
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
function mapSpecialActionIntents(view                 )                {
  return projectedEntries(view, "specialActions").flatMap((entry)                => {
    if (entry.actionId !== "attemptBreakthrough") return [];
    return [{
      intentId: "special.attemptBreakthrough",
      labelKey: typeof entry.labelKey === "string" ? entry.labelKey : "special.attemptBreakthrough",
      command: { type: "ATTEMPT_BREAKTHROUGH" },
      enabled: entry.available === true
    }];
  });
}

                                                                                                                                            
                                                                                                                           
                                                                                                                               
                                                                                                                                              

/**
 * UI02 LIFE_ARCHIVE presentation projection: read-only, and a pure selection over the already-public
 * ViewModel. Hidden Causes are never sent by the server, so they cannot appear here even by accident;
 * this builder never re-derives or re-interprets Cause visibility.
 */
                                     
                 
                   
                              
                             
                             
                              
                                     
 

function asRecords(value                        )                               {
  if (!Array.isArray(value)) return [];
  return value.filter((entry)                                      => entry !== null && typeof entry === "object" && !Array.isArray(entry));
}
const str = (value                        )                     => (typeof value === "string" ? value : undefined);

function buildArchiveView(view                 )                     {
  const run = view.state.publicRun;
  return {
    readOnly: true,
    ...(str(run.runName) === undefined ? {} : { runName: str(run.runName)           }),
    history: view.history.entries.map((entry) => ({ entryId: entry.entryId, kind: entry.kind, titleKey: entry.titleKey, summaryKey: entry.summaryKey, ...(entry.data === undefined ? {} : { data: entry.data }) })),
    causes: view.state.publicCauses.map((cause) => ({ publicId: cause.publicId, level: cause.level, ...(cause.titleKey === undefined ? {} : { titleKey: cause.titleKey }), summaryKey: cause.summaryKey })),
    builds: asRecords(run.builds).flatMap((entry)                     => {
      const buildId = str(entry.buildId);
      if (buildId === undefined) return [];
      return [{ buildId, ...(str(entry.displayName) === undefined ? {} : { displayName: str(entry.displayName)           }), stage: str(entry.stage) ?? "latent", labelKey: str(entry.labelKey) ?? `build.${buildId}.latent`, dominant: entry.dominant === true }];
    }),
    people: asRecords(run.people).flatMap((entry)                      => {
      const npcId = str(entry.npcId);
      if (npcId === undefined) return [];
      return [{ npcId, displayName: str(entry.displayName) ?? npcId, knownRoles: Array.isArray(entry.knownRoles) ? entry.knownRoles.filter((role)                 => typeof role === "string") : [], knownStatus: str(entry.knownStatus) ?? "unknown", milestones: Array.isArray(entry.milestones) ? entry.milestones : [] }];
    }),
    ...(run.death === undefined || typeof run.death !== "object" || Array.isArray(run.death) ? {} : { death: run.death                               })
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

                                                                                                                                        

/**
 * The injected WeChat synchronous storage surface. The adapter is a *boundary*: the platform host
 * passes its own implementation (in a WeChat page, the `wx` storage functions) so this package never
 * references a platform global and Core/ViewModel code never sees one either.
 */
                                                                                                                             

/** Binds the injected WeChat storage API to the platform-neutral PlatformStorage port. */
function createWeChatPlatformStorage(api                  )                  {
  return {
    getLocal(key        )                         {
      // wx.getStorageSync returns "" (and in some hosts undefined) for a key that was never written.
      const value = api.getStorageSync(key);
      return Promise.resolve(typeof value === "string" && value.length > 0 ? value : null);
    },
    setLocal(key        , value        )                { api.setStorageSync(key, value); return Promise.resolve(); }
  };
}

/** Raised when an intent names something the authoritative ViewModel does not currently enable. */
class IntentUnavailableError extends Error {
  constructor(intent        , reason        ) { super(`intent ${intent} is unavailable: ${reason}`); this.name = "IntentUnavailableError"; }
}
/** Raised when the read-only LIFE_ARCHIVE side page is not a legal local navigation from here. */
class ArchiveUnavailableError extends Error {
  constructor(reason        ) { super(`LIFE_ARCHIVE is unavailable: ${reason}`); this.name = "ArchiveUnavailableError"; }
}

/**
 * A player intent, named the way the projection names it. The controller resolves it against the
 * *current* authoritative ViewModel at submission (and at reconfirmation) time, so a reconfirmation
 * after STATE_CONFLICT is automatically re-derived from the latest state.
 */
                             
                                            
                                               
                                                    

                                     
                        
                                   
                                                                                                               
                   
                   
                          
                                     
 

                                     
                       
                                      
                       
                              
                             
                                
                                   
                                                                                                     
                       
                               
 

                                             
                                  
                           
                            
                                 
                                
 

class WeChatRunController {
           #transport                      ;
           #storage                 ;
           #session                  ;
           #commandIdFactory              ;
  #submission                             ;
  #archiveOpen = false;

  constructor(options                            ) {
    this.#transport = options.transport;
    this.#storage = options.storage;
    this.#session = options.session;
    this.#commandIdFactory = options.commandIdFactory;
    this.#submission = this.#newSubmission(options.initialView);
  }

  #newSubmission(view                             )                              {
    return new CommandSubmissionController({
      transport: this.#transport,
      storage: this.#storage,
      session: this.#session,
      commandIdFactory: this.#commandIdFactory,
      ...(view === undefined ? {} : { initialView: view })
    });
  }

  /** Loads the authoritative ViewModel. The client's only source of a page state. */
  async load()                           {
    if (this.#submission.snapshot().mutuallyExclusiveLocked) throw new SubmissionLockedError();
    const view = (await this.#transport.fetchView(this.#session.runId))                   ;
    this.#submission = this.#newSubmission(view);
    this.#archiveOpen = false;
    return view;
  }

  /** Restart recovery: reconnect to the authoritative state and to any still-pending command. */
  async restore()                {
    if (this.#submission.snapshot().view === undefined) await this.load();
    await this.#submission.restorePending();
  }

  view()                              { return this.#submission.snapshot().view; }
  submission()                     { return this.#submission.snapshot(); }

  pageModel()                     {
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
  openArchive()                     {
    const view = this.#requireView();
    if (view.state.pageState !== "RUN_HOME") throw new ArchiveUnavailableError(`the authoritative page state is ${view.state.pageState}, not RUN_HOME`);
    if (this.#submission.snapshot().mutuallyExclusiveLocked) throw new ArchiveUnavailableError("a command submission is in flight");
    this.#archiveOpen = true;
    return this.pageModel();
  }

  closeArchive()                     { this.#archiveOpen = false; return this.pageModel(); }

  async submit(intent                 )                         { return await this.#submission.submit(this.#commandFor(intent)); }

  /** Explicit player reconfirmation after STATE_CONFLICT: a fresh commandId against the latest stateVersion. */
  async reconfirm(intent                 )                         { return await this.#submission.reconfirm(this.#commandFor(intent)); }

  /** Retry of a transient failure: the identical envelope (same commandId and payload) is re-sent. */
  async retry()                         { return await this.#submission.retry(); }

  #requireView()                  {
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
  #effectiveInteractionState(view                 )                   {
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
  #commandFor(intent                 )              {
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
    if (pageState !== "EVENT" && pageState !== "SPECIAL_NODE") throw new IntentUnavailableError("interactionOption", `the authoritative page state is ${pageState}, which carries no submittable interaction`);
    const interaction = view.currentInteraction;
    if (interaction === undefined) throw new IntentUnavailableError("interactionOption", "the authoritative page state carries no current interaction");
    if (interaction.eventId === undefined) throw new IntentUnavailableError("interactionOption", "the server did not publish the authoritative event id for this interaction");
    if (!interaction.options.some((option) => option.optionId === intent.optionId)) throw new IntentUnavailableError(intent.optionId, "the authoritative current interaction does not offer this option");
    return { type: "CHOOSE_EVENT_OPTION", eventId: interaction.eventId, optionId: intent.optionId };
  }
}

module.exports = {
  RetryUnavailableError,
  SubmissionLockedError,
  buildWeChatPageShell,
  CORE_ACTION_IDS,
  mapCoreActionIntents,
  mapSpecialActionIntents,
  buildArchiveView,
  createWeChatPlatformStorage,
  IntentUnavailableError,
  ArchiveUnavailableError,
  WeChatRunController
};
