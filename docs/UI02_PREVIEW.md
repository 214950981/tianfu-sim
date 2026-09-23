# UI02 — 天符 2.0 内景预览（开发者路由）

本文件说明 UI02 新增的**开发预览路由**：如何在微信开发者工具中打开它、它渲染哪些状态、
数据从哪来，以及哪些事情**明确尚未完成**。

> 这是 UI02 的高保真可视化切片（RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE），
> 不是生产默认页，也不是新一轮玩法调参。
> UI02R1 在此基础上把 RUN_HOME 重构为**一屏化操作面**，并补齐响应式与安全区合同。

## 一、这个路由是什么

- 路径：`miniprogram/pages/v2-preview/v2-preview`
- 注册位置：`miniprogram/app.json` 的 `pages` 数组**最后一项**
- **不是**默认首页（首页仍是 `pages/start/start`）
- **不是** tabBar 入口（tabBar 仍是 `pages/game/game` 与 `pages/rank/rank`）
- 与 1.0 旧页面**共存**：`pages/start`、`pages/game`、`pages/rank` 的业务逻辑逐字节未改动

## 二、如何在微信开发者工具中打开

1. 用微信开发者工具打开本仓库根目录（`project.config.json` 所在目录）。
2. 左侧「普通编译」下拉 → **添加编译模式**。
3. 启动页面选择 `pages/v2-preview/v2-preview`（若列表未刷新，先点一次「编译」）。
4. 进入后页面**右上角有一个悬浮的「调试」触发器**（不占产品布局高度）。
   点它展开 dev overlay，可在六个视图间切换：

   - `修行主页` — RUN_HOME
   - `事件` — EVENT
   - `特殊节点` — SPECIAL_NODE
   - `命书` — LIFE_ARCHIVE
   - `突破未成·变体` — RUN_HOME，突破入口存在但服务端投影为不可用
   - `能力缺省·变体` — RUN_HOME，平台/商业/分享能力全部关闭

   切换视图会**自动收起 dev overlay**，方便直接观察一屏效果；再次点击「调试」可继续切换。

也可以直接在开发者工具控制台执行：

```js
wx.navigateTo({ url: "/pages/v2-preview/v2-preview" });
```

## 三、数据从哪来（关键）

预览页**不自造任何玩法规则**。页面渲染的每个数值都来自
`miniprogram/pages/v2-preview/v2-fixtures.js`（运行时加载的静态 JS 模块），
它与同名 `.json` 是**同一份**生成数据：都由真实生产代码产出。

```bash
node tools/ui02-preview-fixture-module.mjs          # 校验 JS 模块与 JSON 是否最新（过期退出码 1）
node tools/ui02-preview-fixture-module.mjs --write  # 重新生成 JS 模块
node tools/ui02-preview-fixtures.mjs --write        # 重新生成 JSON
```

> **为什么是 `.js` 而不是 `.json`：**微信小程序运行时**不能 `require` 一个 `.json` 文件**。
> UI02R1 最初写的是 `require("./v2-fixtures.json")`，运行时抛错，而外层 `try/catch` 把错误吞掉
> 并把它当成"文件缺失"，于是页面显示"缺少 v2-fixtures.json"，实际文件是完整存在的。
> 现在运行时只加载生成的 `./v2-fixtures.js`（`module.exports = …`），
> 测试会断言 **JS 模块 payload == 提交的 JSON == 重新调用生成器**，因此不存在第二套数据。

生成链路全部是生产同款代码（模块写入工具只是调用同一个 `buildPreviewFixtures()`）：

| 环节 | 真实代码 |
| --- | --- |
| 造局（命格候选） | `server/src/destiny-offer.ts` → `generateServerDestinyOffer` |
| 开局 | `packages/core/src/reducer.ts` → `reduce(... START_RUN ...)` |
| 公开投影 | `server/src/viewmodel.ts` → `ServerViewModelBuilder.build` |
| 页面壳 / 能力入口 | `packages/wechat-shell/src/index.ts` → `buildWeChatPageShell` |
| 意图映射 | `miniprogram` → `mapCoreActionIntents` / `mapSpecialActionIntents` |
| 命书投影 | `buildArchiveView` |

`tests/ui02.test.mjs` 会**重新生成**一份 fixture 并与已提交的 JSON 逐字段比对；
`tests/ui02r1.test.mjs` 再断言 JS 模块与两者一致，因此任何一方被手工篡改或与真实代码脱节，测试立即失败。

### 3.1 加载失败时的诊断状态

不再用"缺少文件"掩盖模块加载错误。加载失败时页面显示一个**有界、可诊断、不含敏感信息**的失败面板：

