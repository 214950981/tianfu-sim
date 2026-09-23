// UI02 preview fixture generator.
//
// Every fixture in miniprogram/pages/v2-preview/v2-fixtures.json is produced here by REAL
// server/core/platform-neutral code (ServerViewModelBuilder -> buildWeChatPageShell ->
// mapCoreActionIntents/mapSpecialActionIntents/buildArchiveView). Nothing in the preview page
// invents game rules; the page only renders these projections.
//
// Usage:
//   node tools/ui02-preview-fixtures.mjs            # print a summary
//   node tools/ui02-preview-fixtures.mjs --write    # regenerate the committed fixture JSON
import fs from "node:fs";
import path from "node:path";
import { ContentRegistry } from "../packages/content/src/index.ts";
import { reduce, validateGameState } from "../packages/core/src/index.ts";
import { buildArchiveView, buildWeChatPageShell, mapCoreActionIntents, mapSpecialActionIntents } from "../packages/wechat-shell/src/index.ts";
import { ServerViewModelBuilder, generateServerDestinyOffer } from "../server/src/index.ts";

export const FIXTURE_PATH = "miniprogram/pages/v2-preview/v2-fixtures.json";
const PACK_PATH = "packages/content/dev-fixtures/minimal-pack.json";
const RULES_VERSION = "2.0.0";
const CONTENT_VERSION = "dev-0.1.0";
const RUN_ID = "run-ui02-preview";
const PLAYER_ID = "player-ui02-preview";
const ROOT_SEED = "server-only-root-seed";

function contentRegistry() {
  const pack = JSON.parse(fs.readFileSync(PACK_PATH, "utf8"));
  const content = new ContentRegistry();
  content.register(pack);
  return content;
}

function baseActiveState(content) {
  const generated = generateServerDestinyOffer({
    schemaVersion: 2, rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION,
    runId: RUN_ID, playerId: PLAYER_ID, rootSeed: ROOT_SEED,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    content,
    fixture: {
      offerId: "offer-ui02-preview", age: 24, maxAge: 100, runName: "青芜问道",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 12, body: 8, spiritSense: 7, fortune: 6 },
      resources: { spiritStone: 5, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "dev.start", knownRegionIds: ["dev.start"], tags: [], factionStanding: {} }
    }
  });
  const selectionId = generated.state.run.offer.innateProfiles[0].selectionId;
  return reduce({
    state: generated.state,
    command: { type: "START_RUN", offerId: "offer-ui02-preview", selectionId },
    context: { rulesVersion: RULES_VERSION, contentVersion: CONTENT_VERSION, content, commandId: "cmd:ui02-bootstrap" }
  }).state;
}

const cause = (causeId, templateId, visibility) => ({
  causeId, templateId, originCommandId: `cmd:${causeId}#0`, originNodeIndex: 2, originAge: 24,
  actorIdsByRole: { other: "npc:core:mentor" }, themes: ["promise"], salience: 4, visibility,
  state: "eligible", maturity: { minNode: 0, minAge: 20, conditions: [] },
  eligibleSinceNode: 2, eligibleAge: 24, echoBudget: 2, echoCount: 0,
  facts: { secret: true }, linkedEventIds: ["dev.rescue-echo-a"]
});

const npc = (npcId, definitionId, originKind, displayName, roleTags, extra = {}) => ({
  npcId, originKind, displayName,
  // core NPCs bind through definitionId; generated NPCs bind through archetypeId (state.ts:164)
  ...(originKind === "core" ? { definitionId } : { archetypeId: definitionId }),
  traitTags: ["npc.trait.steadfast"], factIds: ["npc.fact.identity"],
  tags: [...roleTags], roleTags: [...roleTags], actualStatus: "active",
  relation: { affinity: 40, trust: 20, debt: 0, encounterCount: 4 },
  significance: 60, promotedToA: false,
  knowledge: {
    met: true, knownFactIds: ["npc.fact.identity"], knownTraitTags: ["npc.trait.steadfast"],
    knownStatus: "active", lastKnownAge: 26, lastKnownNodeIndex: 8
  },
  createdAge: 24, createdNodeIndex: 0, lastEncounterAge: 26, lastEncounterNodeIndex: 8,
  encounterCount: 4,
  milestoneFacts: [
    { id: `${npcId}#m1`, type: "firstEncounter", sourceRef: `cmd:${npcId}#1`, age: 24, nodeIndex: 0, reasonTag: "dev.start" },
    { id: `${npcId}#m2`, type: "majorRelationChange", sourceRef: `cmd:${npcId}#2`, age: 26, nodeIndex: 8, reasonTag: "dev.start" }
  ],
  ...extra
});

