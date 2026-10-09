/**
 * UI04C — dev-only live client page (天符 2.0 实机联调).
 *
 * WHAT THIS PAGE IS
 *
 * The first *live* client surface of the 2.0 flow. It is a development page: it is registered last in
 * `app.json`, it is not the default route, it is not a tabBar entry, and it does not replace or alter
 * the accepted 1.0 pages or the fixture-driven `v2-preview`. Its job is to prove — against a real
 * cloud RPC boundary — that the accepted client-safe runtime can drive the whole interaction chain.
 *
 * THIS PAGE COMPUTES NO GAMEPLAY
 *
 * Everything rendered here comes from the authoritative server projection:
 *
 *   - the page state, the run status, the available actions, the current interaction, the option list,
 *     the risk presentation, the breakthrough availability and the archive contents are all read out
 *     of `PublicViewModel` / the controller's page model;
 *   - the only local work is *presentation*: resolving a known server key to its Chinese label,
 *     formatting a number, and arranging already-public fields. There is no RNG, no outcome, no
 *     eligibility, no odds, no `RuleState`, no Director and no Cause resolution anywhere in this file;
 *   - the four core actions and the breakthrough action are emitted from the ids the server projected,
 *     and the destiny-offer selection is derived from the authoritative offer body. An action the
 *     server did not project is never invented, and a submission always goes through
 *     `CommandSubmissionController`, which owns commandId / pending / retry / conflict semantics.
 *
 * The runtime it loads is the generated, committed artifact under `miniprogram/runtime/`, reached by a
 * static literal `require` so the WeChat packager can build the dependency graph. Nothing outside
 * `miniprogramRoot` is imported. See docs/UI04C_LIVE_CLIENT.md.
 */
var runtime = require("../../runtime/index.js");

/** The one specifier this page loads. Kept as a constant only so a failure panel can name it; the
 *  require above stays a plain string literal, because the packager resolves requires statically. */
var RUNTIME_SPECIFIER = "../../runtime/index.js";
var REGENERATE_HINT = "重新生成：node tools/ui04b-wechat-runtime-artifact.mjs --write";
var DIAGNOSTIC_MAX_CHARS = 160;
/**
 * UI04D — the only local identity the page keeps.
 *
 * It is a *recovery key*, not a player identity: the page mints it once, persists it, and re-sends it on
 * every bootstrap so a reload or a retry after a timeout comes back to the same offered run instead of
 * manufacturing another life. Who the player actually is comes from the server (`getWXContext().OPENID`
 * -> authoritative opaque playerId); the page never stores, guesses or transmits a player id of its own.
 */
var BOOTSTRAP_ID_KEY = "tianfu2:bootstrap-id";
/** UI04E-R1 — the PENDING next-life bootstrap key.
 *
 *  Persisted *before* the explicit NEXT_LIFE "开启下一世" CTA calls `createRunOffer`, so:
 *    - retry/reload on the NEXT_LIFE page reuses the same pending id rather than minting a new one;
 *    - if `createRunOffer` succeeds but the response is lost, the next retry/reload reuses the same
 *      pending id and recovers the same new run through UI04D bootstrap idempotency;
 *    - the previous-life bootstrap id under `BOOTSTRAP_ID_KEY` is left untouched until the explicit
 *      start-next-life call succeeds, at which point the pending id is promoted to the current key
 *      and the pending key is cleared.
 *  Storage failures degrade silently — the page still works, it just cannot guarantee retry-recovery
 *  after a hard crash, exactly like the original bootstrap key. */
var NEXT_LIFE_BOOTSTRAP_KEY = "tianfu2:next-life-bootstrap-id";
var CLIENT_BUILD = "v2-live-dev";
var RPC_FUNCTION_NAME = "tianfu2";

// ---------------------------------------------------------------- bounded diagnostics