| 字段 | 含义 |
| --- | --- |
| 阶段 | `module`（模块加载抛错）/ `shape`（导出结构不对）/ `view`（fixture 中没有该视图） |
| 代码 | 错误类名（如 `TypeError`）或结构化代码（如 `missing-collections`） |
| 详情 | 单行、去路径、截断到 160 字符的错误摘要 |
| 模块 | 尝试加载的模块说明符（`./v2-fixtures.js`） |
| 提示 | 重新生成的 CLI 命令 |

面板只渲染阶段/代码/摘要/说明符/提示；**不渲染任何 fixture 内容、原始 state 或环境细节**。
`view` 阶段还会列出 fixture 实际拥有的视图键名（仅键名，不含值），避免出现白屏却无信息。


### 状态夹具说明

| 状态 | 构造方式 | 目的 |
| --- | --- | --- |
| RUN_HOME | 活跃一世，修为已满，含公开条件 / 因果线索 / 道途印记 / 相识之人 | 展示主线主页与该有的四行 |
| EVENT | 同一世挂起一个未落定选项事件 | 展示服务端 `riskPresentation` 与「普通返回被锁」 |
| SPECIAL_NODE | 该世进入 `dying` 并挂起一个特殊节点 | 展示通用交互/重试边界，**不是**第二套突破引擎 |
| LIFE_ARCHIVE | 该世已 `ended`，带寿元终局与公开往事 | 展示只读命书 |
| 突破未成·变体 | 修为未满 | 突破入口存在但 `available=false` |
| 能力缺省·变体 | 能力集全关 | 入口自然隐藏/降级 |

> 说明：CONTENT01 与 dev fixture 中目前**没有** `kind: combat|breakthrough` 的事件定义，
> 因此服务端 `derivePageState` 只能通过 `status === "dying"` 进入 `SPECIAL_NODE`。
> 预览的 SPECIAL_NODE 夹具如实反映这一点，没有伪造内容包。

## 四、一屏化与响应式布局合同（UI02R1）

### 4.1 滚动政策

| 页面 | 政策 |
| --- | --- |
| RUN_HOME | **禁止页面级纵向滚动**。核心状态与四个核心行动首屏可见。 |
| EVENT / SPECIAL_NODE | **禁止页面级纵向滚动**。标题固定在顶部，正文与选项在受控区内滚动。 |
| LIFE_ARCHIVE | 允许纵向滚动，但滚动只发生在自己的 `archive-viewport` 内。 |

结构保证：`page { height:100%; overflow:hidden }` + 页面级 `disableScroll: true` +
`.screen { height:100vh; overflow:hidden }` + 用 flex/min-height:0 约束各层容器。
产品区**没有任何** `min-height: 100vh` 之类的自然撑高写法。

### 4.2 支持基线与视口矩阵

以微信小程序**内容视口**为准（`windowHeight` 已排除原生导航栏），不是设备营销型号。
基线是竖屏、`windowWidth >= 320` CSS px、`windowHeight >= 500` CSS px。

| Class | Width × Height | 命中的 wxss 断点 |
| --- | --- | --- |
| compact-xs | 320 × 500 | 基线 token（不命中任何媒体查询） |
| compact | 360 × 560 | `min-width:340` + `min-height:560` |
| classic | 375 × 603 | `min-width:340` + `min-height:560` + `min-height:600` |
| modern | 390 × 750 | `min-width:340` + `min-height:560/600/750` |
| large | 414 × 820 | `min-width:340/400` + `min-height:560/600/750/820` |
| large-tall | 430 × 850 | `min-width:340/400` + `min-height:560/600/750/820` |

小于 320×500 或横屏**不在本次像素级保证范围内**，但不会崩溃、重叠或产生不可恢复操作
（注意力区域会退化为受控内部滚动，而不是隐形裁切）。安全区按最坏情况 34px 预留。

### 4.3 RUN_HOME 信息层级

从上到下只有四层，全部首屏可见：

1. **身份与寿元** — 当前境界、此生名称、境界序、寿元进度与剩余。
2. **修行核心状态** — 修为 / 道基 / 灵石，紧凑三列。
3. **此刻值得关注** — 最多 3 个公开摘要槽位（主修 Build / 一条公开因果 / 一位相识）
   加一行公开条件摘要。**完整**的 Build / Cause / 人物 / 条件列表下沉到只读抽屉。
4. **行动区（底部 dock）** — 突破 CTA（仅当服务端投影 `available=true` 时出现）
   加四行动 2×2。

摘要槽位不是死路：点任一行（或点「道途印记」等入口）会打开对应的**只读抽屉**，
抽屉内不提供任何提交入口，也不会显示隐藏 Cause 或未公开 NPC 状态。

### 4.4 一屏不是靠压缩得来的

