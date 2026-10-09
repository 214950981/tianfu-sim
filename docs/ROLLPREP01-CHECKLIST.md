# ROLLPREP01 — Tianfu 2.0 本地同步与云端部署前安全核查

制定者：Controller（2026-10-09）
源分支：dev/tianfu-2.0
验收源提交：87d257c35ae89cf6c9ef89d0ac124837cb8b3c42
任务类型：**LOCAL_ENVIRONMENT_AND_CLOUD_ROLLOUT_PREFLIGHT_ONLY**
目标：在**不部署、不修改云数据、不执行游戏写操作**的前提下，让 WorkBuddy 全权完成本地同步和版本/存档/回滚核查，输出可供 Controller 下一次审查的可验证报告。

## 0. 权限、安全、停止条件

- 本任务是用户已批准的部署前检查，**不是用户批准部署**。禁止执行部署、重传云函数、切换云端运行环境/Node 版本、创建/删除集合、改数据库规则、清空/重置数据、触发命令结算、重建真实存档或上传/预览小程序。
- 不调用 live createRunOffer、sendCommand、advanceTerminal、next-life；不使用现有生产身份做真实游戏选择。对 fetchView 等读取接口，若无法严格证明无副作用且必要，不调用，改用代码分析/CloudBase 控制台元数据。
- 允许只读查看 CloudBase 配置/云函数元数据/集合存在性及 schema 摘要（必须确认目标环境正确）；不抓取或打印原始 OPENID、playerId、runId、bootstrapId、rootSeed、用户存档正文、命令日志、凭证、云密钥或私密数据库记录。
- 如果必须访问客户实际存档才能证明兼容性，只可在授权范围内使用现有无敏感信息的本地夹具、受控脱敏元数据/结构摘要；缺访问权限则标注 NOT_VERIFIED，不能声称 READY。
- 不修改 GitHub 任何仓库分支、main、云端代码、原有 1.0 项目、游戏逻辑或服务器源码；不创建编码任务；不自动安排下一步。临时本地报告/备份只能存入任务专用目录，不纳入产品代码。
- 本机当前 DevTools 工作目录不一定是主 clone。任何全树 pull/checkout、reset --hard、git clean、强制覆盖脏文件、重复网络重试均禁止；先定位真正打开的项目，并保留未提交改动。

## 1. Git 基线和本机项目定位

1. 一次性从远端读取 dev/tianfu-2.0 最新 HEAD，应以本任务源提交 87d257c 为最低已验收基线；若 source 更新，只读比较并在可能涉及本任务代码时 STOP 交由 Controller 决定。
2. 在 Windows 使用 WorkBuddy 现有可用终端和开发者工具 CLI。自动识别 DevTools **实际正在打开**的 projectId/打开项目日志、项目目录、project.config.json 的 miniprogramRoot/cloudfunctionRoot/appid。不能仅按 main clone 或路径名猜测。已知历史候选路径见 .codex/control/TOOLING_RUNBOOK.md，仅供查证，不可硬编码。
3. 读取本地 HEAD、工作区变更与受控文件字节摘要，形成简短表格：实际 DevTools 项目、主 clone（若存在）、受控客户端文件、云部署候选路径、是否有冲突。保留原文件与其他脏文件。
4. 明确本次以 **已合并且经 Controller 验收的 dev HEAD** 为源。若同步遇到冲突，先保存原始目标字节并停止对该文件的覆盖；不要通过切换 DevTools 项目或新建一个看似正确的目录掩盖冲突。

## 2. 仅同步本地客户端和部署候选素材

