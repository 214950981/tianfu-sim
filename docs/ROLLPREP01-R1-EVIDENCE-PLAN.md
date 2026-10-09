# ROLLPREP01-R1：上线前只读补证（Controller 冻结执行方案）

签发：2026-10-09，Controller
父任务：ROLLPREP01（已完成，结论 NOT_READY）
代码基线：dev/tianfu-2.0@aebd3b6375338ab6f8334a106f876300debdb23b
任务性质：**EVIDENCE_ONLY / READ_ONLY / NO_DEPLOY / NO_CODE_EDIT**
来源文档：docs/ROLLPREP01-CONTROLLER-REVIEW.md、docs/ROLLPREP01-CHECKLIST.md

## 0. 权限和事实边界

这是用户明确批准的**一次**补证，不是云函数部署授权，不是数据库快照/导出授权，不是新开发任务。WorkBuddy 自动在本机操作，用户不需要找路径、开终端或粘贴秘密。源自上轮的本地同步（5 文件，关联 9/9）和云函数包（38/38）不要重做。

禁止：
- 任何对在线 CloudBase 的写入、创建/删集合、改变权限、创建备份或导出玩家数据、上传/部署云函数、发布小程序、修改云 Node runtime/timeout。
- 调用生产游戏的 createRunOffer / sendCommand / advanceTerminal / next-life；不得尝试真实线上玩家的交互，也不以 GET/POST 猜测的接口做“探针”。
- 修改 Core、Content、Server、客户端、数据库 schema、游戏逻辑、规则版本、已验收产物、测试源文件；不向 Git commit/push，不动 main/dev，不创建新的产品任务。
- 全仓漫游、npm test、600-run、长耗时重复回归、在当前项目运行可能修改存档的命令、无界网络重试。所有离线 fixture 与编译缓存只能在本机独立临时空间，保护工作树脏文件及现有客户端进度。
- 输出 OPENID、playerId、runId、bootstrapId、云环境凭据、数据库文档、原始玩家命令、AccessKey 或完整敏感日志；报告只能包含脱敏证据与必要摘要。

遇到需要额外权限或代码改造才能完成的点，标记 BLOCKED/NOT_VERIFIED，停止该点。不能自行降低验收标准或改造成“看上去通过”。

## 1. 最小化检查次序与可信基线

首次核对 GitHub 最新 dev HEAD，确认本任务 dispatch 后的变化**仅含控制文档**，Core/Content/Server/client 仍以已验收的 325c555 作为代码祖先。若观察到别的产品代码更新，标记 SOURCE_DRIFT 并停止。保留既有旧云端导出包（报告旧版对应 1ed4bdc）以及上一轮本地同步的目标文件和哈希，不重复完整下载与覆盖。

读取文件范围优先限定在：
- docs/ROLLPREP01-CONTROLLER-REVIEW.md、docs/ROLLPREP01-CHECKLIST.md、.codex/control/TOOLING_RUNBOOK.md
- packages/core/src/persistence.ts、packages/core/src/reducer.ts、packages/core/src/state.ts、packages/core/src/director.ts
- packages/content/src/content01-v1.ts、packages/content/src/registry.ts
- server/src/command-gateway.ts、server/src/cloudbase-store.ts、server/src/gateway-store.ts、server/src/viewmodel.ts
- CloudBase 旧导出包对应模块、已存在的测试 fixture/harness（只针对必要路径）。
完整旧包不得发送 GitHub/聊天。

## G1：CloudBase 四个集合及权限，只读证据

目标集合：
- tianfu2_runs
- tianfu2_commands
- tianfu2_bootstraps
- tianfu2_terminal_transitions

首选当前已认证且**只读**的微信 DevTools 云开发控制台：自动导航到经验证的正确环境，查看四个集合的存在/不存在、当前访问规则类型、是否为管理端可读写。只查询元数据（集合名称与规则），不点开玩家文档、不检索集合数据、不修改权限。若可用合法只读 CLI/API 元数据，亦可使用，但先确认操作性质，不允许任何数据库查询扫库或返回用户文档。

