# Tianfu-sim 2.0 — PROJECT-BRAIN

> 给未来 ChatGPT / 项目总控使用的长期决策摘要。
>
> **本文件保存“为什么这样做、以后怎么继续指挥”，不是代码事实源。**
> 若与最新 Git commit、contracts、task definitions、tests 或 `docs/dev-status.md` 冲突，以最新仓库状态为准。
> 当前做到哪里、最新诊断、下一任务，请先读 `docs/dev-status.md`。

---

## 1. 项目定位

`tianfu-sim 2.0`：

> **选择驱动 + Build 构筑 + 因果回响 + 轮回成长 + AI 叙事** 的文字修仙 Roguelite。

核心句：

> **命由天定，路由我选，因果终有回响。**

目标不是“剧情阅读器”或“挂机数值器”，而是让玩家每一世因选择、随机遭遇、人物关系、因果与风险，形成不同的人生。

---

## 2. 四条产品铁律

1. **玩家决定方向，随机决定遭遇。**
   玩家主动决定闭关、游历、入世、追索及事件选择；系统决定具体遭遇和检定结果。

2. **重要选择必须留下痕迹。**
   痕迹可以进入 Build、NPC 关系、Cause、伤势、债、承诺、世界标签、后续事件资格等。

3. **每一世必须形成可描述的身份。**
   玩家死后应能说清：这一世更像什么修士、和谁发生过什么、欠下什么、为什么死、还有什么没做完。

4. **AI 只能让世界更活，不能拥有规则。**
   AI 不得决定奖励、成功率、战斗、境界、货币、RuleState、Build、Cause 或 NPC 权威状态。AI 关闭时游戏仍完整可玩。

---

## 3. 商业化原则

> **不卖胜利，卖新的可能性。**

允许：可选激励广告、外观、扩展内容包、赛季/世界规则、可选 AI 高级叙事。

禁止：付费数值碾压、购买突破率、付费隐藏情报优势、把完整主循环锁进付费墙。

---

## 4. 人生长度与死亡

人生长度**不固定**。

允许有人 3–5 个有效节点就结束，也允许 30、50 个以上节点。禁止固定节点数、三幕剧强制推进、剧情护甲、强制见齐 NPC / Build / Cause。

短人生可以没有成型 Build、没有核心 NPC、Cause 未收尾，这仍是一段完整人生。

死亡原则：

> **寿元是理论硬上限和时间机会成本，不是大多数修士的预期死亡方式。**
>
> **危险可以高，冤死不能高。**

提前死亡可来自战斗、埋伏、探索、中毒、诅咒、重伤、复仇 Cause、突破风险和特殊灾难。重大致死结果必须有当前警示，或可追溯到过去的伤势/敌人/Cause/状态。前 3 个有效节点禁止无预警致死 RNG。

---

## 5. Life Book 与轮回

死亡不是失败页，而是高潮：

> `《此生仙录》`

应总结：身份、重大事件、重要人物、因果、遗憾、未竟之事、解锁内容。核心 CTA：**再活一世**。

轮回成长以**横向解锁**为主，不做永久数值碾压。可以解锁新天赋、天命、事件、世界规则和内容包。

---

## 6. 当前 v1 基础

境界：

1. 凡人 mortal
2. 炼气 qi-refining
3. 筑基 foundation
4. 金丹 core
5. 元婴 nascent-soul
6. 化神 transformation

未来必须支持第 7 境以上和分支境界，不能把 Core 写死成六层。

属性：

- 悟性 insight
- 体魄 body
- 神识 spiritSense
- 福缘 fortune

行动：

- 闭关
- 游历
- 入世
- 追索

---

## 7. Build 哲学

当前 v1 Build：

- sword 剑修
- body 炼体
- alchemy 丹修
- fortune 气运

Build 不是开局职业选择，而是由长期行为和关键选择形成。

阶段：

- 0–1999 latent
- 2000–4499 emerging
- 4500–7499 formed
- 7500–10000 refined

