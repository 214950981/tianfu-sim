/**
 * LIVEFIX03 — WXSS structural integrity audit.
 *
 * WHY THIS EXISTS
 *
 * LIVEFIX02's mirror gate answered exactly one question: "does the packaged copy equal its source,
 * byte for byte?" It answered that question correctly and the package was still unbuildable, because the
 * *source itself* was historically truncated. Real WeChat DevTools reported:
 *
 *     pages/game/game.wxss(253:14): unexpected token
 *
 * and the committed file ended mid-declaration:
 *
 *     .engine-paused {
 *       background: rgba(255, 152, 0          <- no closing paren, no semicolon, no brace, no newline
 *
 * A mirror gate cannot catch that class of defect, because a truncated file is perfectly fresh. This
 * audit is the missing half: it proves each stylesheet is *structurally complete*, so "fresh" and
 * "valid" stop being independent facts.
 *
 * WHAT IT CHECKS
 *
 * A single left-to-right pass with a comment/string-aware scanner. Every finding is a position plus a
 * reason, and the audit is fail-closed: anything it cannot account for is reported, never skipped.
 *
 *   1. unbalanced curly braces        (a rule block that never closes, or a stray `}`)
 *   2. unbalanced parentheses          (e.g. the observed `rgba(255, 152, 0`)
 *   3. unterminated quotes             (a string that runs to EOF)
 *   4. unterminated block comments     (`/*` with no `*\/`)
 *   5. EOF inside a rule block         (the file stops while a block is still open)
 *   6. EOF inside a declaration        (the file stops after `prop: value` with no `;` or `}`)
 *   7. dangling trailing comma         (a value that plainly continues past the truncation point)
 *
 * SCOPE — deliberately NOT a WXSS compiler
 *
 * No WXSS compiler exists in this repository and this tool does not pretend to be one. It is a
 * *structural* completeness check, and it says so. It cannot prove a stylesheet compiles under the
 * DevTools build; that remains a human DevTools pass. `tools/wxss-compat-audit.mjs` separately keeps
 * the 2.0 preview stylesheet inside the documented WXSS selector subset, and that tool's own header
 * carries the same disclaimer.
 *
 * Class *coverage* is reported as a diagnostic only and is never a violation: WXML legitimately uses
 * dynamically-built class names (`color-{{realmColorClass}}`), values chosen by WXS, and classes that
 * inherit from `app.wxss`, so "100% of used classes are defined here" is not a property any honest
 * stylesheet can be required to have. Undefined classes are surfaced as a count, not a gate.
 *
 * Usage:
 *   node tools/wxss-integrity-audit.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { MIRROR_MANIFEST } from "./miniprogram-package-mirror.mjs";

export const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const PROJECT_CONFIG_PATH = "project.config.json";

const defaultRead = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
const defaultExists = (relative) => fs.existsSync(path.join(REPO_ROOT, relative));

/** Line number for a character offset, computed once per scan instead of per finding. */
function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** A short, single-line, length-capped excerpt of the offending source region. */
function excerpt(source, offset) {
  const from = Math.max(0, offset - 24);
  const to = Math.min(source.length, offset + 32);
  return source
    .slice(from, to)
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .slice(0, 56);
}

/**
 * Scans one stylesheet for structural incompleteness.
 *
 * Pure: takes source text, returns findings. No I/O, no globals — which is what lets the negative
 * controls drive it with hand-written broken fixtures instead of mutating the real file.
 *
 * @param {string} source stylesheet text
 * @param {string} label  path or synthetic name used in messages
 * @returns {{ok: boolean, violations: string[]}}
 */
