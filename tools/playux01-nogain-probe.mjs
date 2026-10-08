/**
 * PLAYUX01 阶段 A 补充探针 —— D-NO-GAIN 可表达性裁决（只读诊断）。
 *
 * 背景：mapping-probe 报出 D-NO-GAIN 冲突「零变化 core choice 无法表达」。该结论来自扫描
 * 现有 Content01 的 effects 列表为空，而没有实际去问registry 的 core-choice 校验规则。
 * registry.ts 的真实条件是：
 *
 *   scope === "core" && !rhythmOnly && threatId === undefined
 *      && ![...ops].some(op => longTermOps.has(op))   -> fail
 *
 * 而 OUTCOME_TIME_DELTA 就在 longTermOps 集合内，且 reducer.ts 的 chooseEventOption
 * 真实应用 applied.outcomeTimeDelta 到 run.age。因此「只有时间代价、没有资源收益」是一个
 * 已注册、可结算、可公开观察的真实状态，并非冲突。
 *
 * 本探针用三条路径实测裁决：
 *   R1  空 effects + scope=core           -> registry 是否接受
 *   R2  effects=[OUTCOME_TIME_DELTA:1]     -> registry 接受？结算后 age 是否真的推进？
 *   R3rhythmOnly + next 指向不同事件       -> registry 是否接受（第三条例外路径）
 *
 * 运行：node tools/playux01-nogain-probe.mjs
 */
import {
  CONTENT01_EVENTS,
  CONTENT01_PACK,
  CONTENT01_VERSION,
  ContentRegistry,
  NPC_CONTENT01_V1,
  sealContentPack
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

function registry() {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  return content;
}

function offered(seed, firstRun) {
  return createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:nogain:${seed}`,
    playerId: "player:nogain",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:nogain:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20,
      maxAge: 200,
      runName: "无收获探针",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun
    }
  });
}

const BASE = CONTENT01_EVENTS.find((event) => event.id === "content01.onboarding.first-breath");

function variant(id, choiceOverrides) {
  return {
    ...BASE,
    id,
    version: BASE.version,
    choices: [{ id: "probe-choice", scope: "core", labelKey: `${id}.label`, outcomes: { success: { effects: [] } }, ...choiceOverrides }]
  };
}

const results = [];

// R1: 空 effects + core
results.push(probeRegistration("R1_empty_effects_core", "probe.r1", {}));
// R2: 只用 OUTCOME_TIME_DELTA —— 声称「有时间代价、无资源收益」可表达
results.push(probeRegistration("R2_time_delta_only", "probe.r2", {
  outcomes: { success: { effects: [{ op: "OUTCOME_TIME_DELTA", years: 1 }] } }
}));
// R3: rhythmOnly + next 指向不同事件
results.push(probeRegistration("R3_rhythm_only_with_next", "probe.r3", {
  rhythmOnly: true,
  next: [{ eventId: "content01.ordinary.mountain-view" }],
  outcomes: { success: { effects: [] } }
}));

console.log(JSON.stringify({ results }, null, 2));

function probeRegistration(caseId, eventId, choiceOverrides) {
  const content = registry();
  const event = variant(eventId, choiceOverrides);
  let registered = false;
  let registerError = null;
  try {
    content.register(sealContentPack({ ...CONTENT01_PACK, events: [...CONTENT01_EVENTS, event] }));
    registered = true;
  } catch (error) {
    registerError = error instanceof Error ? error.message : String(error);
  }
  const record = { caseId, eventId, registered, registerError };

  if (!registered) return record;

  // 真正结算：注册成功还不够，要证明权威 reducer 会应用它
  try {
    const seeded = offered(caseId, true);
    const started = reduce({
      state: seeded,
      command: { type: "START_RUN", offerId: seeded.run.offer.offerId, destinyId: "content01.destiny.steady" },
      context: { rulesVersion: seeded.rulesVersion, contentVersion: seeded.contentVersion, content, commandId: `cmd:${caseId}:1` }
    }).state;
    // 直接把 current 指到探针事件，再走 CHOOSE_EVENT_OPTION
    const armed = {
      ...started,
      run: {
        ...started.run,
        events: { ...started.run.events, current: { eventId, kind: event.kind } },
        history: started.run.events.history.filter((entry) => entry.eventId !== eventId)
      }
    };
    const context = { rulesVersion: armed.rulesVersion, contentVersion: armed.contentVersion, content, commandId: `cmd:${caseId}:2` };
    const view0 = new ServerViewModelBuilder(content).build(armed, {});
    const out = reduce({
      state: armed,
      command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: "probe-choice" },
      context
    });
    const view1 = new ServerViewModelBuilder(content).build(out.state, {});
    record.settled = true;
    record.ageBefore = view0.state.publicRun.age;
    record.ageAfter = view1.state.publicRun.age;
    record.spiritStoneBefore = view0.state.publicRun.resources.spiritStone;
    record.spiritStoneAfter = view1.state.publicRun.resources.spiritStone;
    record.cultivationBefore = view0.state.publicRun.realm.cultivationBps;
    record.cultivationAfter = view1.state.publicRun.realm.cultivationBps;
    record.historyBefore = (view0.history?.entries ?? []).length;
    record.historyAfter = (view1.history?.entries ?? []).length;
    record.narrativeFacts = out.narrativeFacts.map((fact) => fact.type);
    record.publiclyObservableZeroReward =
      view0.state.publicRun.resources.spiritStone === view1.state.publicRun.resources.spiritStone &&
      view0.state.publicRun.realm.cultivationBps === view1.state.publicRun.realm.cultivationBps;
  } catch (error) {
    record.settled = false;
    record.settleError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return record;
}