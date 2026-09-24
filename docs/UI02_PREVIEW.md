# UI02 — 天符 2.0 内景预览（开发者路由）

本文件说明 UI02 新增的**开发预览路由**：如何在微信开发者工具中打开它、它渲染哪些状态、
数据从哪来，以及哪些事情**明确尚未完成**。

> 这是 UI02 的高保真可视化切片（RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE），
> 不是生产默认页，也不是新一轮玩法调参。
> UI02R1 在此基础上把 RUN_HOME 重构为**一屏化操作面**，并补齐响应式与安全区合同。
> UI02ENTRY 用同一套已验收视觉系统补齐**开局前流程**
> （START → MODE_SELECT → DESTINY_OFFER → RUN_OPENING），仍未开始 UI03 生产接线。
> UI02COPY 是最终合入前的**纯玩家文案清理**：清掉屏上的原始内容 key 与内部 capability 名，
> 不动玩法、投影、路由与布局合同（见 5.6）。

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
   点它展开 dev overlay，可在十个视图间切换（**前面四个是开局前流程，按顺序读**）：

   - `启程` — START（开局身份面）
   - `模式` — MODE_SELECT（只列合同已有的模式/能力入口）
   - `择命` — DESTINY_OFFER（真实服务端公开命格候选）
   - `入世` — RUN_OPENING（开局过渡/摘要）
   - `修行主页` — RUN_HOME
   - `事件` — EVENT
   - `特殊节点` — SPECIAL_NODE
   - `命书` — LIFE_ARCHIVE
   - `突破未成·变体` — RUN_HOME，突破入口存在但服务端投影为不可用
   - `能力缺省·变体` — RUN_HOME，平台/商业/分享能力全部关闭

   切换视图会**自动收起 dev overlay**，方便直接观察一屏效果；再次点击「调试」可继续切换。
   预览默认停在 `启程`（流程第一屏）。
   开局前流程也可以**在页面内点着走**：`启程` 的主按钮 → `模式`，`模式` 的主按钮 → `择命`
   （这是**预览内导航**，dev overlay 会明确标注「未提交命令」，不是生产路由跳转）。
   `入世` 用 dev tab 打开。

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

> **第二个必须记住的加载约束：`require` 的参数必须是字符串字面量。**
> 微信打包器靠**静态分析**源码建立依赖图。`require("./v2-fixtures.js")` 可被分析、依赖会被打进包；
> 而 `require(FIXTURE_MODULE_SPECIFIER)` 这种**变量形式不能建立依赖**，编译通过但运行时失败：
> `module '<path>' is not defined, require args is './v2-fixtures.js'`。
> 这是本页第二次运行时翻车（Node 的模块系统接受计算式 require，所以之前的 Node 测试看不见它）。
> 因此：`FIXTURE_MODULE_SPECIFIER` **只用于失败面板展示**，永不作为 `require` 参数；
> 回归测试会**按语法**扫描整个 `miniprogram`，拒绝任何非字面量 require 参数，
> 并断言该常量与真实字面量一致（防止两者漂移）。`node tools/ui02-preview-fixture-module.mjs`
> 在校验新鲜度的同时也会执行这项检查。

生成链路全部是生产同款代码（模块写入工具只是调用同一个 `buildPreviewFixtures()`）：

| 环节 | 真实代码 |
| --- | --- |
| 造局（命格候选） | `server/src/destiny-offer.ts` → `generateServerDestinyOffer` |
| 开局 | `packages/core/src/reducer.ts` → `reduce(... START_RUN ...)` |
| 公开投影 | `server/src/viewmodel.ts` → `ServerViewModelBuilder.build` |
| 页面壳 / 能力入口 | `packages/wechat-shell/src/index.ts` → `buildWeChatPageShell` |
| 意图映射 | `miniprogram` → `mapCoreActionIntents` / `mapSpecialActionIntents` |
| 命书投影 | `buildArchiveView` |
| 择命候选（公开） | `server/src/destiny-offer.ts` → `projectDestinyOfferView` |

### 3.0 `entry` 与 `states` 为什么分开

夹具有两个集合：

