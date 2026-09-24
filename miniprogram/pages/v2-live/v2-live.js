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
 * The generated runtime must actually publish the UI04C surface. A stale or partial artifact would
 * otherwise fail later as a confusing `undefined is not a function`; naming the stage and the
 * regenerate command here is the difference between a diagnosable defect and a blank page.
 */
function runtimeSurfaceProblem() {
  var missing = [];
  if (typeof runtime.WeChatRunController !== "function") missing.push("WeChatRunController");
  if (typeof runtime.createWeChatPlatformStorage !== "function") missing.push("createWeChatPlatformStorage");
  if (typeof runtime.createWeChatCloudTransport !== "function") missing.push("createWeChatCloudTransport");
  if (typeof runtime.bootstrapWeChatRun !== "function") missing.push("bootstrapWeChatRun");
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

/** Player-facing copy for the public content keys this page can reach, shared with the UI02 copy pass. */
var CONTENT_COPY = {
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
  "special.attemptBreakthrough": "冲击境界"
};

function presentLabel(table, value) {
  if (typeof value !== "string" || value.length === 0) return "";
  var label = table[value];
  return typeof label === "string" && label.length > 0 ? label : value;
}

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
      return {
        entryId: str(entry.entryId),
        kindLabel: presentLabel(ENTRY_KIND_LABELS, str(entry.kind)),
        title: presentLabel(CONTENT_COPY, str(entry.titleKey)),
        summary: presentLabel(CONTENT_COPY, str(entry.summaryKey))
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
 * Projects the controller's page model + authoritative view into what the page renders.
 *
 * Pure presentation: every field is either a server-projected value or a label for one. The banner is
 * the client's *own* transport state (submitting / retryable / fatal / conflict), which the page is
 * allowed to report, and which is read from `controller.submission()` rather than invented.
 */
function buildRenderModel(controller, notice) {
  var model = controller.pageModel();
  var view = controller.view();
  var run = record(view === undefined ? null : view.state.publicRun);
  var interaction = model.interaction === undefined ? null : model.interaction;
  var realm = record(run.realm);
  var submission = controller.submission();
  var pageState = model.pageState;

  var banner = null;
  if (submission.requiresReconfirmation) banner = { kind: "conflict", text: "服务器状态已更新（第 " + model.stateVersion + " 版），请重新确认这次操作。" };
  else if (submission.interactionState === "retryableError") banner = { kind: "retry", text: "连接中断，命令尚未结算，可重试同一命令。" };
  else if (submission.interactionState === "fatalError") banner = { kind: "fatal", text: "服务器拒绝了这条命令，本地不会自行修正规则状态。" };
  else if (typeof notice === "string" && notice.length > 0) banner = { kind: "notice", text: notice };

  return {
    pageState: pageState,
    pageStateLabel: presentLabel(PAGE_STATE_LABELS, pageState),
    runStatus: model.runStatus,
    stateVersion: model.stateVersion,
    locked: model.shell.interactionLocked === true,
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
    isTerminal: pageState === "ENDING" || pageState === "LIFE_BOOK" || pageState === "REBIRTH_RESULT" || pageState === "NEXT_LIFE"
  };
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
    this.setData({ stage: "ready", vm: buildRenderModel(this.controller, this.notice || "") });
  },

  /**
   * Runs one intent. `reconfirm` re-submits the remembered intent after a STATE_CONFLICT refresh; the
   * submission controller mints a fresh commandId against the *latest* stateVersion, which is exactly
   * what an explicit player reconfirmation must do. A rejected promise is not swallowed: the
   * controller has already classified it, and `refresh()` renders that classification.
   */
  runIntent: function (intent, reconfirm) {
    var self = this;
    if (this.controller === null || this.controller === undefined) return;
    if (this.data.vm !== null && this.data.vm !== undefined && this.data.vm.locked === true) return;
    this.notice = "";
    this.setData({ "vm.locked": true });
    Promise.resolve()
      .then(function () { return reconfirm === true ? self.controller.reconfirm(intent) : self.controller.submit(intent); })
      .then(function (result) {
        if (result !== undefined && result.error !== undefined && result.error.code === "STATE_CONFLICT") self.pendingIntent = intent;
        else self.pendingIntent = null;
        self.refresh();
      })
      .catch(function (error) {
        var submission = self.controller.submission();
        if (submission.requiresReconfirmation) self.pendingIntent = intent;
        if (error !== undefined && error !== null && error.name === "IntentUnavailableError") self.notice = "该操作当前不可用：服务器未提供这一选项。";
        self.refresh();
      });
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
      .then(function () { self.refresh(); })
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

  onReload: function () {
    this.bootstrap();
  }
});
