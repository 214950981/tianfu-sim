import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildArchiveView, buildWeChatPageShell, mapCoreActionIntents, mapSpecialActionIntents } from "../packages/wechat-shell/src/index.ts";
import { reduce } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";
import { FIXTURE_PATH, buildPreviewFixtures, buildPreviewStates } from "../tools/ui02-preview-fixtures.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const RULES_VERSION = "2.0.0";
const CONTENT_VERSION = "dev-0.1.0";

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readJson = (relative) => JSON.parse(read(relative));

/**
 * Frozen UI02 base tree digests.
 *
 * These pin the UI02 task base (source commit 61da8ee94bc666b6130d72680cc161e8f6830ae0) so this suite
 * can prove, without needing git at test time, that legacy 1.0 gameplay and Core/Content gameplay
 * sources are byte-equivalent to the base. They are deliberately base-specific: a later task that is
 * legitimately allowed to change those trees must update them on purpose.
 */
const BASE_TREE_DIGESTS = {
  "miniprogram/pages/start": "60e0cc693eb8849d74a23b56cca97b7a154e18ad2167013109efb534f1dfbcba",
  "miniprogram/pages/game": "c04c015e9ea8e37c3ea9d817377cf010a07e618a35d7b84a00f61b816d991cfe",
  "miniprogram/pages/rank": "3171b3fbbb94368e7ed3df556b1cfb58379911e1bf2d617e19554c37c5c0d605",
  "packages/core/src": "247b0b9e650aab642824491fc36186fbef552e62dddf9a75cc0ebeaaa92ef80d",
  "packages/content/src": "3a290c9b6fbf03969990857544709acebaea57d22fe5f864fa9c197b65bfec67",
  "miniprogram/app.wxss": "50d3287504a6112527997fbbf85678724c457bb90513467609895c936da370fe"
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Same algorithm used to compute BASE_TREE_DIGESTS: sha256 over sorted "<relpath>:<sha256(content)>\n". */
function treeDigest(relative) {
  const absolute = path.join(ROOT, relative);
  const stat = fs.statSync(absolute);
  const files = (stat.isDirectory() ? walk(absolute) : [absolute]).map((file) => path.relative(ROOT, file).replace(/\\/g, "/")).sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update(":");
    digest.update(createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex"));
    digest.update("\n");
  }
  return digest.digest("hex");
}

/**
 * Assertions about the preview page must inspect CODE, not prose. The page and stylesheet
 * deliberately document which legacy values they avoid, so comments are stripped before scanning.
 */
const stripJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const stripCss = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const stripMarkup = (source) => source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function keySet(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => keySet(entry, result));
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) { result.add(key); keySet(entry, result); }
  return result;
}

const fixtures = readJson(FIXTURE_PATH);

// ---------------------------------------------------------------- route registration

test("UI02_route: v2-preview is registered last, is not the default page and is not a tabBar entry", () => {
  const app = readJson("miniprogram/app.json");
  assert.equal(app.pages[app.pages.length - 1], "pages/v2-preview/v2-preview");
  assert.equal(app.pages[0], "pages/start/start");
  assert.equal(app.pages.filter((page) => page.includes("v2-preview")).length, 1);
  const tabPaths = app.tabBar.list.map((entry) => entry.pagePath);
  assert.deepEqual(tabPaths, ["pages/game/game", "pages/rank/rank"]);
  assert.equal(tabPaths.some((pagePath) => pagePath.includes("v2-preview")), false);
  for (const file of ["v2-preview.js", "v2-preview.json", "v2-preview.wxml", "v2-preview.wxss"]) {
    assert.equal(fs.existsSync(path.join(ROOT, "miniprogram/pages/v2-preview", file)), true, file);
  }
});

// ---------------------------------------------------------------- scope purity

test("UI02_legacy: 1.0 start/game/rank business logic is byte-equivalent to the UI02 task base", () => {
  for (const relative of ["miniprogram/pages/start", "miniprogram/pages/game", "miniprogram/pages/rank"]) {
    assert.equal(treeDigest(relative), BASE_TREE_DIGESTS[relative], `${relative} must be byte-equivalent to base`);
  }
  assert.equal(treeDigest("miniprogram/app.wxss"), BASE_TREE_DIGESTS["miniprogram/app.wxss"]);
  // no UI02 vocabulary leaked into legacy pages
  const legacy = ["miniprogram/pages/start/start.js", "miniprogram/pages/start/start.wxml", "miniprogram/pages/game/game.wxml", "miniprogram/pages/game/game_data.js", "miniprogram/pages/rank/rank.js", "miniprogram/pages/rank/rank.wxml", "miniprogram/pages/rank/rank.wxss"];
  for (const file of legacy) assert.equal(read(file).includes("v2-preview"), false, file);
});