- `entry`（UI02ENTRY 新增）：`START / MODE_SELECT / DESTINY_OFFER / RUN_OPENING`。
- `states` / `variants`：内景 `RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE` 与两个 RUN_HOME 变体。

分开的原因是**语义**，不是风格：`START` 与 `MODE_SELECT` 发生在**任何权威 Run 存在之前**，
服务端没有对应的 `PageState` 或 ViewModel 可投影（`derivePageState` 只认 run 状态与当前交互）。
把它们塞进 `states` 就必须给每个开局前屏幕伪造一个 Run。分开之后：

- `states` 仍然是「**服务端权威页面**」集合（`entry` 不参与它的逐字段再生成断言）；
- `entry` 明确是「**开局前的公开流程**」，且 **DESTINY_OFFER 那一项本身就是真实服务端投影**
  （`run.status === "offered"` 是货真价实的 `PageState`）。

`entry` 每一项都只带已经公开的数据：

| entry 键 | 携带内容 | 是否来自服务端投影 |
| --- | --- | --- |
| START | 无状态数据；页面只渲染**文档已有文案**（见 5.6 溯源） | 否（无 Run 可言） |
| MODE_SELECT | 只有 `shell.visibleEntries`（已验收的 `buildWeChatPageShell` 能力投影） | 是（能力投影） |
| DESTINY_OFFER | 完整的公开命格投影（`view` + `shell`） | 是 |
| RUN_OPENING | 已开局 Run 的公开投影 + `projectDestinyOfferView` 解析出的**已选候选公开字段** | 是 |

> `tests/ui02entry.test.mjs` 会在测试里用**独立的**生产链调用重新造一次 dev offer，并断言夹具里的
> 候选就是那一次真实投影（不是手写文案），同时扫描整个 `entry` 集合，确认没有
> seed / RNG 状态 / drawIndex / 权重 / odds / difficulty / 任何规则内部字段。

`tests/ui02.test.mjs` 会**重新生成**一份 fixture 并与已提交的 JSON 逐字段比对；
`tests/ui02r1.test.mjs` 再断言 JS 模块与两者一致，因此任何一方被手工篡改或与真实代码脱节，测试立即失败。

### 3.1 加载失败时的诊断状态

不再用"缺少文件"掩盖模块加载错误。加载失败时页面显示一个**有界、可诊断、不含敏感信息**的失败面板：

| 字段 | 含义 |
| --- | --- |
| 阶段 | `module`（模块加载抛错）/ `shape`（导出结构不对）/ `view`（fixture 中没有该视图） |
| 代码 | 错误类名（如 `TypeError`）或结构化代码（如 `missing-collections`） |
| 详情 | 单行、去路径、截断到 160 字符的错误摘要 |
| 模块 | 诊断展示用的字面量 `./v2-fixtures.js`（仅用于展示，不是 `require` 的参数） |
| 提示 | 重新生成的 CLI 命令 |

面板只渲染阶段/代码/摘要/说明符/提示；**不渲染任何 fixture 内容、原始 state 或环境细节**。
`view` 阶段还会列出 fixture 实际拥有的视图键名（仅键名，不含值），避免出现白屏却无信息。


### 状态夹具说明

| 状态 | 构造方式 | 目的 |
| --- | --- | --- |
| START（启程） | 无状态数据；只渲染文档已有文案 | 开局身份面：一个主入口 + 克制次要信息 |
| MODE_SELECT（模式） | 只有已验收的能力投影 `visibleEntries` | 只列合同已有模式/能力入口；缺能力的入口显示为不可用 |
| DESTINY_OFFER（择命） | `generateServerDestinyOffer` → `ServerViewModelBuilder.build` | 展示**真实**公开命格候选与择定态（无默认选中） |
| RUN_OPENING（入世） | 已开局 Run 的公开投影 + `projectDestinyOfferView` | 开局过渡/摘要；只读已公开信息，不结算 |
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
| START | **禁止页面级纵向滚动**。身份面留白，主入口固定在底部。 |
| MODE_SELECT | **禁止页面级纵向滚动**。模式列表在受控区内（见下）。 |
| DESTINY_OFFER | **禁止页面级纵向滚动**。候选列表在受控区内（见下）。 |
| RUN_OPENING | **禁止页面级纵向滚动**。摘要 + 单一入世入口。 |
| RUN_HOME | **禁止页面级纵向滚动**。核心状态与四个核心行动首屏可见。 |
| EVENT / SPECIAL_NODE | **禁止页面级纵向滚动**。标题固定在顶部，正文与选项在受控区内滚动。 |
| LIFE_ARCHIVE | 允许纵向滚动，但滚动只发生在自己的 `archive-viewport` 内。 |

