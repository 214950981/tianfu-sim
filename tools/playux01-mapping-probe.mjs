/**
 * PLAYUX01 阶段 A —— 产品行为映射表探针（只读诊断，不改任何产品代码）。
 *
 * 目的：把 Controller 锁定的产品设计（docs/PLAYUX01-PRODUCT-SPEC.md 第 2/3/4 节）核对到
 * *真实结算* 上，产出一张可复核的对照表：
 *
 *   行动 -> Director 选中的 eventId/优先级槽 -> 每个 choiceId -> 真实 outcomes.effects
 *        -> 权威 PublicView 中真正可见的变化
 *
 * 这张表是阶段 B/C 施工前的合同：如果某条产品意图在现有 op 集合下无法表达，本脚本报出
 * CONTRACT_CONFLICT 事实，而不是靠推断改玩法。
 *
 * 运行：node tools/playux01-mapping-probe.mjs
 * 输出：JSON 到 stdout（人类可读缩进），退出码 0；冲突时仍为 0，冲突写入 conflictReport。
 */
import {
  CONTENT01_EVENTS,
  CONTENT01_PACK,
  CONTENT01_VERSION,
  CONTENT01_ZH_CN,
  ContentRegistry,
  NPC_CONTENT01_V1
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, validateGameState, materializeEventParticipants } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

function registry() {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
}

function offered(content, { firstRun, seed, age = 20, maxAge = 200 }) {
  const contentVersion = CONTENT01_VERSION;
  return createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion,
    runId: `run:probe:${seed}`,
    playerId: "player:probe",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:probe:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age,
      maxAge,
      runName: "探针",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun
    }
  });
}