精确 bps 对玩家隐藏。

Build Evidence 必须来自有意义行为，而不是“点某行动就固定加”。允许双路线、转向和未来 hybrid。

**Fortune 特别边界：**不能靠偷偷改 RNG、reroll 或提高 Outcome 实现。应通过机会资格、特殊路径、Director opportunity 等合法接口体现。

---

## 8. Cause 哲学

Cause 不是善恶值，也不是任务清单，而是：

> **过去的选择，在未来重新获得意义。**

生命周期：

- dormant
- eligible
- echoed
- resolved
- expired

必要时可 transform。

Cause 必须可追溯、不一定奖励、不做道德评判、玩家能感到它来自过去，但不能提前知道未来 Event、budget 或隐藏条件。

体验目标：

> “三百年前随手做的事，三百年后回来找你。”

---

## 9. NPC 哲学

NPC 分级：

- **S**：作者设计的核心人物
- **A**：动态成长出的长期重要人物
- **B**：事件 NPC，可晋升 A
- **C**：背景人物，不长期持久化

核心原则：

> 不是所有 NPC 都要持久化，但真正变重要的人必须能留下来。

Generated NPC 由 Archetype + NamePool + TraitPool + seeded RNG 受控生成，不做 AI 随机造人。

NPC 真实状态与玩家知识严格分离，不能让 UI 泄露 hiddenTrait、hiddenFact 或未知 actualStatus。

---

## 10. CONTENT01 的五个核心 NPC

### 裴照川
断剑散修，重诺、好胜、身有旧伤。关键词：sword / promise / rivalry / wounded / wanderer。

### 姜雪芜
游方丹师，理性克制，会救人但不假装代价不存在。关键词：alchemy / healer / medicine / debt / pragmatic。

### 岑不归
炼体行者，少言、耐痛，尊重愿意承担后果的人。关键词：body / survival / injury / discipline / wanderer。

### 谢听潮
秘境寻踪者，喜欢押注未知，但不是无脑冒险。关键词：fortune / exploration / secret / risk / opportunity。

### 许长安
凡俗人物，承担“修士寿命越来越长，但凡人的岁月不会等你”的主题。关键词：mortal / human_world / promise / memory / time。

这些是首批内容，不是 Core 上限。

---

## 11. Director 的绝对职责边界

Director 只回答：

> **下一件什么事应该发生？**

Director 不决定成功、失败、死亡、奖励、NPC 关系、Cause 解决、Build 升级等 Outcome。

正式 precedence：

1. P1 terminal / lifespan
2. P2 first-run onboarding
3. P3 eligible Cause
4. P4 pursuit / core NPC continuity
5. P5 Build / world / action / NPC context
6. P6 ordinary fallback

严格 precedence 是有意设计。若 P6 被饿死，优先检查高层候选为什么长期不退出，例如 Cause 无 closure、NPC 无 cooldown，而不是先打乱 Director。

Director selection 必须：safe integer、canonical ordering、seeded RNG、无 Math.random / Date.now。

DirectorState 只保存紧凑近期场景环，当前窗口 8，不保存完整文本和巨大候选历史。

---

## 12. Risk 哲学

Risk 必须通过正式 Threat / RiskCondition / RiskPresentation 表达。

Content 不能自己伪造 riskHint，也不能直接写死亡 Effect。真正死亡走 RISK01 权威路径。

---

## 13. Event / NPC Participant Bridge

正式职责：

> **Director selects → Application materializes → NPC owns NPC state → Cause owns lifecycle → ViewModel exposes player-known projection only**

Event 可以声明 participant。

Core NPC：lazy instantiate，每 Run 同一 Definition 对应同一 persistent instance，不在开局预创建全部 S 级人物。

Generated NPC：使用既有 npc RNG 和 Archetype / Pools，在 scene 中 exactly-once materialize。

Scene 保存：`participant slot → npcInstanceId`。

Cause 必须绑定真实 npcInstanceId，不能用 displayName 当身份。

---

## 14. 技术总架构

