# UI04D — 微信云权威后端纵切片（Cloud Authority Backend Vertical Slice）

状态：**已实现（可部署制品，本任务内不做真实部署）** · 分支 `wb-UI04D` · 基线 `22cc6b23`

---

## 1. 这一轮做了什么

UI04C 打通的客户端 RPC 边界背后，第一次有了一个**真正的服务端**：一个权威的 2.0 云函数
`cloudfunctions/tianfu2`，它

* 只信任平台注入的 `cloud.getWXContext().OPENID` 作为身份来源，客户端传来的 `playerId` / `OPENID` /
  `rootSeed` / 规则字段一律忽略（不是清洗，是从不读取）；
* 用真实 CONTENT01 内容注册表 + `generateServerDestinyOffer` + 服务端独占熵生成命格 offer；
* 用 CloudBase 文档数据库事务（`runTransaction` + 确定性 `doc()` id）持久化跑团状态、命令幂等与引导映射，
  并**完整保留**已验收的 `CommandGateway` 语义；
* 支持 `bootstrapId` 引导幂等：同一个身份 + 同一个 `bootstrapId` 永远回到同一个 run，
  超时重试与冷启动都不会多造一条命；
* 其可执行运行时是**机械派生**出来的，不是手写的第二份实现：
  `node tools/ui04d-cloud-runtime-artifact.mjs --write` 从 `server/src` + Core + Content 的
  TypeScript 源码闭包生成 `cloudfunctions/tianfu2/runtime/*.js`。

**没有做**（属于后续任务 / 明令禁止）：真实生产环境部署、默认路由切换、旧 1.0 页面改动、tabBar 改动、
`ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE` 编排、任何玩法/数值/RNG/Director/Cause 语义变更。

---

## 2. 代码结构

| 文件 | 角色 |
| --- | --- |
| `server/src/gateway-store.ts` | 新增的持久化端口：`GatewayStore` / `GatewayTransactionView`，异步事务就绪；`InMemoryGatewayStore` 保留原有同步面 |
| `server/src/identity.ts` | OPENID → 不透明 `playerId`、引导键、确定性 run-id 种子（领域分隔 sha256 摘要） |
| `server/src/live-content.ts` | 真实 CONTENT01 注册表（含 CONTENT01 NPC 包）与锁定的 `rulesVersion` / `contentVersion` |
| `server/src/cloudbase-store.ts` | CloudBase 文档库实现：确定性文档 id、`runTransaction`、事务内无 `where()` |
| `server/src/live-service.ts` | 权威服务，唯一拥有三个 RPC 的地方 |
| `server/src/command-gateway.ts` | 仅改为走端口并 `await` 读取；结算语义零变化 |
| `cloudfunctions/tianfu2/index.js` | 薄宿主：身份、数据库句柄、服务端熵、三个操作的分发 |
| `cloudfunctions/tianfu2/runtime/*.js` | 生成的 CommonJS 运行时（34 个模块 + 门面 `index.js`），带来源路径与 sha256 溯源头 |
| `tools/ui04d-cloud-runtime-artifact.mjs` | 生成器 + 新鲜度校验（`--write` 重新生成） |
| `tools/ui04d-cloud-runtime-audit.mjs` | 依赖 / 闭包 / 内容策略审计（A–H 项） |
| `tools/ui04d-cloud-harness.mjs` | 可执行云函数夹具：假 `wx-server-sdk` / `getWXContext` / CloudBase 数据库，含冷启动重建与 post-commit 超时 |
| `tools/ui04d-cloud-runtime-smoke.mjs` | 15 项加载与全链路冒烟（CLI） |
| `tests/ui04d.test.mjs` | 20 项专测 |

---

## 3. 身份映射

```
cloud.getWXContext().OPENID            // 平台注入，客户端无法伪造
  → assertTrustedOpenid(openid)        // 形状校验，失败即拒绝
  → derivePlayerId(openid) = "p-" + sha256("tianfu2/identity/v1/player/" + openid).slice(0,40)
```

