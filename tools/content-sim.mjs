import { runContentSimulation } from "../packages/content/src/index.ts";

const report = runContentSimulation();
console.log(JSON.stringify(report, null, 2));
if (report.runs !== 600 || report.runtimeFailures !== 0 || report.deadlocks !== 0 || report.AIcalls !== 0 || report.repeatViolations !== 0 || report.uniqueEventsSeen < 40) process.exitCode = 1;