> **Pure Core + Versioned Content + Command Application + Platform Adapter + Server Authority + Optional AI**

目标目录：

```text
apps/wechat
apps/douyin
packages/core/{state,rng,command,event,cause,npc,build,progression,ending}
packages/content/{schema,registry,packs}
packages/ai/{gateway,narrator,memory,schemas,fallback}
packages/platform-contract
packages/telemetry-contract
server/{commands,persistence,leaderboard,ai,admin}
tools/{simulate,replay,content-lint,migrate-v1}
tests/{unit,property,simulation,integration,content,security}
docs
AGENTS.md
```

概念 reducer：

```text
reduce({ state, command, context })
→ { state, effects, narrativeFacts, trace }
```

Core 禁止依赖 wx / tt / DB / OpenAI / Math.random / Date.now。

---

## 15. Server authority 与 Replay

客户端不是 RuleState 权威源。客户端发 Command，服务器/Application 验证并执行 Reducer，再返回 ViewModel。

不要维护第二套 local authoritative Core。

必须支持：Snapshot + Command Log + deterministic replay + canonical hash。

同一 seed / rulesVersion / contentVersion / commands 必须得到相同 state、Event sequence、hash 和 RNG drawIndex。

---

## 16. RNG 与数值冻结决策

RNG：`xoshiro128ss-v1`。

Seed bytes：

```text
UTF8(tianfu2|rng|rulesVersion|rootSeed|streamId)
```

SHA-256 前 16 bytes → 四个 uint32 little-endian，全零状态修正。

streams：offer / time / event / check / npc / npcTimeline / combat / breakthrough / director / world。

每个 stream 有独立 drawIndex；整数随机使用 unbiased rejection sampling。

数值：safe integer / fixed bps / integer years / canonical JSON / SHA-256。避免浮点累积。

---

## 17. D001–D015 冻结决策

- **D001** attrs：insight/body/spiritSense/fortune
- **D002** Cause：dormant/eligible/echoed/resolved/expired
- **D003** RNG：xoshiro128ss-v1
- **D004** RuleState hash：canonical safe-integer JSON + SHA-256
- **D005** safe integer / fixed bps / integer years
- **D006** offered run + START_RUN
- **D007** selector：terminal → first-run → Cause → NPC/pursuit → contextual → ordinary
- **D008** 每个 Run 重置 RuleState/world/NPC/Cause；仅 Meta unlock/discovery 持久
- **D009** 危险可以高，冤死不能高
- **D010** actionTimeCost 在 Event 前；outcomeTimeDelta 在 Event 后
- **D011** Director 只管 eligibility/weight/slot，不管 outcome
- **D012** server authority + pending UI，无第二套 local authoritative Core
- **D013** runName 由 seed/content 确定，不要求昵称/性别
- **D014** scene-discriminated NarrativePayload
- **D015** ApplicationTransport 与 PlatformAdapter 分离

---

## 18. Content 扩展原则

所有可扩展系统优先问：

> **能否用 Definition / Registry / Tag / Content Pack 表达？**

当前数量只是 v1 基线，不是 Core 上限。

“上亿种玩法”不是手写一亿条剧情，而是组合空间：

> InnateProfile × Build × 境界路径 × NPC关系 × Cause × 技法/装备 × 世界规则 × Event × Ending

通过系统组合制造多样性，不靠堆垃圾事件。

---

## 19. 内容质量与文风

不要为了数量换名字、换数值、轻微改正文就算新 Event。

人生需要普通但有意义的小经历：路遇、小交易、争执、帮助、短同行、无果寻找、闭关停滞等。不是所有内容都要上古秘境、绝世传承、生死大战。

玩家文本：中文、克制、有古意但可读、具体、有时间感、有留白。

避免网络梗、现代游戏术语、玄幻词藻堆砌、大量感叹号、“SSR”“Build+10”“Cause触发”“NPC好感+10”。

---

## 20. First-run 原则

前 3 节点使用 onboarding profile，自然教会：选择、修行、风险、人与关系。

