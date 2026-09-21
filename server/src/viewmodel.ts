import type { ChoiceDefinition, ContentRegistry, EventDefinition } from "../../packages/content/src/index.ts";
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

const capabilityNames: KnownCapability[] = ["DailyChallengeCapability", "AdCapability", "RewardedAdCapability", "CommerceCapability", "ShareCapability", "AiNarrativeCapability", "PlatformCapability"];
const specialKinds = new Set(["combat", "breakthrough"]);
const riskLevels = new Set(["safe", "guarded", "dangerous", "unknown"]);
const riskTiers = new Set(["low", "caution", "dangerous", "lethal"]);

export interface ServerRiskPolicyInput { state: GameState; event: EventDefinition; choice: ChoiceDefinition }
export type ServerRiskPolicy = (input: ServerRiskPolicyInput) => RiskPresentation | undefined;
export interface ServerViewModelBuilderOptions { capabilities?: Partial<Record<KnownCapability, boolean>>; riskPolicy?: ServerRiskPolicy }

function capabilities(value: ServerViewModelBuilderOptions["capabilities"]): CapabilitySet {
  return Object.fromEntries(capabilityNames.map((name) => [name, value?.[name] === true])) as unknown as CapabilitySet;
}
function sanitizeRisk(value: RiskPresentation | undefined): RiskPresentation | undefined {
  if (value === undefined || !riskTiers.has(value.tier) || typeof value.canBeFatal !== "boolean" || !Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string")) return undefined;
  return { tier: value.tier, canBeFatal: value.canBeFatal, reasons: [...value.reasons], ...(value.level !== undefined && riskLevels.has(value.level) ? { level: value.level } : {}), ...(typeof value.labelKey === "string" ? { labelKey: value.labelKey } : {}), ...(typeof value.detailKey === "string" ? { detailKey: value.detailKey } : {}) };
}

export function derivePageState(state: GameState): PageState {
  if (state.run.status === "offered") return "DESTINY_OFFER";
  if (state.run.status === "ended") return "ENDING";
  if (state.run.status === "abandoned") return "NEXT_LIFE";
  if (state.run.status === "dying") return "SPECIAL_NODE";
  const current = state.run.events.current; if (current === undefined) return "RUN_HOME";
  if (current.kind === "ending") return "ENDING";
  return specialKinds.has(current.kind) ? "SPECIAL_NODE" : "EVENT";
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
    interactionId: current.instanceId ?? event.id, kind, titleKey: event.titleKey, body: { bodyKey: event.fallback.bodyKey, ...(participants.length === 0 ? {} : { participants }) },
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
    const state = validateGameState(value); const pageState = derivePageState(state);
    const publicState: PublicState = { schemaVersion: state.schemaVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, stateVersion: state.stateVersion, runId: state.run.runId, pageState, runStatus: state.run.status, publicRun: publicRun(state, this.content), capabilities: { ...this.#capabilities }, publicCauses: publicCauses(state) };
    const currentInteraction = pageState === "DESTINY_OFFER" ? offeredInteraction(state, this.content, interactionState) : pageState === "EVENT" || pageState === "SPECIAL_NODE" || pageState === "ENDING" ? eventInteraction(state, this.content, interactionState, this.#riskPolicy) : undefined;
    return { state: publicState, ...(currentInteraction === undefined ? {} : { currentInteraction }), history: history(state), share: share(state) };
  }
}
