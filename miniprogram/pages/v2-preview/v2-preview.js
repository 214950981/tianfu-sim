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
 * tests/ui02r1.test.mjs runs the real generated fixture through this function and the real markup, and
 * asserts the emitted kinds and the markup's branches agree exactly.
 */
var PAGE_KIND_BY_PAGE_STATE = {
  RUN_HOME: "RUN_HOME",
  EVENT: "EVENT",
  SPECIAL_NODE: "SPECIAL_NODE",
  ENDING: "LIFE_ARCHIVE"
};

var ACTION_LABELS = { cultivate: "闭关", travel: "游历", worldly: "入世", pursuit: "追索" };
var RISK_TIER_CLASS = { low: "", caution: "is-caution", dangerous: "is-dangerous", lethal: "is-lethal" };

/** RUN_HOME shows at most three public attention summaries; the rest lives in read-only drawers. */
var ATTENTION_SLOT_LIMIT = 3;

var DRAWER_TITLES = {
  builds: "道途印记",
  causes: "公开因果线索",
  conditions: "公开条件",
  people: "相识之人"
};
var DRAWER_NOTE = "只读 · 仅展示服务端已公开条目 · 不改变任何玩法状态";

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
  var conditions = (run.conditions || []).map(function (condition) {
    return {
      key: condition.id,
      label: condition.kind,
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
      stageLabel: build.stage,
      dominant: build.dominant === true
    };
  });
  var people = (run.people || []).map(function (person) {
    var milestones = person.milestones || [];
    return {
      npcId: person.npcId,
      name: text(person.displayName, person.npcId),
      roles: (person.knownRoles || []).join(" · "),
      relation: [person.affinity, person.trust].filter(Boolean).join(" / "),
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
    special[index].targetName = text((projected.targetRealm || {}).displayName, "");
    special[index].reason = projected.available === true ? "" : text(projected.blockedReasonKey, "breakthrough.unavailable");
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
    realmName: text(realm.id, "unknown"),
    realmOrder: number(realm.order, 0),
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
    return { slot: participant.slot, name: text(participant.displayName, "未知") };
  });
  var options = (interaction.options || []).map(function (option) {
    var risk = option.riskPresentation || null;
    return {
      optionId: option.optionId,
      label: text(option.labelKey, option.optionId),
      hasRisk: risk !== null,
      tier: risk === null ? "" : risk.tier,
      tierClass: risk === null ? "" : (RISK_TIER_CLASS[risk.tier] || ""),
      canBeFatal: risk !== null && risk.canBeFatal === true,
      reasons: risk === null ? [] : (risk.reasons || [])
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
      kind: entry.kind,
      title: entry.titleKey,
      summary: entry.summaryKey
    };
  });
  var builds = archive.builds.map(function (build) {
    return { buildId: build.buildId, name: text(build.displayName, build.buildId), stage: build.stage, dominant: build.dominant };
  });
  var people = archive.people.map(function (person) {
    return { npcId: person.npcId, name: person.displayName, roles: (person.knownRoles || []).join(" · "), status: person.knownStatus };
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
    deathRealm: death === null ? "" : text(death.deathRealm, ""),
    deathCause: death === null ? "" : text(death.directCause, ""),
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
  return Object.keys(fixtures.states).concat(Object.keys(fixtures.variants)).join(", ") || "(none)";
}

function present(key) {
  if (fixtures === null) return null;
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
  var gated = [];
  var visible = entry.shell.visibleEntries;
  if (visible.dailyChallenge !== true) gated.push("今日命局（能力未开通）");
  if (visible.share !== true) gated.push("分享（能力未开通）");
  if (visible.commerce !== true) gated.push("商行（能力未开通）");
  if (visible.rewardedAd !== true) gated.push("广告（能力未开通）");
  base.gatedEntries = gated;
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
    activeKey: "RUN_HOME",
    vm: null,
    failure: fixtureLoadFailure,
    lastIntent: "(尚未提交意图)",
    devOpen: false,
    drawer: null
  },

  onLoad: function () {
    var tabs = [];
    for (var index = 0; index < STATE_KEYS.length; index += 1) {
      tabs.push({ key: STATE_KEYS[index], label: STATE_LABELS[STATE_KEYS[index]] });
    }
    for (var variant = 0; variant < VARIANT_KEYS.length; variant += 1) {
      tabs.push({ key: VARIANT_KEYS[variant], label: VARIANT_LABELS[VARIANT_KEYS[variant]] + "·变体" });
    }
    this.setData({ tabs: tabs, failure: fixtureLoadFailure });
    this.show("RUN_HOME");
  },

  show: function (key) {
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
          "检查 STATE_KEYS / VARIANT_KEYS 与 fixture 的 states / variants 是否一致，以及 PAGE_KIND_BY_PAGE_STATE 是否覆盖该 pageState"
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
