# LIVEDEPLOY01 — 备份后直接覆盖现有 Tianfu 2.0 云函数

Controller 派发日期：2026-10-09
实际执行方：WorkBuddy（本机微信开发者工具及 CloudBase 已授权帐号）
仓库：214950981/tianfu-sim
源分支：dev/tianfu-2.0
基线代码：PLAYUX01 accepted HEAD 325c55563bf3fd812a8659aa1bc9d56cd6b42eaa
本任务是 GitHub 控制面上的 READY；最终执行以派发后 HEAD 中的 NEXT_TASK 为准。

## 0. 用户明确选择与已知风险

用户明确否决新建第二套系统和测试环境，明确选择 **直接覆盖已有 tianfu2** 并要求**先备份**。因此之前 ROLLPREP01-R1 的禁止覆盖决定在本任务获单次人工授权豁免；已有技术证据并没有变成 PASS。

已知风险必须保留：
- 当前云端据 WorkBuddy 先前报告是 1ed4bdc 对应的旧版本，而新客户端和新 Git 已含 PLAYUX01。
- 旧、新 Content 都声明 content01.v1，但 checksum、部分 choiceId、同 optionId 的奖励和 Director 行为已发生变化。旧 EVENT 若保留旧按钮，可能 INVALID_OPTION；同 id 甚至可能结算成新奖励。
- 完整旧 CommandLog 使用新规则回放可能失败，虽生产 fetchView/sendCommand 主要直接读取已存储状态并增量结算，但不能当作历史回放完全兼容。
- 本次**不修复**这些兼容风险，也不创建版本系统、隔离环境、迁移代码或新玩法。用户明确承担经告知的剩余旧会话语义变化风险，但并未授权丢失、清空或破坏玩家存档。
- 如果完整备份与可恢复的旧函数无法确认，**停止部署并报告 BLOCKED_BACKUP**，不能因为用户催进度就裸部署。

## 1. 只执行一次的五步工作流

### A. 确认目标与本地代码：快速、只读

1. 从 GitHub 确认 source 分支在派发 HEAD 之后没有产品代码变化；对照已合并 PLAYUX01 的 accepted blob/tree。若产生新的未验收产品代码变动，则 STOP SOURCE_DRIFT，不盲目部署。
2. 自动识别实际 DevTools project，禁止拿落后的 main clone 代替；保留 WorkBuddy 已同步的 5 个客户端文件与所有脏文件。只做最小本地 SHA 校验，无需重新全树同步/下载。
3. 用云开发 CLI/DevTools 检查当前登录小程序、CloudBase env 和 tianfu2 对应关系，与已验证的 app.js 云环境一致。仅允许当前已有环境；不创建新环境，不改 AppID、Node runtime、费用套餐、超时、权限或项目配置。无法核实便 BLOCKED_ENVIRONMENT。
4. 确认当前函数 Active、Nodejs16.13（以此时元数据为准）、timeout 和最近更新时间，准备原始 old-source 恢复入口；绝不误部署到别的函数/环境。

### B. 备份，所有通过后才能进入 C

**B1 旧函数可恢复包**：
- 复用此前 WorkBuddy 下载的云端完整部署包，优先从平台再次校验当前云端版本是否仍匹配（旧 1ed4bdc / 38 个源码和 runtime 文件 + node_modules 包），如果云端自上次以来变化则重新保存**当前实际部署包**。
- 对旧函数备份提供本地绝对存放位置、包完整性/散列值、模块及依赖可加载证据和不修改现有函数的恢复 CLI 方法。
- 不向聊天或 Git 上传备份、凭据、私有数据。

