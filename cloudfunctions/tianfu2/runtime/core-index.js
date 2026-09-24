// GENERATED FILE — DO NOT HAND-EDIT.
//
// Source of truth: packages/core/src/index.ts
// Source sha256:   a8bc62a20b1bc8c281d3998d22fe6f736f95e68af2bad3041637876f747e3db7
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
var __star0 = require("./core-numeric.js");
var __star1 = require("./core-rng.js");
var __star2 = require("./core-state.js");
var __star3 = require("./core-command.js");
var __star4 = require("./core-reducer.js");
var __star5 = require("./core-destiny.js");
var __star6 = require("./core-event.js");
var __star7 = require("./core-cause.js");
var __star8 = require("./core-persistence.js");
var __star9 = require("./core-progression.js");
var __star10 = require("./core-risk.js");
var __star11 = require("./core-build.js");
var __star12 = require("./core-npc.js");
var __star13 = require("./core-director.js");
var __star14 = require("./core-participants.js");

function identity   (value   )    {
  return value;
}

module.exports = Object.assign({}, __star0, __star1, __star2, __star3, __star4, __star5, __star6, __star7, __star8, __star9, __star10, __star11, __star12, __star13, __star14, {
  identity
});
