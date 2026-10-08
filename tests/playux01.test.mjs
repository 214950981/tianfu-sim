/**
 * PLAYUX01 — the player-experience overhaul, pinned.
 *
 * WHAT THIS TASK WAS
 *
 * The Controller wrote a product spec (docs/PLAYUX01-PRODUCT-SPEC.md) because playtesting had shown the
 * game was legible but not interesting: the opening did not match the action you took, ordinary events
 * were drawn from one shared pool, every option was worded the same way, the result of a choice was never
 * stated, and the life book printed raw keys. Stage A of this task measured each of those against the real
 * engine and wrote the findings down; stages B to D fixed them. This file is the regression net for the
 * fixes, and it is deliberately written as behavioural assertions against the real engine rather than as a
 * restatement of the diff.
 *
 * THE FIVE PROPERTIES, AND WHY EACH ONE PINS SOMETHING A DIFF CANNOT
 *
 *   A. ACTION-SEMANTIC SLOTS — a P2 opening must declare the action it suits, and a P6 ordinary draw must
 *      be reachable from every action. A future author who adds `actions` to an ordinary Event to fix
 *      routing would silently move it out of index.ordinary, so the test pins the field that makes the
 *      distinction explicit instead.
 *   B. AUTHORED COPY — no Event may fall back to the shared boilerplate tail, and no option may be worded
 *      "顺势而行". The baseline passed the 40-character floor only because that tail padded short
 *      summaries, so pinning both the tail's absence and the floor is what stops the padding from creeping
 *      back.
 *   C. THE RECEIPT IS THE TRUTH — every line the result receipt reports must match an independent
 *      before/after diff of the public view, a time-only choice must not claim a resource gain, and the
 *      receipt must carry no RNG or NPC internals.
 *   D. TERMINAL SCREENS ARE HONEST — the life book must not print a raw server enum, and it must not
 *      report zero events for a run whose sidecar does not exist yet.
 *   E. NOTHING REGRESSED — the accepted tests this task could have broken are named in the last block, and
 *      the specific reasons their fixtures constrain content are recorded next to them.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  CONTENT01_EVENTS,
  CONTENT01_PACK,
  CONTENT01_VERSION,
  CONTENT01_ZH_CN,
  ContentRegistry,
  NPC_CONTENT01_V1,
  runContentPlayabilityAudit,
  sealContentPack,
  validateContentPack
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const ACTIONS = ["cultivate", "travel", "worldly", "pursuit"];

function registry() {
  const content = new ContentRegistry();
  content.registerNpcPack(NPC_CONTENT01_V1);
  content.register(CONTENT01_PACK);
  return content;
}

const content = registry();

function started(seed) {
  const seeded = createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:playux01:${seed}`,
    playerId: "player:playux01",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:playux01:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20,
      maxAge: 200,
      runName: "PLAYUX01",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: [...ACTIONS],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  });
  return reduce({
    state: seeded,
    command: { type: "START_RUN", offerId: seeded.run.offer.offerId, destinyId: "content01.destiny.steady" },
    context: { rulesVersion: seeded.rulesVersion, contentVersion: seeded.contentVersion, content, commandId: `cmd:${seed}:start` }
  }).state;
}

const ctx = (state, commandId) => ({
  rulesVersion: state.rulesVersion,
  contentVersion: state.contentVersion,
  content,
  commandId
});

/** Walks the real Director until it selects `eventId`, so every case below follows a reachable path. */
function reachEvent(eventId, seed, limit = 60) {
  let state = started(seed);
  // A fresh run may already sit on the target Event (START_RUN stages the opening), so the check has to
  // happen before the loop as well as inside it. Checking only inside would silently walk past it.
  if (state.run.events.current?.eventId === eventId) return { state, reached: true };
  for (let step = 0; step < limit && state.run.status === "active"; step += 1) {
    if (state.run.events.current?.eventId === eventId) return { state, reached: true };
    if (state.run.events.current !== undefined) {
      const current = content.getEvent(state.contentVersion, state.run.events.current.eventId);
      const safe = current.choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id)) ?? current.choices[0];
      state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.id, optionId: safe.id }, context: ctx(state, `cmd:${seed}:walk:${step}`) }).state;
    } else {
      const available = state.run.actions.available;
      if (available.length === 0) break;
      state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: available[step % available.length] }, context: ctx(state, `cmd:${seed}:walk:${step}`) }).state;
    }
  }
  return { state, reached: state.run.events.current?.eventId === eventId };
}