/** A rendered Run in mid-life: public clues, Build identity, known people, full cultivation. */
function runHomeState(content) {
  const base = baseActiveState(content);
  return validateGameState({
    ...base,
    stateVersion: base.stateVersion + 3,
    run: {
      ...base.run,
      nodeIndex: 12,
      age: 27,
      realm: { ...base.run.realm, cultivation: 10_000, cultivationBps: 10_000, realmFoundationBps: 5_400 },
      conditions: [{ id: "condition.injury.1", kind: "injury", stacks: 1, sourceRef: "cmd:ui02-bootstrap" }],
      causes: { byId: { journal_cause: cause("journal_cause", "cause.rescued-stranger", "journal"), hint_cause: cause("hint_cause", "cause.rescued-stranger", "hint"), hidden_cause: cause("hidden_cause", "cause.rescued-stranger", "hidden") } },
      events: { history: [{ eventId: "dev.first-choice", nodeIndex: 3, resultTier: "success" }], current: undefined },
      build: {
        ...base.run.build,
        affinities: {
          "build.sword": { buildId: "build.sword", affinityBps: 4_800, lifetimeEvidence: 3_100, lastEvidenceNodeIndex: 11 },
          "build.body": { buildId: "build.body", affinityBps: 1_200, lifetimeEvidence: 900, lastEvidenceNodeIndex: 6 }
        },
        dominantBuildId: "build.sword",
        unlockedBuildIds: [],
        evidenceFacts: [{ id: "be1", type: "firstEvidence", buildId: "build.sword", source: "cmd:ui02-bootstrap", sourceCommandId: "cmd:ui02-bootstrap", reasonTag: "content01.sword", age: 25, nodeIndex: 4, amount: 700, affinityBefore: 0, affinityAfter: 700 }],
        transitionFacts: [{ id: "bt1", type: "BUILD_STAGE_TRANSITION", buildId: "build.sword", source: "cmd:ui02-bootstrap", sourceCommandId: "cmd:ui02-bootstrap", reasonTag: "content01.sword", age: 26, nodeIndex: 8, fromStage: "emerging", toStage: "formed" }]
      },
      npcs: {
        nextNpcSequence: 3,
        byId: {
          "npc:core:mentor": npc("npc:core:mentor", "dev.mysterious-mentor", "core", "无名老者", ["mentor"]),
          "npc:generated:00000001": npc("npc:generated:00000001", "npc.archetype.merchant", "generated", "柳氏药婆", ["merchant"], {
            relation: { affinity: 65, trust: 40, debt: 0, encounterCount: 6 },
            significance: 80, promotedToA: true, encounterCount: 6,
            milestoneFacts: [
              { id: "npc:generated:00000001#m1", type: "firstEncounter", sourceRef: "cmd:gen#1", age: 24, nodeIndex: 0, reasonTag: "dev.start" },
              { id: "npc:generated:00000001#m2", type: "promotedToA", sourceRef: "cmd:gen#2", age: 26, nodeIndex: 8, reasonTag: "dev.start" }
            ]
          }),
          // Never met: the server must filter this out of every projection (no placeholder, no count).
          "npc:core:unmet-figure": npc("npc:core:unmet-figure", "dev.mysterious-mentor", "core", "未遇之人", ["mentor"], {
            actualStatus: "dead", significance: 99, promotedToA: false,
            relation: { affinity: 0, trust: 0, debt: 0, encounterCount: 0 },
            knowledge: { met: false, knownFactIds: [], knownTraitTags: [] },
            encounterCount: 0, milestoneFacts: []
          })
        },
        roleIndex: { mentor: ["npc:core:mentor", "npc:core:unmet-figure"], merchant: ["npc:generated:00000001"] }
      },
      director: { profileId: "first_run", recentScenes: [{ eventId: "dev.first-choice", nodeIndex: 8, slot: "P4", salience: 4, topicTags: ["mentor"], continuityTags: [], actorIds: ["npc:core:mentor"], buildIds: [] }] }
    }
  });
}

/** The same life with an unresolved ordinary EVENT on screen. */
function eventState(content) {
  const base = runHomeState(content);
  return validateGameState({
    ...base,
    stateVersion: base.stateVersion + 1,
    run: {
      ...base.run,
      realm: { ...base.run.realm, cultivation: 4_000, cultivationBps: 4_000 },
      events: {
        history: base.run.events.history,
        current: { eventId: "dev.first-choice", kind: "choice", instanceId: "inst-ui02-event", participantBindings: { other: "npc:core:mentor" } }
      }
    }
  });
}

