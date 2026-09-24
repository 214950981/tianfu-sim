/**
 * UI02R1 — Tianfu-sim 2.0 in-life core-loop preview, one-screen operational layout.
 *
 * DEV PREVIEW ONLY. This route is registered last in app.json and is neither the first page nor a
 * tabBar entry. It carries no gameplay rules of any kind:
 *
 *  - Every value rendered here comes from the generated fixture module ./v2-fixtures.js, produced by
 *    tools/ui02-preview-fixture-module.mjs from the same real production chain used by
 *    tools/ui02-preview-fixtures.mjs: generateServerDestinyOffer -> reduce(START_RUN) ->
 *    ServerViewModelBuilder.build -> buildWeChatPageShell -> mapCoreActionIntents /
 *    mapSpecialActionIntents -> buildArchiveView. The sibling .json file is the same payload from the
 *    same chain and is what the tests compare against.
 *  - The page never computes eligibility, difficulty, odds, cost, risk or outcome. Tapping an action
 *    submits the intent's already-built GameCommand shape and nothing else.
 *  - Production transport binding is deliberately NOT wired here; see docs/UI02_PREVIEW.md.
 *
 * UI02R1 changes presentation only. RUN_HOME is a constrained one-screen surface: a compact
 * identity/lifespan header, core cultivation status, at most three public attention summaries plus a
 * compact public-condition row, and a bottom action dock holding the breakthrough CTA when the
 * server projects it as available and the four core actions. Full public Build / Cause / People /
 * condition lists move into read-only drawers. Dev tabs, interaction diagnostics, the blocked-back
 * probe and capability diagnostics move into a floating dev overlay so debug chrome never consumes
 * product layout height.
 *
 * Names shown for people/Causes/Builds are public display labels. Hidden Causes and hidden NPC state
 * are absent from the fixture by construction, because the server never projects them.
 *
 * UI02R2 adds a presentation-only Chinese label vocabulary for structural enum ids (realm ids, build
 * stages, condition kinds, affinity/trust semantics, roles, participant slots, risk tiers, known
 * reason keys, death causes, archive entry kinds). It changes no projected value: unknown ids fall
 * back verbatim to the raw value, and narrative content keys (titleKey/bodyKey/labelKey/summaryKey
 * prose) are not translated — that is content i18n, not presentation.
 *
 * UI02ENTRY extends the same review surface to the pre-run flow, START -> MODE_SELECT ->
 * DESTINY_OFFER -> RUN_OPENING, without starting UI03 live wiring. It adds no game authority:
 *
 *  - DESTINY_OFFER renders the real public server offer (generateServerDestinyOffer ->
 *    ServerViewModelBuilder.build) and nothing else; it holds no default selection, so the preview
 *    never pre-decides a destiny, and it cannot see rootSeed, RNG state, draw index or any weight.
 *  - MODE_SELECT only READS the accepted shell's capability projection; no mode is invented and no
 *    entry is gated by anything the client computed.
 *  - RUN_OPENING formats the already-public selected profile and public run only. No START_RUN
 *    outcome is re-derived, and nothing is submitted.
 *  - START reads no state at all; its copy is documented product copy.
 *  - Tapping a flow action only switches which generated projection is shown. That is preview
 *    navigation, not command submission; production transport is still unwired (docs/UI02_PREVIEW.md).
 */

/**
 * Fixture loading.
 *
 * The WeChat runtime cannot require() a .json file, so the fixture is loaded as the generated static
 * CommonJS module ./v2-fixtures.js. A load failure is reported with an explicit stage instead of being
 * collapsed into a "file is missing" message: the previous attempt to require the .json sibling threw
 * at runtime, the catch swallowed it, and the page blamed the fixture file while that file was present.
 *
 * HARD CONSTRAINT — the require() argument must be a string literal.
 *
 * The WeChat packager builds the page's dependency graph by statically analysing the source. Only
 * `require("./v2-fixtures.js")` is analysable, so only that form registers the dependency and gets the
 * module bundled. `require(FIXTURE_MODULE_SPECIFIER)` packs nothing and dies at runtime with
 * "module '<path>' is not defined" — the second runtime failure this page produced, and the reason the
 * regression test now scans every miniprogram module for a non-literal require argument.
 *
 * FIXTURE_MODULE_SPECIFIER therefore has exactly one job: labelling the failure panel. It is never an
 * argument to require(), and the test suite asserts it stays equal to the literal below so the two
 * cannot drift apart.
 *
 * The reported diagnostics are deliberately bounded: a stage, an error name, a sanitized one-line
 * message with path-like tokens removed, the (already documented) module specifier, and a CLI hint.
 * No fixture content, no raw state and no environment detail is ever rendered.
 */
var FIXTURE_MODULE_SPECIFIER = "./v2-fixtures.js";
var FIXTURE_JSON_SPECIFIER = "./v2-fixtures.json";
var DIAGNOSTIC_MAX_CHARS = 160;
var REGENERATE_HINT = "重新生成：node tools/ui02-preview-fixture-module.mjs --write（运行时不能 require " + FIXTURE_JSON_SPECIFIER + "）";

