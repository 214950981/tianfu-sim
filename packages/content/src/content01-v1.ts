import type { ActionType } from "../../core/src/state.ts";
import { sealContentPack, REPEAT_SENSITIVE_EFFECT_OPS, type ChoiceDefinition, type ContentPack, type EffectSpec, type EventDefinition } from "./registry.ts";

type Participant = NonNullable<EventDefinition["participants"]>[number];
type Spec = {
  id: string; title: string; summary: string; actions?: ActionType[]; salience: 1 | 2 | 3 | 4 | 5; topic: string;
  continuity: string[]; build?: "sword" | "body" | "alchemy" | "fortune"; npcRole?: string; onboarding?: boolean;
  participant?: Participant; risk?: string; effects?: EffectSpec[]; origins?: Array<{ templateId: string; salience: 1 | 2 | 3 | 4 | 5; label: string }>;
  cooldown?: NonNullable<EventDefinition["cooldown"]>; closure?: true;
  /**
   * PLAYUX01 — the actions this scene genuinely suits when it is reached through the P6 ordinary
   * fallback. Unlike `actions`, these do NOT move the Event out of the ordinary index and do NOT
   * add scoring weight; they only narrow which action may draw it. `undefined` keeps the previous
   * whole-pool behaviour. A scene with two or more tags is an intentional cross-action moment.
   */
  ordinaryActions?: ActionType[];
  /** PLAYUX01 — scene-specific body. The shared boilerplate tail is no longer appended. */
  body?: string;
  /** PLAYUX01 — scene-specific options; each entry becomes one option with its own real effects. */
  choiceSet?: ChoiceSet;
};

/**
 * PLAYUX01 — a scene-specific option set. `label` is the Chinese text the player reads and
 * `effects` are the registered effects that choice actually settles. Order is the display order.
 */
type ChoiceSet = Array<{ id: string; label: string; effects: EffectSpec[] }>;

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

// LOOPFIX02B2 closure: every normal choice on a Cause-linked echo Event drives the exact Cause instance
// that P3 selected for this scene to a terminal state. The reference is always the triggering-Cause selector,
// never an author-time causeId: the runtime causeId embeds the planting commandId, so content cannot know it,
// and a templateId-shaped guess would close the wrong instance once one template has several actor-bound
// Causes alive. "engage" and "consider" engage with the remembered matter and resolve it; "leave" declines it,
// and expiry is the honest outcome because a Cause never quietly disappears. There is deliberately no per-Event
// exception: all ten Cause-linked echoes close the same way, so the rule stays one sentence long.
const closureEffect = (op: "RESOLVE_CAUSE" | "EXPIRE_CAUSE"): EffectSpec[] => [{ op, triggeringCause: true }];
// Closure effects ride every outcome tier of every normal choice. RESOLVE_CAUSE / EXPIRE_CAUSE are
// repeat-sensitive, so on a repeatable echo they carry the same explicit allow-cumulative declaration the
// recurrence contract already demands. On a once-per-run echo the declaration is neither needed nor legal,
// and no Cause-linked echo is once-per-run, so the declaration always applies here.
function choices(spec: Spec): ChoiceDefinition[] {
  const declare = declared(spec);
  const close = (op: "RESOLVE_CAUSE" | "EXPIRE_CAUSE"): EffectSpec[] => spec.closure === undefined ? [] : declare(closureEffect(op));
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
    { id: "read-signs", scope: "core", labelKey: text(`${spec.id}.choice.read-signs`, "先辨征兆"), outcomes: { success: { effects: declare([{ op: "ADD_CULTIVATION", amount: 180 }]) } } },
    { id: "turn-away", scope: "core", labelKey: text(`${spec.id}.choice.turn-away`, "及时折返"), outcomes: { success: { effects: declare([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]) } } }
  ];
  const npcEffect: EffectSpec[] = declare(spec.participant === undefined ? [] : [{ op: "ADJUST_NPC_RELATION", actorBindingKey: "actor", affinityDelta: 6, trustDelta: 4, reasonTag: "npc.reason.event" }]);
  // PLAYUX01 — an authored choiceSet replaces the generic engage/consider/leave trio entirely, so an
  // option's wording and its real effects are written together and cannot drift apart. Cause closure
  // is preserved: every option resolves the matter except the last, which declines it.
  if (spec.choiceSet !== undefined) { const last = spec.choiceSet.length - 1; return spec.choiceSet.map((choice, index): ChoiceDefinition => ({ id: choice.id, scope: "core", labelKey: text(`${spec.id}.choice.${choice.id}`, choice.label), outcomes: { success: { effects: [...declare(choice.effects), ...npcEffect, ...close(index === last ? "EXPIRE_CAUSE" : "RESOLVE_CAUSE")] } } })); }
  return [
    { id: "engage", scope: "core", labelKey: text(`${spec.id}.choice.engage`, spec.build === undefined ? "顺势而行" : "依此磨炼"), outcomes: { success: { effects: [...safePrimary, ...npcEffect, ...close("RESOLVE_CAUSE")] } } },
    { id: "consider", scope: "core", labelKey: text(`${spec.id}.choice.consider`, "停步细看"), outcomes: { success: { effects: [...declare([{ op: "ADD_CULTIVATION", amount: 150 }]), ...close("RESOLVE_CAUSE")] } } },
    { id: "leave", scope: "core", labelKey: text(`${spec.id}.choice.leave`, "见好便收"), outcomes: { success: { effects: [...declare([{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }]), ...close("EXPIRE_CAUSE")] } } }
  ];
}

