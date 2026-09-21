import fs from "node:fs";
import { runRiskAudit } from "../packages/content/src/risk-audit.ts";

const contentPath = new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url);
const result = runRiskAudit(undefined, JSON.parse(fs.readFileSync(contentPath, "utf8")));
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.warningViolations || result.directDeathViolations || result.earlyNodeViolations || result.hookConflicts || result.deathRecordViolations || result.determinismFailures || result.securityViolations) process.exitCode = 1;
