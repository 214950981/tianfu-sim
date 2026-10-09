# PLAYFEEL01：天府 2.0 修仙可玩性重构合同
Controller / GPT-6 签发于 2026-10-09。
状态 DESIGN_LOCKED，唯一执行方 WorkBuddy，唯一代码分支 wb-PLAYFEEL01。禁止自动部署、改数据库、修改 main/dev 产品代码。

## 0. 产品结论
用户试玩截图：旧曲选择找弹琴的人却只给修为+140/岁月+1；背人下山、半张秘图每项都是黑色“就此抉择”；到62岁仍凡人；人生书只显示事件流水并且死因不明。玩家得到的是古代生活事件抽签，不是修仙。
产品承诺：玩家知道当前灵根与境界，近期突破目标明确；一次选择有可以被解释的经过、代价与变化；以前的因果会改变以后的遭遇；死亡有来源；下次转生有不同策略可尝试。
Controller负责玩法规则和验收，WorkBuddy只能在既定规则内实现。不要把“代码能运行”“264项测试PASS”再当作好玩的代理。

## 1. 外部游戏设计方法的借鉴边界
鬼谷八荒：突出近期境界目标、突破准备、选择与代价；了不起的修仙模拟器：突破前准备和失败惩罚可理解；密教模拟器：行动带来可投入下一次行动的知识、关系、状态；GDC：选择需要真正的后果，挫败要留恢复路径。只借设计原则，不复制具体玩法、文本、素材或数值。
参考：
https://tale-of-immortal.fandom.com/wiki/Breakthrough
https://amazing-cultivation-simulator.fandom.com/wiki/Breakthrough
https://www.gamedeveloper.com/design/why-the-i-cultist-simulator-i-devs-built-their-lovecraftian-game-on-a-house-of-cards
https://gdcvault.com/play/1021073/Level-Design-in-a-Day
https://gdcvault.com/play/1020437/Make-Things-Worse-Enabling-Setbacks

## 2. 当前代码审查事实（不准WorkBuddy重复全仓漫游）
- packages/content/src/progression-v1.ts：六境界 凡人→炼气→筑基→金丹→元婴→化神。凡人每次闭关默认修为+3200/10000，满值才能 ATTEMPT_BREAKTHROUGH；突破不自动发生。突破失败可受伤。
- packages/core/src/reducer.ts：四核心行动先计岁月、再由 Director 抽事件，闭关才自然积累大量修为。玩家只点入世/追索可以耗掉几十年而不知道突破路径。
- packages/content/src/content01-v1.ts：共66事件；ordinary.old-song 寻找弹琴者实际仅 ADD_CULTIVATION 和 OUTCOME_TIME_DELTA，无真实 NPC/线索。onboarding.old-trace、forked-path 只计时间。部分普通事件奖励修为但叙事并无修炼来源。
- miniprogram/pages/v2-live/v2-live.js buildResultReceipt：可读 eventId+choiceId+domainEffects，实际只展示“修为+N、岁月+N”，只有 no-gain 会补粗略说明；玩家缺乏经历过程。
- server/src/viewmodel.ts / core risk.ts：终局公开 death 的 directCause、category 等；客户端以不完整 directCause 映射显示“原因尚未明确”。lifeBook.events 没有逐事件的已结算经过，客户端重复开场 body。第N版、第N节点是开发字段。
- 既有NPC、Cause、Build、Risk、Director、Progression和确定性重放框架可利用；禁止另建第二套玩法引擎。

## 3. 产品主循环与不可违反的玩家感知
灵根与天命 → 当前境界/剩余寿元/10000修为目标 → 闭关、游历、入世、追索 → 动作匹配的事件 → 不同的真实选择与代价 → 经过和实际结算 → 留下可再次使用的线索/NPC/Cause/Build或诚实地未找到 → 下一目标/突破 → 终局和真实的人生故事。
不得自动满修为或保证突破。不得凭空发钱，不能称一次普通谈话为获得“修仙功法”。不能宣称不存在的 NPC、物品或未来因果。不能通过客户端重抽 RNG。
四行动：闭关主要帮助修炼和准备突破；游历探索机会与危险；入世真实人际与交易；追索已有具体线索/因果，否则给“暂无线索，先游历找机缘”的导航，不让无目的追索无穷消耗岁月。保持当前 Core 行动合法性与年限契约，确实需要调整只能最小、有证据、重新保护 replay。

## 4. 首页和首局：修仙主线必须先于随机日常
首页一屏显示已存在的灵根/天赋、境界、修为/10000、距突破差额、岁月/寿命、明显的近期目标、可执行动作。修为达到10000，醒目展示合法 ATTEMPT_BREAKTHROUGH 与其有据可依的受伤/失败风险；失败后恢复行动可用，不承诺成功率。
不显示“事件第8版/第29节点”等技术词。默认新手3至5次主动闭关应接近/达到首次可突破区间；受引导玩家在8次核心行动内必须能够看见第一次合法突破尝试入口。不是保证第一次成功。
前8次引导优先让用户经历：真正的初次修行、第一次选择修炼方向、一次机遇、一次可能实际留痕的人物/道途、以及为何需要突破。行动目的由真实状态推动，不能强制编造剧情。

