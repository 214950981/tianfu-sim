# UI04C — WeChat 实时客户端纵切片（Live Client Vertical Slice）

状态：**已实现（dev-only，未接线默认路由）** · 分支 `wb-UI04C` · 基线 `9c1d575`

---

## 1. 这一轮做了什么

把 UI04A/UI04B 已经验收的客户端运行时第一次接到**真实的 RPC 边界**上：新增一个注入式
`callFunction` 云调用传输适配器，定义 `createRunOffer` 引导，打通 `DESTINY_OFFER → START_RUN`，
并新建一个 dev-only 页面 `miniprogram/pages/v2-live/`，一次跑完

```
bootstrap / createRunOffer
  → DESTINY_OFFER（择命）
  → 选择命格 → START_RUN
  → RUN_HOME（四个核心动作 + 服务器投影的破境）
  → EVENT / SPECIAL_NODE → option
  → authoritative refresh
```

外加：生平录开关、loading / submitting、可重试失败、STATE_CONFLICT 后刷新并**明确要求用户重新确认**、
reconfirm 使用全新 commandId、以及 bounded 的 fatal / bootstrap 错误态。

**没有做**（属于 UI04D 及后续服务端任务）：2.0 云函数后端、云数据库持久化、生产部署、默认路由切换、
旧 1.0 页面改动、tabBar 改动、`ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE`。

---

## 2. RPC 契约（客户端 ↔ 服务端）

云函数名：`tianfu2`（`DEFAULT_CLOUD_FUNCTION_NAME`）。请求体只有一个 `operation` 字段：

| operation | 请求 | 成功响应（`result`） |
| --- | --- | --- |
| `createRunOffer` | `{ operation }` | `{ runId, rulesVersion, contentVersion, view: PublicViewModel }` |
| `fetchView` | `{ operation, runId }` | `{ view: PublicViewModel }` |
| `sendCommand` | `{ operation, command: CommandEnvelope }` | `CommandResult` |

传输层由 `createWeChatCloudTransport({ api, cloudFunctionName })` 构造，`api` 就是注入的
`{ callFunction }`。neutral 源码（`packages/wechat-shell`）**从不引用 `wx` 全局**：它只调用被
注入进来的函数，与 `createWeChatPlatformStorage` 绑定注入式存储的写法完全一致。

### 失败即闭合（fail closed）

任何未被文档化的响应都以 `TransportProtocolError` 抛出，**不会**被当作已结算命令交给控制器：

* 没有 `result` 包装、响应不是对象、缺字段、`pageState` / `runStatus` / `interactionState` 不在
  契约枚举内 —— 全部拒绝；
* `createRunOffer` 的 `runId` / `rulesVersion` / `contentVersion` 必须与返回的 ViewModel 一致；
* `sendCommand` 的 `error.code` 必须是 `APP_ERROR_CODES` 之一；
* 响应里出现任何服务端私有键（`rootSeed`、`rngState`、`drawIndex`、`echoBudget`、`salience`、
  `selectorWeights`、`futureEventIds`、`checkSpec`、`difficulty`、`effectSpec`、`internalTrace`、
  `antiCheat`、`hiddenCause(s)`、`specialNotes`、`serverSecret`）**整包拒绝**，不做部分信任；
  扫描是递归的，深度上限 64 层。

---

## 3. createRunOffer 引导（bootstrap）

`bootstrapWeChatRun({ transport, playerId, clientBuild })` 返回：

```js
{ session: { playerId, runId, rulesVersion, contentVersion, clientBuild }, view: PublicViewModel }
```

* `runId` / `rulesVersion` / `contentVersion` / 初始 `PublicViewModel` **全部来自服务端权威响应**；
* `playerId` 与 `clientBuild` 是客户端事实，由调用方注入，**不从服务端读取**；
* 禁止返回、也不允许出现在包里的：rootSeed、RNG 状态、隐藏 Cause、check spec、难度、内部 trace。

