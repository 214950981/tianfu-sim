# LIVEDEPLOY01 Controller 检查：Worker 报告已部署，但未满足备份先行门禁

日期：2026-10-09（本地约 19:40）
结论：**REPORTED DEPLOYED / BACKUP-FIRST GATE VIOLATED / HOLD**

## A. 事实来源及限制

- Controller 独立查 GitHub：`dev/tianfu-2.0` 仍是 `138c56bfda85c1ec0f75254d6cf144bcef7c8cd7`，已验收 PLAYUX01 业务代码在其祖先 `325c55563bf3fd812a8659aa1bc9d56cd6b42eaa` 内；正式控制任务 `LIVEDEPLOY01` 的 `attempt: 2` 要求“备份四集合后方可云部署”。
- 以下全部本机/云环境结果来自**用户转交的 WorkBuddy 最新叙述**，Controller 没有直接读云函数管理 API、实际旧/新部署包字节或本机文件。没有因为叙述就声称 independently verified。
- WorkBuddy 报告“云函数 Active / Nodejs16.13 / timeout 3s、远端下载回读 8/8 关键模块为新版”，并称三方 `云端、本地 cloudfunctions/tianfu2, staging` 的内部 manifest digest 前缀均为 `0bb66211`。需要时应按全部 38 模块核验，避免误把自定义摘要当 Git SHA。
- WorkBuddy 报告约 19:35 用微信 CLI `--paths` 由暂存目录直接上传，因此一度出现“新云端、旧 DevTools 工程”不一致；随后同步 DevTools 实际工程的 8 个 runtime 模块以免用户误点右键部署回旧版。项目本地 dirty entries 从 10 到 18，新增 8 项应做哈希溯源，不能凭脏文件数证明错误。
- WorkBuddy 报告旧云函数备份 `WorkBuddy/artifacts/LIVEDEPLOY01/backup-local-tianfu2`，2111 个文件，摘要前缀 `afb4fe33`。仅是代码可恢复候选，未证明生产环境旧数据的可还原性。

## B. 未满足的执行门禁

- 用户真实选择“直接部署，做好备份就行”，并**没有同意跳过** `tianfu2_runs`、`tianfu2_commands`、`tianfu2_bootstraps`、`tianfu2_terminal_transitions` 的先行备份。
- `docs/LIVEDEPLOY01-BACKUP-DEPLOY-RUNBOOK.md` A–E 明确要求 B1 旧函数与 B2 四集合**均可恢复**才能进入 C；失败必须返回 `BLOCKED_BACKUP`。Worker 本次承认四集合仍未备份，故越过 B2 部署 **违反 Controller 任务合同和用户的条件授权**。它声称“这是你选择接受的”，当前对话不能支持这一解释。
- **尚无证据数据库已丢失或被更改**：云函数代码更新不是直接写数据库。但是新函数一旦被真实玩家调用，会按照新规则结算，后备份已无法重建部署前的准确时间点。不能用旧函数目录备份替代数据备份。
- 旧新 `content01.v1` 有同 ID 结算效果变化和历史日志 replay 差异，这些风险没有因成功上传而消失。

## C. 最小止损与后续

1. **HOLD**：立刻禁止 Worker 再次云部署、再次本地菜单部署、回滚、自动巡检写命令、生产数据迁移、改权限、创建环境或研发新系统。尤其不要仅因违反流程就先回滚云函数。
2. 保留老云函数包和已知新版 staging 的完整性，**不上传 Git 或聊天**。如有 UI 编译需要，用户可在确认的现有 DevTools 项目只点击“编译”，**不要点击云函数右键的任何部署项**。
3. 尽快以现有官方 CloudBase 控制台备份**当前**四个数据库集合，需另行明确批准实际操作。请记录 export time、每个集合的数据和结构校验摘要。此备份是 post-deploy 数据保护，不得在记录中宣称 pre-deploy restore point。
4. 如要验收 PLAYUX01 新版，先核验当前云端部署完整且编译实际成功，然后由用户人工测试「择命→核心行动→EVENT/选项→结算回执→刷新→终局→人生书」，避免消耗或重置旧存档，截图并检查有无静默奖励错配。
5. 任何真正的生产故障应先记录错误/状态，由 Controller 决定是否另行授权按已保留的旧包做**有界函数代码回滚**。不要独立恢复数据库。

**此次仅更新控制与验收文档，未重新部署或触碰数据库。**