test("UI02_purity: no Core or Content gameplay source changed", () => {
  assert.equal(treeDigest("packages/core/src"), BASE_TREE_DIGESTS["packages/core/src"], "packages/core/src must be unchanged");
  assert.equal(treeDigest("packages/content/src"), BASE_TREE_DIGESTS["packages/content/src"], "packages/content/src must be unchanged");
  assert.equal(fs.existsSync(path.join(ROOT, "packages/content/dev-fixtures/minimal-pack.json")), true);
});

test("UI02_visual: paper/ink/cinnabar/restrained-dark-gold tokens with no legacy neon dashboard copy", () => {
  const wxss = read("miniprogram/pages/v2-preview/v2-preview.wxss");
  for (const token of ["--paper:", "--ink:", "--cinnabar:", "--gold:"]) assert.equal(wxss.includes(token), true, token);
  // no legacy 1.0 neon values anywhere in the preview page code (comments excluded)
  const pageSources = [
    stripCss(read("miniprogram/pages/v2-preview/v2-preview.wxss")),
    stripMarkup(read("miniprogram/pages/v2-preview/v2-preview.wxml")),
    stripJs(read("miniprogram/pages/v2-preview/v2-preview.js")),
    stripJs(read("miniprogram/pages/v2-preview/v2-preview.json"))
  ].join("\n");
  for (const neon of ["#FFD700", "#050508", "#55ff55", "#55ccff", "#dd55ff", "#ff4444", "text-shadow", "box-shadow"]) {
    assert.equal(pageSources.includes(neon), false, `neon legacy value leaked into preview code: ${neon}`);
  }
  const pageJson = readJson("miniprogram/pages/v2-preview/v2-preview.json");
  assert.equal(pageJson.navigationBarBackgroundColor, "#F5F1E8");
  assert.equal(pageJson.navigationBarTextStyle, "black");
  assert.notEqual(pageJson.navigationBarBackgroundColor, "#050508");
});

// ---------------------------------------------------------------- RUN_HOME

test("UI02_run_home: renders exactly the four core actions cultivate/travel/worldly/pursuit", () => {
  const view = fixtures.states.RUN_HOME.view;
  assert.equal(view.state.pageState, "RUN_HOME");
  assert.deepEqual(view.state.publicRun.actions.map((entry) => entry.actionId), ["cultivate", "travel", "worldly", "pursuit"]);
  assert.equal(view.state.publicRun.actions.length, 4);
  assert.deepEqual(mapCoreActionIntents(view).map((intent) => intent.command), [
    { type: "CHOOSE_ACTION", actionId: "cultivate" },
    { type: "CHOOSE_ACTION", actionId: "travel" },
    { type: "CHOOSE_ACTION", actionId: "worldly" },
    { type: "CHOOSE_ACTION", actionId: "pursuit" }
  ]);
  // RUN_HOME also presents public status, lifespan pressure, conditions, causes, Build identity and people
  for (const key of ["realm", "age", "maxAge", "conditions", "identity", "builds", "people"]) assert.notEqual(view.state.publicRun[key], undefined, key);
  assert.equal(Array.isArray(view.state.publicCauses), true);
});

test("UI02_run_home: unknown or malformed action projections are dropped, never invented", () => {
  const view = structuredClone(fixtures.states.RUN_HOME.view);
  view.state.publicRun.actions.push({ actionId: "ascend", enabled: true });
  view.state.publicRun.actions.push({ enabled: true });
  assert.deepEqual(mapCoreActionIntents(view).map((intent) => intent.command.actionId), ["cultivate", "travel", "worldly", "pursuit"]);
  const empty = structuredClone(view);
  empty.state.publicRun.actions = [];
  assert.deepEqual(mapCoreActionIntents(empty), []);
});

// ---------------------------------------------------------------- breakthrough projection

