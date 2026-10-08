# PLAYUX01 阶段 A —— 产品行为映射表（实测）

任务：`PLAYUX01` ｜ 基线：`1ed4bdc06803c73e09d89401e1f5161be08da077` ｜ 分支：`wb-PLAYUX01`
设计合同：`docs/PLAYUX01-PRODUCT-SPEC.md`（`DESIGN_LOCKED_FOR_IMPLEMENTATION`）

本文件是规范第 8 节「阶段 A」要求的交付物：把 Controller 锁定的产品设计核对到**真实结算**上，
产出一张可复核的对照表，并明确技术是否可以实现本规范。

所有数据均由只读探针实测产出，未修改任何产品代码：

| 探针 | 作用 | 原始输出 |
|---|---|---|
| `tools/playux01-mapping-probe.mjs` | 4 行动 × Director 槽 × 代表事件 × 每个 choiceId × 真实 effects × 公开可见变化 | `.playux01/map.json` |
| `tools/playux01-ending-probe.mjs` | ENDING / LIFE_BOOK / REBIRTH_RESULT 四种 stage 投影一致性 | `.playux01/ending.json` |
| `tools/playux01-nogain-probe.mjs` | 规范 D「无收获」可表达性的三条路径裁决 | `.playux01/nogain.json` |

---

## 1. 结论摘要

| 规范节 | 要求 | 实测结论 | 是否可实现 |
|---|---|---|---|
| 2.A | P2 首次引导尊重本次 action | **失败**：4 行动中 3 个抽到非语义匹配事件 | 可实现（需改 `queryForSlot`） |
| 2.B | P6 普通兜底按 action 匹配 | **失败**：12 个 ordinary 事件 `actionAffinity` 全为空，跨行动共用池 | 可实现（需补标签 + 改索引） |
| 2.C | 保留 P3/P4/P5 优先级与 NPC 连续性 | 成立：当前 8 条 gate 均为纯读取，无副作用 | 保持不动 |
| 2.D | 无合适候选时给出清晰「无收获/落空」 | **可实现**（推翻初判，见 §6） | 可实现 |
| 2.E | 不改 3/2/1/1 时间成本、不改 RNG draw 数 | 时间成本实测正确；改动不触碰 `drawInt` 调用点 | 可实现 |
| 3 | 消除全能模板尾句与通用选项 | **失败**：模板尾句 66/66；通用选项 8 类覆盖全部 66 事件 | 可实现 |
| 4 | 权威反馈屏 | 受阻：gateway 不投影结果，wechat-shell 丢弃附加字段 | 可实现（走 PublicView 差异） |
| 5 | 生平录显示实际选择 | **受阻**：`run.events.history` 无 `choiceId` | 可实现（新增可选字段） |
| 6 | ENDING 0/0/0 与 LIFE_BOOK 11/4/2 | **未复现**；发现另一条真实缺陷路径 | 部分可实现，见 §7 |
| 7 | 可观察层中文 | **失败**：`.history` 键 66/66 缺失；16 个 build stage labelKey 缺失 | 可实现 |

**无 CONTRACT_CONFLICT。** 规范 9 节全部 9 项 Gate 均有可执行的技术路径。
唯一需要 Controller 知晓的是 §7 的 `11/4/2` 数字本身尚未被复现（残余风险，非阻塞）。

---

## 2. Gate「动作区分」失败证据（P2 首次引导）

固定初始状态（firstRun、age 20、maxAge 200），分别点击四个行动，实测 Director 选中结果：

| 行动 | ageCost | 实际命中事件 | 声明 affinity | 语义匹配 | candidateCount |
|---|---:|---|---|---|---:|
| 闭关 cultivate | +3 | 路边伤者<br/>`content01.onboarding.roadside-injury` | [入世] | **否** | 8 |
| 游历 travel | +2 | 静室<br/>`content01.onboarding.quiet-retreat` | [闭关] | **否** | 8 |
| 入世 worldly | +1 | 避雨<br/>`content01.onboarding.rain-shelter` | [游历/入世] | 是 | 8 |
| 追索 pursuit | +1 | 路边伤者<br/>`content01.onboarding.roadside-injury` | [入世] | **否** | 8 |

**根因（`packages/core/src/director.ts:96`）**：

```typescript
const query: DirectorIndexQuery =
  slot === "P2" ? { slot: "onboarding" } : ...
```