结构保证：`page { height:100%; overflow:hidden }` + 页面级 `disableScroll: true` +
`.screen { height:100vh; overflow:hidden }` + 用 flex/min-height:0 约束各层容器。
产品区**没有任何** `min-height: 100vh` 之类的自然撑高写法。

四个开局前屏幕同样是 `.surface` 的 `.page` 子元素，因此一屏政策是**结构性**的，不是逐屏特判：
它们自己**不新增任何滚动容器**，只有两个受控列表区（模式列表与候选列表）用 `.entry-list`
（`scroll-y` + `flex: 1 1 auto` + `min-height: 0`，与已验收的 `.attention-scroll` 同款）：
支持视口内内容本来就不需要滚动，低于基线时退化为**内部滚动**而不是隐形裁切。

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
  都在自己的规则里显式声明 `box-sizing: border-box`**（当前 22 个；其中 6 个是 UI02ENTRY 入口流程新增的
  `.entry-list` / `.entry-row` / `.offer-cand` / `.opening-row` / `.entry-attrs` / `.entry-cta`）。这不是风格问题：
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

## 五点五、UI02R2 视觉打磨与中文呈现层

UI02R2 是**纯 presentation 打磨**，不扩张功能，不触碰任何 UI02R1 结构合同。

### 5.1 版式与层级（RUN_HOME）

- **hero**：境界名（52rpx/600 字重）是唯一大字；此生名称次之；境界序（`第N境`，
  `order 0` 呈现为「未入修行」）以**暗金**单色作为 hero 内唯一强调。
- **vitals**：修为 / 道基 / 灵石为一条三等分横带，列间以发丝线分隔；数值 30rpx/600
  提到前景，标签 20rpx 退到背景。
- **眼下要务**（原「此刻值得关注」）：标题前置一个 10rpx 暗金方点，像任务面板头而不像
  列表头；三行摘要的 tag（主修/因果/相识/条件）改为描边 chip；行尾箭头用 `--gold-soft`
  提示可点。
- **行动区**：突破 CTA 改为**实心墨底 + 纸色文字 + 暗金目标**的主按钮（32rpx/600/8rpx
  字距），四行动保持浅底描边次级按钮（30rpx/500/8rpx 字距），主次关系一眼可分。
- **统一圆角**：新增 `--radius-card: 8rpx` 专用于按钮与卡片（CTA / 行动 / dock 说明 /
  选项 / 失败面板 / 调试触发器）；`--radius: 4rpx` 冻结值不变，仍用于小 chip 与标签。
- **呼吸感**：`--vitals-h/--attn-slot-h/--attn-head-h/--hero-meta-h/--life-h/--dock-gap`
  等节奏 token 上调，六视口首屏预算仍全部达标（UI02R2 时最紧 320×500 余 34.6px；
  UI02R2A2 进一步把余量分配给内容后见 5.4），
  触控下限（104rpx≈44.37px@320）与 20rpx 字号下限**未动**。

### 5.2 中文呈现层（presentation labels）

页面顶部新增一组呈现层标签表，只镜像**合同里已存在的结构性枚举 id**：