export function auditWxssSource(source, label) {
  const violations = [];
  const starts = lineStarts(source);

  let index = 0;
  let braceDepth = 0;
  let parenDepth = 0;
  let blockComment = false;
  let quote = null; // "'" | '"' | null
  let blockCommentStart = -1;
  let quoteStart = -1;
  let parenStart = -1;

  // The current declaration text, reset at `;`, `{` and `}`. Non-empty at EOF means the file stopped
  // in the middle of a declaration — the exact shape of the observed truncation.
  let pending = "";
  let pendingStart = -1;

  const at = (offset) => lineAt(starts, offset);

  const note = (offset, reason) => {
    violations.push(`${label}:${at(offset)}:${reason} — ${excerpt(source, offset)}`);
  };

  while (index < source.length) {
    const ch = source[index];

    if (blockComment) {
      if (ch === "*" && source[index + 1] === "/") {
        blockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (quote !== null) {
      if (ch === "\\") {
        index += 2; // an escape consumes the next character, including a closing quote
        continue;
      }
      if (ch === quote) {
        quote = null;
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    // Not in a comment and not in a string: this is the only place structure is interpreted.
    if (ch === "/" && source[index + 1] === "*") {
      blockComment = true;
      blockCommentStart = index;
      index += 2;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      quoteStart = index;
      index += 1;
      continue;
    }

    if (ch === "(") {
      if (parenDepth === 0) parenStart = index;
      parenDepth += 1;
      pending += ch;
      index += 1;
      continue;
    }

    if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth < 0) {
        note(index, "unbalanced `)` — a closing parenthesis with no opening parenthesis");
        parenDepth = 0;
      }
      pending += ch;
      index += 1;
      continue;
    }

    if (ch === "{") {
      braceDepth += 1;
      pending = "";
      pendingStart = -1;
      index += 1;
      continue;
    }

    if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        note(index, "unbalanced `}` — a closing brace with no opening rule block");
        braceDepth = 0;
      }
      // A declaration may be terminated by `}` instead of `;`, so the dangling-comma check has to run
      // here too. Skipping it is how `.a { font-family: 'A', 'B', }` would slip through as valid.
      const closing = pending.trim();
      if (closing.includes(":") && closing.endsWith(",")) {
        note(pendingStart < 0 ? index : pendingStart, "declaration value ends with a dangling `,`, so it is truncated mid-list");
      }
      // A `}` closes the last declaration too, so a pending declaration here is complete, not truncated.
      pending = "";
      pendingStart = -1;
      index += 1;
      continue;
    }

    if (ch === ";") {
      const value = pending.trim();
      if (value.includes(":") && value.endsWith(",")) {
        note(pendingStart < 0 ? index : pendingStart, "declaration value ends with a dangling `,`, so it is truncated mid-list");
      }
      pending = "";
      pendingStart = -1;
      index += 1;
      continue;
    }

    if (pending.trim().length === 0) pendingStart = index;
    pending += ch;
    index += 1;
  }

  // ------------------------------------------------------------------ EOF accounting
  if (blockComment) {
    note(blockCommentStart, "unterminated block comment — `/*` is never closed by `*/`");
  }
  if (quote !== null) {
    note(quoteStart, `unterminated ${quote === '"' ? 'double" ' : "single '"}quoted string — the quote is never closed`);
  }
  if (parenDepth > 0) {
    note(parenStart, `EOF inside a value — ${parenDepth} unclosed parenthesis (e.g. a truncated rgba()/url() argument list)`);
  }
  if (braceDepth > 0) {
    note(Math.max(0, source.length - 1), `EOF inside a rule block — ${braceDepth} unclosed \`{\``);
  }
  const tail = pending.trim();
  if (tail.length > 0 && tail.includes(":")) {
    note(pendingStart, `EOF inside a declaration — \`${tail.replace(/^[^:]*:\s*/, "").slice(0, 40)}\` has no terminating \`;\` or \`}\``);
  } else if (tail.length > 0 && braceDepth === 0 && parenDepth === 0) {
    note(pendingStart, `EOF inside a selector — \`${tail.slice(0, 40)}\` is not followed by a rule block`);
  }

  return { ok: violations.length === 0, violations };
}

/**
 * WXML static-class coverage, reported as a diagnostic only. See the header: dynamic class names make
 * full coverage an unreasonable hard gate, so this never contributes a violation.
 */
export function wxssClassCoverage(wxmlSource, wxssSource) {
  const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, "");
  const used = new Set();
  const attrRe = /\bclass\s*=\s*"([^"]*)"/g;
  let match;
  const template = stripComments(wxmlSource);
  while ((match = attrRe.exec(template)) !== null) {
    const raw = match[1];
    if (raw.includes("{{")) continue; // fully dynamic binding: not a statically knowable class list
    for (const token of raw.split(/\s+/)) {
      const name = token.trim();
      if (name.length === 0) continue;
      if (!/^-?[_a-zA-Z][\w-]*$/.test(name)) continue; // reject leftovers of dynamic expressions
      used.add(name);
    }
  }
  const defined = new Set();
  const css = wxssSource.replace(/\/\*[\s\S]*?\*\//g, "");
  const selRe = /\.(-?[_a-zA-Z][\w-]*)/g;
  while ((match = selRe.exec(css)) !== null) defined.add(match[1]);
  const missing = [...used].filter((name) => !defined.has(name)).sort();
  return { used: used.size, defined: defined.size, missing };
}

