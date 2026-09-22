import type { ActionType } from "../../core/src/state.ts";
import { sealContentPack, REPEAT_SENSITIVE_EFFECT_OPS, type ChoiceDefinition, type ContentPack, type EffectSpec, type EventDefinition } from "./registry.ts";

type Participant = NonNullable<EventDefinition["participants"]>[number];
type Closure = "engage-resolves" | "leave-resolves" | "engage-resolves-consider-expires";
type Spec = {
  id: string; title: string; summary: string; actions?: ActionType[]; salience: 1 | 2 | 3 | 4 | 5; topic: string;
  continuity: string[]; build?: "sword" | "body" | "alchemy" | "fortune"; npcRole?: string; onboarding?: boolean;
  participant?: Participant; risk?: string; effects?: EffectSpec[]; origins?: Array<{ templateId: string; salience: 1 | 2 | 3 | 4 | 5; label: string }>;
  cooldown?: NonNullable<EventDefinition["cooldown"]>; closure?: Closure;
};

// LOOPFIX02B1 recurrence: once-per-run Cause origins cap repeat planting; repeatable P4 and echo Events space themselves.
const oncePerRun: NonNullable<EventDefinition["cooldown"]> = { maxOccurrences: 1 };
const spaced = (minNodesBetween: number): NonNullable<EventDefinition["cooldown"]> => ({ minNodesBetween });
const repeatable = (spec: Spec): boolean => spec.cooldown !== undefined && spec.cooldown.maxOccurrences !== 1;
const declared = (spec: Spec) => (effects: EffectSpec[]): EffectSpec[] => effects.map((effect) => repeatable(spec) && REPEAT_SENSITIVE_EFFECT_OPS.has(effect.op) ? { ...effect, repeatBehavior: "allow-cumulative" } as EffectSpec : effect);

export const CONTENT01_VERSION = "content01.v1";
export const CONTENT01_ZH_CN: Record<string, string> = {};
const text = (key: string, value: string): string => { CONTENT01_ZH_CN[key] = value; return key; };
const buildEffect = (build: NonNullable<Spec["build"]>, amount = 900): EffectSpec => ({ op: "ADD_BUILD_EVIDENCE", buildId: `build.${build}`, amount, reasonTag: `content01.${build}` });
const participant = (slot: string, kind: "core" | "generated", id: string): Participant => kind === "core" ? { slot, source: { kind, npcDefinitionId: id } } : { slot, source: { kind, archetypeId: id } };
const core = (id: string): Participant => participant("actor", "core", `content01.npc.${id}`);
const generated = (id: string): Participant => participant("actor", "generated", `content01.archetype.${id}`);

