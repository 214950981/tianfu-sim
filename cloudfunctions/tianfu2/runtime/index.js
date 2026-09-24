// GENERATED FILE — DO NOT HAND-EDIT.
//
// UI04D — the bounded cloud runtime facade, and the single entry point a cloud host should load.
// Generator:  tools/ui04d-cloud-runtime-artifact.mjs
// Regenerate: node tools/ui04d-cloud-runtime-artifact.mjs --write
//
// Each export is re-published verbatim from a generated module mechanically derived from its accepted
// TypeScript source, so the facade adds no implementation of its own. The surface is deliberately
// bounded: host wiring, the CloudBase store, the live CONTENT01 registry, identity derivation and the
// ownership error a host must catch. See docs/UI04D_CLOUD_BACKEND.md.
var dep0 = require("./server-cloudbase-store.js");
var dep1 = require("./server-command-gateway.js");
var dep2 = require("./server-destiny-offer.js");
var dep3 = require("./server-gateway-store.js");
var dep4 = require("./server-identity.js");
var dep5 = require("./server-live-content.js");
var dep6 = require("./server-live-service.js");
var dep7 = require("./server-viewmodel.js");

module.exports = {
  BOOTSTRAPS_COLLECTION: dep0.BOOTSTRAPS_COLLECTION,
  COMMANDS_COLLECTION: dep0.COMMANDS_COLLECTION,
  CloudBaseGatewayStore: dep0.CloudBaseGatewayStore,
  CommandGateway: dep1.CommandGateway,
  InMemoryGatewayStore: dep3.InMemoryGatewayStore,
  LIVE_CONTENT_VERSION: dep5.LIVE_CONTENT_VERSION,
  LIVE_RULES_VERSION: dep5.LIVE_RULES_VERSION,
  RUNS_COLLECTION: dep0.RUNS_COLLECTION,
  RunUnavailableError: dep6.RunUnavailableError,
  ServerViewModelBuilder: dep7.ServerViewModelBuilder,
  TianfuLiveService: dep6.TianfuLiveService,
  assertTrustedOpenid: dep4.assertTrustedOpenid,
  bootstrapKeyFor: dep4.bootstrapKeyFor,
  createLiveContentRegistry: dep5.createLiveContentRegistry,
  createTianfuLiveService: dep6.createTianfuLiveService,
  derivePlayerId: dep4.derivePlayerId,
  documentIdFor: dep0.documentIdFor,
  generateServerDestinyOffer: dep2.generateServerDestinyOffer,
  runIdSeedFor: dep4.runIdSeedFor
};
