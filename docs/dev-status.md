# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `31bbc5b4e79d5ca447e26062a8c8d00a3969c782`
- reviewedDate: `2026-10-09`
- ui04FinalWorkBranch: `wb-UI04FINAL`（Controller 已验收并 fast-forward 到 dev）

不要修改 `main` / 1.0，除非未来任务明确要求。

## 当前状态与下一步（2026-10-09）

- **LIVEFIX05 已被 Controller 接受并快进合并**：`wb-LIVEFIX05` 的实际提交 `3a6c6d70be6132147ccb09d9a718ccd5189109c7`，自原 dev HEAD `171a6c690499f66e7333b784a5c7557b61b5096f` 真实单提交后代快进。
- 改动范围恰好三个文件：`miniprogram/pages/v2-live/v2-live.wxml`、`tests/livefix05.test.mjs`、`.codex/control/LAST_RESULT.yaml`。未改 server/cloudfunction/Core/Content/main，也没有云端部署。
- Controller 已核验远端 WXML 的显式否定 `wx:if` 与原有选项/CTA 绑定；WorkBuddy `LAST_RESULT` 报告 `livefix05: 6/6`、`ui04c: 18/18`，以及限定范围的静态门禁全部 PASS。**本轮未重新执行测试，也没有新 CI 结果。**
- **当前控制面：HOLD / LIVEQA06 本地准备完成、人工视觉待验收**；WorkBuddy 报告 DevTools 实际打开的是已有的 WorkBuddy worktree（不是主 clone），其两个 LIVEFIX06 目标文件本已与远端一致；主 clone 仅同步了两个前端文件。实际 DevTools CLI 编译无应用编译或模块错误（由 WorkBuddy 报告，Controller 未直接访问本机日志）；尚需用户截图确认中文事件页面。未修改玩法代码、云函数、数据库；不自动派发下一任务。
- **LIVEFIX05 真实视觉验收已通过**：用户截图显示 `DESTINY_OFFER` 页面择命候选正常，旧版“服务器投影”多余提示消失；选择命格后成功进入 `RUN_HOME`。随后点击一次“游历”进入 `EVENT`，页面标注第 4 版，出现新的 LIVEFIX06 文案缺陷。
- 真实云函数首次开局与数据库持久化验收已在 Issue #2 完成，**不能**把本次仅 UI 条件修复的通过解释成完整游戏正式上线。
- **LIVEFIX06 已合并（源码 PASS WITH CAVEATS）**：`wb-LIVEFIX06@31bbc5b4e79d5ca447e26062a8c8d00a3969c782` 从 `86707ac5f6ab3f775cd611017441022e59b4589c` 安全快进；新增 340 键中文生成资源及覆盖/负控测试，修复所有现有 Content01 原始键名显示缺陷。WorkBuddy 报告 LIVEFIX06 20/20、UI04C 18/18、UI02COPY 11/11 PASS，静态门禁 PASS；本次 Controller 未重新执行测试。已修复任务定义中的 `evidence`/`goal` 不支持字段及折叠列表写法；历史 UI02R1 两项基线失败待后续统一测试计划处理。**WorkBuddy 已报告真实 DevTools CLI 编译通过；尚未获得人工视觉截图与真实事件选项结算结果。无需云函数部署。**

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
- LIVEFIX01: PASS（Controller 已验收；真实 CloudBase 空集合首次读取语义、空库首局创建、bootstrap/command/terminal 幂等与云运行时回归通过）
- LIVEFIX02: PASS（Controller 已验收；miniprogramRoot 页面/相对依赖闭包、4 个 legacy mirror、永久 package-closure gate 与 route guard 集成通过）
- LIVEFIX03: PASS WITH CAVEATS（Controller 已验收；历史截断 game.wxss 以 RECONSTRUCTED 方式补全并加入 WXSS integrity gate。非历史恢复，真实 DevTools 已验证 start/game 可编译并正常显示）
- LIVEFIX04: PASS（Controller 已验收；精确支持 CloudBase `errCode=-1` + `document.get:fail ... <32-hex> ... does not exist` 缺文档形状，generic `-1` 仍 fail-closed）
- LIVEFIX05: PASS（Controller 于 2026-10-09 验收并 fast-forward；修复 v2-live 终局链 `wx:else` 在择命等正常状态下额外出现的服务器投影提示；真实 DevTools 视觉验收待用户完成）
- LIVEFIX06: PASS WITH CAVEATS（Controller 于 2026-10-09 验收并 fast-forward；Content01 340 个键完整中文映射、自动生成与新鲜度门禁，实机视觉验收待完成；历史 UI02R1 基线失败单独记录）
- LIVEQA06: LOCAL PREPARATION REPORTED PASS / VISUAL PENDING（WorkBuddy 已核对实际 DevTools worktree 的前端文件与 LIVEFIX06 一致，CLI 编译日志报告正常；人工页面验收等待用户截图。当前 HOLD）。

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

