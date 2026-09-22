# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `4a176ee`
- reviewedDate: `2026-09-22`
- workingTree: LOOPFIX02B2-R1 implemented, uncommitted

不要修改 `main` / 1.0，除非未来任务明确要求。

## 产品核心

Tianfu-sim 是一款以选择驱动、Build 构筑、因果回响、轮回成长和可选 AI 叙事为核心的修仙人生模拟游戏。

核心句：

> 命由天定，路由我选，因果终有回响。

产品原则：

- 玩家决定方向，随机决定遭遇。
- 重要选择必须留下痕迹。
- 每一世形成可描述的 Build / identity。
- AI 只负责高价值叙事，不拥有规则和数值。
- AI 关闭或失败时，游戏仍必须完整可玩。
- 不卖胜利，卖新的可能性。

## Completed

### Phase 1

- A01-A12: PASS
- Phase 1 Final Audit: PASS

### Phase 2

- PROG01: PASS
- RISK01: PASS
- BUILD01: PASS
- NPC01: PASS
- DIRECTOR01: PASS
- TOOL01: PASS
- BRIDGE01: PASS
- CONTENT01: PASS
- SIM02: PASS
- LOOPFIX02A: PASS
- LOOPFIX02B1: PASS
- LOOPFIX02B2: BLOCKED
- LOOPFIX02B2-R1: IMPLEMENTED (uncommitted)

不要重新实现上述模块，除非后续审计确认存在真实缺陷。

## 已完成能力

### PROG01

- 数据驱动的境界与成长规则。
- v1 六境界：凡人 → 炼气 → 筑基 → 金丹 → 元婴 → 化神。
- 灵根、天赋、天命组合。
- 确定性突破与 replay。

### RISK01

- Threat / RiskCondition 统一风险模型。
- 可解释、可追溯的死亡记录。
- 前三个有效人生节点的公平保护。
- 服务端生成 RiskPresentation。

### BUILD01

- sword / body / alchemy / fortune 四条首批 Build。
- Build 由玩家行为形成，不在开局直接选择。
- Definition / Registry 驱动，可继续扩展新 Build。

### NPC01

- S / A / B / C 层级。
- persistent NPC 与 generated NPC。
- B → A promotion。
- 玩家知识与 NPC 隐藏状态边界。

### DIRECTOR01

- P1 → P6 事件选择层。
- Director 只决定“下一件什么事发生”，不决定 Outcome。
- 索引化候选选择。
- 支持可变人生长度。

### BRIDGE01

- Event participant bridge。
- Core NPC 延迟实例化。
- Generated NPC materialization。
- participant slot → npcInstanceId。
- Cause 绑定真实 NPC 实例。

### CONTENT01

- `content01.v1` 首个可玩内容包。
- 66 个 Events。
- 5 个 Core NPC。
- 8 个 Generated Archetypes。
- 6 条 Cause chains / 10 个 templates。
- 四 Build 对应内容。
- Risk 内容与 600-run playable simulation。

### SIM02

- foundation-aware breakthrough simulation。
- `maxActions` 独立于 `nodeIndex`。
- 完整、紧凑、确定性的 gameplay telemetry。
- 使用真实 Command / Reducer / RNG 路径。

### LOOPFIX02A

- Event recurrence：`maxOccurrences`、`minNodesBetween`。
- 紧凑 occurrence state 与 O(1) recurrence eligibility。
- authoritative reducer exactly-once occurrence update。
- Snapshot / Replay / canonical hash / RNG 保持稳定。
- repeat-safe enforcement。
- lifecycle P1-P6 编号已同步。

### LOOPFIX02B1

- CONTENT01 已正式应用 recurrence。
- 7 个 Cause origin 使用 `maxOccurrences: 1`。
- 17 个可重复 Event 使用 `minNodesBetween`。
- 共 24 个 Event 带 recurrence。
- recurrence / repeat-safe validator PASS。
- full regression 323/323 PASS。
- Core / Director / contracts 未修改。

### LOOPFIX02B2 — BLOCKED

**Blocker: player-facing Cause closure 缺少 exact triggering Cause instance binding**