// LOOPFIX02B2 closure: every normal choice on a Cause-linked echo Event drives the exact Cause instance that
// P3 selected for this scene to a terminal state. The reference is always the triggering-Cause selector, never
// an author-time causeId: the runtime causeId embeds the planting commandId, so content cannot know it, and a
// templateId-shaped guess would close the wrong instance once one template has several actor-bound Causes.
// "engage" and "consider" engage with the remembered matter and resolve it; "leave" declines it and expiry is
// the honest outcome, because a Cause never quietly disappears. On the loss-flavoured echoes the closing act is
// itself the resolve, so those deliberately close through RESOLVE_CAUSE on every choice instead of expiring.
const LEAVE_RESOLVES = new Set(["content01.xu.empty-courtyard", "content01.xu.promise-echo"]);
const closeLeaveEffect = (spec: Spec): EffectSpec[] => LEAVE_RESOLVES.has(spec.id) ? [{ op: "RESOLVE_CAUSE", triggeringCause: true }] : [{ op: "EXPIRE_CAUSE", triggeringCause: true }];
// Closure effects ride every outcome tier of every normal choice. RESOLVE_CAUSE / EXPIRE_CAUSE are repeat-sensitive,
// so on a repeatable echo they carry the same explicit allow-cumulative declaration the recurrence contract
// already demands. On a once-per-run echo the declaration is neither needed nor legal.
const engageEffect = (spec: Spec): EffectSpec[] => declared(spec)([{ op: "RESOLVE_CAUSE", triggeringCause: true }]);
function choices(spec: Spec): ChoiceDefinition[] {
  const declare = declared(spec);
  const close = spec.closure === undefined ? (): EffectSpec[] => [] : (): EffectSpec[] => engageEffect(spec);
  const closeLeave = spec.closure === undefined ? (): EffectSpec[] => [] : (): EffectSpec[] => declared(spec)(closeLeaveEffect(spec));
  const safePrimary: EffectSpec[] = declare(spec.effects ?? (spec.build === undefined ? [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 2 }] : [buildEffect(spec.build)]));
  if (spec.origins !== undefined) return [
    ...spec.origins.map((origin, index): ChoiceDefinition => ({
      id: `bind-${index + 1}`, scope: "core", labelKey: text(`${spec.id}.choice.bind-${index + 1}`, origin.label),
      outcomes: { success: { effects: declare([{ op: "ADD_CAUSE", templateId: origin.templateId, salience: origin.salience, visibility: "hint", actorBindingKeys: { actor: "actor" } }, ...(spec.build === undefined ? [] : [buildEffect(spec.build, 700)]), { op: "ADD_NPC_SIGNIFICANCE", actorBindingKey: "actor", amount: 500, reasonTag: "npc.reason.cause" }]) } }
    })),
    { id: "decline", scope: "core", labelKey: text(`${spec.id}.choice.decline`, "留一句话离开"), outcomes: { success: { effects: declare([{ op: "ADD_CULTIVATION", amount: 120 }]) } } }
  ];
  if (spec.risk !== undefined) return [
    { id: "take-risk", scope: "core", labelKey: text(`${spec.id}.choice.take-risk`, "承担此险"), threatId: spec.risk, ...(repeatable(spec) ? { riskRepeatBehavior: "allow-repeat-resolution" as const } : {}), outcomes: { success: { effects: safePrimary }, costlySuccess: { effects: safePrimary }, failure: { effects: declare([{ op: "ADD_CULTIVATION", amount: 60 }]) } } },
    { id: "read-signs", scope: "core", labelKey: text(`${spec.id}.choice.read-signs`, "先辨征兆"), outcomes: { success: { effects: [...declare([{ op: "ADD_CULTIVATION", amount: 180 }]), ...close()] } } },
    { id: "turn-away", scope: "core", labelKey: text(`${spec.id}.choice.turn-away`, "及时折返"), outcomes: { success: { effects: [...declare([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]), ...closeLeave()] } } }
  ];
  const npcEffect: EffectSpec[] = declare(spec.participant === undefined ? [] : [{ op: "ADJUST_NPC_RELATION", actorBindingKey: "actor", affinityDelta: 6, trustDelta: 4, reasonTag: "npc.reason.event" }]);
  return [
    { id: "engage", scope: "core", labelKey: text(`${spec.id}.choice.engage`, spec.build === undefined ? "顺势而行" : "依此磨炼"), outcomes: { success: { effects: [...safePrimary, ...npcEffect, ...close()] } } },
    { id: "consider", scope: "core", labelKey: text(`${spec.id}.choice.consider`, "停步细看"), outcomes: { success: { effects: [...declare([{ op: "ADD_CULTIVATION", amount: 150 }]), ...close()] } } },
    { id: "leave", scope: "core", labelKey: text(`${spec.id}.choice.leave`, "见好便收"), outcomes: { success: { effects: [...declare([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]), ...closeLeave()] } } }
  ];
}

function event(spec: Spec): EventDefinition {
  const titleKey = text(`${spec.id}.title`, spec.title); const bodyKey = text(`${spec.id}.body`, `${spec.summary}你可以顺势而行，也可以停下来辨清代价；此刻的取舍不会喧哗，却会在往后的年月留下形状。`);
  return {
    id: spec.id, version: 1, kind: spec.risk === undefined ? "choice" : "combat", titleKey,
    tags: ["content01", ...(spec.onboarding ? ["onboarding"] : []), ...(spec.actions === undefined ? ["ordinary"] : []), ...(spec.build === undefined ? [] : [`build-${spec.build}`]), ...(spec.npcRole === undefined ? [] : [`npc-${spec.npcRole}`]), ...(spec.risk === undefined ? [] : ["risk"]), ...(spec.origins === undefined ? [] : ["cause-origin"])],
    weight: 100, ...(spec.actions === undefined ? {} : { actionAffinity: spec.actions }),
    directorHints: { salience: spec.salience, baseWeight: spec.onboarding ? 130 : 100, topicTags: [spec.topic], continuityTags: spec.continuity, buildAffinityTags: spec.build === undefined ? [] : [spec.build], npcRoleAffinityTags: spec.npcRole === undefined ? [] : [spec.npcRole], worldAffinityTags: [], ...(spec.onboarding ? { onboardingEligible: true } : {}) },
    ...(spec.participant === undefined ? {} : { participants: [spec.participant] }), ...(spec.cooldown === undefined ? {} : { cooldown: spec.cooldown }), choices: choices(spec), fallback: { bodyKey }
  };
}

