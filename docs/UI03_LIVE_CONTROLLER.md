# UI03 — WeChat 2.0 Live Session Controller

本文件说明 UI03 新增的 **live session controller**（`WeChatRunController`）：它负责什么、不负责什么、
生产 WeChat transport 的接线口在哪里，以及哪些事情明确属于 UI04。

> 这是 **session / presentation orchestration**，不是新的玩法层。
> UI03 不把 gameplay authority 搬到客户端，也不改 Core / Content / Director / 服务端网关规则。

## 一、它在哪里

- 代码：`packages/wechat-shell/src/index.ts`（与已验收的 `buildWeChatPageShell` /
  `mapCoreActionIntents` / `mapSpecialActionIntents` / `buildArchiveView` 同一个包）。
- 测试：`tests/ui03.test.mjs`（可 `npm run test:ui03`；也已注册进聚合 `npm test`）。
- 它**没有被预览页接线**：`miniprogram/pages/v2-preview/v2-preview` 仍然只渲染生成夹具，
  生产 transport 尚未接线（见第五节）。UI03 交付的是可复用控制器 + E2E 证据，不是路由切换。

## 二、职责边界

`WeChatRunController` 只做四件事：

| 职责 | 实现 |
| --- | --- |
| 载入权威 ViewModel | `load()` → `ApplicationTransport.fetchView(runId)` |
| 把玩家意图映射成 `GameCommand` | `#commandFor(intent)`，只从服务端已投影的条目里选 |
| 提交命令 | 全部委托给 `CommandSubmissionController` |
| 投影下一页模型 | `pageModel()` → `buildWeChatPageShell` + 意图映射 + `buildArchiveView` |

它**不做**：掷 RNG、判定 Outcome、计算突破/风险资格、算难度与赔率、改 RuleState、
决定 pageState 跳转、把 hidden Cause / rootSeed / RNG 状态 / trace 带进客户端模型。
所有 gameplay 页面跳转都来自刷新后的 `PublicViewModel`。

### 意图词表（`WeChatRunIntent`）

| intent | 命令来源 | 失败关闭条件 |
| --- | --- | --- |
| `{kind:'coreAction', intentId:'core.<actionId>'}` | 服务端投影的 `publicRun.actions` | 未投影 / `enabled !== true` |
| `{kind:'specialAction', intentId:'special.attemptBreakthrough'}` | 服务端投影的 `publicRun.specialActions` | 未投影 / `available !== true` |
| `{kind:'interactionOption', optionId}` | 权威 `currentInteraction` 的 `options` | pageState 不是 `EVENT`/`SPECIAL_NODE`、无 `currentInteraction`、optionId 不在列表、**`eventId` 未下发** |

上面任一条件不满足时抛 `IntentUnavailableError`，**不会**发出命令、也不会回退成猜测。

### `eventId` 为什么必须由服务端下发

`command.ref` 的 `CHOOSE_EVENT_OPTION` 以 `eventId` 为键；而 `CurrentInteraction.interactionId`
是**决策实例身份**（真实运行中是 `event:<commandId>:<eventId>`），两者不相等。
因此在 UI03 之前，客户端**无法**只凭公开 ViewModel 构造契约自己的命令——
只能去拆 `interactionId` 或猜 `titleKey` 前缀，这都属于"伪造 eventId"。

UI03 的修复是最小且可加的：服务端把当前事件的权威 `eventId` 原样投影到 `currentInteraction`
（`server/src/viewmodel.ts` → `eventId: current.eventId`），类型加在
`packages/platform-contract/src/index.ts`。它**不是新信息**：历史事件的 eventId 早已通过
`history[].data.eventId` 公开，且 `eventId` 是内容标识，不是权限或隐藏状态。
`destinyOffer` 不携带该字段（开局前不存在 run 事件）。

## 三、提交语义的单一所有权