| 表 | 覆盖 | 来源 |
| --- | --- | --- |
| `REALM_LABELS` | 六境界 id → 凡人/炼气/筑基/金丹/元婴/化神 | content progression-v1 官方 displayName |
| `BUILD_STAGE_LABELS` | latent/emerging/formed/refined → 潜藏/初显/成形/精纯 | core `BUILD_STAGES` |
| `CONDITION_KIND_LABELS` / `DEATH_CAUSE_LABELS` | injury→伤患；lifespan→寿元耗尽 | core 风险/条件 |
| `AFFINITY_LABELS` / `TRUST_LABELS` | 五档亲疏 / 五档信任 | core `affinitySemantic`/`trustSemantic` |
| `ROLE_LABELS` / `SLOT_LABELS` | 师长/商贾；自身/对方/师尊/被救之人… | 投影 knownRoles / participant slots |
| `RISK_TIER_LABELS` | low/caution/dangerous/lethal → 低险/宜慎/危险/凶险 | core `RiskPresentationData.tier` |
| `REASON_KEY_LABELS` | `breakthrough.*` / `risk.category.*` / `risk.reason.injury` | 已知 reason key |
| `ENTRY_KIND_LABELS` | event/build → 事件/道途 | 命书 history |

规则（`tests/ui02r2.test.mjs` 钉死）：

1. **未知值原样回退**（`presentLabel`）：未来内容包出现新 id 时显示原始 id，不显示错标签。
2. **不是 locale 层**：这张表只镜像合同里已有的**结构性枚举 id**。叙事内容键（`titleKey`/
   `bodyKey`/`labelKey`/`summaryKey` 的正文）**不在**这组表里——它们由 5.6 的
   `CONTENT_COPY` 目录单独处理（有界、只覆盖当前夹具真正触达的 key）。
3. **不含任何 per-run 夹具值**（人名、局名、npc id 等），也不含叙事键。
4. `realmOrder` 数值原样保留在投影上；`第N境`/`未入修行` 只是 order 的呈现。

### 5.3 仍需人工验收（UI02R2 新增项）

在原有 UI02R1 人工验收清单之上，追加：

- RUN_HOME 主次关系：突破 CTA 是否明显读作**主按钮**，四行动是否读作一组次级操作。
- hero 层级：境界名 → 此生名 → 暗金境界序，三级是否一眼可分。
- vitals 三列分隔线与数值字重是否清晰不糊；小屏（320）数值是否仍完整不截断。
- 「眼下要务」是否像任务面板；chip 在 320 宽是否与正文挤压。
- 全部中文标签无生硬英文残留（境界、阶段、条件、亲疏、风险档位、命书条目）；
  若出现未知 id 原样显示（预期行为，提回即可）。
- **（UI02R2A2）** 正常屏与高屏（如 390×750 / 414×820 / 430×850）：信息区与行动区之间
  是否还有大片空场；「眼下要务」面板是否把剩余高度收成**面板内留白**而非页面空洞。
- **（UI02R2A2）** 三个面是否各司其职：hero 身份牌（浮起 + 朱砂边）→ vitals 状态卡
  （浮起 + 发丝边）→ 眼下要务（内嵌下沉面板），层级是否一眼可分而不互相打架。
- **（UI02R2A2）** 四行动是否读作**同一个操作组**（下沉托盘上的 2×2），突破 CTA 是否仍
  是唯一主按钮。
- **（UI02R2A2）** 境界 chip 与寿元进度条在小屏（320）是否仍完整、不被裁切。

### 5.4 UI02R2A2 —— RUN_HOME 视觉重组（纯呈现）

UI02R2A2 依然**纯 presentation**：不动一屏合同、不动四行动、不动安全区/滚动归属/视口矩阵、
不动中文呈现层。它解决的是 UI02R2 的视觉拒收项：

1. **分组与角色**：三个面各司其职——hero 为**浮起身份牌**（`--paper-raised` + 唯一一条
   朱砂左边），vitals 为**浮起状态卡**（完整发丝边 + 横向内缩，修为/道基/灵石读作同一
   个修行状态组件的三个读数），「眼下要务」为**内嵌下沉面板**（`--paper-sunk` + 发丝边）。
   四行动落在一条下沉托盘上，读作一个操作组。
2. **紧凑身份**：境界序改为**暗金描边 chip**，不再是散落的一行文字；寿元改为**圆角进度
   槽**（track 裁剪 + 圆角），不再是纯数字。
3. **消掉中部空场**：靠**响应式分配**，不是靠滚动。高屏断点（≥750 / ≥820）把回收的高度
   还给内容本身（节奏 token 上调），所以面板自己填满可用高度。六视口剩余柔性高度由
   136–145px 收敛到 **18.6–26.0px**（≤ 视口高度 5%），且首屏预算仍全部达标。
