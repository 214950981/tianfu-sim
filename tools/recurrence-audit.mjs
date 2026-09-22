import fs from "node:fs";
import { CONTENT01_PACK, NPC_CONTENT01_V1, runRecurrenceAudit } from "../packages/content/src/index.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const sources = {
  lifecycleContract: read("../.codex/contracts/lifecycle.ref"),
  directorContract: read("../.codex/contracts/director.ref"),
  coreSource: ["event.ts", "reducer.ts", "director.ts"].map((file) => read(`../packages/core/src/${file}`)).join("\n")
};

const devFixture = JSON.parse(read("../packages/content/dev-fixtures/minimal-pack.json"));
const reports = { "minimal-pack": runRecurrenceAudit(devFixture, sources), [CONTENT01_PACK.manifest.contentVersion]: runRecurrenceAudit(CONTENT01_PACK, sources) };
for (const [packId, report] of Object.entries(reports)) console.log(packId, JSON.stringify(report, null, 2));

const failures = ["invalidRecurrenceDefinitions", "occurrenceCountViolations", "cooldownViolations", "duplicateCountOnRetry", "repeatSafeViolations", "directorPrecedenceDrift", "lifecycleNumberingDrift", "contentIdHardcodingViolations"];
if (Object.values(reports).some((report) => failures.some((key) => report[key] !== 0))) process.exitCode = 1;
if (!NPC_CONTENT01_V1.coreDefinitions.length) process.exitCode = 1;