- `RESOLVE_CAUSE` / `EXPIRE_CAUSE` 目前只能以 exact `causeId` 表达。
- 静态 content 无法预知 runtime `causeId`：`causeId = cause:<commandId>:<ordinal>:<templateId>`，
  其中 `commandId` 来自种因该 Cause 的命令，与后续 echo 命令的 `commandId` 不同。
- `templateId`-only lookup 不可作为长期方案：
  未来同一 template 可合法存在多个 actor-bound Cause instances，
  按 templateId 全局猜测会闭合错误的 Cause，违反 G12 / G15。
- placeholder 形式（如 `${cause:<templateId>}`）能通过 content lint，
  但在 runtime 由 reducer 判定为 `cause.invalid`，
  即 content validator 对该缺陷无保护能力。
- 未使用的 `transform` 亦无 player-facing 正式表达：
  `cause.ref` 仅定义 `onActorUnavailable` 驱动的 resolve-old + create-new，
  不存在 `TRANSFORM_CAUSE` effect。

本次 B2 未产生任何未完成运行时代码改动；工作区已恢复到 B2 开始前的可运行状态。

### LOOPFIX02B2-R1 — IMPLEMENTED (uncommitted)

**Triggering Cause Binding 已贯通。**

- P3 Cause selector 选中的 exact `CauseInstance` 现持久化为
  `run.events.current.triggeringCauseId`，随 `instanceId` / `participantBindings` 一同进入
  RuleState / Snapshot / canonical hash / replay。
- `event.ref` 新增 closure selector：`{op:'RESOLVE_CAUSE'|'EXPIRE_CAUSE';triggeringCause:true}`。
  仅从 authoritative current scene 读取 provenance，不做任何 lookup / 猜测 / rebuild。
- 无 provenance 的场景使用该引用时 fail-closed（`cause.invalid`），不改变任何 RuleState。
- content lint 的唯一 content 侧要求：该 Event 必须是 Cause-linked
  （被某个 `CauseTemplate.linkedEventIds` 收录），从而该场景才可能有 authoritative triggering Cause。
- Cause actor role 保持内容语义（`rescuedNpc` / `master` / `debtor` / `enemy` / `witness` / ...），
  **不为本机制重命名或保留任何角色名**。安全性来自 runtime 读取 `triggeringCauseId`，不来自角色名。
- exact `causeId` 旧形式未改变，继续有效。
- full regression 331/331 PASS；typecheck CLEAN；import boundary / content lint / secret scan PASS；
  全部 audit tool 0 violations。
- Director precedence、RNG、echoBudget、Build / Risk / Progression 数值均未修改。
- 共享 dev fixture、既有测试、participant bridge audit 均未修改。

本次 R1 尚未 commit / push。

## 最新可信玩法数据

SIM02 默认配置：6 policies × 100 fixed seeds，`maxActions = 50`。

- Runs: 600
- runtimeFailures: 0
- deadlocks: 0
- AIcalls: 0
- deaths: 59
- right_censored: 541

最终境界分布：

- mortal: 48
- qi-refining: 11
- foundation-establishment: 52
- golden-core: 89
- nascent-soul: 218
- spirit-transformation: 182

552 / 600 局至少完成一次晋升。

结论：Progression Core 当前没有证据表明存在系统性故障。

## 当前未解决玩法问题

### 1. Cause 生命周期缺少主动 closure

- Cause origin recurrence 已由 LOOPFIX02B1 完成。
- Cause echo 高频出现。
- `resolved` / `expired` / `transformed` 当前均为 0。
- LOOPFIX02B2 BLOCKED：缺少 exact triggering Cause instance binding，
  player-facing closure effect 无法在静态 content 中合法引用 runtime Cause instance。
- 解绑路径 LOOPFIX02B2-R1 已实现：authoritative scene provenance + `triggeringCause:true`。
- `resolved` / `expired` / `transformed` 仍为 0，因为 CONTENT01 尚未授权 closure 内容（属 B2 重试范围）。

### 2. Core NPC 高频循环

- Core NPC 进入人生线后，P4 strict precedence 持续提供候选。
- Cause echo 与 P4 共同放大循环。

### 3. P6 starvation

