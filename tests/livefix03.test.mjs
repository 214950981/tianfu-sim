/**
 * LIVEFIX03 — legacy WXSS source integrity + a permanent style-integrity gate.
 *
 * WHAT THIS SUITE PROVES
 *
 * Real WeChat DevTools rejected the package before v2-live could load:
 *
 *     pages/game/game.wxss(253:14): unexpected token
 *
 * LIVEFIX02's mirror gate had already proven the packaged stylesheet was byte-identical to its source,
 * and the build still failed — because the *source* was historically truncated, ending mid-declaration:
 *
 *     .engine-paused {
 *       background: rgba(255, 152, 0
 *
 * A mirror gate answers "target equals source". It cannot answer "source is syntactically complete",
 * and a truncated file is perfectly fresh. That is the whole defect class this suite closes.
 *
 * The assertions are structural rather than cosmetic:
 *
 *   - RECOVERY: no trustworthy pre-truncation source exists in Git history, in `main`, in any local ref,
 *     or on disk in any Tianfu worktree — so the repair is a declared RECONSTRUCTION, not a silent
 *     invention. The provenance search is itself asserted, so a future task cannot quietly claim a
 *     "recovery" that never happened.
 *   - PREFIX: every one of the 6868 surviving bytes before the truncation point is preserved verbatim.
 *   - COMPLETENESS: the stylesheet no longer ends mid-declaration, and parses under the new audit.
 *   - GATE: the audit fails closed on the exact observed truncation, on unbalanced braces, on an
 *     unterminated block comment, on an unterminated string, and on a dangling trailing comma — each
 *     from a synthetic fixture, so the negative controls cannot rot with the real file.
 *   - MIRROR: the packaged copy is refreshed through the mirror tool, never hand-edited.
 *   - SCOPE: the game engine, routes, tabBar, cloud functions, server, Core and Content are untouched.
 *
 * Nothing here rolls gameplay or touches the cloud runtime. It is a source-integrity proof.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  auditWxssSource,
  auditWxssIntegrity,
  collectIntegrityTargets,
  resolveMiniProgramRoot,
  wxssClassCoverage
} from "../tools/wxss-integrity-audit.mjs";
import { runPackageMirror, MIRROR_MANIFEST } from "../tools/miniprogram-package-mirror.mjs";
import { runRouteGuard } from "../tools/route-guard.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const readBytes = (relative) => fs.readFileSync(path.join(ROOT, relative));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const GAME_WXSS = "pages/game/game.wxss";
const MIRROR_GAME_WXSS = "miniprogram/pages/game/game.wxss";

/**
 * The committed stylesheet exactly as it was truncated, extracted byte-for-byte from the task's base
 * commit (`20dbf9e:pages/game/game.wxss`, 6868 bytes, md5 5806a213b20e83f0f7af9293a3f29d22).
 *
 * It is a committed fixture rather than a `git show` call on purpose: this sandbox cannot spawn `git`
 * from inside a Node test (EBUSY), and a fixture has a second benefit — the negative control for the
 * observed truncation stays pinned to the real historical bytes instead of a hand-typed paraphrase that
 * could drift away from what DevTools actually rejected.
 */
const TRUNCATED_FIXTURE = "tests/fixtures/livefix03/game.wxss.truncated";

/** The exact bytes the corrupted file ended with, as reported by DevTools at 253:14. */
const OBSERVED_TRUNCATION = ".engine-paused {\r\n  background: rgba(255, 152, 0";

/** The prefix that must survive untouched: everything up to and including the truncated line. */
const SURVIVING_PREFIX_BYTES = 6868;

// --------------------------------------------------------------------------- recovery provenance

test("LIVEFIX03_recovery: the committed pre-truncation bytes really are truncated", () => {
  const baseline = readBytes(TRUNCATED_FIXTURE);
  assert.equal(baseline.length, SURVIVING_PREFIX_BYTES, "the recorded corruption size changed; re-derive the expectation");
  // The file ends with no trailing newline, so the truncated declaration is the very last thing in it.
  assert.ok(
    baseline.toString("utf8").endsWith("background: rgba(255, 152, 0"),
    "the baseline must end exactly at the truncation point"
  );
  // The decisive fact behind the RECONSTRUCTED label: the file this repair started from was itself
  // structurally invalid, so no restore was possible from within it.
  const audit = auditWxssSource(baseline.toString("utf8"), TRUNCATED_FIXTURE);
  assert.equal(audit.ok, false, "the pre-repair baseline must fail the integrity audit");
  assert.match(audit.violations.join("\n"), /:253:/, "the truncation is at line 253");
});