test("UI02_breakthrough: entry is driven only by server-projected public availability", () => {
  const ready = fixtures.states.RUN_HOME;
  assert.equal(ready.view.state.publicRun.specialActions.length, 1);
  assert.equal(ready.view.state.publicRun.specialActions[0].actionId, "attemptBreakthrough");
  assert.equal(ready.view.state.publicRun.specialActions[0].available, true);
  assert.equal(mapSpecialActionIntents(ready.view)[0].enabled, true);

  const blocked = fixtures.variants.RUN_HOME_BREAKTHROUGH_BLOCKED;
  assert.equal(blocked.view.state.publicRun.specialActions[0].available, false);
  assert.equal(blocked.view.state.publicRun.specialActions[0].blockedReasonKey, "breakthrough.cultivation_incomplete");
  assert.equal(mapSpecialActionIntents(blocked.view)[0].enabled, false);

  // presence of the entry never depends on anything the client could compute locally
  const stripped = structuredClone(ready.view);
  stripped.state.publicRun.specialActions = [];
  assert.deepEqual(mapSpecialActionIntents(stripped), []);
});

test("UI02_breakthrough: projection exposes no difficulty, odds, RNG, hidden modifier or check spec", () => {
  const serialized = JSON.stringify(fixtures.states.RUN_HOME.view.state.publicRun.specialActions);
  for (const forbidden of ["difficulty", "Difficulty", "odds", "chance", "rng", "RNG", "roll", "modifier", "checkSpec", "CheckSpec", "score", "retention", "lifespanCap", "retreatCultivationGain"]) {
    assert.equal(serialized.includes(forbidden), false, `breakthrough projection leaked: ${forbidden}`);
  }
  const entries = fixtures.states.RUN_HOME.view.state.publicRun.specialActions;
  assert.deepEqual(Object.keys(entries[0]).sort(), ["actionId", "available", "kind", "labelKey", "targetRealm"]);
  assert.deepEqual(Object.keys(entries[0].targetRealm).sort(), ["displayName", "id"]);
  assert.equal(entries[0].targetRealm.displayName, "炼气");
});

test("UI02_breakthrough: projected availability mirrors the authoritative reducer exactly (no second engine)", () => {
  const { content, runHome, breakthroughBlocked, event, specialNode, ended } = buildPreviewStates();
  const accepts = (state) => {
    try {
      reduce({ state, command: { type: "ATTEMPT_BREAKTHROUGH" }, context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content, commandId: "cmd:ui02-probe" } });
      return true;
    } catch { return false; }
  };
  const builder = new ServerViewModelBuilder(content);
  const cases = [["runHome", runHome], ["blocked", breakthroughBlocked], ["event", event], ["specialNode", specialNode], ["ended", ended]];
  for (const [name, state] of cases) {
    const projected = builder.build(state).state.publicRun.specialActions;
    const projectedAvailable = projected.length === 0 ? false : projected[0].available === true;
    assert.equal(projectedAvailable, accepts(state), `${name}: projection must agree with the reducer`);
  }
  assert.equal(accepts(runHome), true, "the ready fixture must be genuinely reducible");
  assert.equal(accepts(event), false, "a pending interaction must block breakthrough");
  assert.equal(accepts(specialNode), false, "a dying run must block breakthrough");
});

// ---------------------------------------------------------------- shell intent mapping

test("UI02_intent: shell mapping can create ATTEMPT_BREAKTHROUGH without local rule calculation", () => {
  const intents = mapSpecialActionIntents(fixtures.states.RUN_HOME.view);
  assert.equal(intents.length, 1);
  assert.deepEqual(intents[0].command, { type: "ATTEMPT_BREAKTHROUGH" });
  // the emitted command carries no client-authored score/difficulty/modifier/RNG/outcome field
  assert.deepEqual(Object.keys(intents[0].command).sort(), ["type"]);
  const page = stripJs(read("miniprogram/pages/v2-preview/v2-preview.js"));
  for (const forbidden of ["Math.random", "difficulty", "rng", "chance", "odds", "checkSpec", "breakthroughScore"]) {
    assert.equal(page.includes(forbidden), false, `preview page must not compute rules: ${forbidden}`);
  }
  assert.equal(page.includes("wx.request"), false);
});

// ---------------------------------------------------------------- EVENT

test("UI02_event: renders server-built riskPresentation and an unresolved event blocks ordinary back", () => {
  const event = fixtures.states.EVENT;
  assert.equal(event.view.state.pageState, "EVENT");
  const options = event.view.currentInteraction.options;
  assert.equal(options.length > 1, true);
  const risky = options.filter((option) => option.riskPresentation !== undefined);
  assert.equal(risky.length > 0, true, "server must build riskPresentation for options");
  const dangerous = options.find((option) => option.optionId === "face-combat-risk");
  assert.equal(dangerous.riskPresentation.tier, "dangerous");
  assert.equal(dangerous.riskPresentation.level, "dangerous");
  assert.equal(dangerous.riskPresentation.labelKey, "risk.dangerous");
  assert.equal(typeof dangerous.riskPresentation.canBeFatal, "boolean");
  // unresolved -> ordinary back is locked by the shell, and it is the submission state that decides
  assert.equal(event.shell.ordinaryBackAllowed, false);
  assert.equal(buildWeChatPageShell(event.view, { interactionState: "confirmed", mutuallyExclusiveLocked: false, requiresReconfirmation: false }).ordinaryBackAllowed, true);
  assert.equal(buildWeChatPageShell(event.view, { interactionState: "submitting", mutuallyExclusiveLocked: true, requiresReconfirmation: false }).interactionLocked, true);
  // risk must never be derived on the client: the client only reads reasons/tier
  for (const forbidden of ["difficulty", "CheckSpec", "checkSpec", "rng", "drawIndex"]) {
    assert.equal(JSON.stringify(options).includes(forbidden), false, forbidden);
  }
});

