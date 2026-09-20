import type { ChoiceDefinition, ContentRegistry, EventDefinition } from "../../packages/content/src/index.ts";
import { evaluateCondition, validateGameState, type GameState } from "../../packages/core/src/index.ts";
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

export interface ServerRiskPolicyInput { state: GameState; event: EventDefinition; choice: ChoiceDefinition }
export type ServerRiskPolicy = (input: ServerRiskPolicyInput) => RiskPresentation | undefined;
export interface ServerViewModelBuilderOptions { capabilities?: Partial<Record<KnownCapability, boolean>>; riskPolicy?: ServerRiskPolicy }

function capabilities(value: ServerViewModelBuilderOptions["capabilities"]): CapabilitySet {
  return Object.fromEntries(capabilityNames.map((name) => [name, value?.[name] === true])) as unknown as CapabilitySet;
}
function sanitizeRisk(value: RiskPresentation | undefined): RiskPresentation | undefined {
  if (value === undefined || !riskLevels.has(value.level) || typeof value.labelKey !== "string") return undefined;
  return { level: value.level, labelKey: value.labelKey, ...(typeof value.detailKey === "string" ? { detailKey: value.detailKey } : {}) };
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

function publicRun(state: GameState): Record<string, PublicJson> {
  return {
    runName: state.run.identity.runName,
    age: state.run.age,
    maxAge: state.run.maxAge,
    realm: { id: state.run.realm.id, order: state.run.realm.order, cultivation: state.run.realm.cultivation, ...(state.run.realm.cultivationBps === undefined ? {} : { cultivationBps: state.run.realm.cultivationBps, realmFoundationBps: state.run.realm.realmFoundationBps ?? 0 }) },
    attributes: { ...state.run.attributes },
    resources: { spiritStone: state.run.resources.spiritStone, items: { ...state.run.resources.items } },
    conditions: state.run.conditions.map((condition) => ({ id: condition.id, kind: condition.kind, stacks: condition.stacks, ...(condition.remainingNodes === undefined ? {} : { remainingNodes: condition.remainingNodes }) })),
    identity: { rootTags: [...state.run.identity.rootTags], titles: [...state.run.identity.titles], ...(state.run.identity.destinyId === undefined ? {} : { destinyId: state.run.identity.destinyId }), ...(state.run.identity.innateProfile === undefined ? {} : { innateProfile: { spiritualRoot: state.run.identity.innateProfile.spiritualRoot, talentIds: [...state.run.identity.innateProfile.talentIds], majorDestinyId: state.run.identity.innateProfile.majorDestinyId } }), ...(state.run.identity.factionId === undefined ? {} : { factionId: state.run.identity.factionId }) },
    actions: ["cultivate", "travel", "worldly", "pursuit"].map((actionId) => ({ actionId, enabled: state.run.actions.available.includes(actionId as GameState["run"]["actions"]["available"][number]) })),
    world: { regionId: state.run.world.regionId, knownRegionIds: [...state.run.world.knownRegionIds], tags: [...state.run.world.tags] },
    ...(state.run.ending === undefined ? {} : { ending: { endingId: state.run.ending.endingId, age: state.run.ending.age, ...(state.run.ending.deathCause === undefined ? {} : { deathCause: state.run.ending.deathCause }) } })
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
  const kind: CurrentInteraction["kind"] = specialKinds.has(event.kind) ? "specialNode" : event.kind === "ending" ? "ending" : "event";
  return {
    interactionId: event.id, kind, titleKey: event.titleKey, body: { bodyKey: event.fallback.bodyKey },
    options: choices.map((choice) => { const riskPresentation = sanitizeRisk(riskPolicy({ state, event, choice })); return { optionId: choice.id, labelKey: choice.labelKey, ...(riskPresentation === undefined ? {} : { riskPresentation }) }; }), interactionState
  };
}

function history(state: GameState): PublicHistory {
  return { entries: state.run.events.history.map((entry, index) => ({ entryId: `event:${index}`, kind: "event", titleKey: `${entry.eventId}.title`, summaryKey: `${entry.eventId}.history`, data: { eventId: entry.eventId, nodeIndex: entry.nodeIndex, ...(entry.resultTier === undefined ? {} : { resultTier: entry.resultTier }) } })) };
}
function share(state: GameState): ShareViewModel { return { title: state.run.identity.runName, summary: `realm:${state.run.realm.id};age:${state.run.age}`, facts: [{ label: "realm", value: state.run.realm.id }, { label: "age", value: String(state.run.age) }] }; }

export class ServerViewModelBuilder {
  readonly content: ContentRegistry;
  readonly #capabilities: CapabilitySet;
  readonly #riskPolicy: ServerRiskPolicy;
  constructor(content: ContentRegistry, options: ServerViewModelBuilderOptions = {}) { this.content = content; this.#capabilities = capabilities(options.capabilities); this.#riskPolicy = options.riskPolicy ?? (() => ({ level: "unknown", labelKey: "risk.unknown" })); }
  build(value: unknown, interactionState: InteractionState = "idle"): PublicViewModel {
    const state = validateGameState(value); const pageState = derivePageState(state);
    const publicState: PublicState = { schemaVersion: state.schemaVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, stateVersion: state.stateVersion, runId: state.run.runId, pageState, runStatus: state.run.status, publicRun: publicRun(state), capabilities: { ...this.#capabilities }, publicCauses: publicCauses(state) };
    const currentInteraction = pageState === "DESTINY_OFFER" ? offeredInteraction(state, this.content, interactionState) : pageState === "EVENT" || pageState === "SPECIAL_NODE" || pageState === "ENDING" ? eventInteraction(state, this.content, interactionState, this.#riskPolicy) : undefined;
    return { state: publicState, ...(currentInteraction === undefined ? {} : { currentInteraction }), history: history(state), share: share(state) };
  }
}
