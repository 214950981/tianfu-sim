# PLAYFEEL01 自动化可玩性验收（Controller冻结）
2026-10-09。目的是**主动发现游戏不好玩**，并将失败种子和因果留给Controller，而非每轮问用户再玩。

## 1. 基准/对照
参考已存在的 content-sim.ts、tests/playux01b.test.mjs、tests/progression.test.mjs、tests/replay.test.mjs，调用实际CommandGateway/reducer/selectDirectorEvent，不手造每次收益。A阶段保留before，C阶段同seed的after。不得用 UI 模拟空壳替代服务端真实结算。
固定6个seeds: 3、7、11、19、23、31，3种策略共18条短局，每局最多24次核心行动（总上限432次），非600-run simulation：
- guided-cultivator：闭关、查看修为满足条件即合法尝试突破，失败继续准备，允许少量游历。
- curious-traveler：以游历追索为主，六次行动里至少一次闭关，检验“有目标/危险与相应回报”，不要求全部突破。
- social-causality：入世追索、优先选已登记NPC/Cause，核验因果延续，不能对没抽到的事件伪造剧情。
覆盖天赋较强、普通、较差的已注册灵根fixture。每次输出状态：age/maxAge、realm/修为、action、eventId、choiceId、nodeIndex、已公开effects、actualNPC/Cause/Build、warning、deathRecord、commandId/stateVersion。

## 2. 体验硬门
G1-新手成长：首页显示灵根与境界、修为/10000、剩余寿命、突破条件，满修为时只允许真正合法的突破按钮；引导型策略首次突破尝试入口应在8次核心行动以内可见，失败可以被恢复。不允许静默自动成功或增送无法解释的修为。
G2-66场审计：逐条事件效果分类；首20场所有合法options和tier具备结算叙事，文本须以实际效应为依据且40–120汉字；二十场中最多四场只有时间差异。禁止无来源money/cultivation、未记录NPC交往、虚构长期线索。
G3-选择差异：至少一次NPC/Cause实际源头→后续回声，另一次Build修炼分支→后续真实加成或实际事件。两条都须以固定seed/命令记录重现。仅文案不同不是差异。
G4-结算：同一事件选择后面板显示事件/选择/已经发生的过程/真实属性得失/已有公开的后续；测试CommandGateway→transport→controller→页面。重复同commandId exactly-once、关闭结果面板无命令、刷新不会出现假奖励。
G5-死亡：固定样本有寿尽和风险致死；页面类别和可公开来源解释准确，未到maxAge而死不得归类寿尽。LIFE_BOOK不重复事件开场作为历史结算，不出现未知原始key。
G6-可玩性反例：任何“连续5次只有岁月变化”“始终凡人且无突破目标”“3个选项所有效果相同”“答应救人但未有NPC事实还宣称朋友”“因果已生但从不出现后续”“没有死因类别的突然死亡”“玩家看到第N版”列FAIL，必须修根因并保留失败seed，不允许放宽断言。
G7-技术：固定seed ruleStateHash与replay一致，不破坏NPC实例id和Cause closure，致死警示先于选择；typecheck定向，受影响核心/进阶/风险/Director/Content/PLAYUX/ViewModel suites去重至一次，敏感信息扫描，派生产物audit一轮；不得重跑全仓/600局。已有ui04b陈旧守卫独立披露，不通过“改PIN”凑绿。

## 3. Report固定格式
- Before/After同18局指标：突破尝试中位节点、死亡年龄/原因、20场机械同质率、首次真实NPC/因果、首8次修炼目标可见性；既有数据若不可观测就明确NOT_MEASURABLE而非编造。
- 66事件全表的20/46处理清单，指出每个选项效果对齐证据。
- 3篇最多300字的重现局日志：有目标的新手、实际因果链、风险/寿命死亡。逐步记录事实，不写宣传性AI故事。
- 测试项目/通过失败/不测项/工作分支SHA和exact Git祖先、受改文件、兼容性限制；完毕停下等待Controller。
- 用户不需要本轮反复提交截图，不部署线上的tianfu2。
