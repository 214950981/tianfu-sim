# PLAYFEEL01 自动试玩报告（阶段 A 基线）

执行方：WorkBuddy｜工作分支：`wb-PLAYFEEL01`｜派发 HEAD：`93bfdc48eebd8b7f0774947df4c16b63f64f6de3`

> **本文件当前只包含阶段 A（基线）。** B（实现）/C（对照）/D（验证）尚未完成，见文末「交付状态」。
> 不提早就把未做的事写成已完成。

---

## 1. 度量装置

- `tools/playfeel01-event-audit.mjs` — 直读真实 `CONTENT01_PACK`，导出全部 66 场的合法选项与各结果层级的实际效果，产出 `docs/PLAYFEEL01-EVENT-AUDIT.md`。
- `tools/playfeel01-autoplay.mjs` — 调真实 `ContentRegistry` + `reducer` + `executeLoggedCommand`（因此 Director、RNG、进阶与全部冻结契约都是生产那套）。6 个固定 seed（3/7/11/19/23/31）× 3 策略 = 18 局，每局 ≤24 次**核心行动**（事件选项不计入上限）。
- 策略：`guided-cultivator`（闭关为主，失败后按合同「失败继续准备」补闭关再试）、`curious-traveler`（游历为主，每三次行动一次闭关）、`social-causality`（有已登记因果则追索，否则入世）。
- 灵根覆盖：按 (策略, seed) 轮换 offer 的三份 innateProfile，实测覆盖 `root.heavenly / five-elements / dual / triple / primordial / hidden / damaged`。

### 装置本身的一个真实教训（已修正，必须写明）

第一版装置**没有走「选择灵根」开局**（`START_RUN` 缺 `selectionId`）。后果是
`run.identity.innateProfile === undefined`，而 `applyRetreatProgression` 在此时**直接返回**
（`packages/core/src/progression.ts:65`）——于是闭关收益恒为 0，基线显示「18/18 从未达到 10000 修为」。
那是**装置的错，不是游戏的错**。改用生产路径 `generateServerDestinyOffer` + `selectionId` 开局后，结论完全改变。

第二处修正：第一版策略在突破失败后**立刻再试**。由于失败会同时扣修为与根基
（`progression.ts:82-85`），连续重试构成死亡螺旋，得到「60 次尝试 0 成功」的假象。
改为合同要求的「失败先补闭关重建根基」后，突破**可以成功**。**两次都是我这边的方法错误，已如实记录，未记入游戏缺陷。**

---

## 2. Before 基线（修正后，18 局）

| 策略 | seed | 灵根 | 核心行动 | 终龄/寿元 | 境界 | 修为 | 首次突破入口合法 | 突破尝试/成功 | 唯一事件 | 产生因果 | 死因 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| guided-cultivator | 3 | five-elements | 24 | 79/300 | golden-core | 9100 | 第5次 | 4/3 | 10 | 是 | - |
| guided-cultivator | 7 | hidden | 24 | 77/300 | golden-core | 9620 | 第5次 | 4/3 | 16 | 是 | - |
| guided-cultivator | 11 | hidden | 24 | 79/300 | golden-core | 9790 | 第5次 | 4/3 | 9 | 是 | - |
| guided-cultivator | 19 | damaged | 24 | 70/120 | qi-refining | 10000 | 第5次 | 6/1 | 11 | 是 | - |
| guided-cultivator | 23 | primordial | 24 | 78/300 | golden-core | 9990 | 第5次 | 4/3 | 14 | 是 | - |
| guided-cultivator | 31 | dual | 24 | 74/180 | foundation-establishment | 7946 | 第4次 | 6/2 | 12 | 是 | - |
| curious-traveler | 3 | triple | 24 | 96/120 | mortal | 10000 | 未尝试 | 0/0 | 13 | 是 | - |
| curious-traveler | 7 | primordial | 24 | 97/120 | mortal | 10000 | 未尝试 | 0/0 | 15 | 是 | - |
| curious-traveler | 11 | primordial | 24 | 98/120 | mortal | 10000 | 未尝试 | 0/0 | 14 | 是 | - |
| curious-traveler | 19 | primordial | 24 | 97/120 | mortal | 10000 | 未尝试 | 0/0 | 15 | 是 | - |
| curious-traveler | 23 | dual | 24 | 92/120 | mortal | 10000 | 未尝试 | 0/0 | 15 | 是 | - |
| curious-traveler | 31 | five-elements | 24 | 94/120 | mortal | 10000 | 未尝试 | 0/0 | 14 | 是 | - |
| social-causality | 3 | heavenly | 24 | 48/120 | mortal | 1870 | 未尝试 | 0/0 | 15 | 是 | - |
| social-causality | 7 | triple | 24 | 46/120 | mortal | 1470 | 未尝试 | 0/0 | 13 | 是 | - |
| social-causality | 11 | dual | 24 | 46/120 | mortal | 1470 | 未尝试 | 0/0 | 12 | 是 | - |
| social-causality | 19 | triple | 24 | 50/120 | mortal | 1860 | 未尝试 | 0/0 | 13 | 是 | - |
| social-causality | 23 | five-elements | 24 | 51/120 | mortal | 1950 | 未尝试 | 0/0 | 14 | 是 | - |
| social-causality | 31 | hidden | 24 | 45/120 | mortal | 2080 | 未尝试 | 0/0 | 14 | 是 | - |

