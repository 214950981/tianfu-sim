# PLAYFEEL01 事件审计（66 场全表）

生成方式：`node tools/playfeel01-event-audit.mjs --write`，直接读取真实 CONTENT01_PACK，非抽样。
事件总数：**66**（其中本任务施工目标 20 场標記为 `★20`）。

## 汇总

| 指标 | 数量 |
| --- | --- |
| 事件总数 | 66 |
| 全部选项仅时间差的事件 | 3 |
| 含纯时间选项的事件 | 12 |
| 含发放灵石选项的事件 | 13 |
| 含修为收益选项的事件 | 60 |
| 已有授权结算文案键（`.resolution`）的事件 | 2 |
| 含持久后果（NPC/关系/因果/道途）选项的事件 | 41 |
| 风险事件（带 threatId） | 14 |

## 全表

| | eventId | 标题 | 动作池 | 选项数 | 风险 | 纯时间 | 灵石 | 修为 | 持久后果 | 已有结算文案 | 硬伤 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ★20 | `content01.onboarding.first-breath` | 初息 | cultivate | 3 |  |  |  | 是 |  |  | 无授权结算文案键 |
| ★20 | `content01.onboarding.mountain-road` | 山路 | travel | 3 |  | 部分 |  | 是 |  |  | 存在纯时间选项；无授权结算文案键 |
| ★20 | `content01.onboarding.market-choice` | 早市 | worldly | 3 |  | 部分 | 是 |  |  |  | 存在纯时间选项；发放灵石（需场景内来源）；无授权结算文案键 |
| ★20 | `content01.onboarding.old-trace` | 旧痕 | pursuit | 3 |  | 全部 |  |  |  | 是 | 全部选项仅时间差；存在纯时间选项 |
|  | `content01.onboarding.rain-shelter` | 避雨 | travel/worldly | 3 |  | 全部 |  |  |  |  | 全部选项仅时间差；存在纯时间选项；无授权结算文案键 |
| ★20 | `content01.onboarding.quiet-retreat` | 静室 | cultivate | 3 |  |  |  | 是 |  |  | 无授权结算文案键 |
| ★20 | `content01.onboarding.roadside-injury` | 路边伤者 | worldly | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.onboarding.forked-path` | 岔路 | pursuit | 3 |  | 全部 |  |  |  | 是 | 全部选项仅时间差；存在纯时间选项 |
| ★20 | `content01.ordinary.tea-house` | 半盏茶 | - | 2 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.ferry-wait` | 候渡 | - | 2 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.missed-letter` | 迟信 | - | 2 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.broken-bridge` | 断桥 | - | 2 |  |  |  | 是 |  |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.night-rain` | 夜雨 | - | 3 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.roadside-debate` | 道旁争言 | - | 2 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
| ★20 | `content01.ordinary.empty-search` | 空寻 | - | 2 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.shared-fire` | 同火 | - | 2 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
| ★20 | `content01.ordinary.market-bargain` | 小交易 | - | 2 |  |  | 是 |  | 是 |  | 发放灵石（需场景内来源）；无授权结算文案键 |
| ★20 | `content01.ordinary.mountain-view` | 山色 | - | 2 |  | 部分 |  | 是 |  |  | 存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.ordinary.harvest-help` | 收谷 | - | 2 |  |  |  |  | 是 |  | 无授权结算文案键 |
| ★20 | `content01.ordinary.old-song` | 旧曲 | - | 2 |  |  |  | 是 |  |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
| ★20 | `content01.pei.broken-blade` | 断剑客 | travel/worldly | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.pei.sparring-rain` | 雨中试剑 | cultivate/pursuit | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.pei.old-wound` | 旧伤复作 | travel | 3 | 是 |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.pei.promise-echo` | 剑约未冷 | - | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.jiang.herb-price` | 药有其价 | worldly | 2 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.jiang.night-clinic` | 夜诊 | worldly/cultivate | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.jiang.bitter-decoction` | 苦汤 | cultivate | 3 | 是 |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.jiang.debt-echo` | 旧账新页 | - | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.cen.shoulder-road` | 并肩负伤 | travel/worldly | 2 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.cen.stone-steps` | 负石登阶 | cultivate | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.cen.shield-stranger` | 以身护人 | travel | 3 | 是 |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.cen.shared-echo` | 伤痕相认 | - | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.xie.secret-map` | 半张秘图 | pursuit/travel | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.xie.cave-gamble` | 洞口风声 | pursuit | 3 | 是 |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.xie.divided-spoils` | 分利 | worldly | 3 |  |  | 是 | 是 | 是 |  | 发放灵石（需场景内来源）；无授权结算文案键 |
|  | `content01.xie.map-echo` | 图上旧折 | - | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.xu.mortal-letter` | 人间来信 | worldly/pursuit | 2 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.xu.ten-year-return` | 十年重逢 | worldly | 3 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.xu.empty-courtyard` | 空院 | pursuit | 3 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.xu.promise-echo` | 树下旧诺 | - | 3 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
| ★20 | `content01.build.sword.river-cut` | 截流一剑 | cultivate/travel | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.sword.no-draw` | 剑未出鞘 | worldly | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.sword.guard-caravan` | 护行 | travel | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.body.boulder` | 移石 | cultivate | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.body.cold-water` | 寒潭 | cultivate | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.body.carry-wounded` | 背人下山 | travel/worldly | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.build.alchemy.herb-sort` | 辨草 | cultivate/pursuit | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.alchemy.fever` | 退热 | worldly | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.alchemy.failed-brew` | 废炉 | cultivate | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.fortune.fork` | 偏僻岔路 | travel/pursuit | 3 |  | 部分 |  | 是 | 是 |  | 存在纯时间选项；无授权结算文案键 |
|  | `content01.build.fortune.hidden-stream` | 石下清泉 | pursuit | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
|  | `content01.build.fortune.empty-hand` | 空手而归 | cultivate/pursuit | 3 |  |  |  | 是 | 是 |  | 无授权结算文案键 |
| ★20 | `content01.risk.pine-ambush` | 松林伏影 | travel | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
| ★20 | `content01.risk.ruin-depth` | 遗迹深处 | pursuit | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.poison-mist` | 青雾 | travel | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.curse-stone` | 无字碑 | pursuit | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.critical-crossing` | 负伤渡河 | travel | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.revenge-shadow` | 旧怨追来 | pursuit/worldly | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.falling-star` | 坠星 | travel/pursuit | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.beast-trail` | 兽迹 | travel | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.flood-cave` | 涨水洞 | pursuit | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.risk.broken-seal` | 残封 | cultivate/pursuit | 3 | 是 |  | 是 | 是 |  |  | 发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.road.help` | 扶一程 | travel/worldly | 2 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.road.conflict` | 窄路相争 | travel | 2 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.road.kindness-echo` | 故人递伞 | - | 3 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |
|  | `content01.road.conflict-echo` | 旧路再逢 | - | 3 |  |  |  | 是 | 是 |  | 非修炼场景给修为（需修行合理性）；无授权结算文案键 |