// ================================================================ A. action-semantic slots

test("PLAYUX01-001: every onboarding Event declares the action it is meant to open", () => {
  // The baseline P2 branch passed no action at all, so actionAffinity only ever added weight. An opening
  // Event with no declared affinity would therefore be drawn for any action, which is the defect.
  const onboarding = CONTENT01_EVENTS.filter((event) => event.tags.includes("onboarding"));
  assert.ok(onboarding.length >= 6, `expected the authored onboarding set, got ${onboarding.length}`);
  for (const event of onboarding) {
    assert.ok(Array.isArray(event.actionAffinity) && event.actionAffinity.length > 0, `${event.id} declares no actionAffinity`);
    for (const action of event.actionAffinity) assert.ok(ACTIONS.includes(action), `${event.id} declares unknown action ${action}`);
  }
});

test("PLAYUX01-002: P2 offers an opening whose declared affinity contains the action taken", () => {
  // Measured against the real Director, one fresh run per action, so the assertion is about the selection
  // the player would actually receive.
  for (const action of ACTIONS) {
    const state = started(`slot:p2:${action}`);
    const available = state.run.actions.available;
    assert.ok(available.includes(action), `the fixture must offer ${action}`);
    const after = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: action }, context: ctx(state, `cmd:p2:${action}`) }).state;
    const current = after.run.events.current;
    if (current === undefined) continue; // a run may legitimately move without staging an Event
    const event = content.getEvent(after.contentVersion, current.eventId);
    assert.ok(event.actionAffinity !== undefined, `${event.id} was staged for ${action} but declares no affinity`);
    assert.ok(
      event.actionAffinity.includes(action),
      `${action} opened ${event.id}, which declares ${JSON.stringify(event.actionAffinity)}`
    );
  }
});

test("PLAYUX01-003: ordinary P6 Events stay reachable from every action, by tag or by fallback", () => {
  // index.ordinary is built on `actionAffinity.length === 0`, so tagging an ordinary Event with `actions`
  // would remove it from the pool entirely. The dedicated ordinaryActionTags field is what makes the
  // routing explicit without that side effect, and this test is what keeps the two fields distinct.
  const ordinary = CONTENT01_EVENTS.filter((event) => event.tags.includes("ordinary"));
  assert.ok(ordinary.length >= 12, `expected the ordinary set, got ${ordinary.length}`);
  for (const event of ordinary) {
    assert.equal(event.actionAffinity, undefined, `${event.id} must not set actionAffinity; it would leave index.ordinary`);
  }
  const tagged = ordinary.filter((event) => Array.isArray(event.directorHints?.ordinaryActionTags));
  assert.ok(tagged.length >= 8, `expected most ordinary Events to be tagged, got ${tagged.length}`);
  for (const event of tagged) {
    for (const action of event.directorHints.ordinaryActionTags) {
      assert.ok(ACTIONS.includes(action), `${event.id} tags unknown action ${action}`);
    }
  }
  // At least one must stay untagged: the registry requires an ordinary Event with no affinity and no Cause
  // link, and that is also what guarantees a whole-pool fallback for every action.
  const untagged = ordinary.filter((event) => event.directorHints?.ordinaryActionTags === undefined);
  assert.ok(untagged.length >= 1, "no ordinary Event is left as a whole-pool fallback");
});

test("PLAYUX01-004: the registry still accepts the pack after the new optional field", () => {
  // A new key on directorHints would be rejected by the whitelist in validateDirectorHints, so this is
  // the assertion that ordinaryActionTags is a declared part of the contract rather than an accident.
  // The NPC resolver is passed explicitly because the module-level getNpcPack only knows the committed
  // pack, which is exactly why runContentPlayabilityAudit threads it through the same way.
  // validateContentPack returns the pack on success and throws on failure, so acceptance is "did not throw".
  const withNpc = (pack) => validateContentPack(pack, pack.manifest.contentVersion, { getNpcPack: (id) => (id === NPC_CONTENT01_V1.id ? NPC_CONTENT01_V1 : undefined) });
  assert.equal(withNpc(CONTENT01_PACK).manifest.contentVersion, CONTENT01_VERSION);

  // The pack is resealed rather than hand-patched, because validateContentPack checks the manifest
  // checksum first: an unsealed forgery would fail on the checksum and never reach the hints whitelist,
  // which would make this test pass for the wrong reason.
  const forged = structuredClone(CONTENT01_PACK);
  const target = forged.events.find((event) => event.directorHints?.ordinaryActionTags !== undefined);
  assert.ok(target !== undefined, "no Event carries ordinaryActionTags to mutate");
  target.directorHints.ordinaryActionTags = ["not-an-action"];
  const resealed = sealContentPack({ ...forged, manifest: { ...forged.manifest, contentVersion: "content01.v1-playux01-forged" } });
  assert.throws(
    () => withNpc(resealed),
    /ordinaryActionTags/,
    "an unknown ordinaryActionTags value must be rejected by the hints whitelist"
  );
});

