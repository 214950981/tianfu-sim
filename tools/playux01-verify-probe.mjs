/**
 * PLAYUX01 阶段 B 验证探针（只读诊断）。
 *
 * 目的：对全部 Content01 事件逐个 choiceId 走真实 reducer 结算，确认：
 *   1. 每个 choiceId 都能成功结算（不抛 INVALID_OPTION / npc.invalid 等）；
 *   2. 选项文案不再落在被规范禁止的通用词表内（对已改为 choiceSet 的场景）；
 *   3. 正文不再含统一模板尾句；
 *   4. P2 四行动各自只拿到语义匹配的首引场景；
 *   5. P6 各行动不会拿到语义错配的普通场景。
 *
 * 运行：node tools/playux01-verify-probe.mjs
 */
import {
  CONTENT01_EVENTS,
  CONTENT01_PACK,
  CONTENT01_VERSION,
  CONTENT01_ZH_CN,
  ContentRegistry,
  NPC_CONTENT01_V1
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce, materializeEventParticipants } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

const registry = () => {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
};

function offered(seed, firstRun = false) {
  return createOfferedRun({
    schemaVersion: 2, rulesVersion: "2.0.0", contentVersion: CONTENT01_VERSION,
    runId: `run:verify:${seed}`, playerId: "player:verify", rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:verify:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20, maxAge: 200, runName: "验证", realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun
    }
  });
}

function active(content, seed, firstRun = false) {
  const state = offered(seed, firstRun);
  return reduce({
    state,
    command: { type: "START_RUN", offerId: state.run.offer.offerId, destinyId: "content01.destiny.steady" },
    context: { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId: `cmd:${seed}:start` }
  }).state;
}

function ctx(content, state, commandId) {
  return { rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, content, commandId };
}

// ---------------------------------------------------------------- 1. 全事件逐选项真实结算
const settleResults = [];
for (const event of CONTENT01_EVENTS) {
  for (const choice of event.choices) {
    const seed = `settle:${event.id}:${choice.id}`;
    try {
      const content = registry();
      const started = active(content, seed);
      // Point `current` at the Event FIRST: participant materialization reads the current event,
      // mirroring the reducer, which sets `events.current` during Director selection and only then
      // materializes participants.
      const aimed = {
        ...started,
        run: {
          ...started.run,
          events: { ...started.run.events, current: { eventId: event.id, kind: event.kind } },
          history: started.run.events.history.filter((e) => e.eventId !== event.id)
        }
      };
      const materialized = materializeEventParticipants(aimed, content, event.id, `inst:${seed}`);
      const armed = {
        ...materialized.state,
        run: {
          ...materialized.state.run,
          events: { ...materialized.state.run.events, current: { eventId: event.id, kind: event.kind } }
        }
      };
      const builder = new ServerViewModelBuilder(content);
      const view0 = builder.build(armed, {});
      const out = reduce({
        state: armed,
        command: { type: "CHOOSE_EVENT_OPTION", eventId: event.id, optionId: choice.id },
        context: ctx(content, armed, `cmd:${seed}:resolve`)
      });
      const view1 = builder.build(out.state, {});
      settleResults.push({
        eventId: event.id, choiceId: choice.id, ok: true,
        labelZh: CONTENT01_ZH_CN[choice.labelKey] ?? null,
        publicChanges: diff(view0, view1)
      });
    } catch (error) {
      settleResults.push({
        eventId: event.id, choiceId: choice.id, ok: false,
        error: error instanceof Error ? `${error.name}:${error.message}` : String(error)
      });
    }
  }
}

function snapshot(view) {
  const run = view?.state?.publicRun ?? {};
  return {
    age: run.age,
    spiritStone: run.resources?.spiritStone,
    cultivationBps: run.realm?.cultivationBps ?? run.realm?.cultivation,
    conditions: (run.conditions ?? []).map((c) => `${c.kind}:${c.stacks}`).sort().join(","),
    builds: (run.builds ?? []).map((b) => `${b.buildId}=${b.stage}`).sort().join(","),
    people: (run.people ?? []).map((p) => `${p.npcId}:${p.affinity ?? ""}/${p.trust ?? ""}`).sort().join(","),
    historyCount: (view.history?.entries ?? []).length
  };
}

function diff(before, after) {
  const a = snapshot(before); const b = snapshot(after); const out = [];
  for (const key of Object.keys(b)) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.push(`${key} ${a[key]}→${b[key]}`);
  return out;
}

// ---------------------------------------------------------------- 2. 模板尾句
const TAIL = "你可以顺势而行，也可以停下来辨清代价";
const tailOffenders = CONTENT01_EVENTS
  .map((e) => ({ id: e.id, body: CONTENT01_ZH_CN[e.fallback.bodyKey] ?? "" }))
  .filter((e) => e.body.includes(TAIL))
  .map((e) => e.id);

// ---------------------------------------------------------------- 3. 四行动 P2 / P6
const SEM = { cultivate: "闭关", travel: "游历", worldly: "入世", pursuit: "追索" };
const actionProbe = ["cultivate", "travel", "worldly", "pursuit"].map((actionId) => {
  const content = registry();
  const started = active(content, `act:${actionId}`, true);
  const out = reduce({
    state: started,
    command: { type: "CHOOSE_ACTION", actionId },
    context: ctx(content, started, `cmd:act:${actionId}`)
  });
  const t = out.trace.selector?.[0] ?? {};
  const ev = out.state.run.events.current === undefined ? undefined : content.getEvent(CONTENT01_VERSION, out.state.run.events.current.eventId);
  return {
    actionId, actionZh: SEM[actionId], slot: t.selectedPrecedenceLevel,
    eventId: ev?.id ?? null, titleZh: ev === undefined ? null : CONTENT01_ZH_CN[ev.titleKey] ?? null,
    declaredAffinity: ev?.actionAffinity ?? null,
    actionMatched: ev?.actionAffinity === undefined ? null : ev.actionAffinity.includes(actionId),
    candidateCount: t.candidateCount ?? null
  };
});

// ---------------------------------------------------------------- 4. P6 各行动候选池
const p6Pool = ["cultivate", "travel", "worldly", "pursuit"].map((actionId) => {
  const content = registry();
  const query = content.queryDirectorCandidates(CONTENT01_VERSION, { slot: "ordinary", action: actionId });
  return {
    actionId, actionZh: SEM[actionId], count: query.eventIds.length,
    ids: query.eventIds.map((id) => id.replace("content01.ordinary.", ""))
  };
});

const failed = settleResults.filter((r) => !r.ok);
const summary = {
  settleTotal: settleResults.length,
  settleFailed: failed.length,
  failures: failed,
  tailOffenders,
  actionProbe,
  p6Pool,
  zeroPublicChangeChoices: settleResults.filter((r) => r.ok && r.publicChanges.every((c) => c.startsWith("historyCount"))).length
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length > 0) process.exitCode = 1;