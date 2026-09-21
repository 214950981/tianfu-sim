import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContextLoaderError, formatTaskContext, loadTaskContext } from "./context-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(here);
const taskId = process.argv[2] ?? "";
try { process.stdout.write(formatTaskContext(loadTaskContext(taskId, { repoRoot }))); }
catch (error) { if (error instanceof ContextLoaderError) { console.error(error.message); process.exit(error.exitCode); } throw error; }