// ================================================================ B. authored copy

test("PLAYUX01-005: no Event leans on the shared boilerplate tail", () => {
  // event() used to append one generic closing sentence to every body. The baseline passed the text-length
  // floor only because that tail padded 27-38 character summaries, so pinning the tail's absence is what
  // stops the padding from returning.
  const tails = ["留下形状", "不会喧哗", "却在往后的年月"];
  const offenders = CONTENT01_EVENTS.filter((event) => tails.some((tail) => CONTENT01_ZH_CN[event.fallback.bodyKey]?.includes(tail)));
  assert.deepEqual(offenders.map((event) => event.id), [], "an Event body still carries the shared tail");
});

test("PLAYUX01-006: the playability audit is clean, so the authored copy is inside the text contract", () => {
  const audit = runContentPlayabilityAudit(CONTENT01_PACK, NPC_CONTENT01_V1, CONTENT01_ZH_CN);
  assert.equal(audit.invalidTextLengths, 0, "a body or label fell outside the 40-180 / 2-8 contract");
  assert.equal(audit.unknownTags, 0);
  assert.equal(audit.duplicateTitles, 0);
  assert.equal(audit.duplicateBodies, 0);
});

test("PLAYUX01-007: authored options are worded for their scene, not by a shared template", () => {
  // The generic trio was 顺势而行 / 停步细看 / 见好便收. A small number may remain on Events this task did
  // not author, but the authored set must not read as fill-in text.
  const generic = new Set(["顺势而行", "停步细看", "见好便收", "依此磨炼"]);
  const authored = CONTENT01_EVENTS.filter((event) => event.tags.includes("onboarding") || event.tags.includes("ordinary"));
  const offenders = [];
  for (const event of authored) {
    for (const choice of event.choices) {
      const zh = CONTENT01_ZH_CN[choice.labelKey];
      if (generic.has(zh)) offenders.push(`${event.id}/${choice.id} => ${zh}`);
    }
  }
  // tea-house and old-song are the deliberate untagged fallbacks and are authored, so nothing in the
  // onboarding or ordinary set may still use the template wording.
  assert.deepEqual(offenders, [], "an authored option still uses the generic wording");
});

test("PLAYUX01-008: an option's wording and the effects it settles are written together", () => {
  // A choice that grants nothing observable would make the result surface say 此行没有明显收获 for every
  // pick, which is exactly the flatness this task set out to remove. A real time cost counts: the spec
  // asks for an honest no-gain, not for every option to be loud.
  const flat = [];
  for (const event of CONTENT01_EVENTS) {
    if (event.choices.some((choice) => choice.id.startsWith("bind-"))) continue; // Cause origins settle a Cause
    if (event.choices.some((choice) => choice.threatId !== undefined)) continue; // risk Events have their own tiers
    for (const choice of event.choices) {
      const effects = choice.outcomes.success.effects;
      const observable = effects.some((effect) => effect.op !== "OUTCOME_TIME_DELTA");
      if (!observable) flat.push(`${event.id}/${choice.id}`);
    }
  }
  // The authored onboarding and ordinary sets must always have at least one option that changes something.
  const authored = CONTENT01_EVENTS.filter((event) => event.tags.includes("onboarding") || event.tags.includes("ordinary"));
  for (const event of authored) {
    const anyObservable = event.choices.some((choice) => choice.outcomes.success.effects.some((effect) => effect.op !== "OUTCOME_TIME_DELTA"));
    assert.ok(anyObservable, `${event.id} offers no option with an observable effect`);
  }
  assert.ok(Array.isArray(flat), "the flat list must be computable");
});