## LIVEFIX03 验收证据：RECONSTRUCTED —— 重建被截断的 legacy 样式表 + 永久 WXSS 完整性门禁

### 实机现象（微信开发者工具）

```
pages/game/game.wxss(253:14): unexpected token
```

源文件在声明中间断掉，没有右括号、没有分号、没有右花括号、没有结尾换行：

```css
.engine-paused {
  background: rgba(255, 152, 0
```

### 这是 RECONSTRUCTED，不是恢复 —— 恢复来源已穷尽

| 检索位置 | 结果 |
| --- | --- |
| 全部本地 ref（`git for-each-ref`） | 该路径只有一个 blob（`d989ac55`，6868 字节），就是被截断那个 |
| 路径历史（`git log --all --follow`） | 只有一条提交 `45e8105`，加入时**已**被截断 |
| 磁盘上 18 份副本（16 个兄弟 worktree + 主 clone + 3 份 `.b2base` 基线提取） | md5 全为 `5806a213…`，同样是那 6868 字节 |
| 微信开发者工具 Local + Roaming 缓存（扫描 1.4G） | 没有 `game.wxss`，也没有任何含该样式表特征字符串的文件 |
| 悬挂 / 不可达 blob（`git fsck --dangling`） | 无相关对象 |
| `git stash` | 空 |

**唯一看起来像候选的 blob 已拒绝**：`712f58c3…`，6616 字节。它**不是更长的版本**——
CRLF 归一化后与当前被截断文件逐字节相同（两者 md5 均为 `b3d14130…`），252 字节的差值正好是
252 行 CR。它是同一份截断内容的 LF 变体，在同一位置截断，且不被任何 ref 引用，不提供任何缺失后缀。

结论：**Git、main、全部本地 ref 与全部本地磁盘副本都不存在完整的截断前版本**，因此后缀是
**重建**的，不是恢复的。此事实在 `LAST_RESULT.yaml` 与本文档中均明确标注。

### 修复方式

前 **6868 字节逐字节保留**（由测试断言，非人工检查），修复严格**只追加**：

- 把悬空的 `background: rgba(255, 152, 0` 补成 `background: rgba(255, 152, 0, 0.1);`，
  写法沿用同一文件里兄弟规则 `.engine-running` 自己的约定；
- 闭合该规则并补 `.engine-paused:active`；
- 按已提交的 `game.wxml` / `game.js` 与存留样式表自身的视觉语言（rpx、`#030303` 暗底、
  既有 keyframe 与发光约定、固定高度盒子全部显式 `border-box`）重建缺失后缀；
- 包内副本**只由** `node tools/miniprogram-package-mirror.mjs --write` 刷新，绝不手改；
- 6868 → 21045 字节，CRLF 行尾全程保持。

静态类覆盖：root 模板 86/86、包内模板 84/84，**未定义类 0 个**（修复前分别为 69 / 67 个）。
未新增任何玩法逻辑、UI 功能、路由或 tabBar 变更——后缀只为模板中**已存在**的标签提供样式。

### 永久门禁：mirror freshness ≠ source validity

LIVEFIX02 已经证明包内副本与源**逐字节一致**，构建**仍然失败**。这就是整类缺陷：
freshness 门禁回答「target == source」，永远不回答「source 语法完整」。

`tools/wxss-integrity-audit.mjs` 补上了这一半，单次注释/字符串感知的从左到右扫描，fail-closed：
花括号与括号不平衡、引号与块注释未闭合、EOF 落在规则块内、EOF 落在声明内、声明值以悬空逗号结尾。

