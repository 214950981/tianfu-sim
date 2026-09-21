import fs from "node:fs";
import { runParticipantBridgeAudit } from "../packages/content/src/index.ts";

const content = JSON.parse(fs.readFileSync(new URL("../packages/content/dev-fixtures/minimal-pack.json", import.meta.url), "utf8"));
const report = runParticipantBridgeAudit(content);
console.log(JSON.stringify(report, null, 2));
const failures = ["duplicateParticipantBindings", "orphanParticipantBindings", "invalidNpcReferences", "duplicateCoreInstances", "materializationRngDrift", "causeActorBindingFailures", "knowledgeLeakViolations", "directorSideEffectViolations"];
if (failures.some((key) => report[key] !== 0)) process.exitCode = 1;
