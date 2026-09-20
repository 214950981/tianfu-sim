import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";

const roots = ["packages", "server", "tools", "tests"];
const rootFiles = ["package.json", "tsconfig.json"];
const textExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".json"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i
];

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await textFiles(path));
    else if (textExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = [...rootFiles];
for (const root of roots) files.push(...await textFiles(root));

const findings = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(source))) findings.push(file);
}

if (findings.length > 0) {
  console.error(`Potential secrets: ${findings.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Secret scan: PASS");
}
