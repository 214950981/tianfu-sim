// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: server/src/destiny-offer.ts
// Source sha256:   a3751f046686716191b69b92e99409debff34564c4e91227fab4bc3553baf88d
// Generator:       tools/ui04d-cloud-runtime-artifact.mjs
// Regenerate:      node tools/ui04d-cloud-runtime-artifact.mjs --write
//
// Deployable CommonJS derived mechanically from the accepted TypeScript module above: type syntax is
// erased with Node's built-in type stripper and ES module syntax is rewritten to plain CommonJS.
// Nothing here was hand-copied — there is exactly one reducer, one CommandGateway, one ViewModel
// builder and one CONTENT01, and they live in the source modules named above.
//
// The closure is pinned to the required server Core/Content modules only: no client package (except
// command-wire, which Core's command module re-exports), no content audit or simulation tooling, and no
// Node builtin or third-party dependency. See docs/UI04D_CLOUD_BACKEND.md.
// UI04D: the barrel (`packages/content/src/index.ts`) re-exports the content *audit and simulation*
// tooling too, which is development output and must not ship inside the cloud function. `ContentRegistry`
// and the destiny types live in `registry.ts`, so the live closure imports them from there directly.
var { ContentRegistry } = require("./content-registry.js");
var { createOfferedRun, createRngState, selectInnateProfileOffers, selectDestinyCandidates, validateGameState } = require("./core-index.js");

                                          
                        
                       
                         
                
                   
                   
                     
                                                 
                           
 

                                        
                   
                                          
 

                                   
                        
                       
                         
                       
                
                    
                  
                  
                                                                                                                                                                                                                                                                                                    
                     
 

function generateServerDestinyOffer(input                         )                        {
  const pack = input.content.get(input.contentVersion);
  if (pack.manifest.rulesVersion !== input.rulesVersion) throw new RangeError("content rulesVersion does not match locked rulesVersion");
  if (pack.progressionPackId !== undefined) {
    const selection = selectInnateProfileOffers(createRngState(input.rulesVersion, input.rootSeed), input.content.getProgression(input.contentVersion));
    const state = createOfferedRun({ schemaVersion: input.schemaVersion, rulesVersion: input.rulesVersion, contentVersion: input.contentVersion, runId: input.runId, playerId: input.playerId, rootSeed: input.rootSeed, metaView: input.metaView, fixture: { ...input.fixture, destinyIds: selection.offers.map((offer) => offer.profile.majorDestinyId)                            , innateProfiles: selection.offers }, initialRng: selection.rng });
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

function projectDestinyOfferView(value         , content                 )                   {
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

module.exports = Object.assign({}, {
  generateServerDestinyOffer,
  projectDestinyOfferView
});