## 5. 结果页实施合同
顺序严格是：本次事件 → 你实际选择了什么 → 事情怎样发生（2–4句，40–120汉字） → 真实变化与代价（以服务器状态/receipt为准） → 已发生且公开的后续影响/下次建议 → 继续。
最小技术途径：在既有 Content Spec/中文目录建立 eventId + choiceId + resolved tier 的授权结果文案，或者复用现有 outcome key 扩展为选项级别；客户端仅在服务器 command 成功后按已结算事实读取，不能自己猜 tier/结算。若公开结果缺字段可做只读 server projection，但绝不泄露隐藏RNG、Cause ID或NPC私有信息。
每个分支文案需能回答：何时、做了什么、结果为什么合理、这次真正有什么变化。重复开场原 body、笼统“大抵留下形状”、孤立的“修为+140”都不算结算叙事。选择为零收益就诚实写零收益，而不是虚加灵石。
例如 ordinary.old-song “起身见弹琴的人”如果没有 NPC 绑定，就只描述一次短暂接触，不能写认识故友、未来可追踪、得到残卷；若要变成长期人物关联，必须引入已有注册的 NPC actor 实效并证明后续可触发。
选项UI不要三个重复黑色“就此抉择”；选项本身可点击，使用真正不同的动词、风险、已知成本，不显示隐藏概率，不触发二次结算。

## 6. 事件建设范围：全部审计，二十场完整施工
对全部66事件输出 docs/PLAYFEEL01-EVENT-AUDIT.md，逐条包含：eventId/动作池/所有合法选择/实际效果与成本/玩家为何选择/是否留下真实长期影响/是否有有来源的结算文案/是否属于修仙与人间生活/哪一条有硬伤及处理状态。禁止只审样本。
本任务必须实改的二十场（ID均在现有包里）：
A 入门7：content01.onboarding.first-breath、quiet-retreat、market-choice、old-trace、mountain-road、roadside-injury、forked-path。
B 日常5：content01.ordinary.old-song、empty-search、market-bargain、mountain-view、tea-house。
C NPC4：content01.pei.broken-blade、content01.xie.secret-map、content01.xu.mortal-letter、content01.jiang.herb-price。
D 道途2：content01.build.sword.river-cut、content01.build.alchemy.herb-sort。
E 危险2：content01.risk.ruin-depth、content01.risk.pine-ambush。
全部二十场的**每个合法选项、风险/非风险结果层级**都需要真实过程说明；不能只改标题或只挑其中一个选项。涉及NPC/Cause的 persistent 效果必须用已经注册的合法op，满足actor绑定与封闭契约。
示例业务限制：
- 旧曲：选择见人不能只有没有来源的修为；无持久NPC则故事不能承诺关系延续。
- 旧痕/岔路：没有登记线索就只能说此行未获确定线索；追索给出寻找目标，不得纯给修为。
- 早市/小交易：获得灵石必须有当前场景可解释的交易/劳动/战利品；0灵石购买不得INVALID_OPTION卡死。
- 半张秘图/断剑客：已有NPC和Cause要真正可延续，立约、背约、试剑在后续事件能体现。
- 剑修和丹修场：增加已注册Build证据并在后续实际体现，不可以只改“潜藏”标签。
- 遗迹深处/松林伏影：风险必须先提示、结算成败差异实在、死亡来源具体可查。
至少二十场中**16场**合法选项之间存在真实非时间差异（资源/修行合理来源、NPC/Build/Cause、风险与现实代价），剩余最多4场单纯时间差别但叙事必须符合代价。若因已冻结的注册op无法做差异，停止相关场的实效变更并列明 CONTRACT_BLOCKED，不能偷加第二套字段。
其他46场只修明显P0显示/事实矛盾，不允许本任务把66场全部改写。

## 7. 因果、故事和死亡
至少两条固定可达路径证实 先前选择→已有NPC/Cause/Build状态→以后出现可感知的再会、回声或角色能力变化；不能拿前后随机不同事件冒充因果。
真实死亡 record：终局优先展示公开directCause，否则根据公开category说明是寿尽、探索、伤势、诅咒或斗法等，有具体sourceEventId时可选择展示该已发生事件，但不得猜细节。62/100提前死亡时解释“还有多少寿元，但因已记录的某风险提前结束”；寿尽才说寿元尽。既有category不能一概“原因尚未明确”。
人生书显示“当时遇到了什么→作了什么选择→实际得到/失去什么→这件事留下什么→如何死去”；不能将开场body当作已结算结局，也不能用所有事件数冒充人生转折。旧档无choiceId明确标未记录。没有真实跨世继承时不得说已经继承修为/神器。
重要提示：新 Content 对旧 content01.v1 的事件选项和效果改动是breaking；无论这次是否修改version，**本任务禁止部署生产**，必须在后续单独提交受控的旧局保护或测试存档处置方案并等用户批准。现有生产无四集合备份，不允许假定可以删库。

## 8. 只做一次、分阶段实施
A 基线：读上述源码和66场审计，不全仓漫游；跑下文18局样本的before记录。
B 实现：UI成长→20场选项语义/结算授权→风险与人生书→关联NPC/Build/Cause。只改变合同必须的代码。
C 行为：同18局相同seed比较 after，主动检测凡人到老、时间空循环、莫名死亡、假关系/收益、重复结果。FAIL在限定工作内修真实根因，不删失败seed凑绿。
D 验证：新增真实路径的定向suite，既有touched seam suite，typecheck一次、相关派生资源freshness一次，详见自动验收规范。
E 报告：docs/PLAYFEEL01-AUTOPLAY-REPORT.md、事件审计、LAST_RESULT和本次所有提交，推送唯一work branch，停下等待Controller审核。不运行600局，不跑aggregate npm test，不自动派新任务。
如设计与冻结契约或确定性回放冲突：必须报告准确BLOCKED_CONTRACT示例，不能悄悄改变旧约束或假造PASS。

## 9. 后续方向（本任务不自动实施）
20场验证后由Controller看自动化证据，再决策其余46场结算深化、宗门/功法/经济/战斗、跨世继承、长期剧情内容和视觉美术；不让WorkBuddy自定PLAYFEEL02。用户最后试玩是产品体验确认，不是研发团队第一次发现逻辑问题的方式。