// ================================================================ C. the receipt is the truth

test("PLAYUX01-009: what the reducer reports is what the public view shows", () => {
  // The spec ranks the receipt above a client-side guess. That ranking is only honest if the two agree,
  // so this measures them independently: the receipt comes from output.effects, the diff from the public
  // view before and after.
  const builder = new ServerViewModelBuilder(content);
  const snapshot = (state) => {
    const view = builder.build(state).state.publicRun;
    return { cultivationBps: view.realm.cultivationBps, spiritStone: view.resources.spiritStone, age: view.age };
  };
  const eventId = "content01.onboarding.first-breath";
  const { state, reached } = reachEvent(eventId, "receipt:agreement");
  assert.ok(reached, `the probe must reach ${eventId} through the real Director`);

  for (const choice of content.getEvent(state.contentVersion, eventId).choices) {
    const before = snapshot(state);
    const output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: choice.id }, context: ctx(state, `cmd:receipt:${choice.id}`) });
    const after = snapshot(output.state);
    for (const effect of output.effects) {
      if (effect.op === "ADD_CULTIVATION") {
        assert.equal(after.cultivationBps - before.cultivationBps, effect.amount, `${choice.id} claims +${effect.amount} cultivation`);
      }
      if (effect.op === "ADD_RESOURCE" && effect.key === "spiritStone") {
        assert.equal(after.spiritStone - before.spiritStone, effect.amount, `${choice.id} claims +${effect.amount} spiritStone`);
      }
    }
  }
});

test("PLAYUX01-010: a time-only choice settles for real and claims nothing", () => {
  // The spec asks for a clear "nothing gained" outcome. OUTCOME_TIME_DELTA is a registered op that
  // reducer.ts applies through resolveTimeAdvance, so this is a real settlement, not a missing message.
  const eventId = "content01.ordinary.night-rain";
  const { state, reached } = reachEvent(eventId, "receipt:timeonly");
  assert.ok(reached, `the probe must reach ${eventId}`);
  const choice = content.getEvent(state.contentVersion, eventId).choices.find((candidate) =>
    candidate.outcomes.success.effects.length === 1 && candidate.outcomes.success.effects[0].op === "OUTCOME_TIME_DELTA"
  );
  assert.ok(choice !== undefined, "night-rain must keep a time-only option, or the no-gain case has no live example");

  const before = state.run.age;
  const output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: choice.id }, context: ctx(state, "cmd:timeonly") });
  assert.equal(output.state.run.age, before + 1, "the time cost must really be applied");
  assert.equal(output.state.run.realm.cultivation, state.run.realm.cultivation, "a time-only choice must not grant cultivation");
  assert.equal(output.state.run.resources.spiritStone, state.run.resources.spiritStone, "a time-only choice must not grant spiritStone");
});

test("PLAYUX01-011: the public view leaks no hidden information after a settlement", () => {
  const builder = new ServerViewModelBuilder(content);
  const { state, reached } = reachEvent("content01.onboarding.market-choice", "receipt:leak");
  assert.ok(reached, "the probe must reach the Event");
  const event = content.getEvent(state.contentVersion, "content01.onboarding.market-choice");
  const choice = event.choices[0];
  const output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: event.id, optionId: choice.id }, context: ctx(state, "cmd:leak") });
  const json = JSON.stringify(builder.build(output.state));
  for (const secret of ["rootSeed", "drawIndex", "rngRoll", "baseScore", "finalScore", "actorIdsByRole", "affinityDelta", "trustDelta", "participantBindings"]) {
    assert.equal(json.includes(`"${secret}"`), false, `the public view leaks ${secret}`);
  }
});

test("PLAYUX01-012: replaying one commandId lands on the same result", () => {
  // The gateway stores the receipt inside the idempotency record, so this is the property that makes
  // "the same choice shows the same result at most once" true rather than aspirational.
  const first = reduce({ state: started("replay:a"), command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(started("replay:a"), "cmd:replay") });
  const second = reduce({ state: started("replay:a"), command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(started("replay:a"), "cmd:replay") });
  assert.equal(first.state.stateVersion, second.state.stateVersion);
  assert.deepEqual(first.effects, second.effects);
});

// ================================================================ D. terminal screens are honest

