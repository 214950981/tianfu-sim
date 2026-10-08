/**
 * PLAYUX01 stage D probe — does the terminal screen speak the player's language?
 *
 * The spec asks that the life book and the ending screens be readable and honest. Three defects were
 * reproduced in stage A, and this probe checks each against the real client rendering path rather than
 * against the server payload, because that is where all three lived:
 *
 *   1. RAW DEATH CAUSE — the server publishes `immediateSource: "lifespan-hard-ceiling"`, and the client
 *      printed it verbatim. The server id is correct and must not change; the client must translate it.
 *   2. FABRICATED 0/0/0 — buildPublicTerminal() returns undefined until the sidecar exists, so an ENDING
 *      can carry no life book. Rendering "0 往事 / 0 故人 / 0 道途" then states as fact that a life
 *      achieved nothing, which is a verdict the server never returned. The counts must stay hidden.
 *   3. SILENT FALLBACK — an id missing from the translation table must still surface, because a blank
 *      row hides a catalog gap while a raw id makes it visible.
 *
 * It also renders a matrix of endings and death causes, including ones the engine cannot currently emit,
 * to prove the table is complete for the reachable set and that an unreachable id degrades honestly.
 *
 * Read-only. Loads the real page module in a vm with a `Page` stub, exactly as tests/livefix06 does.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const PAGE_PATH = "miniprogram/pages/v2-live/v2-live.js";
const PAGE_WXML = "miniprogram/pages/v2-live/v2-live.wxml";

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const report = { cases: [], violations: [] };

function check(name, condition, detail) {
  if (!condition) report.violations.push(`${name}: ${detail}`);
  return condition;
}

/**
 * Evaluates the real page and returns its module-level bindings.
 *
 * `presentLabel` and the label tables are module-level bindings rather than exports, so they are read
 * back out of the same context. Only presentation helpers are exercised; the catalog is pure and
 * stubbing the controller would test nothing.
 */
function loadPage(source = read(PAGE_PATH)) {
  const sandbox = { module: { exports: {} }, require: () => ({}) };
  const page = { module: { exports: {} }, require: () => ({}), Page: () => {} };
  page.exports = page.module.exports;
  vm.createContext(page);
  vm.runInContext(source, page, { filename: PAGE_PATH });

  // buildTerminal lives in the render-model region, so the whole module is evaluated here rather than a
  // prefix slice. The Page stub absorbs the module's `Page({...})` call at the end.
  const probe = { module: { exports: {} }, require: () => ({}), Page: () => {} };
  vm.createContext(probe);
  vm.runInContext(`${source}\n;this.TERMINAL_LABELS = TERMINAL_LABELS;\nthis.buildTerminal = buildTerminal;`, probe);
  return { TERMINAL_LABELS: probe.TERMINAL_LABELS, buildTerminal: probe.buildTerminal, presentLabel: probe.presentLabel };
}

const { TERMINAL_LABELS, buildTerminal } = loadPage();

// ---------------------------------------------------------------- 1. every reachable id is translated

// Taken from reducer.ts:275-276 and risk-v1.ts:48-56, not from the table, so this list is an
// independent statement of what the engine can emit.
const REACHABLE_IDS = [
  "lifespan",
  "lifespan-hard-ceiling",
  "death.death.lifespan",
  "death.death.combat",
  "death.death.injury",
  "death.death.exploration",
  "death.death.poison",
  "death.death.curse",
  "death.death.cause",
  "death.death.special"
];

for (const id of REACHABLE_IDS) {
  const zh = TERMINAL_LABELS[id];
  check("death-cause", typeof zh === "string" && zh.length > 0, `${id} has no Chinese copy`);
  check("death-cause", /[\u4e00-\u9fff]/.test(String(zh)), `${id} => ${JSON.stringify(zh)} is not Chinese`);
  report.cases.push({ id, zh });
}

// ---------------------------------------------------------------- 2. the real terminal slice renders Chinese

// This is the shape tools/playux01-ending-probe.mjs observed from the server: pageState ENDING with a
// terminal object whose lifeBook carries a death record but no ending.
const rendered = buildTerminal(
  {
    stage: "ENDING",
    version: 1,
    lifeBook: {
      runName: "无名",
      age: 26,
      maxAge: 200,
      realm: { id: "mortal" },
      events: [],
      people: [],
      builds: [],
      causes: [],
      death: { directCause: "lifespan-hard-ceiling" }
    }
  },
  "ENDING"
);