function event(spec: Spec): EventDefinition {
  // PLAYUX01: the shared "你可以顺势而行……留下形状" tail is gone. A body is exactly what the author
  // wrote — an explicit `body` when present, otherwise the one-sentence summary. Nothing is appended.
  const titleKey = text(`${spec.id}.title`, spec.title); const bodyKey = text(`${spec.id}.body`, spec.body ?? spec.summary);
  return {
    id: spec.id, version: 1, kind: spec.risk === undefined ? "choice" : "combat", titleKey,
    tags: ["content01", ...(spec.onboarding ? ["onboarding"] : []), ...(spec.actions === undefined ? ["ordinary"] : []), ...(spec.build === undefined ? [] : [`build-${spec.build}`]), ...(spec.npcRole === undefined ? [] : [`npc-${spec.npcRole}`]), ...(spec.risk === undefined ? [] : ["risk"]), ...(spec.origins === undefined ? [] : ["cause-origin"])],
    weight: 100, ...(spec.actions === undefined ? {} : { actionAffinity: spec.actions }),
    directorHints: { salience: spec.salience, baseWeight: spec.onboarding ? 130 : 100, topicTags: [spec.topic], continuityTags: spec.continuity, buildAffinityTags: spec.build === undefined ? [] : [spec.build], npcRoleAffinityTags: spec.npcRole === undefined ? [] : [spec.npcRole], worldAffinityTags: [], ...(spec.onboarding ? { onboardingEligible: true } : {}), ...(spec.ordinaryActions === undefined ? {} : { ordinaryActionTags: spec.ordinaryActions }) },
    ...(spec.participant === undefined ? {} : { participants: [spec.participant] }), ...(spec.cooldown === undefined ? {} : { cooldown: spec.cooldown }), choices: choices(spec), fallback: { bodyKey }
  };
}

