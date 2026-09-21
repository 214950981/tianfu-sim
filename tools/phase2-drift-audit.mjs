import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTaskContext } from "../.codex/context-lib.mjs";

const SPECS = {
  PROG01: {
    contracts: ["progression.ref", "state.ref", "command.ref", "event.ref"],
    checks: [["packages/core/src/progression.ts", ["aggregateProgressionModifiers", "applyRetreatProgression", "resolveBreakthrough"]], ["packages/content/src/progression-v1.ts", ["PROGRESSION_V1"]], ["packages/core/src/state.ts", ["cultivationBps", "realmFoundationBps", "innateProfile"]], ["packages/core/src/command.ts", ["ATTEMPT_BREAKTHROUGH"]], ["tests/progression.test.mjs", ["combo-audit", "replays to identical hash"]]]
  },
  RISK01: {
    contracts: ["risk.ref", "event.ref", "state.ref", "viewmodel.ref"],
    checks: [["packages/core/src/risk.ts", ["aggregateRiskModifiers", "resolveThreat", "buildRiskPresentation"]], ["packages/content/src/risk-v1.ts", ["RISK_V1"]], ["packages/core/src/state.ts", ["deathRecord", "risk"]], ["tests/risk.test.mjs", ["direct-death", "DeathRecord serializes"]]]
  },
  BUILD01: {
    contracts: ["build.ref", "event.ref", "state.ref", "viewmodel.ref", "progression.ref", "risk.ref"],
    checks: [["packages/core/src/build.ts", ["applyBuildEvidence", "activeBuildProgressionSources", "activeBuildRiskSources", "projectDirectorBuildSignals"]], ["packages/content/src/build-v1.ts", ["BUILD_V1"]], ["tests/build.test.mjs", ["build-audit", "custom fifth Build"]]]
  },
  NPC01: {
    contracts: ["npc.ref", "event.ref", "state.ref", "viewmodel.ref", "cause.ref"],
    checks: [["packages/core/src/npc.ts", ["spawnNpcFromArchetype", "causeActorAvailability", "npcAvailability"]], ["packages/content/src/npc-v1.ts", ["NPC_V1"]], ["packages/core/src/state.ts", ["roleIndex"]], ["tests/npc.test.mjs", ["knowledge", "Cause availability", "npc-audit"]]]
  },
  DIRECTOR01: {
    contracts: ["director.ref", "event.ref", "state.ref", "reducer.ref", "viewmodel.ref", "cause.ref", "build.ref", "npc.ref", "risk.ref"],
    checks: [["packages/core/src/director.ts", ["selectDirectorEvent", "scoreDirectorEvent", "director", "queryDirectorCandidates"]], ["packages/content/src/registry.ts", ["buildDirectorIndex", "queryDirectorCandidates"]], ["packages/core/src/reducer.ts", ["[\"P2\"]", "[\"P4\", \"P5\", \"P6\"]", "selectCauseEcho"]], ["tests/director.test.mjs", ["5000-event", "P3 Cause echo", "ViewModel does not expose"]]]
  }
};
const FORBIDDEN_SOURCE = ["Math.random(", "Date.now(", "eval(", "new Function", "wx.", "tt.", "fetch("];

export function runPhase2DriftAudit(repoRoot) {
  const tasks = [];
  for (const taskId of Object.keys(SPECS)) {
    const spec = SPECS[taskId]; const conflicts = []; let context;
    try { context = loadTaskContext(taskId, { repoRoot }); } catch (error) { conflicts.push({ contract: "context-loader", rule: "task and required contracts must load", implementationConflict: String(error.message) }); tasks.push({ taskId, status: "BLOCKED", loadedContracts: [], conflicts }); continue; }
    const loaded = context.loadedContracts.map((entry) => path.basename(entry.rel));
    for (const contract of spec.contracts) if (!loaded.includes(contract)) conflicts.push({ contract, rule: "required contract must be loaded", implementationConflict: "missing from task definition" });
    for (const [relative, tokens] of spec.checks) { const source = fs.readFileSync(path.join(repoRoot, relative), "utf8"); for (const token of tokens) if (!source.includes(token)) conflicts.push({ contract: path.basename(context.loadedContracts[0]?.rel ?? "unknown"), rule: `implementation/test evidence ${token}`, implementationConflict: `${relative} does not contain expected frozen semantic marker` }); for (const forbidden of FORBIDDEN_SOURCE) if (relative.includes("packages/core/") && source.includes(forbidden)) conflicts.push({ contract: "security-boundary", rule: "Core has no platform/clock/network/dynamic execution", implementationConflict: `${relative} contains ${forbidden}` }); }
    tasks.push({ taskId, status: conflicts.length === 0 ? "PASS" : "BLOCKED", loadedContracts: loaded, conflicts });
  }
  return { status: tasks.every((task) => task.status === "PASS") ? "PASS" : "BLOCKED", tasks };
}

const isCli = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) { const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); const report = runPhase2DriftAudit(repoRoot); console.log(JSON.stringify(report, null, 2)); if (report.status !== "PASS") process.exitCode = 3; }