4. **新增高度全部走同一个 token 集合**：所有新增高度都由 `tools/ui02r1-layout-audit.mjs`
   求和的既有 token 表达，因此审计出来的预算仍然是**真值**而不是近似值；触控下限、
   安全区、视口矩阵、20rpx 字号下限均未动，也**没有新增 media 断点**。
5. **装饰是确定性的**：每行要务前置一个 10rpx 暗金方点，纯几何装饰，与任何投影值无关，
   不暗示隐藏玩法状态（`tests/ui02r2a2.test.mjs` 钉死其无绑定/无指令/无 data-*）。

自动结构验证见 `tests/ui02r2a2.test.mjs`（15 项）与 6.1；**视觉是否好看仍必须由人验收**。

### 5.5 UI02ENTRY —— 开局前流程视觉切片（纯呈现）

UI02ENTRY 把 UI02R2A2 已人工验收的视觉系统**扩展**到开局前流程，仍然**纯 presentation**：
不动一屏合同、不动内景四屏、不动视口矩阵、不动交互下限，也不开始 UI03 生产接线。

**四个屏幕的定位**

- **START（启程）**：一屏身份面。主按钮只有**一个**；次要信息保持克制；**留白是设计的一部分**。
  文案不是新写的：产品名用 `docs/UI02_PREVIEW.md` 已有的「天符」，
  定位句与核心句**逐字**取自 `docs/PROJECT-BRAIN.md`。
- **MODE_SELECT（模式）**：只列**合同已有**的模式/能力入口——`正式修行`（合同主线流程，恒可用）
  加三个能力入口 `今日命局` / `商行` / `分享此命`。**没有新玩法模式**：
  可用性**只读**已验收 `buildWeChatPageShell` 的 `visibleEntries`，
  缺能力的入口**明确置灰并标注缺失的能力名**（合同允许「隐藏或安全降级」，这里选择可读的降级）。
- **DESTINY_OFFER（择命）**：一屏高级选择面。候选是**真实服务端公开投影**
  （灵根 / 天赋 / 天命 三项 displayName + 序号 + 择定 chip），单行省略、逐项可比。
  **没有默认选中**：点选只是 UI 高亮，确认只记录「本应提交 `START_RUN`」，预览**不发送、不结算、不排序**。
- **RUN_OPENING（入世）**：一屏过渡/摘要。只呈现**已公开**的：已选灵根/天赋/天命（由
  `projectDestinyOfferView` 解析出的公开字段）、此生名、寿元、四维公开属性。
  底部**一个**入世入口 → RUN_HOME。**不启动 Run、不改任何状态**。

**与内景一致的地方**（`tests/ui02entry.test.mjs` 钉死）

- 每屏的主控件 `.entry-cta` 与突破 CTA 同款处理（实心墨底 + 纸色文字 + `--radius-card`），
  交互下限恒 `>= 104rpx`（320 宽即 44.37 CSS px）。
- 列表行读作 chip，候选卡是浮起比较面；选中态靠**下沉填充 + 加强描边**表达，不只靠颜色。
- 入口节奏新增的 `--entry-*` token **只声明一次**（不新增 media 断点），
  且首屏预算由 `tools/ui02r1-layout-audit.mjs` 从这些 token **重新求和**（见 6.1 打印的
  `pre-run first-screen budget` 表）：320×500 最紧的 DESTINY_OFFER 为 351.6px + 34px 安全区，
  仍有 114.4px 余量。
- 入口文字**没有低于 20rpx**，长公开字符串一律单行省略。

**UI02ENTRY 明确没做的事**

- 不发送任何命令（没有 `wx.request`，没有 `ApplicationTransport` / `CommandGateway` 接线）。
- 不实现 `START_RUN` 结算、不做客户端命格/RNG/权重推演、不做客户端 eligibility。
- 不新增页面、不改 `app.json`、不改默认路由（首页仍是 `pages/start/start`）、不碰 1.0 页面。
- 不碰 `server` / `packages/core` / `packages/content` / `packages/wechat-shell` / `packages/application-ui`。

### 5.6 UI02COPY —— 玩家可见文案 / 原始 key 清理（纯呈现）

