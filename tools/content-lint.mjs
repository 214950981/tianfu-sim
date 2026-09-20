import { readFile } from "node:fs/promises";
import process from "node:process";

import { validateContentPack } from "../packages/content/src/index.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: node tools/content-lint.mjs <content-pack.json> [...]");
  process.exitCode = 1;
} else {
  for (const path of paths) {
    const pack = JSON.parse(await readFile(path, "utf8"));
    validateContentPack(pack);
  }
  console.log(`Content lint: PASS (${paths.length} pack${paths.length === 1 ? "" : "s"})`);
}