const onboarding: Spec[] = [
  { id: "content01.onboarding.first-breath", title: "初息", summary: "晨雾尚未散尽，你第一次把纷乱心绪收进一呼一吸之间。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["cultivation"], onboarding: true, body: "晨雾尚未散尽。你盘坐下来，第一次试着把纷乱心绪收进一呼一吸之间。气息刚走过第三个周天，胸口的滞涩提醒你：这一步还太急。你可以按原路继续行功，也可以先松开半分，或者就到此收功。", choiceSet: [{"id":"keep-driving","label":"照原路继续行功，把这口气推过去","effects":[{"op":"ADD_CULTIVATION","amount":220}]},{"id":"ease-off","label":"松开半分，改用更缓的呼吸","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stop-here","label":"就到这里收功，先记住这个节奏","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.mountain-road", title: "山路", summary: "一条山路分向林深与村郭，两边都有人走过，却没有人为你担保。", actions: ["travel"], salience: 2, topic: "travel", continuity: ["exploration"], onboarding: true, body: "一条山路在前方分成两股：靠林的一侧树影深，脚下有旧车辙；绕村的一侧路平些，能听见炊烟，没有新鲜的脚印。没有人为你担保，也没有人为你指路。要紧的是你此刻要赶路，还是要看得清楚。", choiceSet: [{"id":"take-ford","label":"走林边有车辙的那条近路","effects":[{"op":"ADD_CULTIVATION","amount":200},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"scout-ridge","label":"先爬上高处看清林里的情形","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"go-village","label":"绕去村里，按路平的那条走","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"OUTCOME_TIME_DELTA","years":2}]}] },
  { id: "content01.onboarding.market-choice", title: "早市", summary: "早市里灵石与人情一同流转，摊主的话半真半假，买卖之外还有眼色。", actions: ["worldly"], salience: 2, topic: "trade", continuity: ["human-world"], onboarding: true, body: "早市刚开。摊主报出的价钱比市价低了两成，可他没有说为什么低。你可以照他说的数买下，也可以压回一个公道价，或者先问问这批货的来路。", choiceSet: [{"id":"take-deal","label":"照他报的价买下，先把货拿到手","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":2}]},{"id":"haggle-fair","label":"压回一个公道价再成交","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"ADD_CULTIVATION","amount":140}]},{"id":"ask-source","label":"先问清这批货的来路再决定","effects":[{"op":"ADD_CULTIVATION","amount":160},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.old-trace", title: "旧痕", summary: "石壁上一道旧痕延伸进荒草，来处模糊，去处也未必值得追。", actions: ["pursuit"], salience: 2, topic: "secret", continuity: ["exploration"], onboarding: true, body: "石壁上一道旧痕延伸进荒草。来处已经模糊了，断口却很新——留下它的人不久之前还在这里。你可以沿着断口追进荒草，也可以先记下位置，或者转去问附近的人。", choiceSet: [{"id":"follow-fresh","label":"顺着新断口追进荒草","effects":[{"op":"ADD_CULTIVATION","amount":210},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"mark-spot","label":"先记下位置，不急于这一步","effects":[{"op":"ADD_CULTIVATION","amount":90},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-locals","label":"转去问附近的人有无异常","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.rain-shelter", title: "避雨", summary: "骤雨把几名陌生人困在同一檐下，沉默比寒意更先试探彼此。", actions: ["travel", "worldly"], salience: 1, topic: "trust", continuity: ["travel"], onboarding: true, body: "骤雨把几名陌生人困在同一檐下。雨声太大，说话要提高嗓门，反而没人先开口。沉默比寒意更先试探彼此：谁挪一挪，谁就先把话说出去了。", choiceSet: [
  {"id":"engage","label":"挪半个身位，先把伞递过去","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"consider","label":"靠着柱子不动，听这一场雨落完","effects":[{"op":"ADD_CULTIVATION","amount":80},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"雨脚一转就先行赶路","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"OUTCOME_TIME_DELTA","years":1}]}
] },
  { id: "content01.onboarding.quiet-retreat", title: "静室", summary: "静室里没有异象，只有一次次走神与重新坐定，修行显得朴素而漫长。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["discipline"], onboarding: true, body: "静室里没有异象，只有一次次走神与重新坐定。你数到第几遍时开始怀疑自己走了岔路。你可以照原样再坐一段，也可以换个法子重起一轮，或者今日就此收束。", choiceSet: [{"id":"sit-again","label":"照原样再坐一段，看能否坐稳","effects":[{"op":"ADD_CULTIVATION","amount":200}]},{"id":"change-method","label":"换个法子重起一轮行功","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"close-day","label":"今日就此收束，改日再来","effects":[{"op":"ADD_CULTIVATION","amount":70},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.roadside-injury", title: "路边伤者", summary: "路边有人捂着伤口，血已经止住，他仍警惕每一双靠近的手。", actions: ["worldly"], salience: 2, topic: "injury", continuity: ["trust"], onboarding: true, participant: generated("mortal-traveler"), body: "路边有人坐着捂住伤口。血已经止住，他仍盯着每一双靠近的手。你可以上前替他处理，也可以先站远些问清发生了什么，或者只记住这个人。", choiceSet: [{"id":"help-dress","label":"上前替他处理伤口","effects":[{"op":"ADD_CULTIVATION","amount":180},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.event"}]},{"id":"keep-distance","label":"先站远些问清他遇到了什么","effects":[{"op":"ADD_CULTIVATION","amount":120}]},{"id":"just-notice","label":"只记下这个人的样子，不去打扰","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.forked-path", title: "岔路", summary: "你追寻的线索在此分成两股，一股清楚，一股更像有意留下的诱饵。", actions: ["pursuit"], salience: 2, topic: "opportunity", continuity: ["secret"], onboarding: true , body: "你追寻的线索在此分成两股。一股脚印清楚、方向明确；另一串痕迹像是特意留下的，过于整齐。你可以顺着清楚的那股走，也可以去试那串整齐的，或者暂时按兵不动。", choiceSet: [{"id":"clear-trail","label":"顺着清楚的那股脚印走","effects":[{"op":"ADD_CULTIVATION","amount":190},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"neat-trail","label":"去试那串过于整齐的痕迹","effects":[{"op":"ADD_CULTIVATION","amount":240},{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"hold-position","label":"暂不动作，先把两股都记下","effects":[{"op":"ADD_CULTIVATION","amount":80},{"op":"OUTCOME_TIME_DELTA","years":1}]}]}
];

const ordinary: Spec[] = [
  { id: "content01.ordinary.tea-house", title: "半盏茶", summary: "小镇茶棚只剩半壶温茶，邻桌的人谈论一场与你无关的远行。", salience: 1, topic: "human-world", continuity: ["travel"], body: "茶棚里只剩半壶温茶。邻桌三人谈起一场与你无关的远行，说得很热闹，没有人问你从哪里来。棚外的路还长，你要决定的只是这壶茶喝完就走，还是坐到它凉透。", choiceSet: [{"id":"finish-cup","label":"喝完这半盏茶便走","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stay-listen","label":"坐到茶凉，听完这段远行","effects":[{"op":"ADD_CULTIVATION","amount":90},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.ferry-wait", title: "候渡", summary: "河雾压住渡口，船家不肯冒险开船，所有人只得等水声慢下来。", salience: 1, topic: "travel", continuity: ["human-world"], ordinaryActions: ["travel"], body: "河雾压住渡口，船家不肯冒险开船。等的人越来越多，谁也不愿先开口。你可以留在雾里等一趟船，也可以沿河岸走到下一个渡口——那条路更远，但至少在走。", choiceSet: [{"id":"wait-ferry","label":"留在渡口等一趟船","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"walk-upstream","label":"沿河岸走到下一个渡口","effects":[{"op":"ADD_CULTIVATION","amount":110},{"op":"OUTCOME_TIME_DELTA","years":2}]}] },
  { id: "content01.ordinary.missed-letter", title: "迟信", summary: "一封辗转多地的旧信终于到了手中，纸角磨损，寄信人未留下回址。", salience: 2, topic: "memory", continuity: ["promise"], ordinaryActions: ["pursuit"], body: "一封辗转多地的旧信终于到了手中，纸角磨损，寄信人没有留下回址。信里只提到一处地方，别的什么都没有。你可以照这处地名去找，也可以先弄清楚这封信为何迟到这么久。", choiceSet: [{"id":"follow-place","label":"照信里那处地名去找","effects":[{"op":"ADD_CULTIVATION","amount":160},{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"trace-delay","label":"先查这封信为何迟到这么久","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.broken-bridge", title: "断桥", summary: "山洪冲断木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。", salience: 2, topic: "trust", continuity: ["human-world"], ordinaryActions: ["travel","worldly"], body: "山洪冲断了木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。你可以先帮对岸把绳索拉起来，也可以只问清对面有几个人、家在哪个方向，再决定要不要出力。", choiceSet: [{"id":"throw-rope","label":"先把绳索抛过去，帮他们过河","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-terms","label":"只问清对面的人数与去向","effects":[{"op":"ADD_CULTIVATION","amount":100},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.night-rain", title: "夜雨", summary: "夜雨敲窗，你想起数年前一次仓促告别，那句话至今没有说完。", salience: 1, topic: "memory", continuity: ["loss"], ordinaryActions: ["cultivate"], body: "夜雨敲窗。你想起数年前一次仓促告别，那句话至今没有说完。念头一起就压不住。你可以坐下来把这段心绪行功化开，也可以就着雨声把它放到明天。", choiceSet: [{"id":"engage","label":"就着雨声坐下来，把这段心绪行功化开","effects":[{"op":"ADD_CULTIVATION","amount":170}]},{"id":"consider","label":"不起身，先把这一夜雨听完","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"leave","label":"压下心绪，明日照常赶路","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.roadside-debate", title: "道旁争言", summary: "两名修士为一条旧规争得面红耳赤，围观者各有私心，却都说为了公道。", salience: 2, topic: "rivalry", continuity: ["human-world"], participant: generated("wandering-cultivator"), ordinaryActions: ["worldly"], body: "两名修士为一条旧规争得面红耳赤，围观者各有私心，嘴上却都说为了公道。你可以当场评一句谁站得住，也可以只问清这条旧规究竟伤过谁，再决定要不要开口。", choiceSet: [{"id":"pick-a-side","label":"当场评一句谁站得住","effects":[{"op":"ADD_CULTIVATION","amount":140}]},{"id":"ask-who-hurt","label":"只问这条旧规究竟伤过谁","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.event"}]}] },
  { id: "content01.ordinary.empty-search", title: "空寻", summary: "你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。", salience: 1, topic: "exploration", continuity: ["secret"], ordinaryActions: ["pursuit"], body: "你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。旧图上标的方位已经偏了。你可以照脚印的走向继续追，也可以承认今日无所得，回头重画。", choiceSet: [{"id":"follow-footprints","label":"照那几处脚印继续追下去","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"redraw-map","label":"承认今日无所得，回头重画","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.shared-fire", title: "同火", summary: "荒野风紧，陌生旅人分出半边篝火，彼此都没有追问来历。", salience: 2, topic: "trust", continuity: ["travel"], participant: generated("mortal-traveler"), ordinaryActions: ["travel"], body: "荒野风紧，陌生旅人分出半边篝火，谁也没有追问来历。你可以守着火陪到天亮，也可以问问他接下来往哪条路走——问了他才记得你们照过面。", choiceSet: [{"id":"keep-watch","label":"守着火陪到天亮","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-route","label":"问他接下来往哪条路走","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":400,"reasonTag":"npc.reason.event"}]}] },
  { id: "content01.ordinary.market-bargain", title: "小交易", summary: "行商修士摆出几味寻常药材，真正要交换的却是一条路况消息。", salience: 2, topic: "trade", continuity: ["opportunity"], participant: generated("merchant-cultivator"), ordinaryActions: ["worldly"], body: "行商修士摆出几味寻常药材，价钱报得干脆利落。可他真正想交换的，是一条路况消息：哪一段路近来不太平。你可以只谈药材付了灵石，也可以加进这条消息，用一个承诺换它。", choiceSet: [{"id":"buy-herbs","label":"只按他的价钱买下药材","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.event"}]},{"id":"trade-for-news","label":"加进那条路况消息，用一个承诺换它","effects":[{"op":"ADD_CULTIVATION","amount":180},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.event"}]}] },
  { id: "content01.ordinary.mountain-view", title: "山色", summary: "登高之后并无奇遇，只有群山在暮色里一层层远去，呼吸也随之平缓。", salience: 1, topic: "cultivation", continuity: ["travel"], body: "登高之后并无奇遇。群山在暮色里一层层远去，呼吸也随之平缓。你可以就地调息，把这段山路换来的清醒收进气机；也可以辨清方位后继续上路。", ordinaryActions: ["travel","cultivate"], choiceSet: [{"id":"breathe-here","label":"就地调息，把这段清醒收进气机","effects":[{"op":"ADD_CULTIVATION","amount":160}]},{"id":"orient-and-go","label":"辨清方位后继续上路","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.harvest-help", title: "收谷", summary: "村人赶在风雨前收谷，人手不足，修士的一日也能换来许多凡俗年月。", salience: 2, topic: "human-world", continuity: ["time"], participant: generated("mortal-traveler"), ordinaryActions: ["worldly"], body: "村人赶在风雨前收谷，人手不足，只要你肯搭把手，一个时辰就能补上缺口。你可以下地收谷，也可以替他们看住堆在院里的谷堆，等他们回来再一起分。", choiceSet: [{"id":"work-field","label":"下地一起收谷","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":2},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"guard-store","label":"替他们看住院里的谷堆","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":400,"reasonTag":"npc.reason.event"}]}] },
  { id: "content01.ordinary.old-song", title: "旧曲", summary: "客栈角落有人弹起旧曲，旋律并不精妙，却让几位过客同时安静下来。", salience: 1, topic: "memory", continuity: ["human-world"] , body: "客栈角落有人弹起旧曲。旋律并不精妙，几位过客却同时安静下来。你可以坐到曲终再起身，也可以直接起身去看弹琴的人是谁——后者也许更接近这段曲子的来处。", choiceSet: [{"id":"sit-through","label":"坐到这一曲终了再起身","effects":[{"op":"ADD_CULTIVATION","amount":100}]},{"id":"meet-player","label":"起身去看弹琴的人是谁","effects":[{"op":"ADD_CULTIVATION","amount":140},{"op":"OUTCOME_TIME_DELTA","years":1}]}]}
];

const npcEvents: Spec[] = [
  { id: "content01.pei.broken-blade", title: "断剑客", summary: "裴照川把断剑横在膝上，他谈的是同行，不是收徒，也没有先许下情分。", actions: ["travel", "worldly"], salience: 3, topic: "promise", continuity: ["rivalry", "sword"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), origins: [{ templateId: "content01.cause.broken-sword-promise", salience: 4, label: "与他定约" }, { templateId: "content01.cause.broken-sword-rivalry", salience: 3, label: "以剑相争" }], cooldown: oncePerRun, body: "裴照川把断剑横在膝上，剑格上还留着上一次交手的缺口。他谈的是同行，不是收徒，也没有先许下情分。你要决定的是：以剑相争分个明白，还是先问清他这趟要往哪里去。" },
  { id: "content01.pei.sparring-rain", title: "雨中试剑", summary: "雨线斜落，裴照川只问你是否还愿意拔剑，胜负之外还要看你如何收手。", actions: ["cultivate", "pursuit"], salience: 3, topic: "rivalry", continuity: ["sword", "promise"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4) , closure: true, body: "雨线斜落，裴照川只问你是否还愿意拔剑。他没有摆出架势，胜负之外还要看你如何收手：剑出到哪一步算完，收手时剑锋朝哪一边，都是他自己选的事。", choiceSet: [
  {"id":"engage","label":"拔剑，但只走到他说的那一步","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.sword","amount":900,"reasonTag":"content01.sword"},{"op":"ADD_CULTIVATION","amount":150}]},
  {"id":"consider","label":"先问清他今日想试的是剑还是人","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"收剑鞘而不发","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },
  { id: "content01.pei.old-wound", title: "旧伤复作", summary: "裴照川行至半坡忽然停步，旧伤让他的右手微颤，他却不肯把决定交给旁人。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["sword", "trust"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), risk: "threat.critical-injury", cooldown: spaced(5), body: "裴照川行至半坡忽然停步，旧伤让他的右手微颤。他把剑换到左手，语气仍然平稳，却不肯把这个决定交给旁人照看。你要决定的是：替他分忧，还是等他把话说完。" },
  { id: "content01.pei.promise-echo", title: "剑约未冷", summary: "多年后那柄断剑仍在，裴照川没有复述旧约，只把另一条路摆到你面前。", salience: 4, topic: "promise", continuity: ["sword", "rivalry"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4) , closure: true, body: "多年后那柄断剑仍在，剑身上的缺口没有补。裴照川没有复述当年的旧约，只把另一条路摆到你面前，像在问：当年那件事，现在还算不算数。", choiceSet: [
  {"id":"engage","label":"接下他递来的第二条路","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.sword","amount":900,"reasonTag":"content01.sword"},{"op":"ADD_CULTIVATION","amount":160}]},
  {"id":"consider","label":"先问清当年断的是哪一段","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"不接这条路，转身离开","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.jiang.herb-price", title: "药有其价", summary: "姜雪芜替人止住伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["debt", "trust"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), origins: [{ templateId: "content01.cause.medicine-debt", salience: 3, label: "认下药债" }], cooldown: oncePerRun, body: "姜雪芜替人止住了伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。账目摆在桌上，谁都可以核。你要决定的是：当场认下这份人情，还是先把每一项都问明白。" },
  { id: "content01.jiang.night-clinic", title: "夜诊", summary: "夜深后仍有人敲门，姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面。", actions: ["worldly", "cultivate"], salience: 3, topic: "medicine", continuity: ["injury", "human-world"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4), body: "夜深后仍有人敲门。姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面，没有替你选，也没有把话说软。她只等着你说出一个能担得起的决定。" },
  { id: "content01.jiang.bitter-decoction", title: "苦汤", summary: "一锅药汤气味辛烈，姜雪芜提醒其中一味药性相冲，省事与稳妥不能两全。", actions: ["cultivate"], salience: 3, topic: "medicine", continuity: ["danger", "alchemy"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), risk: "threat.poison", cooldown: spaced(5), body: "一锅药汤气味辛烈。姜雪芜提醒其中一味药性相冲：省事与稳妥不能两全，快煎伤身，慢煎费时。她把两种代价都摆出来，剩下的由你决定要不要冒这个险。" },
  { id: "content01.jiang.debt-echo", title: "旧账新页", summary: "姜雪芜翻到旧账那一页，没有催促，只问你如今是否仍认得当年的代价。", salience: 3, topic: "debt", continuity: ["medicine", "promise"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4) , closure: true, body: "姜雪芜翻到旧账那一页，没有催促，指尖停在当年记下的数目上。她只问你如今是否仍认得当年的代价：认，这页就翻过去；不认，也请把话说清。", choiceSet: [
  {"id":"engage","label":"按当年记下的数还清","effects":[{"op":"ADD_CULTIVATION","amount":140},{"op":"ADD_BUILD_EVIDENCE","buildId":"build.alchemy","amount":900,"reasonTag":"content01.alchemy"}]},
  {"id":"consider","label":"先核一遍旧账里记的到底是什么","effects":[{"op":"ADD_CULTIVATION","amount":110},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"这一页不必翻，就此作罢","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.cen.shoulder-road", title: "并肩负伤", summary: "岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走。", actions: ["travel", "worldly"], salience: 4, topic: "injury", continuity: ["trust", "body"], build: "body", npcRole: "body", participant: core("cen-bugui"), origins: [{ templateId: "content01.cause.shared-wound", salience: 4, label: "与他同行" }], cooldown: oncePerRun, body: "岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走：是一起按原路赶，还是先在这里处理伤势再动。他的肩还在往下滴血。" },
  { id: "content01.cen.stone-steps", title: "负石登阶", summary: "岑不归背石登阶，每一步都极慢。他不劝你跟上，只在山腰留了一瓢清水。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body", "cultivation"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4), body: "岑不归背石登阶，每一步都极慢，呼吸比石头还重。他不劝你跟上，也不催你离开，只在山腰留了一瓢清水。台阶还有一半，水已经凉了。" },
  { id: "content01.cen.shield-stranger", title: "以身护人", summary: "乱石落下时，岑不归已经站到最窄的缺口。他看向你，等一个共同承担的决定。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["body", "trust"], build: "body", npcRole: "body", participant: core("cen-bugui"), risk: "threat.combat", cooldown: spaced(5), body: "乱石落下时，岑不归已经站到最窄的缺口，抬头看了一眼落石的方向，随即回头等一个共同承担的决定。他没有说「你走吧」，也没有说「我挡着」。" },
  { id: "content01.cen.shared-echo", title: "伤痕相认", summary: "旧伤在阴雨里同时发作，岑不归看见你按住肩头，便知道那一日没有被忘记。", salience: 3, topic: "injury", continuity: ["body", "memory"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4) , closure: true, body: "旧伤在阴雨里同时发作。岑不归看见你按住肩头，便知道那一天的代价没有被忘记，也没有被说出口。他难得开了口，说的却只是今日的天气。", choiceSet: [
  {"id":"engage","label":"把当年那道伤指给他看","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.body","amount":900,"reasonTag":"content01.body"},{"op":"ADD_CULTIVATION","amount":140},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.cause"}]},
  {"id":"consider","label":"只说一句今日天凉，不提旧事","effects":[{"op":"ADD_CULTIVATION","amount":80},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"各自走进雨里，不等对方开口","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.xie.secret-map", title: "半张秘图", summary: "谢听潮摊开半张秘图，另一半仍在袖中。他愿意分路，也要求先说清如何分利。", actions: ["pursuit", "travel"], salience: 4, topic: "secret", continuity: ["trust", "fortune"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), origins: [{ templateId: "content01.cause.secret-map-pact", salience: 4, label: "立约同行" }, { templateId: "content01.cause.secret-map-breach", salience: 4, label: "暗留后手" }], cooldown: oncePerRun, body: "谢听潮摊开半张秘图，另一半仍收在袖中。他愿意分路，也要求先说清如何分利：谁走前段，谁担风险，图上的记号算不算数。图边角已经磨得起毛。" },
  { id: "content01.xie.cave-gamble", title: "洞口风声", summary: "洞口吹出的风带着金石气，谢听潮判断里面有路，也坦言判断可能错。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), risk: "threat.dangerous-exploration", cooldown: spaced(5), body: "洞口吹出的风带着金石气。谢听潮判断里面有路，也坦言这个判断可能错——他把手按在石壁上等了一息，石头是凉的。他要你先说，进还是退。" },
  { id: "content01.xie.divided-spoils", title: "分利", summary: "所得不如预想，谢听潮仍按旧话分成，只把最后一件用途不明的东西留在中央。", actions: ["worldly"], salience: 3, topic: "trust", continuity: ["fortune", "promise"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), cooldown: spaced(4) , closure: true, body: "所得不如预想，谢听潮仍按旧话分成，只把最后一件用途不明的东西留在中央，谁也没有先动。他问的不是分法，而是这件事还算不算当初约定的那个部分。", choiceSet: [
  {"id":"engage","label":"按当初的约定，先问清那件东西的用途","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.fortune","amount":900,"reasonTag":"content01.fortune"},{"op":"ADD_CULTIVATION","amount":140},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":400,"reasonTag":"npc.reason.cause"}]},
  {"id":"consider","label":"把中央那件推到一边，先分其余的","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"一样都不取，这次到此为止","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },
  { id: "content01.xie.map-echo", title: "图上旧折", summary: "秘图旧折痕与眼前山势重合，谢听潮没有催你，只把当初说过的话轻轻念了一遍。", salience: 4, topic: "secret", continuity: ["promise", "exploration"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), cooldown: spaced(4) , closure: true, body: "秘图的旧折痕与眼前山势完全重合。谢听潮没有催你，只把当初说过的话轻轻念了一遍，念到一半就停住——他也在等你想起来，那句话当年是怎么说的。", choiceSet: [
  {"id":"engage","label":"把当年没说完的那半句补上","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.fortune","amount":900,"reasonTag":"content01.fortune"},{"op":"ADD_CULTIVATION","amount":160}]},
  {"id":"consider","label":"先按图走一遍，把路线对清楚","effects":[{"op":"ADD_CULTIVATION","amount":110},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"承认你已经想不起那句话","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.xu.mortal-letter", title: "人间来信", summary: "许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。", actions: ["worldly", "pursuit"], salience: 3, topic: "human-world", continuity: ["promise", "time"], npcRole: "mortal", participant: core("xu-changan"), origins: [{ templateId: "content01.cause.mortal-promise", salience: 4, label: "答应归去" }], cooldown: oncePerRun, body: "许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。送信人不肯多等，收了脚程钱就走了。信很短，短到只够问这一件事。" },
  { id: "content01.xu.ten-year-return", title: "十年重逢", summary: "你眼中的数次闭关，已是许长安鬓边的一层霜。他仍认得你，也不假装岁月轻巧。", actions: ["worldly"], salience: 4, topic: "time", continuity: ["memory", "human-world"], npcRole: "mortal", participant: core("xu-changan"), cooldown: spaced(5), body: "你眼中的数次闭关，在许长安鬓边已经积了一层霜。他仍认得你，也没有假装岁月轻巧。院门开着，门前那棵树比记忆里高了一些。" },
  { id: "content01.xu.empty-courtyard", title: "空院", summary: "院门仍旧，檐下却积了厚灰。邻人只说许长安早已离开，没有人知道他最后去了哪里。", actions: ["pursuit"], salience: 4, topic: "loss", continuity: ["time", "promise"], npcRole: "mortal", participant: core("xu-changan"), effects: [{ op: "SET_NPC_STATUS", actorBindingKey: "actor", targetStatus: "departed", revealToPlayer: true, reasonTag: "npc.reason.status" }], cooldown: spaced(4) , closure: true, body: "院门仍旧，檐下却积了厚灰。邻人只说许长安早已离开，具体去了哪里无人知道。院角那棵旧树还活着，落叶堆在墙根，没有被扫过。", choiceSet: [
  {"id":"engage","label":"扫开墙根的落叶，让院子有人住的样子","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.cause"}]},
  {"id":"consider","label":"向邻人多问一句他可能去了哪里","effects":[{"op":"ADD_CULTIVATION","amount":90},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"把院门掩上，不去问答案","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },
  { id: "content01.xu.promise-echo", title: "树下旧诺", summary: "旧树又添一圈年轮，你终于站回门前；许长安是否还在，已不再是唯一的问题。", salience: 4, topic: "promise", continuity: ["time", "memory"], npcRole: "mortal", participant: core("xu-changan"), cooldown: spaced(4) , closure: true , body: "旧树又添了一圈年轮，你终于站回门前。门里没有回应，院子空着。许长安是否还在，已经不再是唯一的问题——你要决定的是推门进去，还是先在这里站一会儿。", choiceSet: [
  {"id":"engage","label":"推门进去，把话当面问清","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.cause"}]},
  {"id":"consider","label":"先在门前站一会儿，不急着进去","effects":[{"op":"ADD_CULTIVATION","amount":90},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"转身离开，把这件事留在原处","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
] }
];

const buildEvents: Spec[] = [
  { id: "content01.build.sword.river-cut", title: "截流一剑", summary: "山涧暴涨，石上只容一步，你要用剑开的不是敌人，而是一线可过之路。", actions: ["cultivate", "travel"], salience: 3, topic: "danger", continuity: ["sword"], build: "sword", body: "山涧暴涨，石上只容下脚的地方。要用剑开的不是敌人，而是一线可过之路：剑锋偏了半尺就够不着落点，偏得太多又会把整块石头劈塌。你只有一次出手的余地。" },
  { id: "content01.build.sword.no-draw", title: "剑未出鞘", summary: "对方故意激你拔剑，真正难的并非出手，而是判断这一剑是否值得。", actions: ["worldly"], salience: 2, topic: "rivalry", continuity: ["sword"], build: "sword", body: "对方故意激你拔剑，把话说得很难听。真正难的并非出手，而是判断这一剑值不值得——拔了可能中了圈套，不拔也可能错过唯一的机会。" },
  { id: "content01.build.sword.guard-caravan", title: "护行", summary: "商队只求平安过岭，剑锋若太快，可能把原本能谈的局面推向死斗。", actions: ["travel"], salience: 3, topic: "trust", continuity: ["sword", "human-world"], build: "sword", body: "商队只求平安过岭。剑锋若出得太快，原本能谈的局面会被推成死斗；慢一步，路上的风声却可能先到。你要决定的是先稳住人，还是先稳住剑。" },
  { id: "content01.build.body.boulder", title: "移石", summary: "巨石堵住山道，术法并非唯一办法，筋骨与耐心也能一点点挪开困局。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body"], build: "body", body: "巨石堵住山道，术法并非唯一办法。筋骨与耐心也能一点点把困局挪开，只是要耗上好几日。你可以用更省力的法子绕过去，也可以咬着牙把石头一点点挪开。" },
  { id: "content01.build.body.cold-water", title: "寒潭", summary: "寒潭入骨，继续停留能磨炼气血，也可能让旧伤在夜里更深一分。", actions: ["cultivate"], salience: 3, topic: "injury", continuity: ["body", "danger"], build: "body", body: "寒潭入骨。继续停留能磨炼气血，也可能让旧伤在夜里更深一分。水面安静得看不出深浅，你要在下水之前决定，是把这口气咬住，还是今天到此为止。" },
  { id: "content01.build.body.carry-wounded", title: "背人下山", summary: "伤者无法再走，山路仍长。背起一个人，意味着把自己的退路也交给脚下。", actions: ["travel", "worldly"], salience: 3, topic: "trust", continuity: ["body", "injury"], build: "body", body: "伤者已经无法再走，山路却还有很长一段。背起一个人意味着把自己的退路也交给脚下：不背，他留在这里；背了，你走多慢都得背到底。" },
  { id: "content01.build.alchemy.herb-sort", title: "辨草", summary: "三种药草外形近似，药性却相反，耐心辨认比一炉昂贵丹火更要紧。", actions: ["cultivate", "pursuit"], salience: 2, topic: "medicine", continuity: ["alchemy"], build: "alchemy", body: "三种药草外形近似，药性却相反，认错一味整炉报废。耐心辨认比一炉昂贵的丹火更要紧。三株并排摆着，你要一株一株地看过去，不能靠猜。" },
  { id: "content01.build.alchemy.fever", title: "退热", summary: "村中热症蔓延，没有珍稀灵药，只有有限草药与一夜不能出错的照看。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["human-world", "alchemy"], build: "alchemy", body: "村中热症蔓延，没有珍稀灵药，只有有限的草药和一夜不能出错的照看。药只能救一部分人，你要决定的是先顾哪一间，以及这一夜怎么轮班。" },
  { id: "content01.build.alchemy.failed-brew", title: "废炉", summary: "药液颜色偏了一线，这炉已不能救人；承认失败，比把它勉强端出去更难。", actions: ["cultivate"], salience: 2, topic: "loss", continuity: ["alchemy", "discipline"], build: "alchemy", body: "药液的颜色偏了一线，这炉已经不能救人了。承认失败比把它勉强端出去更难：锅里的东西还温着，端出去就会有人喝。你要决定的是倒掉，还是自己承担。" },
  { id: "content01.build.fortune.fork", title: "偏僻岔路", summary: "熟路能按时抵达，偏路却留下新鲜蹄印；未知并不等同于好运，也不等同于坏事。", actions: ["travel", "pursuit"], salience: 2, topic: "opportunity", continuity: ["fortune", "exploration"], build: "fortune", body: "你沿熟路赶往山外，岔路旁却留下新鲜蹄印。熟路有行人，能按时抵达；偏路通向林深，看不清尽头。这里真正要决定的是行程与未知机会，而不是抽象的磨炼。", choiceSet: [{"id":"engage","label":"循着那串蹄印走进偏路","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.fortune","amount":900,"reasonTag":"content01.fortune"},{"op":"ADD_CULTIVATION","amount":150}]},{"id":"climb-and-watch","label":"先登高看清偏路通向哪里","effects":[{"op":"ADD_CULTIVATION","amount":180},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stay-known-road","label":"放弃偏路，按熟路按时抵达","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.build.fortune.hidden-stream", title: "石下清泉", summary: "你在无人在意的石缝听见水声，继续挖掘可能一无所获，也可能改写整段行程。", actions: ["pursuit"], salience: 3, topic: "secret", continuity: ["fortune", "exploration"], build: "fortune", body: "你在无人在意的石缝里听见了水声。继续挖可能一无所获，也可能改写整段行程；石缝很深，出不来就得等到天黑。溪声一直在响，听不出深浅。" },
  { id: "content01.build.fortune.empty-hand", title: "空手而归", summary: "等待多日的机缘没有出现，真正留下的是你如何面对落空与下一次选择。", actions: ["cultivate", "pursuit"], salience: 2, topic: "loss", continuity: ["fortune", "discipline"], build: "fortune" , body: "等待多日的机缘没有出现。你按着旧记踏遍三处地方，回过神来时天已经黑了。真正留下的不是收获，而是你如何面对这次落空——以及还要不要再等一次。"}
];

const riskEvents: Spec[] = [
  { id: "content01.risk.pine-ambush", title: "松林伏影", summary: "松针忽然停止落下，前路有人藏住呼吸，退路也在一点点合拢。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["exploration"], risk: "threat.ambush", body: "松针忽然停止落下。前路有人藏住呼吸，退路也在一点点合拢。声音是从两个方向传来的，你分不清哪一个更近，也不敢赌。" },
  { id: "content01.risk.ruin-depth", title: "遗迹深处", summary: "石阶向下延伸，壁灯早已熄灭，回声却比你的脚步多出一次。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], risk: "threat.dangerous-exploration", body: "石阶向下延伸，壁灯早已熄灭，你的脚步声在石壁之间回荡，却比回来时多了一次。回声不会说谎：前面还有别的东西在动。" },
  { id: "content01.risk.poison-mist", title: "青雾", summary: "谷底升起淡青雾气，草叶边缘已经发黑，绕路要多耗数日。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["medicine"], risk: "threat.poison", body: "谷底升起淡青雾气，沾到雾的草叶边缘已经发黑。风把雾往这边吹，绕路要多耗数日，而你带的水只够两天。湿冷顺着衣袖往里渗。" },
  { id: "content01.risk.curse-stone", title: "无字碑", summary: "无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。", actions: ["pursuit"], salience: 4, topic: "secret", continuity: ["danger"], risk: "threat.curse", body: "无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。声音用的是你自己的嗓音，说的却是一句你从未听过的话。" },
  { id: "content01.risk.critical-crossing", title: "负伤渡河", summary: "伤势未稳，河水又在上涨；此刻强渡，危险来自水势，也来自身体本身。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["danger"], risk: "threat.critical-injury", body: "伤势未稳，河水又在上涨。此刻强渡，危险来自水势，也来自你自己的身体。两样都在往下压，而对岸已经能看见了。" },
  { id: "content01.risk.revenge-shadow", title: "旧怨追来", summary: "有人沿着旧日冲突留下的线索追来，来者不问解释，只确认你的名字。", actions: ["pursuit", "worldly"], salience: 4, topic: "rivalry", continuity: ["danger", "memory"], risk: "threat.cause-revenge", body: "有人沿着旧日冲突留下的线索追来。来者不问解释，只确认你的名字——他已经确认过了。你想起那次争执里，自己确实说过一句过头的话。" },
  { id: "content01.risk.falling-star", title: "坠星", summary: "夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。", actions: ["travel", "pursuit"], salience: 5, topic: "danger", continuity: ["opportunity"], risk: "threat.special-catastrophe", body: "夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。碎片还挂在天上，坠势未止——你只有站定或走开这两个选择。" },
  { id: "content01.risk.beast-trail", title: "兽迹", summary: "新鲜兽迹绕过营地三次，猎物与猎手的位置，可能在下一步互换。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["survival"], risk: "threat.combat", body: "新鲜兽迹绕过营地三次，每次都绕回同一处。猎物与猎手的位置，可能在下一步互换。你手里的东西还够一次驱赶，也可能只够一次引开。" },
  { id: "content01.risk.flood-cave", title: "涨水洞", summary: "洞中水位正在上升，深处微光尚未消失，留给你判断的时间不多。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["danger", "opportunity"], risk: "threat.dangerous-exploration", body: "洞中水位正在上升，深处那点微光还没有消失。留给你的时间不多了：往回走要穿过刚涨起来的水，往前走要赌那条路够高。" },
  { id: "content01.risk.broken-seal", title: "残封", summary: "封印裂口只容一线气息外泄，那气息古老而清醒，像在等待回应。", actions: ["cultivate", "pursuit"], salience: 5, topic: "secret", continuity: ["danger", "cultivation"], risk: "threat.special-catastrophe" , body: "封印的裂口只容一线气息外泄。那气息古老而清醒，并不急着扑上来，只在等一个回应。你可以合上裂口转身，也可以听它把话说完。"}
];

const roadCauseEvents: Spec[] = [
  { id: "content01.road.help", title: "扶一程", summary: "同行的陌生修士在坡前力竭，他没有求救，只把行囊向身后挪了挪。", actions: ["travel", "worldly"], salience: 2, topic: "trust", continuity: ["travel"], participant: generated("wandering-cultivator"), origins: [{ templateId: "content01.cause.road-kindness", salience: 2, label: "扶他一程" }], cooldown: oncePerRun, body: "同行的陌生修士在坡前力竭。他没有开口求救，只把行囊向身后挪了挪，腾出一点位置。他不看你，等的是你自己决定要不要停下。" },
  { id: "content01.road.conflict", title: "窄路相争", summary: "狭窄山道只容一人先过，对面的修士不肯退，你也看不出他是否另有所图。", actions: ["travel"], salience: 3, topic: "rivalry", continuity: ["travel", "trust"], participant: generated("dangerous-cultivator"), origins: [{ templateId: "content01.cause.road-conflict", salience: 3, label: "记下此争" }], cooldown: oncePerRun, body: "狭窄山道只容一人先过。对面的修士不肯退让，你也看不出他是否另有所图。他把脚跟抵在石缝上，像是已经打算在这里耗到底。" },
  { id: "content01.road.kindness-echo", title: "故人递伞", summary: "多年后雨又落下，一把伞从身侧递来；那张脸比记忆成熟，旧日一程仍被记得。", salience: 3, topic: "memory", continuity: ["trust", "travel"], cooldown: spaced(4) , closure: true, body: "多年后雨又落下，一把伞从身侧递来。那张脸比记忆里成熟，旧日那一程仍然被记得——他先开口叫的，还是当年的称呼。", choiceSet: [
  {"id":"engage","label":"叫回当年的称呼，接过这把伞","effects":[{"op":"ADD_CULTIVATION","amount":150}]},
  {"id":"consider","label":"先问他这些年过得如何","effects":[{"op":"ADD_CULTIVATION","amount":100},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"各走各的路，把这一段雨留给当年","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },
  { id: "content01.road.conflict-echo", title: "旧路再逢", summary: "同一条窄路上，你再次看见熟悉身影；当年的争执已经长出新的分量。", salience: 3, topic: "rivalry", continuity: ["memory", "travel"], cooldown: spaced(4) , closure: true , body: "同一条窄路，你再次看见那个熟悉的身影。当年的争执已经长出新的分量，谁都没有先提。他停下来，你也没有。", choiceSet: [
  {"id":"engage","label":"这次先把当年的话说完","effects":[{"op":"ADD_CULTIVATION","amount":140}]},
  {"id":"consider","label":"侧身让路，谁都不提那一段","effects":[{"op":"ADD_CULTIVATION","amount":70},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"退回去，等他先走","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
] }
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