P2 分支**不传 `action`**。而 `registry.ts:479` 的 `queryIndex()` 对
`slot === "onboarding"` 只取 `index.onboarding` 全集，因此 `candidateCount` 恒为 8。

`scoreDirectorEvent()` 中 `actionAffinity` 仅通过 `actionAffinityBonus` **加权**
（`director.ts:82`），不构成语义门禁——非匹配事件仍以 `baseWeight` 正常参与抽取。

这直接违反规范 2.A「修炼不能进入山路教学，追索不能进入早市教学」。

## 3. Gate「动作区分」失败证据（P6 普通兜底）

非首局、按规范四个行动各推进一次，实测命中：

| 行动 | 实际命中事件 | 声明 affinity | ordinary fallback |
|---|---|---|---|
| 闭关 cultivate | 小交易<br/>`content01.ordinary.market-bargain` | (无) | true |
| 游历 travel | 半盏茶<br/>`content01.ordinary.tea-house` | (无) | true |
| 入世 worldly | 收谷<br/>`content01.ordinary.harvest-help` | (无) | true |
| 追索 pursuit | 收谷<br/>`content01.ordinary.harvest-help` | (无) | true |

**根因**：`director.ts:96` 的 P6 分支为 `{ slot: "ordinary" }`，完全不传 `action`；
且 `content01-v1.ts` 中 12 个 ordinary Spec **均无 `actions` 字段**，故全部 `actionAffinity` 为空。

这是规范验收矩阵首条 Gate「不出现追索抽出『山色』这类无由来普通事件」的**直接失败证据**：
追索（pursuit）抽到「收谷」，闭关（cultivate）抽到「小交易」。

**硬约束（必须保留）**：`registry.ts:457` 要求 pack 内至少存在 1 个
`actionAffinity.length === 0` 且非 Cause-linked 的普通事件：

```typescript
if (!(events as EventDefinition[]).some((event) =>
  (event.actionAffinity?.length ?? 0) === 0 && !causeLinkedEventIds.has(event.id)))
  fail("pack.events", "playable pack requires an ordinary fallback Event that is not Cause-linked");
```

因此**不能给全部 12 个 ordinary 事件加 actions**，必须至少保留 1 个空 affinity 事件。

---

## 4. 代表事件逐选项真实结算

以下为规范第 2 节点名的四个代表场景 + 三个产品样例的**权威实测**。
`declaredEffects` 取自 Content01 真实 `outcomes`；「权威可见变化」取自结算前后
`PublicViewModel` 的字段级差异（已剔除 history 计数本身）。

### 4.1 规范点名的四个代表场景

#### 初息 · 闭关 · `content01.onboarding.first-breath`
声明 affinity: [闭关] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

**语义错配**：规范要求「玩家读到修炼过程中实际发生的事，选项围绕继续行功/调整方式/及时收功」。
实际「继续行功」给的是**灵石 +2**，修炼场景无任何修为收益；反而「停步细看」给修为。
`applyEventEffects` 的默认 spiritStone 逻辑（`content01-v1.ts` `choices(spec)`）与场景无关。

#### 静室 · 闭关 · `content01.onboarding.quiet-retreat`
声明 affinity: [闭关] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

与「初息」**逐字段完全相同**——两个不同场景对玩家呈现同一份结算。

#### 山路 · 游历 · `content01.onboarding.mountain-road`
声明 affinity: [游历] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

**违反规范明令**：「游历……不能无缘无故获得灵石」。实测选「顺势而行」即得灵石 0→2，无任何来源。

#### 早市 · 入世 · `content01.onboarding.market-choice`
声明 affinity: [入世] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

#### 旧痕 · 追索 · `content01.onboarding.old-trace`
声明 affinity: [追索] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

**违反规范明令**：追查真相却给灵石，规范禁止「没有来源时不伪造收益」。

### 4.2 产品样例

#### 偏僻岔路 · 游历 · `content01.build.fortune.fork`（规范产品样例 1）
声明 affinity: [游历/追索] ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 依此磨炼 | success: ADD_BUILD_EVIDENCE:900:build.fortune | success | builds `[]`→`build.fortune=latent` | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

规范要求三个选项分别表达「循蹄印进入偏路 / 登高观察后再决定 / 放弃偏路沿熟路赶路」。
实际**唯一带场景语义的行**（`engage`）叫「依此磨炼」——正是规范第 3 节点名的禁用默认选项文案。
另两个是通用兜底。

#### 山色 · 游历 · `content01.ordinary.mountain-view`（规范产品样例 2）
声明 affinity: (无) ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

