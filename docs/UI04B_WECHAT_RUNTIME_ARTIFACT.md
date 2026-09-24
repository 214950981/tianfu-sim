# UI04B — WeChat Client Runtime Artifact / Packager Bridge

本文件说明 UI04B 建立的 **微信可加载客户端运行时产物**：它在哪里、由什么生成、如何防止漂移、
它证明不了什么，以及仍然留给 UI04C 的接线工作。

> 这是**打包边界**工作，不是玩法改动，也不是页面接线。
> UI04B 没有改任何 Controller / submission / command codec 的行为，也没有接
> `wx.request`、云函数、云端持久化、默认路由或旧 1.0 页面。

## 一、问题

`project.config.json` 里 `miniprogramRoot` 是 `miniprogram/`，而 UI03 / UI04A 已验收的
client-safe 运行时（`WeChatRunController`、`CommandSubmissionController`、command wire codec）
位于 root **之外**的 TypeScript packages：

```text
packages/command-wire/src/index.ts      # 协议 codec，零 import
packages/application-ui/src/index.ts    # CommandSubmissionController
packages/wechat-shell/src/index.ts      # WeChatRunController + buildWeChatPageShell + ...
```

「Node 能用 source path import」不等于「微信 packager 能加载」：packager 把 `miniprogramRoot`
下的文件当 JavaScript 读，靠**静态分析**解析 `require("./x.js")`，并且不能执行 TypeScript。

## 二、产物在哪里

| 路径 | 内容 | 生成规则 |
| --- | --- | --- |
| `miniprogram/runtime/command-wire.js` | wire codec | 由 `packages/command-wire/src/index.ts` 机械派生 |
| `miniprogram/runtime/application-ui.js` | `CommandSubmissionController` / `canOrdinaryBack` | 由 `packages/application-ui/src/index.ts` 机械派生 |
| `miniprogram/runtime/wechat-shell.js` | `WeChatRunController` / storage adapter / builders | 由 `packages/wechat-shell/src/index.ts` 机械派生 |
| `miniprogram/runtime/index.js` | **唯一公开入口 facade** | 由固定的 allow-list 生成 |

`miniprogram/runtime/` 整个目录都是**生成物**，不是手写源码树。它的运行时闭包被钉死为上面三个
源模块；除此之外不许出现第四个文件。

### 公开 surface（bounded facade）

`miniprogram/runtime/index.js` 只发布 8 个名字，且由测试与审计双向钉死：

```text
APP_ERROR_CODES              CommandValidationError
ArchiveUnavailableError      IntentUnavailableError
RetryUnavailableError        SubmissionLockedError
WeChatRunController          createWeChatPlatformStorage
```

`WeChatRunController.pageModel()` 本身已经返回投影好的 `shell` / `coreIntents` / `specialIntents` /
`archive`，所以这些 builder 不需要单独的 facade 入口。要扩大 surface，必须改 generator 的 allow-list，
这会同时触发审计与专项测试失败——也就是一个需要 review 的动作，而不是 import 的副作用。

## 三、怎么生成

生成器：`tools/ui04b-wechat-runtime-artifact.mjs`。

```bash
node tools/ui04b-wechat-runtime-artifact.mjs          # freshness check（不一致则 exit 1）
node tools/ui04b-wechat-runtime-artifact.mjs --write  # 重新生成（幂等）
# 等价 npm script：
npm run ui04b:artifact / npm run ui04b:artifact:write
```

变换步骤（只有三步，没有 bundler）：

1. 读源文件，换行统一成 LF（所以产物与 checkout 的 line-ending 设置无关）。
2. 用 **Node 内置**的 `node:module` → `stripTypeScriptTypes(..., { mode: "strip" })` 擦除类型语法。
   这是 Node 自己用来直接运行本仓库 `.ts` 测试夹具的同一套代码路径，属于内置能力，
   **没有新增任何 compiler / bundler / runtime dependency**（仓库本身也没有 `node_modules`）。
3. 把剩下的 ESM 模块语法改写成普通 CommonJS：`import { a, b } from "./x.ts"` →
   `var { a, b } = require("./x.js")`；`export { a }` 与 `export <decl>` 汇总成模块末尾的
   `module.exports = { ... }`。
4. 每个文件前面加一段 header，记录**源路径**与**源 sha256**，让产物可以逐字节回溯到被验收模块。
   （stripper 会附加 `//# sourceURL=<源码路径>`，该路径在微信包里不存在，会被移除。）

### fail-closed

变换看不懂的东西一律报错，绝不静默透传：

- 不是 `import { ... } from "..."` 形式的 import（含 `import type` 残留、`import * as`、`import x from`）；
- 不是声明或具名 re-export 的 export（含 `export default`）；
- specifier 不是相对路径（**裸 specifier、`node:`、任何 npm 包**都直接失败）；
- specifier 解析后不在钉死的源模块集合内（即运行时闭包扩大）；
- 改写后仍残留 `import` / `export` 模块语句；
- 产物不是合法 JavaScript（用 `vm.Script` 只编译不执行来验证）；
- 产物里出现非字面量 `require(...)`，或 require 了钉死集合之外的 specifier；
- facade 要发布的名字在源模块里已不存在（否则会发布 `undefined`）。

