// GENERATED FILE — DO NOT HAND-EDIT.
//
// UI04B — the bounded WeChat client runtime facade, and the single entry point a page should load.
// Generator:  tools/ui04b-wechat-runtime-artifact.mjs
// Regenerate: node tools/ui04b-wechat-runtime-artifact.mjs --write
//
// Each export below is re-published verbatim from a generated module that was mechanically derived
// from its accepted TypeScript source, so the facade adds no implementation of its own:
//   packages/command-wire/src/index.ts
//   packages/application-ui/src/index.ts
//   packages/wechat-shell/src/index.ts
//
// The surface is deliberately bounded: controller orchestration, the injected-storage adapter and the
// public error types a caller must be able to catch. No gameplay Core, Content or server symbol is
// reachable through it. See docs/UI04B_WECHAT_RUNTIME_ARTIFACT.md.
var dep0 = require("./command-wire.js");
var dep1 = require("./wechat-shell.js");

module.exports = {
  APP_ERROR_CODES: dep0.APP_ERROR_CODES,
  ArchiveUnavailableError: dep1.ArchiveUnavailableError,
  CommandValidationError: dep0.CommandValidationError,
  IntentUnavailableError: dep1.IntentUnavailableError,
  RetryUnavailableError: dep1.RetryUnavailableError,
  SubmissionLockedError: dep1.SubmissionLockedError,
  WeChatRunController: dep1.WeChatRunController,
  createWeChatPlatformStorage: dep1.createWeChatPlatformStorage
};
