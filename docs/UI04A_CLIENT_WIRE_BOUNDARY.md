# UI04A — Client-Safe Command Wire Boundary

本文件说明 UI04A 建立的 **client-safe command/envelope wire 边界**：它在哪里、为什么存在、
兼容路径是什么，以及仍然留给 UI04B 的页面/传输工作。

> 这是**打包边界**改造，不是玩法改动。
> 命令形状、校验、canonical serialization、retry / pending / idempotency / STATE_CONFLICT 语义
> 一个字节都没有变；UI04A 也没有接真实 `wx.request`、没有云函数、没有改默认路由。

## 一、问题

UI03 验收后，`CommandSubmissionController`（`packages/application-ui/src/index.ts`）在**运行时**
从 gameplay Core barrel 引入命令信封的解析与序列化：

```ts
import { parseCommandEnvelope, serializeCommandEnvelope, ... } from "../../core/src/index.ts";
```

测试环境没问题，但真实小程序打包时，这条边会把 `packages/core/src/index.ts` 及其传递依赖
（reducer / state / rng / director / event / cause / progression / risk / build / npc / participants）
带进 client bundle。客户端**真正需要**的只有协议本身。

## 二、边界在哪里

新增低层、client-safe 包：

| 位置 | 内容 |
| --- | --- |
| `packages/command-wire/src/index.ts` | 命令/信封 wire codec：`GameCommand` / `CommandEnvelope` / `CommandResult` / `APP_ERROR_CODES` / `CommandValidationError` / `validateGameCommand` / `validateCommandEnvelope` / `serializeCommandEnvelope` / `parseCommandEnvelope` |
| `packages/core/src/command.ts` | **兼容 re-export**：`export * from "../../command-wire/src/index.ts";` |
| `packages/application-ui/src/index.ts` | 运行时 import 改为 `../../command-wire/src/index.ts` |
| `packages/wechat-shell/src/index.ts` | 连 `import type` 也改指 `command-wire`，该包不再有任何指向 gameplay Core 的 import |

`packages/command-wire` **一个 import 都没有**——没有 `packages/core`，也没有任何第三方依赖。
这是"client runtime 脱离 gameplay Core"的机械含义，而不是"把 import 从 barrel 换成某个 core 文件"。

### 单一事实源

- **只有一套** validator / canonical serialization：就是被搬到 `command-wire` 的那份实现。
- `packages/core/src/command.ts` 不是副本，而是同一个模块的 re-export：
  `core.validateGameCommand === wire.validateGameCommand` 由 `tests/ui04a.test.mjs` 直接断言。
- 动作词表分两层，且被测试钉死相等：
  - `command-wire` 的 `COMMAND_ACTION_IDS` 是**协议**词表（来自 `.codex/contracts/command.ref`）；
  - `packages/core/src/state.ts` 的 `ACTION_TYPES` 是**规则侧**词表；
  - UI04A 测试断言两者集合相等，任何一个漂移都会失败。

## 三、Core / server 兼容

`packages/core/src/reducer.ts`、`persistence.ts`、Core barrel 与 `server/src/command-gateway.ts`
的 import specifier **完全没有改**，继续通过 `packages/core/src/command.ts` 拿到同一批绑定。
因此 server 的 `validateCommandEnvelope` / `serializeCommandEnvelope`（含 idempotency payload hash
与 `MAX_COMMAND_ENVELOPE_BYTES` 判定路径）行为不变。

## 四、机器可执行的依赖审计

```
node tools/ui04a-client-runtime-audit.mjs            # 默认 root：application-ui / wechat-shell
node tools/ui04a-client-runtime-audit.mjs --root <file>
```

它走的是**运行时** import 图（`import` / `export ... from` / `import()` / `require()`），命中
`packages/core/**`（含 barrel 与兼容 shim）、`packages/content/**` 或 `server/**` 即失败并打印
具体模块名；无法解析的相对 specifier 也失败（fail closed）。

**`import type` 不算边**——它会被编译器擦除。审计对 `type` 的处理是显式且有对照的：

| 对照 fixture | 期望 |
| --- | --- |
| `tests/fixtures/ui04a-client-runtime/forbidden-edge.ts`（`import { reduce } from .../core/src/reducer.ts`） | 非零退出，并点名 `packages/core/src/reducer.ts` |
| `tests/fixtures/ui04a-client-runtime/type-only-edge.ts`（`import type { GameState } from .../core/src/state.ts`） | 零退出 |

审计还强制要求 client root 的运行时闭包**必须**包含 `packages/command-wire/src/index.ts`
（wechat-shell 还须包含 `application-ui`），否则报"闭包缺失"，避免"什么都没 import 所以全绿"。

## 五、验收口径

- `npm run test:ui04a`：专用套件（冻结 canonical 字节、Core/server 兼容、审计正/负对照、UI03 语义回归）。
- `npm run ui04a:audit`：独立审计 CLI。
- 冻结的 canonical 字节在写入测试前，已与 `git archive <base>` 的**未改动**实现逐条比对过，
  37 行行为矩阵（含全部非法信封的报错文本）完全一致。
- `npm run test:ui03` / `test:command` / server-gateway / reducer / replay / viewmodel-ui 与聚合
  `npm test` 必须保持通过（沙箱 nested-process EBUSY 按 TOOLING_RUNBOOK 的"双重证明标准"处理）。

## 六、后续 UI04 系列（UI04A 不做）

- 真实 WeChat transport（`wx.request` / 云函数端点 / 生产云部署）与 `createRunOffer` 接线；
- 把 `pages/v2-preview/v2-preview`（或新的 2.0 生产页）接到 `WeChatRunController`、替换默认路由；
- 终局链路 `ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE` 编排；
- 恢复/超时的产品级交互（弹窗、toast、重试文案）。

## Controller acceptance note

UI04A was accepted. The next task is `UI04B`, narrowed to producing and verifying a WeChat-packager-visible client runtime artifact under `miniprogram/`. Real transport/session wiring is deferred to `UI04C` so packaging and backend authority are not debugged at the same time.