- 核心行动触控目标恒为 `--dock-row-h >= 104rpx`；在 320 宽视口即 **44.37 CSS px**。
- 突破 CTA 同样 `>= 104rpx`；不可用时只占一行紧凑说明（`--dock-note-h`），不预留大块。
- 产品区**没有任何字号低于 20rpx**；紧凑高度断点只收紧留白，不缩字号、不缩点击区。
- 长文案只做**单行省略**或**受控行数截断**，完整内容在只读抽屉里；不会横向溢出。
- disabled 行动仍占固定格位，突破 CTA 出现/消失时四行动位置不变（弹性空间放在中部）。

### 4.5 开发层

dev 触发器、dev overlay、只读抽屉全部是 `position: fixed` 悬浮层，
在产品 `.surface` **之外**，**不消耗产品布局高度**。`lastIntent`、`decisionId`、
交互状态、被锁普通返回的测试探针、能力入口诊断都只存在于 dev overlay 内。

### 4.6 WXSS 兼容性（UI02R1 返修项）

第一次人工验收时微信开发者工具编译失败：

```
./pages/v2-preview/v2-preview.wxss(150:1): unexpected token '*'
```

根因：`* { box-sizing: border-box; }` 通配选择器不被 WXSS 编译器接受（WXSS 只支持文档列举的
选择器子集）。修复方式：

- 删除通配选择器。WXSS 没有全局 reset，因此**凡是"有确定尺寸且同时带 padding/border"的盒子，
  都在自己的规则里显式声明 `box-sizing: border-box`**（当前 15 个）。这不是风格问题：
  一屏预算算术是按 border-box 写的，漏掉任何一个都会让布局预算失真。
- 该要求由 `tools/wxss-compat-audit.mjs` **从样式表推导**（有确定尺寸 + 垂直方向 padding/border
  即要求 border-box，且无法解析的内边距按非零处理），不是手写清单，因此新增盒子漏写会被发现。

`tools/wxss-compat-audit.mjs` 是一份**有界的子集检查**，不是真正的编译器：

| 检查 | 依据 |
| --- | --- |
| 无通配选择器 `*` | 编译期实测报错 |
| 无属性选择器 `[...]` | 官方文档：属性名选择器不会生效 |
| 无带参数的伪类 / 伪元素 | 官方文档：不支持带参数的伪类和伪元素 |
| 选择器只使用 page / 元素 / `.class` / 复合 class / 后代 class / 无参 `:active` | 官方选择器表 |
| `@` 规则只允许 `@media` / `@import` / `@keyframes` | 避免 `@supports` 等未支持规则 |
| 媒体条件只允许 `(min|max)-(width|height): Npx` | 本任务实际使用 |
| 有确定尺寸的盒子必须显式 border-box | 见上 |
| 不用 `position: sticky` / `display: grid` | 本项目自设的保守子集 |

它**不能**证明样式表一定编译通过；权威检查仍然是在微信开发者工具里真正编译一次。

### 4.7 开发者工具产生的临时文件

用微信开发者工具打开本项目时，工具会自动写入若干**未跟踪的临时文件**（实测：
`miniprogram/pages/game/game.js`（空页面模板）、`miniprogram/project.config.json`、
`miniprogram/pages/v2-preview/project.config.json`、`miniprogram/.vscode/`），
并且会**改写仓库根目录已跟踪的 `project.config.json` / `project.private.config.json`**。
它们不是仓库内容，也不属于任何一次提交。

注意：`miniprogram/pages/game/game.js` 是**空页面模板**（`Page({ data: {}, onLoad … })`）。
它绝不能提交——一旦提交会覆盖 1.0 仙途页。人工验收结束后建议清理这些文件，
或由控制者在 `.gitignore` 中统一忽略工具产物。

`tests/ui02r1.test.mjs` 的基线摘要检查按**钉死的基线文件清单**比对，对上述已知工具产物按
精确路径豁免（且任何**其它**新增文件仍会 fail-closed 报错），所以开过 DevTools 之后它依然可信。
`tests/ui02.test.mjs` 仍是按目录哈希，会在工具产物存在时误报——需要 `.gitignore` 或后续任务收口。

## 五、视觉语言

冻结语言：**宣纸 + 墨 + 朱砂 + 极少暗金 + 大量留白 + 克制动画**。
UI02 负责 HEX、字号、间距、圆角与组件尺寸，token 定义在
`miniprogram/pages/v2-preview/v2-preview.wxss` 顶部的 `page` 块：

- 宣纸 `--paper #F5F1E8` / `--paper-sunk` / `--paper-raised`
- 墨 `--ink #1C1A17` / `--ink-soft` / `--ink-muted` / `--ink-faint`
- 朱砂 `--cinnabar #A8342A` / `--cinnabar-soft`
- 暗金 `--gold #8A6B2F` / `--gold-soft`（仅用于细分隔线与突破入口一处强调）