`WeChatRunController` 内部**只有一个** `CommandSubmissionController` 实例，且自己不写任何存储。
因此下面这些语义继续由 `CommandSubmissionController` 独占，UI03 没有第二套：

- 命令信封（`commandId` / `playerId` / `runId` / `expectedStateVersion` / 版本字段）；
- `commandId` 生成与 pending 持久化（`tianfu2:pending-command:<runId>`）；
- `retryableError` 下的 `retry()`：**同一 commandId + 同一 payload** 重发；
- `STATE_CONFLICT` 下刷新最新 ViewModel 并**要求显式重新确认**：`reconfirm(intent)`
  重新从*最新* ViewModel 取命令，因此自动获得 **新的 commandId** 与**最新 stateVersion**；
- `submitting` 期间互斥锁（`SubmissionLockedError`）。

`restore()` 支持重启恢复：先回到权威状态，再让 `CommandSubmissionController` 恢复 pending 命令
（绝不重掷事件、绝不本地结算）。

## 四、LIFE_ARCHIVE 与返回保护

- `openArchive()` / `closeArchive()` 是**本地只读侧页导航**：不发命令、不改 stateVersion、
  不改 RuleState。`pageModel().archiveOpen` 只在权威 pageState 为 `RUN_HOME` 时才为 true，
  一旦服务端把玩家带到别的页面，overlay 自动从下一个模型里消失。
- 决策面（`EVENT` / `SPECIAL_NODE`）未决时 `shell.ordinaryBackAllowed === false`，
  与已验收的 shell 完全一致；UI03 没有另写一套返回判定。

## 五、生产 WeChat transport 的接线口（UI04 及以后）

目前的接线口有三个，都是注入式的，UI03 只提供边界，不提供实现：

| 端口 | 契约 | UI03 提供 | 仍待接线 |
| --- | --- | --- | --- |
| `ApplicationTransport` | `platform.ref` | 只接受注入 | 真实 `wx.request`/云函数端点、鉴权、错误码映射 |
| `PlatformStorage` | `platform.ref` | `createWeChatPlatformStorage(api)`：调用方传入 `wx.getStorageSync` / `wx.setStorageSync`，本包不引用任何 `wx` 全局 | 页面在 `onLoad` 时把 `wx` 存储函数传进来 |
| `commandIdFactory` | — | 只接受注入 | 生产 id 生成策略 |

示例（**尚未接线**，仅示意边界）：

```js
var controller = new WeChatRunController({
  transport: realTransport,                       // UI04
  storage: createWeChatPlatformStorage({          // 注入，不 import
    getStorageSync: function (key) { return wx.getStorageSync(key); },
    setStorageSync: function (key, value) { wx.setStorageSync(key, value); }
  }),
  session: { playerId: playerId, runId: runId, rulesVersion: rulesVersion, contentVersion: contentVersion, clientBuild: build },
  commandIdFactory: makeCommandId
});
```

## 六、明确属于 UI04（UI03 不做）

- 真实 WeChat transport（`wx.request` / 云函数端点 / 生产云部署）与 `createRunOffer` 接线；
- 把 `pages/v2-preview/v2-preview`（或新的 2.0 生产页）接到本控制器、替换默认路由；
- 终局链路 `ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE` 的编排；
- 恢复/超时的产品级交互（弹窗、toast、重试提示文案）；
- 掌机级 pending UI 之外的任何新玩法、榜单、商业或广告能力。

## 七、验收口径

- `npm run test:ui03`：专用套件；
- 全部 E2E 走真实 `CommandGateway` + `GatewayApplicationTransport` + `ServerViewModelBuilder`，
  只替身 storage 与 commandId factory；
- `tests/ui02.test.mjs` / `ui02r1` / `ui02r2` / `ui02r2a2` / `ui02entry` / `ui02copy` 保持通过
  （`ui02r1` 的四个 base-tree 摘要已在 UI03 内**有意**更新，见其注释与 LAST_RESULT）。
