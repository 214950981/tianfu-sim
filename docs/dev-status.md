# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `e91530f866b850de6c2de8cee4dc76ad5afa7d01`
- reviewedDate: `2026-09-24`

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
- UI02R1: PASS
- UI02R2: PASS
- UI02R2A2: PASS（人工视觉验收通过）
- UI02ENTRY: PASS（人工视觉验收通过）
- UI02COPY: PASS（人工视觉验收通过）
- UI02FINAL: PASS（Controller 已验收；完整回归与 merge-readiness audit 通过）
- UI03: PASS（Controller 已验收；live-session controller / authoritative E2E wiring 通过）
- UI04A: PASS（Controller 已验收；client-safe command wire boundary 与 runtime dependency audit 通过）
- UI04B: PASS（Controller 已验收；deterministic WeChat runtime artifact / freshness / audit / CommonJS smoke 通过）
- UI04C: PASS（Controller 已验收；live client RPC boundary / DESTINY_OFFER → START_RUN / v2-live / retry-conflict-reconfirm 纵切片通过）
- UI04D: PASS（Controller 已验收；OPENID 权威身份 / bootstrap 幂等 / CloudBase 事务 store / deployable tianfu2 cloud runtime 纵切片通过）

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

UI04E_R1 result `fcb930b64cecc5c13e3eb8c784af72f44978c1b8` is **NOT YET ACCEPTED** and was not merged.

The product correction is materially right: REBIRTH_RESULT -> NEXT_LIFE is now sidecar-only, NEXT_LIFE has an explicit CTA, and createRunOffer owns next-run creation. However the task's strongest acceptance proof is still missing: the dedicated R1 suite does not actually simulate 'server created the next run, response was lost, page reloaded, same pending bootstrap was reused'. It only proves a second createRunOffer with the same bootstrap returns the same run.

The R1 branch also violated credit-efficient execution: its own local memory says push retried 7 times although NEXT_TASK capped push attempts at 2, and it accidentally committed `.workbuddy/memory/...` outside changedFiles. Neither artifact will be accepted into dev.

Correction/proof task: `UI04E_R2` — Response-Loss Reload Proof + Submission Hygiene.

R2 is intentionally tiny:
- transplant the R1 implementation once, excluding `.workbuddy/**`;
- add one functional test that persists pending bootstrap before the first createRunOffer, lets the real fake-cloud handler commit the new run, then loses the response client-side;
- recreate/reload the page/controller with the same local storage; it must return to the old NEXT_LIFE run, reuse the same pending bootstrap on the explicit CTA, and recover the already-created new run;
- prove only two run documents exist (old + one new), current bootstrap remains old until success, pending remains after the lost response, then success promotes current/clears pending and renders new DESTINY_OFFER under the same playerId;
- if that test passes without product changes, do not edit product code, regenerate artifacts, rerun typecheck, or rerun unrelated suites;
- run ui04e-r1 once as regression plus context-loader once; no aggregate npm test / 600-run.

Controller also fixed context.mjs to accept scalar executionProfile and added `.workbuddy/` to .gitignore. Complex execution budgets remain in NEXT_TASK/protocol, not task YAML.
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
