# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `ba648f144b9a0cc3f147ec30d9afecf8e0e541ba`
- reviewedDate: `2026-09-23`

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
- LOOPFIX02B2: PASS
- LOOPFIX02B2_R1: PASS
- LOOPFIX02B3: PASS
- Post-LOOPFIX SIM02 verification: BLOCKED（历史：P6 reachability only）
- LOOPFIX02C: PASS
- PLAYCHECK02: PASS
- UI02: PASS

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

### LOOPFIX02B2 — PASS（原 blocker 作为历史记录保留）

> **状态说明：本 blocker 已由 `LOOPFIX02B2_R1` 解决。**
> 以下内容仅作为历史记录保留，当前 B2 的真实状态是 `READY FOR RETRY`，
> 不再是 "因缺少 exact triggering Cause binding 而 BLOCKED"。

**Blocker（已解除）: player-facing Cause closure 缺少 exact triggering Cause instance binding**

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

原始 B2 尝试当时未产生可合入的运行时代码改动；该 blocker 后续先由 R1 解除，再由 B2 retry 完成内容侧 closure。

**解除方式（`LOOPFIX02B2_R1`, commit `a040f0f`）**：runtime binding 已由 authoritative scene provenance 贯通，
`{op:'RESOLVE_CAUSE'|'EXPIRE_CAUSE';triggeringCause:true}` 可合法引用 P3 选中的 exact Cause instance。
上述 blocker 的第 1–3 条已失效；第 4 条（`transform` 无 player-facing 表达）仍属 B2 retry 范围。

### LOOPFIX02B2_R1 — PASS

人类标题：**LOOPFIX02B2-R1 — Triggering Cause Binding**

**Triggering Cause Binding 已贯通，已 commit + push（`a040f0f122f7f3ac5512cecda7414011567f7293`）。**

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

PLAYCHECK02 已通过：当前没有可复现的结构性玩法 blocker 阻止进入 UI02。

以下均降级为 BACKLOG，不在 UI02 前继续 LOOPFIX：

- cautious 自动策略不形成 Build / Cause：属于测试策略表达问题。
- 部分高境界样本 cultivation 显示为 0：后续 Progression 体验复核。
- Cause 实际多为单次 echo，resolved 日志偏冗余：后续 Cause 丰富度/日志优化。
- Generated NPC 当前较浅、未自然 promotion：后续 NPC02。
- maxAge 在 50-action 代表样本中很少成为终局：后续 lifespan/ending 体验复核。
- Build stage 可合法回退但视觉体验需观察。
- P4/P5 内容集合重叠较高：后续 CONTENT02。
- 少量 risk warning reason 命名复用：后续 RISK02 polish。

当前最值钱的工作已从“继续修规则”切换为“让 2.0 主循环可见、可理解、可用于真人试玩”。

## 当前 Director / Cause 证据

LOOPFIX02C 后最新 600-run：

Director slots：

- P1 = 0
- P2 = 1200
- P3 = 1212
- P4 = 14579
- P5 = 5701
- P6 = 4824

Reachability：

- runsWithP3 = 489 / 600
- runsWithP4 = 590 / 600
- runsWithP5 = 600 / 600
- runsWithP6 = 583 / 600

Cause：

- origins = 1226
- eligible = 1212
- echoes = 1212
- resolved = 1212
- expired = 0
- transformed = 0
- cause.invalid markers = 0

P4 gate：

- consecutive P4 pairs = 8851
- same-core-NPC consecutive-P4 violations = 0

Full regression：264 / 264 PASS；全部 reported audits PASS。

## Next

Latest completed: `UI02 PASS`。

人工预览新增发现：当前 UI02 的 RUN_HOME 虽然视觉与数据边界正确，但信息结构按 section 纵向铺开，在普通手机内容视口需要页面级下滑；开发预览 tabs 额外占高，但不是根因。

UI03 已暂停且尚未开工。下一任务改为：

`UI02R1` — One-Screen Responsive Gameplay Layout。

核心要求：

- RUN_HOME 在支持的常见竖屏内容视口内不依赖页面级纵向滚动。
- 支持基线：windowWidth >= 320 CSS px、windowHeight >= 500 CSS px。
- 代表矩阵：320×500、360×560、375×603、390×750、414×820、430×850。
- 四行动始终首屏可见；available=true 的突破也首屏可达。
- 不能靠缩小字体/按钮硬塞，核心触控目标约 44 CSS px。
- Build / Cause / People 主页做摘要，完整公开详情进入只读二级 overlay / side view。
- EVENT / SPECIAL_NODE 页面不做纵向文档，长内容只在受控区域内部滚动。
- LIFE_ARCHIVE 保持可滚动。
- dev tabs / debug 信息脱离产品文档流，默认收起或悬浮。
- 底部操作区考虑 Home Indicator / safe-area。
- 长名称、长 labelKey、多条件、多人物、多 Cause、突破可用/不可用、capability 开关都要做布局压力考虑。
- 不修改 server projection、shell intents、Core/Content 或旧 1.0 页面。

详细要求已冻结在 `docs/UI02R1_RESPONSIVE_LAYOUT.md`。

UI02R1 自动验收通过后，还需要用户在微信开发者工具做一次肉眼视觉确认；随后才解锁 UI03。

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