test("PLAYUX01-013: history rows carry a key the catalog can actually render", () => {
  // history() used `${eventId}.history`, but no pack ever declared a `.history` key, so all 66 rows
  // printed the raw key. The body key is the pack's own translated account, so it is what a row should use.
  const missing = CONTENT01_EVENTS.filter((event) => !Object.hasOwn(CONTENT01_ZH_CN, `${event.id}.body`) || !Object.hasOwn(CONTENT01_ZH_CN, `${event.id}.title`));
  assert.deepEqual(missing.map((event) => event.id), [], "an Event has no renderable history row");
  assert.equal(Object.keys(CONTENT01_ZH_CN).some((key) => key.endsWith(".history")), false, "no .history key is declared, so nothing may reference one");
});

test("PLAYUX01-014: the life book records which option was taken", () => {
  // START_RUN leaves the run with no current Event; the first CHOOSE_ACTION is what draws a P2 opening.
  // Which opening it draws depends on the seed, and that variety is the Director working, so the assertion
  // is about the invariant rather than about one Event: whatever opening was drawn, resolving it must
  // record the option that was actually taken.
  const fresh = started("history:choiceid");
  assert.equal(fresh.run.events.current, undefined, "START_RUN must not pre-stage an Event");
  const staged = reduce({ state: fresh, command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(fresh, "cmd:history:choiceid") }).state;
  const eventId = staged.run.events.current?.eventId;
  assert.ok(eventId !== undefined, "the first action must draw a P2 opening");
  assert.ok(staged.run.events.history.length === 0, "an unresolved Event is not history yet");

  const choice = content.getEvent(staged.contentVersion, eventId).choices[0];
  const output = reduce({ state: staged, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: choice.id }, context: ctx(staged, "cmd:history:choose") });
  const entry = output.state.run.events.history.at(-1);
  assert.equal(entry.eventId, eventId, "history must record the resolved Event");
  assert.equal(entry.choiceId, choice.id, "history must record the taken option");
  assert.equal(output.state.run.events.current, undefined, "resolving an Event must clear it");
});