页面内**不含**任何 1.0 霓虹仪表盘取值（`#FFD700`、`#050508`、`#55ff55`、`#55ccff`、
`#dd55ff`、发光 `text-shadow`、`box-shadow`）。测试会扫描并阻止回流。

## 六、自动验证与人工视觉验收（务必区分）

### 6.1 自动结构验证（已执行）

```bash
node tools/ui02r1-layout-audit.mjs          # 96 项结构检查 + 6 视口首屏预算表
node tools/wxss-compat-audit.mjs            # WXSS 语法子集检查（含通配选择器与 border-box）
node tools/ui02-preview-fixture-module.mjs  # fixture JS 模块与 JSON 是否为最新
node --test tests/ui02r1.test.mjs           # UI02R1 专项（含两个审计与 fixture 一致性的负向对照）
node --test tests/ui02.test.mjs             # UI02 视觉语言 / fixture / A12 边界
node --test tests/viewmodel-ui.test.mjs     # A12 安全边界（必须保持全绿）
npx tsc --noEmit
node tools/check-import-boundaries.mjs
node tools/content-lint.mjs packages/content/dev-fixtures/minimal-pack.json
node tools/content01-lint.mjs
node tools/scan-secrets.mjs
```

审计会打印每个矩阵视口的首屏预算（栈高 + 安全区 vs 视口高）。
它**只证明结构合同**：容器约束、滚动归属、四行动与 CTA 的存在性、
触控目标下限、安全区写法、旧 1.0 / server / Core / Content 逐字节未变。

### 6.2 仍然必须由人做的视觉验收（未执行）

自动测试**不能**替代真机或开发者工具的肉眼验收。请在微信开发者工具中完成：

0. **首先确认编译通过，且预览页进入了 RUN_HOME 而不是失败面板。** UI02R1 曾出现过两次加载
   问题：`v2-preview.wxss` 因通配选择器 `*` 编译失败（`unexpected token '*'`），以及页面因
   `require` 一个 `.json` 模块而显示"缺少 v2-fixtures.json"。两者都已修复。若出现任何 WXSS 语法
   错误，或看到失败面板（阶段 / 代码 / 详情 / 模块 / 提示），请把它当成 UI02R1 的返修项提回，
   而不是绕过——失败面板是**故意**显示这些信息的，它就是给返修用的。
1. 用**自定义编译模式**或设备模拟器，逐个切到上表 6 个视口（320×500 起）。
2. RUN_HOME：确认**页面完全不能纵向滑动**（手势下拉没有页面位移），
   四个行动块与突破 CTA 全部在首屏内，且没有横向滚动条。
3. 逐个点开四个摘要行 / 抽屉，确认抽屉从底部弹出、内部可滚、点「收起」可关闭，
   且关闭后产品区高度没有任何变化。
4. 点右上角「调试」：确认面板是**覆盖**在产品之上（背后布局不动），
   切换到 `事件` 后确认正文很长时只有正文区滚动、标题不滚出屏幕。
5. 切到 `命书`：确认命书内部可以滚动，且**不会**带动整个页面滚动。
6. 在有 Home Indicator 的机型（如 iPhone 15）上确认底部行动区与事件选项
   不被小白条遮挡。
7. 切到 `突破未成·变体`：确认四行动位置与常态**完全一致**（Dock 不跳动）。
8. 在 320 宽的小屏上确认行动块仍好点（≥44 CSS px）且文字不糊、
   未出现「为了塞进一屏而变小」的迹象。

任何一项不通过，都属于 UI02R1 的返修范围，而不是 UI03。

## 七、明确尚未完成（生产接线）

以下是**有意留白**，不属于 UI02 / UI02R1 范围：

1. **生产传输未接线。** 预览没有 `wx.request`，也没有连接
   `ApplicationTransport` / `CommandGateway`。点击行动只会记录「本应提交的命令形状」。
2. **命令未提交、未落库。** `CommandSubmissionController` 的 pending / retry /
   reconfirmation 语义已在 A12 实现并有测试覆盖，但预览页尚未把它接上真实网关。
3. **无真实登录、无真实存档。** 预览使用固定 `playerId` / `runId` 的公开夹具。
4. **不是玩法实现。** 突破仍由 `ATTEMPT_BREAKTHROUGH` 这一服务端权威命令决定；
   预览只能读取服务端投影的「可否突破」，不计算成功率、不改动 RNG、不持有第二套 Core。
5. **SPECIAL_NODE 未覆盖战斗。** 只呈现通用容器与交互边界。
6. **事件选项仍是只读呈现。** 选项提交属于 UI03 的 live-session 接线。

把以上接起来属于 UI03 及后续任务。UI02R1 的产出是**可验证的一屏信息架构、
响应式与安全区合同**，UI03 不负责补救基础布局。