不要教程弹窗，不强制核心 NPC 出场。

---

## 21. UI 总方向

视觉核心：**命书**。

关键词：宣纸、墨、朱砂、极少暗金、留白、克制动画。

主链：

```text
START → MODE_SELECT → DESTINY_OFFER → RUN_OPENING
→ RUN_HOME ↔ EVENT/SPECIAL_NODE
→ ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE
```

侧边档案：SELF / PATH / PEOPLE / CAUSES / CHRONICLE。

Run Home 显示当前年龄和最大寿元，不强调“还剩多少年”。

ViewModel 只能暴露玩家可知信息，禁止泄露 Director candidate/weight/trace、future Event IDs、Cause budget、NPC hidden facts、RNG state。

---

## 22. Daily Challenge 冻结概念

未来 CHAL01：同 seed、同版本、同内容池、同起始条件。

第一次正式人生叫“初赴此命”，每天一次免费。结束后若平台支持 rewarded ad，可额外“再赴此命”一次，同 seed 完整重开；第二次不覆盖第一次正式排名，不允许无限练习。

不要卖信息优势。

---

## 23. Codex 与 ChatGPT 分工

### ChatGPT = 总控

负责：产品方向、架构判断、任务拆解、Codex 施工令、日志验收、模拟数据解读、决定下一步。

不要把 Codex 的 PASS 自动当真。要核验合同、测试、scope、是否偷做新系统、是否把 simulation bug 误判成 runtime bug。

### Codex = 可替换施工队

负责：按明确施工令改代码、跑测试、审计和模拟、报告结果。

遇到真实合同冲突：**STOP → BLOCKED**，不要自行重写大架构。

---

## 24. Codex 档位策略

- **中**：文档、小工具、明确 Bug、小维护
- **高**：大型但规则明确的施工、内容包、常规跨模块接线
- **极高**：跨系统根因诊断、复杂架构、多合同冲突、最终大审计
- **Ultra**：仅留给极高仍难稳定处理的高不确定性问题

原则：

> **不拿航空燃料烧开水。**

每条施工令都应限制：当前任务 only、allowed/forbidden scope、不扫描无关仓库、不修改 1.0、不重复跑大型模拟、遇 blocker 停止、输出简洁。

---

## 25. Git 工作流

Repository：`214950981/tianfu-sim`

- `main`：稳定 1.0
- `dev/tianfu-2.0`：2.0 开发

标准流程：

1. ChatGPT 给施工令
2. Codex 完成
3. 用户把日志发给 ChatGPT
4. ChatGPT 验收
5. PASS 后 Commit
6. Push origin
7. 再进入下一任务

不要把多个未验收大任务混入一个 commit。

---

## 26. 新 Codex 账号接手

Codex 账号可以替换。新施工账号：

1. 打开/clone 同一 repo
2. 切 `dev/tianfu-2.0`
3. 看 `git status`
4. 看最近 git log
5. 读 `docs/dev-status.md`
6. 读当前 task definition
7. 运行 `node .codex/context.mjs <TASK_ID>`
8. 读 required contracts
9. 以最新 Git 为准
10. 不重新实现 PASS 模块

若 dev-status 比 Git 落后，先识别 `lastReviewedCommit` 之后的新 commits。

---

## 27. 新 ChatGPT 账号接手

新的 ChatGPT 应先读：

1. `docs/PROJECT-BRAIN.md`
2. `docs/dev-status.md`
3. 最近 Git history
4. 当前任务对应 contracts / task definition

然后先复述：

- 项目目标
- 当前做到哪里
- 已冻结的关键决策
- 下一任务及其原因
- 暂时不能提前做什么

确认理解后再指挥 Codex。

---

## 28. 开发工具链原则

`.codex/context.mjs` 已改为 task-definition-driven。

未来新增任务应主要新增 task definition，而不是修改 loader Core 的 taskId switch。

开发工具本身也必须可扩展。

---

## 29. 测试哲学

