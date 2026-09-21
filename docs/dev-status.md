# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `61a19deffe8ac020ce18ba66bb359251d3d27d8b`
- reviewedDate: `2026-09-22`

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

- Cause origin 可以重复创建。
- Cause echo 高频出现。
- `resolved` / `expired` / `transformed` 当前均为 0。

### 2. Event 缺少重复控制

- 必要的 `cooldown` 尚未普遍落地。
- `maxOccurrences` / once gate 尚未完整落地。

### 3. Core NPC 高频循环

- Core NPC 进入人生线后，P4 strict precedence 持续提供候选。
- Cause echo 与 P4 共同放大循环。

### 4. P6 starvation

- 普通 P6 Events 被高优先级候选长期饿死。
- Director 当前按合同工作，不应优先重写 Director。

### 5. repeat-safe 合同落地缺口

- `cause.ref` 已提出 repeat-safe 要求。
- Event schema / validator / runtime 尚未完整表达并 enforce。

### 6. Director 编号机械漂移

- `lifecycle.ref` 仍保留旧 P0-P5 编号。
- 当前 Director runtime 使用 P1-P6。

### 7. Actor unavailable 自然路径不足

- 已有运行时语义与测试路径。
- 自然玩法链路尚不足以稳定触发。

### 8. 微信壳缺少突破入口

- 当前最小微信页面壳尚无专门突破入口。
- 这是后续 UI 接线问题，不是 Progression Core 缺陷。

### 9. Build 分布暂不宜直接调平衡

- body / alchemy 当前偏高。
- sword / fortune 当前偏低。
- 数据受到 NPC / Cause 循环污染。
- 应先修复循环，再重新模拟和判断平衡。

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

下一任务：`LOOPFIX02`

目标：

- Cause closure。
- Origin repeat control。
- Event cooldown / maxOccurrences。
- NPC repeat gating。
- 让 P6 重新获得可达窗口。
- 落地 repeat-safe 合同。
- 同步 lifecycle P1-P6 编号。
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
