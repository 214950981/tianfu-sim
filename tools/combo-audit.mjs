import { runComboAudit } from "../packages/content/src/index.ts";

const result = runComboAudit();
if (result.theoreticalProfiles !== 13_824 || result.validProfiles < 10_000 || result.validRatio < 0.75 || result.determinismFailures !== 0 || result.hookConflicts !== 0) {
  console.error(JSON.stringify(result, null, 2)); process.exitCode = 1;
} else console.log(JSON.stringify(result, null, 2));
