# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `814f0b646277f5dc3639e64a6de13f015d7a7fee`
- reviewedDate: `2026-09-25`
- ui04FinalWorkBranch: `wb-UI04FINAL`（Controller 已验收并 fast-forward 到 dev）

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
- UI04E: PASS（随 UI04FINAL 一次性验收；终端链路 ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE → 显式开启下一世 → 全新 DESTINY_OFFER，并修复 createRunOffer bootstrap 恢复丢弃 terminal sidecar 的缺陷）
- UI04FINAL: PASS（UI04 里程碑终审；aggregate 回归 + UI04E-R2/R1/UI04E/UI04D/UI04C/UI04B/UI04A/UI03/UI02 + 生成物/依赖/路由/类型/lint/secret/content/context/phase2-drift 全绿）

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

## UI04E / UI04FINAL 验收证据

### 已修复缺陷

`TianfuLiveService.createRunOffer` 的三条恢复路径此前只返回 `GameState`，丢弃 `StoredRun.terminal`，
并用 `builder.build(state)` 投影。结果是：bootstrapping 到一个已处于 NEXT_LIFE 的旧 run 会投影出
`pageState: "ENDING"` 且 `state.terminal === undefined`，与同一 run 的 `fetchView`（NEXT_LIFE + 完整 sidecar）
不一致，页面重载后「开启下一世」CTA 不可达。

修复：三条路径（mapped-existing / deterministic-existing / newly-generated）统一 settle 完整的
`StoredRun`，并统一走 `buildFromStoredRun` —— 与 `fetchView` 同一个 terminal-aware 投影。

### 终端 / 轮回升阶链路（已证明）

`ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE → 显式 start-next-life → 全新 DESTINY_OFFER`

- `advanceTerminal` 只 bump `StoredRun.terminal`，从不创建下一世；
- 下一世只由显式 `createRunOffer`（携带客户端持久化的 pending bootstrapId）创建；
- 响应丢失后重载：current bootstrap 不晋升、pending 保留、库中只有 old + 1 个 new run；
- 重试复用同一 pending id 并恢复已创建的 run，绝不产生第二世；
- 成功后晋升 pending → current、清空 pending、渲染 DESTINY_OFFER，playerId 仍为同一权威身份；
- 旧 run 在新生命创建后 gameplay 字节（state / commandLog / ruleStateHash）与 terminal sidecar 完全不变，阶段仍为 NEXT_LIFE。

### 终审结论

- aggregate `npm test`：489 tests，仅 3 项失败且均已证明为本 sandbox 嵌套进程噪声（见下）；
- UI04E-R2 3/3、UI04E-R1 9/9、UI04E 26/26、UI04D 20/20、UI04C 18/18、UI04B 16/16、
  UI04A 16/16、UI03 18/18、UI02 18/18（含 UI02R1/R2/R2A2/ENTRY/COPY）全绿；
- cloud runtime 生成物 freshness / dependency audit / smoke 全绿（15 checks）；
- WeChat runtime 生成物 freshness / artifact audit / CommonJS smoke 全绿（8 checks）；
- client-runtime dependency audit、route guard、typecheck、import boundary、secret scan、
  content lint / content01 lint、context-loader 18/18、phase2 drift audit 全绿；
- 未触发 600-run：本次仅 UI / server 投影 / 展示层改动，Core / Content / 玩法语义未变。

### 已知环境噪声（非回归）

当前 sandbox 中，Node 测试内部再 spawn 一个 `node.exe` 会失败。终审复现的 3 项失败全部属于此类：

- `tests/import-boundary.test.mjs` 2 项（spawnSync 返回 null status / undefined stderr）
- `tests/replay.test.mjs` 1 项（spawnSync EBUSY）

已按 TOOLING_RUNBOOK 建立最小终审证明（一次 bounded batch）：

1. 在 untouched base tree（`git archive f309c38 ...`）上复现出**完全相同**的 3 项失败；
2. 从 shell 直接调用底层工具全部成功：`tools/check-import-boundaries.mjs` exit 0，
   其 negative control `--root tests/fixtures/core-forbidden` exit 1 且输出 `forbidden import`，
   `tools/replay.mjs <input> <pack>` exit 0 且 `finalRuleStateHash` 与期望值一致、checkpoints = 2。

### 部署就绪度与剩余人工步骤

代码侧已就绪（`cloudfunctions/tianfu2` 为可部署产物，`miniprogram/runtime` 已重新生成并 audit 通过）。
仍需人工完成的步骤不在本任务范围内：

1. 在微信云开发控制台部署 `cloudfunctions/tianfu2`（部署前在其目录内 `npm install`）；
2. 用微信开发者工具打开 `miniprogram/` 做真人视觉验收 —— **尚未执行**；
3. 真机 / 开放数据域下的 OPENID 身份与生命周期上限复核。

注意：微信开发者工具会在工作区写入 `project.config.json`、`project.private.config.json`
与 `miniprogram/pages/game/game.js` stub，会污染 digest-pinned 回归，验收前先检查 `git status`。

## Next

UI04FINAL remains accepted. Real WeChat cloud smoke advanced far enough to expose a production CloudBase compatibility defect, so the manual HOLD is lifted for one bounded live-fix task.

Observed real environment sequence on 2026-09-25:
- `tianfu2` cloud function is deployed and callable in `cloud1-8glg1sird4d40bc0`;
- required collections now exist: `tianfu2_runs`, `tianfu2_commands`, `tianfu2_bootstraps`, `tianfu2_terminal_transitions`;
- first empty-database bootstrap fails inside CloudBase `document.get` with `-502005` and message equivalent to `document with _id ... does not exist`;
- client then surfaces `TransportProtocolError: createRunOffer result.runId must be a non-empty string` because no run was created.

Root cause confirmed in `server/src/cloudbase-store.ts`: the store assumes a missing document is returned as an empty snapshot, while real CloudBase rejects `doc(id).get()` for a nonexistent document. This was hidden by the fake database used in tests.

Current task: `LIVEFIX01` — Real CloudBase Empty-Read Semantics + First-Run Recovery.

This is not a one-line catch-only task. It must close the full empty-database first-run compatibility gap:
- normalize a real CloudBase *missing document* read to `undefined` on all store read paths;
- do NOT swallow missing-collection, permission, network, transaction, or other database errors, even when they share `-502005`;
- make the fake CloudBase harness reproduce real missing-document rejection semantics;
- prove empty database first bootstrap creates exactly one offered run + bootstrap mapping;
- prove same bootstrap retry returns the same run;
- prove empty idempotency lookup allows first command settlement and empty terminal-transition lookup allows first terminal settlement;
- prove missing collection still fails loudly;
- regenerate/audit/smoke the cloud runtime once after source stabilizes.

After LIVEFIX01 passes, Controller will merge it and return to a manual HOLD for redeploying `tianfu2` and continuing the same real-device smoke. No new feature work should start before that smoke.## 新 Codex 会话 / 账号接手步骤

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