check("render", rendered !== null, "a terminal slice must project");
check(
  "death-cause",
  rendered.lifeBook.deathCause === "寿元已尽",
  `the 死因 row rendered ${JSON.stringify(rendered.lifeBook.deathCause)} instead of Chinese`
);
check("death-cause", !rendered.lifeBook.deathCause.includes("lifespan"), "a raw server id reached the screen");
report.cases.push({ renderedDeathCause: rendered.lifeBook.deathCause });

// ---------------------------------------------------------------- 3. no life book means no 0/0/0 verdict

const noSidecar = buildTerminal({ stage: "ENDING", version: 1 }, "ENDING");
check("no-fabricated-counts", noSidecar !== null, "the terminal stage still needs a render model");
check(
  "no-fabricated-counts",
  noSidecar.lifeBook.hasLifeBook === false,
  "a terminal with no lifeBook must report hasLifeBook false, or the counts render as zeroes"
);

const emptySidecar = buildTerminal({ stage: "ENDING", version: 1, lifeBook: {} }, "ENDING");
check(
  "no-fabricated-counts",
  emptySidecar.lifeBook.hasLifeBook === false,
  "an empty lifeBook must not be mistaken for a life with no events"
);

// and the counts are still real when the sidecar actually carries them
const populated = buildTerminal(
  {
    stage: "LIFE_BOOK",
    version: 1,
    lifeBook: {
      runName: "无名",
      age: 26,
      maxAge: 200,
      realm: { id: "mortal" },
      events: [{}, {}, {}],
      people: [{}],
      builds: [{}, {}],
      causes: [{}]
    }
  },
  "LIFE_BOOK"
);
check("no-fabricated-counts", populated.lifeBook.hasLifeBook === true, "a populated lifeBook must report true");
check("no-fabricated-counts", populated.lifeBook.eventsCount === 3, `eventsCount is ${populated.lifeBook.eventsCount}, expected 3`);
check("no-fabricated-counts", populated.lifeBook.peopleCount === 1, `peopleCount is ${populated.lifeBook.peopleCount}, expected 1`);
check("no-fabricated-counts", populated.lifeBook.buildsCount === 2, `buildsCount is ${populated.lifeBook.buildsCount}, expected 2`);

// ---------------------------------------------------------------- 4. an unknown id still surfaces

const unknown = buildTerminal(
  { stage: "ENDING", version: 1, lifeBook: { death: { directCause: "death.death.not-yet-authored" } } },
  "ENDING"
);
check(
  "silent-fallback",
  unknown.lifeBook.deathCause === "death.death.not-yet-authored",
  "an untranslated id must fall through to the raw id; a blank row would hide the catalog gap"
);

// ---------------------------------------------------------------- 5. the WXML guards match the model

const wxml = read(PAGE_WXML);
const endingCountRow = '因果已成定局，{{vm.terminal.lifeBook.eventsCount}} 件往事';
check("wxml", wxml.includes(`wx:if="{{vm.terminal.lifeBook.hasLifeBook}}" class="body-text">${endingCountRow}`), "the ENDING count row must be guarded by hasLifeBook, or it renders 0/0/0");
check("wxml", wxml.includes('wx:if="{{vm.terminal.lifeBook.hasLifeBook}}" class="card">'), "the LIFE_BOOK counts card must be guarded by hasLifeBook too");

// the NEXT_LIFE copy bug: the sentence had an unbalanced full-width paren and read as broken text
const nextLifeBody = wxml.match(/此生已入卷宗[^<]*/);
check("wxml", nextLifeBody !== null, "the NEXT_LIFE body copy must exist");
if (nextLifeBody !== null) {
  const copy = nextLifeBody[0];
  const opens = (copy.match(/（/g) ?? []).length;
  const closes = (copy.match(/）/g) ?? []).length;
  check("wxml", opens === closes, `the NEXT_LIFE copy has unbalanced full-width parens: ${copy}`);
  check("wxml", !/（[^）]*$/.test(copy), `the NEXT_LIFE copy ends inside an unclosed paren: ${copy}`);
}

fs.writeFileSync(path.join(ROOT, ".playux01", "terminal.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`cases: ${report.cases.length}`);
console.log(`violations: ${report.violations.length}`);
for (const violation of report.violations) console.log(`  - ${violation}`);
process.exitCode = report.violations.length === 0 ? 0 : 1;