## 逐场明细

### ★20 `content01.onboarding.first-breath` — 初息

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：晨雾尚未散尽。你盘坐下来，第一次试着把纷乱心绪收进一呼一吸之间。气息刚走过第三个周天，胸口的滞涩提醒你：这一步还太急。你可以按原路继续行功，也可以先松开半分，或者就到此收功。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `keep-driving` | 照原路继续行功，把这口气推过去 | core | - | - | success=[修为+220] | 无 |
| `ease-off` | 松开半分，改用更缓的呼吸 | core | - | - | success=[修为+120, 岁月+1] | 无 |
| `stop-here` | 就到这里收功，先记住这个节奏 | core | - | - | success=[修为+60, 岁月+1] | 无 |

- 硬伤：无授权结算文案键

### ★20 `content01.onboarding.mountain-road` — 山路

- 动作池：travel｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：一条山路在前方分成两股：靠林的一侧树影深，脚下有旧车辙；绕村的一侧路平些，能听见炊烟，没有新鲜的脚印。没有人为你担保，也没有人为你指路。要紧的是你此刻要赶路，还是要看得清楚。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-ford` | 走林边有车辙的那条近路 | core | - | - | success=[修为+200, 岁月+1] | 无 |
| `scout-ridge` | 先爬上高处看清林里的情形 | core | - | - | success=[修为+130, 岁月+1] | 无 |
| `go-village` | 绕去村里，按路平的那条走 | core | - | - | success=[岁月+2] | 无 |

- 硬伤：存在纯时间选项；无授权结算文案键

### ★20 `content01.onboarding.market-choice` — 早市

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：早市刚开。摊主收了一筐杂药，其中几味他分不清，报给外行一个偏低的数，也没有说为什么低。你可以按他给的数替他把这一筐分好，也可以先把该值多少讲清楚再动手，或者先问清他打算把这一筐卖给谁。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-deal` | 按他给的数替他把这一筐分好 | core | - | - | success=[灵石+1] | 无 |
| `haggle-fair` | 先把这一筐该值多少讲清楚再动手 | core | - | - | success=[灵石+2, 岁月+1] | 无 |
| `ask-source` | 先问清他打算把这一筐卖给谁 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：存在纯时间选项；发放灵石（需场景内来源）；无授权结算文案键

### ★20 `content01.onboarding.old-trace` — 旧痕

- 动作池：pursuit｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：石壁上一道旧痕延伸进荒草。来处已经模糊了，断口却很新——留下它的人不久之前还在这里。你可以沿着断口追进荒草，也可以先记下位置，或者转去问附近的人。
- 授权结算文案键：有（`content01.onboarding.old-trace.resolution`）

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `follow-fresh` | 顺着新断口追进荒草 | core | - | - | success=[岁月+2] | 无 |
| `mark-spot` | 先记下位置，不急于这一步 | core | - | - | success=[岁月+1] | 无 |
| `ask-locals` | 转去问附近的人有无异常 | core | - | - | success=[岁月+2] | 无 |

- 硬伤：全部选项仅时间差；存在纯时间选项

### `content01.onboarding.rain-shelter` — 避雨

- 动作池：travel / worldly｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：骤雨把几名陌生人困在同一檐下。雨声太大，说话要提高嗓门，反而没人先开口。沉默比寒意更先试探彼此：谁挪一挪，谁就先把话说出去了。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 挪半个身位，先把伞递过去 | core | - | - | success=[岁月+2] | 无 |
| `consider` | 靠着柱子不动，听这一场雨落完 | core | - | - | success=[岁月+1] | 无 |
| `leave` | 雨脚一转就先行赶路 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：全部选项仅时间差；存在纯时间选项；无授权结算文案键

### ★20 `content01.onboarding.quiet-retreat` — 静室

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：静室里没有异象，只有一次次走神与重新坐定。你数到第几遍时开始怀疑自己走了岔路。你可以照原样再坐一段，也可以换个法子重起一轮，或者今日就此收束。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `sit-again` | 照原样再坐一段，看能否坐稳 | core | - | - | success=[修为+200] | 无 |
| `change-method` | 换个法子重起一轮行功 | core | - | - | success=[修为+130, 岁月+1] | 无 |
| `close-day` | 今日就此收束，改日再来 | core | - | - | success=[修为+70, 岁月+1] | 无 |

- 硬伤：无授权结算文案键

