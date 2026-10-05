/**
 * LIVEFIX02 — legacy source mirror for files that must exist inside `miniprogramRoot`.
 *
 * THE PROBLEM
 *
 * `project.config.json` sets `miniprogramRoot: "miniprogram/"`, so the WeChat packager builds ONLY that
 * subtree. A file that exists only in the root-level `pages/` tree cannot satisfy a MiniProgram
 * `require()`, and a page registered in `miniprogram/app.json` without a committed `.js` entry cannot be
 * registered at all. Real DevTools on an empty CloudBase environment reported exactly this:
 *
 *     module 'pages/start/data.js' is not defined, require args is './data.js'
 *     Page 'pages/v2-live/v2-live' has not been registered yet
 *
 * and the editor "helpfully" wrote an untracked `miniprogram/pages/game/game.js` boilerplate stub, which
 * masks the real defect instead of fixing it.
 *
 * THE RULE THIS TOOL ENFORCES
 *
 * Every legacy file listed in `MIRROR_MANIFEST` is a **byte-exact mirror**: the committed copy under
 * `miniprogramRoot` must equal its root-level source, byte for byte. No transformation, no line-ending
 * rewrite, no reformatting. That is what makes "we preserved 1.0 semantics exactly" a checkable claim
 * instead of a promise, and it means the freshness check needs no normalisation logic at all.
 *
 * `git` stores these bytes verbatim (`core.autocrlf=false`, no `.gitattributes`), so a byte-exact mirror
 * round-trips through the object store unchanged.
 *
 * The root-level sources are NOT deleted or moved. They stay as the single source of truth; this tool
 * only projects them into the package.
 *
 * Usage:
 *   node tools/miniprogram-package-mirror.mjs           # freshness check (exit 1 when stale or missing)
 *   node tools/miniprogram-package-mirror.mjs --write   # (re)write the mirrored copies
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const MINIPROGRAM_ROOT = "miniprogram";

/**
 * The manifest. `source` is the single source of truth (root-level legacy tree); `target` is where the
 * packager needs it. `why` names the concrete runtime failure so a future reader never has to re-derive it.
 *
 * Adding an entry is a deliberate act: it asserts that this legacy file is part of the shipped package.
 * Removing an entry without deleting the target would let the freshness check go quiet on a file the
 * package still needs, so `runPackageMirror` also reports any target that exists but is unlisted.
 */
export const MIRROR_MANIFEST = [
  {
    source: "pages/start/data.js",
    target: "miniprogram/pages/start/data.js",
    why: "miniprogram/pages/start/start.js destructures { MASTER_TALENTS, ROOT_POOL, GAME_HELP } from require('./data.js'); without it the default route throws \"module 'pages/start/data.js' is not defined\" before any page is registered."
  },
  {
    source: "pages/game/game.js",
    target: "miniprogram/pages/game/game.js",
    why: "miniprogram/app.json registers pages/game/game and it is a tabBar entry; without a committed .js the packager cannot register the page and DevTools substitutes an untracked boilerplate stub that silently deletes the 1.0 game engine."
  },
  {
    source: "pages/start/start.wxss",
    target: "miniprogram/pages/start/start.wxss",
    why: "miniprogram/pages/start/start.wxml styles 74 static classes and app.wxss defines almost none of them; without the page stylesheet the default route renders unstyled."
  },
  {
    source: "pages/game/game.wxss",
    target: "miniprogram/pages/game/game.wxss",
    why: "miniprogram/pages/game/game.wxml styles 101 static classes (.container, .header-monitor, .realm-box, the modals, the stat grid); without the page stylesheet the game route renders unstyled."
  }
];

const defaultRead = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative));
const defaultExists = (relative) => fs.existsSync(path.join(REPO_ROOT, relative));

/** Normalises whatever a reader returned (string or Buffer) to bytes, so injection cannot change semantics. */
const toBytes = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));

/** The digest both sides are compared on. Raw bytes, so the comparison needs no normalisation. */
export function mirrorDigest(bytes) {
  return createHash("sha256").update(toBytes(bytes)).digest("hex");
}

/**
 * Verifies every manifest entry against the committed tree.
 *
 * Pure with respect to the repository: all I/O goes through the injected `read`/`exists` pair, which is how
 * `tests/livefix02.test.mjs` drives the negative controls.
 */
export function runPackageMirror({ read = defaultRead, exists = defaultExists, manifest = MIRROR_MANIFEST } = {}) {
  const problems = [];
  const report = [];
  const listed = new Set(manifest.map((entry) => entry.target));

  for (const entry of manifest) {
    if (!exists(entry.source)) {
      problems.push(`${entry.source}: the mirror source is missing; ${entry.target} has no single source of truth`);
      continue;
    }
    const sourceBytes = toBytes(read(entry.source));
    if (!exists(entry.target)) {
      problems.push(`${entry.target}: missing; run \`node tools/miniprogram-package-mirror.mjs --write\` (${entry.why})`);
      continue;
    }
    const targetBytes = toBytes(read(entry.target));
    if (Buffer.compare(sourceBytes, targetBytes) !== 0) {
      problems.push(
        `${entry.target}: STALE — ${sourceBytes.length} source bytes vs ${targetBytes.length} target bytes, ` +
        `digest ${mirrorDigest(sourceBytes).slice(0, 12)} vs ${mirrorDigest(targetBytes).slice(0, 12)}; ` +
        `run \`node tools/miniprogram-package-mirror.mjs --write\``
      );
      continue;
    }
    report.push(`${entry.target}: fresh (${sourceBytes.length} bytes, sha256 ${mirrorDigest(sourceBytes).slice(0, 12)})`);
  }

  // A mirrored file that is no longer listed is a manifest that lost an entry. Surface it instead of
  // letting the target quietly become an untracked second source of truth.
  for (const entry of manifest) {
    if (listed.has(entry.target) && exists(entry.target) && !exists(entry.source)) {
      problems.push(`${entry.target}: exists without its mirror source ${entry.source}`);
    }
  }

  return { ok: problems.length === 0, problems, report, manifest };
}

/** Writes every mirrored copy. Returns the targets it actually changed, so a no-op run says so. */
export function writePackageMirror({ write = (relative, bytes) => fs.writeFileSync(path.join(REPO_ROOT, relative), bytes), manifest = MIRROR_MANIFEST } = {}) {
  const written = [];
  for (const entry of manifest) {
    const bytes = toBytes(defaultRead(entry.source));
    const current = defaultExists(entry.target) ? toBytes(defaultRead(entry.target)) : null;
    if (current !== null && Buffer.compare(current, bytes) === 0) continue;
    fs.mkdirSync(path.dirname(path.join(REPO_ROOT, entry.target)), { recursive: true });
    write(entry.target, bytes);
    written.push(entry.target);
  }
  return written;
}

export function formatPackageMirrorReport(result) {
  return result.problems.length > 0
    ? result.problems.join("\n")
    : [...result.report, `LIVEFIX02 package mirror: PASS (${result.manifest.length} mirrored files)`].join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/miniprogram-package-mirror.mjs");

if (isDirectRun) {
  if (process.argv.includes("--write")) {
    const written = writePackageMirror({});
    console.log(written.length === 0 ? "mirror already fresh; nothing written" : `wrote ${written.length} mirrored file(s)`);
    for (const relative of written) console.log("  " + relative);
  }
  const result = runPackageMirror({});
  if (result.problems.length > 0) {
    console.error(result.problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(formatPackageMirrorReport(result));
  }
}