人工验收 UI02ENTRY 时发现：版式与视觉系统是连贯的，但**同一批预览屏里仍有开发者标识在漏给玩家**。
UI02COPY 是最终合入前的**最后一次纯文案清理**，仍不动玩法规则、服务端投影、Core/Content 源码、路由
与布局合同。它只解决两件事：

**（1）原始内容 key。** 被验收的内容包把 `titleKey` / `bodyKey` / `labelKey` / `summaryKey` 一律存成
不透明字符串，仓库里没有任何文案表，于是页面把 `dev.first-choice.title`、`dev.first-choice.body`、
`dev.first-choice.continue`、`build.fact.BUILD_STAGE_TRANSITION.summary` 原样打在屏上。
页面新增一张**有界**的中文呈现目录 `CONTENT_COPY`：

| 屏幕 | 走目录的字段 |
| --- | --- |
| EVENT / SPECIAL_NODE | 场景标题、正文、**每一个**选项标签 |
| LIFE_ARCHIVE | 已公开往事的标题与摘要（历史 / 道途转进） |

规则（`tests/ui02copy.test.mjs` 钉死）：

1. **有界**：目录的 key 集合 == 当前夹具真正触达的叙事 key 集合（测试从夹具自己推导）。少一条
   ——屏上会漏原始 key；多一条——等于给不存在的内容编文案。两个方向都判失败。
2. **未知 key 原样回退**（沿用 `presentLabel` 语义）：未来内容包出现新 key 时，屏上显示**原始 key**
   （明显的缺陷），而不是悄悄继承一条错文案或自造玩法含义。
3. **不编造**：文案只描述 key 自己已经表达的意思（`continue` → 就此前行，`rescue-stranger` →
   出手相救，`study-sword` → 参研剑术，救人之因的回响 → 昔日相救）。不含奖励、收益、概率、成功率、
   权重，也不含任何新的人名 / 地名 / 门派等设定，也不含任何 per-run 夹具值。
4. **不动投影**：option id、`riskPresentation`（tier / canBeFatal / reasons）、提交与锁定语义、
   `history` 公开数据、布局 / 安全区 / 滚动归属 / 视口矩阵全部不变。

**（2）内部 capability 名。** MODE_SELECT 的不可用行原本把
`DailyChallengeCapability` / `CommerceCapability` 直接写进 helper 文案。现在：

- 屏上渲染**面向玩家**的 `gateLabel`（`暂未开放`）；
- 命名能力名的内部诊断保留在 `gateNote` 上（`tests/ui02entry.test.mjs` 用它断言"置灰条目要归属到
  正确的能力"），但**标记里不再绑定它**——`tests/ui02copy.test.mjs` 从标记里核对
  `gateNote` 出现次数为 0，所以它无法再漏回屏上。

**（3）无原始 key 的视觉守卫。** `tests/ui02copy.test.mjs` 的守卫**从提交的 WXML 推导**要检查的绑定
（解析 `{{ }}`，剔除属性绑定与比较操作数，按 `wx:for` 展开 `item.*`），再对**每一个**夹具页解析真实
`present()` 输出，断言：没有任何渲染字符串是点分内容 key 或 Capability 枚举名。因为绑定来自标记本身，
新增或改名绑定不会让守卫失效；负向对照证明它不空转（还原原始 key / 还原 `gateNote` / 清空目录都必须
被抓到）。

**UI02COPY 明确没做的事**

- 不改任何玩法规则、`server` 投影语义、`packages/core`、`packages/content`、`packages/wechat-shell`。
- 不改路由、不改默认页、不碰 1.0 页面、不开始 UI03 生产接线。
- 不动 UI02R2A2 / UI02ENTRY 的一屏、安全区、视口矩阵、触控下限、WXSS 令牌与滚动归属合同。
- 不写进内容包（`CONTENT_COPY` 是页面里的**呈现**目录；内容包仍是内容的事实源）。

## 六、自动验证与人工视觉验收（务必区分）

### 6.1 自动结构验证（已执行）