> **能测试的必须测试，能展示的尽量展示，不能只靠文字自报完成。**

按需使用：unit/property/simulation/replay/security/content lint/audit/extension smoke。

可扩展系统特别要验证：

> 新增 test-only Definition，不改 Core，也能 load / execute / replay。

---

## 30. Simulation 原则

本地模拟：无 AI、无网络，使用真实 Core command / reducer / RNG。模拟器自己运行不消耗 Codex 额度，只有让 Codex运行/分析时才使用 Codex 额度。

任何异常先判断：

> **Runtime bug？Content bug？Simulation bug？**

SIM02 已修正自动试玩的突破策略和 telemetry，因此后续玩法体检应优先使用 SIM02 数据。

---

## 31. 当前已知的循环治理原则

已确认过的典型问题包括：

- Cause 缺 closure
- origin 可重复
- Event 缺 cooldown / maxOccurrences
- Core NPC 进入后 P4 容易长期非空
- Cause echo 进一步挤占人生
- P6 ordinary 被高层候选饿死

治理原则：

> **先修“为什么高层候选永远存在”，不要先削 Director precedence。**

普通人生应通过高层剧情自然退出获得空间，而不是靠随机插播 P6。

Event recurrence 方向包括：

- maxOccurrencesPerRun
- cooldownNodes

Occurrence state 必须紧凑、确定性、Replay-safe。

repeat-safe 要按 Cause/Event 合同落地，不能用粗暴全局布尔值绕过验证。

---

## 32. 不要过早开发

主循环未稳定前，不要提前开发：

- ITEM inventory
- Technique tree
- Sect simulation
- Faction politics
- Economy
- Crafting
- 完整 World simulation
- AI free-text NPC
- Leaderboard
- Daily Challenge

原则：

> **解决今天的问题，给明天留接口。**

---

## 33. 新系统判断模板

每次准备增加新系统，先问：

1. 它是否解决当前玩家问题？
2. 能否用现有 Definition / Tag / Registry 表达？
3. 是否真的需要新的 RuleState owner？
4. 谁拥有权威状态？
5. Replay 怎么保证？
6. 是否需要新 RNG stream？
7. ViewModel 泄露边界是什么？
8. Content 如何扩展？
9. 是否需要 audit？
10. 是否需要 extension smoke？
11. 是否破坏短人生/长人生？
12. 是否把 AI 推进规则层？

---

## 34. 真人试玩目标

第一轮约 5 人。

重点验证：

1. 每一世是否真的不同？
2. 选择是否改变道路？
3. 人物是否留下记忆？
4. 旧事是否会回来？
5. 危险是否可理解？
6. 死亡是否可解释？
7. 死后是否愿意再活一世？

UI02 应服务这些问题，而不是掩盖尚未稳定的主循环。

---

## 35. 信息优先级

发生冲突时：

1. 最新 Git commit
2. 当前 contracts
3. 当前 task definitions
4. tests / audits
5. `docs/dev-status.md`
6. `docs/PROJECT-BRAIN.md`
7. 旧聊天记录

PROJECT-BRAIN 保存“为什么、原则、冻结设计、如何继续指挥”；不替代代码事实源。

---

## 36. 给未来总控的底线

不要为了表现“有新想法”推翻已 PASS 架构。

先区分：

- 产品原则
- 冻结合同
- 当前实现
- 当前内容规模
- 真正 bug
- 未来扩展

只有出现明确证据时，才改已 PASS 的核心模块。

如果不知道下一步做什么：

> 先看 `docs/dev-status.md`、最新模拟报告，以及当前玩家主循环最明显的阻塞，只修当前最值钱的一件事。

---

## 37. 最终方向

这个游戏的核心不是“拥有最多剧情”，而是：

> **让选择留下痕迹，让人生形成身份，让旧事重新回来，让每一世值得被记住。**

技术底线：

> **确定性、可 Replay、数据驱动、Content 可扩展、AI 不掌权。**

产品底线：

> **命由天定，路由我选，因果终有回响。**