/** A dying life facing an authoritative special node (no second breakthrough engine). */
function specialNodeState(content) {
  const base = eventState(content);
  return validateGameState({
    ...base,
    stateVersion: base.stateVersion + 1,
    run: {
      ...base.run,
      status: "dying",
      events: { history: base.run.events.history, current: { eventId: "dev.ordinary-fallback", kind: "combat", instanceId: "inst-ui02-special" } }
    }
  });
}

/** An ended life, for the read-only LIFE_ARCHIVE side page. */
function endedState(content) {
  const base = runHomeState(content);
  return validateGameState({
    ...base,
    stateVersion: base.stateVersion + 2,
    run: {
      ...base.run,
      status: "ended",
      age: 88,
      events: { history: [{ eventId: "dev.first-choice", nodeIndex: 3, resultTier: "success" }, { eventId: "dev.rescue-echo-a", nodeIndex: 9, resultTier: "success" }], current: undefined },
      conditions: [],
      ending: { endingId: "ending.lifespan", age: 88, deathCause: "lifespan", factIds: [] },
      deathRecord: {
        deathCauseId: "death.lifespan", category: "lifespan", age: 88, realmId: "mortal",
        immediateSource: "lifespan", contributingSourceRefs: [], warningFacts: ["risk.category.lifespan"],
        sourceCommandId: "cmd:ui02-end", trace: { resolver: "LIFESPAN" }
      }
    }
  });
}

function present(view) {
  const submission = {
    interactionState: view.currentInteraction?.interactionState ?? "idle",
    mutuallyExclusiveLocked: false,
    requiresReconfirmation: false
  };
  return {
    pageState: view.state.pageState,
    view,
    shell: buildWeChatPageShell(view, submission),
    coreIntents: mapCoreActionIntents(view),
    specialIntents: mapSpecialActionIntents(view),
    archive: buildArchiveView(view)
  };
}

export function buildPreviewStates() {
  const content = contentRegistry();
  const runHome = runHomeState(content);
  const breakthroughBlocked = validateGameState({
    ...runHome,
    stateVersion: runHome.stateVersion + 1,
    run: { ...runHome.run, realm: { ...runHome.run.realm, cultivation: 3_200, cultivationBps: 3_200 } }
  });
  return { content, runHome, event: eventState(content), specialNode: specialNodeState(content), ended: endedState(content), breakthroughBlocked };
}

export function buildPreviewFixtures() {
  const { content, runHome, event, specialNode, ended, breakthroughBlocked } = buildPreviewStates();
  const fullCaps = new ServerViewModelBuilder(content, { capabilities: { PlatformCapability: true, ShareCapability: true, AiNarrativeCapability: true } });
  const noCaps = new ServerViewModelBuilder(content, { capabilities: {} });

  return {
    schemaVersion: 1,
    source: "generated by tools/ui02-preview-fixtures.mjs from real server/core/platform-neutral code; do not hand-edit",
    states: {
      RUN_HOME: present(fullCaps.build(runHome)),
      EVENT: present(fullCaps.build(event)),
      SPECIAL_NODE: present(fullCaps.build(specialNode)),
      LIFE_ARCHIVE: present(fullCaps.build(ended))
    },
    variants: {
      RUN_HOME_BREAKTHROUGH_BLOCKED: present(fullCaps.build(breakthroughBlocked)),
      RUN_HOME_NO_PLATFORM_CAPABILITY: present(noCaps.build(runHome))
    }
  };
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "");
if (isMain) {
  const fixtures = buildPreviewFixtures();
  const serialized = `${JSON.stringify(fixtures, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    fs.writeFileSync(FIXTURE_PATH, serialized, "utf8");
    console.log(`wrote ${FIXTURE_PATH} (${serialized.length} bytes)`);
  } else {
    console.log(`built ${Object.keys(fixtures.states).length} states + ${Object.keys(fixtures.variants).length} variants (${serialized.length} bytes)`);
  }
  for (const [name, entry] of Object.entries({ ...fixtures.states, ...fixtures.variants })) {
    const special = entry.specialIntents.map((intent) => `${intent.intentId}=${intent.enabled}`).join(",") || "none";
    console.log(`${name.padEnd(34)} pageState=${entry.pageState.padEnd(13)} coreIntents=${entry.coreIntents.length} special=[${special}] back=${entry.shell.ordinaryBackAllowed}`);
  }
}