### ★20 `content01.onboarding.roadside-injury` — 路边伤者

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：actor:content01.archetype.mortal-traveler
- 开场正文：路边有人坐着捂住伤口。血已经止住，他仍盯着每一双靠近的手。你可以上前替他处理，也可以先站远些问清发生了什么，或者只记住这个人。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `help-dress` | 上前替他处理伤口 | core | - | - | success=[修为+180, npc显著度+500, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |
| `keep-distance` | 先站远些问清他遇到了什么 | core | - | - | success=[修为+120, 关系undefined] | ADJUST_NPC_RELATION |
| `just-notice` | 只记下这个人的样子，不去打扰 | core | - | - | success=[修为+60, 岁月+1, 关系undefined] | ADJUST_NPC_RELATION |

- 硬伤：无授权结算文案键

### ★20 `content01.onboarding.forked-path` — 岔路

- 动作池：pursuit｜类型：choice｜权重：100｜标签：content01, onboarding
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：你追寻的线索在此分成两股。一股脚印清楚、方向明确；另一串痕迹像是特意留下的，过于整齐。你可以顺着清楚的那股走，也可以去试那串整齐的，或者暂时按兵不动。
- 授权结算文案键：有（`content01.onboarding.forked-path.resolution`）

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `clear-trail` | 顺着清楚的那股脚印走 | core | - | - | success=[岁月+2] | 无 |
| `neat-trail` | 去试那串过于整齐的痕迹 | core | - | - | success=[岁月+3] | 无 |
| `hold-position` | 暂不动作，先把两股都记下 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：全部选项仅时间差；存在纯时间选项

### ★20 `content01.ordinary.tea-house` — 半盏茶

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：茶棚里只剩半壶温茶。邻桌三人谈起一场与你无关的远行，说得很热闹，没有人问你从哪里来。棚外的路还长，你要决定的只是这壶茶喝完就走，还是坐到它凉透。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `finish-cup` | 喝完这半盏茶便走 | core | - | - | success=[岁月+1] | 无 |
| `stay-listen` | 坐到茶凉，听完这段远行 | core | - | - | success=[修为+90, 岁月+1] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.ferry-wait` — 候渡

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：河雾压住渡口，船家不肯冒险开船。等的人越来越多，谁也不愿先开口。你可以留在雾里等一趟船，也可以沿河岸走到下一个渡口——那条路更远，但至少在走。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `wait-ferry` | 留在渡口等一趟船 | core | - | - | success=[岁月+1] | 无 |
| `walk-upstream` | 沿河岸走到下一个渡口 | core | - | - | success=[修为+110, 岁月+2] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.missed-letter` — 迟信

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：一封辗转多地的旧信终于到了手中，纸角磨损，寄信人没有留下回址。信里只提到一处地方，别的什么都没有。你可以照这处地名去找，也可以先弄清楚这封信为何迟到这么久。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `follow-place` | 照信里那处地名去找 | core | - | - | success=[修为+160, 岁月+2] | 无 |
| `trace-delay` | 先查这封信为何迟到这么久 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.broken-bridge` — 断桥

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：山洪冲断了木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。你可以先帮对岸把绳索拉起来，也可以只问清对面有几个人、家在哪个方向，再决定要不要出力。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `throw-rope` | 先把绳索抛过去，帮他们过河 | core | - | - | success=[修为+150, 岁月+1] | 无 |
| `ask-terms` | 只问清对面的人数与去向 | core | - | - | success=[修为+100, 岁月+1] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.night-rain` — 夜雨

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：夜雨敲窗。你想起数年前一次仓促告别，那句话至今没有说完。念头一起就压不住。你可以坐下来把这段心绪行功化开，也可以就着雨声把它放到明天。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 就着雨声坐下来，把这段心绪行功化开 | core | - | - | success=[修为+170] | 无 |
| `consider` | 不起身，先把这一夜雨听完 | core | - | - | success=[岁月+1] | 无 |
| `leave` | 压下心绪，明日照常赶路 | core | - | - | success=[修为+60, 岁月+1] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.roadside-debate` — 道旁争言

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：actor:content01.archetype.wandering-cultivator
- 开场正文：两名修士为一条旧规争得面红耳赤，围观者各有私心，嘴上却都说为了公道。你可以当场评一句谁站得住，也可以只问清这条旧规究竟伤过谁，再决定要不要开口。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `pick-a-side` | 当场评一句谁站得住 | core | - | - | success=[修为+140, 关系undefined] | ADJUST_NPC_RELATION |
| `ask-who-hurt` | 只问这条旧规究竟伤过谁 | core | - | - | success=[修为+120, npc显著度+300, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### ★20 `content01.ordinary.empty-search` — 空寻

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。旧图上标的方位已经偏了。你可以照脚印的走向继续追，也可以承认今日无所得，回头重画。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `follow-footprints` | 照那几处脚印继续追下去 | core | - | - | success=[修为+130, 岁月+1] | 无 |
| `redraw-map` | 承认今日无所得，回头重画 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.shared-fire` — 同火

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：actor:content01.archetype.mortal-traveler
- 开场正文：荒野风紧，陌生旅人分出半边篝火，谁也没有追问来历。你可以守着火陪到天亮，也可以问问他接下来往哪条路走——问了他才记得你们照过面。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `keep-watch` | 守着火陪到天亮 | core | - | - | success=[岁月+1, 关系undefined] | ADJUST_NPC_RELATION |
| `ask-route` | 问他接下来往哪条路走 | core | - | - | success=[修为+130, npc显著度+400, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### ★20 `content01.ordinary.market-bargain` — 小交易

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：actor:content01.archetype.merchant-cultivator
- 开场正文：行商修士摆出几味寻常药材，也收草药。价钱报得干脆利落，可他真正想交换的，是一条路况消息：哪一段路近来不太平。你可以只把随身草药作价给他，也可以加进那条消息，用一个承诺换它。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `sell-herbs` | 只把随身草药作价给他 | core | - | - | success=[灵石+1, npc显著度+300, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |
| `trade-for-news` | 加进那条路况消息，用一个承诺换它 | core | - | - | success=[npc显著度+500, 岁月+1, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |

- 硬伤：发放灵石（需场景内来源）；无授权结算文案键

### ★20 `content01.ordinary.mountain-view` — 山色

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：登高之后并无奇遇。群山在暮色里一层层远去，呼吸也随之平缓。你可以就地调息，把这段山路换来的清醒收进气机；也可以辨清方位后继续上路。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `breathe-here` | 就地调息，把这段清醒收进气机 | core | - | - | success=[修为+160] | 无 |
| `orient-and-go` | 辨清方位后继续上路 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：存在纯时间选项；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.ordinary.harvest-help` — 收谷

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：actor:content01.archetype.mortal-traveler
- 开场正文：村人赶在风雨前收谷，人手不足，只要你肯搭把手，一个时辰就能补上缺口。你可以下地收谷，也可以替他们看住堆在院里的谷堆，等他们回来再一起分。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `work-field` | 下地一起收谷 | core | - | - | success=[npc显著度+500, 岁月+1, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |
| `guard-store` | 替他们看住院里的谷堆 | core | - | - | success=[npc显著度+300, 岁月+1, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |

- 硬伤：无授权结算文案键

### ★20 `content01.ordinary.old-song` — 旧曲

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：客栈角落有人弹起旧曲。旋律并不精妙，几位过客却同时安静下来。你可以坐到曲终再起身，也可以直接起身去看弹琴的人是谁——后者也许更接近这段曲子的来处。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `sit-through` | 坐到这一曲终了再起身 | core | - | - | success=[修为+100] | 无 |
| `meet-player` | 起身去看弹琴的人是谁 | core | - | - | success=[修为+140, 岁月+1] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### ★20 `content01.pei.broken-blade` — 断剑客

- 动作池：travel / worldly｜类型：choice｜权重：100｜标签：content01, build-sword, npc-sword, cause-origin
- 参与者：actor:content01.npc.pei-zhaochuan
- 开场正文：裴照川把断剑横在膝上，剑格上还留着上一次交手的缺口。他谈的是同行，不是收徒，也没有先许下情分。你要决定的是：以剑相争分个明白，还是先问清他这趟要往哪里去。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 与他定约 | core | - | - | success=[种因果, 道途证据:build.sword, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `bind-2` | 以剑相争 | core | - | - | success=[种因果, 道途证据:build.sword, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `decline` | 只说一句改日再会，不问他的去处 | core | - | - | success=[修为+120] | 无 |

- 硬伤：无授权结算文案键

### `content01.pei.sparring-rain` — 雨中试剑

- 动作池：cultivate / pursuit｜类型：choice｜权重：100｜标签：content01, build-sword, npc-sword
- 参与者：actor:content01.npc.pei-zhaochuan
- 开场正文：雨线斜落，裴照川只问你是否还愿意拔剑。他没有摆出架势，胜负之外还要看你如何收手：剑出到哪一步算完，收手时剑锋朝哪一边，都是他自己选的事。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 拔剑，但只走到他说的那一步 | core | - | - | success=[道途证据:build.sword, 修为+150, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 先问清他今日想试的是剑还是人 | core | - | - | success=[修为+130, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 收剑鞘而不发 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：无授权结算文案键

### `content01.pei.old-wound` — 旧伤复作

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, build-sword, npc-sword, risk
- 参与者：actor:content01.npc.pei-zhaochuan
- 开场正文：裴照川行至半坡忽然停步，旧伤让他的右手微颤。他把剑换到左手，语气仍然平稳，却不肯把这个决定交给旁人照看。你要决定的是：替他分忧，还是等他把话说完。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 接手扶住他发抖的那只手，把这一程走完 | core | threat.critical-injury | - | success=[道途证据:build.sword]；costlySuccess=[道途证据:build.sword]；failure=[修为+60] | ADD_BUILD_EVIDENCE |
| `read-signs` | 先看清他伤的到底是哪一处 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 不强接，退回半步等他开口 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.pei.promise-echo` — 剑约未冷

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary, build-sword, npc-sword
- 参与者：actor:content01.npc.pei-zhaochuan
- 开场正文：多年后那柄断剑仍在，剑身上的缺口没有补。裴照川没有复述当年的旧约，只把另一条路摆到你面前，像在问：当年那件事，现在还算不算数。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 接下他递来的第二条路 | core | - | - | success=[道途证据:build.sword, 修为+160, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 先问清当年断的是哪一段 | core | - | - | success=[修为+120, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 不接这条路，转身离开 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：无授权结算文案键

### ★20 `content01.jiang.herb-price` — 药有其价

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, build-alchemy, npc-healer, cause-origin
- 参与者：actor:content01.npc.jiang-xuewu
- 开场正文：姜雪芜替人止住了伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。账目摆在桌上，谁都可以核。你要决定的是：当场认下这份人情，还是先把每一项都问明白。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 认下药债 | core | - | - | success=[种因果, 道途证据:build.alchemy, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `decline` | 不认这份人情，只把账目看清 | core | - | - | success=[修为+120] | 无 |

- 硬伤：无授权结算文案键

### `content01.jiang.night-clinic` — 夜诊

- 动作池：worldly / cultivate｜类型：choice｜权重：100｜标签：content01, build-alchemy, npc-healer
- 参与者：actor:content01.npc.jiang-xuewu
- 开场正文：夜深后仍有人敲门。姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面，没有替你选，也没有把话说软。她只等着你说出一个能担得起的决定。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 选最稳妥的那一种，当场把话说定 | core | - | - | success=[道途证据:build.alchemy, 关系undefined] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION |
| `consider` | 先把最昂贵的那一种问到底 | core | - | - | success=[修为+150] | 无 |
| `leave` | 今夜先不开口，退出去 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.jiang.bitter-decoction` — 苦汤

- 动作池：cultivate｜类型：combat｜权重：100｜标签：content01, build-alchemy, npc-healer, risk
- 参与者：actor:content01.npc.jiang-xuewu
- 开场正文：一锅药汤气味辛烈。姜雪芜提醒其中一味药性相冲：省事与稳妥不能两全，快煎伤身，慢煎费时。她把两种代价都摆出来，剩下的由你决定要不要冒这个险。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 按快煎的法子把这锅药端下去 | core | threat.poison | - | success=[道途证据:build.alchemy]；costlySuccess=[道途证据:build.alchemy]；failure=[修为+60] | ADD_BUILD_EVIDENCE |
| `read-signs` | 先分清是哪一味在相冲 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 不冒这一炉，把火撤了 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.jiang.debt-echo` — 旧账新页

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary, build-alchemy, npc-healer
- 参与者：actor:content01.npc.jiang-xuewu
- 开场正文：姜雪芜翻到旧账那一页，没有催促，指尖停在当年记下的数目上。她只问你如今是否仍认得当年的代价：认，这页就翻过去；不认，也请把话说清。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 按当年记下的数还清 | core | - | - | success=[修为+140, 道途证据:build.alchemy, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 先核一遍旧账里记的到底是什么 | core | - | - | success=[修为+110, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 这一页不必翻，就此作罢 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：无授权结算文案键

### `content01.cen.shoulder-road` — 并肩负伤

- 动作池：travel / worldly｜类型：choice｜权重：100｜标签：content01, build-body, npc-body, cause-origin
- 参与者：actor:content01.npc.cen-bugui
- 开场正文：岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走：是一起按原路赶，还是先在这里处理伤势再动。他的肩还在往下滴血。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 与他同行 | core | - | - | success=[种因果, 道途证据:build.body, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `decline` | 各自按各自的路走，不再同行 | core | - | - | success=[修为+120] | 无 |

- 硬伤：无授权结算文案键

### `content01.cen.stone-steps` — 负石登阶

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, build-body, npc-body
- 参与者：actor:content01.npc.cen-bugui
- 开场正文：岑不归背石登阶，每一步都极慢，呼吸比石头还重。他不劝你跟上，也不催你离开，只在山腰留了一瓢清水。台阶还有一半，水已经凉了。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 跟上他的步子，把剩下的台阶走完 | core | - | - | success=[道途证据:build.body, 关系undefined] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION |
| `consider` | 先看清他走的是哪一条石阶 | core | - | - | success=[修为+150] | 无 |
| `leave` | 喝下那瓢水，不再往上 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.cen.shield-stranger` — 以身护人

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, build-body, npc-body, risk
- 参与者：actor:content01.npc.cen-bugui
- 开场正文：乱石落下时，岑不归已经站到最窄的缺口，抬头看了一眼落石的方向，随即回头等一个共同承担的决定。他没有说「你走吧」，也没有说「我挡着」。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 站到缺口另一侧，与他一起挡 | core | threat.combat | - | success=[道途证据:build.body]；costlySuccess=[道途证据:build.body]；failure=[修为+60] | ADD_BUILD_EVIDENCE |
| `read-signs` | 先看清落石是从哪一侧来 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 退到岩壁后，不接这一场 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.cen.shared-echo` — 伤痕相认

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary, build-body, npc-body
- 参与者：actor:content01.npc.cen-bugui
- 开场正文：旧伤在阴雨里同时发作。岑不归看见你按住肩头，便知道那一天的代价没有被忘记，也没有被说出口。他难得开了口，说的却只是今日的天气。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 把当年那道伤指给他看 | core | - | - | success=[道途证据:build.body, 修为+140, npc显著度+500, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 只说一句今日天凉，不提旧事 | core | - | - | success=[修为+80, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 各自走进雨里，不等对方开口 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：无授权结算文案键

### ★20 `content01.xie.secret-map` — 半张秘图

- 动作池：pursuit / travel｜类型：choice｜权重：100｜标签：content01, build-fortune, npc-ruin-explorer, cause-origin
- 参与者：actor:content01.npc.xie-tingchao
- 开场正文：谢听潮摊开半张秘图，另一半仍收在袖中。他愿意分路，也要求先说清如何分利：谁走前段，谁担风险，图上的记号算不算数。图边角已经磨得起毛。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 立约同行 | core | - | - | success=[种因果, 道途证据:build.fortune, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `bind-2` | 暗留后手 | core | - | - | success=[种因果, 道途证据:build.fortune, npc显著度+500] | ADD_CAUSE, ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE |
| `decline` | 不谈分利，把图原样还给他 | core | - | - | success=[修为+120] | 无 |

- 硬伤：无授权结算文案键

### `content01.xie.cave-gamble` — 洞口风声

- 动作池：pursuit｜类型：combat｜权重：100｜标签：content01, build-fortune, npc-ruin-explorer, risk
- 参与者：actor:content01.npc.xie-tingchao
- 开场正文：洞口吹出的风带着金石气。谢听潮判断里面有路，也坦言这个判断可能错——他把手按在石壁上等了一息，石头是凉的。他要你先说，进还是退。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 先进洞，把石壁一路摸到底 | core | threat.dangerous-exploration | - | success=[道途证据:build.fortune]；costlySuccess=[道途证据:build.fortune]；failure=[修为+60] | ADD_BUILD_EVIDENCE |
| `read-signs` | 先在洞口听清风声的来路 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 记住这个洞口，原路退回 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.xie.divided-spoils` — 分利

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, build-fortune, npc-ruin-explorer
- 参与者：actor:content01.npc.xie-tingchao
- 开场正文：所得不如预想，谢听潮仍按旧话分成，只把最后一件用途不明的东西留在中央，谁也没有先动。他问的不是分法，而是这件事还算不算当初约定的那个部分。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 按当初的约定，先问清那件东西的用途 | core | - | - | success=[道途证据:build.fortune, 修为+140, npc显著度+400, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 把中央那件推到一边，先分其余的 | core | - | - | success=[灵石+1, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 一样都不取，这次到此为止 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：发放灵石（需场景内来源）；无授权结算文案键

### `content01.xie.map-echo` — 图上旧折

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary, build-fortune, npc-ruin-explorer
- 参与者：actor:content01.npc.xie-tingchao
- 开场正文：秘图的旧折痕与眼前山势完全重合。谢听潮没有催你，只把当初说过的话轻轻念了一遍，念到一半就停住——他也在等你想起来，那句话当年是怎么说的。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 把当年没说完的那半句补上 | core | - | - | success=[道途证据:build.fortune, 修为+160, 关系undefined, 了结因果] | ADD_BUILD_EVIDENCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 先按图走一遍，把路线对清楚 | core | - | - | success=[修为+110, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 承认你已经想不起那句话 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：无授权结算文案键

### ★20 `content01.xu.mortal-letter` — 人间来信

- 动作池：worldly / pursuit｜类型：choice｜权重：100｜标签：content01, npc-mortal, cause-origin
- 参与者：actor:content01.npc.xu-changan
- 开场正文：许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。送信人不肯多等，收了脚程钱就走了。信很短，短到只够问这一件事。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 答应归去 | core | - | - | success=[种因果, npc显著度+500] | ADD_CAUSE, ADD_NPC_SIGNIFICANCE |
| `decline` | 不回这封信，把短笺收进包里 | core | - | - | success=[修为+120] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.xu.ten-year-return` — 十年重逢

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, npc-mortal
- 参与者：actor:content01.npc.xu-changan
- 开场正文：你眼中的数次闭关，在许长安鬓边已经积了一层霜。他仍认得你，也没有假装岁月轻巧。院门开着，门前那棵树比记忆里高了一些。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 走进院子，把这十年当面说给他听 | core | - | - | success=[npc显著度+600, 关系undefined] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION |
| `consider` | 先在门外看清院里的变化 | core | - | - | success=[修为+150] | 无 |
| `leave` | 不进门，改日再来 | core | - | - | success=[修为+60] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.xu.empty-courtyard` — 空院

- 动作池：pursuit｜类型：choice｜权重：100｜标签：content01, npc-mortal
- 参与者：actor:content01.npc.xu-changan
- 开场正文：院门仍旧，檐下却积了厚灰。邻人只说许长安早已离开，具体去了哪里无人知道。院角那棵旧树还活着，落叶堆在墙根，没有被扫过。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 扫开墙根的落叶，让院子有人住的样子 | core | - | - | success=[修为+130, npc显著度+300, 关系undefined, 了结因果] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 向邻人多问一句他可能去了哪里 | core | - | - | success=[修为+90, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 把院门掩上，不去问答案 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.xu.promise-echo` — 树下旧诺

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary, npc-mortal
- 参与者：actor:content01.npc.xu-changan
- 开场正文：旧树又添了一圈年轮，你终于站回门前。门里没有回应，院子空着。许长安是否还在，已经不再是唯一的问题——你要决定的是推门进去，还是先在这里站一会儿。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 推门进去，把话当面问清 | core | - | - | success=[修为+150, npc显著度+500, 关系undefined, 了结因果] | ADD_NPC_SIGNIFICANCE, ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `consider` | 先在门前站一会儿，不急着进去 | core | - | - | success=[修为+90, 岁月+1, 关系undefined, 了结因果] | ADJUST_NPC_RELATION, RESOLVE_CAUSE |
| `leave` | 转身离开，把这件事留在原处 | core | - | - | success=[岁月+1, 关系undefined, 搁置因果] | ADJUST_NPC_RELATION, EXPIRE_CAUSE |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### ★20 `content01.build.sword.river-cut` — 截流一剑

- 动作池：cultivate / travel｜类型：choice｜权重：100｜标签：content01, build-sword
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：山涧暴涨，石上只容下脚的地方。要用剑开的不是敌人，而是一线可过之路：剑锋偏了半尺就够不着落点，偏得太多又会把整块石头劈塌。你只有一次出手的余地。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 出这一剑，只取那一线落点 | core | - | - | success=[道途证据:build.sword] | ADD_BUILD_EVIDENCE |
| `consider` | 先把落点看准再动剑 | core | - | - | success=[修为+150] | 无 |
| `leave` | 收剑退开，涉水过涧 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.sword.no-draw` — 剑未出鞘

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, build-sword
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：对方故意激你拔剑，把话说得很难听。真正难的并非出手，而是判断这一剑值不值得——拔了可能中了圈套，不拔也可能错过唯一的机会。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 按本心拔剑，接下这一场 | core | - | - | success=[道途证据:build.sword] | ADD_BUILD_EVIDENCE |
| `consider` | 先看清这是不是圈套 | core | - | - | success=[修为+150] | 无 |
| `leave` | 任他骂下去，把剑按回鞘里 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.sword.guard-caravan` — 护行

- 动作池：travel｜类型：choice｜权重：100｜标签：content01, build-sword
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：商队只求平安过岭。剑锋若出得太快，原本能谈的局面会被推成死斗；慢一步，路上的风声却可能先到。你要决定的是先稳住人，还是先稳住剑。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 握剑走在外侧，先稳住剑 | core | - | - | success=[道途证据:build.sword] | ADD_BUILD_EVIDENCE |
| `consider` | 先听清路上风声从哪来 | core | - | - | success=[修为+150] | 无 |
| `leave` | 不接这一趟，让商队自行过岭 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.body.boulder` — 移石

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, build-body
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：巨石堵住山道，术法并非唯一办法。筋骨与耐心也能一点点把困局挪开，只是要耗上好几日。你可以用更省力的法子绕过去，也可以咬着牙把石头一点点挪开。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 咬着牙把这块石头挪开 | core | - | - | success=[道途证据:build.body] | ADD_BUILD_EVIDENCE |
| `consider` | 先估一估石头的重心在哪 | core | - | - | success=[修为+150] | 无 |
| `leave` | 绕过去，把力气留到后面 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.body.cold-water` — 寒潭

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, build-body
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：寒潭入骨。继续停留能磨炼气血，也可能让旧伤在夜里更深一分。水面安静得看不出深浅，你要在下水之前决定，是把这口气咬住，还是今天到此为止。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 把气咬住，下潭走一遍 | core | - | - | success=[道途证据:build.body] | ADD_BUILD_EVIDENCE |
| `consider` | 先看清潭底深浅再下水 | core | - | - | success=[修为+150] | 无 |
| `leave` | 今日到此为止，收身出水 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.body.carry-wounded` — 背人下山

- 动作池：travel / worldly｜类型：choice｜权重：100｜标签：content01, build-body
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：伤者已经无法再走，山路却还有很长一段。背起一个人意味着把自己的退路也交给脚下：不背，他留在这里；背了，你走多慢都得背到底。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 背起他，走多慢都背到底 | core | - | - | success=[道途证据:build.body] | ADD_BUILD_EVIDENCE |
| `consider` | 先看清前段山路能不能过人 | core | - | - | success=[修为+150] | 无 |
| `leave` | 留下他，自己先赶路 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### ★20 `content01.build.alchemy.herb-sort` — 辨草

- 动作池：cultivate / pursuit｜类型：choice｜权重：100｜标签：content01, build-alchemy
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：三种药草外形近似，药性却相反，认错一味整炉报废。耐心辨认比一炉昂贵的丹火更要紧。三株并排摆着，你要一株一株地看过去，不能靠猜。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 一株一株看过去，把三味分清 | core | - | - | success=[道途证据:build.alchemy] | ADD_BUILD_EVIDENCE |
| `consider` | 先把已认出的两味记牢 | core | - | - | success=[修为+150] | 无 |
| `leave` | 不再细辨，只取认得出的那一株 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.alchemy.fever` — 退热

- 动作池：worldly｜类型：choice｜权重：100｜标签：content01, build-alchemy
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：村中热症蔓延，没有珍稀灵药，只有有限的草药和一夜不能出错的照看。药只能救一部分人，你要决定的是先顾哪一间，以及这一夜怎么轮班。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 先顾最重的那一间，把药分下去 | core | - | - | success=[道途证据:build.alchemy] | ADD_BUILD_EVIDENCE |
| `consider` | 先算清药与人的数目 | core | - | - | success=[修为+150] | 无 |
| `leave` | 不接手这一夜，交给村里的人 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.alchemy.failed-brew` — 废炉

- 动作池：cultivate｜类型：choice｜权重：100｜标签：content01, build-alchemy
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：药液的颜色偏了一线，这炉已经不能救人了。承认失败比把它勉强端出去更难：锅里的东西还温着，端出去就会有人喝。你要决定的是倒掉，还是自己承担。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 亲手把这炉倒掉，认下这一次失败 | core | - | - | success=[道途证据:build.alchemy] | ADD_BUILD_EVIDENCE |
| `consider` | 先尝一口，弄清偏在哪一味 | core | - | - | success=[修为+150] | 无 |
| `leave` | 把炉封了，不去碰它 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.fortune.fork` — 偏僻岔路

- 动作池：travel / pursuit｜类型：choice｜权重：100｜标签：content01, build-fortune
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：你沿熟路赶往山外，岔路旁却留下新鲜蹄印。熟路有行人，能按时抵达；偏路通向林深，看不清尽头。这里真正要决定的是行程与未知机会，而不是抽象的磨炼。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 循着那串蹄印走进偏路 | core | - | - | success=[道途证据:build.fortune, 修为+150] | ADD_BUILD_EVIDENCE |
| `climb-and-watch` | 先登高看清偏路通向哪里 | core | - | - | success=[修为+180, 岁月+1] | 无 |
| `stay-known-road` | 放弃偏路，按熟路按时抵达 | core | - | - | success=[岁月+1] | 无 |

- 硬伤：存在纯时间选项；无授权结算文案键

### `content01.build.fortune.hidden-stream` — 石下清泉

- 动作池：pursuit｜类型：choice｜权重：100｜标签：content01, build-fortune
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：你在无人在意的石缝里听见了水声。继续挖可能一无所获，也可能改写整段行程；石缝很深，出不来就得等到天黑。溪声一直在响，听不出深浅。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 顺着水声把石缝挖开 | core | - | - | success=[道途证据:build.fortune] | ADD_BUILD_EVIDENCE |
| `consider` | 先听清这声音是从多深来的 | core | - | - | success=[修为+150] | 无 |
| `leave` | 不挖了，把石缝照原样盖回 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### `content01.build.fortune.empty-hand` — 空手而归

- 动作池：cultivate / pursuit｜类型：choice｜权重：100｜标签：content01, build-fortune
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：等待多日的机缘没有出现。你按着旧记踏遍三处地方，回过神来时天已经黑了。真正留下的不是收获，而是你如何面对这次落空——以及还要不要再等一次。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 再按旧记走一处，把这一趟走完 | core | - | - | success=[道途证据:build.fortune] | ADD_BUILD_EVIDENCE |
| `consider` | 先记下这三处，弄清错在哪一步 | core | - | - | success=[修为+150] | 无 |
| `leave` | 收记回身，这一次就到这里 | core | - | - | success=[修为+60] | 无 |

- 硬伤：无授权结算文案键

### ★20 `content01.risk.pine-ambush` — 松林伏影

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：松针忽然停止落下。前路有人藏住呼吸，退路也在一点点合拢。声音是从两个方向传来的，你分不清哪一个更近，也不敢赌。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 抢在合拢之前冲出去 | core | threat.ambush | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先分辨哪一边的声音更近 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 退出松林，绕开这一段 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### ★20 `content01.risk.ruin-depth` — 遗迹深处

- 动作池：pursuit｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：石阶向下延伸，壁灯早已熄灭，你的脚步声在石壁之间回荡，却比回来时多了一次。回声不会说谎：前面还有别的东西在动。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 继续往下，看清那是什么 | core | threat.dangerous-exploration | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先数清回声是从几处来的 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 就此上行，不再往下探 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.poison-mist` — 青雾

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：谷底升起淡青雾气，沾到雾的草叶边缘已经发黑。风把雾往这边吹，绕路要多耗数日，而你带的水只够两天。湿冷顺着衣袖往里渗。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 屏住呼吸穿过这片青雾 | core | threat.poison | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先辨出雾最薄的那一段 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 退回谷口，另找一条路 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.curse-stone` — 无字碑

- 动作池：pursuit｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。声音用的是你自己的嗓音，说的却是一句你从未听过的话。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 再把神识探进去，听它说完 | core | threat.curse | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先分辨这话是谁在借声 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 收回神识，不去应这一声 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.critical-crossing` — 负伤渡河

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：伤势未稳，河水又在上涨。此刻强渡，危险来自水势，也来自你自己的身体。两样都在往下压，而对岸已经能看见了。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 趁还有力气强渡过去 | core | threat.critical-injury | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先探清水势最缓的一处 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 退回岸上，等水落下去 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.revenge-shadow` — 旧怨追来

- 动作池：pursuit / worldly｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：有人沿着旧日冲突留下的线索追来。来者不问解释，只确认你的名字——他已经确认过了。你想起那次争执里，自己确实说过一句过头的话。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 迎上去，把当年那句话说完 | core | threat.cause-revenge | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先认出他是当年哪一个 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 不进他的问话，先走开 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.falling-star` — 坠星

- 动作池：travel / pursuit｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。碎片还挂在天上，坠势未止——你只有站定或走开这两个选择。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 朝落点走过去，看那是什么 | core | threat.special-catastrophe | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先看清落点离你还有多远 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 背向落点，先离远些 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.beast-trail` — 兽迹

- 动作池：travel｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：新鲜兽迹绕过营地三次，每次都绕回同一处。猎物与猎手的位置，可能在下一步互换。你手里的东西还够一次驱赶，也可能只够一次引开。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 循着兽迹迎过去 | core | threat.combat | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先看清它绕的是哪一圈 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 收起营地，趁夜换一处 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.flood-cave` — 涨水洞

- 动作池：pursuit｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：洞中水位正在上升，深处那点微光还没有消失。留给你的时间不多了：往回走要穿过刚涨起来的水，往前走要赌那条路够高。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 往深处走，赌那条路够高 | core | threat.dangerous-exploration | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先看清光亮离水面多高 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 顺原路退回洞口 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.risk.broken-seal` — 残封

- 动作池：cultivate / pursuit｜类型：combat｜权重：100｜标签：content01, risk
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：封印的裂口只容一线气息外泄。那气息古老而清醒，并不急着扑上来，只在等一个回应。你可以合上裂口转身，也可以听它把话说完。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `take-risk` | 听它把话说完 | core | threat.special-catastrophe | - | success=[灵石+2]；costlySuccess=[灵石+2]；failure=[修为+60] | 无 |
| `read-signs` | 先辨清这气息出自哪一类封 | core | - | - | success=[修为+180] | 无 |
| `turn-away` | 合上裂口，转身离开 | core | - | - | success=[修为+60] | 无 |

- 硬伤：发放灵石（需场景内来源）；非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.road.help` — 扶一程

- 动作池：travel / worldly｜类型：choice｜权重：100｜标签：content01, cause-origin
- 参与者：actor:content01.archetype.wandering-cultivator
- 开场正文：同行的陌生修士在坡前力竭。他没有开口求救，只把行囊向身后挪了挪，腾出一点位置。他不看你，等的是你自己决定要不要停下。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 扶他一程 | core | - | - | success=[种因果, npc显著度+500] | ADD_CAUSE, ADD_NPC_SIGNIFICANCE |
| `decline` | 不停脚，越过他继续赶路 | core | - | - | success=[修为+120] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.road.conflict` — 窄路相争

- 动作池：travel｜类型：choice｜权重：100｜标签：content01, cause-origin
- 参与者：actor:content01.archetype.dangerous-cultivator
- 开场正文：狭窄山道只容一人先过。对面的修士不肯退让，你也看不出他是否另有所图。他把脚跟抵在石缝上，像是已经打算在这里耗到底。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `bind-1` | 记下此争 | core | - | - | success=[种因果, npc显著度+500] | ADD_CAUSE, ADD_NPC_SIGNIFICANCE |
| `decline` | 退到路边，让他先过去 | core | - | - | success=[修为+120] | 无 |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.road.kindness-echo` — 故人递伞

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：多年后雨又落下，一把伞从身侧递来。那张脸比记忆里成熟，旧日那一程仍然被记得——他先开口叫的，还是当年的称呼。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 叫回当年的称呼，接过这把伞 | core | - | - | success=[修为+150, 了结因果] | RESOLVE_CAUSE |
| `consider` | 先问他这些年过得如何 | core | - | - | success=[修为+100, 岁月+1, 了结因果] | RESOLVE_CAUSE |
| `leave` | 各走各的路，把这一段雨留给当年 | core | - | - | success=[岁月+1, 搁置因果] | EXPIRE_CAUSE |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

### `content01.road.conflict-echo` — 旧路再逢

- 动作池：（无）｜类型：choice｜权重：100｜标签：content01, ordinary
- 参与者：无（不得声称与具体人物建立持久关系）
- 开场正文：同一条窄路，你再次看见那个熟悉的身影。当年的争执已经长出新的分量，谁都没有先提。他停下来，你也没有。
- 授权结算文案键：**无**

| optionId | 选项文案 | 作用域 | 威胁 | 检定 | 结果层级与实际效果 | 持久后果 |
| --- | --- | --- | --- | --- | --- | --- |
| `engage` | 这次先把当年的话说完 | core | - | - | success=[修为+140, 了结因果] | RESOLVE_CAUSE |
| `consider` | 侧身让路，谁都不提那一段 | core | - | - | success=[修为+70, 岁月+1, 了结因果] | RESOLVE_CAUSE |
| `leave` | 退回去，等他先走 | core | - | - | success=[岁月+1, 搁置因果] | EXPIRE_CAUSE |

- 硬伤：非修炼场景给修为（需修行合理性）；无授权结算文案键