* `playerId` 是**不透明**的：OPENID 本身从不返回客户端、从不写入 RuleState、从不进入命令信封或公共 ViewModel。
* 每次请求都重新派生（无跨请求缓存身份），因此冷启动与并发实例结果一致。
* 客户端在 `createRunOffer` 里传什么都无效：`event.playerId`、`event.openid`、`event.rootSeed`
  只会被忽略——宿主函数 `serviceFor()` 根本不读 `event` 的任何字段。

---

## 4. RPC 契约

三个操作，正是 UI04C 客户端已经说的那三个。

### `createRunOffer`

请求：

```json
{ "operation": "createRunOffer", "bootstrapId": "boot:<client-generated>" }
```

成功：

```json
{ "runId": "run-...", "playerId": "p-...", "rulesVersion": "2.0.0", "contentVersion": "content01.v1", "view": { ...PublicViewModel } }
```

* `view.state.pageState === "DESTINY_OFFER"`；`view.currentInteraction.options[0].optionId` 是
  `START_RUN` 唯一合法的 `selectionId`（客户端不得自行拼装）。
* 响应里没有 `rootSeed`、没有 RNG 状态、没有隐藏 Cause、没有 check spec。UI04C 的 fail-closed 解析器
  会递归拒绝这些服务端键（`FORBIDDEN_RESPONSE_KEYS`），所以契约是**被测试强制**的，不是靠自律。

### `fetchView`

请求 `{ "operation": "fetchView", "runId": "..." }` → 成功 `{ "view": {...} }`。

不属于自己的 run 与不存在的 run 返回**完全相同**的 `UNAUTHORIZED / run.not_owned`，且拒绝报文里
不回显 run id——这个端点无法被用来探测哪些 run 存在。

### `sendCommand`

请求 `{ "operation": "sendCommand", "command": { commandId, runId, playerId, expectedStateVersion, command } }`
→ 成功/失败都是已验收的 `CommandResult` 形状。

* `playerId` 由服务端比对 run 的真正所有者；伪造即 `UNAUTHORIZED`。
* 相同 `commandId` + 相同 payload：幂等重放，返回首次结算结果，状态 / RNG / 时间 / 命令日志**都不前进**。
* 相同 `commandId` + 不同 payload：`INVALID_COMMAND / command.idempotency_conflict`，且不产生任何变更。

### 引导幂等性（`bootstrapId`）

客户端生成并本地持久化一个 `bootstrapId`（`miniprogram/pages/v2-live/v2-live.js` 里的
`tianfu2:bootstrap-id`）。映射 `(playerId, bootstrapId) → runId` 与 run 的创建在**同一个事务**内落盘：

* 网络超时后重试 → 同一个 run，不会多造一条命；
* 页面刷新 / 冷启动 → 同一个 run；
* 换一个 `bootstrapId` → 新的一条命。

v2-live 里的 dev 本地 player id（`tianfu2:dev-player-id`）已删除：身份从此只来自服务端。

---

## 5. 数据模型（CloudBase 文档集合）

| 集合 | 文档 id | 文档内容 |
| --- | --- | --- |
| `tianfu2_runs` | `documentIdFor("run", runId)` = `sha256("tianfu2/run/<runId>")` 前 32 位 hex | `{ state, commandLog, lastSnapshot?, successfulCommandsSinceSnapshot }` |
| `tianfu2_commands` | `documentIdFor("command", commandId)` | `{ commandId, payloadHash, result, runId, playerId }`（幂等记录） |
| `tianfu2_bootstraps` | `documentIdFor("bootstrap", "<playerId>::<bootstrapId>")` | `{ playerId, bootstrapId, runId }` |

三条硬性质：