页面里 `playerId` 只是 dev 用的本地标识（`tianfu2:dev-player-id`），真实登录由后续任务替换。

---

## 4. DESTINY_OFFER → START_RUN

服务端已经把权威 offer 作为 `currentInteraction`（`interactionId` 即该局的 `offerId`）发布，
每个被 offer 的 candidate 对应一个 option。客户端因此**只能**从这份公开投影派生 START_RUN：

| offer 类型 | 公开 candidate 的键 | 提交的 START_RUN |
| --- | --- | --- |
| PROG01 innate | `selectionId` | `{ type: "START_RUN", offerId, selectionId }` |
| legacy | `id`（= destinyId） | `{ type: "START_RUN", offerId, destinyId }` |

规则（`offerCandidateFor`）：

* 选中的 optionId 必须是服务端 offer 出来的；
* 拥有该 optionId 的 candidate 必须**恰好一个**（0 个 = 服务端没发布，>1 = 有歧义），两者都 fail closed；
* 同时发布 `selectionId` 和 `id` 的 candidate 被拒绝，而不是靠客户端猜；
* candidate 从不由客户端生成。

START_RUN 依然走 `CommandSubmissionController` 的 commandId / pending / retry / conflict 语义，
没有任何绕过。

---

## 5. 页面：`miniprogram/pages/v2-live/`

* 文件：`v2-live.js` / `v2-live.wxml` / `v2-live.wxss` / `v2-live.json`；
* 注册在 `miniprogram/app.json` **最后**；`pages/start/start` 仍是第一个，tabBar 一字未动；
* 用静态字面量 `require("../../runtime/index.js")` 加载生成的运行时，不 import
  `miniprogramRoot` 之外的 TypeScript 源码；
* 视觉语言与文案复用 UI02（同一套墨色底 / 金描边 / 圆角卡片，`CONTENT_COPY` 与 UI02 copy pass 同源）；
  `v2-preview` 保持 fixture 驱动，未被改成 live 页面。

### 页面状态机

所有页面状态来自 `PublicViewModel.state.pageState`。页面**不计算**：outcome、risk、eligibility、
破境概率、RNG、RuleState、Director、Cause resolution。风险条（`riskPresentation`）、破境可用性、
动作可用性、生平录内容，都是服务器投影值的**格式化**，不是推导。

页面自己只报告**传输层状态**（这是客户端自己的事，读自 `controller.submission()`）：

| 状态 | 表现 | 出口 |
| --- | --- | --- |
| loading | 正在连接服务器 | — |
| submitting (`locked`) | 处理中… | — |
| `retryableError` | 连接中断，命令尚未结算 | **重试**（重发同一 envelope，同一 commandId） |
| `fatalError` | 服务器拒绝了这条命令 | 重新连接 |
| `requiresReconfirmation` | 服务器状态已更新（第 N 版） | **重新确认**（全新 commandId + 最新 stateVersion） |
| bootstrap error | 无法进入此世 + 阶段/代码/有限详情 | 重新连接 |

详情做了路径脱敏、换行归一与 160 字截断，绝不渲染原始状态或凭据。

---

## 6. 验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| UI04C 专用套件（含注入式 fake `callFunction` 全链路 + 真实页面 harness） | `npm run test:ui04c` | PASS |
| UI04B 套件 | `npm run test:ui04b` | PASS |
| UI03 套件 | `npm run test:ui03` | PASS |
| UI04A 客户端运行时边界 | `npm run ui04a:audit` | PASS |
| UI04B 产物新鲜度 | `npm run ui04b:artifact` | PASS |
| UI04B 产物审计 | `npm run ui04b:audit` | PASS |
| UI04B smoke | `npm run ui04b:smoke` | PASS |
| typecheck | `npm run typecheck` | PASS |
| lint（import 边界） | `npm run lint` | PASS |
| secret scan | `npm run scan:secrets` | PASS |
| route guard（新增） | `npm run ui04c:route` | PASS |

