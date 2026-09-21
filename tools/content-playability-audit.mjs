import { CONTENT01_PACK, NPC_CONTENT01_V1, runContentPlayabilityAudit } from "../packages/content/src/index.ts";

const report = runContentPlayabilityAudit(CONTENT01_PACK, NPC_CONTENT01_V1);
console.log(JSON.stringify(report, null, 2));
const hard = ["unknownTags", "invalidReferences", "unreachableDefinitions", "duplicateTitles", "duplicateBodies", "invalidChoiceCounts", "invalidTextLengths", "riskViolations", "knowledgeLeakViolations", "AIorNetworkDependencies"];
if (hard.some((key) => report[key] !== 0) || report.eventCount < 60 || report.onboardingCount < 6 || report.ordinaryFallbackCount < 10 || report.coreNpcCount !== 5 || report.archetypeCount < 8 || report.causeChainCount < 6 || Object.values(report.buildCoverage).some((count) => count < 3) || Object.values(report.npcCoverage).some((count) => count < 3) || Object.values(report.causeCoverage).some((coverage) => coverage.origins < 1 || coverage.echoes < 1)) process.exitCode = 1;
