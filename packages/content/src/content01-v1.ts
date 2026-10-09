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
  /**
   * PLAYUX01 (F3) — scene-specific wording for the SHARED template options this scene uses.
   *
   * The remaining template Events ran on buttons like 顺势而行 / 停步细看 / 见好便收, which say nothing
   * about the scene they appear in. `choiceSet` cannot fix that here: on a risk Event the template is what
   * attaches `threatId`, the tiered outcomes and the cause closure, so replacing the choice list would
   * change what a choice DOES to fix what it SAYS. This map changes only the wording.
   *
   * Keys are the option ids the template already emits, so the mapping reads at the call site and a typo
   * cannot rename anything — an id the scene does not use is simply never read. Every effect, threat,
   * cooldown and id stays exactly as the template produced it, which is what keeps this pass clear of the
   * Cause-closure and RNG contracts that LOOPFIX02B2 and the recurrence rules pin.
   */
  choiceLabels?: ChoiceLabelOverrides;
  /**
   * PLAYUX01 (F3) — what the scene's resolution is allowed to say the player got, published under
   * `${id}.outcome`.
   *
   * A scene whose options settle only time records nothing the effect lines can name, so the result panel
   * could otherwise leave the player wondering whether a search found anything. This lets the SCENE answer
   * that in its own words — 尚未取得可以确认的新线索 for a pursuit that came back empty — without the client
   * knowing anything about which Kind of scene it is rendering, and without the server projecting a new
   * field. It is authored copy under an exact key, like every other string the client reads.
   */
  outcomeNote?: string;
  /**
   * PLAYFEEL01 (B2/B3) — the settled narration for each option, keyed by the option id the scene emits.
   *
   * This is the piece PLAYUX01 left open. The result panel could name the Event and the option that was
   * taken, and report the numbers the server settled, but it could not say *what happened* — so a player who
   * chose 起身去看弹琴的人读到的只是 `修为 +140`. The narration is authored copy under an exact key
   * (`${id}.settle.${choiceId}`), so the client still reads it as a key and the server publishes no new
   * field. It is written beside the effects that back it, so the two cannot drift: every claim in the
   * sentence has to be something the option's own effects actually settle.
   *
   * Deliberately NOT a generic sentence. The locked brief bans 此举留下形状 / 冥冥中改变了命运 / 日后自见分晓 —
   * a sentence that would be equally true of every scene says nothing about this one.
   */
  settlements?: Record<string, string>;
  /**
   * PLAYFEEL01 (B3) — settled narration for options whose outcome tiers settle DIFFERENTLY.
   *
   * `resolveOutcome` picks the option's own `greatSuccess` / `success` / `costlySuccess` / `failure` block
   * (event.ts:163-171), and the receipt carries the applied tier. On the two risk scenes a clean success and
   * a costly success are genuinely different events — one walks away with the spoils, the other does so
   * bleeding — so they get different sentences rather than one sentence that fits neither. Keyed
   * `${id}.settle.${choiceId}.${tier}`, and the choice-level sentence remains the fallback.
   */
  tierSettlements?: Record<string, Partial<Record<"greatSuccess" | "success" | "costlySuccess" | "failure", string>>>;
  /**
   * PLAYFEEL01 (B3) — the real per-tier effects of a risk scene's own options.
   *
   * The shared risk template gave `success` and `costlySuccess` the same payout and still paid cultivation on
   * `failure`, so a costly success (which the Threat's own outcome table injures) was indistinguishable from a
   * clean one, and a failure still handed out a reward. The brief requires 成功/受伤/死亡 to settle
   * differently. This lets the scene say what each tier actually pays; anything omitted keeps the template
   * default, and the ThreatDefinition still owns the injury/condition consequence.
   */
  /**
   * PLAYFEEL01 (B3) — marks the two 道途 scenes whose prepare/withdraw options must settle differently.
   *
   * The brief asks 辨草的 记牢两味 and 截流一剑的 先看准落点 to record preparation rather than a lecture in
   * 修为, and 承认进度小 / 真的回避损失 to cost time rather than pay out. Those two options come from the
   * SHARED template, so the change is gated on this flag: every other scene that uses the same template keeps
   * byte-identical effects. Nothing about the shared option ids, threats or Cause closure moves.
   */
  prepBuild?: boolean;
  riskOutcomes?: {
    success?: EffectSpec[];
    costlySuccess?: EffectSpec[];
    failure?: EffectSpec[];
    readSigns?: EffectSpec[];
    turnAway?: EffectSpec[];
  };
};

/**
 * PLAYUX01 (F3) — the option ids the template can emit, so a scene can reword any of them.
 *
 * `bind-1`/`bind-2` are absent deliberately: a Cause origin's labels come from its own `origins` entries
 * and are already scene-specific (扶他一程, 认下药债, …).
 */
type ChoiceLabelOverrides = Partial<Record<
  "engage" | "consider" | "leave" | "take-risk" | "read-signs" | "turn-away" | "decline",
  string
>>;

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
  // PLAYUX01 (F3): the scene's own wording for a template option, falling back to the generic label. The
  // authoring key is unchanged (`${spec.id}.choice.${id}`), so a scene that supplies wording simply gets a
  // different value under the key it already had — no catalog key moves, and a scene that supplies none
  // behaves exactly as before.
  const label = (id: keyof ChoiceLabelOverrides, fallback: string): string =>
    text(`${spec.id}.choice.${id}`, spec.choiceLabels?.[id] ?? fallback);
  const close = (op: "RESOLVE_CAUSE" | "EXPIRE_CAUSE"): EffectSpec[] => spec.closure === undefined ? [] : declare(closureEffect(op));
  const safePrimary: EffectSpec[] = declare(spec.effects ?? (spec.build === undefined ? [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 2 }] : [buildEffect(spec.build)]));
  if (spec.origins !== undefined) return [
    ...spec.origins.map((origin, index): ChoiceDefinition => ({
      id: `bind-${index + 1}`, scope: "core", labelKey: text(`${spec.id}.choice.bind-${index + 1}`, origin.label),
      outcomes: { success: { effects: declare([{ op: "ADD_CAUSE", templateId: origin.templateId, salience: origin.salience, visibility: "hint", actorBindingKeys: { actor: "actor" } }, ...(spec.build === undefined ? [] : [buildEffect(spec.build, 700)]), { op: "ADD_NPC_SIGNIFICANCE", actorBindingKey: "actor", amount: 500, reasonTag: "npc.reason.cause" }]) } }
    })),
    { id: "decline", scope: "core", labelKey: label("decline", "留一句话离开"), outcomes: { success: { effects: declare([{ op: "OUTCOME_TIME_DELTA", years: 1 }]) } } }
  ];
  if (spec.risk !== undefined) {
    // PLAYFEEL01 (B3): the tiers may now settle differently. Defaults keep the previous behaviour exactly
    // for any scene that does not opt in, so nothing about an unauthored risk Event moves.
    const risk = spec.riskOutcomes ?? {};
    const risky = (tier: "success" | "costlySuccess" | "failure"): EffectSpec[] =>
      risk[tier] !== undefined ? declare(risk[tier] as EffectSpec[]) : tier === "success" ? safePrimary : tier === "costlySuccess" ? safePrimary : declare([{ op: "ADD_CULTIVATION", amount: 60 }]);
    return [
      { id: "take-risk", scope: "core", labelKey: label("take-risk", "承担此险"), threatId: spec.risk, ...(repeatable(spec) ? { riskRepeatBehavior: "allow-repeat-resolution" as const } : {}), outcomes: { success: { effects: risky("success") }, costlySuccess: { effects: risky("costlySuccess") }, failure: { effects: risky("failure") } } },
      { id: "read-signs", scope: "core", labelKey: label("read-signs", "先辨征兆"), outcomes: { success: { effects: risk.readSigns !== undefined ? declare(risk.readSigns) : declare([{ op: "ADD_CULTIVATION", amount: 180 }]) } } },
      { id: "turn-away", scope: "core", labelKey: label("turn-away", "及时折返"), outcomes: { success: { effects: risk.turnAway !== undefined ? declare(risk.turnAway) : declare([{ op: "ADD_CULTIVATION", amount: 60 }]) } } }
    ];
  }
  const npcEffect: EffectSpec[] = declare(spec.participant === undefined ? [] : [{ op: "ADJUST_NPC_RELATION", actorBindingKey: "actor", affinityDelta: 6, trustDelta: 4, reasonTag: "npc.reason.event" }]);
  // PLAYUX01 — an authored choiceSet replaces the generic engage/consider/leave trio entirely, so an
  // option's wording and its real effects are written together and cannot drift apart. Cause closure
  // is preserved: every option resolves the matter except the last, which declines it.
  if (spec.choiceSet !== undefined) { const last = spec.choiceSet.length - 1; return spec.choiceSet.map((choice, index): ChoiceDefinition => ({ id: choice.id, scope: "core", labelKey: text(`${spec.id}.choice.${choice.id}`, choice.label), outcomes: { success: { effects: [...declare(choice.effects), ...npcEffect, ...close(index === last ? "EXPIRE_CAUSE" : "RESOLVE_CAUSE")] } } })); }
  return [
    { id: "engage", scope: "core", labelKey: label("engage", spec.build === undefined ? "顺势而行" : "依此磨炼"), outcomes: { success: { effects: [...safePrimary, ...npcEffect, ...close("RESOLVE_CAUSE")] } } },
    { id: "consider", scope: "core", labelKey: label("consider", "停步细看"), outcomes: { success: { effects: [...declare(spec.prepBuild === true
    // PLAYFEEL01 (B3): on the two 道途 scenes, looking before you act is preparation and records the
    // build evidence the brief asks for; everywhere else the template keeps its previous dimension.
    ? [{ op: "ADD_BUILD_EVIDENCE", buildId: `build.${spec.build}`, amount: 400, reasonTag: `content01.${spec.build}.prep` }]
    : [{ op: "ADD_CULTIVATION", amount: 150 }]), ...close("RESOLVE_CAUSE")] } } },
    // PLAYUX01 (B3): the two decline options no longer pay spiritStone — that was the literal
    // "跑路就送钱" / "说'暂避风险'却发放无来源灵石" the locked spec bans, and the receipt would have had to
    // report a gain with no origin.
    //
    // WHY CULTIVATION RATHER THAN TIME: the registry requires a core choice to change a long-term
    // dimension, and the two honest candidates were time or a minimal registered effect. Time was rejected
    // because a decline that costs a year moves the lifespan-ceiling crossing of a short run into an Event
    // resolution, and CONTENT01-022 pins that a 24-year life ends by node 3–5. 修为 is what this template
    // already uses for its cautious dimension (`consider` 150, risk `read-signs` 180); withdrawal is the
    // smallest of the three, so it takes the smallest amount. Nothing is fabricated and no resource is
    // granted. The remaining defect on these template Events is their generic wording, which is disclosed
    // separately rather than hidden inside an effect change.
    { id: "leave", scope: "core", labelKey: label("leave", "见好便收"), outcomes: { success: { effects: [...declare(spec.prepBuild === true ? [{ op: "OUTCOME_TIME_DELTA", years: 1 }] : [{ op: "ADD_CULTIVATION", amount: 60 }]), ...close("EXPIRE_CAUSE")] } } }
  ];
}