规范要求「停留调息/观路辨向/继续上路」的差异，且「未产生数值或事实变化时，结果诚实写
『此行没有明显收获』」。当前无任何选项能表达零变化（见 §6 已解决的路径）。

#### 小交易 · 入世 · `content01.ordinary.market-bargain`（规范产品样例 2 备选）
声明 affinity: (无) ｜ 模板尾句: **true**

| choiceId | 选项文案 | declaredEffects | appliedTier | 权威可见变化 | ageDelta |
|---|---|---|---|---|---:|
| `engage` | 顺势而行 | success: ADD_RESOURCE(spiritStone):2 + ADJUST_NPC_RELATION | success | spiritStone 0→2 | 0 |
| `consider` | 停步细看 | success: ADD_CULTIVATION:150 | success | cultivationBps 0→150 | 0 |
| `leave` | 见好便收 | success: ADD_RESOURCE(spiritStone):1 | success | spiritStone 0→1 | 0 |

**这是唯一带 `ADJUST_NPC_RELATION` 的代表事件**，但该效果在 `applyEventEffects` 中
（`event.ts:233`）落入 break-only 分支，仅被原样回显进 `publicEffects`，
**不产生 PublicView 可见的关系变化**。规范要求「结果与实际货币或公开关系变化相符」——
当前谈价只影响货币，关系变化不可见。

### 4.3 跨事件共性

全部 8 个代表事件：
- `bodyHasBoilerplateTail` = **true**（模板尾句 100% 覆盖）
- `ageDelta` = 0（全部选项均不消耗额外时间）
- `newCurrentEvent` = null（结算后无后续事件，全部单向终止）
- 三个选项的效果**完全来自同一模板**，与场景无关

---

## 5. 文案覆盖率

| 项目 | 实测 | 规范要求 |
|---|---|---|
| 模板尾句覆盖 | **66/66** | 「所有修过的可达事件不再含统一空泛尾句」 |
| 缺失 `.history` 键 | **66/66** | 「不再有 .history 生硬键」 |
| build stage labelKey 缺失 | **16/16** | 「不再有 build.*.latent 生硬键」 |

通用选项标签分布（全 66 事件）：

| 选项文案 | 出现次数 |
|---|---:|
| 停步细看 | 45 |
| 见好便收 | 45 |
| 顺势而行 | 25 |
| 依此磨炼 | 20 |
| 承担此险 | 14 |
| 先辨征兆 | 14 |
| 及时折返 | 14 |
| 留一句话离开 | 7 |

这 8 个标签即规范第 3 节点名禁止的「一律通用选项」全集。

**build stage labelKey 缺陷根因**：`packages/content/src/build-v1.ts` 中 `build.fortune`
未显式声明 `stages`，走默认模板 `build.${value.id}.${name}`，而 `value.id` 本身已是
`build.fortune`，故产出双前缀 `build.build.fortune.latent`：

| key | known |
|---|---|
| `build.sword.latent` / `.emerging` / `.formed` / `.refined` | false |
| `build.body.latent` / `.emerging` / `.formed` / `.refined` | false |
| `build.alchemy.latent` / `.emerging` / `.formed` / `.refined` | false |
| `build.build.fortune.latent` / `.emerging` / `.formed` / `.refined` | false |

前 12 个缺中文文案；后 4 个既有缺文案、又键名本身错误。

**`.history` 键泄漏根因**：`server/src/viewmodel.ts` `history()` 直接拼
`` `${entry.eventId}.history` ``，而 Content01 目录（`CONTENT01_ZH_CN`）不含任何 `.history` 键。
66 个事件必然全部落到「原始键直出」。

**死亡码原始键泄漏**：`clientDeathRaw = "lifespan-hard-ceiling"`，
由 `miniprogram/pages/v2-live/v2-live.js` `buildTerminal()` 中
`deathCause: str(record(lifeBook.death).directCause)` 直接输出 `immediateSource`。

---

## 6. 规范 D「无收获」可表达性 —— 初判被推翻

### 初判（错误）
mapping 探针扫描现有 Content01，发现 0 个选项的 effects 列表为空，据此报
`D-NO-GAIN: conflict = true`，理由是「registry 的 core-choice 校验强制每个 core choice
至少改一项长期维度，零变化无法用现有 EffectSpec 表达」。

### 裁决（正确）
该结论**只看了现有内容，没有实际去问 registry 的校验规则**。真实条件是
`packages/content/src/registry.ts:273`：