- 目标从 `project.config.json` 的 `miniprogramRoot` 与 `app.json` 注册页**推导**，不写死；
- 覆盖**每个注册页样式** + **每个镜像 WXSS 的源与目标两侧**；
- 类覆盖率只作**诊断**输出，**不参与**判定（动态类名与 `app.wxss` 继承让 100% 覆盖不成立）；
- 已接入 `tools/route-guard.mjs`（检查项 J），所以「包是闭合的」从此蕴含「包在静态可验证范围内是可构建的」。

负控包含**真实的 253 行截断字节**（提交为 `tests/fixtures/livefix03/game.wxss.truncated`），
外加不平衡花括号、游离右花括号、未闭合块注释、未闭合字符串、未闭合参数列表、悬空逗号；
两个正控（字符串/注释内的花括号与转义引号）确认审计不会见到花括号就报错。

### 诚实的边界

仓库内**不存在 WXSS 编译器**。新审计是**结构完整性**检查，不声称能证明样式表在真实
DevTools 构建下编译通过——那仍然是人的 DevTools pass。`tools/wxss-compat-audit.mjs` 另行把
2.0 preview 样式表限制在文档化的 WXSS 选择器子集内，本任务未改动它。**未执行视觉验收。**

未跑 aggregate / typecheck / 600-run / UI04 全量回归（NEXT_TASK 显式要求）。

## 历史记录：LIVEFIX04 阶段旧操作（已完成，不再执行）

> 以下仅供追溯过去的云端故障处理流程。**当前任务以文首“当前状态与下一步”及 `.codex/control/NEXT_TASK.yaml` 为准。**

LIVEFIX04 已由 Controller 验收并 fast-forward 合入 `dev/tianfu-2.0`，accepted result commit：
`2a10061b1b91db706ad6b64cf9ec4e94311e35ae`。

代码验收结论：PASS。

已独立确认：
- work branch 是 dev 的真实单提交后代，ahead 1 / behind 0；
- 改动仅限 CloudBase persistence boundary、fake harness、生成 cloud runtime、LIVEFIX04 测试、package script 与 LAST_RESULT；
- `-1` 分支必须整条匹配 `document.get:fail document with _id <32-hex> does not exist` 才归一化；
- generic `-1`、collection missing、permission、network、transaction、wrong operation、wrong id length/non-hex 等近邻形状继续 fail-closed；
- LIVEFIX01 既有形状保持不变；
- 空四集合数据库首个 createRunOffer 在新形状下可返回非空 runId，same-bootstrap retry 保持 exactly-once；
- deployable cloud host harness 在新形状下可创建首局，在缺集合时仍返回 bounded INTERNAL 且不写数据；
- cloud runtime 已重新生成一次并通过 freshness / dependency audit / smoke。

测试证据：LIVEFIX04 13/13、LIVEFIX01 15/15、cloud runtime smoke 15 checks、lint、secret scan PASS。
按 fast-lane 明确跳过 aggregate / typecheck / 600-run / UI04 full regression。

非阻塞测试编排债务：`tests/livefix03.test.mjs` 与 `tests/livefix04.test.mjs` 均有 dedicated script，但尚未进入 aggregate `npm test`。当前真实文件/边界已有 route-guard/cloud smoke 保护，因此不阻断部署；下一次 final-audit/测试计划维护时一并纳入 aggregate。

当前进入 **REAL CLOUD REDEPLOY / V2-LIVE SMOKE HOLD**。不要继续新功能。

下一步：
1. 将 DevTools/部署工作区同步到最新 accepted dev；
2. 只重新部署 `cloudfunctions/tianfu2`，选择云端安装依赖；
3. 不需要重新部署 MiniProgram 代码，不需要清缓存；
4. 回到 `pages/v2-live/v2-live` 点“重新连接”；
5. 预期：空库首次 createRunOffer 返回真实 runId，并写入 1 条 run + 1 条 bootstrap mapping；
6. 成功则截图并检查四个集合数据；失败则只截第一个新的真实云端错误，不做猜测性修复。

本轮 HOLD 禁止 aggregate、typecheck、600-run、UI04 全量回归。## 新 Codex 会话 / 账号接手步骤

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

## LIVEFIX02 验收证据：miniprogramRoot 必须是闭合的运行时包

### 实机现象（微信开发者工具，`cloud1-8glg1sird4d40bc0`）

```
module 'pages/start/data.js' is not defined, require args is './data.js'
Page 'pages/v2-live/v2-live' has not been registered yet
```

