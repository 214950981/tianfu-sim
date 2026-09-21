import fs from "node:fs";
import { runDirectorAudit } from "../packages/content/src/index.ts";

const content = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
const report = runDirectorAudit(content);
console.log(JSON.stringify(report, null, 2));
const failures = ["invalidWeights", "invalidTags", "precedenceViolations", "pacingViolations", "dangerPacingViolations", "determinismFailures", "replayFailures", "securityViolations"];
if (failures.some((key) => report[key] !== 0)) process.exitCode = 1;