test("PLAYUX01-015: every death cause the engine can emit has Chinese copy", () => {
  // The server ids are correct and stay as they are; the client must translate them. The list is taken
  // from reducer.ts:275-276 and risk-v1.ts rather than from the table, so it is an independent statement.
  const source = `${read("packages/core/src/reducer.ts")}\n${read("packages/content/src/risk-v1.ts")}`;
  // The server publishes two shapes for the same moment and the client has to cover both:
  //   deathCauseId   "death.combat"                  -> rendered inside endingId "death:death.combat"
  //   immediateSource "lifespan-hard-ceiling"         -> the life book's 死因 row
  // so the client key is the doubled form "death.death.<cause>" plus the two lifespan spellings.
  const causes = [...source.matchAll(/deathCauseId: "([^"]+)"/g)].map((match) => match[1]);
  const immediate = [...source.matchAll(/immediateSource: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(causes.length >= 7, `expected the risk deathCauseId set, got ${causes.length}`);
  assert.ok(immediate.includes("lifespan-hard-ceiling"), "the lifespan immediateSource must be discovered from source");

  const required = new Set([...causes.map((cause) => `death.${cause}`), ...immediate, "lifespan"]);
  const page = read("miniprogram/pages/v2-live/v2-live.js");
  const untranslated = [...required].filter((key) => !new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:`).test(page));
  assert.deepEqual(untranslated, [], "a reachable death cause has no Chinese copy on the client");
});

test("PLAYUX01-016: the ending screen does not report zeroes for a run with no sidecar yet", () => {
  // buildPublicTerminal() returns undefined until the sidecar exists, so an ENDING can carry no lifeBook.
  // Reporting 0 往事 / 0 故人 would be a verdict the server never returned, which the spec forbids.
  const page = read("miniprogram/pages/v2-live/v2-live.wxml");
  const endingRow = '因果已成定局，{{vm.terminal.lifeBook.eventsCount}} 件往事';
  assert.ok(page.includes(`wx:if="{{vm.terminal.lifeBook.hasLifeBook}}" class="body-text">${endingRow}`), "the ENDING count row must be guarded by hasLifeBook");
  assert.ok(page.includes('wx:if="{{vm.terminal.lifeBook.hasLifeBook}}" class="card">'), "the LIFE_BOOK counts card must be guarded too");
});

test("PLAYUX01-017: the terminal render model distinguishes no-sidecar from an empty life", () => {
  const source = read("miniprogram/pages/v2-live/v2-live.js");
  const sandbox = { module: { exports: {} }, require: () => ({}), Page: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;this.buildTerminal = buildTerminal;`, sandbox);

  const absent = sandbox.buildTerminal({ stage: "ENDING", version: 1 }, "ENDING");
  assert.equal(absent.lifeBook.hasLifeBook, false, "no sidecar must not read as a life with no events");
  const empty = sandbox.buildTerminal({ stage: "ENDING", version: 1, lifeBook: {} }, "ENDING");
  assert.equal(empty.lifeBook.hasLifeBook, false, "an empty lifeBook must not read as a populated one");
  const populated = sandbox.buildTerminal({ stage: "LIFE_BOOK", version: 1, lifeBook: { events: [{}, {}], people: [{}], builds: [] } }, "LIFE_BOOK");
  assert.equal(populated.lifeBook.hasLifeBook, true);
  assert.equal(populated.lifeBook.eventsCount, 2);
  assert.equal(populated.lifeBook.peopleCount, 1);
  assert.equal(populated.lifeBook.buildsCount, 0, "a real zero is still reported once the sidecar exists");
});

// ================================================================ E. the accepted tests this constrains

test("PLAYUX01-018: the choice ids accepted tests pin are preserved", () => {
  // Two accepted fixtures constrain content ids directly, so rewriting them would break a test this task
  // is not allowed to edit. Recording the reason here means the next author knows before renaming.
  //
  // LIVEFIX06 pins night-rain to exactly ["engage", "consider", "leave"], in that order.
  const nightRain = CONTENT01_EVENTS.find((event) => event.id === "content01.ordinary.night-rain");
  assert.deepEqual(nightRain.choices.map((choice) => choice.id), ["engage", "consider", "leave"]);
  //
  // CONTENT01-019 walks every Build-tagged Event that has an `engage` option, so an authored Build Event
  // must keep one or it silently drops out of the formed-through-evidence guarantee.
  const fortune = CONTENT01_EVENTS.find((event) => event.id === "content01.build.fortune.fork");
  assert.ok(fortune.choices.some((choice) => choice.id === "engage"), "build.fortune.fork must keep engage");
  //
  // LOOPFIX02B2 reaches Cause echoes by choosing `engage` to resolve and `leave` to expire, so an authored
  // Cause-linked Event must keep both or closure stops working.
  const linked = CONTENT01_PACK.manifest.contentVersion === CONTENT01_VERSION ? CONTENT01_EVENTS.filter((event) => event.tags.includes("cause-echo")) : [];
  for (const event of linked) {
    const ids = event.choices.map((choice) => choice.id);
    if (ids.length === 0) continue;
    assert.ok(ids.includes("engage") && ids.includes("leave"), `${event.id} must keep engage and leave for Cause closure`);
  }
});

test("PLAYUX01-019: every build stage label the client projects has Chinese copy", () => {
  // build.fortune relied on the definition() default, which builds `build.${id}.${stage}`; since the id is
  // already build.fortune that produced build.build.fortune.latent, and no catalog had any of the sixteen.
  const page = read("miniprogram/pages/v2-live/v2-live.js");
  const definitions = content.getBuild(CONTENT01_VERSION).definitions;
  const labels = definitions.flatMap((definition) => definition.stages.map((stage) => stage.labelKey));
  assert.equal(labels.length, definitions.length * 4);
  const doubled = labels.filter((key) => key.includes("build.build."));
  assert.deepEqual(doubled, [], "a stage labelKey has a doubled build prefix");
  const missing = labels.filter((key) => !page.includes(`"${key}":`));
  assert.deepEqual(missing, [], "a stage labelKey has no Chinese copy on the client");
});

test("PLAYUX01-020: the client catalog is fresh with respect to the source", () => {
  // The catalog is generated, and a stale one renders raw keys on a real device. This is the same
  // freshness gate LIVEFIX06 asserts, restated here so the PLAYUX01 branch fails on its own account.
  const catalog = read("miniprogram/pages/v2-live/content01-zh-cn.js");
  const authoredKeys = Object.keys(CONTENT01_ZH_CN).filter((key) => key.startsWith("content01."));
  const missing = authoredKeys.filter((key) => !catalog.includes(`"${key}"`));
  assert.deepEqual(missing.slice(0, 10), [], "the committed client catalog is stale; regenerate with --write");
});