/** A path-redacted, length-capped, single-line summary. Never renders raw state or credentials. */
function sanitizeDiagnostic(value) {
  var text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  text = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/[A-Za-z]:\\[^\s"'`]+/g, "<path>");
  text = text.replace(/\/[^\s"'`]*\/[^\s"'`]*/g, "<path>");
  if (text.length > DIAGNOSTIC_MAX_CHARS) text = text.slice(0, DIAGNOSTIC_MAX_CHARS) + "…";
  return text;
}

function errorName(error) {
  if (error === null || error === undefined) return "UnknownError";
  if (typeof error.name === "string" && error.name.length > 0) return error.name;
  return typeof error;
}

function describeFailure(stage, error) {
  return {
    stage: stage,
    code: errorName(error),
    detail: sanitizeDiagnostic(error === null || error === undefined ? "" : error.message),
    specifier: RUNTIME_SPECIFIER,
    hint: REGENERATE_HINT
  };
}

/**
 * The generated runtime must actually publish the UI04E surface. A stale or partial artifact would
 * otherwise fail later as a confusing `undefined is not a function`; naming the stage and the
 * regenerate command here is the difference between a diagnosable defect and a blank page.
 */
function runtimeSurfaceProblem() {
  var missing = [];
  if (typeof runtime.WeChatRunController !== "function") missing.push("WeChatRunController");
  if (typeof runtime.createWeChatPlatformStorage !== "function") missing.push("createWeChatPlatformStorage");
  if (typeof runtime.createWeChatCloudTransport !== "function") missing.push("createWeChatCloudTransport");
  if (typeof runtime.bootstrapWeChatRun !== "function") missing.push("bootstrapWeChatRun");
  if (typeof runtime.TerminalUnavailableError !== "function") missing.push("TerminalUnavailableError");
  return missing.length === 0 ? null : missing;
}

// ---------------------------------------------------------------- presentation vocabulary

/** Structural enum ids the accepted contracts already define. A known id maps to its label; an
 *  unknown value falls back verbatim, so a future pack shows its raw id instead of a wrong label. */
var ACTION_LABELS = { cultivate: "闭关", travel: "游历", worldly: "入世", pursuit: "追索" };
var REALM_LABELS = {
  "mortal": "凡人",
  "qi-refining": "炼气",
  "foundation-establishment": "筑基",
  "golden-core": "金丹",
  "nascent-soul": "元婴",
  "spirit-transformation": "化神"
};
var RISK_TIER_LABELS = { "low": "低险", "caution": "宜慎", "dangerous": "危险", "lethal": "凶险" };
var RISK_TIER_CLASS = { "low": "risk-low", "caution": "risk-caution", "dangerous": "risk-dangerous", "lethal": "risk-lethal" };
/**
 * PLAYUX01 (B1) — the resource keys the receipt can name. The server sends the raw resource key
 * (`spiritStone`) beside a generic `result.resource` label, because one label cannot name which pool
 * moved. This table is the missing half, and it is deliberately small: it lists only pools the
 * engine's registered effects can actually change, so a new pool surfaces as its key rather than as a
 * plausible wrong name.
 */
var RESOURCE_LABELS = { "spiritStone": "灵石" };
var DESTINY_PROFILE_LABELS = { "stable": "稳", "high-variance": "变", "story-hook": "缘" };
var ENTRY_KIND_LABELS = { "event": "事件", "build": "道途" };
var PAGE_STATE_LABELS = {
  START: "起始",
  MODE_SELECT: "择途",
  DESTINY_OFFER: "择命",
  RUN_OPENING: "启程",
  RUN_HOME: "在世",
  EVENT: "事件",
  SPECIAL_NODE: "节点",
  LIFE_ARCHIVE: "生平录",
  ENDING: "终局",
  LIFE_BOOK: "人生书",
  REBIRTH_RESULT: "转生结果",
  NEXT_LIFE: "来世"
};
var CN_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** Page-specific and dev copy. Content01 wording is NOT listed here — it is generated, see below.
 *
 * LIVEFIX06: this table used to be the page's only catalog, covering 18 keys. The 340 committed Content01
 * keys were absent and `presentLabel` returns the key verbatim on a miss, so the real EVENT the Controller
 * observed in WeChat DevTools (content01.ordinary.night-rain, stateVersion 4) rendered its title, body and
 * all three choices as raw `content01.*` keys. The server projection was correct throughout; only the
 * client's catalog was incomplete. */
var PAGE_CONTENT_COPY = {
  "destiny.offer.title": "天命所归",
  "innate.offer.selection": "择定此命",
  "dev.first-choice.title": "初入此世",
  "dev.first-choice.body": "前路初开，去从皆在你一念之间。",
  "dev.first-choice.continue": "就此前行",
  "dev.first-choice.test-fortune": "试问气运",
  "dev.first-choice.rescue-stranger": "出手相救",
  "dev.first-choice.face-combat-risk": "正面迎战",
  "dev.first-choice.study-sword": "参研剑术",
  "dev.ordinary-fallback.title": "寻常际遇",
  "dev.ordinary-fallback.body": "寻常一日，别无他事，只看你如何安排。",
  "dev.ordinary-fallback.continue": "继续前行",
  "dev.rescue-echo-a.title": "昔日相救",
  "build.fact.BUILD_STAGE_TRANSITION.title": "道途转进",
  "build.fact.BUILD_STAGE_TRANSITION.summary": "你的修行路数由此转入新阶。",
  "cause.rescued-stranger.title": "救助路人",
  "cause.rescued-stranger.summary": "你曾救下一名路人，因果自此相连。",
  "cause.hinted.summary": "似有一段因果尚未明朗。",
  "special.attemptBreakthrough": "冲击境界",
  // PLAYUX01: build stage labels. The server projects `stage.labelKey` for every one of the four stages
  // of all four tracks, and the client renders it through CONTENT_COPY at buildRow(). Every key here was
  // previously absent, so the sheet showed a raw build.sword.latent key instead of a stage name.
  // The wording names what that stage actually is on that track rather than restating the stage id.
  "build.sword.latent": "剑意未明",
  "build.sword.emerging": "剑意初成",
  "build.sword.formed": "剑道已成",
  "build.sword.refined": "剑道入微",
  "build.body.latent": "筋骨未开",
  "build.body.emerging": "筋骨渐强",
  "build.body.formed": "体魄成形",
  "build.body.refined": "体魄圆融",
  "build.alchemy.latent": "丹火未稳",
  "build.alchemy.emerging": "丹火初驯",
  "build.alchemy.formed": "丹道有成",
  "build.alchemy.refined": "丹道通明",
  "build.fortune.latent": "机缘未动",
  "build.fortune.emerging": "机缘初显",
  "build.fortune.formed": "气运成形",
  "build.fortune.refined": "气运在握",
  // PLAYUX01: the result surface reads these through CONTENT_COPY. They name a confirmed change, not a
  // prediction: the server only emits the line it actually settled. result.no_gain is the honest wording
  // for a choice that cost time and gained nothing measurable, which is a real settlement outcome.
  "result.cultivation": "修为",
  "result.resource": "灵石",
  "result.build_evidence": "道途证据",
  "result.time": "岁月",
  "result.item": "随身之物",
  "result.npc_noted": "与此人有些干系",
  "result.cause_resolved": "这段因果已了结",
  "result.cause_expired": "这段因果就此搁置",
  "result.cause_planted": "一段因果自此结下",
  "result.no_gain": "此行没有明显收获",
  // PLAYUX01 (F1): the result surface names the Event and the option that was taken, and says plainly when
  // a settlement produced nothing beyond time. result.view_ending is the CTA shown when the settled choice
  // ended the run, so the button does not promise a return to 在世 that is not going to happen.
  "result.you_chose": "你选择了：",
  "result.no_extra_gain": "未获得可确认的额外收获",
  "result.view_ending": "查看终局",
  "result.back_home": "返回在世",
  "result.heading": "本次结果"
};

/**
 * PLAYUX01 — how a run ended, in the player's language.
 *
 * The server publishes two different enums for the same moment: `endingId` ("lifespan", or
 * "death:<deathCauseId>" per risk.ts:194) and the death record's `immediateSource`
 * ("lifespan-hard-ceiling"). Both were rendered verbatim, so the life book's 死因 row read
 * "lifespan-hard-ceiling". Every value the engine can currently emit is listed here, taken from
 * reducer.ts:275-276 and risk-v1.ts:48-56 rather than guessed.
 *
 * PLAYUX01 (B4): a value absent from this table is no longer printed verbatim. `presentTerminalLabel`
 * substitutes the conservative 「原因尚未明确」 for a death cause and 「详情暂不可用」 for any other
 * terminal row, which is what the locked spec requires of a player-facing surface. The table itself is
 * still the completeness record, so a new engine enum is a missing entry that a test catches rather
 * than a raw id that a player reads.
 */
var TERMINAL_LABELS = {
  "lifespan": "寿元已尽",
  "lifespan-hard-ceiling": "寿元已尽",
  "death.death.lifespan": "寿元已尽",
  "death.death.combat": "殁于斗法",
  "death.death.injury": "伤重不治",
  "death.death.exploration": "殁于探索",
  "death.death.poison": "中毒殒身",
  "death.death.curse": "为诅咒所害",
  "death.death.cause": "为往因所累",
  "death.death.special": "死于非常",
  "threat.critical-injury": "伤势过重"
};

/**
 * The generated Content01 catalog, as `[key, copy]` pairs.
 *
 * HARD CONSTRAINT — the argument below must be a plain string literal, never a variable. The WeChat
 * packager builds the dependency graph by static analysis, so a variable argument packs nothing and the
 * page dies at runtime with "module is not defined". tools/content01-zh-cn-module.mjs exports the expected
 * specifier and tests/livefix06.test.mjs asserts the literal below stays equal to it, so the two cannot
 * drift apart. Note that the route-guard and package-closure audits scan comments as code, so this
 * paragraph must not spell out the failing form verbatim.
 */
var CONTENT01_ZH_CN = require("./content01-zh-cn.js");

/**
 * The merged catalog every presentation surface reads through `presentLabel(CONTENT_COPY, key)`.
 *
 * Merge order is deliberate and load-bearing:
 *
 *   - generated Content01 copy first, so the complete committed source catalog is always present;
 *   - page-specific copy second, so anything this page displays today keeps its exact existing wording.
 *
 * Merging by exact key means no entry is invented (nothing maps a key the source does not define) and no
 * option id, RPC argument or server projection is touched. The result is a fresh object, so the generated
 * module's own array is never mutated.
 */
var CONTENT_COPY = (function mergeContentCopy(generated, pageCopy) {
  var merged = {};
  var index;
  var pair;
  for (index = 0; index < generated.length; index += 1) {
    pair = generated[index];
    if (Object.prototype.hasOwnProperty.call(pair, 0) && Object.prototype.hasOwnProperty.call(pair, 1)) {
      merged[pair[0]] = pair[1];
    }
  }
  for (var key in pageCopy) {
    if (Object.prototype.hasOwnProperty.call(pageCopy, key)) merged[key] = pageCopy[key];
  }
  return merged;
})(CONTENT01_ZH_CN, PAGE_CONTENT_COPY);

function presentLabel(table, value) {
  if (typeof value !== "string" || value.length === 0) return "";
  var label = table[value];
  return typeof label === "string" && label.length > 0 ? label : value;
}

/**
 * PLAYUX01 (B4) — resolves a *terminal* enum to a player-facing string, with a conservative fallback.
 *
 * WHY THIS IS A SECOND FUNCTION AND NOT A CHANGE TO `presentLabel`
 * `presentLabel` deliberately falls through to the raw key, and `LIVEFIX06_surfaces` pins that: an
 * unknown key must stay visible so a missing catalog entry is catchable in development rather than
 * silently swallowed. That is correct for content copy and it stays exactly as it was.
 *
 * The terminal surface is different, and the locked spec says so explicitly (§7): an unknown key is
 * caught in tests and logs, and *presented to the player* conservatively instead of as internal
 * encoding. The screenshots behind this task are a player reading `lifespan-hard-ceiling`. So the
 * conservative behaviour is scoped to the one surface the spec names, and development keeps its signal
 * because the underlying table is still miss-detectable — `tests/playux01.test.mjs` asserts every
 * reachable engine enum resolves, so a new enum fails a test rather than reaching a screen.
 *
 * The fallback is a neutral phrase, never a known cause: mapping an unrecognised id onto
 * 「寿元已尽」 would state a death reason the engine did not publish, which is worse than admitting
 * the reason is unclear.
 */
function presentTerminalLabel(table, value, missLabel) {
  if (typeof value !== "string" || value.length === 0) return "";
  var label = table[value];
  if (typeof label === "string" && label.length > 0) return label;
  return typeof missLabel === "string" && missLabel.length > 0 ? missLabel : "详情暂不可用";
}

/** The conservative wording for a terminal row whose server enum has no entry in `TERMINAL_LABELS`. */
var TERMINAL_UNKNOWN_DEATH = "原因尚未明确";
var TERMINAL_UNKNOWN_DETAIL = "详情暂不可用";

// ---------------------------------------------------------------- read guards

function str(value) { return typeof value === "string" ? value : ""; }
function num(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function arr(value) { return Array.isArray(value) ? value : []; }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function realmOrderLabel(order) {
  if (typeof order !== "number" || !isFinite(order) || order < 1) return "未入修行";
  var numeral = CN_NUMERALS[order] !== undefined ? CN_NUMERALS[order] : String(order);
  return "第" + numeral + "境";
}

// ---------------------------------------------------------------- render model

/** The authoritative destiny offer, projected to presentation candidates. Never fabricates an option:
 *  a candidate the server did not offer is skipped, and a candidate the server did not publish is
 *  simply not selectable (the controller refuses the submission as well). */
function buildOfferCandidates(interaction) {
  if (interaction === null || interaction.kind !== "destinyOffer") return [];
  var body = record(interaction.body);
  var candidates = arr(body.candidates);
  var offered = {};
  for (var index = 0; index < interaction.options.length; index += 1) offered[interaction.options[index].optionId] = true;
  var out = [];
  for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    var candidate = record(candidates[candidateIndex]);
    if (typeof candidate.selectionId === "string") {
      if (offered[candidate.selectionId] !== true) continue;
      out.push({
        optionId: candidate.selectionId,
        origin: "innate",
        title: presentLabel(CONTENT_COPY, "innate.offer.selection"),
        rows: [
          { label: "灵根", value: str(candidate.spiritualRoot) },
          { label: "天赋", value: str(candidate.talent) },
          { label: "天命", value: str(candidate.majorDestiny) }
        ]
      });
      continue;
    }
    if (typeof candidate.id === "string") {
      if (offered[candidate.id] !== true) continue;
      out.push({
        optionId: candidate.id,
        origin: "legacy",
        title: presentLabel(CONTENT_COPY, str(candidate.titleKey)),
        rows: [
          { label: "命格", value: presentLabel(DESTINY_PROFILE_LABELS, str(candidate.profile)) },
          { label: "所利", value: presentLabel(CONTENT_COPY, str(record(candidate.advantage).labelKey)) },
          { label: "所费", value: presentLabel(CONTENT_COPY, str(record(candidate.cost).labelKey)) },
          { label: "缘起", value: presentLabel(CONTENT_COPY, str(record(candidate.hook).labelKey)) }
        ]
      });
    }
  }
  return out;
}

/** Server-projected options of the current EVENT / SPECIAL_NODE interaction. */
function buildInteractionOptions(interaction) {
  if (interaction === null) return [];
  return interaction.options.map(function (option) {
    var risk = record(option.riskPresentation);
    var hasRisk = typeof option.riskPresentation === "object" && option.riskPresentation !== null;
    return {
      optionId: option.optionId,
      label: presentLabel(CONTENT_COPY, option.labelKey),
      riskLabel: hasRisk ? presentLabel(RISK_TIER_LABELS, str(risk.tier)) : "",
      riskClass: hasRisk ? RISK_TIER_CLASS[str(risk.tier)] || "" : "",
      fatal: hasRisk && risk.canBeFatal === true
    };
  });
}

function buildArchive(archive) {
  if (archive === null) return null;
  return {
    runName: str(archive.runName),
    history: arr(archive.history).map(function (entry) {
      var data = record(entry.data);
      var eventId = str(data.eventId);
      var choiceId = str(data.choiceId);
      // PLAYUX01 (B2): the live archive used to show only a title and a summary, so a player reading
      // their own journal could not see what they had chosen. `history.data.choiceId` has been projected
      // since stage C, so the taken option is named when the save recorded one. An older save has no
      // choiceId and the row says the choice was not recorded instead of inventing one.
      return {
        entryId: str(entry.entryId),
        kindLabel: presentLabel(ENTRY_KIND_LABELS, str(entry.kind)),
        title: presentLabel(CONTENT_COPY, str(entry.titleKey)),
        summary: presentLabel(CONTENT_COPY, str(entry.summaryKey)),
        hasChoice: choiceId.length > 0,
        choiceLabel: choiceId.length > 0 && eventId.length > 0 ? (resolveCopy(eventId + ".choice." + choiceId) || TERMINAL_UNKNOWN_DETAIL) : ""
      };
    }),
    causes: arr(archive.causes).map(function (cause) {
      return {
        publicId: str(cause.publicId),
        level: cause.level === "explicit" ? "明确" : "隐约",
        title: presentLabel(CONTENT_COPY, str(cause.titleKey)),
        summary: presentLabel(CONTENT_COPY, str(cause.summaryKey))
      };
    }),
    builds: arr(archive.builds).map(function (build) {
      return { buildId: str(build.buildId), label: presentLabel(CONTENT_COPY, str(build.labelKey)), dominant: build.dominant === true };
    }),
    people: arr(archive.people).map(function (person) {
      return { npcId: str(person.npcId), displayName: str(person.displayName), knownStatus: str(person.knownStatus) };
    })
  };
}

/**
 * PLAYUX01 (B1) — projects the authoritative settled receipt into the "本次结果" panel.
 *
 * WHERE THE DATA COMES FROM, AND WHY NOTHING ELSE WILL DO
 * The spec ranks the sources: the settled receipt first, then a diff of the public view across the
 * submission, then a minimal additive projection. This function only implements the first rank, and it
 * is enough: `server/src/command-gateway.ts` builds `domainEffects` out of `output.effects`, which is
 * exactly the list `applyEventEffects` pushed into `publicEffects` while settling. So every number here
 * is the settlement's own account of itself, not a client guess about what an option ought to give.
 *
 * WHAT A ZERO-LINE RECEIPT MEANS
 * It is a true statement, not a missing one. An option can cost real time and gain nothing measurable —
 * `OUTCOME_TIME_DELTA` is a registered op, so the line list is legitimately empty and `changed` is
 * false. The panel then says 「此行没有明显收获」 rather than inventing a reward. That is the same
 * honesty the spec requires when nothing moved.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 * No roll, no tier odds, no hidden cause id, no NPC affinity number. `narrative.appliedTier` is carried
 * only so a caller could compare runs; it is not rendered. The receipt cannot leak what the server did
 * not put in it, and the transport boundary refuses a response that does.
 */
function buildResultReceipt(receipt) {
  if (receipt === null || receipt === undefined) return null;
  var effects = arr(receipt.domainEffects);
  var narrative = record(receipt.narrative);
  var lines = [];
  var index;
  for (index = 0; index < effects.length; index += 1) {
    var effect = record(effects[index]);
    var kind = str(effect.kind);
    var label = str(effect.labelKey).length > 0 ? presentLabel(CONTENT_COPY, str(effect.labelKey)) : "";
    var text = "";
    if (kind === "cultivation" && typeof effect.delta === "number") text = label + " +" + effect.delta;
    else if (kind === "resource" && typeof effect.delta === "number") {
      var pool = RESOURCE_LABELS[str(effect.resource)];
      text = (typeof pool === "string" && pool.length > 0 ? pool : label) + " +" + effect.delta;
    } else if (kind === "build" && typeof effect.delta === "number") text = label + " +" + effect.delta;
    else if (kind === "time" && typeof effect.years === "number") text = label + " +" + effect.years + " 年";
    else text = label;
    if (text.length === 0) continue;
    lines.push({ key: kind + ":" + index, text: text });
  }
  // `changed` is the server's own verdict, but a line the client could render is also proof something
  // moved. Either is enough; claiming no gain while holding a rendered line would contradict itself.
  var changed = narrative.changed === true || lines.length > 0;

  // PLAYUX01 (F1) — NAME WHAT HAPPENED, NOT JUST HOW MUCH MOVED.
  //
  // The panel used to show only 修为 +N / 灵石 +N / 岁月 +N 年, which left the player able to say "a number
  // changed but I cannot tell what I chose or what scene it was". Both facts were already in the
  // confirmed receipt and were simply never rendered: `narrative.eventId` is the Event that settled, and
  // `narrative.choiceId` is the option that was taken. Both are resolved through the same exact-key
  // catalog every other surface uses — the client guesses nothing about hidden outcomes, and an option
  // whose copy is missing reads as 详情暂不可用 rather than as an internal code.
  var eventId = str(narrative.eventId);
  var choiceId = str(narrative.choiceId);
  var eventTitle = eventId.length > 0 ? resolveCopy(eventId + ".title") : "";
  var choiceLabel = eventId.length > 0 && choiceId.length > 0 ? resolveCopy(eventId + ".choice." + choiceId) : "";
  var noteText = eventId.length > 0 ? resolveCopy(eventId + ".resolution") : "";

  // A gain the player can point at is anything except time passing. Time alone is a real settlement but it
  // is not a gain, and saying so is the honest thing — it is exactly what the spec asks for when a choice
  // changes nothing measurable.
  var hasGain = false;
  for (index = 0; index < lines.length; index += 1) if (lines[index].key.indexOf("time:") !== 0) hasGain = true;

  // A scene-authored note is the most specific thing available, but it may only appear when it cannot
  // contradict the receipt: a note that says nothing was found must never sit beside a settled gain.
  var resolutionNote = !hasGain && noteText.length > 0 ? noteText : (!hasGain && lines.length > 0 ? presentLabel(CONTENT_COPY, "result.no_extra_gain") : "");

  return {
    heading: presentLabel(CONTENT_COPY, "result.heading"),
    changed: changed,
    eventTitle: eventTitle.length > 0 ? eventTitle : (eventId.length > 0 ? TERMINAL_UNKNOWN_DETAIL : ""),
    hasChoice: choiceId.length > 0,
    choiceLabel: choiceLabel.length > 0 ? choiceLabel : (choiceId.length > 0 ? TERMINAL_UNKNOWN_DETAIL : ""),
    lines: lines,
    resolutionNote: resolutionNote,
    noGainText: changed ? "" : presentLabel(CONTENT_COPY, "result.no_gain")
  };
}

/**
 * Projects the controller's page model + authoritative view into what the page renders.
 *
 * Pure presentation: every field is either a server-projected value or a label for one. The banner is
 * the client's *own* transport state (submitting / retryable / fatal / conflict), which the page is
 * allowed to report, and which is read from `controller.submission()` rather than invented.
 *
 * PLAYUX01 (B1): `receipt` is the settled CommandResult of the most recent confirmed submission, or
 * null. It is threaded in rather than stored in a module global so the render model stays a pure
 * function of its inputs and a test can drive it without a page instance.
 */
function buildRenderModel(controller, notice, receipt) {
  var model = controller.pageModel();
  var view = controller.view();
  var run = record(view === undefined ? null : view.state.publicRun);
  var interaction = model.interaction === undefined ? null : model.interaction;
  var realm = record(run.realm);
  var terminal = record(view === undefined ? null : view.state.terminal);
  var submission = controller.submission();
  var pageState = model.pageState;

  var banner = null;
  if (submission.requiresReconfirmation) banner = { kind: "conflict", text: "服务器状态已更新（第 " + model.stateVersion + " 版），请重新确认这次操作。" };
  else if (submission.interactionState === "retryableError") banner = { kind: "retry", text: "连接中断，命令尚未结算，可重试同一命令。" };
  else if (submission.interactionState === "fatalError") banner = { kind: "fatal", text: "服务器拒绝了这条命令，本地不会自行修正规则状态。" };
  else if (typeof notice === "string" && notice.length > 0) banner = { kind: "notice", text: notice };

  // PLAYUX01 (B1): the result panel is only ever built from a receipt this page actually received from
  // a confirmed settlement. A refused, conflicted or retried submission leaves it null and the panel
  // does not render, so there is no path by which a second, invented receipt can appear.
  var result = buildResultReceipt(receipt);
  if (result !== null) {
    // PLAYUX01 (F1): the dismissal CTA must describe where the player actually is. If the settled choice
    // ended the run the authoritative page is ENDING, and offering 返回在世 would send them to a false
    // promise of a home screen that no longer exists.
    result.youChosePrefix = presentLabel(CONTENT_COPY, "result.you_chose");
    result.ctaLabel = presentLabel(CONTENT_COPY, pageState === "ENDING" ? "result.view_ending" : "result.back_home");
  }

  return {
    pageState: pageState,
    pageStateLabel: presentLabel(PAGE_STATE_LABELS, pageState),
    runStatus: model.runStatus,
    stateVersion: model.stateVersion,
    locked: model.shell.interactionLocked === true,
    hasResult: result !== null,
    result: result,
    archiveOpen: model.archiveOpen === true,
    archive: model.archiveOpen === true ? buildArchive(model.archive) : null,
    banner: banner,
    runName: str(run.runName),
    age: num(run.age, 0),
    maxAge: num(run.maxAge, 0),
    realmLabel: presentLabel(REALM_LABELS, str(realm.id)),
    realmOrder: realmOrderLabel(num(realm.order, 0)),
    cultivation: num(realm.cultivationBps, num(realm.cultivation, 0)),
    spiritStone: num(record(run.resources).spiritStone, 0),
    isOffer: pageState === "DESTINY_OFFER",
    offerTitle: interaction === null ? "" : presentLabel(CONTENT_COPY, interaction.titleKey),
    offerCandidates: buildOfferCandidates(interaction),
    isHome: pageState === "RUN_HOME",
    coreActions: model.coreIntents.map(function (intent) {
      return { intentId: intent.intentId, label: presentLabel(ACTION_LABELS, intent.intentId.indexOf("core.") === 0 ? intent.intentId.slice(5) : "") , enabled: intent.enabled === true };
    }),
    specialActions: model.specialIntents.map(function (intent) {
      return { intentId: intent.intentId, label: presentLabel(CONTENT_COPY, intent.labelKey), enabled: intent.enabled === true };
    }),
    isDecision: pageState === "EVENT" || pageState === "SPECIAL_NODE",
    decisionTitle: interaction === null ? "" : presentLabel(CONTENT_COPY, interaction.titleKey),
    decisionBody: interaction === null ? "" : presentLabel(CONTENT_COPY, str(record(interaction.body).bodyKey)),
    decisionEventId: interaction === null ? "" : str(interaction.eventId),
    options: buildInteractionOptions(interaction),
    isTerminal: pageState === "ENDING" || pageState === "LIFE_BOOK" || pageState === "REBIRTH_RESULT" || pageState === "NEXT_LIFE",
    terminal: buildTerminal(terminal, pageState),
    terminalCta: buildTerminalCta(terminal, pageState)
  };
}

/**
 * PLAYUX01 (B2) — resolves a Content01 copy key, returning "" on a miss.
 *
 * `presentLabel` deliberately returns the key when it misses, which is the right signal for a
 * diagnostic surface but not for a player-facing retrospective: a life-book row must not read
 * `content01.ordinary.mountain-view.body`. Here a miss is an absence, and the caller decides whether an
 * absence means "omit this row" or "say it is unavailable".
 */
function resolveCopy(key) {
  if (typeof key !== "string" || key.length === 0) return "";
  var label = CONTENT_COPY[key];
  return typeof label === "string" && label.length > 0 ? label : "";
}

/**
 * PLAYUX01 (B2) — the four Build stages in the player's language.
 *
 * The stage comes from the authoritative Build pack (`build-v1.ts` thresholds: latent 0–1999,
 * emerging 2000–4499, formed 4500–7499, refined 7500–10000) and is already resolved server-side onto
 * `lifeBook.builds[].stage`. The client only names it. This is deliberately separate from the per-track
 * `labelKey` wording ("剑意未明" etc.): that phrase is the track's flavour, whereas this is the
 * cross-track progress word the spec asks for, so 潜藏 can never be read as 已成形.
 */
var BUILD_STAGE_LABELS = { "latent": "潜藏", "emerging": "萌芽", "formed": "成形", "refined": "圆熟" };

/** A person's public acquaintance state, in Chinese. Unknown values are named, not printed raw. */
var NPC_STATUS_LABELS = { "unknown": "尚未详知", "alive": "在世", "departed": "已离去", "missing": "下落不明", "dead": "已故" };

/**
 * PLAYUX01 (B2, revised by F2) — builds the chronological record of what actually happened.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * The first pass called this list 关键转折 and the Controller rejected the label, correctly: every recorded
 * Event was in it, so calling each one a turning point asserted a judgement the data does not contain. It is
 * a factual record, and the section now says so.
 *
 * WHY THERE IS NO per-Event "turning point" RANKING
 * `lifeBook.events` carries exactly `entryId`, `eventId`, `nodeIndex`, an optional `resultTier` and an
 * optional `choiceId` (viewmodel.ts buildPublicTerminal), and the public causes carry no origin node to join
 * on. There is therefore no published significance signal per Event, and F2 forbids inventing one — "reuse
 * only persisted, published facts". So this list stays chronological and complete, and the life book
 * presents the public causes, tracks and people as the transitions instead, which is the fallback F2 names.
 *
 * Every row comes from `lifeBook.events`. It can do exactly two things and no more: name the Event from the
 * real pack, and state which option was taken **when the save recorded one**. An older save has no
 * `choiceId`, and the row says the choice was not recorded rather than reconstructing it — the spec's
 * "旧档若无选择字段，显示'此前选择未记录'，不可倒推".
 */
function buildTimeline(lifeBook) {
  var events = arr(lifeBook.events);
  var timeline = [];
  for (var index = 0; index < events.length; index += 1) {
    var entry = record(events[index]);
    var eventId = str(entry.eventId);
    if (eventId.length === 0) continue;
    var choiceId = str(entry.choiceId);
    var title = resolveCopy(eventId + ".title");
    var body = resolveCopy(eventId + ".body");
    timeline.push({
      key: str(entry.entryId).length > 0 ? str(entry.entryId) : "timeline:" + index,
      order: num(entry.nodeIndex, index),
      title: title.length > 0 ? title : TERMINAL_UNKNOWN_DETAIL,
      body: body,
      // `hasChoice` is about the *save*, `choiceLabel` is about the *catalog*. They are reported apart
      // so a merely untranslated option reads as unavailable rather than as a choice never made.
      hasChoice: choiceId.length > 0,
      choiceLabel: choiceId.length > 0 ? (resolveCopy(eventId + ".choice." + choiceId) || TERMINAL_UNKNOWN_DETAIL) : ""
    });
  }
  return timeline;
}

/** PLAYUX01 (B2) — public people, with a named status and no invented acquaintanceship. */
function buildPeopleRows(lifeBook) {
  return arr(lifeBook.people).map(function (person) {
    var entry = record(person);
    return {
      npcId: str(entry.npcId),
      displayName: str(entry.displayName),
      statusLabel: presentTerminalLabel(NPC_STATUS_LABELS, str(entry.knownStatus), TERMINAL_UNKNOWN_DETAIL)
    };
  });
}

/** PLAYUX01 (B2) — public tracks with their true stage. Uses the server's own `displayName` for the
 *  track name rather than deriving Chinese from the internal id, which the spec forbids. */
function buildTrackRows(lifeBook) {
  return arr(lifeBook.builds).map(function (build) {
    var entry = record(build);
    var displayName = str(entry.displayName);
    return {
      buildId: str(entry.buildId),
      name: displayName.length > 0 ? displayName : TERMINAL_UNKNOWN_DETAIL,
      stageLabel: presentTerminalLabel(BUILD_STAGE_LABELS, str(entry.stage), TERMINAL_UNKNOWN_DETAIL),
      dominant: entry.dominant === true
    };
  });
}

/** PLAYUX01 (B2) — public causes. `level` distinguishes a named cause from a hinted one, which is what
 *  keeps a hinted cause from reading as a settled fact. */
function buildCauseRows(lifeBook) {
  var causes = arr(lifeBook.causes);
  var rows = [];
  for (var index = 0; index < causes.length; index += 1) {
    var entry = record(causes[index]);
    var level = str(entry.level);
    var summary = resolveCopy(str(entry.summaryKey));
    rows.push({
      key: str(entry.publicId).length > 0 ? str(entry.publicId) : "cause:" + index,
      levelLabel: level === "explicit" ? "明确" : "隐约",
      text: summary.length > 0 ? summary : TERMINAL_UNKNOWN_DETAIL
    });
  }
  return rows;
}

/** UI04E — projects the server-published terminal slice to a render model. Never invents a field:
 *  a value the server did not publish is omitted, so a missing sidecar renders as an empty block.
 *
 *  PLAYUX01 (B2): ENDING, LIFE_BOOK and REBIRTH_RESULT now read one `counts` object computed from the
 *  same `lifeBook` arrays, so the same run cannot report 11 experiences on one screen and 0 on another.
 *  The 11/4/2-vs-0/0/0 screenshots were exactly that: ENDING rendered nothing at all before the sidecar
 *  existed, while LIFE_BOOK rendered real numbers, and nothing said which was true.
 */
function buildTerminal(terminal, pageState) {
  if (terminal === null) return null;
  var lifeBook = record(terminal.lifeBook);
  var rebirth = record(terminal.rebirthResult);
  var nextLife = record(terminal.nextLife);
  // PLAYUX01: the terminal slice is staged. buildPublicTerminal() returns undefined until the sidecar
  // exists, so an ENDING can legitimately carry no lifeBook at all. Reporting 0/0/0 in that case reads
  // as "this life achieved nothing", which is a fabricated verdict about a run that simply has not been
  // summarised yet. hasLifeBook is therefore false and the counts stay hidden rather than showing zeroes;
  // the same guard covers the ending and death rows, whose raw keys would otherwise be printed verbatim.
  var hasLifeBook = Object.keys(lifeBook).length > 0;
  var lifeEvents = arr(lifeBook.events);
  var lifePeople = arr(lifeBook.people);
  var lifeBuilds = arr(lifeBook.builds);
  var lifeCauses = arr(lifeBook.causes);
  // ONE counting basis, three screens. `paths` counts every track the run touched (including 潜藏);
  // `formed` counts only tracks the server marked dominant. The two are different numbers and are
  // labelled differently on screen, which is what the spec requires instead of silently reusing a word.
  var counts = {
    experiences: lifeEvents.length,
    people: lifePeople.length,
    paths: lifeBuilds.length,
    formed: lifeBuilds.filter(function (build) { return record(build).dominant === true; }).length,
    causes: lifeCauses.length
  };
  var hasEnding = typeof lifeBook.ending === "object" && lifeBook.ending !== null;
  var hasDeath = typeof lifeBook.death === "object" && lifeBook.death !== null;
  var realmLabel = presentLabel(REALM_LABELS, str(record(lifeBook.realm).id));
  var deathCause = presentTerminalLabel(TERMINAL_LABELS, str(record(lifeBook.death).directCause), TERMINAL_UNKNOWN_DEATH);
  var trackRows = buildTrackRows(lifeBook);
  var causeRows = buildCauseRows(lifeBook);
  // PLAYUX01 (F2) — the compact introduction the Controller asked for: HOW this life reached its end.
  //
  // Every clause is a published fact — the ending age, the realm the run finished in, the shared counts and
  // the known direct cause. There is no achievement the run did not record and no retrospective emotion:
  // the sentence is a reading of the life book's own fields, nothing more. The death clause is dropped when
  // the sidecar holds no death record, so the sentence never asserts a cause it does not have.
  var intro = "";
  if (hasLifeBook) {
    intro = "此生行至 " + num(lifeBook.age, 0) + " 岁，止于" + realmLabel + "；历 " + counts.experiences + " 事，识 " + counts.people + " 人，行走 " + counts.paths + " 条道途（成形 " + counts.formed + " 条），公开因果 " + counts.causes + " 段" + (hasDeath ? "，终因" + deathCause : "") + "。";
  }
  return {
    stage: str(terminal.stage),
    version: num(terminal.version, 0),
    isEnding: pageState === "ENDING",
    isLifeBook: pageState === "LIFE_BOOK",
    isRebirthResult: pageState === "REBIRTH_RESULT",
    isNextLife: pageState === "NEXT_LIFE",
    lifeBook: {
      hasLifeBook: hasLifeBook,
      runName: str(lifeBook.runName),
      age: num(lifeBook.age, 0),
      maxAge: num(lifeBook.maxAge, 0),
      realm: realmLabel,
      counts: counts,
      intro: intro,
      timeline: buildTimeline(lifeBook),
      peopleRows: buildPeopleRows(lifeBook),
      trackRows: trackRows,
      causeRows: causeRows,
      // The public transitions, as distinct from the chronological log: a track the server marked dominant
      // is a real progression change, and a cause that reached journal visibility is a real public event.
      // These are the only significance signals the projection publishes, so they are what the life book
      // presents as the life's shape — never a guess about which Event mattered most.
      hasTransitions: trackRows.length > 0 || causeRows.length > 0 || arr(lifeBook.people).length > 0,
      hasEnding: hasEnding,
      hasDeath: hasDeath,
      endingId: presentTerminalLabel(TERMINAL_LABELS, str(record(lifeBook.ending).endingId), TERMINAL_UNKNOWN_DETAIL),
      deathCause: deathCause
    },
    rebirth: {
      completedRunId: str(rebirth.completedRunId),
      runName: str(rebirth.runName),
      finalAge: num(rebirth.finalAge, 0),
      finalRealm: presentLabel(REALM_LABELS, str(record(rebirth.finalRealm).id)),
      endingId: presentTerminalLabel(TERMINAL_LABELS, str(rebirth.endingId), TERMINAL_UNKNOWN_DETAIL),
      deathCause: presentTerminalLabel(TERMINAL_LABELS, str(rebirth.deathCause), TERMINAL_UNKNOWN_DEATH),
      // Read from the shared basis, not from the server's own counters, so REBIRTH_RESULT cannot drift
      // from LIFE_BOOK even if the two server projections were to diverge.
      peopleMet: counts.people,
      buildsFormed: counts.formed,
      eventsExperienced: counts.experiences,
      nextLifeAffordance: rebirth.nextLifeAffordance === true
    },
    nextLife: {
      completedRunId: str(nextLife.completedRunId),
      terminalStage: str(nextLife.terminalStage),
      terminalVersion: num(nextLife.terminalVersion, 0)
    }
  };
}

/** UI04E — one CTA per terminal stage. A stage without a CTA (NEXT_LIFE's confirmation) renders nothing. */
function buildTerminalCta(terminal, pageState) {
  if (terminal === null) return null;
  if (pageState === "ENDING") return { label: "翻阅人生书", action: "advance-to-life-book" };
  if (pageState === "LIFE_BOOK") return { label: "转生结果", action: "advance-to-rebirth-result" };
  if (pageState === "REBIRTH_RESULT") return { label: "迎来世", action: "advance-to-next-life" };
  return null;
}

/** PLAYUX01 (B1) — true only when the settled command resolved an Event option.
 *
 * WHY NOT "EVERY SUCCESSFUL COMMAND"
 * The server attaches a receipt to every successful command, including START_RUN and CHOOSE_ACTION. The
 * spec asks for the result panel on an *option settlement* — "EVENT 的选项一经服务器确认成功" — so showing
 * it for a destiny selection or a core action would put a result screen in front of the player for
 * something that is not a result. Worse, the panel blocks further input, so a panel after START_RUN made
 * the very next core action unreachable; `tests/ui04c.test.mjs` caught exactly that.
 *
 * WHY THE RECEIPT DECIDES RATHER THAN THE PAGE
 * `narrative.eventId` is copied from the command envelope, and only `CHOOSE_EVENT_OPTION` carries an
 * `eventId` — `START_RUN` carries `offerId` and `CHOOSE_ACTION` carries `actionId`. So the field is a
 * property of what actually settled rather than of what the page guessed it was doing, which also makes
 * it correct for a retry, where the page no longer knows which intent is in flight. */
function resolvedAnEventOption(result) {
  if (result === null || result === undefined || result.ok !== true) return false;
  var narrative = record(result.narrative);
  return typeof narrative.eventId === "string" && narrative.eventId.length > 0;
}

// ---------------------------------------------------------------- page

Page({
  data: {
    stage: "loading",
    failure: null,
    runtimeProblem: null,
    vm: null
  },

  onLoad: function () {
    var missing = runtimeSurfaceProblem();
    if (missing !== null) {
      this.controller = null;
      this.setData({
        stage: "error",
        failure: {
          stage: "加载运行时",
          code: "RuntimeSurfaceIncomplete",
          detail: "生成的运行时缺少：" + missing.join(", ") + "（运行时版本与页面不匹配）",
          specifier: RUNTIME_SPECIFIER,
          hint: REGENERATE_HINT
        }
      });
      return;
    }
    this.bootstrap();
  },

  /** Builds the injected platform host adapters and the session, then loads the authoritative view. */
  bootstrap: function () {
    var self = this;
    this.setData({ stage: "loading", failure: null });
    var transport;
    var storage;
    try {
      if (typeof wx === "undefined" || wx.cloud === undefined || typeof wx.cloud.callFunction !== "function") {
        throw new Error("当前环境未启用云开发（缺少云函数调用能力）");
      }
      transport = runtime.createWeChatCloudTransport({
        api: {
          callFunction: function (input) {
            return wx.cloud.callFunction({ name: input.name, data: input.data });
          }
        },
        cloudFunctionName: RPC_FUNCTION_NAME
      });
      storage = runtime.createWeChatPlatformStorage({
        getStorageSync: function (key) { return wx.getStorageSync(key); },
        setStorageSync: function (key, value) { wx.setStorageSync(key, value); }
      });
    } catch (error) {
      this.setData({ stage: "error", failure: describeFailure("装配传输层", error) });
      return;
    }

    Promise.resolve()
      .then(function () { return runtime.bootstrapWeChatRun({ transport: transport, bootstrapId: self.bootstrapId(), clientBuild: CLIENT_BUILD }); })
      .then(function (result) {
        self.controller = new runtime.WeChatRunController({
          transport: transport,
          storage: storage,
          session: result.session,
          commandIdFactory: function () { return self.nextCommandId(); },
          initialView: result.view
        });
        return self.controller.restore();
      })
      .then(function () {
        self.pendingIntent = null;
        self.notice = "";
        self.setData({ stage: "ready" });
        self.refresh();
      })
      .catch(function (error) {
        self.controller = null;
        self.setData({ stage: "error", failure: describeFailure("创建轮次", error) });
      });
  },

  /**
   * The locally persisted bootstrap key. Created once, then reused for the life of the install so the
   * same device always returns to the same run. Storage failures degrade to an in-memory value rather
   * than breaking the bootstrap: the server still decides, and a fresh key simply means a fresh run.
   */
  bootstrapId: function () {
    if (typeof this.cachedBootstrapId === "string" && this.cachedBootstrapId.length > 0) return this.cachedBootstrapId;
    try {
      var stored = wx.getStorageSync(BOOTSTRAP_ID_KEY);
      if (typeof stored === "string" && stored.length > 0) { this.cachedBootstrapId = stored; return stored; }
    } catch (error) {
      // Ignored on purpose: a storage failure must not stop the bootstrap, only make it non-recoverable.
    }
    this.bootSequence = (this.bootSequence || 0) + 1;
    this.cachedBootstrapId = "boot:" + Date.now().toString(36) + ":" + this.bootSequence;
    try {
      wx.setStorageSync(BOOTSTRAP_ID_KEY, this.cachedBootstrapId);
    } catch (error) {
      // Same reasoning: persist best-effort, use the value either way.
    }
    return this.cachedBootstrapId;
  },

  /** Client-side command identity only. The server stays authoritative; a commandId is not a secret. */
  nextCommandId: function () {
    this.commandSequence = (this.commandSequence || 0) + 1;
    var runId = this.controller && this.controller.view() ? this.controller.view().state.runId : "run";
    return "cmd:" + runId + ":" + Date.now().toString(36) + ":" + this.commandSequence;
  },

  refresh: function () {
    if (this.controller === null || this.controller === undefined) return;
    this.setData({ stage: "ready", vm: buildRenderModel(this.controller, this.notice || "", this.resultReceipt || null) });
  },

/**
 * Runs one intent. `reconfirm` re-submits the remembered intent after a STATE_CONFLICT refresh; the
 * submission controller mints a fresh commandId against the *latest* stateVersion, which is exactly
 * what an explicit player reconfirmation must do. A rejected promise is not swallowed: the
 * controller has already classified it, and `refresh()` renders that classification.
 *
 * PLAYUX01 (B1): this is also where the authoritative receipt is captured, and the only place it is.
 * The controller's `submit` already returns the full CommandResult — including the receipt the server
 * wrote inside the settling transaction — so the page needs no second source and makes no inference.
 */
  runIntent: function (intent, reconfirm) {
    var self = this;
    if (this.controller === null || this.controller === undefined) return;
    if (this.data.vm !== null && this.data.vm !== undefined && this.data.vm.locked === true) return;
    // PLAYUX01 (B1): while a result panel is open the page accepts no new command. The panel describes
    // a choice the player has not acknowledged yet; submitting here would stack a second receipt over
    // an unread one. Dismissing is the only way forward, and dismissing submits nothing.
    if (this.resultReceipt !== null && this.resultReceipt !== undefined) return;
    this.notice = "";
    this.setData({ "vm.locked": true });
    Promise.resolve()
      .then(function () { return reconfirm === true ? self.controller.reconfirm(intent) : self.controller.submit(intent); })
      .then(function (result) {
        if (result !== undefined && result.error !== undefined && result.error.code === "STATE_CONFLICT") self.pendingIntent = intent;
        else self.pendingIntent = null;
        // PLAYUX01 (B1): only a confirmed *option* settlement carries a receipt worth showing. A conflict,
        // a refusal or a transport failure leaves resultReceipt null, so no panel can describe a result
        // that did not happen; and a confirmed command that resolved no Event (a destiny selection, a core
        // action) raises no panel either, because that is not the moment the spec asks the player to read.
        if (resolvedAnEventOption(result)) self.resultReceipt = result;
        self.refresh();
      })
      .catch(function (error) {
        var submission = self.controller.submission();
        if (submission.requiresReconfirmation) self.pendingIntent = intent;
        if (error !== undefined && error !== null && error.name === "IntentUnavailableError") self.notice = "该操作当前不可用：服务器未提供这一选项。";
        self.refresh();
      });
  },

  /**
   * PLAYUX01 (B1) — closes the result panel.
   *
   * It submits no command on purpose: the settlement it describes is already committed, and the spec
   * forbids re-issuing the choice on the way back to RUN_HOME. This is a pure UI dismissal.
   */
  onDismissResult: function () {
    this.resultReceipt = null;
    this.refresh();
  },

  onCoreAction: function (event) {
    this.runIntent({ kind: "coreAction", intentId: event.currentTarget.dataset.intentId }, false);
  },

  onSpecialAction: function (event) {
    this.runIntent({ kind: "specialAction", intentId: event.currentTarget.dataset.intentId }, false);
  },

  /** One handler for both DESTINY_OFFER selection and an EVENT / SPECIAL_NODE option. */
  onOption: function (event) {
    this.runIntent({ kind: "interactionOption", optionId: event.currentTarget.dataset.optionId }, false);
  },

  onRetry: function () {
    var self = this;
    if (this.controller === null || this.controller === undefined) return;
    Promise.resolve()
      .then(function () { return self.controller.retry(); })
      .then(function (result) {
        // PLAYUX01 (B1): a retry that finally settles is a confirmed settlement, so its receipt is the
        // one to show. The retry re-sends the *same* pending commandId, so this is the earlier choice
        // arriving late rather than a second choice — showing it once is exactly right, and the server's
        // idempotency record guarantees the receipt is identical to the one a first attempt would have
        // produced. The same Event-option rule applies, read off the receipt rather than off page state,
        // because on a retry the page no longer knows which intent is in flight.
        if (resolvedAnEventOption(result)) self.resultReceipt = result;
        self.refresh();
      })
      .catch(function () { self.refresh(); });
  },

  onReconfirm: function () {
    if (this.pendingIntent === null || this.pendingIntent === undefined) {
      this.notice = "没有待重新确认的操作，请重新选择。";
      this.refresh();
      return;
    }
    this.runIntent(this.pendingIntent, true);
  },

  onOpenArchive: function () {
    if (this.controller === null || this.controller === undefined) return;
    try {
      this.controller.openArchive();
    } catch (error) {
      this.notice = "生平录暂时无法打开：" + sanitizeDiagnostic(error === null || error === undefined ? "" : error.message);
    }
    this.refresh();
  },

  onCloseArchive: function () {
    if (this.controller === null || this.controller === undefined) return;
    this.controller.closeArchive();
    this.refresh();
  },

  /**
   * UI04E-R1 — terminal advance. The controller refuses any advance whose authoritative
   * `expectedTerminalStage` does not match the current view, so the page can only ever submit a
   * forward edge the server itself has put on screen. The `terminalTransitionId` is generated locally
   * and persists for the duration of the install so an exact retry after a lost response recovers the
   * same settled stage.
   *
   * UI04E-R1: arriving at NEXT_LIFE is a *sidecar-only* transition. The controller does NOT
   * auto-start the next life; that happens only when the user presses the explicit "开启下一世" CTA
   * (`onStartNextLife`). This handler therefore only advances presentation stages.
   */
  onTerminalAdvance: function (event) {
    var self = this;
    if (this.controller === null || this.controller === undefined) return;
    var action = event.currentTarget.dataset.action;
    if (typeof action !== "string") { this.refresh(); return; }
    if (typeof this.terminalTransitionId !== "string" || this.terminalTransitionId.length === 0) {
      this.terminalSequence = (this.terminalSequence || 0) + 1;
      this.terminalTransitionId = "term:" + Date.now().toString(36) + ":" + this.terminalSequence;
    }
    var transitionId = this.terminalTransitionId;
    Promise.resolve()
      .then(function () { return self.controller.advanceTerminal({ terminalTransitionId: transitionId, action: action }); })
      .then(function (result) {
        if (result === undefined || result === null) { self.refresh(); return; }
        if (result.ok === true) {
          // UI04E-R1 — advanceTerminal never returns next-run identifiers. The controller already
          // refreshed the view inside advanceTerminal; NEXT_LIFE is a real, authoritative page now,
          // and the user must press the explicit CTA to start the next life.
          self.terminalTransitionId = result.terminalTransitionId;
        }
        self.refresh();
        return undefined;
      })
      .then(function () { self.refresh(); })
      .catch(function (error) {
        if (error !== undefined && error !== null && error.name === "TerminalUnavailableError") self.notice = "此终局阶段无法前进：" + sanitizeDiagnostic(error.message);
        else self.notice = "终局前进失败：" + sanitizeDiagnostic(error === null || error === undefined ? "" : error.message);
        self.refresh();
      });
  },

  /**
   * UI04E-R1 — explicit "开启下一世" CTA, fired from the NEXT_LIFE page.
   *
   * Three-stage local lifecycle so retry/reload always reuses the same pending bootstrap id:
   *   1. BEFORE the server call: read the pending key; if absent, mint a new one and persist it.
   *      The OLD bootstrap id under `BOOTSTRAP_ID_KEY` is left untouched.
   *   2. CALL `controller.startNextLife(pendingId)`. On success: promote pendingId to the current
   *      bootstrap key, clear the pending key, and let the controller's internal state swap to the
   *      returned run (which renders DESTINY_OFFER).
   *   3. ON FAILURE: leave the pending key untouched so the next retry/reload calls
   *      `createRunOffer` with the SAME id. The server's UI04D bootstrap idempotency then returns
   *      either the same new run (if the previous attempt committed) or a fresh one (if it didn't),
   *      never a second new run on top of an already-committed one.
   */
  onStartNextLife: function () {
    var self = this;
    if (this.controller === null || this.controller === undefined) return;
    var pendingId = this.readNextLifePendingBootstrap();
    if (typeof pendingId !== "string" || pendingId.length === 0) {
      pendingId = this.mintNextLifePendingBootstrap();
      this.persistNextLifePendingBootstrap(pendingId);
    }
    var startedPendingId = pendingId;
    Promise.resolve()
      .then(function () { return self.controller.startNextLife(startedPendingId); })
      .then(function () {
        // Promote pending -> current and clear the pending key, exactly once per successful life start.
        self.promoteNextLifeBootstrap(startedPendingId);
        self.terminalTransitionId = "";
        self.refresh();
        return undefined;
      })
      .catch(function (error) {
        // Pending key stays put so the next press / page reload retries with the same id.
        if (error !== undefined && error !== null && error.name === "TerminalUnavailableError") self.notice = "无法开启下一世：" + sanitizeDiagnostic(error.message);
        else self.notice = "开启下一世失败：" + sanitizeDiagnostic(error === null || error === undefined ? "" : error.message);
        self.refresh();
      });
  },

  /** UI04E-R1 — reads the pending next-life bootstrap id from local storage, if any. */
  readNextLifePendingBootstrap: function () {
    try {
      var value = wx.getStorageSync(NEXT_LIFE_BOOTSTRAP_KEY);
      if (typeof value === "string" && value.length > 0) return value;
    } catch (error) { /* ignored */ }
    return null;
  },

  /** UI04E-R1 — mints a fresh next-life bootstrap id. Local-only, never the current run's id. */
  mintNextLifePendingBootstrap: function () {
    this.nextLifeSequence = (this.nextLifeSequence || 0) + 1;
    return "next-life:" + Date.now().toString(36) + ":" + this.nextLifeSequence;
  },

  /** UI04E-R1 — persists the pending next-life bootstrap id under the dedicated pending key. */
  persistNextLifePendingBootstrap: function (pendingId) {
    if (typeof pendingId !== "string" || pendingId.length === 0) return;
    try { wx.setStorageSync(NEXT_LIFE_BOOTSTRAP_KEY, pendingId); } catch (error) { /* ignored */ }
  },

  /** UI04E-R1 — called once startNextLife has succeeded: promote pending -> current, clear pending. */
  promoteNextLifeBootstrap: function (pendingId) {
    if (typeof pendingId !== "string" || pendingId.length === 0) return;
    try { wx.setStorageSync(BOOTSTRAP_ID_KEY, pendingId); } catch (error) { /* ignored */ }
    try { wx.removeStorageSync(NEXT_LIFE_BOOTSTRAP_KEY); } catch (error) { /* ignored */ }
  },

  onReload: function () {
    this.bootstrap();
  }
});
