import fs from "node:fs";
import { runRecurrenceAudit } from "../packages/content/src/index.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const pack = JSON.parse(read("../packages/content/dev-fixtures/minimal-pack.json"));
const report = runRecurrenceAudit(pack, {
  lifecycleContract: read("../.codex/contracts/lifecycle.ref"),
  directorContract: read("../.codex/contracts/director.ref"),
  coreSource: ["event.ts", "reducer.ts", "director.ts"].map((file) => read(`../packages/core/src/${file}`)).join("\n")
});
console.log(JSON.stringify(report, null, 2));
const failures = ["invalidRecurrenceDefinitions", "occurrenceCountViolations", "cooldownViolations", "duplicateCountOnRetry", "repeatSafeViolations", "directorPrecedenceDrift", "lifecycleNumberingDrift", "contentIdHardcodingViolations"];
if (failures.some((key) => report[key] !== 0)) process.exitCode = 1;
