import { ContentRegistry, type DestinyDefinition } from "../../packages/content/src/index.ts";
import {
  createOfferedRun,
  createRngState,
  selectInnateProfileOffers,
  selectDestinyCandidates,
  validateGameState,
  type GameState,
  type MetaView,
  type OfferedRunFixture,
  type RngTrace
} from "../../packages/core/src/index.ts";

export interface ServerDestinyOfferInput {
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  runId: string;
  playerId: string;
  rootSeed: string;
  metaView: MetaView;
  fixture: Omit<OfferedRunFixture, "destinyIds">;
  content: ContentRegistry;
}

export interface GeneratedDestinyOffer {
  state: GameState;
  internalTrace: { rngDraws: RngTrace[] };
}

export interface DestinyOfferView {
  schemaVersion: number;
  rulesVersion: string;
  contentVersion: string;
  stateVersion: number;
  runId: string;
  status: "offered";
  offerId: string;
  runName: string;
  candidates: Array<Pick<DestinyDefinition, "id" | "profile" | "titleKey" | "descriptionKey" | "advantage" | "cost" | "hook"> | { id: string; spiritualRoot: { id: string; displayName: string }; talent: { id: string; displayName: string }; majorDestiny: { id: string; displayName: string } }>;
  metaView: MetaView;
}

export function generateServerDestinyOffer(input: ServerDestinyOfferInput): GeneratedDestinyOffer {
  const pack = input.content.get(input.contentVersion);
  if (pack.manifest.rulesVersion !== input.rulesVersion) throw new RangeError("content rulesVersion does not match locked rulesVersion");
  if (pack.progressionPackId !== undefined) {
    const selection = selectInnateProfileOffers(createRngState(input.rulesVersion, input.rootSeed), input.content.getProgression(input.contentVersion));
    const state = createOfferedRun({ schemaVersion: input.schemaVersion, rulesVersion: input.rulesVersion, contentVersion: input.contentVersion, runId: input.runId, playerId: input.playerId, rootSeed: input.rootSeed, metaView: input.metaView, fixture: { ...input.fixture, destinyIds: selection.offers.map((offer) => offer.profile.majorDestinyId) as [string, string, string], innateProfiles: selection.offers }, initialRng: selection.rng });
    return { state, internalTrace: { rngDraws: selection.trace } };
  }
  const unlocks = new Set(input.metaView.unlocks);
  const eligibleIds = pack.destinies
    .filter((destiny) => (destiny.requiredUnlocks ?? []).every((unlockId) => unlocks.has(unlockId)))
    .map((destiny) => destiny.id);
  const selection = selectDestinyCandidates(createRngState(input.rulesVersion, input.rootSeed), eligibleIds);
  const state = createOfferedRun({
    schemaVersion: input.schemaVersion,
    rulesVersion: input.rulesVersion,
    contentVersion: input.contentVersion,
    runId: input.runId,
    playerId: input.playerId,
    rootSeed: input.rootSeed,
    metaView: input.metaView,
    fixture: { ...input.fixture, destinyIds: selection.destinyIds },
    initialRng: selection.rng
  });
  return { state, internalTrace: { rngDraws: selection.trace } };
}

export function projectDestinyOfferView(value: unknown, content: ContentRegistry): DestinyOfferView {
  const state = validateGameState(value);
  if (state.run.status !== "offered" || state.run.offer === undefined) throw new RangeError("state must contain an active destiny offer");
  const candidates = state.run.offer.innateProfiles === undefined ? state.run.offer.destinyIds.map((destinyId) => {
    const destiny = content.getDestiny(state.contentVersion, destinyId);
    return {
      id: destiny.id,
      profile: destiny.profile,
      titleKey: destiny.titleKey,
      descriptionKey: destiny.descriptionKey,
      advantage: { ...destiny.advantage },
      cost: { ...destiny.cost },
      hook: { ...destiny.hook }
    };
  }) : state.run.offer.innateProfiles.map((offer) => {
    const progression = content.getProgression(state.contentVersion); const root = progression.spiritualRoots.find((entry) => entry.id === offer.profile.spiritualRoot); const talent = progression.talents.find((entry) => entry.id === offer.profile.talentIds[0]); const destiny = progression.majorDestinies.find((entry) => entry.id === offer.profile.majorDestinyId); if (root === undefined || talent === undefined || destiny === undefined) throw new RangeError("invalid innate offer content");
    return { id: offer.selectionId, spiritualRoot: { id: root.id, displayName: root.displayName }, talent: { id: talent.id, displayName: talent.displayName }, majorDestiny: { id: destiny.id, displayName: destiny.displayName } };
  });
  return {
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    stateVersion: state.stateVersion,
    runId: state.run.runId,
    status: "offered",
    offerId: state.run.offer.offerId,
    runName: state.run.identity.runName,
    candidates,
    metaView: {
      unlocks: [...state.metaView.unlocks],
      entitlements: [...state.metaView.entitlements],
      discoveries: [...state.metaView.discoveries]
    }
  };
}