因此「产物里混进 Node builtin / npm 包 / gameplay Core」在生成阶段就不可能通过。

### deterministic

`buildRuntimeArtifact()` 是源字节的纯函数：无时间戳、无绝对路径、无环境读取、无版本戳，
LF 行尾，输出顺序固定。两次运行逐字节相同，`--write` 幂等。专项测试直接断言这两点，
并把 CRLF 版源文件喂进去，要求产物字节不变。

## 四、freshness / audit 契约

三层互补，都会在漂移时失败：

| 层 | 工具 | 失败条件 |
| --- | --- | --- |
| 字节再生 | `npm run ui04b:artifact` | 重新生成的字节与已提交字节不一致（源码漂了，或产物被手改）；目录里多出未登记文件 |
| 产物审计 | `npm run ui04b:audit` | 见下 |
| 加载 / 行为 | `npm run ui04b:smoke` | 见第五节 |

`tools/ui04b-wechat-runtime-audit.mjs` 把**已提交字节**当对手来审，不信任生成器自述：

- **A 文件集合**：`miniprogram/runtime/` 里必须正好是钉死的 4 个文件；
- **B 边**：每个 `require` 实参必须是纯字符串字面量（packager 只 bundle 静态可分析的调用），
  且只能是同目录兄弟模块；裸 specifier / `node:` / 越出目录的路径 / 计算实参一律失败；
- **C 闭包**：从 facade 走真实 require 图，必须恰好覆盖 4 个模块——既不能少（不可达模块），
  也不能多（隐藏依赖）；
- **D 禁止内容**：注释剥离后的**代码**里不得出现 `packages/core/`、`packages/content/`、
  `server/src/`、`cloudfunctions/`、`wx.request`、`wx.cloud`，也不得引用 Node 运行时全局；
- **E 是 JavaScript**：注释剥离后的代码里不得残留任何 TypeScript-only 语法；
- **F 溯源**：每个模块文件必须记录钉死的源路径，且记录的 sha256 必须等于该源文件**当前**的 sha256；
- **G bounded facade**：facade 静态解析出的发布名集合必须等于 allow-list（`module.exports = {...}`
  与后续 `module.exports.x = ...` 两种写法都算）。

> D 与 E 只在**代码字符**上扫描，不在注释上。产物刻意保留了被验收源码的文档注释，
> 而 `packages/command-wire` 的注释本来就在讨论 `packages/core`——因为那份注释记录的正是这条边界本身。

审计的 negative control 在 `tests/ui04b.test.mjs` 里逐条给出：注入 Core 边、`fs`、`node:child_process`、
计算实参、不可达模块、多出文件、去掉溯源行、篡改溯源摘要、注入 `as const`、注入 `packages/core/`
路径、放大 facade、缩小 facade——每一种都必须被点名报出。
每个负向用例在改之前都会断言**锚点确实存在**，避免改到注释或空改而"假绿"。

## 五、smoke：产物能被 Node 以 CommonJS 加载，并且就是那份已验收代码

`tools/ui04b-wechat-runtime-smoke.mjs`（`npm run ui04b:smoke`）在**一个干净的 `node:vm` context** 里
把产物当 CommonJS 执行：只提供 `exports` / `module` / `require`，不提供 `wx`、`tt`、`Page`、
`Component`、`getApp`、`process`、`Buffer`、`setTimeout`。加载本身成功，就等于证明**加载产物不会触碰
平台或服务端代码**。

它随后做**差分验证**——同一份已提交公共夹具，分别喂给产物与已验收 TypeScript 源码，要求结果深度相等：

- `buildWeChatPageShell` / `mapCoreActionIntents` / `mapSpecialActionIntents` / `buildArchiveView`
  在 fixture 的每个 entry / state / variant 上相等；
- `canOrdinaryBack` 的全 pageState × interactionState 真值表相等；
- wire codec：代表命令的 canonical 字节完全一致，8 类非法信封的报错文本与错误类一致；
- **端到端**：同一份夹具、同一份 session、同一份 scripted transport，分别驱动产物里的与源码里的
  `WeChatRunController`——`load()` / `pageModel()` / `openArchive()` / `closeArchive()` /
  `submit()` 结果相等，且两边交给 transport 的 **envelope 规范化字节完全相同**。

> 跨 realm 说明：`vm` context 里的值带着那个 realm 的原型，所以比较前一律经
> `JSON.parse(JSON.stringify(...))`;而 wire codec 会拒绝原型不是本 realm `Object.prototype` 的对象，
> 所以喂给产物的信封要在 realm 内用 `JSON.parse` 重新materialize。这些是测试脚手架的处理方式，
> 不是产物的行为差异——真实小程序只有一个 realm。