function event(spec: Spec): EventDefinition {
  // PLAYUX01: the shared "你可以顺势而行……留下形状" tail is gone. A body is exactly what the author
  // wrote — an explicit `body` when present, otherwise the one-sentence summary. Nothing is appended.
  const titleKey = text(`${spec.id}.title`, spec.title); const bodyKey = text(`${spec.id}.body`, spec.body ?? spec.summary);
  // PLAYUX01 (F3): an authored resolution note, registered under an exact key so the client can render it
  // without knowing the scene's kind and without the server publishing a new field.
  if (spec.outcomeNote !== undefined) text(`${spec.id}.resolution`, spec.outcomeNote);
  // PLAYFEEL01 (B2/B3): the settled narration, registered under exact keys. The choice-level sentence is
  // `${id}.settle.${choiceId}` and a tier-specific sentence is `${id}.settle.${choiceId}.${tier}`, which
  // mirrors the two enums the receipt actually carries (`narrative.choiceId` and `narrative.appliedTier`).
  // Registering them here means the client resolves copy exactly as it resolves every other string, and the
  // generated catalog's freshness check covers them without a second mechanism.
  if (spec.settlements !== undefined) for (const [choiceId, copy] of Object.entries(spec.settlements)) text(`${spec.id}.settle.${choiceId}`, copy);
  if (spec.tierSettlements !== undefined) for (const [choiceId, tiers] of Object.entries(spec.tierSettlements)) for (const [tier, copy] of Object.entries(tiers)) text(`${spec.id}.settle.${choiceId}.${tier}`, copy as string);
  return {
    id: spec.id, version: 1, kind: spec.risk === undefined ? "choice" : "combat", titleKey,
    tags: ["content01", ...(spec.onboarding ? ["onboarding"] : []), ...(spec.actions === undefined ? ["ordinary"] : []), ...(spec.build === undefined ? [] : [`build-${spec.build}`]), ...(spec.npcRole === undefined ? [] : [`npc-${spec.npcRole}`]), ...(spec.risk === undefined ? [] : ["risk"]), ...(spec.origins === undefined ? [] : ["cause-origin"])],
    weight: 100, ...(spec.actions === undefined ? {} : { actionAffinity: spec.actions }),
    directorHints: { salience: spec.salience, baseWeight: spec.onboarding ? 130 : 100, topicTags: [spec.topic], continuityTags: spec.continuity, buildAffinityTags: spec.build === undefined ? [] : [spec.build], npcRoleAffinityTags: spec.npcRole === undefined ? [] : [spec.npcRole], worldAffinityTags: [], ...(spec.onboarding ? { onboardingEligible: true } : {}), ...(spec.ordinaryActions === undefined ? {} : { ordinaryActionTags: spec.ordinaryActions }) },
    ...(spec.participant === undefined ? {} : { participants: [spec.participant] }), ...(spec.cooldown === undefined ? {} : { cooldown: spec.cooldown }), choices: choices(spec), fallback: { bodyKey }
  };
}