**B2 数据库备份**：
- 仅备份现有 CloudBase 环境的 4 个集合：tianfu2_runs、tianfu2_commands、tianfu2_bootstraps、tianfu2_terminal_transitions。
- 先核实逐个集合确实存在与其规则；不存在时记录独立 metadata 证据并确认不会使新部署的启动/结算缺必需集合。不得为“补齐备份”去创建数据库对象或修改权限。
- 首选微信云开发平台的合规集合备份/快照或受支持的只读导出（允许按用户这次授权实际执行备份导出）；若没有可用导出 UI/权限，可用已经授权的只读 Admin SDK 导出路径，但不得使用公开前端、绕过权限或扩散身份字段。所有存档及命令日志只保存在本机受限的安全路径，尽可能加密，密钥独立保存；**禁止发到聊天、Git、第三方存储或日志**。
- 记录每个集合备份时间、大小、格式、文档数量（若平台可提供）、文件 SHA256、导出完成的确认结果和权限/恢复入口。仅通过允许的安全元数据确认备份已包含实际文件；不在聊天展开玩家行内容、不要求用户手动导出。
- 不因备份操作改变任何在线数据库记录/权限。备份工具如需付费/开通不可逆权限或新增收费服务，停止并询问用户，不能默认同意费用。
- 注意备份与部署之间并发写入造成的差异：尽可能选择空闲时段并记录时间戳/备份水位。不能无证据声称跨四集合原子快照；若无法获得可用于恢复的一致性备份，标记 BLOCKED_BACKUP，停止。
- **部署绝对门禁**：既有集合的实际备份全部确认完成且可读、旧函数恢复包有效、目标环境身份完全一致，才允许推进。不允许只有“制定备份方案/未来可以备份”就部署；不能把 4 格旧新 schema 校验当成备份。

### C. 唯一一次受控云函数覆盖

