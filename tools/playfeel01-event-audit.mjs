/**
 * PLAYFEEL01 — 66-event mechanical audit generator.
 *
 * Produces docs/PLAYFEEL01-EVENT-AUDIT.md by reading the REAL content pack, not a sample. For every event it
 * records the action pool, every legal option, and the exact effects each outcome tier settles, then flags the
 * specific defect classes the product contract names: time-only options, money with no scene-internal origin,
 * cultivation with no cultivation sourcing, options that leave no durable trace, and options whose promised
 * experience has no authored post-settlement text.
 *
 * Run: node tools/playfeel01-event-audit.mjs [--write]
 */
import fs from "node:fs";
import { CONTENT01_PACK, CONTENT01_ZH_CN } from "../packages/content/src/index.ts";

const WRITE = process.argv.includes("--write");
const OUT = "docs/PLAYFEEL01-EVENT-AUDIT.md";

const LONG_TERM_OPS = new Set(["ADD_NPC_SIGNIFICANCE", "ADJUST_NPC_RELATION", "ADD_CAUSE", "RESOLVE_CAUSE", "EXPIRE_CAUSE", "ADD_BUILD_EVIDENCE"]);
const TIERS = ["greatSuccess", "success", "costlySuccess", "failure"];

const zh = (key) => {
  const v = CONTENT01_ZH_CN[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

const fmtEffect = (f) => {
  switch (f.op) {
    case "ADD_RESOURCE": return `灵石${f.amount >= 0 ? "+" : ""}${f.amount}`;
    case "REMOVE_RESOURCE": return `灵石${f.amount}`;
    case "ADD_CULTIVATION": return `修为+${f.amount}`;
    case "OUTCOME_TIME_DELTA": return `岁月+${f.years}`;
    case "ADD_NPC_SIGNIFICANCE": return `npc显著度+${f.amount}`;
    case "ADJUST_NPC_RELATION": return `关系${f.delta >= 0 ? "+" : ""}${f.delta}`;
    case "ADD_BUILD_EVIDENCE": return `道途证据:${f.buildId}`;
    case "ADD_CAUSE": return "种因果";
    case "RESOLVE_CAUSE": return "了结因果";
    case "EXPIRE_CAUSE": return "搁置因果";
    default: return f.op;
  }
};

const effectsOf = (outcome) => (Array.isArray(outcome?.effects) ? outcome.effects : []);

const rows = [];
for (const event of CONTENT01_PACK.events) {
  const title = zh(event.titleKey) ?? event.id;
  const body = zh(event.fallback?.bodyKey) ?? "";
  const hasResolution = zh(`${event.id}.resolution`) !== null;
  const participants = (event.participants ?? []).map((p) => `${p.slot}:${p.source.kind === "core" ? p.source.npcDefinitionId : p.source.archetypeId}`);
  const choices = (event.choices ?? []).map((choice) => {
    const tiers = {};
    for (const tier of TIERS) {
      const o = choice.outcomes?.[tier];
      if (o === undefined) continue;
      tiers[tier] = effectsOf(o).map(fmtEffect);
    }
    const all = Object.values(tiers).flat();
    const ops = new Set(Object.values(choice.outcomes ?? {}).flatMap(effectsOf).map((f) => f.op));
    const timeOnly = all.length > 0 && [...ops].every((op) => op === "OUTCOME_TIME_DELTA");
    const empty = all.length === 0;
    return {
      id: choice.id,
      label: zh(choice.labelKey) ?? choice.labelKey,
      scope: choice.scope,
      threatId: choice.threatId ?? null,
      checked: choice.check !== undefined,
      tiers,
      ops: [...ops],
      timeOnly,
      empty,
      longTerm: [...ops].filter((op) => LONG_TERM_OPS.has(op)),
      money: [...ops].some((op) => op === "ADD_RESOURCE"),
      cultivation: [...ops].some((op) => op === "ADD_CULTIVATION")
    };
  });
  rows.push({
    id: event.id,
    title,
    body,
    kind: event.kind,
    tags: event.tags ?? [],
    actions: event.actionAffinity ?? [],
    weight: event.weight,
    risk: choices.some((c) => c.threatId !== null),
    participants,
    hasResolution,
    choices
  });
}

// ---------------------------------------------------------------- classification
const isCultivationEvent = (r) => r.tags.includes("onboarding") || r.choices.some((c) => c.ops.some((op) => op === "ADD_BUILD_EVIDENCE"));
const defects = (r) => {
  const out = [];
  if (r.choices.every((c) => c.timeOnly)) out.push("全部选项仅时间差");
  if (r.choices.every((c) => c.empty)) out.push("全部选项零效果");
  if (r.choices.some((c) => c.timeOnly)) out.push("存在纯时间选项");
  if (r.choices.some((c) => c.money)) out.push("发放灵石（需场景内来源）");
  if (r.choices.some((c) => c.cultivation) && !isCultivationEvent(r)) out.push("非修炼场景给修为（需修行合理性）");
  if (!r.hasResolution) out.push("无授权结算文案键");
  if (r.participants.length === 0 && r.choices.some((c) => c.longTerm.includes("ADD_NPC_SIGNIFICANCE"))) out.push("NPC 效果但无参与者绑定");
  return out;
};

const TARGET_20 = [
  "content01.onboarding.first-breath", "content01.onboarding.quiet-retreat", "content01.onboarding.market-choice",
  "content01.onboarding.old-trace", "content01.onboarding.mountain-road", "content01.onboarding.roadside-injury",
  "content01.onboarding.forked-path",
  "content01.ordinary.old-song", "content01.ordinary.empty-search", "content01.ordinary.market-bargain",
  "content01.ordinary.mountain-view", "content01.ordinary.tea-house",
  "content01.pei.broken-blade", "content01.xie.secret-map", "content01.xu.mortal-letter", "content01.jiang.herb-price",
  "content01.build.sword.river-cut", "content01.build.alchemy.herb-sort",
  "content01.risk.ruin-depth", "content01.risk.pine-ambush"
];

const lines = [];
lines.push("# PLAYFEEL01 事件审计（66 场全表）");
lines.push("");
lines.push(`生成方式：\`node tools/playfeel01-event-audit.mjs --write\`，直接读取真实 CONTENT01_PACK，非抽样。`);
lines.push(`事件总数：**${rows.length}**（其中本任务施工目标 ${TARGET_20.length} 场標記为 \`★20\`）。`);
lines.push("");
const timeOnlyAll = rows.filter((r) => r.choices.length > 0 && r.choices.every((c) => c.timeOnly)).length;
const anyTimeOnly = rows.filter((r) => r.choices.some((c) => c.timeOnly)).length;
const withMoney = rows.filter((r) => r.choices.some((c) => c.money)).length;
const withCult = rows.filter((r) => r.choices.some((c) => c.cultivation)).length;
const withResolution = rows.filter((r) => r.hasResolution).length;
const withLongTerm = rows.filter((r) => r.choices.some((c) => c.longTerm.length > 0)).length;
const riskEvents = rows.filter((r) => r.risk).length;
lines.push("## 汇总");
lines.push("");
lines.push("| 指标 | 数量 |");
lines.push("| --- | --- |");
lines.push(`| 事件总数 | ${rows.length} |`);
lines.push(`| 全部选项仅时间差的事件 | ${timeOnlyAll} |`);
lines.push(`| 含纯时间选项的事件 | ${anyTimeOnly} |`);
lines.push(`| 含发放灵石选项的事件 | ${withMoney} |`);
lines.push(`| 含修为收益选项的事件 | ${withCult} |`);
lines.push(`| 已有授权结算文案键（\`.resolution\`）的事件 | ${withResolution} |`);
lines.push(`| 含持久后果（NPC/关系/因果/道途）选项的事件 | ${withLongTerm} |`);
lines.push(`| 风险事件（带 threatId） | ${riskEvents} |`);
lines.push("");
lines.push("## 全表");
lines.push("");
lines.push("| | eventId | 标题 | 动作池 | 选项数 | 风险 | 纯时间 | 灵石 | 修为 | 持久后果 | 已有结算文案 | 硬伤 |");
lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) {
  const mark = TARGET_20.includes(r.id) ? "★20" : "";
  const d = defects(r);
  lines.push(`| ${mark} | \`${r.id}\` | ${r.title} | ${r.actions.join("/") || "-"} | ${r.choices.length} | ${r.risk ? "是" : ""} | ${r.choices.every((c) => c.timeOnly) ? "全部" : r.choices.some((c) => c.timeOnly) ? "部分" : ""} | ${r.choices.some((c) => c.money) ? "是" : ""} | ${r.choices.some((c) => c.cultivation) ? "是" : ""} | ${r.choices.some((c) => c.longTerm.length) ? "是" : ""} | ${r.hasResolution ? "是" : ""} | ${d.join("；")} |`);
}
lines.push("");
lines.push("## 逐场明细");
lines.push("");
for (const r of rows) {
  lines.push(`### ${TARGET_20.includes(r.id) ? "★20 " : ""}\`${r.id}\` — ${r.title}`);
  lines.push("");
  lines.push(`- 动作池：${r.actions.join(" / ") || "（无）"}｜类型：${r.kind}｜权重：${r.weight}｜标签：${r.tags.join(", ")}`);
  lines.push(`- 参与者：${r.participants.length > 0 ? r.participants.join(", ") : "无（不得声称与具体人物建立持久关系）"}`);
  lines.push(`- 开场正文：${r.body}`);
  lines.push(`- 授权结算文案键：${r.hasResolution ? `有（\`${r.id}.resolution\`）` : "**无**"}`);
  lines.push("");
  lines.push("| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of r.choices) {
    const tierText = Object.entries(c.tiers).map(([t, effs]) => `${t}=[${effs.join(", ") || "（零效果）"}]`).join("；");
    lines.push(`| \`${c.id}\` | ${c.label} | ${c.scope} | ${c.threatId ?? "-"} | ${c.checked ? "有" : "-"} | ${tierText} | ${c.longTerm.join(", ") || "无"} |`);
  }
  const d = defects(r);
  lines.push("");
  lines.push(`- 硬伤：${d.length > 0 ? d.join("；") : "无"}`);
  lines.push("");
}

const text = lines.join("\n") + "\n";
if (WRITE) { fs.mkdirSync("docs", { recursive: true }); fs.writeFileSync(OUT, text, "utf8"); console.log(`已写入 ${OUT}（${text.length} 字节）`); }
else console.log(text.slice(0, 0) + `审计生成于内存：${rows.length} 事件，${rows.reduce((n, r) => n + r.choices.length, 0)} 个合法选项。加 --write 落地。`);

console.log(`汇总: 全时间差=${timeOnlyAll} 含纯时间=${anyTimeOnly} 灵石=${withMoney} 修为=${withCult} 已授权文案=${withResolution} 持久后果事件=${withLongTerm} 风险事件=${riskEvents}`);
