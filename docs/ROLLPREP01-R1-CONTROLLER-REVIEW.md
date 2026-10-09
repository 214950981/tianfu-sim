# ROLLPREP01-R1 Controller 最终验收与下一步版本保护决策

日期：2026-10-09
结果：**R1 调查已完成 / 原云环境部署 BLOCKED_COMPATIBILITY / 保持 HOLD**。

## 1. 证据来源和 Git 状态

- 本记录依据用户原样转交的 WorkBuddy G1–G5 执行日志，不是 Controller 直接访问 Windows、真实微信 DevTools 进程或 CloudBase 控制台所得。本机测试、云侧元数据、历史运行时下载和 SHA 复算为 **WorkBuddy reported**，不冒称 Controller 自己跑过。
- Controller 独立核实 GitHub `dev/tianfu-2.0` 仍为派发基线 `23583a00926819154d5d07e6f98e31d350622e3a`；PLAYUX01 代码验收头为 `325c55563bf3fd812a8659aa1bc9d56cd6b42eaa`。本次 R1 合同明确要求 **0 Git commit/push**，所以 Git HEAD 未变化是正确交付形态，不是 WorkBuddy 漏交。
- `main` 不改；未执行云函数部署、在线数据库修改或玩家命令（来自 WorkBuddy 报告）。

## 2. R1 G1–G5 准确结论

| Gate | WorkBuddy 报告 | Controller 判定 |
|---|---|---|
| G1 四集合及权限 | CLI 无 database 元数据入口；四个集合存在/权限都未知 | **NOT_VERIFIED**，不得由“云函数以前能运行”推断安全规则 |
| G2 旧 EVENT 升级 | quiet-retreat 旧 `engage/consider/leave` 刷新为新 ID；提交旧 ID 被 `INVALID_OPTION` 拒绝，零状态变化；新 ID 正常结算且幂等 | **样本内 PASS_WITH_RISK**。旧网页上的旧选项需刷新；从未对完整在线存档声称全覆盖 |
| G2 同名选项行为改变 | `rain-shelter/engage` 旧 `spiritStone +2`，新版 `OUTCOME_TIME_DELTA 2` | **实质产品行为兼容性阻塞**：同一 optionId 没有自动报错，却改变了权威效果 |
| G3 旧日志与快照 | old→old 全回放 PASS；old→new 完整与中途快照后回放 FAIL，含 checkpoint mismatch/command replay failed；仅 START_RUN 负控 PASS | **旧日志不可按新内容审计复原**。真实服务器当前走 `readRun` 和 `executeLoggedCommand`，没有把 `replayCommandLog` 作为每次生产读取路径；因此不能说“线上玩家一定不能玩”，但不能宣称可用新包复原历史 |
| G4 代码恢复与依赖 | 老云端包树及 sdk 3.0.4 有本地证据，staging 动态 require PASS | **CODE_ROLLBACK_SOURCE_ONLY**；没有实际回滚演练，数据库备份及恢复还未证实 |
| G5 微信真实编译 | 仅一次启动尝试，无编译完成信息；IDE 临时会话未驻留 | **NOT_CONFIRMED**，不得当作实机 PASS |

其他 reported 发现：66 个事件中有 19 个事件的选项 ID 发生变化、40 个事件选项 ID 未变但效果变化、仅 7 个事件完全未变（以 WorkBuddy 差分口径为准）。内容 checksum 不同，但 `CONTENT01_VERSION` 均保持 `content01.v1`。新旧规则分流仅靠这个版本标识显然不够。

## 3. Controller 的独立源码确认

- `server/src/command-gateway.ts` 的 `fetchView` 通过 `GatewayStore.readRun` 读当前已保存的文档；`sendCommand` 读取存档并通过 `executeLoggedCommand` 增量结算，在该模块没有调用 `replayCommandLog`。
- `packages/core/src/reducer.ts` 的 `chooseEventOption` 会从**当前内容注册表**寻找 `event.choices[].id === optionId`，不存在就 `INVALID_OPTION`，存在但效果已变则以新效果结算。
- `packages/core/src/persistence.ts` 的 `replayCommandLog` 独立重新运行历史命令，对比记录的结果哈希；使用新内容回放旧日志时，内容和 Director 已更改即可出现 WorkBuddy 所报告的 checkpoint drift。
- 旧新服务器均以 `rulesVersion` 与 `contentVersion` 字符串比对信封，无法凭相同 `content01.v1` 判断不同内容包。因此**只给 contentVersion 贴新 checksum、在旧存档上拒绝，不是无痛修复**，可能将旧活跃 run 锁住。
- 以上仅核实源码触发条件，不声称验证了某条真实线上玩家存档的实际状态。

## 4. 技术决策：先保护旧世界，再体验新版本

**不批准直接覆盖现有 CloudBase tianfu2 云函数。** 有两种经过区别的未来方案，不是本任务授权：

A. **优先作为下一步可玩性验证：隔离的预览环境**。若用户批准，WorkBuddy 先只读确认平台是否支持独立 CloudBase 测试环境、可用权限和预估成本；再另获部署授权后，把新的 `tianfu2` 与四个**空的、隔离的测试集合**放到新环境进行实机测试。旧环境和旧存档绝不修改。新增测试环境不代表生产可升级，也不能将测试存档跨环境混作旧存档。

B. **今后真正升级旧存档：版本隔离机制（须独立编码授权）**。至少将 old `content01.v1` 与 new 已验收内容分成两个不可混淆的版本，按 run 固定旧内容和相应运行时/回放兼容路径；旧存档在旧规则下继续结算/审计，新 run 使用新版规则。涉及 Core/Content/Server/云运行时，应由 Controller 先做合同与最小设计、WorkBuddy 定向实现；不能把“改版本号/加 checksum”当成单独充分条件。亦不能以清库或强制清除旧 EVENT 取巧。

**建议先 A 验证真实体验，再根据用户是否要保留旧局升级作 B 决策。** 这不是放行部署；A 必须另行明确批准涉及创建新云资源和可能的费用。若平台无独立环境能力，退回 HOLD 讨论受严格隔离的替代验证，不改现有生产集合。

剩余门禁：G1 原线上四集合/规则不能确认；G5 微信真实编译无法确认；G4 未证明在线数据备份/恢复。即使 A 测试成功，现有线上环境的发布门禁仍是 BLOCKED。

## 5. 交接与控制

- ROLLPREP01-R1 **调查任务已经完成**。控制状态改为 `HOLD`，不因为用户发了测试报告就自动派下一任务。
- `workBuddyMayImplement=false`、`commitTaskResult=false`、`pushWorkBranch=false`、`startNextTask=false`；`cloudDeploymentApproved=false`。未授权 WorkBuddy 再次运行 G1–G5、修改代码、建立云环境、部署或改库。
- 需要用户下一次明确许可才可派一个**先做只读环境/成本评估**的隔离预览任务，或者一个**版本保护代码设计/修复**任务。不得两条路线并行无界施工。