1. **确定性文档 id**：事务路径只按 id 寻址，从不查询。`cloudbase-store.ts` 里没有 `.where(`，
   源码级断言 + 夹具（事务内 `where()` 抛错）双重保证。CloudBase 事务支持服务端 `doc()` 读写，
   而事务内的 `where` 查询正是不可用、也会破坏原子性的那种写法。
2. **事务内读己所写**：写先暂存，operation resolve 后再 flush（仍在 `runTransaction` 内）。
   operation 抛错则一个字节都不提交，不会留下半结算的 run。
3. **冷启动安全**：请求间不缓存任何状态，每次事务重新读库，所以超时的那一次与新实例看到的是同一份文档。

---

## 6. 部署步骤（人工，本任务未执行）

前置：微信开发者工具 + 已开通用云开发（CloudBase）的小程序环境。

1. **确认生成的运行时是新鲜的**

   ```bash
   node tools/ui04d-cloud-runtime-artifact.mjs        # 过期则 exit 1
   node tools/ui04d-cloud-runtime-artifact.mjs --write # 源码改过之后重新生成
   node tools/ui04d-cloud-runtime-audit.mjs
   node tools/ui04d-cloud-runtime-smoke.mjs
   ```

2. **安装云函数依赖**（只在云函数目录内，`wx-server-sdk` 不得进入根/客户端依赖）

   ```bash
   cd cloudfunctions/tianfu2 && npm install --production && cd ../..
   ```

3. **上传并部署**：微信开发者工具 → 云开发 → 云函数 → 右键 `cloudfunctions/tianfu2`
   → “上传并部署：云端安装依赖”（或命令行 `tcb fn deploy`）。

4. **建集合与索引**：云开发控制台 → 数据库，新建三个集合 `tianfu2_runs`、`tianfu2_commands`、
   `tianfu2_bootstraps`。文档 id 由代码写入（32 位 hex），无需自定义索引；权限建议保持
   “仅管理端可读写”，客户端只经云函数访问。

5. **在小程序端接线**：`miniprogram/pages/v2-live/v2-live.js` 已使用
   `createWeChatCloudTransport` + `bootstrapWeChatRun`；真机/开发者工具里确认
   `wx.cloud.init` 的环境与云函数所在环境一致。

6. **首次手验**：进入 `pages/v2-live/` → 择命 → 开始 → 四个核心动作之一 → 事件选项 →
   刷新一致；杀掉页面重进应回到同一条命（同一 `bootstrapId`）。

---

## 7. 仍需人工完成的云侧配置

* 云开发环境 ID 与小程序 `app.js` / `project.config.json` 里的环境绑定（本任务不改默认路由，不接线默认页）。
* 数据库集合的创建与安全规则（建议仅管理端可读写）。
* 云函数超时与内存配置、并发与冷启动观察。
* 真实 OPENID 下的多用户验收（夹具证明的是同一套代码路径，但真机联调未在本次范围内）。
* 生产开关：本轮产物可部署，但默认路由、tabBar 与 1.0 页面均保持原样。

---

## 8. 验证

`verificationProfile: fast-lane`：只跑 UI04D 专测、直接受影响的 server-gateway / destiny-offer /
ui04c / ui04b 套件，以及具名的云运行时审计、context-loader、typecheck、lint、secret-scan、
content01-lint。不跑聚合 `npm test`、不跑 600 局模拟、不重证已知沙箱基线问题。

```bash
node --test tests/ui04d.test.mjs
node --test tests/server-gateway.test.mjs tests/destiny-offer.test.mjs tests/ui04c.test.mjs tests/ui04b.test.mjs
node tools/ui04d-cloud-runtime-artifact.mjs
node tools/ui04d-cloud-runtime-audit.mjs
node tools/ui04d-cloud-runtime-smoke.mjs
node .codex/context.mjs UI04D
npx --yes --package typescript@5.9.3 tsc --noEmit
node tools/check-import-boundaries.mjs
node tools/scan-secrets.mjs
node tools/content01-lint.mjs
```
