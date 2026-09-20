import { readFile } from "node:fs/promises";
import process from "node:process";

import { ContentRegistry } from "../packages/content/src/index.ts";
import { replayCommandLog } from "../packages/core/src/index.ts";

const [inputPath, contentPath] = process.argv.slice(2);
if (inputPath === undefined || contentPath === undefined) {
  console.error("Usage: node tools/replay.mjs <replay-input.json> <content-pack.json>");
  process.exitCode = 1;
} else {
  try {
    const [input, pack] = await Promise.all([readFile(inputPath, "utf8").then(JSON.parse), readFile(contentPath, "utf8").then(JSON.parse)]);
    const content = new ContentRegistry(); content.register(pack);
    const result = replayCommandLog({ ...input, content });
    console.log(JSON.stringify({ finalRuleStateHash: result.finalRuleStateHash, checkpoints: result.checkpoints }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Replay failed");
    process.exitCode = 1;
  }
}
