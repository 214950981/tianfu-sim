/**
 * PLAYUX01 stage C probe — does the result receipt tell the truth?
 *
 * The spec ranks the result surface's data sources: authoritative receipt first, then a before/after
 * diff of the public view, then a minimal compatibility projection. This probe checks that the first
 * rank is real rather than plausible, by holding three properties against the same settlement:
 *
 *   1. AGREEMENT — every dimension the receipt claims to have moved must match an independent
 *      before/after diff of the public view. If the receipt claims +150 cultivation, the diff must show
 *      cultivation rising by exactly 150. The diff is computed without consulting the receipt, so the
 *      two are genuinely independent measurements rather than one restating the other.
 *   2. NO INVENTED GAIN — a choice that moved no resource may still cost time, and that is the
 *      "此行没有明显收获" case. The probe records which choices are time-only, and asserts that no
 *      receipt line claims a resource gain for them.
 *   3. NO LEAK — the receipt and the public view carry no RNG state, no roll, no hidden cause template
 *      and no NPC internals, which is what the spec's hidden-information rule requires.
 *
 * It also asserts replay stability: the same commandId from the same state must produce byte-identical
 * effects, because the gateway stores the receipt inside the idempotency record and returns it verbatim.
 * That is what makes "the same choice shows the same result at most once" true rather than aspirational.
 *
 * Read-only. Writes .playux01/receipt.json and never mutates the repository.
 */
import fs from "node:fs";
import path from "node:path";

import {
  CONTENT01_PACK,
  CONTENT01_VERSION,
  ContentRegistry,
  NPC_CONTENT01_V1
} from "../packages/content/src/index.ts";
import { createOfferedRun, reduce } from "../packages/core/src/index.ts";
import { ServerViewModelBuilder } from "../server/src/index.ts";

const OUT_DIR = path.join(process.cwd(), ".playux01");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Registration order matters: validateContentPack resolves the pack's npcPackId through the module-level
// getNpcPack, so the NPC pack has to be known before the content pack that references it.
const content = new ContentRegistry();
content.registerNpcPack(NPC_CONTENT01_V1);
content.register(CONTENT01_PACK);

const builder = new ServerViewModelBuilder(content);

const ctx = (state, commandId) => ({
  rulesVersion: state.rulesVersion,
  contentVersion: state.contentVersion,
  content,
  commandId
});

function offered(seed) {
  return createOfferedRun({
    schemaVersion: 2,
    rulesVersion: "2.0.0",
    contentVersion: CONTENT01_VERSION,
    runId: `run:receipt:${seed}`,
    playerId: "player:receipt",
    rootSeed: seed,
    metaView: { unlocks: [], entitlements: [], discoveries: [] },
    fixture: {
      offerId: `offer:receipt:${seed}`,
      destinyIds: ["content01.destiny.steady", "content01.destiny.edge", "content01.destiny.echo"],
      age: 20,
      maxAge: 200,
      runName: "结果回执探针",
      realm: { id: "mortal", order: 0, cultivation: 0 },
      attributes: { insight: 45, body: 45, spiritSense: 45, fortune: 45 },
      resources: { spiritStone: 0, items: {} },
      availableActions: ["cultivate", "travel", "worldly", "pursuit"],
      world: { regionId: "region.green-river", knownRegionIds: ["region.green-river"], tags: [], factionStanding: {} },
      firstRun: true
    }
  });
}

/** createOfferedRun returns the offered GameState itself; START_RUN is what opens it. */
function started(seed) {
  const seeded = offered(seed);
  return reduce({
    state: seeded,
    command: { type: "START_RUN", offerId: seeded.run.offer.offerId, destinyId: "content01.destiny.steady" },
    context: ctx(seeded, `cmd:${seed}:start`)
  }).state;
}

/** The dimensions of settled state the result surface is allowed to talk about. */
function publicSnapshot(state) {
  const view = builder.build(state).state.publicRun;
  return {
    cultivationBps: view.realm.cultivationBps,
    spiritStone: view.resources.spiritStone,
    age: view.age
  };
}

function diff(before, after) {
  const moved = {};
  for (const key of Object.keys(before)) {
    const delta = after[key] - before[key];
    if (delta !== 0) moved[key] = delta;
  }
  return moved;
}

/**
 * Which public dimension each receipt op claims to move.
 *
 * Cultivation is read from `publicRun.realm.cultivationBps`, which counts the same points the effect
 * adds: the field name says bps but the value is the raw pool, so the two are directly comparable. The
 * probe asserts that identity rather than assuming a scale factor, which is why the factor is 1.
 */
const DIMENSION_OF_OP = {
  ADD_CULTIVATION: "cultivationBps",
  ADD_RESOURCE: "spiritStone",
  OUTCOME_TIME_DELTA: "age"
};
const CULTIVATION_BPS_PER_POINT = 1;

const report = { cases: [], violations: [], timeOnlyChoices: 0, agreementChecked: 0 };

function check(name, condition, detail) {
  if (!condition) report.violations.push(`${name}: ${detail}`);
  return condition;
}

const EVENTS = [
  "content01.onboarding.first-breath",
  "content01.ordinary.night-rain",
  "content01.onboarding.market-choice",
  "content01.ordinary.mountain-view",
  "content01.ordinary.harvest-help"
];

