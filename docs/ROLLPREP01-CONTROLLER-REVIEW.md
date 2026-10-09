# ROLLPREP01 Controller 部署前检查验收记录

日期：2026-10-09
控制决策：**PREFLIGHT_COMPLETED / NOT READY / HOLD**。
WorkBuddy 自行声明：**BLOCKED_ENVIRONMENT**。
Controller 独立源码核对后补充：**COMPATIBILITY PROOF INCOMPLETE**。
用户授权范围：只读预检查与本地同步；**未授权真实部署或数据库修改**。

## A. GitHub 证据与任务边界

- 远端 `dev/tianfu-2.0` = `2e613b59bd8478ffae9d5d405766d2d51c0a5fa4`，为原已验收 `87d257c` 的单个派发提交，未触及游戏源码。
- 本任务是本地操作例外，WorkBuddy 没有 Git 提交或推送。本文件由 Controller 保存 WorkBuddy 经用户转发的文字报告，并清晰划分来源。**Controller 不能直接核实该电脑上的路径、哈希复算、CloudBase 控制台内容或 DevTools 日志。**
- `main` 未触碰；没有部署云函数、小程序，没有执行状态变更 RPC，没有在线数据库写操作（按 WorkBuddy 报告）。

## B. WorkBuddy 现场报告（待平台独立证明）

| 项目 | WorkBuddy 报告 | Controller 结论 |
|---|---|---|
| 微信 DevTools 实际项目 | 历史 WorkBuddy worktree，由活动日志 projectpath 判断 | reported pass |
| 客户端源文件 | 5 个已验收文件同步，9/9 客户端关联文件逐字节一致 | reported pass |
| 云函数本地候选包 | 38/38 与 dev 一致，生成物 freshness / closure pass | reported pass |
| 微信客户端编译 | CLI 窗口启动，但未收集成功判定 | NOT_CONFIRMED |
| 现有 CloudBase 环境 | 唯一环境与 app.js 一致，云函数 Active，Nodejs16.13，timeout=3s | reported, not direct Controller observation |
| 旧部署包与恢复候选 | 已下载当前线上函数包；报告为 38/38 匹配 `1ed4bdc`，含依赖，可用于代码版本回滚 | reported, restoration not tested |
| 线上数据库四个集合及权限 | 无只读元数据入口，尚未确认 | **BLOCKED_ENVIRONMENT** |
| 新旧存档格式矩阵 | WorkBuddy 在离线夹具对四个旧新组合均报告 PASS | scope-limited; does not cover full replay |
| Cloud backup | 只规划，没有在线数据导出/备份/恢复 | pending explicit permission and readiness |
| 部署命令和依赖 | 未跟踪本地脚本提示 remote-npm-install 和 lockfile 3 有冲突，需带依赖包 | historical local evidence only, verify before publishing |

## C. Controller 从 GitHub 确认的真实兼容性风险

1. **同名异包**。前后 `packages/content/src/content01-v1.ts` 中的 `CONTENT01_VERSION` 均为 `content01.v1`；但 PLAYUX01 更改了 P2/P6 选择逻辑和一些事件的 `choiceSet`，WorkBuddy 报告 56 个旧 choiceId 被移除、45 个新 ID 增加，Content pack checksum 改变。版本号本身不能识别内容行为差异。
2. **正在选择的旧事件**。`packages/core/src/reducer.ts:chooseEventOption` 从当前 content 注册表找 `event.choices[].id === command.optionId`，未命中直接抛 `INVALID_OPTION`。已有旧客户端待重试的旧 optionId 在新版内容下可能失败。是否经服务器刷新即可恢复，需要特定夹具证明；不要承诺所有旧游戏会话无缝恢复。
3. **历史命令重放**。`packages/core/src/persistence.ts:replayCommandLog` 使用输入 content 对 CommandLog 的命令重新执行，并校验检查点 / 结果状态哈希。旧日志如果包含被移除的 optionId，或者 Director 候选排序变化，可能无法与旧 hash 相符。WorkBuddy 的旧/新状态结构四格测试没有证明这条途径已安全。现存 StoredRun 继续结算与从初始状态完整重放是不同性质的验证。
4. **同名版本网关不阻止上述混用**。`server/src/command-gateway.ts` 只比较存档 rulesVersion/contentVersion 和信封声明的版本。对同为 `2.0.0` / `content01.v1` 的两包不会仅凭版本字符串阻止不兼容的选择语义。
5. **回滚只更新函数 ≠ 全部安全**。旧校验器允许新数据中的 `choiceId` 可证明字段形状容忍，但不足以证明各类新生成的 current event / log / Cause / RNG 可以被旧内容包继续重放。需要先确认部署期间的运行中会话处理方案和是否需要保留旧函数作为故障恢复。

以上 2/3 是**明确存在代码触发条件的风险**，尚未证明用户真实存档已经坏掉；不要把推断当成既成事故。

## D. 继续放行前必须拿到的只读证明

- **G1 CloudBase metadata**：四个集合存在且权限正确，仅查看名称与安全规则；绝不读取、修改或展示敏感存档数据。
- **G2 Upgrading a pending EVENT**：离线复用旧注册表在固定种子生成并停于 EVENT 的无隐私夹具，用新注册表展示和发送旧 optionId（应明确触发 INVALID_OPTION），再刷新合法新选项；确认不会重复奖励、卡死或丢失 run。含旧版 commandId 的重复重试情形。
- **G3 Full deterministic replay**：用旧内容注册表造至少一条真实旧 command log / snapshot（包含被替换 ID、旧 Director 选择链），针对新内容包定向运行 `replayCommandLog`。明确报告是否 PASS 或预期失败及处理措施，不修改线上数据。
- **G4 Rollback and package identity**：确认下载包的完整性、可逆使用的权限；旧版本云函数与新产生记录的双向兼容不能只拿字段可选证明；针对已报告 Node16 lockfile 问题给出可复现 staging 依赖策略。已有 3s 超时也需要上线阶段性能预案。
- **G5 Real compile**：在正确本地工程上得到明确成功/失败，而不是 compiler started。

若 G2/G3 出现旧会话或历史重放失败，下一步不应强行迁移旧库；优先提交 Controller 选择的保护策略（隔离新的测试环境、固定旧 run 的旧版本回放、版本化内容迁移等）供用户批准，不能由 WorkBuddy 私自改变规则/生成新功能。

## E. 结论与权限

- ROLLPREP01 的任务范围已经完成，结论 **not ready**，不是施工失败。WorkBuddy 已做到能取得的只读现场证据，但还不能声称云端升级安全。
- `.codex/control/NEXT_TASK.yaml` 归位 HOLD：`workBuddyMayImplement=false`、`commitTaskResult=false`、`pushWorkBranch=false`、`startNextTask=false`。
- 无自动后续任务，未来的只读补证也需要用户明确同意。**没有实际部署授权**。
