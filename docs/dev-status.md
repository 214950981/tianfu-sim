# Tianfu-sim 2.0 开发状态导航

> 本文件是开发导航摘要，不是最终事实源。
> 若本文件与最新 Git commit、contracts、task definitions、tests 冲突，
> 以最新仓库状态为准。

## Snapshot

- Repository: `214950981/tianfu-sim`
- Active branch: `dev/tianfu-2.0`
- Stable 1.0: `main`
- lastReviewedCommit: `6514afa3229d602bbbc3cff086a10bb4af8d9de4`
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
- LIVEFIX01: PASS（Controller 已验收；真实 CloudBase 空集合首次读取语义、空库首局创建、bootstrap/command/terminal 幂等与云运行时回归通过）
- LIVEFIX02: PASS（Controller 已验收；miniprogramRoot 页面/相对依赖闭包、4 个 legacy mirror、永久 package-closure gate 与 route guard 集成通过）

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

Real WeChat DevTools smoke after accepted LIVEFIX02 exposed a new source-integrity blocker before v2-live could load:
`pages/game/game.wxss(253:14): unexpected token`.

Repository evidence:
- both `pages/game/game.wxss` and its accepted mirror `miniprogram/pages/game/game.wxss` end at line 253 with `background: rgba(255, 152, 0`;
- the files are the same Git blob and the same truncation already exists on `main`, so LIVEFIX02 did not introduce the corruption; it faithfully mirrored a historically truncated source;
- Git history for this path contains only the original 2026-08-20 add, already truncated; no complete remote version is available to restore;
- the game WXML references many classes not defined in the surviving stylesheet tail, so this is likely loss of an entire suffix, not a one-token typo.

Current task: `LIVEFIX03` — Legacy WXSS Recovery + Package Style Integrity Guard.

Priority order:
1. Search deterministic local recovery sources first: sibling Tianfu WorkBuddy worktrees, backups/caches/archives that can be tied to this repository, and any previously materialized source copy. Do not search broadly across unrelated user files.
2. If a complete pre-truncation stylesheet is found, prove provenance/hash/length and restore from it.
3. If no trustworthy complete source exists, reconstruct only the missing suffix from committed WXML/JS behavior and existing visual conventions, with no gameplay/logic changes. Record explicitly that this is reconstruction, not historical recovery.
4. Add a permanent WXSS integrity audit for all registered MiniProgram page styles: fail on EOF inside a declaration/rule, unbalanced braces/parens/quotes/comments, and obviously truncated declarations. Also verify the mirrored legacy styles are syntax-valid after mirroring.
5. Keep validation targeted: LIVEFIX03 tests + mirror + package closure + route guard + WXSS integrity. No aggregate, no typecheck, no 600-run, no UI04 full regression.

After LIVEFIX03 is accepted, return immediately to DevTools compile/smoke. Do not continue feature work.## 新 Codex 会话 / 账号接手步骤

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