`tests/ui04c.test.mjs` 里 `fakeCloud()` 是**唯一**的假东西：它只是把
`{ name, data }` 转发给真实的 `CommandGateway` + `ServerViewModelBuilder` + reducer。
因此客户端看到的每一个 ViewModel 都是权威的；而 `loadLivePage()` 用 stub 的 `Page` / `wx`
加载**真实的** `v2-live.js`，所以被测的就是小程序真正会跑的那份代码。

**未做人工验证**：真机 / DevTools 视觉与云环境联调本轮不做（无 2.0 云后端），
由 UI04D 接线真实云函数后再做人工 QA。

---

## 7. 下一棒（UI04D / 服务端任务）仍然缺什么

`tests/ui04c.test.mjs` 里的 `fakeCloud` 就是缺失后端的**精确规格**。需要实现：

1. **云函数 `tianfu2`**，三个 operation：`createRunOffer` / `fetchView` / `sendCommand`，
   请求与响应严格如上表。
2. **`createRunOffer` 真身**：创建 offered run（含 `generateServerDestinyOffer` 的 innate 路径）、
   持久化、返回 `{ runId, rulesVersion, contentVersion, view }`。响应必须**不含** rootSeed 等私有键，
   否则客户端会 fail closed。
3. **鉴权**：`sendCommand` / `fetchView` 必须校验 `playerId` 与 run 归属（当前 `GatewayApplicationTransport`
   已经假定可信 auth，云函数要自己做）。
4. **`GatewayApplicationTransport.createRunOffer()` 目前直接 reject**，需要接上真实实现。
5. **持久化**：`InMemoryGatewayStore` 换成云数据库（commandLog + snapshot + idempotency 表）。
6. **终局链路** `ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE`：客户端只呈现服务器给出的公开状态。
7. **真实 playerId**：替换页面里的 dev 本地标识。

---

## 8. 本轮改动的文件

| 文件 | 改动 |
| --- | --- |
| `packages/wechat-shell/src/index.ts` | 云传输适配器、严格响应校验、`bootstrapWeChatRun`、DESTINY_OFFER → START_RUN 派生、`WeChatDecisionView.body` 透传 |
| `miniprogram/app.json` | 末尾注册 `pages/v2-live/v2-live`（`pages/start/start` 仍在首位，tabBar 未动） |
| `miniprogram/pages/v2-live/*` | 新增 dev-only live 页面（js / wxml / wxss / json） |
| `miniprogram/runtime/*` | 源变更后重新生成（`ui04b:artifact:write`） |
| `tools/ui04b-wechat-runtime-artifact.mjs` | facade 允许表 +3（`createWeChatCloudTransport` / `bootstrapWeChatRun` / `TransportProtocolError`） |
| `tools/ui04b-wechat-runtime-smoke.mjs` | 同步 surface 期望 |
| `tools/route-guard.mjs` | 新增路由守卫 |
| `tests/ui04c.test.mjs` | 新增专用套件 |
| `tests/ui04b.test.mjs` / `tests/ui03.test.mjs` | 受 UI04C 影响的 pin 按最小改动更新（见下） |
| `docs/UI04C_LIVE_CLIENT.md` | 本文档 |
| `package.json` | 新增 `test:ui04c` / `ui04c:route`，聚合 test 纳入 UI04C |

### 对既有 pin 的最小改动（都是 UI04C 明确授权的后果）

* `tests/ui04b.test.mjs`：`v2-live` 现在是唯一允许加载运行时的页面（原来是"没有页面可以"）；
  app.json 的 pin 改为"去掉新增加的那一行后必须恢复 UI04B 原字节"；产物内容 pin 从
  "禁止 `callFunction` 这个 token"改为"禁止任何平台全局"（UI04C 故意把注入方法命名为 `callFunction`）；
  "不可达模块"反例现在要切断 command-wire 的**两条**入边（UI04C 给它加了值入边）。
* `tests/ui03.test.mjs`：最后一页 pin 改为"`v2-live` 必须追加在 `v2-preview` 之后，前四位不变"。