// ---------------------------------------------------------------- SPECIAL_NODE

test("UI02_special_node: uses authoritative currentInteraction and submission state only", () => {
  const node = fixtures.states.SPECIAL_NODE;
  assert.equal(node.view.state.pageState, "SPECIAL_NODE");
  assert.equal(node.view.state.runStatus, "dying");
  assert.equal(node.view.currentInteraction !== undefined, true);
  assert.equal(node.view.currentInteraction.interactionId, "inst-ui02-special");
  assert.equal(node.view.currentInteraction.interactionState, "idle");
  assert.equal(node.shell.ordinaryBackAllowed, false);
  // identical generic boundary as EVENT: same builder, same shell, no second breakthrough engine
  assert.deepEqual(buildWeChatPageShell(node.view, { interactionState: "idle", mutuallyExclusiveLocked: false, requiresReconfirmation: false }).visibleEntries, node.shell.visibleEntries);
  assert.equal(JSON.stringify(node).includes("resolveBreakthrough"), false);
  const page = read("miniprogram/pages/v2-preview/v2-preview.js");
  assert.equal(page.includes("breakthroughScore"), false);
});

// ---------------------------------------------------------------- LIFE_ARCHIVE

test("UI02_archive: read-only, and omits hidden Causes and hidden NPC state", () => {
  const archive = fixtures.states.LIFE_ARCHIVE.archive;
  assert.equal(archive.readOnly, true);
  assert.equal(archive.causes.every((cause) => cause.level === "explicit" || cause.level === "hinted"), true);
  assert.equal(archive.causes.some((cause) => cause.publicId === "hidden_cause"), false);
  assert.equal(JSON.stringify(archive).includes("hidden_cause"), false);
  assert.equal(archive.history.length > 0, true);
  assert.equal(archive.people.length > 0, true);
  assert.equal(archive.builds.length > 0, true);
  // death projection: age/realm/cause/warning only, never the DeathRecord trace
  assert.equal(archive.death !== undefined, true);
  assert.equal(archive.death.trace, undefined);
  assert.equal(archive.death.deathAge, 88);
  assert.equal(archive.death.wasWarned, true);
  // presence of a hidden Cause in state must not surface anywhere (no placeholder, no count)
  const { runHome } = buildPreviewStates();
  const stateCauses = Object.values(runHome.run.causes.byId);
  assert.equal(stateCauses.some((cause) => cause.visibility === "hidden"), true, "fixture must actually contain a hidden Cause");
  assert.equal(stateCauses.filter((cause) => cause.visibility !== "hidden").length, 2);
  assert.equal(fixtures.states.RUN_HOME.view.state.publicCauses.length, 2, "only non-hidden Causes may be projected");
  assert.equal(JSON.stringify(fixtures).includes("hidden_cause"), false);
  // presence of an unmet NPC in state must not surface anywhere (no placeholder, no count)
  assert.equal(runHome.run.npcs.byId["npc:core:unmet-figure"].knowledge.met, false, "fixture must actually contain an unmet NPC");
  assert.equal(runHome.run.npcs.byId["npc:core:unmet-figure"].actualStatus, "dead");
  assert.equal(JSON.stringify(fixtures).includes("unmet-figure"), false, "unmet NPC id leaked");
  assert.equal(JSON.stringify(fixtures).includes("未遇之人"), false, "unmet NPC display name leaked");
  // only met NPC public refs may appear
  assert.equal(fixtures.states.RUN_HOME.view.state.publicRun.people.length, 2);
  assert.equal(fixtures.states.LIFE_ARCHIVE.view.state.publicRun.people.length, 2);
});

// ---------------------------------------------------------------- capability gating