function sanitizeDiagnostic(value) {
  var text = typeof value === "string" ? value : String(value === undefined || value === null ? "" : value);
  return text
    .replace(/[A-Za-z]:\\[^\s]*/g, "<path>")
    .replace(/(?:[\w.-]+\/){2,}[\w.-]+/g, "<path>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DIAGNOSTIC_MAX_CHARS);
}

function errorName(error) {
  if (error !== null && typeof error === "object" && typeof error.name === "string" && error.name.length > 0) {
    return error.name;
  }
  return "Error";
}

function errorMessage(error) {
  if (error !== null && typeof error === "object" && error.message !== undefined) return error.message;
  return error;
}

function loadFailureOf(stage, code, detail, hint) {
  return {
    stage: stage,
    code: sanitizeDiagnostic(code),
    detail: sanitizeDiagnostic(detail),
    specifier: FIXTURE_MODULE_SPECIFIER,
    hint: hint === undefined ? REGENERATE_HINT : hint
  };
}

/** Loads the generated fixture module, or returns an explicit, diagnosable failure. */
function loadFixtures() {
  var loaded = null;
  try {
    // String literal, not FIXTURE_MODULE_SPECIFIER: the packager only bundles statically analysable
    // requires. Do not "clean this up" into a variable. See the constraint note above.
    loaded = require("./v2-fixtures.js");
  } catch (error) {
    return { fixtures: null, failure: loadFailureOf("module", errorName(error), errorMessage(error)) };
  }
  if (loaded === null || typeof loaded !== "object") {
    return { fixtures: null, failure: loadFailureOf("shape", "not-an-object", "预览数据模块没有导出对象") };
  }
  if (loaded.states === undefined || loaded.variants === undefined ||
      typeof loaded.states !== "object" || loaded.states === null ||
      typeof loaded.variants !== "object" || loaded.variants === null) {
    return { fixtures: null, failure: loadFailureOf("shape", "missing-collections", "预览数据模块的 states / variants 集合不可用") };
  }
  return { fixtures: loaded, failure: null };
}

var loadedFixtures = loadFixtures();
var fixtures = loadedFixtures.fixtures;
var fixtureLoadFailure = loadedFixtures.failure;

var STATE_KEYS = ["RUN_HOME", "EVENT", "SPECIAL_NODE", "LIFE_ARCHIVE"];
var STATE_LABELS = {
  RUN_HOME: "修行主页",
  EVENT: "事件",
  SPECIAL_NODE: "特殊节点",
  LIFE_ARCHIVE: "命书"
};
var VARIANT_KEYS = ["RUN_HOME_BREAKTHROUGH_BLOCKED", "RUN_HOME_NO_PLATFORM_CAPABILITY"];
var VARIANT_LABELS = {
  RUN_HOME_BREAKTHROUGH_BLOCKED: "突破未成",
  RUN_HOME_NO_PLATFORM_CAPABILITY: "能力缺省"
};

/**
 * UI02ENTRY — the pre-run entry flow, reviewed ahead of the in-life states.
 *
 * ENTRY_KEYS mirrors the generated `entry` collection and the contract main flow
 * (START -> MODE_SELECT -> DESTINY_OFFER -> RUN_OPENING). They are listed first because the flow
 * reads first; the accepted in-life states (RUN_HOME / EVENT / SPECIAL_NODE / LIFE_ARCHIVE) and the
 * two RUN_HOME variants follow unchanged.
 */
var ENTRY_KEYS = ["START", "MODE_SELECT", "DESTINY_OFFER", "RUN_OPENING"];
var ENTRY_LABELS = {
  START: "启程",
  MODE_SELECT: "模式",
  DESTINY_OFFER: "择命",
  RUN_OPENING: "入世"
};

/**
 * The product page kind the markup switches on, derived from the server-authoritative page state.
 *
 * `vm.kind` is the ONLY discriminator the product surface reads: RUN_HOME / EVENT / SPECIAL_NODE /
 * LIFE_ARCHIVE each render from `vm.kind === "<product page kind>"`. present() reported `pageState` but
 * no `kind`, so every product branch evaluated false and the surface stayed blank while `vm` held a
 * complete projection — a blank page with no error, which no structural or layout assertion could see.
 *
 * The two vocabularies are deliberately not identical, which is why the translation is explicit here
 * instead of implicit in the markup: the server reports a terminated run as `pageState: "ENDING"`
 * (page-state.ref), while the page that renders it is LIFE_ARCHIVE. The RUN_HOME variants
 * (RUN_HOME_BREAKTHROUGH_BLOCKED / RUN_HOME_NO_PLATFORM_CAPABILITY) carry `pageState: "RUN_HOME"` and
 * therefore stay RUN_HOME — a fixture key is never used as a kind.
 *
 * A page state absent from this table has no product page yet, and present() fails closed instead of
 * emitting a view the markup would silently drop.
 *
 * UI02ENTRY adds the four pre-run states. START / MODE_SELECT / RUN_OPENING have no server PageState
 * of their own (they precede any authoritative run), so their fixture entries carry the page state
 * explicitly and this table maps it 1:1 to the product page. DESTINY_OFFER is a real server page
 * state (run.status === "offered") and stays a 1:1 mapping too: one server page state -> one page.
 *
 * tests/ui02r1.test.mjs runs the real generated fixture through this function and the real markup, and
 * asserts the emitted kinds and the markup's branches agree exactly.
 */
var PAGE_KIND_BY_PAGE_STATE = {
  START: "START",
  MODE_SELECT: "MODE_SELECT",
  DESTINY_OFFER: "DESTINY_OFFER",
  RUN_OPENING: "RUN_OPENING",
  RUN_HOME: "RUN_HOME",
  EVENT: "EVENT",
  SPECIAL_NODE: "SPECIAL_NODE",
  ENDING: "LIFE_ARCHIVE"
};

var ACTION_LABELS = { cultivate: "闭关", travel: "游历", worldly: "入世", pursuit: "追索" };
var RISK_TIER_CLASS = { low: "", caution: "is-caution", dangerous: "is-dangerous", lethal: "is-lethal" };

/**
 * UI02R2 presentation label vocabulary (Chinese-facing display labels).
 *
 * These tables mirror ONLY structural enum ids that already exist in the accepted Core / Content
 * contracts: realm ids (content progression-v1 displayNames), build stages (core BUILD_STAGES),
 * condition kinds, affinity/trust semantics (core npc.ts), observed npc roles, participant slots,
 * risk tiers (core risk.ts), known reason keys and archive entry kinds. They are presentation
 * dictionaries, not a locale table: narrative content keys (titleKey / bodyKey / labelKey /
 * summaryKey prose) are deliberately NOT translated here — that belongs to a later content/i18n
 * task — and no gameplay value is computed, changed or invented by them.
 *
 * Fail-open rule: an unknown projected value falls back verbatim to the raw value, so a future
 * content pack with a new realm id or condition kind renders its raw id instead of a wrong label.
 */
var REALM_LABELS = {
  "mortal": "凡人",
  "qi-refining": "炼气",
  "foundation-establishment": "筑基",
  "golden-core": "金丹",
  "nascent-soul": "元婴",
  "spirit-transformation": "化神"
};
var BUILD_STAGE_LABELS = { "latent": "潜藏", "emerging": "初显", "formed": "成形", "refined": "精纯" };
var CONDITION_KIND_LABELS = { "injury": "伤患" };
var AFFINITY_LABELS = { "hostile": "敌视", "distant": "疏远", "neutral": "平常", "warm": "亲近", "close": "亲密" };
var TRUST_LABELS = { "wary": "戒备", "guarded": "存疑", "familiar": "相熟", "trusted": "信任", "deeplyTrusted": "深信" };
var ROLE_LABELS = { "mentor": "师长", "merchant": "商贾" };
var SLOT_LABELS = {
  "self": "自身",
  "other": "对方",
  "master": "师尊",
  "rescuedNpc": "被救之人",
  "debtor": "负债之人",
  "enemy": "仇家",
  "witness": "见证之人"
};
var RISK_TIER_LABELS = { "low": "低险", "caution": "宜慎", "dangerous": "危险", "lethal": "凶险" };
var REASON_KEY_LABELS = {
  "breakthrough.cultivation_incomplete": "修为未满",
  "breakthrough.interaction_pending": "尚有抉择未了",
  "breakthrough.unavailable": "机缘未至",
  "risk.category.combat": "争斗之险",
  "risk.category.lifespan": "寿元之危",
  "risk.reason.injury": "身负伤患"
};
var DEATH_CAUSE_LABELS = { "lifespan": "寿元耗尽", "injury": "伤重不治" };
var ENTRY_KIND_LABELS = { "event": "事件", "build": "道途" };
var CN_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** Presentation label lookup: a known contract enum id -> its Chinese label; anything unknown -> the raw value verbatim. */
function presentLabel(table, value) {
  if (typeof value !== "string" || value.length === 0) return value;
  var label = table[value];
  return typeof label === "string" && label.length > 0 ? label : value;
}

/** Presentation of the realm order: realms are 0-based and 凡人 is pre-cultivation, so order 0 reads "未入修行" instead of "第 0 境". */
function realmOrderLabel(order) {
  if (typeof order !== "number" || !isFinite(order) || order < 1) return "未入修行";
  var numeral = CN_NUMERALS[order] !== undefined ? CN_NUMERALS[order] : String(order);
  return "第" + numeral + "境";
}

/** RUN_HOME shows at most three public attention summaries; the rest lives in read-only drawers. */
var ATTENTION_SLOT_LIMIT = 3;

var DRAWER_TITLES = {
  builds: "道途印记",
  causes: "公开因果线索",
  conditions: "公开条件",
  people: "相识之人"
};
var DRAWER_NOTE = "只读 · 仅展示服务端已公开条目 · 不改变任何玩法状态";

/**
 * UI02ENTRY presentation vocabulary for the pre-run flow.
 *
 * Same discipline as the UI02R2 label tables: these mirror ONLY contract identifiers, and they carry
 * no gameplay meaning.
 *
 *  - ATTRIBUTE_LABELS mirrors the four core attribute keys (core/state.ts run.attributes, also the
 *    logical paths in core/event.ts). The labels are the documented ones in docs/PROJECT-BRAIN.md.
 *  - MODE_VOCABULARY is the capability vocabulary the UI contract already defines. It deliberately
 *    contains NO game mode: `main` is the contract main flow (START -> MODE_SELECT -> DESTINY_OFFER ->
 *    RUN_OPENING -> RUN_HOME) and every other row is an entry the contract already gates by capability.
 *    `visibleKey` names the field of the accepted shell projection (buildWeChatPageShell.visibleEntries)
 *    that decides availability, so availability is READ, never computed here.
 *  - START copy is documented product copy, not projected state: the identity line and the core line
 *    come from docs/PROJECT-BRAIN.md. No lore, benefit or gameplay promise is invented.
 */
var ATTRIBUTE_ORDER = ["insight", "body", "spiritSense", "fortune"];
var ATTRIBUTE_LABELS = { "insight": "悟性", "body": "体魄", "spiritSense": "神识", "fortune": "气运" };
var MODE_VOCABULARY = [
  { modeId: "main", label: "正式修行", note: "择命格，入此生", visibleKey: "", capability: "" },
  { modeId: "dailyChallenge", label: "今日命局", note: "每日一局 · 正式榜", visibleKey: "dailyChallenge", capability: "DailyChallengeCapability" },
  { modeId: "commerce", label: "商行", note: "只卖新的可能", visibleKey: "commerce", capability: "CommerceCapability" },
  { modeId: "share", label: "分享此命", note: "仅分享已公开信息", visibleKey: "share", capability: "ShareCapability" }
];
var MODE_GATE_NOTE = "能力未开通";
var DESTINY_OFFER_NOTE = "仅呈现服务端已公开的候选 · 不含隐藏权重 · 择定由服务端裁定";
var RUN_OPENING_NOTE = "仅呈现服务端已公开的择定与开局信息 · 不含规则内部数据";
var ENTRY_ACTION_LABELS = {
  START: "入此修行",
  MODE_SELECT: "择命格",
  RUN_OPENING: "入世"
};
var ENTRY_PREVIEW_NAV = "（预览导航，未提交命令）";
/**
 * START identity copy. Every line is documented product copy, not projected state and not new lore:
 * the product name is the one docs/UI02_PREVIEW.md already uses for 2.0, and the positioning line and
 * the core line are verbatim from docs/PROJECT-BRAIN.md. tests/ui02entry.test.mjs asserts that
 * provenance against those two documents, so this copy cannot drift into invented lore unnoticed.
 */
var START_COPY = {
  eyebrow: "天符 · 2.0",
  title: "天符",
  positioning: "选择驱动 + Build 构筑 + 因果回响 + 轮回成长 + AI 叙事",
  coreLine: "命由天定，路由我选，因果终有回响。"
};

function text(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function number(value, fallback) {
  return typeof value === "number" && isFinite(value) ? value : fallback;
}

function joinMeta(parts) {
  var kept = [];
  for (var index = 0; index < parts.length; index += 1) {
    if (typeof parts[index] === "string" && parts[index].length > 0) kept.push(parts[index]);
  }
  return kept.join(" · ");
}

/** Public lifespan pressure presentation derived only from already-public age / maxAge. */
function lifespanView(run) {
  var age = number(run.age, 0);
  var maxAge = number(run.maxAge, 0);
  var remaining = Math.max(0, maxAge - age);
  var percent = maxAge > 0 ? Math.min(100, Math.round((age / maxAge) * 100)) : 0;
  return {
    age: age,
    maxAge: maxAge,
    remaining: remaining,
    percent: percent,
    pressing: remaining <= 20
  };
}

function buildRunHome(vm) {
  var run = vm.view.state.publicRun;
  var lifespan = lifespanView(run);
  var realm = run.realm || {};
  var realmOrder = number(realm.order, 0);
  var conditions = (run.conditions || []).map(function (condition) {
    return {
      key: condition.id,
      label: presentLabel(CONDITION_KIND_LABELS, condition.kind),
      stacks: number(condition.stacks, 0)
    };
  });
  var causes = (vm.view.state.publicCauses || []).map(function (cause) {
    return {
      publicId: cause.publicId,
      level: cause.level,
      label: cause.level === "explicit" ? "已知因果" : "隐约因果"
    };
  });
  var builds = (run.builds || []).map(function (build) {
    return {
      buildId: build.buildId,
      name: text(build.displayName, build.buildId),
      stageLabel: presentLabel(BUILD_STAGE_LABELS, build.stage),
      dominant: build.dominant === true
    };
  });
  var people = (run.people || []).map(function (person) {
    var milestones = person.milestones || [];
    return {
      npcId: person.npcId,
      name: text(person.displayName, person.npcId),
      roles: (person.knownRoles || []).map(function (role) {
        return presentLabel(ROLE_LABELS, role);
      }).join(" · "),
      relation: [presentLabel(AFFINITY_LABELS, person.affinity), presentLabel(TRUST_LABELS, person.trust)].filter(Boolean).join(" / "),
      status: person.knownStatus,
      milestoneCount: milestones.length
    };
  });
  var actions = vm.coreIntents.map(function (intent) {
    return {
      intentId: intent.intentId,
      label: ACTION_LABELS[intent.command.actionId] || intent.command.actionId,
      enabled: intent.enabled,
      commandType: intent.command.type,
      actionId: intent.command.actionId
    };
  });
  var special = vm.specialIntents.map(function (intent) {
    return {
      intentId: intent.intentId,
      enabled: intent.enabled,
      label: "尝试突破",
      commandType: intent.command.type,
      targetName: "",
      reason: ""
    };
  });
  var entries = run.specialActions || [];
  for (var index = 0; index < special.length; index += 1) {
    var projected = entries[index] || {};
    var targetRealm = projected.targetRealm || {};
    special[index].targetName = presentLabel(REALM_LABELS, text(targetRealm.displayName, text(targetRealm.id, "")));
    special[index].reason = projected.available === true ? "" : presentLabel(REASON_KEY_LABELS, text(projected.blockedReasonKey, "breakthrough.unavailable"));
  }

  var dominant = null;
  for (var build = 0; build < builds.length; build += 1) {
    if (builds[build].dominant) dominant = builds[build];
  }
  if (dominant === null && builds.length > 0) dominant = builds[0];

  var attentions = [
    {
      key: "builds",
      tag: "主修",
      value: dominant === null ? "尚未成势" : dominant.name + " · " + dominant.stageLabel,
      drawer: "builds"
    },
    {
      key: "causes",
      tag: "因果",
      value: causes.length === 0
        ? "尚未显现"
        : causes[0].label + (causes.length > 1 ? " 等 " + causes.length + " 条" : ""),
      drawer: "causes"
    },
    {
      key: "people",
      tag: "相识",
      value: people.length === 0
        ? "尚未与人相识"
        : people[0].name + (people.length > 1 ? " 等 " + people.length + " 人" : ""),
      drawer: "people"
    }
  ].slice(0, ATTENTION_SLOT_LIMIT);

  var conditionSummary = conditions.length === 0
    ? "无"
    : conditions[0].label + " ×" + conditions[0].stacks + (conditions.length > 1 ? " 等 " + conditions.length + " 项" : "");

  // The breakthrough CTA is rendered only from the server-projected availability of the first special
  // intent. When it is unavailable the dock keeps one compact reason line at most, never a large block.
  var breakthrough = { enabled: false, label: "尝试突破", targetName: "", note: "", intentId: "" };
  if (special.length > 0) {
    breakthrough.intentId = special[0].intentId;
    breakthrough.label = special[0].label;
    breakthrough.targetName = special[0].targetName;
    breakthrough.enabled = special[0].enabled === true;
    if (!breakthrough.enabled) breakthrough.note = "突破 · 暂不可行 · " + special[0].reason;
  }

  return {
    kind: "RUN_HOME",
    runName: text(run.runName, "无名"),
    realmName: presentLabel(REALM_LABELS, text(realm.id, "unknown")),
    realmOrder: realmOrder,
    realmOrderLabel: realmOrderLabel(realmOrder),
    cultivation: number(realm.cultivationBps, number(realm.cultivation, 0)),
    foundation: number(realm.realmFoundationBps, 0),
    lifespan: lifespan,
    possessions: number((run.resources || {}).spiritStone, 0),
    conditions: conditions,
    conditionSummary: conditionSummary,
    causes: causes,
    builds: builds,
    people: people,
    attentions: attentions,
    actions: actions,
    special: special,
    breakthrough: breakthrough,
    hasBuilds: builds.length > 0,
    hasPeople: people.length > 0,
    hasCauses: causes.length > 0,
    hasConditions: conditions.length > 0
  };
}

function buildDecision(vm) {
  var interaction = vm.view.currentInteraction || {};
  var body = interaction.body || {};
  var participants = (body.participants || []).map(function (participant) {
    return { slot: presentLabel(SLOT_LABELS, text(participant.slot, "")), name: text(participant.displayName, "未知") };
  });
  var options = (interaction.options || []).map(function (option) {
    var risk = option.riskPresentation || null;
    return {
      optionId: option.optionId,
      label: text(option.labelKey, option.optionId),
      hasRisk: risk !== null,
      tier: risk === null ? "" : presentLabel(RISK_TIER_LABELS, risk.tier),
      tierClass: risk === null ? "" : (RISK_TIER_CLASS[risk.tier] || ""),
      canBeFatal: risk !== null && risk.canBeFatal === true,
      reasons: risk === null ? [] : (risk.reasons || []).map(function (reason) {
        return presentLabel(REASON_KEY_LABELS, reason);
      }).join(" · ")
    };
  });
  return {
    kind: vm.pageState,
    decisionId: text(interaction.interactionId, "(none)"),
    headline: text(interaction.titleKey, "(no interaction)"),
    bodyKey: text(body.bodyKey, ""),
    state: text(interaction.interactionState, "idle"),
    participants: participants,
    options: options,
    backAllowed: vm.shell.ordinaryBackAllowed === true,
    locked: vm.shell.ordinaryBackAllowed !== true,
    hasInteraction: vm.view.currentInteraction !== undefined
  };
}

function buildArchive(vm) {
  var archive = vm.archive;
  var causes = archive.causes.map(function (cause) {
    return { publicId: cause.publicId, level: cause.level, label: cause.level === "explicit" ? "明确" : "暗示" };
  });
  var entries = archive.history.map(function (entry) {
    return {
      entryId: entry.entryId,
      kind: presentLabel(ENTRY_KIND_LABELS, entry.kind),
      title: entry.titleKey,
      summary: entry.summaryKey
    };
  });
  var builds = archive.builds.map(function (build) {
    return {
      buildId: build.buildId,
      name: text(build.displayName, build.buildId),
      stage: presentLabel(BUILD_STAGE_LABELS, build.stage),
      dominant: build.dominant
    };
  });
  var people = archive.people.map(function (person) {
    return {
      npcId: person.npcId,
      name: person.displayName,
      roles: (person.knownRoles || []).map(function (role) {
        return presentLabel(ROLE_LABELS, role);
      }).join(" · "),
      status: person.knownStatus
    };
  });
  var death = archive.death || null;
  return {
    kind: "LIFE_ARCHIVE",
    readOnly: true,
    runName: text(archive.runName, "无名"),
    causes: causes,
    entries: entries,
    builds: builds,
    people: people,
    hasDeath: death !== null,
    deathAge: death === null ? 0 : number(death.deathAge, 0),
    deathRealm: death === null ? "" : presentLabel(REALM_LABELS, text(death.deathRealm, "")),
    deathCause: death === null ? "" : presentLabel(DEATH_CAUSE_LABELS, text(death.directCause, "")),
    wasWarned: death !== null && death.wasWarned === true,
    lifespanDeath: death !== null && death.lifespanDeath === true
  };
}

/**
 * Read-only detail drawer for the already-public Build / Cause / People / condition collections.
 * It only formats projection data that RUN_HOME already holds; it cannot mutate gameplay, submit an
 * intent or surface a hidden Cause.
 */
function buildDrawer(kind, runHome) {
  if (runHome === undefined || runHome === null) return null;
  if (DRAWER_TITLES[kind] === undefined) return null;
  var rows = [];
  if (kind === "builds") {
    rows = runHome.builds.map(function (build) {
      return {
        key: build.buildId,
        title: build.name,
        meta: build.stageLabel + (build.dominant ? " · 主修" : "")
      };
    });
  } else if (kind === "causes") {
    rows = runHome.causes.map(function (cause) {
      return {
        key: cause.publicId,
        title: cause.label,
        meta: cause.level === "explicit" ? "明确" : "暗示"
      };
    });
  } else if (kind === "conditions") {
    rows = runHome.conditions.map(function (condition) {
      return { key: condition.key, title: condition.label, meta: "层数 " + condition.stacks };
    });
  } else if (kind === "people") {
    rows = runHome.people.map(function (person) {
      return {
        key: person.npcId,
        title: person.name,
        meta: joinMeta([person.roles, person.relation, person.milestoneCount > 0 ? "往事 " + person.milestoneCount : ""])
      };
    });
  }
  return { kind: kind, title: DRAWER_TITLES[kind], note: DRAWER_NOTE, rows: rows };
}

/** Public structural listing of what the fixture actually carries: keys only, never values. */
function fixtureViewKeys() {
  if (fixtures === null) return "(none)";
  return ENTRY_KEYS.concat(Object.keys(fixtures.states)).concat(Object.keys(fixtures.variants)).join(", ") || "(none)";
}

/** The capability-gated entry names that are hidden for a given public entry projection. Read, never computed. */
function gatedEntriesOf(visible) {
  var gated = [];
  if (visible.dailyChallenge !== true) gated.push("今日命局（能力未开通）");
  if (visible.share !== true) gated.push("分享（能力未开通）");
  if (visible.commerce !== true) gated.push("商行（能力未开通）");
  if (visible.rewardedAd !== true) gated.push("广告（能力未开通）");
  return gated;
}

/* ---------- UI02ENTRY pre-run flow: presentation builders ----------
 *
 * These four builders only FORMAT the generated fixture. The copy and the vocabulary live here; every
 * datum (offer candidates, capability gates, the selected public profile, the public run) comes from
 * the fixture, which is generated by the real production chain. Nothing here computes eligibility,
 * odds, weights, outcomes, RNG or a destiny. In particular:
 *  - START reads no state at all;
 *  - MODE_SELECT only READS the accepted shell's capability projection to decide what is available;
 *  - DESTINY_OFFER renders the public candidate fields verbatim and holds NO default selection, so the
 *    preview never pre-decides a destiny for the player;
 *  - RUN_OPENING formats the already-public selected profile and run only.
 */

function buildStart() {
  // Identity + documented positioning + the documented core line. No projected state is involved, so
  // there is nothing that could disagree with the server.
  return {
    kind: "START",
    eyebrow: START_COPY.eyebrow,
    title: START_COPY.title,
    positioning: START_COPY.positioning,
    coreLine: START_COPY.coreLine,
    primary: { label: ENTRY_ACTION_LABELS.START, enabled: true, target: "MODE_SELECT" }
  };
}

function buildModeSelect(entry) {
  // Availability is the accepted shell's capability projection, never a locally invented flag: the
  // main contract flow is always available, every other row is gated by its named capability.
  var visible = (entry !== null && entry.shell !== undefined && entry.shell.visibleEntries !== null && entry.shell.visibleEntries !== undefined)
    ? entry.shell.visibleEntries
    : {};
  var modes = MODE_VOCABULARY.map(function (mode) {
    var available = mode.visibleKey === "" ? true : visible[mode.visibleKey] === true;
    return {
      modeId: mode.modeId,
      label: mode.label,
      note: mode.note,
      available: available,
      capability: mode.capability,
      gateNote: available ? "" : MODE_GATE_NOTE + (mode.capability === "" ? "" : " · " + mode.capability),
      primary: mode.visibleKey === ""
    };
  });
  var main = modes.filter(function (mode) { return mode.primary; })[0];
  return {
    kind: "MODE_SELECT",
    modes: modes,
    availableCount: modes.filter(function (mode) { return mode.available; }).length,
    gatedCount: modes.filter(function (mode) { return !mode.available; }).length,
    // The entry action follows the main contract flow; it is enabled only when that row is available so
    // the visual state can never disagree with the projection.
    primary: { label: ENTRY_ACTION_LABELS.MODE_SELECT, enabled: main !== undefined && main.available === true, target: "DESTINY_OFFER" }
  };
}

function buildDestinyOffer(entry) {
  var interaction = (entry !== null && entry.view !== undefined && entry.view.currentInteraction !== undefined)
    ? entry.view.currentInteraction
    : {};
  var body = interaction.body !== undefined && interaction.body !== null ? interaction.body : {};
  var options = interaction.options !== undefined ? interaction.options : [];
  var optionById = {};
  for (var index = 0; index < options.length; index += 1) {
    optionById[options[index].optionId] = options[index];
  }
  var candidates = (body.candidates || []).map(function (candidate, position) {
    var selectionId = text(candidate.selectionId, "");
    var option = optionById[selectionId];
    return {
      // The confirmation option id is the server-projected option for this candidate, matched by id
      // (never by position), so the preview cannot pair a candidate with the wrong option.
      optionId: option === undefined ? selectionId : text(option.optionId, selectionId),
      selectionId: selectionId,
      order: position + 1,
      spiritualRoot: text(candidate.spiritualRoot, ""),
      talent: text(candidate.talent, ""),
      majorDestiny: text(candidate.majorDestiny, "")
    };
  });
  return {
    kind: "DESTINY_OFFER",
    offerId: text(interaction.interactionId, ""),
    state: text(interaction.interactionState, "idle"),
    candidates: candidates,
    count: candidates.length,
    note: DESTINY_OFFER_NOTE
  };
}

function buildRunOpening(entry) {
  var run = (entry !== null && entry.view !== undefined && entry.view.state !== undefined)
    ? entry.view.state.publicRun
    : {};
  var realm = run.realm !== undefined && run.realm !== null ? run.realm : {};
  var attributes = run.attributes !== undefined && run.attributes !== null ? run.attributes : {};
  var selected = entry !== null && entry.selected !== undefined ? entry.selected : null;
  var rows = ATTRIBUTE_ORDER.map(function (key) {
    return { key: key, label: presentLabel(ATTRIBUTE_LABELS, key), value: number(attributes[key], 0) };
  });
  return {
    kind: "RUN_OPENING",
    runName: text(run.runName, "无名"),
    realmName: presentLabel(REALM_LABELS, text(realm.id, "unknown")),
    age: number(run.age, 0),
    maxAge: number(run.maxAge, 0),
    attributes: rows,
    hasSelected: selected !== null,
    selectedRoot: selected === null ? "" : text(selected.spiritualRoot !== undefined && selected.spiritualRoot !== null ? selected.spiritualRoot.displayName : "", ""),
    selectedTalent: selected === null ? "" : text(selected.talent !== undefined && selected.talent !== null ? selected.talent.displayName : "", ""),
    selectedDestiny: selected === null ? "" : text(selected.majorDestiny !== undefined && selected.majorDestiny !== null ? selected.majorDestiny.displayName : "", ""),
    note: RUN_OPENING_NOTE,
    enter: { label: ENTRY_ACTION_LABELS.RUN_OPENING, enabled: true, target: "RUN_HOME" }
  };
}

/** Builds the presentation for one generated `entry` fixture; null when the key is not an entry state. */
function buildEntry(key, entry) {
  var kind = PAGE_KIND_BY_PAGE_STATE[entry.pageState];
  if (kind === undefined) return null;
  var visible = (entry.shell !== undefined && entry.shell !== null) ? entry.shell.visibleEntries : null;
  var base = {
    key: key,
    kind: kind,
    label: ENTRY_LABELS[key] || key,
    pageState: entry.pageState,
    shell: entry.shell === undefined ? null : entry.shell,
    capabilities: entry.view === undefined ? null : entry.view.state.capabilities,
    visibleEntries: visible,
    gatedEntries: visible === null ? [] : gatedEntriesOf(visible)
  };
  if (key === "START") base.start = buildStart();
  else if (key === "MODE_SELECT") base.modeSelect = buildModeSelect(entry);
  else if (key === "DESTINY_OFFER") base.destinyOffer = buildDestinyOffer(entry);
  else if (key === "RUN_OPENING") base.runOpening = buildRunOpening(entry);
  return base;
}

function present(key) {
  if (fixtures === null) return null;
  var entryState = fixtures.entry !== undefined ? fixtures.entry[key] : undefined;
  if (entryState !== undefined && entryState !== null) return buildEntry(key, entryState);
  var entry = fixtures.states[key] || fixtures.variants[key];
  if (entry === undefined || entry === null) return null;
  var kind = PAGE_KIND_BY_PAGE_STATE[entry.pageState];
  if (kind === undefined) return null;
  var base = {
    key: key,
    // The product page kind the markup switches on. Never the fixture key and never the raw server
    // page state: see PAGE_KIND_BY_PAGE_STATE.
    kind: kind,
    label: STATE_LABELS[key] || VARIANT_LABELS[key] || key,
    pageState: entry.pageState,
    shell: entry.shell,
    capabilities: entry.view.state.capabilities,
    visibleEntries: entry.shell.visibleEntries,
    gatedEntries: []
  };
  base.gatedEntries = gatedEntriesOf(entry.shell.visibleEntries);
  if (key === "RUN_HOME" || key === "RUN_HOME_BREAKTHROUGH_BLOCKED" || key === "RUN_HOME_NO_PLATFORM_CAPABILITY") {
    base.runHome = buildRunHome(entry);
  } else if (key === "EVENT" || key === "SPECIAL_NODE") {
    base.decision = buildDecision(entry);
  } else if (key === "LIFE_ARCHIVE") {
    base.archive = buildArchive(entry);
  }
  return base;
}

Page({
  data: {
    tabs: [],
    activeKey: "START",
    vm: null,
    failure: fixtureLoadFailure,
    lastIntent: "(尚未提交意图)",
    // DESTINY_OFFER highlight only. It is a preview UI state: nothing is resolved from it.
    offerSelected: "",
    devOpen: false,
    drawer: null
  },

  onLoad: function () {
    var tabs = [];
    for (var entry = 0; entry < ENTRY_KEYS.length; entry += 1) {
      tabs.push({ key: ENTRY_KEYS[entry], label: ENTRY_LABELS[ENTRY_KEYS[entry]] });
    }
    for (var index = 0; index < STATE_KEYS.length; index += 1) {
      tabs.push({ key: STATE_KEYS[index], label: STATE_LABELS[STATE_KEYS[index]] });
    }
    for (var variant = 0; variant < VARIANT_KEYS.length; variant += 1) {
      tabs.push({ key: VARIANT_KEYS[variant], label: VARIANT_LABELS[VARIANT_KEYS[variant]] + "·变体" });
    }
    this.setData({ tabs: tabs, failure: fixtureLoadFailure });
    // The preview opens on the flow's first screen so the entry flow reads in order.
    this.show("START");
  },

  show: function (key) {
    this.setData({ offerSelected: "" });
    if (fixtureLoadFailure !== null) {
      this.setData({ activeKey: key, vm: null, failure: fixtureLoadFailure });
      return;
    }
    var view = present(key);
    if (view === null) {
      // Two causes, both reported explicitly: the fixture has no such view, or its server page state has
      // no product page in PAGE_KIND_BY_PAGE_STATE. Neither degrades to a blank product surface.
      this.setData({
        activeKey: key,
        vm: null,
        failure: loadFailureOf(
          "view",
          key,
          "预览数据中没有该视图，或该视图的服务端页面状态没有对应的产品页面；已有：" + fixtureViewKeys(),
          "检查 ENTRY_KEYS / STATE_KEYS / VARIANT_KEYS 与 fixture 的 entry / states / variants 是否一致，以及 PAGE_KIND_BY_PAGE_STATE 是否覆盖该 pageState"
        )
      });
      return;
    }
    this.setData({ activeKey: key, vm: view, failure: null });
  },

  onSelectTab: function (event) {
    var key = event.currentTarget.dataset.key;
    if (typeof key === "string" && key.length > 0) {
      // Collapse the dev overlay and any drawer so the product one-screen result is immediately visible.
      this.setData({ devOpen: false, drawer: null });
      this.show(key);
    }
  },

  /**
   * Pre-run flow navigation inside the preview.
   *
   * START -> MODE_SELECT -> DESTINY_OFFER are pure contract page-state transitions, so tapping the
   * primary action simply switches which generated projection is rendered. Nothing is submitted, and
   * the target view is a fixture produced by the real production chain, so no rule is resolved here.
   */
  onEntryNav: function (event) {
    var target = event.currentTarget.dataset.target;
    if (typeof target !== "string" || target.length === 0) return;
    this.show(target);
    this.setData({ lastIntent: "预览导航 → " + (ENTRY_LABELS[target] || target) + ENTRY_PREVIEW_NAV });
  },

  /** DESTINY_OFFER highlight. Pure UI selection; it never resolves, ranks or confirms a destiny. */
  onSelectCandidate: function (event) {
    var vm = this.data.vm;
    if (vm === null || vm.destinyOffer === undefined) return;
    var optionId = event.currentTarget.dataset.option;
    if (typeof optionId !== "string" || optionId.length === 0) return;
    var found = null;
    for (var index = 0; index < vm.destinyOffer.candidates.length; index += 1) {
      if (vm.destinyOffer.candidates[index].optionId === optionId) found = vm.destinyOffer.candidates[index];
    }
    if (found === null) return;
    this.setData({ offerSelected: optionId });
  },

  /**
   * DESTINY_OFFER confirmation. In this dev preview the intent is only recorded, never sent: the real
   * START_RUN command and its authoritative result belong to the live-session wiring (UI03).
   */
  onOfferConfirm: function () {
    var vm = this.data.vm;
    if (vm === null || vm.destinyOffer === undefined) return;
    var selected = null;
    for (var index = 0; index < vm.destinyOffer.candidates.length; index += 1) {
      if (vm.destinyOffer.candidates[index].optionId === this.data.offerSelected) selected = vm.destinyOffer.candidates[index];
    }
    if (selected === null) {
      this.setData({ lastIntent: "尚未择定命格（预览未提交命令）" });
      return;
    }
    this.setData({
      lastIntent: "预览已择定 " + selected.spiritualRoot + " · " + selected.talent + " · " + selected.majorDestiny +
        " → 命令 START_RUN（预览未接线，未发送）"
    });
  },

  onToggleDev: function () {
    this.setData({ devOpen: this.data.devOpen !== true, drawer: null });
  },

  onCloseDev: function () {
    this.setData({ devOpen: false });
  },

  onOpenDrawer: function (event) {
    var kind = event.currentTarget.dataset.drawer;
    if (typeof kind !== "string" || kind.length === 0) return;
    var vm = this.data.vm;
    if (vm === null || vm.runHome === undefined) return;
    var drawer = buildDrawer(kind, vm.runHome);
    if (drawer === null) return;
    this.setData({ drawer: drawer });
  },

  onCloseDrawer: function () {
    this.setData({ drawer: null });
  },

  /**
   * Intent submission boundary. In this dev preview the intent is only recorded, never sent:
   * production transport binding is explicitly later work (docs/UI02_PREVIEW.md).
   */
  onIntent: function (event) {
    var vm = this.data.vm;
    if (vm === null) return;
    var intentId = event.currentTarget.dataset.intent;
    var pool = (vm.runHome && vm.runHome.actions ? vm.runHome.actions : []).concat(vm.runHome && vm.runHome.special ? vm.runHome.special : []);
    var found = null;
    for (var index = 0; index < pool.length; index += 1) {
      if (pool[index].intentId === intentId) found = pool[index];
    }
    if (found === null) {
      this.setData({ lastIntent: "未知意图，已忽略" });
      return;
    }
    if (found.enabled !== true) {
      this.setData({ lastIntent: "意图 " + intentId + " 当前不可用（服务端投影为不可用），未提交" });
      return;
    }
    this.setData({ lastIntent: "意图 " + intentId + " → 命令 " + found.commandType + "（预览未接线，未发送）" });
  },

  onBlockedBack: function () {
    if (this.data.vm !== null && this.data.vm.decision && this.data.vm.decision.locked) {
      this.setData({ lastIntent: "该决策未落定，普通返回被服务端页面状态锁定" });
      return;
    }
    this.setData({ lastIntent: "普通返回可用" });
  }
});