```typescript
if (scope === "core" && !rhythmOnly && choice.threatId === undefined
    && ![...ops].some((op) => longTermOps.has(op)))
  fail(path, "core choice must change a long-term dimension");
```

该校验有**三条豁免路径**，其中 `OUTCOME_TIME_DELTA`（`registry.ts:124`）**就在 `longTermOps`
集合内**，且 `reducer.ts:386` 用 `resolveTimeAdvance(..., applied.outcomeTimeDelta)`
把它真实应用到 `run.age`。

`tools/playux01-nogain-probe.mjs` 实测三条路径：

| 用例 | 构造 | registry | 真实结算 |
|---|---|---|---|
| R1 | 空 `effects` + `scope: "core"` | **拒绝**<br/>`core choice must change a long-term dimension` | — |
| R2 | `effects: [OUTCOME_TIME_DELTA: 1]` | **接受** | age 20→**21**，spiritStone 0→**0**，cultivation 0→**0**，history 0→1 |
| R3 | `rhythmOnly: true` + `next` 指向不同事件 | **接受** | age 20→**20**，spiritStone 0→**0**，cultivation 0→**0**，history 0→1 |

R2/R3 的 `publiclyObservableZeroReward = true`，且 `narrativeFacts` 均含 `EVENT_OUTCOME`。

### 结论

**「有时间代价、无资源收益」是一个已注册、可结算、可公开观察的真实状态，不是冲突。**

规范 D 的「清晰的无收获/行动落空反馈」在现有契约下可实现，且**不需要新增任何 op、
不需要修改 registry 校验、不需要绕过 Registry**：

- 选项结算后 `spiritStone` 与 `cultivationBps` 均不变 → 反馈屏诚实写「此行没有明显收获」
- `age` 或 `history` 的真实推进足以证明这次选择确实发生过，不是假结果
- R3 的 `rhythmOnly + next` 还提供了「无收益但场景继续推进」的合法表达

唯一真实限制：**不能写「完全没有变化」**——`history` 条目数必然 +1，
`nodeIndex` 必然推进。这是结算契约的必然结果，不是缺陷，反馈屏不应把它显示为「什么都没发生」。

---

## 7. ENDING 0/0/0 与 LIFE_BOOK 11/4/2 —— 未复现，但发现另一条真实缺陷

`tools/playux01-ending-probe.mjs` 跑完 5 种行动循环的一 life，在四种 stage 下投影并对比计数。

### 同 sidecar 下 ENDING 与 LIFE_BOOK 完全一致

| seed | 循环 | 权威 history | 权威 metNpcs | ENDING 计数 | LIFE_BOOK 计数 |
|---|---|---:|---:|---|---|
| cycle-4 | 四行动轮转 | 9 | 2 | 9/2/0 | 9/2/0 |
| cycle-travel | 全 travel | 7 | 2 | 7/2/0 | 7/2/0 |
| cycle-worldly | 全 worldly | 9 | 2 | 9/2/0 | 9/2/0 |
| cycle-pursuit | 全 pursuit | 9 | 3 | 9/3/0 | 9/3/0 |
| cycle-cultivate | 全 cultivate | 1 | 0 | 1/0/0 | 1/0/0 |

`reproduced(ENDING != LIFE_BOOK) = false`。**规范第 6 节点名的 0/0/0 vs 11/4/2 冲突未能复现。**

### 但发现一条更可能的真实成因：无 sidecar 时 `state.terminal` 完全 ABSENT

`noSidecarEndingAbsentCount = 5/5`：

- 无 terminal sidecar 时，`derivePageState()` 因 `status === "dying"` 回退判定 `pageState = "ENDING"`
- 但此时 `buildPublicTerminal()` 返回 `undefined`，`state.terminal` **不存在**
- 客户端 `buildTerminal(null, ...)` 返回 `null` → `vm.terminal` 为 null
- 若 WXML 直接渲染 `vm.terminal.lifeBook.eventsCount` 一类路径，会得到 **0/0/0**

**这极可能就是真机观察到 ENDING 0/0/0 的机制**：ENDING 首屏在 sidecar 尚未创建时
投影缺失，客户端空值被渲染为 0。

### 残余风险（须由 Controller 裁决）

Controller 截图中的 `11/4/2` 对应的**具体存档/fixture 未知**。本轮 5 个 fixture 的权威事实
均未达到 11/4/2（events 最高 9、people 最高 3、builds 全 0），因此 `11/4/2` 本身
**尚未被复现**。需在阶段 D 用更长 life / 实际 build 形成路径进一步逼近。