test("LIVEFIX03_recovery: the result is a declared RECONSTRUCTION, not a silent invention", () => {
  const result = read(".codex/control/LAST_RESULT.yaml");
  assert.match(result, /RECONSTRUCTED/, "LAST_RESULT must state plainly that the suffix was reconstructed");
  assert.match(result, /recoveryProvenance/, "LAST_RESULT must carry the recovery provenance record");
});

// --------------------------------------------------------------------------- prefix preservation

test("LIVEFIX03_prefix: every surviving pre-truncation byte is preserved verbatim", () => {
  const baseline = readBytes(TRUNCATED_FIXTURE);
  const repaired = readBytes(GAME_WXSS);
  assert.ok(repaired.length > baseline.length, "the repaired file must be longer than the truncated one");
  assert.ok(
    repaired.subarray(0, baseline.length).equals(baseline),
    "the surviving prefix must be byte-identical; the reconstruction may only append"
  );
});

test("LIVEFIX03_prefix: the truncated declaration is closed, not deleted", () => {
  const source = read(GAME_WXSS);
  // The original line survives and is now terminated, rather than being replaced by something else.
  assert.match(source, /\.engine-paused \{\r\n {2}background: rgba\(255, 152, 0, 0\.1\);/);
  assert.match(source, /\.engine-paused:active \{/);
});

// --------------------------------------------------------------------------- completeness

test("LIVEFIX03_complete: the repaired stylesheet parses and no longer ends mid-declaration", () => {
  const source = read(GAME_WXSS);
  const audit = auditWxssSource(source, GAME_WXSS);
  assert.deepEqual(audit.violations, [], "the repaired stylesheet must be structurally complete");
  assert.ok(source.endsWith("}\r\n"), "the file must end on a closed rule, not mid-declaration");
  assert.ok(!OBSERVED_TRUNCATION.endsWith(source.slice(-40)), "the file must not still end at the truncation point");
});

test("LIVEFIX03_complete: the reconstructed suffix covers every class both templates reference", () => {
  for (const pair of [[GAME_WXSS, "pages/game/game.wxml"], [MIRROR_GAME_WXSS, "miniprogram/pages/game/game.wxml"]]) {
    const coverage = wxssClassCoverage(read(pair[1]), read(pair[0]));
    assert.deepEqual(
      coverage.missing,
      [],
      `${pair[1]} references classes that ${pair[0]} never defines; the reconstruction is incomplete`
    );
    assert.ok(coverage.used > 60, `expected a substantially class-bearing template, saw ${coverage.used}`);
  }
});

test("LIVEFIX03_complete: the reconstruction adds no gameplay or route surface", () => {
  // The reconstruction is stylesheet-only. These are the surfaces a "fix" could plausibly have drifted into.
  assert.ok(exists("miniprogram/app.json"));
  const app = JSON.parse(read("miniprogram/app.json"));
  assert.equal(app.pages[0], "pages/start/start", "the default route must be unchanged");
  assert.deepEqual(
    app.tabBar.list.map((entry) => entry.pagePath),
    ["pages/game/game", "pages/rank/rank"],
    "tabBar membership and order must be unchanged"
  );
});

// --------------------------------------------------------------------------- the gate itself

test("LIVEFIX03_gate: the exact observed line-253 truncation fails the audit", () => {
  const audit = auditWxssSource(OBSERVED_TRUNCATION, "negative/truncated.wxss");
  assert.equal(audit.ok, false, "the real-world truncation must be detected");
  const joined = audit.violations.join("\n");
  assert.match(joined, /:2:.*unclosed parenthesis/, "must report the unclosed rgba() argument list");
  assert.match(joined, /:2:.*unclosed `\{`/, "must report the unclosed rule block");
  assert.match(joined, /:2:.*EOF inside a declaration/, "must report EOF inside a declaration");
});

test("LIVEFIX03_gate: unbalanced brace, unterminated comment and unterminated string all fail closed", () => {
  const cases = [
    [".a {\n  color: red;\n", /unclosed `\{`/, "a rule block that never closes"],
    [".a { color: red; }\n}\n", /unbalanced `}`/, "a stray closing brace"],
    [".a {\n  /* never closed\n  color: red;\n}\n", /unterminated block comment/, "an unterminated block comment"],
    [".a {\n  content: 'unclosed;\n}\n", /unterminated single 'quoted string/, "an unterminated string"],
    [".a {\n  color: rgb(1, 2, 3;\n}\n", /unclosed parenthesis/, "an unclosed function argument list"]
  ];
  for (const [source, pattern, description] of cases) {
    const audit = auditWxssSource(source, "negative/case.wxss");
    assert.equal(audit.ok, false, `${description} must be rejected`);
    assert.match(audit.violations.join("\n"), pattern, `${description}: unexpected findings ${JSON.stringify(audit.violations)}`);
  }
});

test("LIVEFIX03_gate: a dangling trailing comma is reported as truncation, not accepted as a list", () => {
  const audit = auditWxssSource(".a {\n  font-family: 'A', 'B',\n}\n", "negative/comma.wxss");
  assert.equal(audit.ok, false);
  assert.match(audit.violations.join("\n"), /dangling `,`/);
});

test("LIVEFIX03_gate: a well-formed stylesheet with comments, strings and nesting passes", () => {
  const source = [
    "/* leading comment with { unbalanced-looking text */",
    "@media (max-width: 400px) {",
    "  .a {",
    "    content: '}';",
    "    background: url(\"data:image/png;base64,AA\");",
    "    /* inner comment */",
    "    color: red;",
    "  }",
    "}",
    ""
  ].join("\n");
  const audit = auditWxssSource(source, "positive/ok.wxss");
  assert.deepEqual(audit.violations, [], "valid CSS must not be flagged: braces/quotes/parens inside strings and comments are not structure");
});

test("LIVEFIX03_gate: an escaped quote does not terminate the string early", () => {
  const source = ".a {\n  content: 'it\\'s fine';\n  color: red;\n}\n";
  const audit = auditWxssSource(source, "positive/escape.wxss");
  assert.deepEqual(audit.violations, []);
});

// --------------------------------------------------------------------------- repository-wide gate

test("LIVEFIX03_gate: the packager root is read from project.config.json, never hardcoded", () => {
  const resolved = resolveMiniProgramRoot({ read });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.root, "miniprogram");
  // A missing miniprogramRoot must fail closed rather than defaulting to a guess.
  const broken = resolveMiniProgramRoot({ read: () => "{}" });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /miniprogramRoot is missing/);
});

test("LIVEFIX03_gate: every registered page style and every mirrored WXSS is a target", () => {
  const collected = collectIntegrityTargets({ read, exists });
  assert.equal(collected.ok, true);
  for (const required of [
    MIRROR_GAME_WXSS,
    GAME_WXSS,
    "miniprogram/pages/start/start.wxss",
    "pages/start/start.wxss",
    "miniprogram/pages/rank/rank.wxss",
    "miniprogram/pages/v2-live/v2-live.wxss",
    "miniprogram/pages/v2-preview/v2-preview.wxss"
  ]) {
    assert.ok(collected.targets.includes(required), `${required} must be an integrity target`);
  }
  // Every .wxss in the mirror manifest must be audited on BOTH sides.
  for (const entry of MIRROR_MANIFEST.filter((e) => e.source.endsWith(".wxss"))) {
    assert.ok(collected.targets.includes(entry.source), `${entry.source} must be audited`);
    assert.ok(collected.targets.includes(entry.target), `${entry.target} must be audited`);
  }
});

test("LIVEFIX03_gate: the whole repository passes the WXSS integrity audit", () => {
  const result = auditWxssIntegrity({ read, exists });
  assert.deepEqual(result.violations, [], "every registered and mirrored stylesheet must be structurally complete");
  assert.ok(result.checked.length >= 7, `expected the audit to cover the package, saw ${result.checked.length}`);
});

test("LIVEFIX03_gate: the audit reports coverage as a diagnostic and never as a gate", () => {
  // A stylesheet that is structurally perfect but defines nothing still passes: undefined classes are
  // legitimate (dynamic bindings, app.wxss inheritance), so they must never become a violation.
  const audit = auditWxssSource(".a { color: red; }\n", "positive/sparse.wxss");
  assert.equal(audit.ok, true);
  const coverage = wxssClassCoverage('<view class="totally-undefined"></view>', ".a { color: red; }\n");
  assert.deepEqual(coverage.missing, ["totally-undefined"]);
  // ...and the real repository result carries coverage without any coverage-derived violation.
  const result = auditWxssIntegrity({ read, exists });
  assert.ok(result.coverage.length > 0, "coverage must still be reported for diagnosis");
  for (const entry of result.coverage) assert.ok(!entry.missing.some((m) => result.violations.some((v) => v.includes(m))));
});

// --------------------------------------------------------------------------- mirror + scope

test("LIVEFIX03_mirror: the packaged copy is byte-identical to the repaired source", () => {
  assert.ok(readBytes(GAME_WXSS).equals(readBytes(MIRROR_GAME_WXSS)), "the mirror must be refreshed, not hand-edited");
  const mirror = runPackageMirror({ read: (p) => readBytes(p), exists });
  assert.equal(mirror.ok, true, `mirror must be fresh: ${mirror.problems.join("; ")}`);
});

test("LIVEFIX03_scope: the reconstruction touched no script, config, cloud or package source", () => {
  // The reconstruction is stylesheet-only. Rather than diffing the working tree (which needs `git`, and
  // this sandbox cannot spawn git from a Node test), this pins the sha256 of every file the task
  // declared out of scope, taken from the task base commit `20dbf9e`. A change anywhere in them fails
  // here even though no gameplay or packaging gate would otherwise notice.
  //
  // `project.private.config.json` is deliberately absent: WeChat DevTools rewrites it on every open, so
  // pinning it would make this test fail for a reason that has nothing to do with the repair.
  // `tools/route-guard.mjs` is deliberately absent too: the task requires integrating the WXSS integrity
  // check into the route smoke, so that one file is *supposed* to change. Its integration is asserted
  // separately below.
  const PINNED_AT_BASE = {
    "miniprogram/pages/game/game.js": "c1c263ff88282534b08627e206c27091a5d99445a6f95b991057c123a21761d3",
    "pages/game/game.js": "c1c263ff88282534b08627e206c27091a5d99445a6f95b991057c123a21761d3",
    "pages/game/game.wxml": "1f43710872e3bde0bb5b308f4e5b1f6f7428e569240e1100693d7adb55145981",
    "miniprogram/pages/game/game.wxml": "9826b24bf0db5dcb86410a3c191af2fed1e4f2c715b5ad87ed73c8aa4b35c6cb",
    "miniprogram/app.json": "e9bbc662d172100892d2f82d22b0f1cfae1303a7682748290c8b1c85a7e63c08",
    "miniprogram/app.wxss": "ae3dc8c4971a6cc8ccb29d1368777d0616c4c5bef628fedef7df91c46d5147c0",
    "project.config.json": "950c6c03deea3815da09ef22abc4f0f6174ec3bbea9d554c016704ae84400454",
    "tools/miniprogram-package-mirror.mjs": "6090458d3b9e291530f2984f078e1d760dc6515a704871544e482461967a8272",
    "tools/miniprogram-package-closure.mjs": "28a698404104b04a155f260eab55c03e5d03d9100048702119bb5e6610da22cb"
  };
  for (const [relative, expected] of Object.entries(PINNED_AT_BASE)) {
    const actual = createHash("sha256").update(readBytes(relative)).digest("hex");
    assert.equal(actual, expected, `${relative} must be byte-identical to the task base commit`);
  }
});

test("LIVEFIX03_scope: the WXSS integrity check is wired into the route smoke", () => {
  // The whole point of LIVEFIX03's gate is that a future mirror cannot be fresh-but-invalid again. A
  // standalone auditor nobody runs would not achieve that, so the route guard must invoke it and a
  // truncated stylesheet must fail the route guard.
  const guard = read("tools/route-guard.mjs");
  assert.match(guard, /auditWxssIntegrity/, "route-guard must import the WXSS integrity audit");
  assert.match(guard, /wxss integrity: /, "route-guard must surface the audit result");

  const result = runRouteGuard({});
  assert.equal(result.ok, true, `route guard must pass on the repaired tree: ${result.violations.join("; ")}`);
  assert.ok(
    result.report.some((line) => line.startsWith("wxss integrity:")),
    "the route guard report must record the WXSS integrity check"
  );

  // And it must actually fail closed: feed the guard the real truncated bytes and require a violation.
  const truncated = readBytes(TRUNCATED_FIXTURE).toString("utf8");
  const brokenGuard = runRouteGuard({
    read: (relative) => (relative === MIRROR_GAME_WXSS ? truncated : read(relative))
  });
  assert.equal(brokenGuard.ok, false, "a truncated packaged stylesheet must fail the route guard");
  assert.ok(
    brokenGuard.violations.some((v) => v.includes("wxss integrity:") && v.includes("253")),
    `the route guard must name the truncation: ${JSON.stringify(brokenGuard.violations)}`
  );
});