每个集合独立报告 EXISTS / MISSING / UNKNOWN、规则 VERIFIED / NOT_VERIFIED、证据来源及时间。截图可本地保留，但必须遮蔽环境 ID、账号、密钥和任何存档信息。若工具无法观察规则，写 RULES_NOT_VERIFIED；不能因为过去游戏正常运行就推断规则正确。若访问仅能通过写权限实现，立即停在 NOT_VERIFIED，不得申请用户手动运行命令。

## G2：旧待选事件跨版本升级（独立离线临界情况）

旧代码 = 1ed4bdc（或已导出的当前云运行时代码，经本地字节哈希验证），新代码 = PLAYUX01 已验收源的内容与 runtime。旧、 新 CONTENT01_VERSION 均为 content01.v1，但代码行为与注册表不同。这一点不能通过字符串相等推断安全。

在完全离线、本地内存存储、固定种子上构建有代表性的旧版正在等待选择的 GAME STATE。优先选一个事件 ID 不变但 optionId 改过的旧 onboarding（实际交叉 diff 为证），同时选择一个 optionId 未更改的对照事件。严禁改真实数据库数据。

针对两个场景，明确分别测试：
1. 旧事件/current state 用新注册表投影：选项列表能否正确刷新，还是 INVALID_OPTION / CONTENT_MISMATCH / 缺失 UI 等。
2. **仍在页面上的旧 optionId** 直接向新权威 reducer/gateway 发命令：是否 INVALID_OPTION，是否保持 stateVersion、年龄、资源、RNG、命令日志、Cause、NPC 和快照原样（零部分结算）。
3. 刷新成新 optionId 后再次提交：能否合法成功，是否改变原本公开承诺与奖励；若缺服务端刷新/旧页面缓存清理机制，直接记录 BLOCKED。
4. 重试同一 commandId 的已提交旧成功命令及未提交失败命令：分别核对既有持久幂等回执、payload 不同冲突和无重复发奖；不要伪造和真实存档等价的测试。
5. 旧版终局 stage 的 sidecar 可选状态对照，至少检查是否会因升级强制重开一生。

输出：逐步表格、确定性的样本事件 ID/选项 ID、预期与实际、状态哈希/结果摘要。失败时提出可执行的部署前保护方案，但**不要修代码**。

## G3：旧完整命令日志/快照 vs 新规则确定性回放

该测试与 G2 的“读旧存档并继续结算”不同。使用真实旧版 Core 和 Content 的无隐私固定种子夹具构建至少一个完整旧命令序列，尽量涵盖以下路径：
- 旧版 P2/P5/P6 Director 选择与原 optionId 的 CHOOSE_EVENT_OPTION；
- 曾从通用模板变为场景专属 id 的至少一个已成功旧事件；
- 经过快照后的日志，及至少一次重试/命令幂等记录（如记录格式可用）；
- 无法构造的分支清楚写为 NOT_TESTED。

先旧 runtime + 旧 Content 执行并回放，校验原 log 的 state hash/checkpoints 自洽，再将**相同旧记录原封不动**交给新 runtime + 新 Content 的 replayCommandLog，从原始初始状态或该快照执行。记录：
- 旧规则 replay 结果
- 新规则 replay 结果 / 精确错误类型（如 INVALID_OPTION、checkpoint mismatch、CONTENT_MISMATCH）
- 是否发生 Divergent RuleState hash
- 源数据是否**仅用于离线内存**且没有云端写入

至少设置一个未变的事件/选项作为负控。不可为了绿灯删除旧命令、重写 eventId/choiceId、掩盖 checkpoint mismatch、篡改 contentVersion 或“更新”历史记录。

报告须独立回答：
A. 已存 StoredRun 直接读取和正常 forward settlement 是否可行；
B. 从旧 command log/snapshot 的完整 replay 是否可行；
C. 旧函数代码对升级后新状态的读取、结算和回放是否同样可行。
如果任意结论未由专项证据覆盖，标为 NOT_VERIFIED，不可拿四格字段兼容矩阵替代。

## G4：回滚恢复来源、依赖方式与预期故障动作

复查上次只读下载的旧 deployed-snapshot 包完整性、与 1ed4bdc 的受控源码/运行时哈希对照、是否保留必要的依赖。只验证恢复资源与 CLI 所需的**权限/参数/包可用性**，绝不调用 deploy、修改配置或者在线回滚。