```bash
node tools/ui02r1-layout-audit.mjs          # 143 项结构检查 + 内景/入口流程两套首屏预算表
node tools/wxss-compat-audit.mjs            # WXSS 语法子集检查（含通配选择器与 border-box）
node tools/ui02-preview-fixture-module.mjs  # fixture JS 模块 / JSON 是否最新 + require 字面量合同
node --test tests/ui02entry.test.mjs        # UI02ENTRY 专项（入口流程 + 公开边界 + 负向对照）
node --test tests/ui02copy.test.mjs         # UI02COPY 专项（有界文案目录 + 无原始 key 视觉守卫 + 负向对照）
node --test tests/ui02r1.test.mjs           # UI02R1 专项（含两个审计与 fixture 一致性的负向对照）
node --test tests/ui02r2.test.mjs           # UI02R2 专项（呈现层标签表 + 视觉打磨结构断言）
node --test tests/ui02r2a2.test.mjs         # UI02R2A2 专项（RUN_HOME 重组 + 死区上限 + 负向对照）
node --test tests/ui02.test.mjs             # UI02 视觉语言 / fixture / A12 边界
node --test tests/viewmodel-ui.test.mjs     # A12 安全边界（必须保持全绿）
npx tsc --noEmit
node tools/check-import-boundaries.mjs
node tools/content-lint.mjs packages/content/dev-fixtures/minimal-pack.json
node tools/content01-lint.mjs
node tools/scan-secrets.mjs
```

审计会打印每个矩阵视口的首屏预算（栈高 + 安全区 vs 视口高）：
内景表（RUN_HOME 最坏情况）与 **UI02ENTRY 入口表**（每个开局前屏幕的最坏情况）各一份。
它**只证明结构合同**：容器约束、滚动归属、四行动与 CTA 的存在性、入口四屏的存在性与一屏预算、
触控目标下限、安全区写法、旧 1.0 / server / Core / Content 逐字节未变。

> **UI02ENTRY / UI02COPY 迭代期间的验证范围（由任务定义）：只跑上面这份 UI fast-lane targeted 列表，
> 不在视觉迭代期跑完整 `npm test` 回归。** 完整回归推迟到人工视觉验收通过之后、最终合并之前
> 统一跑一次（见 `LAST_RESULT` 的显式记录）。

### 6.2 仍然必须由人做的视觉验收（未执行）

自动测试**不能**替代真机或开发者工具的肉眼验收。请在微信开发者工具中完成：

0. **首先确认编译通过，且预览页进入了产品界面而不是失败面板。**
   预览现在默认停在 `启程`（START）。UI02R1 曾出现过三次加载
   问题：`v2-preview.wxss` 因通配选择器 `*` 编译失败（`unexpected token '*'`）；
   页面因 `require` 一个 `.json` 模块而显示"缺少 v2-fixtures.json"；
   以及加载点写成 `require(FIXTURE_MODULE_SPECIFIER)` 变量形式，
   打包器无法建立依赖，运行时 `module '<path>' is not defined`。三者都已修复。
   若出现任何 WXSS 语法错误，或看到失败面板（阶段 / 代码 / 详情 / 模块 / 提示），
   请把它当成返修项提回，而不是绕过——失败面板是**故意**显示这些信息的，
   它就是给返修用的。
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

**UI02ENTRY 追加的开局前流程清单：**

9. **四屏一屏化**：`启程` / `模式` / `择命` / `入世` 逐个切换，确认
   **页面都不能纵向滑动**（手势下拉没有页面位移），底部主按钮都在首屏内、不被 Home Indicator 遮挡。
10. **视觉同源**：把 `启程` 与 `修行主页` 放在一起看，确认它们**像同一个产品**：
    同一套宣纸/墨/朱砂/极少暗金、同一套主按钮处理、同一套卡片圆角与间距节奏；
    `启程` **不能**像 1.0 那种黑底霓虹仪表盘。
11. **START**：主入口是否**一眼只有一个**；核心句与次要信息是否克制；留白是否读作设计而不是空。
12. **MODE_SELECT**：`正式修行` 是否是唯一可用主入口；`今日命局` / `商行` / `分享此命`
    的置灰与「暂未开放」是否清楚可读、且不误导为可用；屏上**不应**再出现
    `DailyChallengeCapability` 之类的内部能力名。
