import { runNpcAudit } from "../packages/content/src/index.ts";

const report = runNpcAudit();
console.log(JSON.stringify(report, null, 2));
const failures = ["promotionViolations", "knowledgeLeakViolations", "causeAvailabilityViolations", "determinismFailures", "replayFailures", "securityViolations", "registryViolations", "relationViolations", "milestoneViolations", "fullNpcTickViolations"];
if (failures.some((key) => report[key] !== 0)) process.exitCode = 1;
