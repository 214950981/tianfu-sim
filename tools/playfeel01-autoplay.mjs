/**
 * PLAYFEEL01 — bounded authoritative autoplay harness, measurement v2 (acceptance §1).
 *
 * Runs the REAL engine (ContentRegistry + reducer + executeLoggedCommand) so the Director, RNG, progression
 * and every frozen contract are the production ones. Nothing is a UI mock and nothing hand-grants rewards.
 *
 * MEASUREMENT v2 — the Controller's Stage A review found five defects in v1. All five are fixed here and the
 * v1 artifact stays in Git history as `b250687` so the correction is auditable rather than silently swapped:
 *
 *  M1  `curious-traveler` was not "mostly travelling". v1 computed
 *      `actionKinds.filter(a => a === "travel").length % 3 === 2 ? "cultivate" : "travel"`, which stops
 *      changing once the travel count is fixed by the non-travel actions, so the policy degenerated into
 *      "cultivate forever". It is now an explicit, positional six-action cycle and the per-run action
 *      histogram is reported, so the claim is checkable instead of inferred.
 *  M2  "never reached 10000 cultivation" was read off the FINAL cultivation, which is 0 immediately after a
 *      successful breakthrough. That is a measurement artefact: a run can reach full cultivation many times
 *      and end at 9100 in 金丹. The harness now samples every state and reports `everReachedFullCultivation`,
 *      `maxCultivationBeforeBreakthrough`, `firstFullAction`, and separates `firstEligibleBreakthroughAt`
 *      (legal) from `firstAttemptedBreakthroughAt` (actually pressed).
 *  M3  The "time-only streak" searched for the substring `time` in effect labels, which is not the contract.
 *      v1 measure is replaced by a real public-state diff of the state BEFORE and AFTER each
 *      CHOOSE_EVENT_OPTION: age versus cultivation / realm / foundation / resources / conditions /
 *      attributes / NPC / Cause / Build / world tags. Metadata (stateVersion, nodeIndex, rng, director) is
 *      excluded by construction. Both counts are reported: individual time-only choices and the longest run
 *      of consecutive time-only choices.
 *  M4  Zero death samples is not a pass. Two bounded, DIRECTED fixtures drive the authentic engine path —
 *      one lifespan, one lethal risk — and produce the deathRecord from the engine, never by assignment.
 *      They are reported separately and are excluded from natural-policy prevalence.
 *  M5  "has Cause" is not "has cause echo". Each run tracks the origin Event / command that created a Cause,
 *      every later public Cause state change, and each echo / resolution event id, so `NOT_PROVEN` is
 *      reported whenever no origin→echo chain actually occurred. NPC and Build stage trajectories are kept.
 *
 * Usage:
 *   node tools/playfeel01-autoplay.mjs [--json out.json] [--label before|after] [--natural-only]
 */