本地另建一次性 staging 目录模拟 Node16 依赖包结构、cloudfunctions/tianfu2 runtime 目录闭包；优先复用本地已经下载的依赖，不允许把 npm install 当成“只读”而直接在项目/cloudfunctions 目录运行；需要访问 npm 网络才能证明的部分标记 NOT_VERIFIED。给出平台下次正式审批时可复现的安装/打包步骤，但不能执行真实上传。

必须把两条回滚路径分开：
- 代码回滚：旧云函数包/Node/依赖确实可恢复的证据（没有实际部署过故结果为 READY_SOURCE_ONLY，不可自称真实恢复演练 PASS）。
- 数据恢复：四集合是否具备可执行备份及恢复方案。**本次不生成快照或导出**。如果实机数据恢复未经真实验证，标记 ROLLBACK_DATA_NOT_READY，不得从四格状态校验 PASS 推断无需备份。

明确记录旧、新包相同 contentVersion 而实际内容不同的风险；若 G2/G3 发现旧日志失效，回滚只换函数不一定能恢复新写入数据。必须建议“维持 HOLD，等待独立版本/运行中会话保护方案”，但不能自行施行。

3 秒 timeout 与 Nodejs16.13 的实际云端设置来自上次 WorkBuddy 报告；可只读核实并建议下一次发布后观察冷启动，不更改 timeout。

## G5：DevTools 真正编译，不能只看启动

复用上一轮已定位的 Windows 工作目录，现场读取最新 DevTools projectId/profile/CLI port，避免打开错误 clone。先校验上次 5 个受控文件的 SHA 仍与远端验收版一致，不重新覆盖。尝试**一次**受控真实编译：
- 确保 IDE 实例不被临时 CLI isTemp 模式随退出关闭。使用持久 IDE/CLI 或开发者工具自身受支持的本机接口，不冒险改用户当前项目配置。
- 取得“编译完成/成功”证据、精确构建错误数及项目身份；否则明确 NOT_CONFIRMED 或 FAIL，附最后有意义的日志位置。
- 不点击任何游戏选项，不测试真实 CloudBase 操作，不清缓存、不重置存档，不使用“进程启动/启动 compiler/没有错误日志”冒充编译成功。
- 如工具无法稳定保持 IDE 和编译结果，请停止重试，不要求用户执行命令。此项只能后续人工点击 DevTools 编译按钮确认。

## 结果报告（任务只做一次，结束即停止）

WorkBuddy 聊天直接回复精简但完整的 G1–G5 证据表：
- G1 四集合逐一列存在和规则确认度；附安全元数据证据来源，不能有用户数据。
- G2 列旧 pending EVENT 与新事件选项的两组离线结果、重试是否真的 exactly-once、升级刷新能否解决。
- G3 列 old→old、old→new 的旧命令日志**完整 replay**，特别列旧 removed optionId 和 checkpoint mismatch 的结果；不能只写状态 validator PASS。
- G4 报告旧可恢复包哈希、依赖包是否可独立使用、代码回滚和数据库恢复各自准备程度。
- G5 真实编译 PASS/FAIL/NOT_CONFIRMED，不猜测。
- 最终判定：PREFLIGHT_READY_FOR_USER_DEPLOYMENT_DECISION / BLOCKED_ENVIRONMENT / BLOCKED_COMPATIBILITY / BLOCKED_ROLLBACK / INCONCLUSIVE。若任何关键门禁 UNKNOWN，不得选择 READY。
- 明确 **0 云部署、0 DB 写入/导出、0 线上命令、0 游戏源码改动、0 Git commit/push、0 新开发任务**。
- 若任何 G2/G3 指出兼容故障，建议未来最窄产品保护方案供 Controller 设计，不得在本任务中自行施工。
- 对旧 ROLLPREP01 已充分证明的九文件同步、38 个云包文件等仅引用历史证据，不再重复完整扫描、全量套件或上传日志。

本次执行结束后，将文本报告转交 Controller。Controller 验收后决定是否仍 HOLD，或另请用户批准安全隔离方案。**绝不自启第二个任务。**
