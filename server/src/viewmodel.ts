// UI04D: same narrowing as `destiny-offer.ts` — the content barrel also re-exports the audit/simulation
// tooling, which is development output and must stay out of the cloud function.
import type { ChoiceDefinition, ContentRegistry, EventDefinition } from "../../packages/content/src/registry.ts";
import { affinitySemantic, buildRiskPresentation, buildStage, debtSemantic, evaluateCondition, injuryLevel, threatDefinition, trustSemantic, validateGameState, type GameState } from "../../packages/core/src/index.ts";
import type {
  CapabilitySet,
  CurrentInteraction,
  InteractionState,
  KnownCapability,
  PageState,
  PublicCause,
  PublicHistory,
  PublicJson,
  PublicState,
  PublicViewModel,
  RiskPresentation,
  ShareViewModel
} from "../../packages/platform-contract/src/index.ts";
import type { StoredRun, TerminalSidecar } from "./gateway-store.ts";

const capabilityNames: KnownCapability[] = ["DailyChallengeCapability", "AdCapability", "RewardedAdCapability", "CommerceCapability", "ShareCapability", "AiNarrativeCapability", "PlatformCapability"];
const specialKinds = new Set(["combat", "breakthrough"]);
const riskLevels = new Set(["safe", "guarded", "dangerous", "unknown"]);
const riskTiers = new Set(["low", "caution", "dangerous", "lethal"]);

export interface ServerRiskPolicyInput { state: GameState; event: EventDefinition; choice: ChoiceDefinition }
export type ServerRiskPolicy = (input: ServerRiskPolicyInput) => RiskPresentation | undefined;
export interface ServerViewModelBuilderOptions { capabilities?: Partial<Record<KnownCapability, boolean>>; riskPolicy?: ServerRiskPolicy }

/**
 * UI02 special-action projection. This is a read-only *availability* projection, not a second rules
 * engine: it mirrors the authoritative reducer legality for ATTEMPT_BREAKTHROUGH
 * (active run, no pending interaction, cultivation complete, ordinary successor realm, configured
 * InnateProfile) using only authoritative state fields, and it never resolves anything.
 *
 * It deliberately exposes NO difficulty, odds, RNG, check spec, hidden modifier or score. The only
 * gameplay-adjacent data is the target realm display name, which is public presentation.
 */
export interface PublicSpecialAction {
  actionId: "attemptBreakthrough";
  kind: "breakthrough";
  available: boolean;
  labelKey: string;
  blockedReasonKey?: string;
  targetRealm?: { id: string; displayName: string };
}

function specialActions(state: GameState, content: ContentRegistry): PublicJson[] {
  const status = state.run.status;
  if (status !== "active" && status !== "dying") return [];
  if (state.run.identity.innateProfile === undefined) return [];
  const progression = content.getProgression(state.contentVersion);
  const realm = progression.realms.find((candidate) => candidate.id === state.run.realm.id);
  if (realm === undefined || realm.nextRealmId === undefined) return [];
  const target = progression.realms.find((candidate) => candidate.id === realm.nextRealmId);
  if (target === undefined) return [];
  const cultivation = state.run.realm.cultivationBps ?? state.run.realm.cultivation;
  const blockedReasonKey = status !== "active" ? "run.not_active"
    : state.run.events.current !== undefined ? "breakthrough.interaction_pending"
      : cultivation !== 10_000 ? "breakthrough.cultivation_incomplete"
        : realm.breakthroughDifficulty === undefined ? "breakthrough.unavailable"
          : undefined;
  const action: PublicSpecialAction = {
    actionId: "attemptBreakthrough", kind: "breakthrough", available: blockedReasonKey === undefined,
    labelKey: "special.attemptBreakthrough",
    ...(blockedReasonKey === undefined ? {} : { blockedReasonKey }),
    targetRealm: { id: target.id, displayName: target.displayName }
  };
  return [action as unknown as PublicJson];
}