function active(content, opts) {
  const state = offered(content, opts);
  return reduce({
    state,
    command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" },
    context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${opts.seed}:start` }
  }).state;
}

function ctx(content, state, commandId) {
  return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId };
}

/** PublicView 中玩家真正能看到的数值快照（用于差异对比）。 */
function publicSnapshot(view) {
  const run = view?.state?.publicRun ?? {};
  return {
    age: run.age,
    spiritStone: run.resources?.spiritStone,
    cultivationBps: run.realm?.cultivationBps ?? run.realm?.cultivation,
    conditions: (run.conditions ?? []).map((c) => `${c.kind}:${c.stacks}`).sort(),
    builds: (run.builds ?? []).map((b) => `${b.buildId}=${b.stage}`).sort(),
    people: (run.people ?? []).map((p) => p.npcId).sort(),
    peopleRelation: (run.people ?? []).map((p) => `${p.npcId}:${p.affinity ?? ""}/${p.trust ?? ""}`).sort(),
    causes: (view.state.publicCauses ?? []).map((c) => `${c.level}:${c.summaryKey}`).sort(),
    historyCount: (view.history?.entries ?? []).length
  };
}

function diff(before, after) {
  const changes = [];
  for (const key of Object.keys(after)) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changes.push({ field: key, before: before[key], after: after[key] });
  }
  return changes;
}

// ---------------------------------------------------------------- 1. P2 onboarding 四行动实际命中

const ACTIONS = ["cultivate", "travel", "worldly", "pursuit"];
const p2Probe = ACTIONS.map((actionId) => {
  const content = registry();
  const state = active(content, { firstRun: true, seed: `p2:${actionId}` });
  const out = reduce({
    state,
    command: { type: "CHOOSE_ACTION", actionId },
    context: ctx(content, state, `cmd:p2:${actionId}`)
  });
  const trace = out.trace.selector?.[0] ?? {};
  const eventId = out.state.run.events.current?.eventId;
  const event = eventId === undefined ? undefined : content.getEvent(state.contentVersion, eventId);
  return {
    actionId,
    ageCost: out.trace.time?.[0]?.delta,
    ageAfter: out.state.run.age,
    selectedEventId: eventId ?? null,
    selectedTitleZh: eventId === undefined ? null : CONTENT01_ZH_CN[event.titleKey] ?? null,
    eventDeclaredAffinity: event?.actionAffinity ?? null,
    slot: trace.selectedPrecedenceLevel ?? trace.tier ?? null,
    candidateCount: trace.candidateCount ?? null,
    options: event?.choices?.map((c) => ({ id: c.id, zh: CONTENT01_ZH_CN[c.labelKey] ?? c.labelKey })) ?? []
  };
});

// ---------------------------------------------------------------- 2. 非首局 P6 兜底四行动实际命中

const p6Probe = ACTIONS.map((actionId) => {
  const content = registry();
  // 走几步让 first_run 窗口过去，并让 P5 有机会被 contextual-gap 关掉。
  let state = active(content, { firstRun: false, seed: `p6:${actionId}` });
  state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(content, state, `cmd:p6:${actionId}:warm`) }).state;
  if (state.run.events.current !== undefined) {
    const cur = state.run.events.current.eventId;
    const ev = content.getEvent(state.contentVersion, cur);
    const safe = ev.choices.find((c) => ["turn-away", "decline", "consider", "leave"].includes(c.id)) ?? ev.choices[0];
    state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: cur, optionId: safe.id }, context: ctx(content, state, `cmd:p6:${actionId}:resolve`) }).state;
  }
  // 连续两个 P5 让 contextualGapScenes 关掉 P5
  for (let i = 0; i < 6 && state.run.status === "active"; i += 1) {
    if (state.run.events.current !== undefined) {
      const cur = state.run.events.current.eventId;
      const ev = content.getEvent(state.contentVersion, cur);
      const safe = ev.choices.find((c) => ["turn-away", "decline", "consider", "leave"].includes(c.id)) ?? ev.choices[0];
      state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: cur, optionId: safe.id }, context: ctx(content, state, `cmd:p6:${actionId}:clear:${i}`) }).state;
      continue;
    }
    const before = state;
    state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId }, context: ctx(content, state, `cmd:p6:${actionId}:step:${i}`) }).state;
    const t = state.trace;
    void before; void t;
    if (state.run.events.current !== undefined) {
      const cur = state.run.events.current.eventId;
      const ev = content.getEvent(state.contentVersion, cur);
      const slot = state.run.director.recentScenes.at(-1)?.slot;
      if (slot === "P6") break;
    }
  }
  const lastScene = state.run.director.recentScenes.at(-1);
  const eventId = state.run.events.current?.eventId;
  const event = eventId === undefined ? undefined : content.getEvent(state.contentVersion, eventId);
  return {
    actionId,
    landedSlot: lastScene?.slot ?? null,
    selectedEventId: eventId ?? null,
    selectedTitleZh: eventId === undefined ? null : CONTENT01_ZH_CN[event.titleKey] ?? null,
    eventDeclaredAffinity: event?.actionAffinity ?? null,
    isOrdinaryFallback: event === undefined ? null : (event.actionAffinity ?? []).length === 0
  };
});

// ---------------------------------------------------------------- 3. 代表事件每个 choiceId 的真实 effects + 公开可见结果

const REPRESENTATIVE = [
  { actionId: "cultivate", eventId: "content01.onboarding.first-breath" },
  { actionId: "cultivate", eventId: "content01.onboarding.quiet-retreat" },
  { actionId: "travel", eventId: "content01.onboarding.mountain-road" },
  { actionId: "worldly", eventId: "content01.onboarding.market-choice" },
  { actionId: "worldly", eventId: "content01.ordinary.market-bargain" },
  { actionId: "pursuit", eventId: "content01.onboarding.old-trace" },
  { actionId: "travel", eventId: "content01.build.fortune.fork" },
  { actionId: "travel", eventId: "content01.ordinary.mountain-view" }
];

function enterEvent(state, content, eventId, commandId) {
  const event = content.getEvent(state.contentVersion, eventId);
  const staged = validateGameState({
    ...state,
    run: { ...state.run, events: { ...state.run.events, current: { eventId, kind: event.kind } } }
  });
  return materializeEventParticipants(staged, content, eventId, `event:${commandId}:${eventId}`).state;
}

const choiceProbe = REPRESENTATIVE.map(({ actionId, eventId }) => {
  const content = registry();
  const event = content.getEvent(CONTENT01_VERSION, eventId);
  const bodyZh = CONTENT01_ZH_CN[event.fallback.bodyKey] ?? null;
  const choices = (event.choices ?? []).map((choice) => {
    const state = enterEvent(active(content, { firstRun: false, seed: `choice:${eventId}:${choice.id}` }), content, eventId, `probe:${eventId}:${choice.id}`);
    const builder = new ServerViewModelBuilder(content);
    const before = builder.build(state);
    let row;
    try {
      const out = reduce({
        state,
        command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: choice.id },
        context: ctx(content, state, `probe:${eventId}:${choice.id}`)
      });
      const after = builder.build(out.state);
      row = {
        choiceId: choice.id,
        labelZh: CONTENT01_ZH_CN[choice.labelKey] ?? choice.labelKey,
        threatId: choice.threatId ?? null,
        declaredEffects: Object.fromEntries(
          ["success", "costlySuccess", "failure"].flatMap((tier) => {
            const o = choice.outcomes[tier];
            return o === undefined ? [] : [[tier, o.effects.map((e) => `${e.op}${e.key !== undefined ? `(${e.key})` : ""}${e.amount !== undefined ? `:${e.amount}` : ""}${e.buildId !== undefined ? `:${e.buildId}` : ""}${e.tag !== undefined ? `:${e.tag}` : ""}`)]];
          })
        ),
        appliedTier: out.narrativeFacts.find((f) => f.type === "EVENT_OUTCOME")?.appliedTier ?? null,
        requestedTier: out.narrativeFacts.find((f) => f.type === "EVENT_OUTCOME")?.requestedTier ?? null,
        publicChanges: diff(publicSnapshot(before), publicSnapshot(after)),
        publicEffectsEcho: out.effects.map((e) => e.op),
        ageDelta: out.trace.time?.[0]?.delta ?? null,
        newHistoryEntry: out.state.run.events.history.at(-1) ?? null,
        newCurrentEvent: out.state.run.events.current?.eventId ?? null
      };
    } catch (error) {
      row = { choiceId: choice.id, labelZh: CONTENT01_ZH_CN[choice.labelKey] ?? choice.labelKey, error: `${error.name}:${error.message}` };
    }
    return row;
  });
  return {
    actionId,
    eventId,
    titleZh: CONTENT01_ZH_CN[event.titleKey] ?? null,
    eventDeclaredAffinity: event.actionAffinity ?? null,
    tags: event.tags,
    bodyZh,
    bodyHasBoilerplateTail: typeof bodyZh === "string" && bodyZh.includes("你可以顺势而行，也可以停下来辨清代价"),
    choices
  };
});

// ---------------------------------------------------------------- 4. 模板尾句与通用选项覆盖面

const boilerplateTail = "你可以顺势而行，也可以停下来辨清代价；此刻的取舍不会喧哗，却会在往后的年月留下形状。";
const withTail = CONTENT01_EVENTS.filter((e) => String(CONTENT01_ZH_CN[e.fallback.bodyKey] ?? "").includes(boilerplateTail)).map((e) => e.id);
const genericLabelCounts = new Map();
for (const e of CONTENT01_EVENTS) for (const c of e.choices ?? []) {
  const zh = CONTENT01_ZH_CN[c.labelKey] ?? c.labelKey;
  genericLabelCounts.set(zh, (genericLabelCounts.get(zh) ?? 0) + 1);
}
const genericLabels = [...genericLabelCounts.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));

// ---------------------------------------------------------------- 5. 公开历史键与 build stage 键覆盖

const missingHistoryKeys = CONTENT01_EVENTS.filter((e) => CONTENT01_ZH_CN[`${e.id}.history`] === undefined).map((e) => e.id);
const buildStageLabelKeys = [];
for (const def of registry().getBuild(CONTENT01_VERSION).definitions) {
  for (const st of def.stages) buildStageLabelKeys.push({ key: st.labelKey, known: CONTENT01_ZH_CN[st.labelKey] !== undefined });
}

// ---------------------------------------------------------------- 6. 死因/结局码（客户端目前直出）

const deathCodes = ["death.lifespan", "death.injury", "threat.critical-injury", "lifespan", "injury"];

// ---------------------------------------------------------------- 7. 合同冲突探测

const conflictReport = [];
// (a) 「无收获/行动落空」：现有 op 集合里有没有「明确什么都不发生」的合法表达？
const NO_GAIN_OPS = new Set(["OUTCOME_TIME_DELTA"]);
{
  const zeroEffectChoices = CONTENT01_EVENTS.flatMap((e) =>
    (e.choices ?? []).filter((c) => {
      const all = ["greatSuccess", "success", "costlySuccess", "failure"]
        .map((t) => c.outcomes[t])
        .filter((o) => o !== undefined)
        .flatMap((o) => o.effects);
      return all.length === 0;
    }).map((c) => `${e.id}#${c.id}`)
  );
  conflictReport.push({
    id: "D-NO-GAIN",
    question: "规范 D：无合适候选时要产生清晰的「无收获/行动落空」反馈",
    finding:
      zeroEffectChoices.length === 0
        ? "当前 0 个选项的效果列表为空；registry 的 core-choice 校验也强制每个 core choice 至少改一项长期维度，因此「零变化」无法用现有 EffectSpec 表达。"
        : `有 ${zeroEffectChoices.length} 个零效果选项。`,
    zeroEffectChoices,
    usableOps: [...NO_GAIN_OPS],
    conflict: zeroEffectChoices.length === 0
  });
}
// (b) 生平录要显示 choiceId：state.run.events.history 是否记录了 choiceId？
{
  const state = active(registry(), { firstRun: false, seed: "conflict:choiceid" });
  const content = registry();
  const staged = enterEvent(state, content, "content01.ordinary.mountain-view", "conflict:choiceid");
  const out = reduce({
    state: staged,
    command: { type: "CHOOSE_EVENT_OPTION", eventId: "content01.ordinary.mountain-view", optionId: "engage" },
    context: ctx(content, staged, "conflict:choiceid:resolve")
  });
  const entry = out.state.run.events.history.at(-1);
  conflictReport.push({
    id: "D-CHOICEID-ARCHIVE",
    question: "规范第 5 节：生平录要显示玩家实际选择（有已存公开 choiceId 才显示）",
    finding: entry === undefined ? "history 无新增条目" : `history 条目字段 = ${JSON.stringify(Object.keys(entry))}`,
    hasChoiceId: entry !== undefined && "choiceId" in entry,
    conflict: entry === undefined || !("choiceId" in entry)
  });
}

const report = {
  generatedFor: "PLAYUX01",
  contentVersion: CONTENT01_VERSION,
  contentEvents: CONTENT01_EVENTS.length,
  p2Onboarding: p2Probe,
  p6Ordinary: p6Probe,
  representativeChoiceEffects: choiceProbe,
  coverage: {
    boilerplateTailEventCount: withTail.length,
    boilerplateTailRatio: `${withTail.length}/${CONTENT01_EVENTS.length}`,
    boilerplateTailSample: withTail.slice(0, 6),
    genericOptionLabels: genericLabels,
    missingHistoryKeyCount: missingHistoryKeys.length,
    totalEvents: CONTENT01_EVENTS.length,
    buildStageLabelKeys,
    deathCodes
  },
  conflictReport
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);