1. 仅从已验收 dev Git 对应的 cloudfunctions/tianfu2/index.js、package.json、runtime/* 组成部署候选；严格源文件哈希与 staging 内容一致。
2. 复用上一轮已证实的本机离线 staging 依赖包（wx-server-sdk ~3.0.4 / Node16 可用），不要重复 remote npm install 的 lockfileVersion 3 问题。部署目录需带完整可加载的 node_modules；本地临时 staging，**不覆盖源码工作树**。先快速 require/index / close check，明确 dependency closure 和包字节 SHA。
3. 在仅确定的现有 CloudBase 环境，覆盖**唯一函数 tianfu2**。不修改云端数据库、权限、别的云函数或任何原版 1.0 页面。只操作用户已明确允许的函数代码部署。
4. 使用已验证的微信开发者工具 CLI 上传部署方式；根据实际 CLI 版本选正确 flags，不无界重试，也不要运行未经审核的本机未跟踪部署脚本。若请求超时、502 或结果不确定，**先读云端函数状态和下载后的实际代码**，确认是否部署完成，绝不连续盲传。
5. 若 SDK 或平台提示必须改 Node 版本/增加付费服务/修改数据库才能上传，则停止并报告，不擅自扩大授权。

### D. 验证与故障回退

1. 读取部署后的云函数元数据，要求 Active / 环境、Node/runtime 无漂移；优先下载已部署包并比对 38 个已验收源码+运行时模块 SHA，不得仅凭 CLI 的 upload success、时间戳或存在性冒称新版本部署成功。报告已部署内容的证据等级。
2. 本地 DevTools 在正确 project 只尝试一次有界编译并保留明确 PASS/FAIL/NOT_CONFIRMED，不能把 compiler started 当 PASS。没有实际完成信号可交给用户后续手动点编译，不无限重试。
3. 只做零状态写入的云函数元数据/可证明只读健康核对。不要用用户已有 runId/身份发写请求，不使用 live createRunOffer/sendCommand/advanceTerminal 等结算或复活接口。不修改玩家游戏状态。
4. 若确定上传失败、云函数无法 Active、部署后实际 runtime 不一致或明显致命错误，并且旧函数恢复包有效，则允许**立即回滚唯一函数 tianfu2 的代码到已备份版本**，随后再次核实旧包与状态；不恢复数据库，也不清理/重置线上玩家数据。
5. 若部署结果不确定、回滚也不确定，停止并报告 BLOCKED_UNKNOWN_CLOUD_STATE，不在不确定状态连环重传。
6. 部署后即使所有检查通过，仍声明旧 EVENT 语义、旧历史 replay 等已知风险存在；不宣称整个产品全部实机 PASS。游戏完整试玩留给用户明确观察。

### E. 结果报告和停止

一份 WorkBuddy 聊天报告，必须包含：
- 备份是否实际完成：四集合各自的匿名化文件清单/时间/大小/数量/完整性状态，以及旧云函数可恢复包是否可用。**不包含任何数据原文和密钥**。
- 准确的部署环境一致性结论（不公开身份类配置）、tianfu2 上传/未上传/回滚状态、Node/timeout、已部署代码哈希验证，失败代码和限定重试次数。
- DevTools 编译 PASS/FAIL/NOT_CONFIRMED；0/有限只读冒烟。
- 云数据库数据写操作数=0（指 WorkBuddy 的直接写入；备份与函数部署后其他玩家并发行为不由此保证）、Git 提交/推送=0、其他云资源创建=0、旧玩家存档未主动变更。
- 最终严格选一个：DEPLOYED_VERIFIED / DEPLOYED_VERIFICATION_INCOMPLETE / ROLLED_BACK_VERIFIED / BLOCKED_BACKUP / BLOCKED_ENVIRONMENT / BLOCKED_UPLOAD / BLOCKED_UNKNOWN_CLOUD_STATE。
- 只记录原版与新版兼容风险，不转而开发内容版本系统。向 Controller 回报后立即停止。

## 2. 不得暗中扩大本次授权

- 不能调用任何付费套餐升级、购买或新建 CloudBase 测试环境；不能部署第二个系统。
- 不能修改游戏玩法/版本规则、数据库 schema、既有存档或日志、main/dev、GitHub 任务以外的业务代码。
- 不能做 600-run、全量 npm test、无界重试、清理 Worktree、清缓存、重装整个 IDE。
- 不能把备份数据上传 GitHub、社交聊天或不受控云盘。
- 如果 B 的备份证据不满足就 STOP。**先备份是用户本次部署授权的不可省略条件。**


## LIVEDEPLOY01 attempt 2 — 官方数据库控制台备份（Controller 补充）

首轮 WorkBuddy 结论为 BLOCKED_BACKUP。旧云函数 B1 已重新校验 38/38，因此本次不要再重复 B1、Node16 staging、历史 G1–G5、CLI database/credentials 扫描。本补充只改变 B2 的访问路径，不放宽「先备份、再覆盖」门禁。

**官方来源**：https://docs.cloudbase.net/database/manage 和 https://cloud.tencent.com/document/product/876/19371 。文档型数据库的「集合管理」支持逐集合「导出」，格式选 JSON，全部字段不填写字段过滤即可。若账号有可恢复的同时间点快照，可优先核实；禁止为备份执行回档。

**执行方式**：
1. WorkBuddy 使用现有的微信开发者工具云开发控制台或腾讯云 CloudBase 官方网页，从已登录的本机账号进入先前确定的原环境。检查环境与现有 tianfu2 一致。不能登录其他环境或新建项目。
2. 在集合管理中逐个找 tianfu2_runs、tianfu2_commands、tianfu2_bootstraps、tianfu2_terminal_transitions；查看集合存在性/权限元数据。对每个既有集合执行全字段 JSON 导出；不得点导入、创建、删除、修改权限、数据库回档或真实玩家操作。
3. 下载到本机受限目录（不得放 Git 工作树或公开同步盘）。验证每个导出文件的 SHA256、大小、完成状态、JSON 或 JSONL 可解析、是否包含全部字段以及导出条数。只输出摘要，不打印或上传敏感记录。若官方导出有文件大小限制，使用平台合法分批操作直至完整，不能只存一部分。
4. 优先使用同一个可恢复时间点。若四个独立导出，不得擅称原子备份；核实空闲时间窗口和可用的写入/文档量元数据，记录导出起止及残留的跨集合一致性风险。无法证实备份可供可靠恢复就停在 BLOCKED_BACKUP。
5. 已有 GUI 自动化能力时让 WorkBuddy 自己点击。若需要真人扫码登录/授权或不具备 GUI 操作能力，不再反复试 CLI/SDK/下载新的工具，明确告诉用户唯一需要执行的官方控制台步骤；用户完成必要交互后再由 WorkBuddy 验证。禁止索取或回显 SecretKey、云密钥、备份文件或玩家明细。
6. B2 真正完成、原函数备份可恢复且目标身份一致后，直接接续本任务原 C–E：仅覆盖现有 tianfu2，云端回读核对、必要时只回滚云函数。未备份完就不上传。不新建第二套系统，不改任何游戏产品代码，不执行数据恢复或付费扩容。

本补充并未证明当前账号实际可以使用导出按钮。若需要付费、新权限或数据修改，请停止并请示用户。
