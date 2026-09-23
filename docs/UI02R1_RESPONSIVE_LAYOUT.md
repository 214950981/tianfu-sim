# UI02R1 — 一屏化与响应式布局合同

## 1. 返修原因
UI02 的视觉语言与服务端投影边界已通过，但当前预览把境界、寿元、资源、条件、Cause、Build、人物、四行动、突破与能力入口按 section 纵向铺开，导致 RUN_HOME 在常见手机上需要页面级下滑。开发工具条额外占高，但不是根因。UI02R1 只修 UI 信息层级、响应式与安全区，不改玩法规则。

## 2. 产品滚动政策
### RUN_HOME
- 页面级纵向滚动禁止。
- 核心状态与四个核心行动首屏可见。
- 突破仅在 server public projection 显示 available=true 时出现主要 CTA，并首屏可达；available=false 不占大块主操作空间。
- Build / Cause / 人物主页仅展示紧凑摘要；完整公开详情进入只读二级 overlay / side view。

### EVENT / SPECIAL_NODE
- 页面级纵向滚动禁止。
- 场景正文过长时只允许正文区域内部滚动。
- 选项较多时选项区域可以受控内部滚动，但决策区不能被正文推到页面外。
- unresolved 状态不能通过普通返回逃离。
- debug 的 decisionId、状态解释、测试返回按钮不得占产品布局空间，应移入 dev overlay。

### LIFE_ARCHIVE
- 允许纵向滚动。
- 使用受控 scroll-view / archive viewport，不依赖整个 page 自然增高。

## 3. 支持基线与视口矩阵
以微信小程序内容视口而不是设备营销型号为准。基线是竖屏、windowWidth >= 320 CSS px、windowHeight >= 500 CSS px。

| Class | Width × Height | 目的 |
| --- | --- | --- |
| compact-xs | 320 × 500 | 小屏 / 较矮内容区压力测试 |
| compact | 360 × 560 | 常见小屏 Android 压力测试 |
| classic | 375 × 603 | 传统 4.7 英寸级内容区近似 |
| modern | 390 × 750 | 现代窄长屏 |
| large | 414 × 820 | 大屏手机 |
| large-tall | 430 × 850 | 大尺寸高屏 |

小于 320×500 或横屏不作为本次像素级保证范围，但不得崩溃、重叠或产生不可恢复操作。

## 4. RUN_HOME 信息优先级
从上到下只保留四层：
1. 身份与寿元：当前境界、此生名称、年龄 / maxAge、寿元压力。
2. 修行核心状态：修为、道基、灵石，以紧凑横向或进度方式呈现。
3. 此刻值得关注：最多呈现 2–3 个摘要槽位，例如主修 Build、一个公开 Cause 摘要、一个重要相识人物。更多公开详情进入二级只读 overlay。
4. 行动区：突破（仅 available=true 时） + 四行动 2×2，位于视觉和触控底部。

能力入口、debug 数据、lastIntent、全部 Cause/人物/Build 列表不得常驻 RUN_HOME 产品首屏。

## 5. 布局技术原则
- 产品根容器使用受约束 viewport 高度并采用 border-box；不得用 content-driven min-height 把页面自然撑长。
- 根 page / gameplay screen 阻止页面级 overflow；可滚区域必须显式标识。
- 主体使用 flex/grid，并对可压缩区设置 min-height: 0，避免 flex child 把父容器撑爆。
- 底部行动区不可被 Home Indicator / safe-area 覆盖。
- 开发预览 tabs 默认不占文档流高度，优先做为收起的悬浮 dev trigger + overlay panel。
- 核心触控目标最小高度按约 44 CSS px 设计；小屏也不得把四行动缩成难以点击的小字块。
- 不依赖绝对定位堆叠核心内容。
- 不把固定像素高度写死给正文文本块；摘要可 clamp，正文只能局部 scroll。
- 使用 rpx 处理横向尺度，使用 viewport / flex / safe-area 管理纵向空间。
- 默认微信原生 navigation bar 仍存在，不自行重复计算状态栏高度。

## 6. 动态内容压力
必须考虑长 runName / realm displayName、长 raw labelKey、0/1/多个公开 Cause、0/1/多个 Build、0/1/多个已知人物、无 condition/多 condition、breakthrough available/unavailable、capability 全开/全关、EVENT 短正文/长正文、1/2/3+ options、lethal risk badge 与较长 reasons。

主页处理原则是“摘要 + 更多”，不是把所有动态数组完整摊开。

## 7. 稳定性与可用性检查
- 不允许横向溢出。
- 不允许核心按钮被裁切。
- 不允许 safe-area 覆盖。
- 不允许 debug chrome 改变产品区实际高度。
- disabled action 仍占稳定格位，避免布局跳动。
- 突破 CTA 出现/消失时不能造成整页重排到需要滚动。
- 关键文字与按钮不能为了“一屏”被压到难读。
- LIFE_ARCHIVE 的滚动不影响 RUN_HOME 的 one-screen 要求。

## 8. 验收方式
自动测试只能证明结构合同，不能假装等价于真机视觉验收。自动部分必须覆盖 page-level overflow policy、dev chrome 脱离产品文档流、四行动固定数量与 action dock 结构、available breakthrough CTA 条件、archive/event 内部 scroll 容器、safe-area 样式、旧 1.0 页面与 server/Core/Content gameplay 无改动。

WorkBuddy 在 LAST_RESULT 中必须明确区分自动验证、结构性推断和仍需用户在微信开发者工具肉眼验收的项目。不得把“测试通过”写成“所有手机视觉已实测通过”。

## 9. 后续
UI02R1 PASS + 人工视觉确认后，再执行 UI03 live-session controller 接线。UI03 不负责补救基础布局。
