import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_SIM_POLICIES, runContentSimulation } from "../packages/content/src/index.ts";

test("SIM02-001: maxActions is independent from event node count", () => {
  const report = runContentSimulation({ policies: ["cautious"], seedStart: 0, seedEndExclusive: 1, maxActions: 8 });
  const run = report.runTelemetry[0];
  assert.equal(run.actionCount, 8);
  assert.ok(run.nodeIndex > run.actionCount);
  assert.equal(run.endReason, "right_censored");
});

test("SIM02-002: fixed inputs produce identical compact telemetry", () => {
  const options = { policies: ["aggressive", "sword_seeking"], seedStart: 3, seedEndExclusive: 7, maxActions: 16 };
  assert.deepEqual(runContentSimulation(options), runContentSimulation(options));
});

test("SIM02-003: foundation-aware policy banks foundation before breakthrough", () => {
  const run = runContentSimulation({ policies: ["cautious"], seedStart: 0, seedEndExclusive: 1, maxActions: 30 }).runTelemetry[0];
  assert.ok(run.foundation.maxBps > 1_953);
  assert.ok(run.foundation.bankingActions > 0);
  assert.ok(run.breakthroughs.attempts > 0);
  assert.notEqual(run.realmEnd, "mortal");
});

test("SIM02-004: real breakthrough resolver produces attempts and failures without fabricated outcomes", () => {
  const report = runContentSimulation({ policies: ["cautious", "aggressive"], seedStart: 0, seedEndExclusive: 20, maxActions: 50 });
  assert.ok(report.breakthrough.attempts > 0);
  assert.ok(report.breakthrough.failures > 0);
  assert.ok(report.breakthrough.successes > 0);
  assert.equal(report.breakthrough.attempts, report.breakthrough.failures + report.breakthrough.successes);
});

test("SIM02-005: per-run telemetry is compact and contains no rule secrets", () => {
  const report = runContentSimulation({ policies: ["body_seeking"], seedStart: 9, seedEndExclusive: 10, maxActions: 12 });
  const run = report.runTelemetry[0];
  for (const key of ["actionCount", "nodeIndex", "endReason", "breakthroughs", "buildStages", "coreNpcEncounters", "causeTotals", "directorSlots", "riskByThreat"]) assert.ok(Object.hasOwn(run, key), key);
  const json = JSON.stringify(run);
  for (const secret of ["rootSeed", "drawIndex", "rngRoll", "difficulty", "EffectSpec", "selector weights"]) assert.equal(json.includes(secret), false, secret);
});

test("SIM02-006: aggregate report covers progression, systems, censoring and repetition", () => {
  const report = runContentSimulation({ runsPerPolicy: 2, maxActions: 12 });
  assert.equal(report.runs, CONTENT_SIM_POLICIES.length * 2);
  assert.equal(Object.values(report.endReasonDistribution).reduce((sum, value) => sum + value, 0), report.runs);
  assert.ok(Object.keys(report.buildStageDistribution).length >= 4);
  assert.deepEqual(Object.keys(report.directorSlotDistribution), ["P1", "P2", "P3", "P4", "P5", "P6"]);
  assert.equal(Object.keys(report.policyMetrics).length, CONTENT_SIM_POLICIES.length);
  assert.equal(Object.keys(report.causeByTemplate).length, 10);
  assert.equal(Object.keys(report.riskByThreat).length, 9);
  assert.equal(report.runtimeFailures, 0);
  assert.equal(report.deadlocks, 0);
});

test("SIM02-007: Cause eligibility includes instances immediately selected for echo", () => {
  const report = runContentSimulation({ policies: ["aggressive"], seedStart: 0, seedEndExclusive: 10, maxActions: 30 });
  assert.ok(report.causeEligibleCount > 0);
  assert.ok(report.causeEchoCount >= report.causeEligibleCount);
});

test("SIM02-008: policy and seed-range arguments select stable run ordering", () => {
  const report = runContentSimulation({ policies: ["fortune_seeking"], seedStart: 40, seedEndExclusive: 43, maxActions: 5 });
  assert.deepEqual(report.runTelemetry.map(({ policy, seed }) => [policy, seed]), [["fortune_seeking", 40], ["fortune_seeking", 41], ["fortune_seeking", 42]]);
});