13. **DESTINY_OFFER**：三个候选的灵根/天赋/天命是否**逐行可比**、层级清楚；
    初始是否**没有任何**预选；点一项后选中态是否明显（下沉填充 + 加强描边）；
    四个候选外不应出现任何权重、概率、成功率之类信息。
14. **RUN_OPENING**：是否只显示已选灵根/天赋/天命 + 此生名/寿元/四维；
    底部入世入口是否唯一且明显；确认没有出现任何结算、死亡、终局痕迹。
15. **流程可走**：在页面内点 `启程` 主按钮 → `模式` → `择命`，确认切屏后 dev overlay 收起、
    一屏效果可直接观察；打开 dev overlay 确认「最近意图」写的是**预览导航（未提交命令）**。
16. **回归**：切回 `修行主页` / `事件` / `特殊节点` / `命书`，确认与 UI02R2A2 验收时**一致**，
    没有被入口流程改动带偏（四行动位置、突破 CTA 主次、抽屉行为、命书滚动）。

**UI02COPY 追加的文案清单：**

17. **`事件` / `特殊节点`**：场景标题与正文是否为可读中文；五个（`特殊节点` 一个）选项标签是否
    逐个可读、语义互不重复、且与右侧风险档位不矛盾；**不应**再出现
    `dev.first-choice.title` / `dev.first-choice.body` / `dev.first-choice.continue` 这类点分 key。
    确认风险档位（低险/危险）、`争斗之险 · 身负伤患` 与「此选项可能致命」的呈现与改动前一致。
18. **`命书`**：已公开往事的标题与摘要是否为可读中文（含「道途转进」一条）；**不应**再出现
    `dev.first-choice.history` / `build.fact.BUILD_STAGE_TRANSITION.summary` 这类点分 key。
    确认只读、可滚动、终局与相识之人两段未被改动。
19. **整体**：`启程` / `模式` / `择命` / `入世` / `修行主页` 五屏逐个扫一遍，确认没有任何
    英文枚举名、点分 key 或 `xxxCapability` 残留在**玩家可见**的正文与标签里；
    若出现未知 key 原样显示，那是 `CONTENT_COPY` 有界目录的**预期**回退行为（提回即可，不要绕过）。

任何一项不通过，都属于 UI02ENTRY / UI02COPY 的返修范围，而不是 UI03。

## 七、明确尚未完成（生产接线）

以下是**有意留白**，不属于 UI02 / UI02R1 / UI02ENTRY 范围：

1. **生产传输未接线。** 预览没有 `wx.request`，也没有连接
   `ApplicationTransport` / `CommandGateway`。点击行动只会记录「本应提交的命令形状」。
2. **命令未提交、未落库。** `CommandSubmissionController` 的 pending / retry /
   reconfirmation 语义已在 A12 实现并有测试覆盖，但预览页尚未把它接上真实网关。
3. **无真实登录、无真实存档。** 预览使用固定 `playerId` / `runId` 的公开夹具。
4. **不是玩法实现。** 突破仍由 `ATTEMPT_BREAKTHROUGH` 这一服务端权威命令决定；
   预览只能读取服务端投影的「可否突破」，不计算成功率、不改动 RNG、不持有第二套 Core。
5. **SPECIAL_NODE 未覆盖战斗。** 只呈现通用容器与交互边界。
6. **事件选项仍是只读呈现。** 选项提交属于 UI03 的 live-session 接线。
7. **开局前流程也只是呈现（UI02ENTRY）。** `启程` / `模式` / `择命` / `入世` 的主按钮
   只做**预览内导航**（`show()` 换一个已生成的投影），既不提交命令也不跳转生产路由。
   `择命` 的确认只记录「本应提交 `START_RUN`」；真正的 `START_RUN` 提交、开局结果与
   从服务端 `offered` 状态进入 `RUN_OPENING` 的 live 流程，都属于 UI03。

把以上接起来属于 UI03 及后续任务。UI02R1 / UI02ENTRY 的产出是**可验证的一屏信息架构、
响应式与安全区合同，以及从开局到入世的一致视觉系统**，UI03 不负责补救基础布局。