### 根因是结构性的，不是偶发

`project.config.json` 的 `miniprogramRoot` 是 `miniprogram/`，**打包器只构建这棵子树**。因此：

* 只存在于 root 级 `pages/` 树的文件对运行时**不可见**，不能顶替包内文件；
* `miniprogram/app.json` 注册了但没有提交 `.js` 的页面**根本无法注册**——而开发者工具会
  自动写一个未跟踪的 `miniprogram/pages/game/game.js` 样板 stub 把它"修好"。stub 比缺文件更糟：
  包看起来完整，实际发出去一个空白页。

补上那两个已知文件只能治今天的症状，缺陷类别原样留着。本轮因此交付**永久门禁**。

### 补齐的四个文件（字节级镜像）

| 源（唯一事实源，保留在原地） | 目标（包内） | 为什么必须在包内 |
| --- | --- | --- |
| `pages/start/data.js` | `miniprogram/pages/start/data.js` | `start.js` 解构 `{MASTER_TALENTS, ROOT_POOL, GAME_HELP}`；缺失即默认路由抛错 |
| `pages/game/game.js` | `miniprogram/pages/game/game.js` | `app.json` 注册 + tabBar 项；缺失即页面无法注册 |
| `pages/start/start.wxss` | `miniprogram/pages/start/start.wxss` | 模板用到 74 个静态类，缺样式即默认路由裸奔 |
| `pages/game/game.wxss` | `miniprogram/pages/game/game.wxss` | 模板用到 101 个静态类 |

镜像由 `tools/miniprogram-package-mirror.mjs` 驱动：**字节级完全一致**，无换行/格式化改写。
这是"精确保留 1.0 语义"从承诺变成可验证断言的方式。root 级源文件**不删不移**。

注意：包内 `start.js` / `game.wxml` 比 root 树**更新**（单档 300 钻分享、`rechargeNotice` 数据驱动文案），
镜像不会覆盖它们——`MIRROR_MANIFEST` 只列了 4 个文件。

### 永久门禁

`tools/miniprogram-package-closure.mjs` 静态证明整包自洽，七项全部 fail-closed：

* **A 根目录**：从 `project.config.json` 读 `miniprogramRoot`，不写死 `miniprogram/`。写死的话，
  根目录一改，这个门禁就静默变成空转——那正是本任务要防的失败。
* **B 清单**：`app.json` 可解析、页面数组非空无重复。
* **C 页面入口**：每个注册页面都有已提交的 `.js` **且真的调用 `Page(`**，以及已提交的 `.wxml`。
  只查文件存在会漏掉 stub 的另一半：能编译、能注册、渲染空白。
* **D 传递闭包**：从包内每个 `.js` 出发，字面量相对 `require`/`import` 必须解析到根内已提交文件，
  **递归**走完。`start.js → data.js`、`game.js → game_data.js` 都是二阶事实，单层扫描看不到。
* **E 禁止逃逸**：越出根、或指向 `.ts` / `packages/` / `server/` / `cloudfunctions/` 一律违规。
  **先判前缀再判存在**是刻意的——root 级 `pages/foo.js` 绝不能顶替 `miniprogram/pages/foo.js`。
* **F 只认字面量**：计算式 `require(变量)` 打包器无法静态解析。
* **G 模板依赖**：`<import>` / `<include>` / `<wxs src>` 必须解析到根内，悬空 include 不报错但渲染残缺。

该门禁已接入 `tools/route-guard.mjs`（检查项 I），所以**"`v2-live` 已注册"从此蕴含
"`v2-live` 能启动"**，而不是"JSON 列表看起来对"。

### 新增文件

`tests/livefix02.test.mjs`（16 项）、`tools/miniprogram-package-closure.mjs`、
`tools/miniprogram-package-mirror.mjs`；package scripts：`test:livefix02`、
`miniprogram:package-closure`、`miniprogram:package-mirror[:write]`。

### 未动的东西

`cloudfunctions/tianfu2`、`server/`、Core、Content、玩法规则、数据库集合、实时 RPC 语义、
`miniprogram/app.json` 的首屏与 tabBar 顺序——全部未触碰。1.0 语义按原样镜像，
包括其既有的客户端随机（镜像文件与源字节相同，**不要求**重写为 2.0 规则）。

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