function capabilities(value: ServerViewModelBuilderOptions["capabilities"]): CapabilitySet {
  return Object.fromEntries(capabilityNames.map((name) => [name, value?.[name] === true])) as unknown as CapabilitySet;
}
function sanitizeRisk(value: RiskPresentation | undefined): RiskPresentation | undefined {
  if (value === undefined || !riskTiers.has(value.tier) || typeof value.canBeFatal !== "boolean" || !Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string")) return undefined;
  return { tier: value.tier, canBeFatal: value.canBeFatal, reasons: [...value.reasons], ...(value.level !== undefined && riskLevels.has(value.level) ? { level: value.level } : {}), ...(typeof value.labelKey === "string" ? { labelKey: value.labelKey } : {}), ...(typeof value.detailKey === "string" ? { detailKey: value.detailKey } : {}) };
}

export function derivePageState(state: GameState, terminal?: TerminalSidecar): PageState {
  if (state.run.status === "offered") return "DESTINY_OFFER";
  // UI04E — terminal sidecar is authoritative when present: a run that has reached `LIFE_BOOK`,
  // `REBIRTH_RESULT` or `NEXT_LIFE` projects those exact pages, never the gameplay-derived fallback.
  // This is the only place terminal state may reach the public projection.
  if (terminal !== undefined) {
    if (terminal.stage === "LIFE_BOOK") return "LIFE_BOOK";
    if (terminal.stage === "REBIRTH_RESULT") return "REBIRTH_RESULT";
    if (terminal.stage === "NEXT_LIFE") return "NEXT_LIFE";
    if (terminal.stage === "ENDING") return "ENDING";
  }
  // A dying or ended run without an ENDING sidecar is an empty SPECIAL_NODE dead-end — never allowed:
  // the sidecar is created the moment authoritative gameplay declares end-of-life. Falling back to
  // ENDING here keeps the projection non-empty even on a legacy run that has no sidecar yet.
  if (state.run.status === "ended") return "ENDING";
  if (state.run.status === "abandoned") return "NEXT_LIFE";
  if (state.run.status === "dying") return "ENDING";
  const current = state.run.events.current; if (current === undefined) return "RUN_HOME";
  if (current.kind === "ending") return "ENDING";
  return specialKinds.has(current.kind) ? "SPECIAL_NODE" : "EVENT";
}

/** UI04E — minimal terminal projection: the authoritative stage plus already-public life/rebirth facts. */
export interface PublicTerminalProjection {
  stage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
  version: number;
  /** Only present on LIFE_BOOK: already-public history/builds/met-people/public-causes + ending/death facts. */
  lifeBook?: Record<string, PublicJson>;
  /** Only present on REBIRTH_RESULT: a public summary of the completed life and a `nextLifeAffordance` flag. */
  rebirthResult?: Record<string, PublicJson>;
  /** Only present on NEXT_LIFE: confirmation the prior run was kept and a new run document was opened. */
  nextLife?: Record<string, PublicJson>;
}

function buildPublicTerminal(state: GameState, content: ContentRegistry, terminal: TerminalSidecar | undefined, stage: PageState): PublicTerminalProjection | undefined {
  if (terminal === undefined) return undefined;
  const death = state.run.deathRecord; const ending = state.run.ending; const causeRelatedDeath = (() => { if (death?.sourceCauseId === undefined) return false; const knownCause = state.run.causes.byId[death.sourceCauseId]; return knownCause !== undefined && knownCause.visibility !== "hidden"; })();
  const locked = content.get(state.contentVersion);
  const publicMilestones = new Set(["firstEncounter", "majorRelationChange", "debtCreated", "debtResolved", "promotedToA", "statusRevealed", "causeLinked", "importantPromise", "majorConflict", "majorAid"]);
  const buildPack = locked.buildPackId === undefined ? undefined : content.getBuild(state.contentVersion); const npcPack = locked.npcPackId === undefined ? undefined : content.getNpc(state.contentVersion);
  const publicBuilds: PublicJson[] = buildPack === undefined ? [] : Object.values(state.run.build.affinities ?? {}).sort((left, right) => left.buildId.localeCompare(right.buildId)).map((affinity): PublicJson => { const definition = buildPack.definitions.find((candidate) => candidate.id === affinity.buildId); if (definition === undefined) return { buildId: affinity.buildId, stage: "latent", labelKey: "build.unknown" }; const bStage = buildStage(buildPack.rules, affinity.affinityBps); return { buildId: affinity.buildId, displayName: definition.displayName, stage: bStage, labelKey: definition.stages.find((candidate) => candidate.stage === bStage)?.labelKey ?? `build.${affinity.buildId}.${bStage}`, dominant: state.run.build.dominantBuildId === affinity.buildId }; });
  const publicPeople: PublicJson[] = npcPack === undefined ? [] : Object.values(state.run.npcs.byId).filter((npc) => npc.knowledge.met).sort((left, right) => left.npcId.localeCompare(right.npcId)).map((npc): PublicJson => ({ npcId: npc.npcId, displayName: npc.displayName, knownRoles: [...npc.roleTags], knownStatus: npc.knowledge.knownStatus ?? "unknown" }));
  const publicEvents = state.run.events.history.map((entry, index) => ({ entryId: `event:${index}`, eventId: entry.eventId, nodeIndex: entry.nodeIndex, ...(entry.resultTier === undefined ? {} : { resultTier: entry.resultTier }) }));
  const publicCauses = Object.values(state.run.causes.byId).filter((cause) => cause.visibility !== "hidden").sort((left, right) => left.causeId.localeCompare(right.causeId)).map((cause): PublicJson => ({ publicId: cause.causeId, level: cause.visibility === "journal" ? "explicit" : "hinted", ...(cause.visibility === "journal" ? { titleKey: `${cause.templateId}.title`, summaryKey: `${cause.templateId}.summary` } : { summaryKey: "cause.hinted.summary" }) }));

  const lifeBook: Record<string, PublicJson> = {
    runName: state.run.identity.runName,
    age: state.run.age,
    maxAge: state.run.maxAge,
    realm: { id: state.run.realm.id, order: state.run.realm.order, cultivation: state.run.realm.cultivation, ...(state.run.realm.cultivationBps === undefined ? {} : { cultivationBps: state.run.realm.cultivationBps }) },
    builds: publicBuilds,
    people: publicPeople,
    events: publicEvents,
    causes: publicCauses,
    ...(ending === undefined ? {} : { ending: { endingId: ending.endingId, age: ending.age, ...(ending.deathCause === undefined ? {} : { deathCause: ending.deathCause }) } }),
    ...(death === undefined ? {} : { death: { deathCauseId: death.deathCauseId, age: death.age, realmId: death.realmId, directCause: death.immediateSource, wasWarned: death.warningFacts.length > 0, causeRelatedDeath, category: death.category } })
  };

  const rebirthResult: Record<string, PublicJson> = {
    completedRunId: state.run.runId,
    runName: state.run.identity.runName,
    finalAge: state.run.age,
    finalRealm: { id: state.run.realm.id, order: state.run.realm.order },
    ...(ending?.endingId !== undefined ? { endingId: ending.endingId } : {}),
    ...(ending?.deathCause !== undefined ? { deathCause: ending.deathCause } : {}),
    peopleMet: publicPeople.length,
    buildsFormed: publicBuilds.filter((value) => value !== null && typeof value === "object" && (value as Record<string, PublicJson>).dominant === true).length,
    eventsExperienced: publicEvents.length,
    nextLifeAffordance: stage === "REBIRTH_RESULT" || stage === "NEXT_LIFE"
  };

  const nextLife: Record<string, PublicJson> = {
    completedRunId: state.run.runId,
    terminalStage: "NEXT_LIFE",
    terminalVersion: terminal.version
  };

  if (stage === "ENDING") return { stage: "ENDING", version: terminal.version, lifeBook };
  if (stage === "LIFE_BOOK") return { stage: "LIFE_BOOK", version: terminal.version, lifeBook };
  if (stage === "REBIRTH_RESULT") return { stage: "REBIRTH_RESULT", version: terminal.version, lifeBook, rebirthResult };
  if (stage === "NEXT_LIFE") return { stage: "NEXT_LIFE", version: terminal.version, lifeBook, rebirthResult, nextLife };
  return undefined;
}

function publicCauses(state: GameState): PublicCause[] {
  return Object.values(state.run.causes.byId).filter((cause) => cause.visibility !== "hidden").sort((left, right) => left.causeId.localeCompare(right.causeId)).map((cause) =>
    cause.visibility === "journal"
      ? { publicId: cause.causeId, level: "explicit", titleKey: `${cause.templateId}.title`, summaryKey: `${cause.templateId}.summary` }
      : { publicId: cause.causeId, level: "hinted", summaryKey: "cause.hinted.summary" });
}

function publicRun(state: GameState, content: ContentRegistry): Record<string, PublicJson> {
  const death = state.run.deathRecord; const knownCause = death?.sourceCauseId === undefined ? undefined : state.run.causes.byId[death.sourceCauseId]; const causeRelatedDeath = knownCause !== undefined && knownCause.visibility !== "hidden";
  const locked = content.get(state.contentVersion); const buildPack = locked.buildPackId === undefined ? undefined : content.getBuild(state.contentVersion); const publicBuilds: PublicJson[] = buildPack === undefined ? [] : Object.values(state.run.build.affinities ?? {}).sort((left, right) => left.buildId.localeCompare(right.buildId)).map((affinity): PublicJson => { const definition = buildPack.definitions.find((candidate) => candidate.id === affinity.buildId); if (definition === undefined) return { buildId: affinity.buildId, stage: "latent", labelKey: "build.unknown" }; const stage = buildStage(buildPack.rules, affinity.affinityBps); return { buildId: affinity.buildId, displayName: definition.displayName, stage, labelKey: definition.stages.find((candidate) => candidate.stage === stage)?.labelKey ?? `build.${affinity.buildId}.${stage}`, dominant: state.run.build.dominantBuildId === affinity.buildId }; });
  const npcPack = locked.npcPackId === undefined ? undefined : content.getNpc(state.contentVersion); const publicMilestones = new Set(["firstEncounter", "majorRelationChange", "debtCreated", "debtResolved", "promotedToA", "statusRevealed", "causeLinked", "importantPromise", "majorConflict", "majorAid"]); const people: PublicJson[] = npcPack === undefined ? [] : Object.values(state.run.npcs.byId).filter((npc) => npc.knowledge.met).sort((left, right) => left.npcId.localeCompare(right.npcId)).map((npc): PublicJson => ({ npcId: npc.npcId, publicRef: npc.npcId, displayName: npc.displayName, knownRoles: [...npc.roleTags], knownFactIds: [...npc.knowledge.knownFactIds], knownTraitTags: [...npc.knowledge.knownTraitTags], affinity: affinitySemantic(npc.relation.affinity, npcPack.rules), trust: trustSemantic(npc.relation.trust, npcPack.rules), debt: debtSemantic(npc.relation.debt), knownStatus: npc.knowledge.knownStatus ?? "unknown", ...(npc.knowledge.lastKnownAge === undefined ? {} : { lastKnownAge: npc.knowledge.lastKnownAge, lastKnownNodeIndex: npc.knowledge.lastKnownNodeIndex ?? 0 }), milestones: npc.milestoneFacts.filter((fact) => publicMilestones.has(fact.type)).map((fact): PublicJson => ({ type: fact.type === "promotedToA" ? "becameImportant" : fact.type, age: fact.age, nodeIndex: fact.nodeIndex, reasonTag: fact.reasonTag })) }));
  return {
    runName: state.run.identity.runName,
    age: state.run.age,
    maxAge: state.run.maxAge,
    realm: { id: state.run.realm.id, order: state.run.realm.order, cultivation: state.run.realm.cultivation, ...(state.run.realm.cultivationBps === undefined ? {} : { cultivationBps: state.run.realm.cultivationBps, realmFoundationBps: state.run.realm.realmFoundationBps ?? 0 }) },
    attributes: { ...state.run.attributes },
    resources: { spiritStone: state.run.resources.spiritStone, items: { ...state.run.resources.items } },
    conditions: state.run.conditions.map((condition) => ({ id: condition.id, kind: condition.kind, stacks: condition.stacks, ...(condition.remainingNodes === undefined ? {} : { remainingNodes: condition.remainingNodes }) })),
    riskConditions: (state.run.risk?.conditions ?? []).filter((condition) => condition.visibility !== "hidden").map((condition): PublicJson => condition.visibility === "explicit" ? { id: condition.id, definitionId: condition.definitionId, severity: condition.severity, visibility: condition.visibility, tags: [...condition.tags] } : { id: condition.id, severity: condition.severity, visibility: condition.visibility }),
    riskExposure: state.run.risk?.exposureCount ?? 0,
    identity: { rootTags: [...state.run.identity.rootTags], titles: [...state.run.identity.titles], ...(state.run.identity.destinyId === undefined ? {} : { destinyId: state.run.identity.destinyId }), ...(state.run.identity.innateProfile === undefined ? {} : { innateProfile: { spiritualRoot: state.run.identity.innateProfile.spiritualRoot, talentIds: [...state.run.identity.innateProfile.talentIds], majorDestinyId: state.run.identity.innateProfile.majorDestinyId } }), ...(state.run.identity.factionId === undefined ? {} : { factionId: state.run.identity.factionId }) },
    builds: publicBuilds,
    people,
    ...(state.run.build.dominantBuildId === undefined ? {} : { dominantBuildId: state.run.build.dominantBuildId }),
    actions: ["cultivate", "travel", "worldly", "pursuit"].map((actionId) => ({ actionId, enabled: state.run.actions.available.includes(actionId as GameState["run"]["actions"]["available"][number]) })),
    specialActions: specialActions(state, content),
    world: { regionId: state.run.world.regionId, knownRegionIds: [...state.run.world.knownRegionIds], tags: [...state.run.world.tags] },
    ...(state.run.ending === undefined ? {} : { ending: { endingId: state.run.ending.endingId, age: state.run.ending.age, ...(state.run.ending.deathCause === undefined ? {} : { deathCause: state.run.ending.deathCause }) } }),
    ...(death === undefined ? {} : { death: { deathCauseId: death.deathCauseId, deathAge: death.age, deathRealm: death.realmId, directCause: death.immediateSource, contributingFactors: death.contributingSourceRefs.filter((reference) => reference !== death.sourceActorId && (reference !== death.sourceCauseId || causeRelatedDeath)), wasWarned: death.warningFacts.length > 0, warningFacts: [...death.warningFacts], causeRelatedDeath, breakthroughDeath: death.category === "breakthrough", lifespanDeath: death.category === "lifespan", injuryAtDeath: injuryLevel(state), remainingLifespanPressure: Math.max(0, state.run.maxAge - death.age) } })
  };
}

function offeredInteraction(state: GameState, content: ContentRegistry, interactionState: InteractionState): CurrentInteraction | undefined {
  if (state.run.offer === undefined) return undefined;
  if (state.run.offer.innateProfiles !== undefined) {
    const progression = content.getProgression(state.contentVersion); const candidates = state.run.offer.innateProfiles.map((offer) => ({ selectionId: offer.selectionId, spiritualRoot: progression.spiritualRoots.find((value) => value.id === offer.profile.spiritualRoot)?.displayName ?? offer.profile.spiritualRoot, talent: progression.talents.find((value) => value.id === offer.profile.talentIds[0])?.displayName ?? offer.profile.talentIds[0], majorDestiny: progression.majorDestinies.find((value) => value.id === offer.profile.majorDestinyId)?.displayName ?? offer.profile.majorDestinyId }));
    return { interactionId: state.run.offer.offerId, kind: "destinyOffer", titleKey: "destiny.offer.title", body: { candidates }, options: candidates.map((candidate) => ({ optionId: candidate.selectionId, labelKey: "innate.offer.selection" })), interactionState };
  }
  const candidates = state.run.offer.destinyIds.map((id) => content.getDestiny(state.contentVersion, id));
  return {
    interactionId: state.run.offer.offerId, kind: "destinyOffer", titleKey: "destiny.offer.title",
    body: { candidates: candidates.map((candidate) => ({ id: candidate.id, profile: candidate.profile, titleKey: candidate.titleKey, descriptionKey: candidate.descriptionKey, advantage: { ...candidate.advantage }, cost: { ...candidate.cost }, hook: { ...candidate.hook } })) },
    options: candidates.map((candidate) => ({ optionId: candidate.id, labelKey: candidate.titleKey })), interactionState
  };
}

function eventInteraction(state: GameState, content: ContentRegistry, interactionState: InteractionState, riskPolicy: ServerRiskPolicy): CurrentInteraction | undefined {
  const current = state.run.events.current; if (current === undefined) return undefined;
  const event = content.getEvent(state.contentVersion, current.eventId);
  const choices = (event.choices ?? []).filter((choice) => choice.requirements === undefined || evaluateCondition(choice.requirements, state));
  const participants = Object.entries(current.participantBindings ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([slot, npcId]) => { const npc = state.run.npcs.byId[npcId]; return npc === undefined ? undefined : { slot, displayName: npc.displayName }; }).filter((value): value is { slot: string; displayName: string } => value !== undefined);
  const kind: CurrentInteraction["kind"] = specialKinds.has(event.kind) ? "specialNode" : event.kind === "ending" ? "ending" : "event";
  return {
    // `interactionId` is the public *instance* identity of this decision. It is deliberately not the
    // event id, so `eventId` is projected separately below: CHOOSE_EVENT_OPTION is keyed by eventId.
    interactionId: current.instanceId ?? event.id, kind, eventId: current.eventId, titleKey: event.titleKey, body: { bodyKey: event.fallback.bodyKey, ...(participants.length === 0 ? {} : { participants }) },
    options: choices.map((choice) => {
      const supplied = sanitizeRisk(riskPolicy({ state, event, choice }));
      const authoritative = choice.threatId === undefined ? supplied : buildRiskPresentation(state, threatDefinition(content.getRisk(state.contentVersion), choice.threatId));
      const riskPresentation = authoritative === undefined ? undefined : choice.threatId === undefined ? authoritative : { ...authoritative, ...(supplied?.level === undefined ? {} : { level: supplied.level }), ...(supplied?.labelKey === undefined ? {} : { labelKey: supplied.labelKey }), ...(supplied?.detailKey === undefined ? {} : { detailKey: supplied.detailKey }) };
      return { optionId: choice.id, labelKey: choice.labelKey, ...(riskPresentation === undefined ? {} : { riskPresentation }) };
    }), interactionState
  };
}

function history(state: GameState): PublicHistory {
  const events = state.run.events.history.map((entry, index) => ({ entryId: `event:${index}`, kind: "event", titleKey: `${entry.eventId}.title`, summaryKey: `${entry.eventId}.history`, data: { eventId: entry.eventId, nodeIndex: entry.nodeIndex, ...(entry.resultTier === undefined ? {} : { resultTier: entry.resultTier }) } }));
  const builds = (state.run.build.transitionFacts ?? []).map((fact) => ({ entryId: fact.id, kind: "build", titleKey: `build.fact.${fact.type}.title`, summaryKey: `build.fact.${fact.type}.summary`, data: { buildId: fact.buildId, age: fact.age, nodeIndex: fact.nodeIndex, reasonTag: fact.reasonTag, ...(fact.fromStage === undefined ? {} : { fromStage: fact.fromStage }), ...(fact.toStage === undefined ? {} : { toStage: fact.toStage }), ...(fact.fromBuildId === undefined ? {} : { fromBuildId: fact.fromBuildId }), ...(fact.toBuildId === undefined ? {} : { toBuildId: fact.toBuildId }) } }));
  return { entries: [...events, ...builds] };
}
function share(state: GameState): ShareViewModel { return { title: state.run.identity.runName, summary: `realm:${state.run.realm.id};age:${state.run.age}`, facts: [{ label: "realm", value: state.run.realm.id }, { label: "age", value: String(state.run.age) }] }; }

export class ServerViewModelBuilder {
  readonly content: ContentRegistry;
  readonly #capabilities: CapabilitySet;
  readonly #riskPolicy: ServerRiskPolicy;
  constructor(content: ContentRegistry, options: ServerViewModelBuilderOptions = {}) { this.content = content; this.#capabilities = capabilities(options.capabilities); this.#riskPolicy = options.riskPolicy ?? (({ state, choice }) => { if (choice.threatId === undefined) return { tier: "low", canBeFatal: false, reasons: [] }; const riskPack = content.getRisk(state.contentVersion); const projected = buildRiskPresentation(state, threatDefinition(riskPack, choice.threatId)); const level = projected.tier === "low" ? "safe" : projected.tier === "caution" ? "guarded" : "dangerous"; return { ...projected, level, labelKey: `risk.${projected.tier}` }; }); }
  build(value: unknown, interactionState: InteractionState = "idle"): PublicViewModel {
    return this.buildWithTerminal(value, undefined, interactionState);
  }
  /**
   * UI04E — the terminal-aware overload.
   *
   * The live service passes the terminal sidecar in. Tests and other callers that already have a
   * `StoredRun` (or a plain state) can pass it directly; callers that only have a `GameState` keep
   * the simple overload above.
   */
  buildWithTerminal(value: unknown, terminal: TerminalSidecar | undefined, interactionState: InteractionState = "idle"): PublicViewModel {
    // Accept either a `StoredRun` (state + commandLog + sidecar) or a bare `GameState`. A `StoredRun`
    // is a thin wrapper whose own `state` field is the real game state.
    const state: GameState = value !== null && typeof value === "object" && "state" in (value as Record<string, unknown>) && typeof (value as { state?: unknown }).state === "object"
      ? validateGameState((value as { state: unknown }).state)
      : validateGameState(value);
    const pageState = derivePageState(state, terminal);
    const terminalProjection = buildPublicTerminal(state, this.content, terminal, pageState);
    const publicState: PublicState = { schemaVersion: state.schemaVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, stateVersion: state.stateVersion, runId: state.run.runId, pageState, runStatus: state.run.status, publicRun: publicRun(state, this.content), capabilities: { ...this.#capabilities }, publicCauses: publicCauses(state), ...(terminalProjection === undefined ? {} : { terminal: terminalProjection }) };
    const currentInteraction = pageState === "DESTINY_OFFER" ? offeredInteraction(state, this.content, interactionState) : pageState === "EVENT" || pageState === "SPECIAL_NODE" || pageState === "ENDING" ? eventInteraction(state, this.content, interactionState, this.#riskPolicy) : undefined;
    return { state: publicState, ...(currentInteraction === undefined ? {} : { currentInteraction }), history: history(state), share: share(state) };
  }
  /**
   * Convenience for the live service: build directly from a `StoredRun` so the terminal sidecar is
   * automatically attached.
   */
  buildFromStoredRun(stored: StoredRun, interactionState: InteractionState = "idle"): PublicViewModel {
    return this.buildWithTerminal(stored, stored.terminal, interactionState);
  }
}