const onboarding: Spec[] = [
  { id: "content01.onboarding.first-breath", title: "初息", summary: "晨雾尚未散尽，你第一次把纷乱心绪收进一呼一吸之间。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["cultivation"], onboarding: true },
  { id: "content01.onboarding.mountain-road", title: "山路", summary: "一条山路分向林深与村郭，两边都有人走过，却没有人为你担保。", actions: ["travel"], salience: 2, topic: "travel", continuity: ["exploration"], onboarding: true },
  { id: "content01.onboarding.market-choice", title: "早市", summary: "早市里灵石与人情一同流转，摊主的话半真半假，买卖之外还有眼色。", actions: ["worldly"], salience: 2, topic: "trade", continuity: ["human-world"], onboarding: true },
  { id: "content01.onboarding.old-trace", title: "旧痕", summary: "石壁上一道旧痕延伸进荒草，来处模糊，去处也未必值得追。", actions: ["pursuit"], salience: 2, topic: "secret", continuity: ["exploration"], onboarding: true },
  { id: "content01.onboarding.rain-shelter", title: "避雨", summary: "骤雨把几名陌生人困在同一檐下，沉默比寒意更先试探彼此。", actions: ["travel", "worldly"], salience: 1, topic: "trust", continuity: ["travel"], onboarding: true },
  { id: "content01.onboarding.quiet-retreat", title: "静室", summary: "静室里没有异象，只有一次次走神与重新坐定，修行显得朴素而漫长。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["discipline"], onboarding: true },
  { id: "content01.onboarding.roadside-injury", title: "路边伤者", summary: "路边有人捂着伤口，血已经止住，他仍警惕每一双靠近的手。", actions: ["worldly"], salience: 2, topic: "injury", continuity: ["trust"], onboarding: true, participant: generated("mortal-traveler") },
  { id: "content01.onboarding.forked-path", title: "岔路", summary: "你追寻的线索在此分成两股，一股清楚，一股更像有意留下的诱饵。", actions: ["pursuit"], salience: 2, topic: "opportunity", continuity: ["secret"], onboarding: true }
];

const ordinary: Spec[] = [
  { id: "content01.ordinary.tea-house", title: "半盏茶", summary: "小镇茶棚只剩半壶温茶，邻桌的人谈论一场与你无关的远行。", salience: 1, topic: "human-world", continuity: ["travel"] },
  { id: "content01.ordinary.ferry-wait", title: "候渡", summary: "河雾压住渡口，船家不肯冒险开船，所有人只得等水声慢下来。", salience: 1, topic: "travel", continuity: ["human-world"] },
  { id: "content01.ordinary.missed-letter", title: "迟信", summary: "一封辗转多地的旧信终于到了手中，纸角磨损，寄信人未留下回址。", salience: 2, topic: "memory", continuity: ["promise"] },
  { id: "content01.ordinary.broken-bridge", title: "断桥", summary: "山洪冲断木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。", salience: 2, topic: "trust", continuity: ["human-world"] },
  { id: "content01.ordinary.night-rain", title: "夜雨", summary: "夜雨敲窗，你想起数年前一次仓促告别，那句话至今没有说完。", salience: 1, topic: "memory", continuity: ["loss"] },
  { id: "content01.ordinary.roadside-debate", title: "道旁争言", summary: "两名修士为一条旧规争得面红耳赤，围观者各有私心，却都说为了公道。", salience: 2, topic: "rivalry", continuity: ["human-world"], participant: generated("wandering-cultivator") },
  { id: "content01.ordinary.empty-search", title: "空寻", summary: "你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。", salience: 1, topic: "exploration", continuity: ["secret"] },
  { id: "content01.ordinary.shared-fire", title: "同火", summary: "荒野风紧，陌生旅人分出半边篝火，彼此都没有追问来历。", salience: 2, topic: "trust", continuity: ["travel"], participant: generated("mortal-traveler") },
  { id: "content01.ordinary.market-bargain", title: "小交易", summary: "行商修士摆出几味寻常药材，真正要交换的却是一条路况消息。", salience: 2, topic: "trade", continuity: ["opportunity"], participant: generated("merchant-cultivator") },
  { id: "content01.ordinary.mountain-view", title: "山色", summary: "登高之后并无奇遇，只有群山在暮色里一层层远去，呼吸也随之平缓。", salience: 1, topic: "cultivation", continuity: ["travel"] },
  { id: "content01.ordinary.harvest-help", title: "收谷", summary: "村人赶在风雨前收谷，人手不足，修士的一日也能换来许多凡俗年月。", salience: 2, topic: "human-world", continuity: ["time"], participant: generated("mortal-traveler") },
  { id: "content01.ordinary.old-song", title: "旧曲", summary: "客栈角落有人弹起旧曲，旋律并不精妙，却让几位过客同时安静下来。", salience: 1, topic: "memory", continuity: ["human-world"] }
];

const npcEvents: Spec[] = [
  { id: "content01.pei.broken-blade", title: "断剑客", summary: "裴照川把断剑横在膝上，他谈的是同行，不是收徒，也没有先许下情分。", actions: ["travel", "worldly"], salience: 3, topic: "promise", continuity: ["rivalry", "sword"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), origins: [{ templateId: "content01.cause.broken-sword-promise", salience: 4, label: "与他定约" }, { templateId: "content01.cause.broken-sword-rivalry", salience: 3, label: "以剑相争" }], cooldown: oncePerRun },
  { id: "content01.pei.sparring-rain", title: "雨中试剑", summary: "雨线斜落，裴照川只问你是否还愿意拔剑，胜负之外还要看你如何收手。", actions: ["cultivate", "pursuit"], salience: 3, topic: "rivalry", continuity: ["sword", "promise"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4), closure: "engage-resolves" },
  { id: "content01.pei.old-wound", title: "旧伤复作", summary: "裴照川行至半坡忽然停步，旧伤让他的右手微颤，他却不肯把决定交给旁人。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["sword", "trust"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), risk: "threat.critical-injury", cooldown: spaced(5) },
  { id: "content01.pei.promise-echo", title: "剑约未冷", summary: "多年后那柄断剑仍在，裴照川没有复述旧约，只把另一条路摆到你面前。", salience: 4, topic: "promise", continuity: ["sword", "rivalry"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4), closure: "engage-resolves" },

  { id: "content01.jiang.herb-price", title: "药有其价", summary: "姜雪芜替人止住伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["debt", "trust"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), origins: [{ templateId: "content01.cause.medicine-debt", salience: 3, label: "认下药债" }], cooldown: oncePerRun },
  { id: "content01.jiang.night-clinic", title: "夜诊", summary: "夜深后仍有人敲门，姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面。", actions: ["worldly", "cultivate"], salience: 3, topic: "medicine", continuity: ["injury", "human-world"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4) },
  { id: "content01.jiang.bitter-decoction", title: "苦汤", summary: "一锅药汤气味辛烈，姜雪芜提醒其中一味药性相冲，省事与稳妥不能两全。", actions: ["cultivate"], salience: 3, topic: "medicine", continuity: ["danger", "alchemy"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), risk: "threat.poison", cooldown: spaced(5) },
  { id: "content01.jiang.debt-echo", title: "旧账新页", summary: "姜雪芜翻到旧账那一页，没有催促，只问你如今是否仍认得当年的代价。", salience: 3, topic: "debt", continuity: ["medicine", "promise"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4), closure: "engage-resolves" },

  { id: "content01.cen.shoulder-road", title: "并肩负伤", summary: "岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走。", actions: ["travel", "worldly"], salience: 4, topic: "injury", continuity: ["trust", "body"], build: "body", npcRole: "body", participant: core("cen-bugui"), origins: [{ templateId: "content01.cause.shared-wound", salience: 4, label: "与他同行" }], cooldown: oncePerRun },
  { id: "content01.cen.stone-steps", title: "负石登阶", summary: "岑不归背石登阶，每一步都极慢。他不劝你跟上，只在山腰留了一瓢清水。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body", "cultivation"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4) },
  { id: "content01.cen.shield-stranger", title: "以身护人", summary: "乱石落下时，岑不归已经站到最窄的缺口。他看向你，等一个共同承担的决定。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["body", "trust"], build: "body", npcRole: "body", participant: core("cen-bugui"), risk: "threat.combat", cooldown: spaced(5) },
  { id: "content01.cen.shared-echo", title: "伤痕相认", summary: "旧伤在阴雨里同时发作，岑不归看见你按住肩头，便知道那一日没有被忘记。", salience: 3, topic: "injury", continuity: ["body", "memory"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4), closure: "engage-resolves" },

  { id: "content01.xie.secret-map", title: "半张秘图", summary: "谢听潮摊开半张秘图，另一半仍在袖中。他愿意分路，也要求先说清如何分利。", actions: ["pursuit", "travel"], salience: 4, topic: "secret", continuity: ["trust", "fortune"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), origins: [{ templateId: "content01.cause.secret-map-pact", salience: 4, label: "立约同行" }, { templateId: "content01.cause.secret-map-breach", salience: 4, label: "暗留后手" }], cooldown: oncePerRun },
  { id: "content01.xie.cave-gamble", title: "洞口风声", summary: "洞口吹出的风带着金石气，谢听潮判断里面有路，也坦言判断可能错。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), risk: "threat.dangerous-exploration", cooldown: spaced(5) },
  { id: "content01.xie.divided-spoils", title: "分利", summary: "所得不如预想，谢听潮仍按旧话分成，只把最后一件用途不明的东西留在中央。", actions: ["worldly"], salience: 3, topic: "trust", continuity: ["fortune", "promise"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), cooldown: spaced(4), closure: "leave-resolves" },
  { id: "content01.xie.map-echo", title: "图上旧折", summary: "秘图旧折痕与眼前山势重合，谢听潮没有催你，只把当初说过的话轻轻念了一遍。", salience: 4, topic: "secret", continuity: ["promise", "exploration"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), cooldown: spaced(4), closure: "engage-resolves" },

  { id: "content01.xu.mortal-letter", title: "人间来信", summary: "许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。", actions: ["worldly", "pursuit"], salience: 3, topic: "human-world", continuity: ["promise", "time"], npcRole: "mortal", participant: core("xu-changan"), origins: [{ templateId: "content01.cause.mortal-promise", salience: 4, label: "答应归去" }], cooldown: oncePerRun },
  { id: "content01.xu.ten-year-return", title: "十年重逢", summary: "你眼中的数次闭关，已是许长安鬓边的一层霜。他仍认得你，也不假装岁月轻巧。", actions: ["worldly"], salience: 4, topic: "time", continuity: ["memory", "human-world"], npcRole: "mortal", participant: core("xu-changan"), cooldown: spaced(5) },
  { id: "content01.xu.empty-courtyard", title: "空院", summary: "院门仍旧，檐下却积了厚灰。邻人只说许长安早已离开，没有人知道他最后去了哪里。", actions: ["pursuit"], salience: 4, topic: "loss", continuity: ["time", "promise"], npcRole: "mortal", participant: core("xu-changan"), effects: [{ op: "SET_NPC_STATUS", actorBindingKey: "actor", targetStatus: "departed", revealToPlayer: true, reasonTag: "npc.reason.status" }], cooldown: spaced(4), closure: "leave-resolves" },
  { id: "content01.xu.promise-echo", title: "树下旧诺", summary: "旧树又添一圈年轮，你终于站回门前；许长安是否还在，已不再是唯一的问题。", salience: 4, topic: "promise", continuity: ["time", "memory"], npcRole: "mortal", participant: core("xu-changan"), cooldown: spaced(4), closure: "leave-resolves" }
];

const buildEvents: Spec[] = [
  { id: "content01.build.sword.river-cut", title: "截流一剑", summary: "山涧暴涨，石上只容一步，你要用剑开的不是敌人，而是一线可过之路。", actions: ["cultivate", "travel"], salience: 3, topic: "danger", continuity: ["sword"], build: "sword" },
  { id: "content01.build.sword.no-draw", title: "剑未出鞘", summary: "对方故意激你拔剑，真正难的并非出手，而是判断这一剑是否值得。", actions: ["worldly"], salience: 2, topic: "rivalry", continuity: ["sword"], build: "sword" },
  { id: "content01.build.sword.guard-caravan", title: "护行", summary: "商队只求平安过岭，剑锋若太快，可能把原本能谈的局面推向死斗。", actions: ["travel"], salience: 3, topic: "trust", continuity: ["sword", "human-world"], build: "sword" },
  { id: "content01.build.body.boulder", title: "移石", summary: "巨石堵住山道，术法并非唯一办法，筋骨与耐心也能一点点挪开困局。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body"], build: "body" },
  { id: "content01.build.body.cold-water", title: "寒潭", summary: "寒潭入骨，继续停留能磨炼气血，也可能让旧伤在夜里更深一分。", actions: ["cultivate"], salience: 3, topic: "injury", continuity: ["body", "danger"], build: "body" },
  { id: "content01.build.body.carry-wounded", title: "背人下山", summary: "伤者无法再走，山路仍长。背起一个人，意味着把自己的退路也交给脚下。", actions: ["travel", "worldly"], salience: 3, topic: "trust", continuity: ["body", "injury"], build: "body" },
  { id: "content01.build.alchemy.herb-sort", title: "辨草", summary: "三种药草外形近似，药性却相反，耐心辨认比一炉昂贵丹火更要紧。", actions: ["cultivate", "pursuit"], salience: 2, topic: "medicine", continuity: ["alchemy"], build: "alchemy" },
  { id: "content01.build.alchemy.fever", title: "退热", summary: "村中热症蔓延，没有珍稀灵药，只有有限草药与一夜不能出错的照看。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["human-world", "alchemy"], build: "alchemy" },
  { id: "content01.build.alchemy.failed-brew", title: "废炉", summary: "药液颜色偏了一线，这炉已不能救人；承认失败，比把它勉强端出去更难。", actions: ["cultivate"], salience: 2, topic: "loss", continuity: ["alchemy", "discipline"], build: "alchemy" },
  { id: "content01.build.fortune.fork", title: "偏僻岔路", summary: "熟路能按时抵达，偏路却留下新鲜蹄印；未知并不等同于好运，也不等同于坏事。", actions: ["travel", "pursuit"], salience: 2, topic: "opportunity", continuity: ["fortune", "exploration"], build: "fortune" },
  { id: "content01.build.fortune.hidden-stream", title: "石下清泉", summary: "你在无人在意的石缝听见水声，继续挖掘可能一无所获，也可能改写整段行程。", actions: ["pursuit"], salience: 3, topic: "secret", continuity: ["fortune", "exploration"], build: "fortune" },
  { id: "content01.build.fortune.empty-hand", title: "空手而归", summary: "等待多日的机缘没有出现，真正留下的是你如何面对落空与下一次选择。", actions: ["cultivate", "pursuit"], salience: 2, topic: "loss", continuity: ["fortune", "discipline"], build: "fortune" }
];

const riskEvents: Spec[] = [
  { id: "content01.risk.pine-ambush", title: "松林伏影", summary: "松针忽然停止落下，前路有人藏住呼吸，退路也在一点点合拢。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["exploration"], risk: "threat.ambush" },
  { id: "content01.risk.ruin-depth", title: "遗迹深处", summary: "石阶向下延伸，壁灯早已熄灭，回声却比你的脚步多出一次。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], risk: "threat.dangerous-exploration" },
  { id: "content01.risk.poison-mist", title: "青雾", summary: "谷底升起淡青雾气，草叶边缘已经发黑，绕路要多耗数日。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["medicine"], risk: "threat.poison" },
  { id: "content01.risk.curse-stone", title: "无字碑", summary: "无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。", actions: ["pursuit"], salience: 4, topic: "secret", continuity: ["danger"], risk: "threat.curse" },
  { id: "content01.risk.critical-crossing", title: "负伤渡河", summary: "伤势未稳，河水又在上涨；此刻强渡，危险来自水势，也来自身体本身。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["danger"], risk: "threat.critical-injury" },
  { id: "content01.risk.revenge-shadow", title: "旧怨追来", summary: "有人沿着旧日冲突留下的线索追来，来者不问解释，只确认你的名字。", actions: ["pursuit", "worldly"], salience: 4, topic: "rivalry", continuity: ["danger", "memory"], risk: "threat.cause-revenge" },
  { id: "content01.risk.falling-star", title: "坠星", summary: "夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。", actions: ["travel", "pursuit"], salience: 5, topic: "danger", continuity: ["opportunity"], risk: "threat.special-catastrophe" },
  { id: "content01.risk.beast-trail", title: "兽迹", summary: "新鲜兽迹绕过营地三次，猎物与猎手的位置，可能在下一步互换。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["survival"], risk: "threat.combat" },
  { id: "content01.risk.flood-cave", title: "涨水洞", summary: "洞中水位正在上升，深处微光尚未消失，留给你判断的时间不多。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["danger", "opportunity"], risk: "threat.dangerous-exploration" },
  { id: "content01.risk.broken-seal", title: "残封", summary: "封印裂口只容一线气息外泄，那气息古老而清醒，像在等待回应。", actions: ["cultivate", "pursuit"], salience: 5, topic: "secret", continuity: ["danger", "cultivation"], risk: "threat.special-catastrophe" }
];

const roadCauseEvents: Spec[] = [
  { id: "content01.road.help", title: "扶一程", summary: "同行的陌生修士在坡前力竭，他没有求救，只把行囊向身后挪了挪。", actions: ["travel", "worldly"], salience: 2, topic: "trust", continuity: ["travel"], participant: generated("wandering-cultivator"), origins: [{ templateId: "content01.cause.road-kindness", salience: 2, label: "扶他一程" }], cooldown: oncePerRun },
  { id: "content01.road.conflict", title: "窄路相争", summary: "狭窄山道只容一人先过，对面的修士不肯退，你也看不出他是否另有所图。", actions: ["travel"], salience: 3, topic: "rivalry", continuity: ["travel", "trust"], participant: generated("dangerous-cultivator"), origins: [{ templateId: "content01.cause.road-conflict", salience: 3, label: "记下此争" }], cooldown: oncePerRun },
  { id: "content01.road.kindness-echo", title: "故人递伞", summary: "多年后雨又落下，一把伞从身侧递来；那张脸比记忆成熟，旧日一程仍被记得。", salience: 3, topic: "memory", continuity: ["trust", "travel"], cooldown: spaced(4), closure: "engage-resolves" },
  { id: "content01.road.conflict-echo", title: "旧路再逢", summary: "同一条窄路上，你再次看见熟悉身影；当年的争执已经长出新的分量。", salience: 3, topic: "rivalry", continuity: ["memory", "travel"], cooldown: spaced(4), closure: "engage-resolves" }
];

export const CONTENT01_EVENTS: EventDefinition[] = [...onboarding, ...ordinary, ...npcEvents, ...buildEvents, ...riskEvents, ...roadCauseEvents].map(event);

export const CONTENT01_CAUSE_CHAINS = [
  { id: "broken-sword", templates: ["content01.cause.broken-sword-promise", "content01.cause.broken-sword-rivalry"] },
  { id: "medicine-debt", templates: ["content01.cause.medicine-debt"] },
  { id: "shared-wound", templates: ["content01.cause.shared-wound"] },
  { id: "secret-map", templates: ["content01.cause.secret-map-pact", "content01.cause.secret-map-breach"] },
  { id: "mortal-promise", templates: ["content01.cause.mortal-promise", "content01.cause.mortal-missed"] },
  { id: "road-connection", templates: ["content01.cause.road-kindness", "content01.cause.road-conflict"] }
] as const;

export const CONTENT01_CAUSE_TEMPLATES = [
  { id: "content01.cause.broken-sword-promise", salience: 4, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["promise", "sword"], linkedEventIds: ["content01.pei.promise-echo"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.broken-sword-rivalry", salience: 3, maturity: { minNodeDelta: 1 }, actors: [{ role: "actor", required: true }], themes: ["rivalry", "sword"], linkedEventIds: ["content01.pei.sparring-rain"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.medicine-debt", salience: 3, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["medicine", "debt"], linkedEventIds: ["content01.jiang.debt-echo"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.shared-wound", salience: 4, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["injury", "trust"], linkedEventIds: ["content01.cen.shared-echo"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.secret-map-pact", salience: 4, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["secret", "trust"], linkedEventIds: ["content01.xie.map-echo"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.secret-map-breach", salience: 4, maturity: { minNodeDelta: 1 }, actors: [{ role: "actor", required: true }], themes: ["secret", "rivalry"], linkedEventIds: ["content01.xie.divided-spoils"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.mortal-promise", salience: 4, maturity: { minAgeDeltaYears: 5, minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["promise", "time"], linkedEventIds: ["content01.xu.promise-echo"], onActorUnavailable: { action: "transform", targetCauseTemplateId: "content01.cause.mortal-missed" } },
  { id: "content01.cause.mortal-missed", salience: 3, maturity: { minNodeDelta: 1 }, actors: [{ role: "actor", required: true }], themes: ["loss", "memory"], linkedEventIds: ["content01.xu.empty-courtyard"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.road-kindness", salience: 2, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["trust", "travel"], linkedEventIds: ["content01.road.kindness-echo"], onActorUnavailable: { action: "expire" } },
  { id: "content01.cause.road-conflict", salience: 3, maturity: { minNodeDelta: 2 }, actors: [{ role: "actor", required: true }], themes: ["rivalry", "travel"], linkedEventIds: ["content01.road.conflict-echo"], onActorUnavailable: { action: "expire" } }
] satisfies ContentPack["causeTemplates"];

const directorTags = ["alchemy", "body", "cultivation", "danger", "debt", "discipline", "exploration", "fortune", "healer", "human-world", "injury", "loss", "medicine", "memory", "mortal", "opportunity", "promise", "rivalry", "ruin-explorer", "secret", "survival", "sword", "time", "trade", "travel", "trust"];
const coreNpcIds = ["pei-zhaochuan", "jiang-xuewu", "cen-bugui", "xie-tingchao", "xu-changan"].map((id) => `content01.npc.${id}`);
const causeIds = CONTENT01_CAUSE_TEMPLATES.map((template) => template.id);

export const CONTENT01_PACK: ContentPack = sealContentPack({
  manifest: { schemaVersion: 2, packId: "tianfu.playable.v1", rulesVersion: "2.0.0", contentVersion: CONTENT01_VERSION },
  references: { items: [], components: [], npcTemplates: coreNpcIds, regions: ["region.green-river"], endings: [], causes: [...causeIds], conditions: [] },
  destinies: [
    { id: "content01.destiny.steady", version: 1, profile: "stable", titleKey: text("content01.destiny.steady.title", "守拙"), descriptionKey: text("content01.destiny.steady.body", "得一分安稳，也少一分骤进。"), advantage: { target: "insight", amount: 2, labelKey: text("content01.destiny.steady.advantage", "心思澄定") }, cost: { target: "fortune", amount: 1, labelKey: text("content01.destiny.steady.cost", "奇缘稍远") }, hook: { kind: "world", refId: "region.green-river", labelKey: text("content01.destiny.steady.hook", "青河旧路") } },
    { id: "content01.destiny.edge", version: 1, profile: "high-variance", titleKey: text("content01.destiny.edge.title", "临锋"), descriptionKey: text("content01.destiny.edge.body", "常在险处见路，也常在险处留伤。"), advantage: { target: "body", amount: 2, labelKey: text("content01.destiny.edge.advantage", "敢近锋芒") }, cost: { target: "maxAge", amount: 3, labelKey: text("content01.destiny.edge.cost", "岁数有折") }, hook: { kind: "person", refId: "content01.npc.pei-zhaochuan", labelKey: text("content01.destiny.edge.hook", "断剑之人") } },
    { id: "content01.destiny.echo", version: 1, profile: "story-hook", titleKey: text("content01.destiny.echo.title", "旧声"), descriptionKey: text("content01.destiny.echo.body", "有些相逢来得早，有些旧事回来得迟。"), advantage: { target: "fortune", amount: 2, labelKey: text("content01.destiny.echo.advantage", "因缘易见") }, cost: { target: "spiritStone", amount: 1, labelKey: text("content01.destiny.echo.cost", "行囊稍薄") }, hook: { kind: "person", refId: "content01.npc.xu-changan", labelKey: text("content01.destiny.echo.hook", "人间旧识") } }
  ],
  events: CONTENT01_EVENTS,
  causeTemplates: structuredClone(CONTENT01_CAUSE_TEMPLATES),
  progressionPackId: "progression.v1", riskPackId: "risk.v1", buildPackId: "build.v1", npcPackId: "npc.content01.v1", directorPackId: "director.v1", directorTags
});
