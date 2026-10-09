/**
 * PLAYFEEL01 — bounded authoritative autoplay harness (acceptance §1).
 *
 * Runs the REAL engine (ContentRegistry + reducer + executeLoggedCommand) so the Director, RNG, progression
 * and every frozen contract are the production ones. Nothing is a UI mock and nothing hand-grants rewards.
 *
 * CRITICAL: the run must be started the way the client starts it — by selecting one of the generated innate
 * profiles. Without `selectionId`, `run.identity.innateProfile` stays undefined and `applyRetreatProgression`
 * returns early, so retreat would silently grant nothing and every baseline number would be meaningless.
 *
 * Usage: node tools/playfeel01-autoplay.mjs [--json out.json] [--label before|after]
 */
import fs from "node:fs";
import { CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, NPC_CONTENT01_V1 } from "../packages/content/src/index.ts";
import { reduce, executeLoggedCommand, createCommandLog, ruleStateHash } from "../packages/core/src/index.ts";
import { generateServerDestinyOffer } from "../server/src/index.ts";

const SEEDS = [3, 7, 11, 19, 23, 31];
const STRATEGIES = ["guided-cultivator", "curious-traveler", "social-causality"];
const MAX_ACTIONS = 24;
const CULTIVATION_FULL = 10_000;

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const LABEL = args.includes("--label") ? args[args.indexOf("--label") + 1] : "run";

const content = new ContentRegistry();
content.registerNpcPack(NPC_CONTENT01_V1);
content.register(CONTENT01_PACK);
const RULES = CONTENT01_PACK.manifest.rulesVersion;

const cultivationOf = (s) => s.run.realm?.cultivationBps ?? s.run.realm?.cultivation ?? 0;
const foundationOf = (s) => s.run.realm?.realmFoundationBps ?? 0;
const realmOf = (s) => s.run.realm?.id ?? "?";
const rootOf = (s) => s.run.identity?.innateProfile?.spiritualRoot ?? "(无灵根)";
const causesOf = (s) => Object.values(s.run.causes?.byId ?? {});
const npcsOf = (s) => Object.values(s.run.npcs?.byId ?? {});
const buildsOf = (s) => {
  const b = s.run.build; if (b === undefined || b === null) return [];
  if (Array.isArray(b)) return b;
  return Object.values(b.tracks ?? b.byId ?? {});
};
const isFull = (s) => cultivationOf(s) >= CULTIVATION_FULL;

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

function pickAction(strategy, s, actionKinds) {
  const hasCause = causesOf(s).some((c) => c.visibility !== "hidden");
  if (strategy === "guided-cultivator") return "cultivate";
  if (strategy === "curious-traveler") return actionKinds.filter((a) => a === "travel").length % 3 === 2 ? "cultivate" : "travel";
  return hasCause ? "pursuit" : "worldly";
}

function pickOption(strategy, choiceIds) {
  const safe = choiceIds.filter((id) => !/^take-risk$/.test(id));
  const pool = safe.length > 0 ? safe : choiceIds;
  if (strategy === "guided-cultivator") return pool.find((id) => /engage|keep-driving|sit-again|take-deal|help-dress|clear-trail|work-field/.test(id)) ?? pool[0];
  if (strategy === "curious-traveler") return pool.find((id) => /scout|orient|mark|ease-off|consider/.test(id)) ?? pool[0];
  return choiceIds.find((id) => /bind|meet-player|haggle|ask-source|trade-for-news|stay-listen|sit-through/.test(id)) ?? pool[0];
}