### 基线指标（供 after 对照）

| 指标 | Before |
| --- | --- |
| 18 局中「≥50 岁仍为凡人」 | **8** |
| 18 局中「从未达到 10000 修为」 | **11** |
| 8 次核心行动内出现合法突破入口 | 6（全部来自 guided-cultivator，均在第 4–5 次） |
| 「连续 ≥5 次仅时间变化」出现的局数 | 0 |
| 有死因记录的局数 | **0**（24 次行动上限内无人死亡 → 死亡样本缺失） |
| 产生至少一条因果的局数 | 15 |
| 突破尝试中位节点 | 第 5 次核心行动（仅 guided 策略；6 局共 28 次尝试 / 12 次成功） |

---

## 3. 基线暴露的真实问题（按可玩性硬门 G1–G6 归类）

1. **G6「始终凡人且无突破目标」在两条策略上成立且可复现**：`social-causality` 6/6 局在 **45–51 岁** 时修为仅 **1470–2080/10000**。也就是说，一个只做入世与追索的玩家会**用掉 30 多年、几乎不知道自己在修炼上毫无进展**。这与产品合同 §2 的判断一致（「玩家只点入世/追索可以耗掉几十年而不知道突破路径」）。
2. **G6「连续 5 次无成长」的判定口径不足**：我的「纯时间连击」检测依赖 receipt 的 `labelKey` 里是否含 `time`，结果恒为 0 —— 这更像**检测器太弱**而不是游戏没问题。审计显示 **12 场含纯时间选项、3 场全部选项只有时间差**（见 `PLAYFEEL01-EVENT-AUDIT.md`）。C 阶段必须换成按「实际结算效果集合」判定，而不是按 label。
3. **G5 死亡样本缺失**：18 局 × 24 次核心行动内**没有任何一局死亡**，因此「寿尽 vs 提前死亡的类别与来源」这一条**当前无法验证**（NOT_MEASURABLE，不是 PASS）。要在 C 阶段把寿命与风险暴露度调到能产出两类样本。
4. **G2 结算叙事覆盖率极低**：66 场中**只有 2 场**（`onboarding.old-trace`、`onboarding.forked-path`）存在授权结算文案键；其余 64 场结果页只能显示数值。这正是「结果只有数字」的量化证据。
5. **G2 修为泛发**：66 场中 **60 场**含修为收益选项，其中大量出现在人间生活场景里（`ordinary.*` 等），缺少修行来源解释 —— 与「不能称一次普通谈话为获得修仙功法」直接冲突。
6. **因果确实能产生**（15/18 局），说明 Cause 框架可用；但当前没有任何一局能把「先前选择 → 后续可感知回声」串起来验证，因为结算文案与后续提示都缺失。

---

## 4. 交付状态（诚实声明）

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **A 基线** | 66 场审计 + 18 局 before + 度量装置 | **完成**（本文件） |
| B 实现 | B1 成长目标 UI／B2 结算叙事与人生书／B3 20 场施工／B4 标签与死因 | **未开始** |
| C 行为 | 同 seed after 对照、抓反例并修根因 | **未开始** |
| D 验证 | 定向 suite／typecheck／freshness／敏感信息扫描 | **未开始** |
| E 报告 | after 指标、20/46 清单、3 篇重现局日志 | **未开始** |

**未做的事一律标为未做。** 本分支当前的提交只包含 A 阶段产物，不包含任何游戏玩法改动，
因此**没有**触碰 Core/Content/Server/客户端的结算语义，也**没有**部署任何云资源。

### 若继续（下一步的最小顺序）

1. 先做 B3 的 20 场（内容层：选项语义 + 授权结算文案）——它是 G2 与 G4 的共同前提。
2. 再做 B2 的结果页与人生书（客户端按已结算事实读取）。
3. 然后 B1（首页成长目标与合法突破入口）与 B4（死因类别、去掉「第 N 版/第 N 节点」）。
4. C 阶段注意两处必须先修好的度量：时间差判定改为按效果集合，寿命/风险样本要能产出死亡。
5. 20 场里若遇到冻结 op 无法表达持续后果的情况，按合同记 `BLOCKED_CONTRACT`，不另造第二套状态源。