## 六、packager seam：本轮**故意没有**动 `v2-preview`

任务允许在 `v2-preview` 里加一个无副作用的静态字面量 `require` 作为 packager 可见性 seam，
但条件是「if v2-preview is touched」。**本轮没有触碰它**，理由是被验收的冻结契约不允许：

- `tools/ui02-preview-fixture-module.mjs` 的 `checkFixtureRequire` 要求
  `miniprogram/pages/v2-preview/v2-preview.js` **恰好只有一次 `require()` 调用**，
  且 `tests/ui02r1.test.mjs` 直接断言 `checkFixtureRequire(ROOT).ok === true`，
  `tests/ui02entry.test.mjs` 也对该文件解析 require 实参。
- 加第二个 require 就必须放宽一个**已被验收的守卫**，而这既不在本任务 allowedScope 里，
  也不是「让审计变绿」的正确做法。

所以 UI04B 只保证产物**位于 `miniprogramRoot` 内、是 CommonJS、依赖是静态字面量** ——
这三条正是「packager 能加载」的机械含义。真实页面接线（以及随之而来的 seam）属于 UI04C。
专项测试里有一条正向锁：`miniprogram/` 下除 `runtime/` 外的任何模块都不得引用 runtime，
所以 UI04C 接线时必须显式改这个断言——它不会悄悄发生。

## 七、UI04B 不做什么

- 不接 `wx.request`、不接 2.0 `wx.cloud.callFunction`、不做云端持久化、不部署 cloudfunction；
- 不新增 bundler / compiler / 运行时依赖（`devDependencies` 仍然只有 `typescript`，没有 `dependencies`）；
- 不改默认路由、不注册新页面、不改旧 1.0 页面；
- 不把 fixture preview 变成 live gameplay（`v2-preview` 各文件逐字节未变）；
- 不手抄第二套 controller / submission controller / command codec —— 产物是变换结果；
- 不碰 Core / Content / Director / Cause / Progression / Risk / Build / NPC / server 语义；
- 不做 UI04C，也不做终局链路。

## 八、仍然留给 UI04C

- 真实 WeChat transport（`wx.request` / 云函数端点）与 `createRunOffer` 接线；
- 把某个 2.0 页面（或新的生产页）接到 `WeChatRunController`，并按需要把 facade 收进页面依赖图；
- 恢复 / 超时的产品级交互（弹窗、toast、重试文案）；
- 终局链路 `ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE` 编排；
- 真机 / DevTools 打包验证（见下）。

## 九、必须由人在 DevTools 里确认的事（本仓库证明不了）

仓库里**没有微信 DevTools、也没有 WXSS / JS 打包器**，所以下面几点只能人工确认，
UI04B 不会把它们写成 PASS：

1. 产物能被 DevTools 编译并打进包里（`miniprogram/runtime/*.js` 位于 `miniprogramRoot` 内）。
2. 产物使用了 ES2022 class 私有字段 / 私有方法（`#field`、`#method`）——这是被验收源码的写法，
   变换不会重写它；DevTools 的「增强编译」（`setting.enhance: true`）需要能处理。
   若真机报语法错误，这是一个**打包配置**问题，不是产物内容问题，应作为独立任务处理。
3. `require` 依赖图是否与静态分析结果一致（本轮的静态分析证据见审计的 B/C 两项）。

## 十、证据速查

| 关注点 | 命令 / 文件 |
| --- | --- |
| 生成 + freshness | `npm run ui04b:artifact` |
| 产物审计（含负向控制） | `npm run ui04b:audit`、`tests/ui04b.test.mjs` |
| Node CommonJS 加载 + 差分 | `npm run ui04b:smoke` |
| 专项套件 | `npm run test:ui04b`（已注册进聚合 `npm test`） |
| client runtime 无 Core 依赖（UI04A 边界） | `npm run ui04a:audit` |
| 产物路径 | `miniprogram/runtime/{command-wire,application-ui,wechat-shell,index}.js` |

## Controller acceptance note

UI04B produces and verifies a WeChat-packager-loadable client runtime artifact under
`miniprogramRoot`, derived deterministically from the accepted client-safe source modules, with a
freshness check, a generated-artifact audit that has real negative controls, and a Node CommonJS smoke
that differentially proves behavioural parity with those sources. The `v2-preview` packager seam was
deliberately not used because the accepted `checkFixtureRequire` contract allows exactly one `require()`
call in that page and weakening an accepted guard is out of scope. Real transport and page session
wiring remain UI04C.

## Controller acceptance / fast-lane handoff

UI04B was accepted at `282030872a83434fdb2cd4b2be67b36f060b3700`. Protocol v1.3 switches the next implementation phase to `fast-lane`: UI04C is intentionally a larger client vertical slice, while aggregate regression is deferred to UI04FINAL.