function runOne(strategy, seed) {
  const f = fixture(`${strategy}-${seed}`);
  const generated = generateServerDestinyOffer({ ...f, content });
  let state = generated.state ?? generated;
  const offer = state.run.offer;
  const profiles = offer.innateProfiles ?? [];
  if (profiles.length === 0) throw new Error("offer has no innate profiles");
  const idx = (STRATEGIES.indexOf(strategy) * SEEDS.length + SEEDS.indexOf(seed)) % profiles.length;
  const chosen = profiles[idx];
  const startContext = { rulesVersion: RULES, contentVersion: CONTENT01_VERSION, content, commandId: `pf:${strategy}:${seed}:start` };
  state = reduce({ state, command: { type: "START_RUN", offerId: offer.offerId, selectionId: chosen.selectionId }, context: startContext }).state;
  let log = createCommandLog(state);

  const steps = [];
  const actionKinds = [];
  let seq = 0;
  let breakthroughAttempts = 0, breakthroughSuccess = 0;
  let retreatsPending = 0;   // 突破失败后必须先闭关重建根基，合同要求「失败继续准备」
  let firstLegalAt = null;
  const seenEvents = [];
  let actionsUsed = 0;

  while (actionsUsed < MAX_ACTIONS && state.run.status === "active") {
    const current = state.run.events.current;
    let command;
    if (current === undefined) {
      if (strategy === "guided-cultivator" && isFull(state) && retreatsPending === 0) {
        if (firstLegalAt === null) firstLegalAt = actionsUsed + 1;
        command = { type: "ATTEMPT_BREAKTHROUGH" };
        breakthroughAttempts += 1;
      } else {
        const action = pickAction(strategy, state, actionKinds);
        actionKinds.push(action);
        command = { type: "CHOOSE_ACTION", actionId: action };
        if (retreatsPending > 0 && action === "cultivate") retreatsPending -= 1;
      }
      actionsUsed += 1;
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
    if (command.type === "ATTEMPT_BREAKTHROUGH") {
      const advanced = realmOf(state) !== beforeRealm;
      if (advanced) breakthroughSuccess += 1;
      retreatsPending = advanced ? 0 : 2;   // 失败后先补两次闭关重建根基
    }
    if (current !== undefined) seenEvents.push(current.eventId);
    const event = current === undefined ? null : content.getEvent(state.contentVersion, current.eventId);
    steps.push({
      seq, commandId: envelope.commandId, stateVersion: state.stateVersion,
      age: state.run.age, maxAge: state.run.maxAge,
      realm: realmOf(state), cultivation: cultivationOf(state), foundation: foundationOf(state),
      action: command.type === "CHOOSE_ACTION" ? command.actionId : command.type === "ATTEMPT_BREAKTHROUGH" ? "(突破尝试)" : null,
      eventId: current?.eventId ?? null,
      eventTitleKey: event?.titleKey ?? null,
      choiceId: command.optionId ?? null,
      nodeIndex: state.run.nodeIndex,
      effects: (output.effects ?? []).map((e) => e.labelKey ?? e.kind ?? e.op ?? String(e)),
      npcs: npcsOf(state).map((n) => n.npcId ?? n.id ?? n.archetypeId),
      causes: causesOf(state).map((c) => ({ id: c.causeId, visibility: c.visibility, templateId: c.templateId })),
      builds: buildsOf(state).map((b) => ({ id: b.buildId, stage: b.stage, dominant: b.dominant })),
      status: state.run.status,
      ruleStateHash: ruleStateHash(state)
    });
  }

  const death = state.run.deathRecord ?? null;
  return {
    strategy, seed, label: LABEL, root: rootOf(state),
    coreActions: steps.filter((s) => s.action !== null).length,
    eventChoices: steps.filter((s) => s.choiceId != null).length,
    finalAge: state.run.age, maxAge: state.run.maxAge,
    finalStatus: state.run.status, finalRealm: realmOf(state), finalCultivation: cultivationOf(state),
    firstLegalAt, breakthroughAttempts, breakthroughSuccess,
    death: death === null ? null : { category: death.category, causeId: death.deathCauseId, age: death.age, immediateSource: death.immediateSource },
    uniqueEvents: [...new Set(seenEvents)].length,
    timeOnlyStreak: longestTimeOnlyStreak(steps),
    steps
  };
}

function longestTimeOnlyStreak(steps) {
  let best = 0, cur = 0;
  for (const s of steps) {
    const effs = s.effects ?? [];
    const timeOnly = effs.length > 0 && effs.every((e) => /time/.test(String(e)));
    if (timeOnly) { cur += 1; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

const runs = [];
for (const strategy of STRATEGIES) for (const seed of SEEDS) runs.push(runOne(strategy, seed));

const summary = {
  label: LABEL, seeds: SEEDS, strategies: STRATEGIES, maxActions: MAX_ACTIONS,
  runs: runs.map((r) => ({ strategy: r.strategy, seed: r.seed, root: r.root, coreActions: r.coreActions, eventChoices: r.eventChoices, finalAge: r.finalAge, maxAge: r.maxAge, finalStatus: r.finalStatus, finalRealm: r.finalRealm, finalCultivation: r.finalCultivation, firstLegalAt: r.firstLegalAt, breakthroughAttempts: r.breakthroughAttempts, breakthroughSuccess: r.breakthroughSuccess, uniqueEvents: r.uniqueEvents, timeOnlyStreak: r.timeOnlyStreak, death: r.death }))
};

console.log(`== PLAYFEEL01 autoplay [${LABEL}] : ${runs.length} 局，每局 ≤${MAX_ACTIONS} 次核心行动 ==`);
console.log("| 策略 | seed | 灵根 | 核心行动 | 事件选项 | 终龄/寿元 | 状态 | 境界 | 修为 | 首次突破合法 | 尝试/成功 | 唯一事件 | 纯时间连击 | 死因 |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of runs) {
  console.log(`| ${r.strategy} | ${r.seed} | ${r.root} | ${r.coreActions} | ${r.eventChoices} | ${r.finalAge}/${r.maxAge} | ${r.finalStatus} | ${r.finalRealm} | ${r.finalCultivation} | ${r.firstLegalAt ?? "-"} | ${r.breakthroughAttempts}/${r.breakthroughSuccess} | ${r.uniqueEvents} | ${r.timeOnlyStreak} | ${r.death === null ? "-" : `${r.death.category}@${r.death.age}`} |`);
}
const mortalOld = runs.filter((r) => r.finalAge >= 50 && r.finalRealm === "mortal").length;
const neverFull = runs.filter((r) => r.finalCultivation < CULTIVATION_FULL).length;
const legalWithin8 = runs.filter((r) => r.firstLegalAt !== null && r.firstLegalAt <= 8).length;
console.log("");
console.log(`汇总：${runs.length} 局｜50岁仍凡人 = ${mortalOld}｜从未达 10000 修为 = ${neverFull}｜8次行动内出现合法突破入口 = ${legalWithin8}｜连续≥5 次仅时间变化 = ${runs.filter((r) => r.timeOnlyStreak >= 5).length}｜有死因 = ${runs.filter((r) => r.death !== null).length}｜产生因果 = ${runs.filter((r) => r.steps.some((s) => (s.causes ?? []).length > 0)).length}`);

if (jsonOut !== null) { fs.writeFileSync(jsonOut, JSON.stringify({ summary, runs }, null, 1) + "\n", "utf8"); console.log(`已写出 ${jsonOut}`); }