test("UI02_capability: disabled entries remain hidden or safely degraded", () => {
  const full = fixtures.states.RUN_HOME.shell.visibleEntries;
  assert.equal(full.share, true);
  const degraded = fixtures.variants.RUN_HOME_NO_PLATFORM_CAPABILITY.shell.visibleEntries;
  assert.deepEqual(degraded, { dailyChallenge: false, rewardedAd: false, commerce: false, share: false, aiNarrative: false });
  // same public state, capability set is what changes the entries
  assert.equal(fixtures.variants.RUN_HOME_NO_PLATFORM_CAPABILITY.view.state.publicRun.actions.length, 4);
  assert.equal(JSON.stringify(degraded).includes("challengeSeed"), false);
  assert.equal(JSON.stringify(degraded).includes("leaderboard"), false);
});

// ---------------------------------------------------------------- fixture hygiene

test("UI02_fixtures: committed fixture is exactly what real server code regenerates", () => {
  const regenerated = JSON.parse(JSON.stringify(buildPreviewFixtures()));
  assert.deepEqual(fixtures, regenerated, "v2-fixtures.json is stale; run node tools/ui02-preview-fixtures.mjs --write");
});

test("UI02_fixtures: public ViewModel-shaped data only, no authoritative rule state", () => {
  const keys = keySet(fixtures);
  for (const forbidden of ["rootSeed", "rng", "drawIndex", "salience", "echoBudget", "eligibleSinceNode", "eligibleAge", "selector", "futureEventIds", "npcs", "check", "difficulty", "effects", "EffectSpec", "trace", "actorIdsByRole", "visibility", "maturity", "linkedEventIds", "lifetimeEvidence", "affinityBps", "significance", "promotionThreshold", "actualStatus", "encounterCount"]) {
    assert.equal(keys.has(forbidden), false, `fixture leaked key: ${forbidden}`);
  }
  const serialized = JSON.stringify(fixtures);
  // note: PublicState.stateVersion is legitimately public and IS expected here.
  for (const forbidden of ["server-only-root-seed", "hidden_cause", "rngRoll", "resolver", "drawIndex", "selectDirectorEvent"]) {
    assert.equal(serialized.includes(forbidden), false, `fixture leaked value: ${forbidden}`);
  }
  // every rendered state still carries the contract-required public shell
  for (const entry of Object.values({ ...fixtures.states, ...fixtures.variants })) {
    assert.equal(typeof entry.pageState, "string");
    assert.equal(typeof entry.shell.ordinaryBackAllowed, "boolean");
    assert.equal(typeof entry.shell.interactionLocked, "boolean");
    assert.equal(entry.view.state.schemaVersion, 2);
    assert.equal(entry.view.state.rulesVersion, RULES_VERSION);
  }
  // fixture must declare that it is generated, not hand authored
  assert.equal(typeof fixtures.source, "string");
  assert.equal(fixtures.source.includes("generated"), true);
});

// ---------------------------------------------------------------- A12 boundaries preserved

test("UI02_a12: A12 ViewModel security boundaries and shell behaviour remain intact", () => {
  for (const entry of Object.values({ ...fixtures.states, ...fixtures.variants })) {
    const keys = keySet(entry.view);
    for (const forbidden of ["rootSeed", "rng", "drawIndex", "salience", "echoBudget", "npcs", "check", "difficulty", "effects", "EffectSpec", "trace", "actorIdsByRole"]) {
      assert.equal(keys.has(forbidden), false, `A12 boundary broken: ${forbidden}`);
    }
    assert.equal(JSON.stringify(entry.shell).includes("rootSeed"), false);
    assert.equal(JSON.stringify(entry.shell).includes("commandId"), false);
    // publicCauses never exposes a hidden Cause
    assert.equal(entry.view.state.publicCauses.some((cause) => cause.level !== "explicit" && cause.level !== "hinted"), false);
  }
  // ARCHIVE is a pure selection: it cannot invent entries that the public view does not have
  const built = buildArchiveView(fixtures.states.LIFE_ARCHIVE.view);
  assert.equal(built.history.length, fixtures.states.LIFE_ARCHIVE.view.history.entries.length);
  assert.equal(built.causes.length, fixtures.states.LIFE_ARCHIVE.view.state.publicCauses.length);
});

test("UI02_docs: preview documentation states route opening and that production transport is later work", () => {
  const doc = read("docs/UI02_PREVIEW.md");
  assert.equal(doc.includes("pages/v2-preview/v2-preview"), true);
  assert.equal(doc.includes("tools/ui02-preview-fixtures.mjs"), true);
  for (const phrase of ["生产", "未接线"]) assert.equal(doc.includes(phrase), true, phrase);
});