- 普通 P6 Events 被高优先级候选长期饿死。
- Director 当前按合同工作，不应优先重写 Director。
- LOOPFIX02B1 后：P3/P4 同一事件的短周期重复已受到抑制，但 P6 仍为 0。
- 根因：单个 Core NPC 拥有多个 P4 Event，轮转即可保持 P4 候选集始终非空，strict precedence 在 P4 截断。
- 不应通过修改 Director strict precedence 解决。
- P6 starvation 留给 LOOPFIX02B3。

### 4. Actor unavailable 自然路径不足

- 已有运行时语义与测试路径。
- 自然玩法链路尚不足以稳定触发。

### 5. 微信壳缺少突破入口

- 当前最小微信页面壳尚无专门突破入口。
- 这是后续 UI 接线问题，不是 Progression Core 缺陷。

### 6. Build 分布暂不宜直接调平衡

- body / alchemy 当前偏高。
- sword / fortune 当前偏低。
- 数据受到 NPC / Cause 循环污染。
- 应先修复循环，再重新模拟和判断平衡。
- Build 平衡继续暂缓，待 LOOPFIX02B2 / B3 后再重新模拟。

## 当前 Director / Cause 证据

Director slots：

- P1 = 0
- P2 = 1200
- P3 = 9291
- P4 = 19067
- P5 = 2091
- P6 = 0

Cause：

- origins = 5591
- eligible = 5432
- echoes = 9291
- resolved = 0
- expired = 0
- transformed = 0

这些数据是下一轮修复的核心证据，不是最终游戏平衡目标。

## Next

Latest completed: `LOOPFIX02B1 PASS`

LOOPFIX02B2: `BLOCKED` — 见上方 "LOOPFIX02B2 — BLOCKED"。

LOOPFIX02B2-R1: `IMPLEMENTED (uncommitted)` — 见上方 "LOOPFIX02B2-R1 — IMPLEMENTED"。
binding 机制已贯通并全绿；等待 commit 与 B2 重试评审。

下一任务：`LOOPFIX02B2`（重试）— Cause Closure / Lifecycle，
在 R1 的 `triggeringCause:true` 之上授权 player-facing closure 内容。

范围约束：

- R1 只处理 triggering Cause provenance 与 closure binding。
- B2 只处理 Cause closure / lifecycle。
- 不要把 NPC / P6 pacing 合并进 R1。
- P6 starvation 归属 LOOPFIX02B3。

后续目标（R1 / B2 / B3 之后）：

- NPC repeat gating。
- 让 P6 重新获得可达窗口。
- 补足 actor unavailable 必要路径。

实施原则：

- 不改变 Director strict precedence，除非修复后仍有明确合同违反证据。
- 不把当前循环问题误判为 Progression 故障。
- 不在修复循环前直接调整 Build 平衡。

LOOPFIX02 完成后：

1. rerun gameplay simulation
2. 执行 PLAYCHECK02
3. 若结果健康，再进入 UI02

不要提前开始：

- UI02
- ITEM01
- TECH01
- SECT01
- WORLD01
- CHAL01

## 新 Codex 会话 / 账号接手步骤

1. 确认当前 branch = `dev/tianfu-2.0`。
2. 查看 `git status`。
3. 查看 `git log` 最近 20 条。
4. 读取 `docs/dev-status.md`。
5. 读取当前任务的 `.codex` task definition。
6. 运行 `node .codex/context.mjs <TASK_ID>`。
7. 读取命令返回的 required contracts。
8. 以最新 Git / contract / test 状态为准。
9. 不重新实现已 PASS 模块。
10. 如果 `lastReviewedCommit` 之后还有新 commit，先识别这些新增工作，再继续任务。

## 维护方式

每完成一个关键任务，只需更新：

- `lastReviewedCommit`
- Completed
- Current findings
- Next

不需要重新生成整份 handoff。

维护约束：

- 不复制完整 contracts。
- 不复制完整测试日志。
- 不保存 600 局全部明细。
- 不保存 token、账号凭证或其他私密信息。
- 如果摘要与仓库事实冲突，修正摘要，不反向修改事实源来迁就摘要。