import fs from "node:fs";
import { CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, NPC_CONTENT01_V1 } from "../packages/content/src/index.ts";
import { reduce, executeLoggedCommand, createCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import { generateServerDestinyOffer } from "../server/src/index.ts";

const SEEDS = [3, 7, 11, 19, 23, 31];
const STRATEGIES = ["guided-cultivator", "curious-traveler", "social-causality"];
const MAX_ACTIONS = 24;
const CULTIVATION_FULL = 10_000;
/** M1: the literal cycle the contract asks for. Indexed positionally, never derived from a counter. */
const CURIOUS_CYCLE = ["travel", "travel", "pursuit", "travel", "travel", "cultivate"];

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const LABEL = args.includes("--label") ? args[args.indexOf("--label") + 1] : "run";
const naturalOnly = args.includes("--natural-only");

const content = new ContentRegistry();
content.registerNpcPack(NPC_CONTENT01_V1);
content.register(CONTENT01_PACK);
const RULES = CONTENT01_PACK.manifest.rulesVersion;

const cultivationOf = (s) => s.run.realm.cultivationBps ?? s.run.realm.cultivation ?? 0;
const foundationOf = (s) => s.run.realm.realmFoundationBps ?? 0;
const realmOf = (s) => s.run.realm.id;
const rootOf = (s) => s.run.identity.innateProfile?.spiritualRoot ?? "(none)";
const causesOf = (s) => Object.values(s.run.causes?.byId ?? {});
const npcsOf = (s) => Object.values(s.run.npcs?.byId ?? {});
const buildsOf = (s) => Object.entries(s.run.build?.affinities ?? {}).map(([buildId, affinity]) => ({ buildId, affinityBps: affinity.affinityBps, dominant: s.run.build.dominantBuildId === buildId }));
const isFull = (s) => cultivationOf(s) >= CULTIVATION_FULL;

/** M3: the public, player-visible state. Deliberately excludes stateVersion / nodeIndex / rng / director. */
function publicFingerprint(s) {
  return JSON.stringify({
    cultivation: cultivationOf(s),
    realm: realmOf(s),
    foundation: foundationOf(s),
    spiritStone: s.run.resources.spiritStone,
    items: s.run.resources.items,
    conditions: s.run.conditions.map((c) => ({ id: c.id, kind: c.kind, stacks: c.stacks })),
    attributes: s.run.attributes,
    npcs: npcsOf(s).map((n) => ({ id: n.npcId, met: n.knowledge.met, status: n.knowledge.knownStatus ?? null, affinity: n.relation.affinity, trust: n.relation.trust, debt: n.relation.debt })),
    causes: causesOf(s).map((c) => ({ id: c.causeId, state: c.state, visibility: c.visibility, echoes: c.echoCount })),
    builds: buildsOf(s),
    techniques: s.run.build.techniques,
    artifacts: s.run.build.artifacts,
    consumables: s.run.build.consumables,
    dominantBuildId: s.run.build.dominantBuildId ?? null,
    worldTags: s.run.world.tags,
    knownRegions: s.run.world.knownRegionIds,
    rootTags: s.run.identity.rootTags,
    titles: s.run.identity.titles
  });
}

function fixture(seed) {
  return {
    schemaVersion: 2, rulesVersion: RULES, contentVersion: CONTENT01_VERSION,
    runId: `run-pf-${seed}`, playerId: `p-pf-${seed}`, rootSeed: `playfeel01-${seed}`,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer-pf-${seed}`,
      age: 16, maxAge: 120, runName: "试玩",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  };
}

/** M1: positional cycle for curious-traveler; the other two policies are unchanged in intent. */
function pickAction(strategy, s, actionIndex) {
  if (strategy === "guided-cultivator") return "cultivate";
  if (strategy === "curious-traveler") return CURIOUS_CYCLE[actionIndex % CURIOUS_CYCLE.length];
  return causesOf(s).some((c) => c.visibility !== "hidden" && c.state !== "resolved") ? "pursuit" : "worldly";
}

function pickOption(strategy, choiceIds) {
  const safe = choiceIds.filter((id) => id !== "take-risk");
  const pool = safe.length > 0 ? safe : choiceIds;
  if (strategy === "guided-cultivator") return pool.find((id) => /engage|keep-driving|sit-again|take-deal|help-dress|clear-trail|work-field/.test(id)) ?? pool[0];
  if (strategy === "curious-traveler") return pool.find((id) => /scout|orient|mark|ease-off|consider/.test(id)) ?? pool[0];
  return choiceIds.find((id) => /bind|meet-player|haggle|ask-source|trade-for-news|stay-listen|sit-through/.test(id)) ?? pool[0];
}

function startRun(strategy, seed) {
  const f = fixture(`${strategy}-${seed}`);
  const generated = generateServerDestinyOffer({ ...f, content });
  let state = generated.state ?? generated;
  const offer = state.run.offer;
  const profiles = offer.innateProfiles ?? [];
  if (profiles.length === 0) throw new Error("offer has no innate profiles");
  const idx = (STRATEGIES.indexOf(strategy) * SEEDS.length + SEEDS.indexOf(seed)) % profiles.length;
  const chosen = profiles[idx];
  state = reduce({ state, command: { type: "START_RUN", offerId: offer.offerId, selectionId: chosen.selectionId }, context: { rulesVersion: RULES, contentVersion: CONTENT01_VERSION, content, commandId: `pf:${strategy}:${seed}:start` } }).state;
  return state;
}

function runOne(strategy, seed) {
  let state = startRun(strategy, seed);
  let log = createCommandLog(state);

  const steps = [];
  const actionHistogram = {};
  let seq = 0;
  let breakthroughAttempts = 0, breakthroughSuccess = 0;
  let retreatsPending = 0;               // contract: "失败继续准备" — rebuild foundation before retrying
  let actionIndex = 0;                   // M1: positional cycle input
  const seenEvents = [];

  // M2: sample every state, not just the last one.
  let everReachedFullCultivation = isFull(state);
  let firstFullAction = isFull(state) ? 0 : null;
  let firstEligibleBreakthroughAt = null;   // first action index where cultivation == 10000 (legal, not pressed)
  let firstAttemptedBreakthroughAt = null;  // first action index where ATTEMPT_BREAKTHROUGH was submitted
  let maxCultivationBeforeBreakthrough = cultivationOf(state);

  // M3
  let timeOnlyChoices = 0, eventChoices = 0, longestTimeOnlyChoiceStreak = 0, currentTimeOnlyChoiceStreak = 0;

  // M5
  const causeOrigins = [];
  const causeEchoes = [];
  const npcTrajectory = [];
  const buildTrajectory = [];
  let lastNpcSig = "", lastBuildSig = "";

  while (actionIndex < MAX_ACTIONS && state.run.status === "active") {
    const current = state.run.events.current;
    const beforeFingerprint = publicFingerprint(state);
    const beforeAge = state.run.age;
    const beforeCauseIds = new Set(causesOf(state).map((c) => c.causeId));
    let command;
    if (current === undefined) {
      if (strategy === "guided-cultivator" && isFull(state) && retreatsPending === 0) {
        if (firstEligibleBreakthroughAt === null) firstEligibleBreakthroughAt = actionIndex + 1;
        if (firstAttemptedBreakthroughAt === null) firstAttemptedBreakthroughAt = actionIndex + 1;
        maxCultivationBeforeBreakthrough = Math.max(maxCultivationBeforeBreakthrough, cultivationOf(state));
        command = { type: "ATTEMPT_BREAKTHROUGH" };
        breakthroughAttempts += 1;
      } else {
        if (isFull(state) && firstEligibleBreakthroughAt === null) firstEligibleBreakthroughAt = actionIndex + 1;
        const action = pickAction(strategy, state, actionIndex);
        actionHistogram[action] = (actionHistogram[action] ?? 0) + 1;
        command = { type: "CHOOSE_ACTION", actionId: action };
        if (retreatsPending > 0 && action === "cultivate") retreatsPending -= 1;
      }
      actionIndex += 1;
    } else {
      const event = content.getEvent(state.contentVersion, current.eventId);
      const ids = (event.choices ?? []).map((c) => c.id);
      command = { type: "CHOOSE_EVENT_OPTION", eventId: current.eventId, optionId: pickOption(strategy, ids) };
    }

    const envelope = {
      commandId: `pf:${strategy}:${seed}:${seq}`, playerId: state.run.playerId, runId: state.run.runId,
      expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion,
      clientPlatform: "dev", clientBuild: "playfeel01", command
    };
    let output;
    try {
      const executed = executeLoggedCommand(state, log, envelope, {}, content);
      output = executed.output; log = executed.commandLog;
    } catch (error) {
      steps.push({ seq, commandId: envelope.commandId, kind: command.type, error: `${error?.code ?? error?.name}: ${error?.messageKey ?? error?.message ?? ""}`.trim() });
      break;
    }
    const beforeRealm = realmOf(state);
    state = output.state;
    seq += 1;

    // M2 sampling
    if (isFull(state)) { everReachedFullCultivation = true; if (firstFullAction === null) firstFullAction = actionIndex; }
    if (command.type !== "ATTEMPT_BREAKTHROUGH") maxCultivationBeforeBreakthrough = Math.max(maxCultivationBeforeBreakthrough, cultivationOf(state));

    if (command.type === "ATTEMPT_BREAKTHROUGH") {
      const advanced = realmOf(state) !== beforeRealm;
      if (advanced) breakthroughSuccess += 1;
      retreatsPending = advanced ? 0 : 2;
    }

    // M3: a real public-state diff, not a label substring.
    let timeOnly = false;
    if (current !== undefined) {
      eventChoices += 1;
      const afterFingerprint = publicFingerprint(state);
      timeOnly = afterFingerprint === beforeFingerprint && state.run.age !== beforeAge;
      if (timeOnly) { timeOnlyChoices += 1; currentTimeOnlyChoiceStreak += 1; longestTimeOnlyChoiceStreak = Math.max(longestTimeOnlyChoiceStreak, currentTimeOnlyChoiceStreak); }
      else currentTimeOnlyChoiceStreak = 0;
    }

    // M5: origin / echo tracking on the public Cause list.
    const afterCauses = causesOf(state);
    for (const cause of afterCauses) {
      if (!beforeCauseIds.has(cause.causeId)) {
        causeOrigins.push({ commandId: envelope.commandId, eventId: current?.eventId ?? null, nodeIndex: state.run.nodeIndex, age: state.run.age, causeId: cause.causeId, templateId: cause.templateId, visibility: cause.visibility });
      } else {
        const prior = causeOrigins.find((o) => o.causeId === cause.causeId);
        if (prior !== undefined && prior.state !== cause.state) causeEchoes.push({ commandId: envelope.commandId, eventId: current?.eventId ?? null, age: state.run.age, causeId: cause.causeId, from: prior.state, to: cause.state, visibility: cause.visibility });
      }
    }
    for (const origin of causeOrigins) { const live = afterCauses.find((c) => c.causeId === origin.causeId); if (live !== undefined) origin.state = live.state; }
    if (current !== undefined && current.triggeringCauseId !== undefined) {
      causeEchoes.push({ commandId: envelope.commandId, eventId: current.eventId, age: state.run.age, causeId: current.triggeringCauseId, triggering: true, visibility: "journal" });
    }

    const npcSig = npcsOf(state).map((n) => `${n.npcId}:${n.knowledge.knownStatus ?? "?"}:${n.relation.affinity}:${n.relation.debt}`).join("|");
    const buildSig = buildsOf(state).map((b) => `${b.buildId}:${b.affinityBps}:${b.dominant === true}`).join("|");
    if (current !== undefined && npcSig !== lastNpcSig) { npcTrajectory.push({ at: seq, age: state.run.age, eventId: current.eventId, npcs: npcsOf(state).map((n) => ({ id: n.npcId, status: n.knowledge.knownStatus ?? null, affinity: n.relation.affinity, debt: n.relation.debt })) }); lastNpcSig = npcSig; }
    if (current !== undefined && buildSig !== lastBuildSig) { buildTrajectory.push({ at: seq, age: state.run.age, eventId: current.eventId, builds: buildsOf(state) }); lastBuildSig = buildSig; }

    if (current !== undefined) seenEvents.push(current.eventId);
    const event = current === undefined ? null : content.getEvent(state.contentVersion, current.eventId);
    steps.push({
      seq, commandId: envelope.commandId, stateVersion: state.stateVersion,
      age: state.run.age, maxAge: state.run.maxAge,
      realm: realmOf(state), cultivation: cultivationOf(state), foundation: foundationOf(state),
      action: command.type === "CHOOSE_ACTION" ? command.actionId : command.type === "ATTEMPT_BREAKTHROUGH" ? "(attempt-breakthrough)" : null,
      eventId: current?.eventId ?? null,
      eventTitleKey: event?.titleKey ?? null,
      choiceId: command.optionId ?? null,
      nodeIndex: state.run.nodeIndex,
      effects: (output.effects ?? []).map((e) => e.labelKey ?? e.kind ?? e.op ?? String(e)),
      narrative: (output.narrativeFacts ?? []).map((f) => f.type),
      timeOnlyChoice: timeOnly,
      npcs: npcsOf(state).map((n) => n.npcId),
      causes: afterCauses.map((c) => ({ id: c.causeId, visibility: c.visibility, templateId: c.templateId, state: c.state })),
      builds: buildsOf(state).map((b) => ({ id: b.buildId, affinityBps: b.affinityBps, dominant: b.dominant })),
      status: state.run.status,
      ruleStateHash: ruleStateHash(state)
    });
  }

  const death = state.run.deathRecord ?? null;
  return {
    strategy, seed, label: LABEL, root: rootOf(state),
    coreActions: steps.filter((s) => s.action !== null).length,
    eventChoices,
    actionHistogram,
    finalAge: state.run.age, maxAge: state.run.maxAge,
    finalStatus: state.run.status, finalRealm: realmOf(state), finalCultivation: cultivationOf(state),
    everReachedFullCultivation, maxCultivationBeforeBreakthrough, firstFullAction,
    firstEligibleBreakthroughAt, firstAttemptedBreakthroughAt,
    breakthroughAttempts, breakthroughSuccess,
    timeOnlyChoices, longestTimeOnlyChoiceStreak,
    causeOrigins: causeOrigins.map((o) => ({ causeId: o.causeId, templateId: o.templateId, eventId: o.eventId, age: o.age, visibility: o.visibility, state: o.state ?? "unknown" })),
    causeEchoes,
    npcTrajectory, buildTrajectory,
    death: death === null ? null : { category: death.category, causeId: death.deathCauseId, age: death.age, immediateSource: death.immediateSource, sourceEventId: death.sourceEventId ?? null, realmId: death.realmId, wasWarned: death.warningFacts.length > 0 },
    uniqueEvents: [...new Set(seenEvents)].length,
    steps
  };
}

// =========================================================================== M4: directed death fixtures
/**
 * Lifespan death, driven through the real reducer. The fixture only sets how much life is left; the
 * `deathRecord` itself is written by `resolveTimeAdvance` when the last year is spent, so nothing about the
 * ending is assigned by this harness.
 */
function directedLifespanDeath(seed) {
  const f = fixture(`lifespan-${seed}`);
  f.fixture.maxAge = 18;              // two years of head-room above the starting age of 16
  const generated = generateServerDestinyOffer({ ...f, content });
  let state = generated.state ?? generated;
  const offer = state.run.offer;
  const chosen = (offer.innateProfiles ?? [])[seed % (offer.innateProfiles ?? [1]).length];
  state = reduce({ state, command: { type: "START_RUN", offerId: offer.offerId, selectionId: chosen.selectionId }, context: { rulesVersion: RULES, contentVersion: CONTENT01_VERSION, content, commandId: `pf:lifespan:${seed}:start` } }).state;
  let log = createCommandLog(state);
  for (let i = 0; i < 12 && state.run.status === "active"; i += 1) {
    const envelope = { commandId: `pf:lifespan:${seed}:${i}`, playerId: state.run.playerId, runId: state.run.runId, expectedStateVersion: state.stateVersion, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, clientPlatform: "dev", clientBuild: "playfeel01", command: { type: "CHOOSE_ACTION", actionId: "cultivate" } };
    const executed = executeLoggedCommand(state, log, envelope, {}, content); state = executed.output.state; log = executed.commandLog;
  }
  const d = state.run.deathRecord ?? null;
  return { kind: "directed-lifespan", seed, reached: state.run.status !== "active" && d !== null, finalStatus: state.run.status, age: state.run.age, maxAge: state.run.maxAge, death: d === null ? null : { category: d.category, causeId: d.deathCauseId, age: d.age, immediateSource: d.immediateSource, realmId: d.realmId } };
}

/**
 * Lethal-risk death, driven through the real reducer. Only the *setup* is crafted (a run standing on a lethal
 * Risk Event with the injury precondition the Risk pack itself declares); the tier, the fatality and the
 * deathRecord all come from `resolveOutcome` + the reducer. Seeds are searched within a bounded budget.
 */
function directedLethalDeath(seed, eventId) {
  const f = fixture(`fatal-${seed}`);
  const generated = generateServerDestinyOffer({ ...f, content });
  let state = generated.state ?? generated;
  const offer = state.run.offer;
  const chosen = (offer.innateProfiles ?? [])[seed % (offer.innateProfiles ?? [1]).length];
  state = reduce({ state, command: { type: "START_RUN", offerId: offer.offerId, selectionId: chosen.selectionId }, context: { rulesVersion: RULES, contentVersion: CONTENT01_VERSION, content, commandId: `pf:fatal:${seed}:start` } }).state;
  // The Risk pack's own lethality policy demands injury.level >= 2; stand the run up with the registered
  // injury condition so the pack's declared precondition is satisfied through legal state, not a bypass.
  const conditions = [{ id: "condition.progression.breakthrough-injury", kind: "injury", stacks: 2, sourceRef: `pf:fatal:${seed}:setup` }];
  const placed = { ...state, run: { ...state.run, conditions, events: { ...state.run.events, current: { eventId, kind: "choice" } } } };
  let ok = false, death = null, tiers = [], attempts = 0;
  try {
    let log = createCommandLog(placed);
    let cursor = placed;
    for (let i = 0; i < 6 && cursor.run.status === "active"; i += 1) {
      const event = content.getEvent(cursor.contentVersion, eventId);
      const ids = (event.choices ?? []).map((c) => c.id);
      const optionId = ids.find((id) => id === "take-risk") ?? ids[0];
      const envelope = { commandId: `pf:fatal:${seed}:${i}`, playerId: cursor.run.playerId, runId: cursor.run.runId, expectedStateVersion: cursor.stateVersion, rulesVersion: cursor.rulesVersion, contentVersion: cursor.contentVersion, clientPlatform: "dev", clientBuild: "playfeel01", command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId } };
      const executed = executeLoggedCommand(cursor, log, envelope, {}, content);
      attempts += 1;
      tiers.push(executed.output.narrativeFacts.filter((fact) => fact.type === "EVENT_OUTCOME").map((fact) => fact.appliedTier)[0] ?? null);
      cursor = executed.output.state; log = executed.commandLog;
      if (cursor.run.deathRecord !== undefined && cursor.run.deathRecord !== null) { death = cursor.run.deathRecord; ok = true; break; }
      // re-arm the same decisive event, still through legal state
      if (i < 5) cursor = { ...cursor, run: { ...cursor.run, conditions, events: { ...cursor.run.events, current: { eventId, kind: "choice" } } } };
    }
  } catch (error) {
    return { kind: "directed-lethal", seed, eventId, reached: false, error: `${error?.code ?? error?.name}: ${error?.messageKey ?? error?.message ?? ""}`.trim() };
  }
  return { kind: "directed-lethal", seed, eventId, reached: ok && death !== null, attempts, tiers, death: death === null ? null : { category: death.category, causeId: death.deathCauseId, age: death.age, immediateSource: death.immediateSource, sourceEventId: death.sourceEventId ?? null, realmId: death.realmId } };
}

const runs = [];
for (const strategy of STRATEGIES) for (const seed of SEEDS) runs.push(runOne(strategy, seed));

// M4: bounded search for a lethal sample. `content01.risk.ruin-depth` carries threat.dangerous-exploration.
const LETHAL_EVENT = "content01.risk.ruin-depth";
const directed = [];
if (!naturalOnly) {
  directed.push(directedLifespanDeath(3));
  let lethal = null;
  for (let s = 0; s < 24 && lethal === null; s += 1) {
    const probe = directedLethalDeath(s, LETHAL_EVENT);
    if (probe.reached) lethal = { ...probe, searchedSeeds: s + 1 };
  }
  directed.push(lethal ?? { kind: "directed-lethal", eventId: LETHAL_EVENT, reached: false, searchedSeeds: 24, note: "NOT_REACHED within the bounded search of 24 seeds" });
}

const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
const summary = {
  label: LABEL, seeds: SEEDS, strategies: STRATEGIES, maxActions: MAX_ACTIONS, measurement: "v2",
  runs: runs.map((r) => ({
    strategy: r.strategy, seed: r.seed, root: r.root, coreActions: r.coreActions, eventChoices: r.eventChoices,
    actionHistogram: r.actionHistogram,
    finalAge: r.finalAge, maxAge: r.maxAge, finalStatus: r.finalStatus, finalRealm: r.finalRealm, finalCultivation: r.finalCultivation,
    everReachedFullCultivation: r.everReachedFullCultivation, maxCultivationBeforeBreakthrough: r.maxCultivationBeforeBreakthrough, firstFullAction: r.firstFullAction,
    firstEligibleBreakthroughAt: r.firstEligibleBreakthroughAt, firstAttemptedBreakthroughAt: r.firstAttemptedBreakthroughAt,
    breakthroughAttempts: r.breakthroughAttempts, breakthroughSuccess: r.breakthroughSuccess,
    timeOnlyChoices: r.timeOnlyChoices, longestTimeOnlyChoiceStreak: r.longestTimeOnlyChoiceStreak,
    uniqueEvents: r.uniqueEvents,
    causeOriginCount: r.causeOrigins.length, causeEchoCount: r.causeEchoes.length,
    causeChain: r.causeOrigins.length > 0 && r.causeEchoes.length > 0,
    death: r.death
  })),
  directed
};

console.log(`== PLAYFEEL01 autoplay [${LABEL}] measurement v2 : ${runs.length} natural runs, <=${MAX_ACTIONS} core actions each ==`);
console.log("| strategy | seed | root | core | events | hist(T/P/W/C) | age/max | status | realm | cult | everFull | maxBeforeBT | firstElig | firstTry | BT ok/all | timeOnly | tOnlyStreak | uniq | causeOrig | causeEcho | death |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of runs) {
  const h = r.actionHistogram;
  console.log(`| ${r.strategy} | ${r.seed} | ${r.root} | ${r.coreActions} | ${r.eventChoices} | ${h.travel ?? 0}/${h.pursuit ?? 0}/${h.worldly ?? 0}/${h.cultivate ?? 0} | ${r.finalAge}/${r.maxAge} | ${r.finalStatus} | ${r.finalRealm} | ${r.finalCultivation} | ${r.everReachedFullCultivation} | ${r.maxCultivationBeforeBreakthrough} | ${r.firstEligibleBreakthroughAt ?? "-"} | ${r.firstAttemptedBreakthroughAt ?? "-"} | ${r.breakthroughSuccess}/${r.breakthroughAttempts} | ${r.timeOnlyChoices}/${r.eventChoices} | ${r.longestTimeOnlyChoiceStreak} | ${r.uniqueEvents} | ${r.causeOrigins.length} | ${r.causeEchoes.length} | ${r.death === null ? "-" : `${r.death.category}@${r.death.age}`} |`);
}
console.log("");
const everFull = runs.filter((r) => r.everReachedFullCultivation).length;
const mortalOld = runs.filter((r) => r.finalAge >= 50 && r.finalRealm === "mortal").length;
const legalWithin8 = runs.filter((r) => r.firstEligibleBreakthroughAt !== null && r.firstEligibleBreakthroughAt <= 8).length;
const triedWithin8 = runs.filter((r) => r.firstAttemptedBreakthroughAt !== null && r.firstAttemptedBreakthroughAt <= 8).length;
const causeChain = runs.filter((r) => r.causeOrigins.length > 0 && r.causeEchoes.length > 0).length;
const naturalDeaths = runs.filter((r) => r.death !== null).length;
console.log(`natural: ${runs.length} runs | ever reached 10000 = ${everFull} (${pct(everFull, runs.length)}) | 50+ still mortal = ${mortalOld} | eligible breakthrough within 8 = ${legalWithin8} | attempted within 8 = ${triedWithin8} | breakthrough ok/attempts = ${runs.reduce((a, r) => a + r.breakthroughSuccess, 0)}/${runs.reduce((a, r) => a + r.breakthroughAttempts, 0)} | time-only choices = ${runs.reduce((a, r) => a + r.timeOnlyChoices, 0)}/${runs.reduce((a, r) => a + r.eventChoices, 0)} | longest run of consecutive time-only = ${Math.max(0, ...runs.map((r) => r.longestTimeOnlyChoiceStreak))} | cause origin+echo runs = ${causeChain} | natural deaths = ${naturalDeaths}`);
for (const d of directed) console.log(`directed: ${d.kind} reached=${d.reached} ${d.death ? `=> ${d.death.category}@${d.death.age} via ${d.death.immediateSource}/${d.death.causeId}` : d.note ?? d.error ?? ""}`);

if (jsonOut !== null) { fs.writeFileSync(jsonOut, JSON.stringify({ summary, runs, directed }, null, 1) + "\n", "utf8"); console.log(`wrote ${jsonOut}`); }