只同步/校验以下已验收的客户端**精确路径**，在确认没有会被覆盖的未提交修改时执行，保持文件名、内容及 require 静态闭包：
- miniprogram/pages/v2-live/v2-live.js
- miniprogram/pages/v2-live/v2-live.wxml
- miniprogram/pages/v2-live/v2-live.wxss
- miniprogram/pages/v2-live/content01-zh-cn.js
- miniprogram/runtime/wechat-shell.js
- 为保证静态闭包，若检查发现本次变化依赖其他已验收 miniprogram/runtime/*.js，允许以可验证 manifest **补齐已实际被 require 的文件**，但必须报告精确清单和原/新 SHA；严禁复制整个项目或动 1.0。

部署候选包（本地 **staging/验证**，绝不 upload）：
- cloudfunctions/tianfu2/index.js、package.json、runtime/ 内所有权威已提交生成模块（按 Git tree manifest 完整核对）。
- 对照 tools/ui04d-cloud-runtime-artifact.mjs、tools/ui04d-cloud-runtime-audit.mjs、tools/ui04d-cloud-runtime-smoke.mjs 的已验收产物。仅执行只读 freshness/closure 检查；不得 --write 修改源码仓库。
- 显式核对部署包来自同一被接受的 source HEAD，而不是一个旧 WorkBuddy worktree、主 clone 过期文件、未提交调试构建或旧云函数缓存。
- Git fetch 如遇 SSL/proxy 故障只尝试一次，改用 GitHub API 逐文件下载并通过真实 blob/hash 验证；禁止无限 push/fetch/drain；绝不让用户自己找目录或粘贴文件。

条件允许时由 WorkBuddy 在**正确的** DevTools 项目中编译一次客户端，收集真实编译摘要和错误数；不得点击 gameplay 按钮。若无法操作 DevTools UI，只报告准备完毕与用户后续唯一需要执行的编译步骤。禁止把本地编译成功等同云函数兼容或真机视觉验收。

## 3. 云环境及已部署版本：只读识别

**仅用当前可用的只读能力**核对：
- 小程序 appid 与 DevTools 实际项目是否一致；app.js 使用的 CloudBase env 配置与真实云函数 tianfu2 所在环境是否一致；不要在 Git/公开报告里贴出真实云环境 ID、AppID 私密配置或身份类字段，只记「一致 / 冲突 / 未确认」。
- tianfu2 的函数存在性、云端 Node 运行时版本、状态、更新时间、云函数部署方法（微信 DevTools “上传并部署：云端安装依赖” 与实际可用 SDK/CLI）。历史曾因 Node.js 20/16 选错而无法部署；以当前平台实值而非历史记忆决定是否兼容。
- 对照本地 cloudfunctions/tianfu2/package.json 的 wx-server-sdk ~3.0.4、index.js 的 Node 16 structuredClone 兼容补丁、项目 src/派生包闭包，以及 云函数的实际 Node runtime。
- 如果平台**不能合法读取当前云函数部署包/精确 SHA**，只能记录实际部署时间和 metadata；明确写 DEPLOYED_CODE_HASH_UNAVAILABLE，不得根据“函数存在”臆测当前云端已是哪个代码版本。
- 按 server/src/cloudbase-store.ts 核实四个 CloudBase 集合 tianfu2_runs / tianfu2_commands / tianfu2_bootstraps / tianfu2_terminal_transitions 的存在状态、权限设置与读取限制（metadata only），绝不创建集合或修改安全规则。
- 不尝试 fetchView 探测猜测的 runId；不做可以创建/修改记录的“健康检查”。无只读入口时认定证据缺失，而不是用写接口替代。

## 4. 存档兼容性审查与安全结论

此轮 PLAYUX01 新服务器包含 Core/Content/Server 和云端 runtime 的变化。必须从代码及受控脱敏/本地旧结构夹具角度检查**旧存档继续读与回退**，不能只比较版本字符串：
- 与现有 StoredRun 格式、schemaVersion、rulesVersion、contentVersion、CommandEnvelope 版本校验、旧 eventId / choiceId、ContentRegistry 查找、Build/CAUSE/NPC 状态、deathRecord 与 terminal sidecar 各自的可选兼容性。
- 重点检查旧 run.events.history 可能**没有 choiceId**；旧 StoredRun 可能没有 terminal；较新 receipt 可能有 domainEffects/narrative；老命令重试/回放与 expectedStateVersion 幂等匹配；临终阶段及轮回继续操作跨版本行为。
- 确认旧版云函数部署包能否**读取新版部署后写入的状态**；若不能，仅回滚函数可能无法解决问题。至少形成 old-code→old-data、new-code→old-data、old-code→new-data、new-code→new-data 的兼容性矩阵，并标注证据来源或「未验证」。
- 不运行 600-run、全量 regression、真实在线命令，也不改数据库。可最多运行一次仅针对旧存档兼容、包新鲜度、RPC 类型与依赖闭包的离线定向测试；缺夹具时写出必须在部署审批前补的验证，而不是自动造一条正式玩家数据。
- 检查同一个设备正在使用的 bootstrapId 和未完成 RUN_HOME / EVENT / ENDING / LIFE_BOOK / REBIRTH_RESULT / NEXT_LIFE 存档风险，重启页面/升级后不应伪造新人生或越过结算。尤其审视「前端新、云端旧」混合窗口对 receipt/显示/重试的影响，必要时建议等待云端部署与客户端同步的先后顺序。

## 5. 可真实执行的备份、回滚及发布顺序方案

给出可执行、无需用户自己找路径的 **Plan A / Plan B**：
- **发布前**必须能恢复当前云函数的原版本：确认平台历史版本/发布记录或可导出的原部署包；记录只读版本标识和校验摘要。若拿不到可恢复的前一版本，定为 BLOCKED_ROLLBACK，而非建议直接覆盖。
- 云数据库：列明需要备份的四个集合及关联字段，建议平台快照/导出格式、存储位置、权限控制、恢复演练计划与容量估计。**本次只制定并核实是否可执行，不实际导出、读取全量敏感记录、删改库或执行恢复。**
- Plan A：保留旧函数及数据，后续获用户单独批准再做有界升级。明确部署时的环境 ID 校验、Node 版本与依赖、上传方法、刷新客户端和 smoke 次序、功能验证阈值和故障暂停条件。
- Plan B：出现问题如何回滚**函数版本**和**前端本地文件**，是否会造成存档读取不兼容。区分 “仅函数代码回滚就可恢复” 与 “需要数据库恢复/数据迁移” 两种情况，后一种必须另行审批，绝不能在预检查时操作。
- 若云环境元数据不足、部署包不可恢复、旧存档新版本不兼容且无安全方案、权限不足或真实 DevTools 项目仍未确认，则标记 NOT_READY/BLOCKED，不能建议发布。

## 6. 交付报告格式（WorkBuddy 结束即停止）

只需要一份**简短但能复查**的本地报告，在 WorkBuddy 聊天消息中提供，敏感内容脱敏。必要时将详细表格保存到现有机器上独立的任务工作目录供后续核对，**不写 Git、不开 PR、不上传日志/数据到外部网站**。

报告必有：
1. 真实 DevTools 项目路径（仅本机操作人员使用）、本地同步情况及所有受控文件原/新 hash。
2. 新客户端 compile PASS/FAIL/NOT_RUN；云函数 staging 包模块完整性与来源 SHA。
3. 云函数部署环境一致性、Node 版本、已部署代码可辨识度，以及四个集合存在与只读权限状态（不得公布客户身份/存档内容）。
4. old/new 代码和 old/new 数据兼容矩阵，各项具体证据/疑点；是否存在不可逆写法。
5. **备份与回滚方案是否真的可执行**，缺少哪项权限/可恢复包/平台功能。
6. 结论只能选 DEPLOYMENT_PREFLIGHT_READY / BLOCKED_ROLLBACK / BLOCKED_COMPATIBILITY / BLOCKED_ENVIRONMENT / INCONCLUSIVE。
7. 清晰写明**未上传云函数、未修改 DB、未部署小程序、未执行状态变更 RPC、未提交 Git**。如有不可控限制说明即可，不让用户自己手动跑命令。
8. 仅建议下一步，不启动它。完成后由 Controller 审核决定是否请求用户批准真正部署。

## 验收门禁

- VERIFIED_LOCAL: 真正 DevTools 使用的项目同步正确，且 dirty 文件不被破坏；精确哈希和可复核的闭包。
- VERIFIED_CLOUD_PACKAGE: 预备部署内容源自同一已验收 Git HEAD，派生运行时匹配 Node/依赖/闭包。
- VERIFIED_ENVIRONMENT: 真实 App/CloudBase 环境、运行时、集合元数据经只读核对。
- VERIFIED_COMPATIBILITY: 至少可复核的四格旧新兼容矩阵，旧存档/失败重试/终局的风险已披露；不能靠「测试曾通过」省略。
- VERIFIED_ROLLBACK: 旧函数可恢复路径和数据库备份/回滚前置条件明确，缺失就 BLOCKED。
- STRICT_NO_DEPLOY: 云端函数、代码、存档、配置和数据库权限 **0 次改动**，无新开发任务、无 main 或 dev 代码施工。
