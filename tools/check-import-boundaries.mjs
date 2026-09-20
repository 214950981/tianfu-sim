import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import process from "node:process";

const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const forbiddenSegments = new Set(["wx", "tt", "db", "http", "https", "fetch", "ai", "platform"]);
const importPatterns = [
  /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
];
const forbiddenRuntimePatterns = [
  { name: "wx", pattern: /\bwx\s*\./ },
  { name: "tt", pattern: /\btt\s*\./ },
  { name: "fetch", pattern: /\bfetch\s*\(/ }
];

function requestedRoot() {
  const rootIndex = process.argv.indexOf("--root");
  return resolve(rootIndex === -1 ? "packages/core" : process.argv[rootIndex + 1]);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function forbiddenImport(specifier) {
  return specifier
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((segment) => forbiddenSegments.has(segment));
}

const root = requestedRoot();
const violations = [];
for (const file of await sourceFiles(root)) {
  const source = await readFile(file, "utf8");
  for (const pattern of importPatterns) {
    for (const match of source.matchAll(pattern)) {
      if (forbiddenImport(match[1])) violations.push(`${relative(root, file)}: forbidden import ${match[1]}`);
    }
  }
  for (const { name, pattern } of forbiddenRuntimePatterns) {
    if (pattern.test(source)) violations.push(`${relative(root, file)}: forbidden runtime ${name}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Core import boundary: PASS");
}