const onboarding: Spec[] = [
  { id: "content01.onboarding.first-breath", settlements: { "keep-driving": "你按原路把这一口气推过第三个周天。胸口先是一紧，那一处滞涩随后松开半分，气息终于连成完整的一圈。收功时掌心微热，这一坐才算真正入了门。", "ease-off": "你松开半分，把急吸换成缓呼。气不再冲撞胸口，散得也慢，一圈走完比方才多花了小半日。你没有强求那一口气，只把新的节奏记了下来。", "stop-here": "你在滞涩处停了手，没有硬推过去。这一坐所得不多，只是记住了呼吸的次序：先缓后深，急处不动。起身时晨雾刚散，日头才露。" },  title: "初息", summary: "晨雾尚未散尽，你第一次把纷乱心绪收进一呼一吸之间。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["cultivation"], onboarding: true, body: "晨雾尚未散尽。你盘坐下来，第一次试着把纷乱心绪收进一呼一吸之间。气息刚走过第三个周天，胸口的滞涩提醒你：这一步还太急。你可以按原路继续行功，也可以先松开半分，或者就到此收功。", choiceSet: [{"id":"keep-driving","label":"照原路继续行功，把这口气推过去","effects":[{"op":"ADD_CULTIVATION","amount":220}]},{"id":"ease-off","label":"松开半分，改用更缓的呼吸","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stop-here","label":"就到这里收功，先记住这个节奏","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  // PLAYUX01 (B3): `go-village` no longer pays a spiritStone. Walking the flat road around the village had
  // no transaction and no found object behind it, so the currency had no origin. What the option really
  // costs is time — it is the long way round — and OUTCOME_TIME_DELTA is exactly that. The body already
  // frames the choice as 赶路 versus 看得清楚, so a route that only differs in hours is the honest reading.
  { id: "content01.onboarding.mountain-road", settlements: { "take-ford": "你走了林边那条有车辙的近路。树影压下来，脚下深浅不一，走得急，方向却越走越含糊。好在路是短的，一日就过去了。", "scout-ridge": "你先爬上高处。林里的情形看清了：没有埋伏，也不见人烟。你在石头上坐了一阵，借着山风把气息理匀，再下岭时天已近晚。", "go-village": "你绕去村里，走那条路平的道。炊烟、犬吠、晒谷的场院都从身边过去，没有人拦你，也没有人和你搭话。多走的这一程，只是多走的。" },  title: "山路", summary: "一条山路分向林深与村郭，两边都有人走过，却没有人为你担保。", actions: ["travel"], salience: 2, topic: "travel", continuity: ["exploration"], onboarding: true, body: "一条山路在前方分成两股：靠林的一侧树影深，脚下有旧车辙；绕村的一侧路平些，能听见炊烟，没有新鲜的脚印。没有人为你担保，也没有人为你指路。要紧的是你此刻要赶路，还是要看得清楚。", choiceSet: [{"id":"take-ford","label":"走林边有车辙的那条近路","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"scout-ridge","label":"先爬上高处看清林里的情形","effects":[{"op":"ADD_CULTIVATION","amount":200},{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"go-village","label":"绕去村里，按路平的那条走","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]}] },
  // PLAYUX01 (F3-B): the money has an origin INSIDE this scene.
  //
  // The B3 pass replaced "buy and receive currency" with "sell the herbs you gathered on the road", which
  // fixed the contradiction but silently asserted a possession the run never recorded: nothing gives the
  // player a bundle of herbs at start, so the sale paid for an item that did not exist. The scene is now a
  // paid piece of work that begins and ends inside the market — the vendor has a basket he cannot sort and
  // pays the player to do it — so the spiritStone is a stated fee for something done in front of the
  // player, and no prior inventory is claimed or consumed.
  //
  // The trade-off is still money against time: taking his number settles at once for less, while settling
  // what the basket is actually worth is paid better and costs the time it takes to argue it out. Nothing
  // here promises an item, a future sale or a relationship.
  { id: "content01.onboarding.market-choice", settlements: { "take-deal": "你按摊主给的数，把这一筐杂药一味一味分好。他数出几个灵石放在你手心，没有多话，也没有少给。这笔钱是从他手里出来的，你收得踏实。", "haggle-fair": "你先替他分清三味药，再把这一筐该值多少讲给他听。摊主愣了一会重新报价，多给了你一些。讲价耗去小半日，但账是当面算清的。", "ask-source": "你问他这一筐要卖给谁。他答得含糊，只说往北边去。你没有再问，那一筐药也始终没有分完。你多留了一个心眼，也多花去一日。" },  title: "早市", summary: "早市里灵石与人情一同流转，摊主的话半真半假，买卖之外还有眼色。", actions: ["worldly"], salience: 2, topic: "trade", continuity: ["human-world"], onboarding: true, body: "早市刚开。摊主收了一筐杂药，其中几味他分不清，报给外行一个偏低的数，也没有说为什么低。你可以按他给的数替他把这一筐分好，也可以先把该值多少讲清楚再动手，或者先问清他打算把这一筐卖给谁。", choiceSet: [{"id":"take-deal","label":"按他给的数替他把这一筐分好","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1}]},{"id":"haggle-fair","label":"先把这一筐该值多少讲清楚再动手","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":2},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-source","label":"先问清他打算把这一筐卖给谁","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  // PLAYUX01 (B3): every option here used to pay cultivation for tracking, noting a position or asking
  // around — none of which is 修行, and none of which recorded a clue. The spec is explicit: without a
  // legitimate recordable clue, do not show "found a lead". No actor-free Cause template exists, so a
  // pursuit Event with no participant cannot plant one; the honest settlement is therefore the time each
  // course of action really costs. Following the cut trail into the brush and detouring to question
  // villagers both spend two years; merely noting the position spends one. Nothing is claimed to have
  // been found, and the receipt says so if nothing measurable moved.
  // PLAYUX01 (F3-C): the three options are honest about what they settle — time, and nothing recorded —
  // but "honest numerically" left the player unable to tell whether an investigation had found anything.
  // The scene now answers that itself in `outcomeNote`, which the result panel renders: the choice the
  // player made is named, and where nothing was found the scene says so. It does not promise a later
  // continuation and it does not plant a Cause, because neither is something this settlement produced.
  { id: "content01.onboarding.old-trace", settlements: { "follow-fresh": "你顺着新断口追进荒草。断痕一路新鲜，走出二里却忽然断了，草叶倒伏的方向与来路对不上。你在原地转了两圈，没有找到第二处痕迹。", "mark-spot": "你没有急着追，只在石壁前把断口的形状看熟，又记下方位。回头看那一眼，仍然看不出这道痕是谁留下的。", "ask-locals": "你转去问附近的人。有人说前些日子见过一个背竹篓的过客，也有人说那痕是野物蹭的。两句话彼此对不上，你没能问出个准信。" },  title: "旧痕", summary: "石壁上一道旧痕延伸进荒草，来处模糊，去处也未必值得追。", actions: ["pursuit"], salience: 2, topic: "secret", continuity: ["exploration"], onboarding: true, body: "石壁上一道旧痕延伸进荒草。来处已经模糊了，断口却很新——留下它的人不久之前还在这里。你可以沿着断口追进荒草，也可以先记下位置，或者转去问附近的人。", outcomeNote: "这一次追查还没有取得可以确认的新线索。", choiceSet: [{"id":"follow-fresh","label":"顺着新断口追进荒草","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"mark-spot","label":"先记下位置，不急于这一步","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-locals","label":"转去问附近的人有无异常","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]}] },
  // PLAYUX01 (B3): the social act here has no participant to bind to, so no relation could be recorded —
  // and the option was paying a spiritStone for walking away, which is the banned pattern. A participant
  // was deliberately NOT added: materializing one consumes an `npc` RNG draw, which would change the
  // deterministic stream for every run (G02/G06). What staying or leaving really costs is time, so the
  // three options differ only in how long the player stands under the eaves.
  { id: "content01.onboarding.rain-shelter", title: "避雨", summary: "骤雨把几名陌生人困在同一檐下，沉默比寒意更先试探彼此。", actions: ["travel", "worldly"], salience: 1, topic: "trust", continuity: ["travel"], onboarding: true, body: "骤雨把几名陌生人困在同一檐下。雨声太大，说话要提高嗓门，反而没人先开口。沉默比寒意更先试探彼此：谁挪一挪，谁就先把话说出去了。", choiceSet: [
  {"id":"engage","label":"挪半个身位，先把伞递过去","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]},
  {"id":"consider","label":"靠着柱子不动，听这一场雨落完","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"雨脚一转就先行赶路","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
] },
  { id: "content01.onboarding.quiet-retreat", settlements: { "sit-again": "你照原样再坐一段。走神还是有的，只是每回心神散出去再收回来，都比上一回快些。半日过去，心绪沉了下去，气机也跟着稳了。", "change-method": "你换了法子重起一轮：不再数息，只守着丹田那一点。前半日比原样更不顺，直到午后才接上，气机反倒比先前匀了几分。", "close-day": "你把这一日收束了，没有硬撑下去。蒲团归位，静室扫净。所得不多，但也没有把走神坐成习惯，明日再来时还接得上。" },  title: "静室", summary: "静室里没有异象，只有一次次走神与重新坐定，修行显得朴素而漫长。", actions: ["cultivate"], salience: 1, topic: "cultivation", continuity: ["discipline"], onboarding: true, body: "静室里没有异象，只有一次次走神与重新坐定。你数到第几遍时开始怀疑自己走了岔路。你可以照原样再坐一段，也可以换个法子重起一轮，或者今日就此收束。", choiceSet: [{"id":"sit-again","label":"照原样再坐一段，看能否坐稳","effects":[{"op":"ADD_CULTIVATION","amount":200}]},{"id":"change-method","label":"换个法子重起一轮行功","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"close-day","label":"今日就此收束，改日再来","effects":[{"op":"ADD_CULTIVATION","amount":70},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.onboarding.roadside-injury", settlements: { "help-dress": "你蹲下来替他理伤，先封住出血的那一处，再把错开的骨节顺回去。他盯着你的手，直到疼劲过去才松了肩膀，把你的名字问了一遍。", "keep-distance": "你站远了些，问他是怎么伤的。他说是昨夜在岔口遇上了人，其余的说不清楚。你没有靠前，也没有替他处理那道伤口。", "just-notice": "你只记下这个人的样子：左眉一道旧疤，衣角是青灰的。你没有上前，也没有问话。走过去之后，他还在原地坐了一阵。" },  title: "路边伤者", summary: "路边有人捂着伤口，血已经止住，他仍警惕每一双靠近的手。", actions: ["worldly"], salience: 2, topic: "injury", continuity: ["trust"], onboarding: true, participant: generated("mortal-traveler"), body: "路边有人坐着捂住伤口。血已经止住，他仍盯着每一双靠近的手。你可以上前替他处理，也可以先站远些问清发生了什么，或者只记住这个人。", choiceSet: [{"id":"help-dress","label":"上前替他处理伤口","effects":[{"op":"ADD_CULTIVATION","amount":180},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.event"}]},{"id":"keep-distance","label":"先站远些问清他遇到了什么","effects":[{"op":"ADD_CULTIVATION","amount":120}]},{"id":"just-notice","label":"只记下这个人的样子，不去打扰","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  // PLAYUX01 (B3): the same pursuit contradiction as old-trace, on the other 追索 opening. Choosing which
  // of two trails to walk is not 修行 and recorded no clue, so paying cultivation for it was the spec's
  // "追查真相却只给纯修为奖励". No actor-free Cause template exists to record a real lead, so the honest
  // settlement is the time each course takes — the bait trail is the longest, because following a
  // deliberately tidy track means walking further before it thins out.
  { id: "content01.onboarding.forked-path", settlements: { "clear-trail": "你顺着清楚的那股脚印走下去。走了许久，脚印忽然混进一片乱石，再找不着了。追索眼下没有明确对象，不如先四处游历，寻到机缘再回来。", "neat-trail": "你去试了那串过于整齐的痕迹。走了半日，脚印在一处断崖前停住，底下是空的。留下它的人，像是特意把你引到这里。", "hold-position": "你哪里也没去，只把两股痕迹的位置都记下来。风把草吹得乱晃，站得越久越分不清哪一股才是新的。这一趟没有确认任何东西。" },  title: "岔路", summary: "你追寻的线索在此分成两股，一股清楚，一股更像有意留下的诱饵。", actions: ["pursuit"], salience: 2, topic: "opportunity", continuity: ["secret"], onboarding: true , outcomeNote: "这一次追查还没有取得可以确认的新线索。", body: "你追寻的线索在此分成两股。一股脚印清楚、方向明确；另一串痕迹像是特意留下的，过于整齐。你可以顺着清楚的那股走，也可以去试那串整齐的，或者暂时按兵不动。", choiceSet: [{"id":"clear-trail","label":"顺着清楚的那股脚印走","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"neat-trail","label":"去试那串过于整齐的痕迹","effects":[{"op":"OUTCOME_TIME_DELTA","years":3}]},{"id":"hold-position","label":"暂不动作，先把两股都记下","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}]}
];

const ordinary: Spec[] = [
  { id: "content01.ordinary.tea-house", settlements: { "finish-cup": "你把这半盏茶喝完，起身出门。茶还温着，歇脚也够。棚外的路还长，你把包袱系紧，重新上了道。", "stay-listen": "你坐回原处，听邻桌三人把这趟远行说完。他们谈得热闹，没有人问你从哪里来。听着听着，你反倒静了下来，就着这几盏茶入了定。" },  title: "半盏茶", summary: "小镇茶棚只剩半壶温茶，邻桌的人谈论一场与你无关的远行。", salience: 1, topic: "human-world", continuity: ["travel"], body: "茶棚里只剩半壶温茶。邻桌三人谈起一场与你无关的远行，说得很热闹，没有人问你从哪里来。棚外的路还长，你要决定的只是这壶茶喝完就走，还是坐到它凉透。", choiceSet: [{"id":"finish-cup","label":"喝完这半盏茶便走","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stay-listen","label":"坐到茶凉，听完这段远行","effects":[{"op":"ADD_CULTIVATION","amount":90},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.ferry-wait", title: "候渡", summary: "河雾压住渡口，船家不肯冒险开船，所有人只得等水声慢下来。", salience: 1, topic: "travel", continuity: ["human-world"], ordinaryActions: ["travel"], body: "河雾压住渡口，船家不肯冒险开船。等的人越来越多，谁也不愿先开口。你可以留在雾里等一趟船，也可以沿河岸走到下一个渡口——那条路更远，但至少在走。", choiceSet: [{"id":"wait-ferry","label":"留在渡口等一趟船","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"walk-upstream","label":"沿河岸走到下一个渡口","effects":[{"op":"ADD_CULTIVATION","amount":110},{"op":"OUTCOME_TIME_DELTA","years":2}]}] },
  { id: "content01.ordinary.missed-letter", title: "迟信", summary: "一封辗转多地的旧信终于到了手中，纸角磨损，寄信人未留下回址。", salience: 2, topic: "memory", continuity: ["promise"], ordinaryActions: ["pursuit"], body: "一封辗转多地的旧信终于到了手中，纸角磨损，寄信人没有留下回址。信里只提到一处地方，别的什么都没有。你可以照这处地名去找，也可以先弄清楚这封信为何迟到这么久。", choiceSet: [{"id":"follow-place","label":"照信里那处地名去找","effects":[{"op":"ADD_CULTIVATION","amount":160},{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"trace-delay","label":"先查这封信为何迟到这么久","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.broken-bridge", title: "断桥", summary: "山洪冲断木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。", salience: 2, topic: "trust", continuity: ["human-world"], ordinaryActions: ["travel","worldly"], body: "山洪冲断了木桥，两岸的人隔水商量，谁也不愿先把绳索抛出去。你可以先帮对岸把绳索拉起来，也可以只问清对面有几个人、家在哪个方向，再决定要不要出力。", choiceSet: [{"id":"throw-rope","label":"先把绳索抛过去，帮他们过河","effects":[{"op":"ADD_CULTIVATION","amount":150},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-terms","label":"只问清对面的人数与去向","effects":[{"op":"ADD_CULTIVATION","amount":100},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.night-rain", title: "夜雨", summary: "夜雨敲窗，你想起数年前一次仓促告别，那句话至今没有说完。", salience: 1, topic: "memory", continuity: ["loss"], ordinaryActions: ["cultivate"], body: "夜雨敲窗。你想起数年前一次仓促告别，那句话至今没有说完。念头一起就压不住。你可以坐下来把这段心绪行功化开，也可以就着雨声把它放到明天。", choiceSet: [{"id":"engage","label":"就着雨声坐下来，把这段心绪行功化开","effects":[{"op":"ADD_CULTIVATION","amount":170}]},{"id":"consider","label":"不起身，先把这一夜雨听完","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"leave","label":"压下心绪，明日照常赶路","effects":[{"op":"ADD_CULTIVATION","amount":60},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.roadside-debate", title: "道旁争言", summary: "两名修士为一条旧规争得面红耳赤，围观者各有私心，却都说为了公道。", salience: 2, topic: "rivalry", continuity: ["human-world"], participant: generated("wandering-cultivator"), ordinaryActions: ["worldly"], body: "两名修士为一条旧规争得面红耳赤，围观者各有私心，嘴上却都说为了公道。你可以当场评一句谁站得住，也可以只问清这条旧规究竟伤过谁，再决定要不要开口。", choiceSet: [{"id":"pick-a-side","label":"当场评一句谁站得住","effects":[{"op":"ADD_CULTIVATION","amount":140}]},{"id":"ask-who-hurt","label":"只问这条旧规究竟伤过谁","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.event"}]}] },
  { id: "content01.ordinary.empty-search", settlements: { "follow-footprints": "你照那几处脚印继续追下去。脚印被雨冲淡，走一段断一段，追到坡下才发现方向反了。一日就这么过去，你什么也没有找到。", "redraw-map": "你承认今日无所得，坐下把旧图重画。照着记忆改了几处方位，画完自己也清楚未必准确。日头偏西，你收了纸笔。" },  title: "空寻", summary: "你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。", salience: 1, topic: "exploration", continuity: ["secret"], ordinaryActions: ["pursuit"], body: "你按旧图找了一日，只见苔痕、碎石与几处被雨冲淡的脚印。旧图上标的方位已经偏了。你可以照脚印的走向继续追，也可以承认今日无所得，回头重画。", choiceSet: [{"id":"follow-footprints","label":"照那几处脚印继续追下去","effects":[{"op":"OUTCOME_TIME_DELTA","years":2}]},{"id":"redraw-map","label":"承认今日无所得，回头重画","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.shared-fire", title: "同火", summary: "荒野风紧，陌生旅人分出半边篝火，彼此都没有追问来历。", salience: 2, topic: "trust", continuity: ["travel"], participant: generated("mortal-traveler"), ordinaryActions: ["travel"], body: "荒野风紧，陌生旅人分出半边篝火，谁也没有追问来历。你可以守着火陪到天亮，也可以问问他接下来往哪条路走——问了他才记得你们照过面。", choiceSet: [{"id":"keep-watch","label":"守着火陪到天亮","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"ask-route","label":"问他接下来往哪条路走","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":400,"reasonTag":"npc.reason.event"}]}] },
  // PLAYUX01 (B3): same contradiction class as market-choice, and it was authored in stage B. `buy-herbs`
  // read "买下药材" while paying a spiritStone, so buying produced money. It is now a sale, and the option
  // id was renamed to match so the id and the wording cannot disagree. `trade-for-news` loses its 180
  // cultivation: promising to pass along a road report is a social act, not 修行 — what it really costs is
  // the time the detour to carry the news takes.
  { id: "content01.ordinary.market-bargain", settlements: { "sell-herbs": "你把行商那包混在一起的药材逐一分拣，理顺了品相。他看过一遍，挑出两味放错的收好，付了你工钱。这笔灵石是你动手挣来的。", "trade-for-news": "你把那条路况说给他听，请他替你捎一句话。他听完点头，说这消息值这个价。两人没有过手灵石，只有一句口头约定留在中间。" },  title: "小交易", summary: "行商修士摆出几味寻常药材，真正要交换的却是一条路况消息。", salience: 2, topic: "trade", continuity: ["opportunity"], participant: generated("merchant-cultivator"), ordinaryActions: ["worldly"], body: "行商修士摆出几味寻常药材，也收草药。价钱报得干脆利落，可他真正想交换的，是一条路况消息：哪一段路近来不太平。你可以只把随身草药作价给他，也可以加进那条消息，用一个承诺换它。", choiceSet: [{"id":"sell-herbs","label":"替他把混在一起的药材分开","effects":[{"op":"ADD_RESOURCE","key":"spiritStone","amount":1},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.event"}]},{"id":"trade-for-news","label":"加进那条路况消息，用一个承诺换它","effects":[{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.event"},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.mountain-view", settlements: { "breathe-here": "你在岩石上坐下调息。山风一层层过去，呼吸也跟着平缓。这一坐没有异象，只把登山的疲累换了回来，气机顺了不少。", "orient-and-go": "你辨清方位，记下远近几座山头的形貌，随后下岭。路上没有遇到人，也没有遇到别的东西。天暗下来时，你已经在另一条道上。" },  title: "山色", summary: "登高之后并无奇遇，只有群山在暮色里一层层远去，呼吸也随之平缓。", salience: 1, topic: "cultivation", continuity: ["travel"], body: "登高之后并无奇遇。群山在暮色里一层层远去，呼吸也随之平缓。你可以就地调息，把这段山路换来的清醒收进气机；也可以辨清方位后继续上路。", ordinaryActions: ["travel","cultivate"], choiceSet: [{"id":"breathe-here","label":"就地调息，把这段清醒收进气机","effects":[{"op":"ADD_CULTIVATION","amount":160}]},{"id":"orient-and-go","label":"辨清方位后继续上路","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  // PLAYUX01 (B3): the villagers are mortals and have no spiritStone to pay with, so `work-field` paying
  // two of them was a currency with no plausible payer. What the player actually takes away from a day of
  // field work is that these people now remember them, which is exactly what ADD_NPC_SIGNIFICANCE records —
  // and the Event already carries a generated mortal participant for it to bind to. `guard-store`'s 120
  // cultivation is gone for the same reason as elsewhere in this pass: watching a grain pile is not 修行.
  { id: "content01.ordinary.harvest-help", title: "收谷", summary: "村人赶在风雨前收谷，人手不足，修士的一日也能换来许多凡俗年月。", salience: 2, topic: "human-world", continuity: ["time"], participant: generated("mortal-traveler"), ordinaryActions: ["worldly"], body: "村人赶在风雨前收谷，人手不足，只要你肯搭把手，一个时辰就能补上缺口。你可以下地收谷，也可以替他们看住堆在院里的谷堆，等他们回来再一起分。", choiceSet: [{"id":"work-field","label":"下地一起收谷","effects":[{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.event"},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"guard-store","label":"替他们看住院里的谷堆","effects":[{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":300,"reasonTag":"npc.reason.event"},{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.ordinary.old-song", settlements: { "sit-through": "你坐到这一曲终了。旋律并不精妙，可琴音一起一落，正好把你散乱的气息带匀。起身时心里静了下来，如同又坐了一小会儿。", "meet-player": "你起身走到角落。弹琴的是个过路老者，见你过来只把手从弦上挪开，问你要听哪一首。你们说了几句曲子的事，他把琴收进布囊就走了。" },  title: "旧曲", summary: "客栈角落有人弹起旧曲，旋律并不精妙，却让几位过客同时安静下来。", salience: 1, topic: "memory", continuity: ["human-world"] , body: "客栈角落有人弹起旧曲。旋律并不精妙，几位过客却同时安静下来。你可以坐到曲终再起身，也可以直接起身去看弹琴的人是谁——后者也许更接近这段曲子的来处。", choiceSet: [{"id":"sit-through","label":"坐到这一曲终了再起身","effects":[{"op":"ADD_CULTIVATION","amount":100}]},{"id":"meet-player","label":"起身去看弹琴的人是谁","effects":[{"op":"ADD_CULTIVATION","amount":140},{"op":"OUTCOME_TIME_DELTA","years":1}]}]}
];

const npcEvents: Spec[] = [
  { id: "content01.pei.broken-blade", settlements: { "bind-1": "你与裴照川把话说定：这一路同行，遇事先通气。他把断剑往膝上按了按，算是应了。此后你若再见他，这一句话都还在。", "bind-2": "你与他以剑相争。断剑碰在一处，过了十几个回合才各自收手。谁也没有伤着谁，只是都记住了对方的剑路。", "decline": "你只说一句改日再会，没有问他的去处。裴照川把断剑收回鞘里，点了点头。你们此后再无干系，也未通音信。" },  choiceLabels: { decline: "只说一句改日再会，不问他的去处" },  title: "断剑客", summary: "裴照川把断剑横在膝上，他谈的是同行，不是收徒，也没有先许下情分。", actions: ["travel", "worldly"], salience: 3, topic: "promise", continuity: ["rivalry", "sword"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), origins: [{ templateId: "content01.cause.broken-sword-promise", salience: 4, label: "与他定约" }, { templateId: "content01.cause.broken-sword-rivalry", salience: 3, label: "以剑相争" }], cooldown: oncePerRun, body: "裴照川把断剑横在膝上，剑格上还留着上一次交手的缺口。他谈的是同行，不是收徒，也没有先许下情分。你要决定的是：以剑相争分个明白，还是先问清他这趟要往哪里去。" },
  { id: "content01.pei.sparring-rain", title: "雨中试剑", summary: "雨线斜落，裴照川只问你是否还愿意拔剑，胜负之外还要看你如何收手。", actions: ["cultivate", "pursuit"], salience: 3, topic: "rivalry", continuity: ["sword", "promise"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4) , closure: true, body: "雨线斜落，裴照川只问你是否还愿意拔剑。他没有摆出架势，胜负之外还要看你如何收手：剑出到哪一步算完，收手时剑锋朝哪一边，都是他自己选的事。", choiceSet: [
  {"id":"engage","label":"拔剑，但只走到他说的那一步","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.sword","amount":900,"reasonTag":"content01.sword"},{"op":"ADD_CULTIVATION","amount":150}]},
  {"id":"consider","label":"先问清他今日想试的是剑还是人","effects":[{"op":"ADD_CULTIVATION","amount":130},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"收剑鞘而不发","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },
  { id: "content01.pei.old-wound", choiceLabels: { "take-risk": "接手扶住他发抖的那只手，把这一程走完", "read-signs": "先看清他伤的到底是哪一处", "turn-away": "不强接，退回半步等他开口" },  title: "旧伤复作", summary: "裴照川行至半坡忽然停步，旧伤让他的右手微颤，他却不肯把决定交给旁人。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["sword", "trust"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), risk: "threat.critical-injury", cooldown: spaced(5), body: "裴照川行至半坡忽然停步，旧伤让他的右手微颤。他把剑换到左手，语气仍然平稳，却不肯把这个决定交给旁人照看。你要决定的是：替他分忧，还是等他把话说完。" },
  { id: "content01.pei.promise-echo", title: "剑约未冷", summary: "多年后那柄断剑仍在，裴照川没有复述旧约，只把另一条路摆到你面前。", salience: 4, topic: "promise", continuity: ["sword", "rivalry"], build: "sword", npcRole: "sword", participant: core("pei-zhaochuan"), cooldown: spaced(4) , closure: true, body: "多年后那柄断剑仍在，剑身上的缺口没有补。裴照川没有复述当年的旧约，只把另一条路摆到你面前，像在问：当年那件事，现在还算不算数。", choiceSet: [
  {"id":"engage","label":"接下他递来的第二条路","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.sword","amount":900,"reasonTag":"content01.sword"},{"op":"ADD_CULTIVATION","amount":160}]},
  {"id":"consider","label":"先问清当年断的是哪一段","effects":[{"op":"ADD_CULTIVATION","amount":120},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"不接这条路，转身离开","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.jiang.herb-price", settlements: { "bind-1": "你认下这份药债。姜雪芜把账目合上，说既认了便不必再算。你欠下的不只是那几味药材，还有她替人止伤耗去的半日。", "decline": "你把账目逐项看清，却没有认下这份人情。姜雪芜没有为难你，只把纸收了。此后她若再见你，这一笔仍是两清。" },  choiceLabels: { decline: "不认这份人情，只把账目看清" },  title: "药有其价", summary: "姜雪芜替人止住伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["debt", "trust"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), origins: [{ templateId: "content01.cause.medicine-debt", salience: 3, label: "认下药债" }], cooldown: oncePerRun, body: "姜雪芜替人止住了伤势，随后把耗去的药材与时间逐项说清，不多收，也不抹去。账目摆在桌上，谁都可以核。你要决定的是：当场认下这份人情，还是先把每一项都问明白。" },
  { id: "content01.jiang.night-clinic", choiceLabels: { engage: "选最稳妥的那一种，当场把话说定", consider: "先把最昂贵的那一种问到底", leave: "今夜先不开口，退出去" },  title: "夜诊", summary: "夜深后仍有人敲门，姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面。", actions: ["worldly", "cultivate"], salience: 3, topic: "medicine", continuity: ["injury", "human-world"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4), body: "夜深后仍有人敲门。姜雪芜看过伤口，把最稳妥与最昂贵的办法都说在前面，没有替你选，也没有把话说软。她只等着你说出一个能担得起的决定。" },
  { id: "content01.jiang.bitter-decoction", choiceLabels: { "take-risk": "按快煎的法子把这锅药端下去", "read-signs": "先分清是哪一味在相冲", "turn-away": "不冒这一炉，把火撤了" },  title: "苦汤", summary: "一锅药汤气味辛烈，姜雪芜提醒其中一味药性相冲，省事与稳妥不能两全。", actions: ["cultivate"], salience: 3, topic: "medicine", continuity: ["danger", "alchemy"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), risk: "threat.poison", cooldown: spaced(5), body: "一锅药汤气味辛烈。姜雪芜提醒其中一味药性相冲：省事与稳妥不能两全，快煎伤身，慢煎费时。她把两种代价都摆出来，剩下的由你决定要不要冒这个险。" },
  { id: "content01.jiang.debt-echo", title: "旧账新页", summary: "姜雪芜翻到旧账那一页，没有催促，只问你如今是否仍认得当年的代价。", salience: 3, topic: "debt", continuity: ["medicine", "promise"], build: "alchemy", npcRole: "healer", participant: core("jiang-xuewu"), cooldown: spaced(4) , closure: true, body: "姜雪芜翻到旧账那一页，没有催促，指尖停在当年记下的数目上。她只问你如今是否仍认得当年的代价：认，这页就翻过去；不认，也请把话说清。", choiceSet: [
  {"id":"engage","label":"按当年记下的数还清","effects":[{"op":"ADD_CULTIVATION","amount":140},{"op":"ADD_BUILD_EVIDENCE","buildId":"build.alchemy","amount":900,"reasonTag":"content01.alchemy"}]},
  {"id":"consider","label":"先核一遍旧账里记的到底是什么","effects":[{"op":"ADD_CULTIVATION","amount":110},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"这一页不必翻，就此作罢","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.cen.shoulder-road", choiceLabels: { decline: "各自按各自的路走，不再同行" },  title: "并肩负伤", summary: "岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走。", actions: ["travel", "worldly"], salience: 4, topic: "injury", continuity: ["trust", "body"], build: "body", npcRole: "body", participant: core("cen-bugui"), origins: [{ templateId: "content01.cause.shared-wound", salience: 4, label: "与他同行" }], cooldown: oncePerRun, body: "岑不归替你挡下一击，自己也伤得不轻。他不谈恩情，只问接下来的路怎样走：是一起按原路赶，还是先在这里处理伤势再动。他的肩还在往下滴血。" },
  { id: "content01.cen.stone-steps", choiceLabels: { engage: "跟上他的步子，把剩下的台阶走完", consider: "先看清他走的是哪一条石阶", leave: "喝下那瓢水，不再往上" },  title: "负石登阶", summary: "岑不归背石登阶，每一步都极慢。他不劝你跟上，只在山腰留了一瓢清水。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body", "cultivation"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4), body: "岑不归背石登阶，每一步都极慢，呼吸比石头还重。他不劝你跟上，也不催你离开，只在山腰留了一瓢清水。台阶还有一半，水已经凉了。" },
  { id: "content01.cen.shield-stranger", choiceLabels: { "take-risk": "站到缺口另一侧，与他一起挡", "read-signs": "先看清落石是从哪一侧来", "turn-away": "退到岩壁后，不接这一场" },  title: "以身护人", summary: "乱石落下时，岑不归已经站到最窄的缺口。他看向你，等一个共同承担的决定。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["body", "trust"], build: "body", npcRole: "body", participant: core("cen-bugui"), risk: "threat.combat", cooldown: spaced(5), body: "乱石落下时，岑不归已经站到最窄的缺口，抬头看了一眼落石的方向，随即回头等一个共同承担的决定。他没有说「你走吧」，也没有说「我挡着」。" },
  { id: "content01.cen.shared-echo", title: "伤痕相认", summary: "旧伤在阴雨里同时发作，岑不归看见你按住肩头，便知道那一日没有被忘记。", salience: 3, topic: "injury", continuity: ["body", "memory"], build: "body", npcRole: "body", participant: core("cen-bugui"), cooldown: spaced(4) , closure: true, body: "旧伤在阴雨里同时发作。岑不归看见你按住肩头，便知道那一天的代价没有被忘记，也没有被说出口。他难得开了口，说的却只是今日的天气。", choiceSet: [
  {"id":"engage","label":"把当年那道伤指给他看","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.body","amount":900,"reasonTag":"content01.body"},{"op":"ADD_CULTIVATION","amount":140},{"op":"ADD_NPC_SIGNIFICANCE","actorBindingKey":"actor","amount":500,"reasonTag":"npc.reason.cause"}]},
  {"id":"consider","label":"只说一句今日天凉，不提旧事","effects":[{"op":"ADD_CULTIVATION","amount":80},{"op":"OUTCOME_TIME_DELTA","years":1}]},
  {"id":"leave","label":"各自走进雨里，不等对方开口","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}
]  },

  { id: "content01.xie.secret-map", settlements: { "bind-1": "你与谢听潮立约同行：他走前段，你担后半的风险，记号两人都认。他把半张图推过来，另一半仍收在袖里。这笔约定算是落定了。", "bind-2": "你答应同行，心里却留了后手——图上的记号另抄了一份。谢听潮没有察觉。这份心思将来若有回响，也是当年自己埋下的。", "decline": "你不谈分利，把那半张图原样还给他。谢听潮收好图，没有再劝。此后各走各路，图上那些记号都与你无关。" },  choiceLabels: { decline: "不谈分利，把图原样还给他" },  title: "半张秘图", summary: "谢听潮摊开半张秘图，另一半仍在袖中。他愿意分路，也要求先说清如何分利。", actions: ["pursuit", "travel"], salience: 4, topic: "secret", continuity: ["trust", "fortune"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), origins: [{ templateId: "content01.cause.secret-map-pact", salience: 4, label: "立约同行" }, { templateId: "content01.cause.secret-map-breach", salience: 4, label: "暗留后手" }], cooldown: oncePerRun, body: "谢听潮摊开半张秘图，另一半仍收在袖中。他愿意分路，也要求先说清如何分利：谁走前段，谁担风险，图上的记号算不算数。图边角已经磨得起毛。" },
  { id: "content01.xie.cave-gamble", choiceLabels: { "take-risk": "先进洞，把石壁一路摸到底", "read-signs": "先在洞口听清风声的来路", "turn-away": "记住这个洞口，原路退回" },  title: "洞口风声", summary: "洞口吹出的风带着金石气，谢听潮判断里面有路，也坦言判断可能错。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], build: "fortune", npcRole: "ruin-explorer", participant: core("xie-tingchao"), risk: "threat.dangerous-exploration", cooldown: spaced(5), body: "洞口吹出的风带着金石气。谢听潮判断里面有路，也坦言这个判断可能错——他把手按在石壁上等了一息，石头是凉的。他要你先说，进还是退。" },
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

  { id: "content01.xu.mortal-letter", settlements: { "bind-1": "你回了信，答应归去。短笺上只写三个字，写起来却比画符还慢。信由送信人带走，树下那件事你答应了下来。", "decline": "你把短笺收进包里，没有回信。许长安托来的人等不到答复，自己走了。这封信你留着，却未必还等得到下一封。" },  choiceLabels: { decline: "不回这封信，把短笺收进包里" },  title: "人间来信", summary: "许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。", actions: ["worldly", "pursuit"], salience: 3, topic: "human-world", continuity: ["promise", "time"], npcRole: "mortal", participant: core("xu-changan"), origins: [{ templateId: "content01.cause.mortal-promise", salience: 4, label: "答应归去" }], cooldown: oncePerRun, body: "许长安托人送来一封短笺，问的不是仙途，只是你是否还记得旧日门前那棵树。送信人不肯多等，收了脚程钱就走了。信很短，短到只够问这一件事。" },
  // PLAYUX01 (B3): a reunion pays nothing in currency. It declared no `effects` and no build, so the
  // template's primary option fell through to the default +2 spiritStone — money with no origin, awarded
  // for meeting an old friend. The scene already carries 许长安 as a core participant, so what the moment
  // really produces is that he matters more in this life, which ADD_NPC_SIGNIFICANCE records.
  { id: "content01.xu.ten-year-return", choiceLabels: { engage: "走进院子，把这十年当面说给他听", consider: "先在门外看清院里的变化", leave: "不进门，改日再来" },  title: "十年重逢", summary: "你眼中的数次闭关，已是许长安鬓边的一层霜。他仍认得你，也不假装岁月轻巧。", actions: ["worldly"], salience: 4, topic: "time", continuity: ["memory", "human-world"], npcRole: "mortal", participant: core("xu-changan"), cooldown: spaced(5), effects: [{ op: "ADD_NPC_SIGNIFICANCE", actorBindingKey: "actor", amount: 600, reasonTag: "npc.reason.event" }], body: "你眼中的数次闭关，在许长安鬓边已经积了一层霜。他仍认得你，也没有假装岁月轻巧。院门开着，门前那棵树比记忆里高了一些。" },
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
  { id: "content01.build.sword.river-cut", prepBuild: true, settlements: { "engage": "你出剑，只取那一线落点。剑锋偏了半分，削下石棱一角，路恰好让开。手臂震得发麻，剑意反倒比先前清楚了一层。", "consider": "你没有立刻动剑，先把落点看准，又试了两遍腕上的力道，才正式出剑。一剑收势比预想中稳，这一路剑数你记住了七分。", "leave": "你收剑退开，涉水过涧。水冷路远，走得比预想中慢，到对岸已经近黄昏。剑始终没有出鞘，你也没从这一趟里得到什么。" },  choiceLabels: { engage: "出这一剑，只取那一线落点", consider: "先把落点看准再动剑", leave: "收剑退开，涉水过涧" },  title: "截流一剑", summary: "山涧暴涨，石上只容一步，你要用剑开的不是敌人，而是一线可过之路。", actions: ["cultivate", "travel"], salience: 3, topic: "danger", continuity: ["sword"], build: "sword", body: "山涧暴涨，石上只容下脚的地方。要用剑开的不是敌人，而是一线可过之路：剑锋偏了半尺就够不着落点，偏得太多又会把整块石头劈塌。你只有一次出手的余地。" },
  { id: "content01.build.sword.no-draw", choiceLabels: { engage: "按本心拔剑，接下这一场", consider: "先看清这是不是圈套", leave: "任他骂下去，把剑按回鞘里" },  title: "剑未出鞘", summary: "对方故意激你拔剑，真正难的并非出手，而是判断这一剑是否值得。", actions: ["worldly"], salience: 2, topic: "rivalry", continuity: ["sword"], build: "sword", body: "对方故意激你拔剑，把话说得很难听。真正难的并非出手，而是判断这一剑值不值得——拔了可能中了圈套，不拔也可能错过唯一的机会。" },
  { id: "content01.build.sword.guard-caravan", choiceLabels: { engage: "握剑走在外侧，先稳住剑", consider: "先听清路上风声从哪来", leave: "不接这一趟，让商队自行过岭" },  title: "护行", summary: "商队只求平安过岭，剑锋若太快，可能把原本能谈的局面推向死斗。", actions: ["travel"], salience: 3, topic: "trust", continuity: ["sword", "human-world"], build: "sword", body: "商队只求平安过岭。剑锋若出得太快，原本能谈的局面会被推成死斗；慢一步，路上的风声却可能先到。你要决定的是先稳住人，还是先稳住剑。" },
  { id: "content01.build.body.boulder", choiceLabels: { engage: "咬着牙把这块石头挪开", consider: "先估一估石头的重心在哪", leave: "绕过去，把力气留到后面" },  title: "移石", summary: "巨石堵住山道，术法并非唯一办法，筋骨与耐心也能一点点挪开困局。", actions: ["cultivate"], salience: 2, topic: "discipline", continuity: ["body"], build: "body", body: "巨石堵住山道，术法并非唯一办法。筋骨与耐心也能一点点把困局挪开，只是要耗上好几日。你可以用更省力的法子绕过去，也可以咬着牙把石头一点点挪开。" },
  { id: "content01.build.body.cold-water", choiceLabels: { engage: "把气咬住，下潭走一遍", consider: "先看清潭底深浅再下水", leave: "今日到此为止，收身出水" },  title: "寒潭", summary: "寒潭入骨，继续停留能磨炼气血，也可能让旧伤在夜里更深一分。", actions: ["cultivate"], salience: 3, topic: "injury", continuity: ["body", "danger"], build: "body", body: "寒潭入骨。继续停留能磨炼气血，也可能让旧伤在夜里更深一分。水面安静得看不出深浅，你要在下水之前决定，是把这口气咬住，还是今天到此为止。" },
  { id: "content01.build.body.carry-wounded", choiceLabels: { engage: "背起他，走多慢都背到底", consider: "先看清前段山路能不能过人", leave: "留下他，自己先赶路" },  title: "背人下山", summary: "伤者无法再走，山路仍长。背起一个人，意味着把自己的退路也交给脚下。", actions: ["travel", "worldly"], salience: 3, topic: "trust", continuity: ["body", "injury"], build: "body", body: "伤者已经无法再走，山路却还有很长一段。背起一个人意味着把自己的退路也交给脚下：不背，他留在这里；背了，你走多慢都得背到底。" },
  { id: "content01.build.alchemy.herb-sort", prepBuild: true, settlements: { "engage": "你一株一株看过去，把三味分清。叶片相似，气味却各走一边，认到最后手心全是汗。这一炉能不能成还难说，但你的眼力长了一分。", "consider": "你没有贪多，先把已认出的两味记牢，反复嗅过才放回去。第三株你没有碰。记得不深，却不会再认错。", "leave": "你不再细辨，只取了认得出的那一株便走。剩下两株留在原地晾着，你也没弄清它们相不相冲。晒药的人来收摊时，天已擦黑。" },  choiceLabels: { engage: "一株一株看过去，把三味分清", consider: "先把已认出的两味记牢", leave: "不再细辨，只取认得出的那一株" },  title: "辨草", summary: "三种药草外形近似，药性却相反，耐心辨认比一炉昂贵丹火更要紧。", actions: ["cultivate", "pursuit"], salience: 2, topic: "medicine", continuity: ["alchemy"], build: "alchemy", body: "三种药草外形近似，药性却相反，认错一味整炉报废。耐心辨认比一炉昂贵的丹火更要紧。三株并排摆着，你要一株一株地看过去，不能靠猜。" },
  { id: "content01.build.alchemy.fever", choiceLabels: { engage: "先顾最重的那一间，把药分下去", consider: "先算清药与人的数目", leave: "不接手这一夜，交给村里的人" },  title: "退热", summary: "村中热症蔓延，没有珍稀灵药，只有有限草药与一夜不能出错的照看。", actions: ["worldly"], salience: 3, topic: "medicine", continuity: ["human-world", "alchemy"], build: "alchemy", body: "村中热症蔓延，没有珍稀灵药，只有有限的草药和一夜不能出错的照看。药只能救一部分人，你要决定的是先顾哪一间，以及这一夜怎么轮班。" },
  { id: "content01.build.alchemy.failed-brew", choiceLabels: { engage: "亲手把这炉倒掉，认下这一次失败", consider: "先尝一口，弄清偏在哪一味", leave: "把炉封了，不去碰它" },  title: "废炉", summary: "药液颜色偏了一线，这炉已不能救人；承认失败，比把它勉强端出去更难。", actions: ["cultivate"], salience: 2, topic: "loss", continuity: ["alchemy", "discipline"], build: "alchemy", body: "药液的颜色偏了一线，这炉已经不能救人了。承认失败比把它勉强端出去更难：锅里的东西还温着，端出去就会有人喝。你要决定的是倒掉，还是自己承担。" },
  { id: "content01.build.fortune.fork", title: "偏僻岔路", summary: "熟路能按时抵达，偏路却留下新鲜蹄印；未知并不等同于好运，也不等同于坏事。", actions: ["travel", "pursuit"], salience: 2, topic: "opportunity", continuity: ["fortune", "exploration"], build: "fortune", body: "你沿熟路赶往山外，岔路旁却留下新鲜蹄印。熟路有行人，能按时抵达；偏路通向林深，看不清尽头。这里真正要决定的是行程与未知机会，而不是抽象的磨炼。", choiceSet: [{"id":"engage","label":"循着那串蹄印走进偏路","effects":[{"op":"ADD_BUILD_EVIDENCE","buildId":"build.fortune","amount":900,"reasonTag":"content01.fortune"},{"op":"ADD_CULTIVATION","amount":150}]},{"id":"climb-and-watch","label":"先登高看清偏路通向哪里","effects":[{"op":"ADD_CULTIVATION","amount":180},{"op":"OUTCOME_TIME_DELTA","years":1}]},{"id":"stay-known-road","label":"放弃偏路，按熟路按时抵达","effects":[{"op":"OUTCOME_TIME_DELTA","years":1}]}] },
  { id: "content01.build.fortune.hidden-stream", choiceLabels: { engage: "顺着水声把石缝挖开", consider: "先听清这声音是从多深来的", leave: "不挖了，把石缝照原样盖回" },  title: "石下清泉", summary: "你在无人在意的石缝听见水声，继续挖掘可能一无所获，也可能改写整段行程。", actions: ["pursuit"], salience: 3, topic: "secret", continuity: ["fortune", "exploration"], build: "fortune", body: "你在无人在意的石缝里听见了水声。继续挖可能一无所获，也可能改写整段行程；石缝很深，出不来就得等到天黑。溪声一直在响，听不出深浅。" },
  { id: "content01.build.fortune.empty-hand", choiceLabels: { engage: "再按旧记走一处，把这一趟走完", consider: "先记下这三处，弄清错在哪一步", leave: "收记回身，这一次就到这里" },  title: "空手而归", summary: "等待多日的机缘没有出现，真正留下的是你如何面对落空与下一次选择。", actions: ["cultivate", "pursuit"], salience: 2, topic: "loss", continuity: ["fortune", "discipline"], build: "fortune" , body: "等待多日的机缘没有出现。你按着旧记踏遍三处地方，回过神来时天已经黑了。真正留下的不是收获，而是你如何面对这次落空——以及还要不要再等一次。"}
];

const riskEvents: Spec[] = [
  { id: "content01.risk.pine-ambush", tierSettlements: { "take-risk": { "success": "你抢在枝叶合拢之前冲了过去。身后一合落了空，你一路跑出松林才停下。衣衫被划破了几处，人还完整。", "costlySuccess": "你硬冲出去，肩上挨了一下。走出松林时血已经浸透衣领，好在人还在，怀里也攥着从对方身上扯下的东西。", "failure": "你冲出几步就被截住。松针簌簌落了一地，你被按在树干上，等松开时，身边只剩下自己。" }, "read-signs": { "success": "你先分辨声音的远近。左边那处一直在原地，右边那处在缓慢挪动。你看清了该往哪边走，趁那个空当退了出去。" }, "turn-away": { "success": "你退出松林，松针这才落下来，落在空地上。你退得干脆，绕了一段远路，天黑了也没走出那片坡。" } }, riskOutcomes: { success: [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 2 }], costlySuccess: [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }], failure: [], readSigns: [{ op: "ADD_CULTIVATION", amount: 130 }, { op: "OUTCOME_TIME_DELTA", years: 1 }], turnAway: [{ op: "OUTCOME_TIME_DELTA", years: 1 }] },  choiceLabels: { "take-risk": "抢在合拢之前冲出去", "read-signs": "先分辨哪一边的声音更近", "turn-away": "退出松林，绕开这一段" },  title: "松林伏影", summary: "松针忽然停止落下，前路有人藏住呼吸，退路也在一点点合拢。", actions: ["travel"], salience: 4, topic: "danger", continuity: ["exploration"], risk: "threat.ambush", body: "松针忽然停止落下。前路有人藏住呼吸，退路也在一点点合拢。声音是从两个方向传来的，你分不清哪一个更近，也不敢赌。" },
  { id: "content01.risk.ruin-depth", tierSettlements: { "take-risk": { "success": "你循着回声一路下到底。石室尽头堆着几件旧器，落尘很厚，却还完整。你挑了两件揣进怀里，旁的没有动，回头在镇上换成了灵石。", "costlySuccess": "你往下走了两级，正撞上在动的那个东西。缠斗中你带伤退出，只抢回一件旧器，血一路滴在石阶上。得手了，代价却在自己身上。", "failure": "你循声往下追，脚下的声音不对，退已经来不及。你被撞在石壁上滑了下去，等缓过神，手里什么也没有。" }, "read-signs": { "success": "你在阶口站了很久，把回声一处一处数清。数到第四处，你听出那只是水滴，真正在动的只有两处。你没有下去，退回洞口时已过了小半日。" }, "turn-away": { "success": "你转身往上走。石阶很长，出来时天已经暗了。你没有再弄明白下面是什么，也没有把自己搭进去。" } }, riskOutcomes: { success: [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 2 }], costlySuccess: [{ op: "ADD_RESOURCE", key: "spiritStone", amount: 1 }], failure: [], readSigns: [{ op: "ADD_CULTIVATION", amount: 130 }, { op: "OUTCOME_TIME_DELTA", years: 1 }], turnAway: [{ op: "OUTCOME_TIME_DELTA", years: 1 }] },  choiceLabels: { "take-risk": "继续往下，看清那是什么", "read-signs": "先数清回声是从几处来的", "turn-away": "就此上行，不再往下探" },  title: "遗迹深处", summary: "石阶向下延伸，壁灯早已熄灭，回声却比你的脚步多出一次。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["secret", "danger"], risk: "threat.dangerous-exploration", body: "石阶向下延伸，壁灯早已熄灭，你的脚步声在石壁之间回荡，却比回来时多了一次。回声不会说谎：前面还有别的东西在动。" },
  { id: "content01.risk.poison-mist", choiceLabels: { "take-risk": "屏住呼吸穿过这片青雾", "read-signs": "先辨出雾最薄的那一段", "turn-away": "退回谷口，另找一条路" },  title: "青雾", summary: "谷底升起淡青雾气，草叶边缘已经发黑，绕路要多耗数日。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["medicine"], risk: "threat.poison", body: "谷底升起淡青雾气，沾到雾的草叶边缘已经发黑。风把雾往这边吹，绕路要多耗数日，而你带的水只够两天。湿冷顺着衣袖往里渗。" },
  { id: "content01.risk.curse-stone", choiceLabels: { "take-risk": "再把神识探进去，听它说完", "read-signs": "先分辨这话是谁在借声", "turn-away": "收回神识，不去应这一声" },  title: "无字碑", summary: "无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。", actions: ["pursuit"], salience: 4, topic: "secret", continuity: ["danger"], risk: "threat.curse", body: "无字石碑在神识触及的一刻传来低语，像有人借你的记忆说话。声音用的是你自己的嗓音，说的却是一句你从未听过的话。" },
  { id: "content01.risk.critical-crossing", choiceLabels: { "take-risk": "趁还有力气强渡过去", "read-signs": "先探清水势最缓的一处", "turn-away": "退回岸上，等水落下去" },  title: "负伤渡河", summary: "伤势未稳，河水又在上涨；此刻强渡，危险来自水势，也来自身体本身。", actions: ["travel"], salience: 4, topic: "injury", continuity: ["danger"], risk: "threat.critical-injury", body: "伤势未稳，河水又在上涨。此刻强渡，危险来自水势，也来自你自己的身体。两样都在往下压，而对岸已经能看见了。" },
  { id: "content01.risk.revenge-shadow", choiceLabels: { "take-risk": "迎上去，把当年那句话说完", "read-signs": "先认出他是当年哪一个", "turn-away": "不进他的问话，先走开" },  title: "旧怨追来", summary: "有人沿着旧日冲突留下的线索追来，来者不问解释，只确认你的名字。", actions: ["pursuit", "worldly"], salience: 4, topic: "rivalry", continuity: ["danger", "memory"], risk: "threat.cause-revenge", body: "有人沿着旧日冲突留下的线索追来。来者不问解释，只确认你的名字——他已经确认过了。你想起那次争执里，自己确实说过一句过头的话。" },
  { id: "content01.risk.falling-star", choiceLabels: { "take-risk": "朝落点走过去，看那是什么", "read-signs": "先看清落点离你还有多远", "turn-away": "背向落点，先离远些" },  title: "坠星", summary: "夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。", actions: ["travel", "pursuit"], salience: 5, topic: "danger", continuity: ["opportunity"], risk: "threat.special-catastrophe", body: "夜空裂开一道暗红弧光，落点近得能感到地面轻震，远处鸟群尽数惊起。碎片还挂在天上，坠势未止——你只有站定或走开这两个选择。" },
  { id: "content01.risk.beast-trail", choiceLabels: { "take-risk": "循着兽迹迎过去", "read-signs": "先看清它绕的是哪一圈", "turn-away": "收起营地，趁夜换一处" },  title: "兽迹", summary: "新鲜兽迹绕过营地三次，猎物与猎手的位置，可能在下一步互换。", actions: ["travel"], salience: 3, topic: "danger", continuity: ["survival"], risk: "threat.combat", body: "新鲜兽迹绕过营地三次，每次都绕回同一处。猎物与猎手的位置，可能在下一步互换。你手里的东西还够一次驱赶，也可能只够一次引开。" },
  { id: "content01.risk.flood-cave", choiceLabels: { "take-risk": "往深处走，赌那条路够高", "read-signs": "先看清光亮离水面多高", "turn-away": "顺原路退回洞口" },  title: "涨水洞", summary: "洞中水位正在上升，深处微光尚未消失，留给你判断的时间不多。", actions: ["pursuit"], salience: 4, topic: "exploration", continuity: ["danger", "opportunity"], risk: "threat.dangerous-exploration", body: "洞中水位正在上升，深处那点微光还没有消失。留给你的时间不多了：往回走要穿过刚涨起来的水，往前走要赌那条路够高。" },
  { id: "content01.risk.broken-seal", choiceLabels: { "take-risk": "听它把话说完", "read-signs": "先辨清这气息出自哪一类封", "turn-away": "合上裂口，转身离开" },  title: "残封", summary: "封印裂口只容一线气息外泄，那气息古老而清醒，像在等待回应。", actions: ["cultivate", "pursuit"], salience: 5, topic: "secret", continuity: ["danger", "cultivation"], risk: "threat.special-catastrophe" , body: "封印的裂口只容一线气息外泄。那气息古老而清醒，并不急着扑上来，只在等一个回应。你可以合上裂口转身，也可以听它把话说完。"}
];

const roadCauseEvents: Spec[] = [
  { id: "content01.road.help", choiceLabels: { decline: "不停脚，越过他继续赶路" },  title: "扶一程", summary: "同行的陌生修士在坡前力竭，他没有求救，只把行囊向身后挪了挪。", actions: ["travel", "worldly"], salience: 2, topic: "trust", continuity: ["travel"], participant: generated("wandering-cultivator"), origins: [{ templateId: "content01.cause.road-kindness", salience: 2, label: "扶他一程" }], cooldown: oncePerRun, body: "同行的陌生修士在坡前力竭。他没有开口求救，只把行囊向身后挪了挪，腾出一点位置。他不看你，等的是你自己决定要不要停下。" },
  { id: "content01.road.conflict", choiceLabels: { decline: "退到路边，让他先过去" },  title: "窄路相争", summary: "狭窄山道只容一人先过，对面的修士不肯退，你也看不出他是否另有所图。", actions: ["travel"], salience: 3, topic: "rivalry", continuity: ["travel", "trust"], participant: generated("dangerous-cultivator"), origins: [{ templateId: "content01.cause.road-conflict", salience: 3, label: "记下此争" }], cooldown: oncePerRun, body: "狭窄山道只容一人先过。对面的修士不肯退让，你也看不出他是否另有所图。他把脚跟抵在石缝上，像是已经打算在这里耗到底。" },
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
