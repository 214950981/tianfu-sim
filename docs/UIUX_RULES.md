# Tianfu-sim 2.0 UI01 Final Contract v1

## UI 总原则

UI 只呈现玩家有资格知道的信息与可提交的意图；服务器始终决定规则结果。体验以清晰选择、因果可追踪、渐进披露、可恢复提交为核心。客户端不推演规则、不持有第二套权威 Core，也不从隐藏数据反推风险。

## 页面地图

主流程为 `START → MODE_SELECT → DESTINY_OFFER → RUN_OPENING → RUN_HOME`。`RUN_HOME` 是一生中的主 Home；命书 `LIFE_ARCHIVE` 是其侧页。普通决策进入 `EVENT`，突破等结构化流程进入 `SPECIAL_NODE`。终局固定为 `ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE`。

## 主修行页

`RUN_HOME` 是高频操作页，不是纵向资料页。支持的常见手机竖屏视口内，玩家无需上下滚动即可看到核心状态与四个核心行动：闭关、游历、入世、追索；服务端公开为可用的突破入口也必须首屏可达。主页只保留最值得立即注意的公开摘要，完整 Build、Cause、人物与历史详情下沉到只读二级视图或命书。行动按钮只提交意图；资源、时间、事件和结果均以服务端新 ViewModel 为准。

## 事件页

事件使用整屏决策模型，集中展示公开情境、选项、服务端生成的 `riskPresentation` 与提交状态。页面本身不应变成长文档式纵向滚动；当文本或选项超过可用空间时，只允许在受控内容区内部滚动，并保持决策选项可达。进入待选择事件后，不允许普通返回绕过选择。客户端不得读取 `difficulty`、完整 `CheckSpec` 或 RNG 自行计算胜率。

## 命书

`LIFE_ARCHIVE` 是 `RUN_HOME` 的只读侧页，聚合已公开历史、明确或暗示的 Cause、人物与发现。它是允许纵向滚动的资料页。隐藏 Cause 不生成占位、数量提示或可推断信息。

## 特殊节点

`SPECIAL_NODE` 是突破、战斗等特殊交互的通用容器，只统一页面状态、提交、重试、恢复和安全投影，不在 UI01 冻结具体玩法或完整战斗系统。

## 终局 / 此生仙录 / 轮回

终局链路不可跳序：`ENDING → LIFE_BOOK → REBIRTH_RESULT → NEXT_LIFE`。此生仙录只使用真实公开事实，不虚构人物或 Cause 补足篇幅。轮回结果展示服务端确认的 Meta 变化；下一世重新进入受控开局流程。

## ViewModel 安全边界

客户端业务 ViewModel 是服务端受控的公开投影，只允许 project、filter、format、aggregate、translate。禁止下发 rootSeed、RNG 状态、drawIndex、隐藏 Cause、salience、echoBudget、eligibility、selector 权重、futureEventIds、NPC 隐藏状态、未公开死亡/失踪、完整 CheckSpec、difficulty、EffectSpec、internal trace 与反作弊字段。`commandId` 可由 Application/Transport 创建、持久化并复用于幂等重试，但不向玩家展示。

## Pending / Retry / Recovery

交互状态为 `idle | submitting | confirmed | retryableError | fatalError`。`submitting` 锁定互斥操作；可重试错误必须复用同一 `commandId`。重开小程序后恢复服务端原事件或查询原命令结果，不重新抽事件、不本地补算。`STATE_CONFLICT` 先刷新最新 ViewModel，再要求玩家重新确认。

## capability-aware UI

入口由服务端/平台能力组合控制，缺失能力时自然隐藏或降级，不显示不可完成的操作。能力名包括 `DailyChallengeCapability`、`AdCapability`、`CommerceCapability`、`ShareCapability`、`PlatformCapability`；业务 Core 与通用 ViewModel 不得引用 `wx.xxx` 或 `tt.xxx`。

## 每日命局的 UI 体验边界

UI01 仅冻结：今日命局入口、初赴此命、再赴此命、正式榜、我的排名、首世公平、再世不改首世正式榜。正式挑战未实现时 `DailyChallengeCapability=false`，入口隐藏。ChallengeContext、challengeSeed、rollover、scoringProfile、排行榜存储、反作弊和服务端挑战结果均属于 CHAL01。

## 商业化 UI 原则

不卖胜利，卖新的可能性。禁止永久战力购买、购买突破概率、广告复活、修改已落定选择、修改 RNG、正式挑战首世付费/广告信息优势及排行榜付费优势。当前唯一允许预留的有限额外体验是 `dailyChallengeSecondLife`，实现归 CHAL01 与后续 AdCapability。

## 广告 / Commerce / Share 原则

广告、支付和分享只能通过 `AdCapability`、`CommerceCapability`、`ShareCapability` 与 `PlatformCapability` 暴露；能力不可用时隐藏入口。分享 ViewModel 只含公开、可分享信息；广告或支付回执不得直接成为规则结果。

## 微信 / 抖音跨平台边界

平台差异由 PlatformAdapter/Capability 层吸收。微信与抖音可有不同登录、分享、广告与支付能力，但不得改变同一规则输入的权威结果。业务 Core、Content 和平台中立 ViewModel 禁止导入平台 SDK。

## 视觉语言

冻结设计语言：宣纸、墨、朱砂、极少暗金、大量留白、克制动画。不冻结 HEX 色值、字号、间距、圆角、组件尺寸或高保真稿；这些由 UI02 决定。

### 响应式与安全区原则

- 产品布局按竖屏手机优先，不依赖某个具体 iPhone / Android 型号名称，而按实际内容视口尺寸适配。
- RUN_HOME / EVENT / SPECIAL_NODE 使用受约束的全屏容器，不能靠页面自然变长解决信息过载。
- Home Indicator / 安全区不得覆盖行动按钮、突破按钮或事件选项。
- 开发预览工具条属于调试层，默认收起或悬浮覆盖，不计入产品页面高度。
- 长名称、长 labelKey、较多公开 Cause / 人物 / Build 不能把核心操作挤出首屏；摘要需要截断、折叠或下沉到二级只读视图。
- LIFE_ARCHIVE 允许滚动；其他核心玩法页若内容过长，只允许局部受控滚动。

## 职责切分

- A12：微信 ViewModel 合同实现、服务端投影、页面状态接线、提交/Pending/Retry、平台中立合同连接、最小微信页面壳。
- UI02–UI04：具体视觉规格、高保真稿、组件细节与后续体验迭代。
- CHAL01：每日命局服务端上下文、seed、轮换、计分、榜单、反作弊与结果。
- COMPLY01：封测前平台合规、内容安全、隐私与自由输入审查。

A12 不得实现排行榜后端、CHAL01、完整战斗、UI02–UI04、新商业模式、重新解释 Cause 或下发服务器秘密。
