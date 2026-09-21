import { CONTENT_SIM_POLICIES, runContentSimulation } from "../packages/content/src/index.ts";

function integer(value, name, minimum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new TypeError(`${name} must be an integer >= ${minimum}`);
  return parsed;
}

function parseRange(value) {
  const match = /^(\d+)(?::|\.\.)(\d+)$/.exec(value);
  if (match === null) throw new TypeError("--seed-range must be START:END (END exclusive)");
  const start = integer(match[1], "seed range start", 0); const end = integer(match[2], "seed range end", 1);
  if (end <= start) throw new RangeError("seed range end must be greater than start");
  return [start, end];
}

const options = {}; let includeRuns = false;
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]; const value = process.argv[index + 1];
  if (argument === "--include-runs") { includeRuns = true; continue; }
  if (value === undefined) throw new TypeError(`${argument} requires a value`);
  if (argument === "--runs") options.runsPerPolicy = integer(value, "--runs", 1);
  else if (argument === "--max-actions") options.maxActions = integer(value, "--max-actions", 1);
  else if (argument === "--policy") {
    const policies = value.split(",").filter(Boolean);
    if (policies.some((policy) => !CONTENT_SIM_POLICIES.includes(policy))) throw new RangeError(`unknown policy; expected ${CONTENT_SIM_POLICIES.join(", ")}`);
    options.policies = policies;
  } else if (argument === "--seed-range") [options.seedStart, options.seedEndExclusive] = parseRange(value);
  else throw new TypeError(`unknown argument ${argument}`);
  index += 1;
}

const report = runContentSimulation(options);
const output = includeRuns ? report : { ...report, runTelemetry: { count: report.runTelemetry.length, first: report.runTelemetry[0], last: report.runTelemetry.at(-1) } };
console.log(JSON.stringify(output, null, 2));
if (report.runtimeFailures !== 0 || report.deadlocks !== 0 || report.AIcalls !== 0) process.exitCode = 1;