/** Resolves the packager root from project.config.json, mirroring the closure audit's fail-closed rule. */
export function resolveMiniProgramRoot({ read = defaultRead } = {}) {
  let config;
  try {
    config = JSON.parse(read(PROJECT_CONFIG_PATH));
  } catch (error) {
    return { ok: false, root: null, reason: `${PROJECT_CONFIG_PATH}: not parseable JSON (${error.message})` };
  }
  const root = typeof config.miniprogramRoot === "string" ? config.miniprogramRoot.replace(/\\/g, "/").replace(/\/+$/, "") : null;
  if (root === null || root.length === 0) {
    return { ok: false, root: null, reason: `${PROJECT_CONFIG_PATH}: miniprogramRoot is missing, so the audited package tree is unknown` };
  }
  return { ok: true, root, reason: null };
}

/**
 * Every stylesheet that must be structurally intact:
 *   - the `.wxss` of every page registered in `<root>/app.json` (when one exists)
 *   - every `.wxss` source and target named by the package mirror manifest
 *
 * A registered page with no `.wxss` of its own is legal (it inherits `app.wxss`), so its absence is
 * not a violation — but a registered page whose `.wxss` exists and is broken is exactly the LIVEFIX03
 * defect, and that is a violation.
 */
export function collectIntegrityTargets({ read = defaultRead, exists = defaultExists, manifest = MIRROR_MANIFEST } = {}) {
  const resolved = resolveMiniProgramRoot({ read });
  if (!resolved.ok) return { ok: false, violations: [resolved.reason], targets: [], root: null, coverage: [] };

  const targets = new Set();
  const missingRoot = [];

  try {
    const pages = JSON.parse(read(`${resolved.root}/app.json`)).pages;
    if (!Array.isArray(pages)) {
      return { ok: false, violations: [`${resolved.root}/app.json: pages must be an array`], targets: [], root: resolved.root, coverage: [] };
    }
    for (const page of pages) {
      const style = `${resolved.root}/${page}.wxss`;
      if (exists(style)) targets.add(style);
      else missingRoot.push(style);
    }
  } catch (error) {
    return { ok: false, violations: [`${resolved.root}/app.json: not parseable JSON (${error.message})`], targets: [], root: resolved.root, coverage: [] };
  }

  for (const entry of manifest) {
    if (entry.source.endsWith(".wxss")) targets.add(entry.source);
    if (entry.target.endsWith(".wxss")) targets.add(entry.target);
  }

  return {
    ok: true,
    violations: [],
    targets: [...targets].sort(),
    root: resolved.root,
    pagesWithoutOwnStylesheet: missingRoot.sort()
  };
}

/** Runs the audit over the real repository. */
export function auditWxssIntegrity({ read = defaultRead, exists = defaultExists, manifest = MIRROR_MANIFEST } = {}) {
  const collected = collectIntegrityTargets({ read, exists, manifest });
  if (!collected.ok) return { ok: false, violations: collected.violations, checked: [], coverage: [], pagesWithoutOwnStylesheet: [] };

  const violations = [];
  const coverage = [];

  for (const relative of collected.targets) {
    if (!exists(relative)) {
      violations.push(`${relative}: listed as a WXSS integrity target but is not committed`);
      continue;
    }
    const source = read(relative);
    const result = auditWxssSource(source, relative);
    if (!result.ok) violations.push(...result.violations);

    // Diagnostic only — see the header. Reported so a future reader can see the tail is not a stub,
    // never used as a gate. Only attached for a stylesheet that passed: coverage of a truncated file
    // is meaningless, and labelling it "structurally intact" would contradict the violations above.
    if (result.ok) {
      const template = relative.replace(/\.wxss$/, ".wxml");
      if (exists(template)) {
        const cov = wxssClassCoverage(read(template), source);
        coverage.push({ stylesheet: relative, template, ...cov });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    checked: collected.targets,
    coverage,
    pagesWithoutOwnStylesheet: collected.pagesWithoutOwnStylesheet
  };
}

export function formatWxssIntegrityReport(result) {
  const lines = [...result.violations];
  for (const entry of result.coverage) {
    const note = entry.missing.length === 0 ? "all statically referenced classes defined" : `${entry.missing.length} class(es) not defined here (diagnostic only)`;
    lines.push(`${entry.stylesheet}: structurally intact; ${entry.used} static classes in ${entry.template}, ${note}`);
  }
  lines.push(
    result.ok
      ? `LIVEFIX03 WXSS integrity: PASS (${result.checked.length} stylesheets structurally complete)`
      : `LIVEFIX03 WXSS integrity: FAIL (${result.violations.length} violation(s))`
  );
  return lines.join("\n");
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/wxss-integrity-audit.mjs");

if (isDirectRun) {
  const result = auditWxssIntegrity({});
  if (!result.ok) {
    console.error(formatWxssIntegrityReport(result));
    process.exitCode = 1;
  } else {
    console.log(formatWxssIntegrityReport(result));
  }
}