阶段 D 将：
1. 修复无 sidecar 时 ENDING 首屏不再渲染 0/0/0（改为保守的「尚未生成」或直接复用权威投影）
2. 新增计数一致性测试：同一 `runId` 在 ENDING / LIFE_BOOK / REBIRTH_RESULT 的共同指标必须相等
3. 若仍无法复现 11/4/2，如实报告实际观测与残余风险，**不凭推断修改数据**

---

## 8. 其余已核实的实现约束

### 8.1 结果反馈通道（规范第 4 节）

`CommandResult`（`packages/command-wire/src/index.ts`）契约本身**支持**结果投影：

```typescript
export interface CommandResult<TPatch, TEffect, TNarrative> {
  ok: boolean; commandId: string; stateVersion: number;
  statePatch?: TPatch; domainEffects?: TEffect[]; narrative?: TNarrative;
  error?: { code: AppErrorCode; messageKey: string; retryable: boolean };
}
```

但当前两处均未使用：
- `server/src/command-gateway.ts` 只填 `{ ok, commandId, stateVersion }`，
  未投影 `executed.output.effects` / `narrativeFacts`
- `packages/wechat-shell` 的 `parseCommandResult()` 成功分支只保留三元组，
  **丢弃一切附加字段**

因此阶段 C 采用规范第 4 节允许的第二优先级路径：**同一命令提交前后的权威 PublicView 差异**。
`applyEventEffects()` 返回的 `publicEffects`（EffectSpec 原样回显，`event.ts:240`）
可作为「确认的变化」的数据源，且不泄漏 RNG/隐藏因果。

### 8.2 `choiceId` 存档（规范第 5 节）

`run.events.history` 条目类型为 `{ eventId, nodeIndex, resultTier? }`。

**关键事实**：`packages/core/src/state.ts` 对 history 的校验使用
`stringValue(event.eventId, ...)` / `integer(event.nodeIndex, ...)` /
`optionalString(event, "resultTier", ...)`，**未调用 `exact()`**，因此**允许额外字段**。

故新增可选 `choiceId` 是安全的：
- `reducer.ts` `chooseEventOption()` 写 history 时补入 `command.optionId`
- 旧档无该字段 → 客户端显示「此前选择未记录」，**不倒推**
- `projectRuleState()` 包含整个 `run`，故新字段会进入 `ruleStateHash`——
  这是既有契约的正常行为（确定性重放依赖它），非风险

`narrativeFacts` 的 `EVENT_OUTCOME` 已含 `{ eventId, choiceId, requestedTier, appliedTier }`，
可直接作为反馈屏数据源，无需新增契约。

### 8.3 必须保持不变的既有约束

| 约束 | 位置 | 说明 |
|---|---|---|
| 时间成本 3/2/1/1 | core `CHOOSE_ACTION` | 规范 2.E 明令不得以 UX 为由改平衡 |
| P3 Cause 回响优先级 | `reducer.ts:292` | 规范 2.C 保留 |
| P4 core NPC 连续性 gate | `director.ts:51` `coreNpcRepeatGate` | 纯读取 `recentScenes`，无副作用 |
| P5 contextual gap gate | `director.ts:63` `contextualGapGate` | 同上 |
| 普通事件空 affinity 硬约束 | `registry.ts:457` | 见 §3 |
| `drawInt` 调用点 | `director.ts:106` | 规范 2.E 不改 RNG stream draw 数 |

---

## 9. 阶段 B 施工计划（据本表确定）

1. **`director.ts` `queryForSlot()`**：P2 分支传 `action`；P6 分支传 `action`
2. **`registry.ts` `queryIndex()`**：`onboarding` / `ordinary` 槽支持按 `action` 过滤，
   同时保留 §3 的「至少 1 个空 affinity 非 Cause 事件」硬约束
3. **`content01-v1.ts`**：为 ordinary Spec 补 `actions`（保留至少 1 个空）；
   删除统一尾句拼接；代表场景选项场景专属化且效果语义匹配
4. **`build-v1.ts`**：为 `build.fortune` 显式声明 stages，修双 `build.` 前缀
5. 配套定向测试：`director.test.mjs`、`loopfix02b2/c.test.mjs` 断言须保持通过

**范围提醒**：阶段 B 只改语义匹配与内容质量，**不触碰**时间成本、RNG draw 点、
P3/P4/P5 优先级与 NPC 连续性。