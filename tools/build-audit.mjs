import { runBuildAudit } from "../packages/content/src/build-audit.ts";

const result = runBuildAudit();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.invalidDefinitions || result.cycleViolations || result.hookConflicts || result.shortLifeFailures || result.longLifeFailures || result.determinismFailures || result.replayFailures || result.securityViolations) process.exitCode = 1;