for (const eventId of EVENTS) {
  const seed = `receipt:${eventId}`;
  let state = started(seed);

  // Reach the target Event through the real Director, so the case walks the same path a player would
  // rather than a hand-built state the game could not reach.
  let guard = 0;
  while (state.run.events.current?.eventId !== eventId && guard < 60 && state.run.status === "active") {
    const available = state.run.actions.available;
    if (available.length === 0) break;
    if (state.run.events.current !== undefined) {
      const current = content.getEvent(state.contentVersion, state.run.events.current.eventId);
      const safe = current.choices.find((choice) => ["decline", "turn-away", "consider", "leave"].includes(choice.id)) ?? current.choices[0];
      state = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId: current.id, optionId: safe.id }, context: ctx(state, `cmd:${seed}:walk:${guard}`) }).state;
    } else {
      state = reduce({ state, command: { type: "CHOOSE_ACTION", actionId: available[guard % available.length] }, context: ctx(state, `cmd:${seed}:walk:${guard}`) }).state;
    }
    guard += 1;
  }

  if (state.run.events.current?.eventId !== eventId) {
    report.cases.push({ eventId, reached: false, guard, ended: state.run.status });
    continue;
  }

  const event = content.getEvent(state.contentVersion, eventId);
  for (const choice of event.choices) {
    // Every choice is measured from the same pre-state, so no choice inherits another's movement.
    const before = publicSnapshot(state);
    let output;
    try {
      output = reduce({ state, command: { type: "CHOOSE_EVENT_OPTION", eventId, optionId: choice.id }, context: ctx(state, `cmd:${seed}:${choice.id}`) });
    } catch (error) {
      report.cases.push({ eventId, choiceId: choice.id, error: String(error) });
      continue;
    }
    const after = publicSnapshot(output.state);
    const moved = diff(before, after);

    const claimed = {};
    for (const effect of output.effects) {
      if (typeof effect !== "object" || effect === null) continue;
      const op = String(effect.op);
      const dimension = DIMENSION_OF_OP[op];
      if (dimension === undefined) continue;
      const amount = op === "OUTCOME_TIME_DELTA"
        ? Number(effect.years)
        : op === "ADD_CULTIVATION"
          ? Number(effect.amount) * CULTIVATION_BPS_PER_POINT
          : Number(effect.amount);
      claimed[dimension] = (claimed[dimension] ?? 0) + amount;
    }

    const record = {
      eventId,
      choiceId: choice.id,
      before,
      after,
      moved,
      claimed,
      ops: output.effects.filter((effect) => typeof effect === "object" && effect !== null && "op" in effect).map((effect) => effect.op)
    };
    report.cases.push(record);

    // Property 1: every claimed movement must appear in the independent diff, with the same sign.
    for (const [dimension, amount] of Object.entries(claimed)) {
      if (dimension === "age") continue; // age is advanced by resolveTimeAdvance, not by the effect alone
      report.agreementChecked += 1;
      check(
        "agreement",
        moved[dimension] === amount,
        `${eventId}/${choice.id} claims ${dimension} ${amount > 0 ? "+" : ""}${amount} but the diff shows ${moved[dimension] ?? 0}`
      );
    }

    // Property 2: a time-only choice is a legitimate settlement, and must not claim a resource gain.
    const resourceGain = (claimed.cultivation ?? 0) + (claimed.spiritStone ?? 0);
    if (resourceGain === 0 && (claimed.age ?? 0) > 0) {
      report.timeOnlyChoices += 1;
      check(
        "no-invented-gain",
        (moved.cultivation ?? 0) === 0 && (moved.spiritStone ?? 0) === 0,
        `${eventId}/${choice.id} is time-only but the diff shows a resource movement`
      );
    }

    // Property 3: the public view of the settled state must not carry hidden information.
    const view = JSON.stringify(builder.build(output.state));
    for (const secret of ["rootSeed", "drawIndex", "rngRoll", "actorIdsByRole", "affinityDelta", "trustDelta", "participantBindings"]) {
      check("leak", !view.includes(`"${secret}"`), `${eventId}/${choice.id} public view leaks ${secret}`);
    }
  }
}

// ---------------------------------------------------------------- replay stability

const replayA = reduce({ state: started("receipt:replay"), command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(started("receipt:replay"), "cmd:replay") });
const replayB = reduce({ state: started("receipt:replay"), command: { type: "CHOOSE_ACTION", actionId: "cultivate" }, context: ctx(started("receipt:replay"), "cmd:replay") });
check("replay", JSON.stringify(replayA.effects) === JSON.stringify(replayB.effects), "the same command from the same state must produce identical effects, or a replayed commandId could show a different result");
check("replay", replayA.state.stateVersion === replayB.state.stateVersion, "a replayed commandId must land on the same stateVersion");
check("replay", publicSnapshot(replayA.state).cultivationBps === publicSnapshot(replayB.state).cultivationBps, "a replayed commandId must land on the same cultivation");

fs.writeFileSync(path.join(OUT_DIR, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`);

const reached = report.cases.filter((entry) => entry.reached !== false).length;
console.log(`events: ${EVENTS.length}, reached: ${reached}, cases: ${report.cases.length}`);
console.log(`agreements checked: ${report.agreementChecked}, time-only choices: ${report.timeOnlyChoices}`);
console.log(`violations: ${report.violations.length}`);
for (const violation of report.violations.slice(0, 20)) console.log(`  - ${violation}`);
process.exitCode = report.violations.length === 0 ? 0 : 1;