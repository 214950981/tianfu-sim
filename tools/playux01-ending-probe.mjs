/**
 * PLAYUX01 阶段 A/D 探针 —— 复现规范第 6 节点名的 ENDING 0/0/0 vs LIFE_BOOK 11/4/2 冲突。
 *
 * 规范要求：「先用确切的存档投影及 stage 比较复现」「未复现时写出实际观测、可疑路径和残余风险，
 * 不得凭推断修改数据库数据」。本脚本只读，不改任何状态。
 *
 * 运行：node tools/playux01-ending-probe.mjs
 */
import { CONTENT01_PACK, CONTENT01_VERSION, ContentRegistry, NPC_CONTENT01_V1 } from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, validateGameState } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

function registry() {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
}
function ctx(content, state, commandId) {
  return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId };
}
/** 走完一生，返回 ended/dying 的权威 state 与其 history 事实。 */
function playLife(seed, maxAge, actionCycle) {
  const content = registry();
  let state = createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:ending:${seed}`,
    playerId: "player:ending",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:ending:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20,
      maxAge,
      runName: "终局探针",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: false
    }
  });
  state = reduce({ state, command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" }, context: ctx(content, state, `cmd:${seed}:start`) }).state;
  let step = 0;
  // 只在 active 时继续；dying/ended 是终局，reducer 会拒绝进一步命令。
  while (state.run.status === "active") {
    if (state.run.events.current !== undefined) {
      const cur = state.run.events.current.eventId;
      const ev = content.getEvent(state.contentVersion, cur);
      const safe = ev.choices.find((c) => ["turn-away", "decline", "consider", "leave", "read-signs"].includes(c.id)) ?? ev.choices[0];
      state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: cur, optionId: safe.id }, context: ctx(content, state, `cmd:${seed}:r:${step}`) }).state;
    } else {
      state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: actionCycle[step % actionCycle.length] }, context: ctx(content, state, `cmd:${seed}:a:${step}`) }).state;
    }
    step += 1;
    if (step > 400) break;
  }
  return { content, state };
}

function counters(lifeBook) {
  if (lifeBook === undefined || lifeBook === null) return null;
  return {
    events: Array.isArray(lifeBook.events) ? lifeBook.events.length : null,
    people: Array.isArray(lifeBook.people) ? lifeBook.people.length : null,
    builds: Array.isArray(lifeBook.builds) ? lifeBook.builds.length : null,
    causes: Array.isArray(lifeBook.causes) ? lifeBook.causes.length : null
  };
}

const CASES = [
  { seed: "cycle-4", maxAge: 40, cycle: ["cultivate", "travel", "worldly", "pursuit"] },
  { seed: "cycle-travel", maxAge: 36, cycle: ["travel"] },
  { seed: "cycle-worldly", maxAge: 30, cycle: ["worldly"] },
  { seed: "cycle-pursuit", maxAge: 30, cycle: ["pursuit"] },
  { seed: "cycle-cultivate", maxAge: 26, cycle: ["cultivate"] }
];

const builder = () => new ServerViewModelBuilder(registry());
const rows = [];
for (const c of CASES) {
  const { content, state } = playLife(c.seed, c.maxAge, c.cycle);
  // 1) 无 sidecar（刚刚过世，UI04E sidecar 尚未创建）—— 这正是真机 ENDING 首屏的形态
  const noSidecar = builder().build(state);
  // 2) 有 sidecar：ENDING stage
  const ending = builder().buildWithTerminal(state, { stage: "ENDING", version: 0, transitions: {} }, "idle");
  // 3) 有 sidecar：LIFE_BOOK stage（同一权威 state，只换 stage）
  const lifeBook = builder().buildWithTerminal(state, { stage: "LIFE_BOOK", version: 1, transitions: {} }, "idle");
  // 4) REBIRTH_RESULT
  const rebirth = builder().buildWithTerminal(state, { stage: "REBIRTH_RESULT", version: 2, transitions: {} }, "idle");

  const noSidecarTerminal = noSidecar.state.terminal;
  rows.push({
    seed: c.seed,
    cycle: c.cycle,
    runStatus: state.run.status,
    age: state.run.age,
    nodes: state.run.nodeIndex,
    deathRecord: state.run.deathRecord === undefined ? null : {
      deathCauseId: state.run.deathRecord.deathCauseId,
      category: state.run.deathRecord.category,
      immediateSource: state.run.deathRecord.immediateSource,
      age: state.run.deathRecord.age
    },
    ending: state.run.ending === undefined ? null : { endingId: state.run.ending.endingId, deathCause: state.run.ending.deathCause ?? null },
    authoritativeFacts: {
      historyEntries: state.run.events.history.length,
      metNpcs: Object.values(state.run.npcs.byId).filter((n) => n.knowledge.met).length,
      buildAffinities: Object.keys(state.run.build.affinities).length,
      publicCauses: Object.values(state.run.causes.byId).filter((c2) => c2.visibility !== "hidden").length
    },
    pageStateNoSidecar: noSidecar.state.pageState,
    terminalNoSidecar: noSidecarTerminal === undefined ? "ABSENT" : counters(noSidecarTerminal.lifeBook),
    pageStateEnding: ending.state.pageState,
    countersEnding: counters(ending.state.terminal?.lifeBook),
    pageStateLifeBook: lifeBook.state.pageState,
    countersLifeBook: counters(lifeBook.state.terminal?.lifeBook),
    rebirthCounters: lifeBook.state.terminal?.rebirthResult === undefined
      ? null
      : {
          eventsExperienced: lifeBook.state.terminal.rebirthResult.eventsExperienced,
          peopleMet: lifeBook.state.terminal.rebirthResult.peopleMet,
          buildsFormed: lifeBook.state.terminal.rebirthResult.buildsFormed
        },
    clientDeathCauseRaw: ending.state.terminal?.lifeBook?.death === undefined ? null : ending.state.terminal.lifeBook.death.directCause,
    publicRunDeathRaw: ending.state.publicRun.death === undefined ? null : ending.state.publicRun.death
  });
}

// 冲突判定：同一 runId、同一权威 state，ENDING 与 LIFE_BOOK 的三个计数是否一致？
const mismatches = rows.filter((r) => JSON.stringify(r.countersEnding) !== JSON.stringify(r.countersLifeBook));
const noSidecarZero = rows.filter((r) => r.terminalNoSidecar === "ABSENT");

process.stdout.write(
  `${JSON.stringify(
    {
      reproduced: mismatches.length > 0,
      noSidecarEndingAbsentCount: noSidecarZero.length,
      mismatches: mismatches.map((m) => ({ seed: m.seed, ending: m.countersEnding, lifeBook: m.countersLifeBook })),
      rows
    },
    null,
    2
  )}\n`
);