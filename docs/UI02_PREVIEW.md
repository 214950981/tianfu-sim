# UI02 — 天符 2.0 内景预览（开发者路由）

本文件说明 UI02 新增的**开发预览路由**：如何在微信开发者工具中打开它、它渲染哪些状态、
数据从哪来，以及哪些事情**明确尚未完成**。

> 这是 UI02 的高保真可视化切片（RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE），
> 不是生产默认页，也不是新一轮玩法调参。

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
4. 进入后页面顶部有开发切换条，可在六个视图间切换：
   - `修行主页` — RUN_HOME
   - `事件` — EVENT
   - `特殊节点` — SPECIAL_NODE
   - `命书` — LIFE_ARCHIVE
   - `突破未成·变体` — RUN_HOME，突破入口存在但服务端投影为不可用
   - `能力缺省·变体` — RUN_HOME，平台/商业/分享能力全部关闭

也可以直接在开发者工具控制台执行：

```js
wx.navigateTo({ url: "/pages/v2-preview/v2-preview" });
```

## 三、数据从哪来（关键）

预览页**不自造任何玩法规则**。页面渲染的每个数值都来自
`miniprogram/pages/v2-preview/v2-fixtures.json`，而该文件由真实代码生成：

```bash
node tools/ui02-preview-fixtures.mjs          # 打印摘要
node tools/ui02-preview-fixtures.mjs --write  # 重新生成 fixture
```

生成链路全部是生产同款代码：

| 环节 | 真实代码 |
| --- | --- |
| 造局（命格候选） | `server/src/destiny-offer.ts` → `generateServerDestinyOffer` |
| 开局 | `packages/core/src/reducer.ts` → `reduce(... START_RUN ...)` |
| 公开投影 | `server/src/viewmodel.ts` → `ServerViewModelBuilder.build` |
| 页面壳 / 能力入口 | `packages/wechat-shell/src/index.ts` → `buildWeChatPageShell` |
| 意图映射 | `miniprogram` → `mapCoreActionIntents` / `mapSpecialActionIntents` |
| 命书投影 | `buildArchiveView` |

`tests/ui02.test.mjs` 会**重新生成**一份 fixture 并与已提交文件逐字段比对，
因此 fixture 一旦被手工篡改或与真实代码脱节，测试立即失败。

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

## 四、视觉语言

冻结语言：**宣纸 + 墨 + 朱砂 + 极少暗金 + 大量留白 + 克制动画**。
UI02 负责 HEX、字号、间距、圆角与组件尺寸，token 定义在
`miniprogram/pages/v2-preview/v2-preview.wxss` 顶部的 `page` 块：

- 宣纸 `--paper #F5F1E8` / `--paper-sunk` / `--paper-raised`
- 墨 `--ink #1C1A17` / `--ink-soft` / `--ink-muted` / `--ink-faint`
- 朱砂 `--cinnabar #A8342A` / `--cinnabar-soft`
- 暗金 `--gold #8A6B2F` / `--gold-soft`（仅用于细分隔线与突破入口一处强调）

页面内**不含**任何 1.0 霓虹仪表盘取值（`#FFD700`、`#050508`、`#55ff55`、`#55ccff`、
`#dd55ff`、发光 `text-shadow`、`box-shadow`）。测试会扫描并阻止回流。

## 五、明确尚未完成（生产接线）

以下是**有意留白**，不属于 UI02 范围：

1. **生产传输未接线。** 预览没有 `wx.request`，也没有连接
   `ApplicationTransport` / `CommandGateway`。点击行动只会记录「本应提交的命令形状」。
2. **命令未提交、未落库。** `CommandSubmissionController` 的 pending / retry /
   reconfirmation 语义已在 A12 实现并有测试覆盖，但预览页尚未把它接上真实网关。
3. **无真实登录、无真实存档。** 预览使用固定 `playerId` / `runId` 的公开夹具。
4. **不是玩法实现。** 突破仍由 `ATTEMPT_BREAKTHROUGH` 这一服务端权威命令决定；
   预览只能读取服务端投影的「可否突破」，不计算成功率、不改动 RNG、不持有第二套 Core。
5. **SPECIAL_NODE 未覆盖战斗。** 只呈现通用容器与交互边界。

把以上接起来属于 UI03 及后续任务。UI02 的产出是**视觉语言、公开投影契约的接线方式
与可验证的意图映射**。

## 六、验证

```bash
node --test tests/ui02.test.mjs          # UI02 专项
node --test tests/viewmodel-ui.test.mjs  # A12 安全边界（必须保持全绿）
npx tsc --noEmit
node tools/check-import-boundaries.mjs
node tools/content-lint.mjs packages/content/dev-fixtures/minimal-pack.json
node tools/scan-secrets.mjs
```
