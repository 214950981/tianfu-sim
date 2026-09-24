/**
 * WXSS compatibility audit for the 2.0 dev preview stylesheet.
 *
 * Why this exists: the WeChat DevTools WXSS compiler is a stricter *parser* than the CSS the runtime
 * accepts, and it is not available in this repository. A stylesheet that looks like ordinary CSS can
 * therefore fail at compile time — which is exactly what happened in UI02R1: the universal `*`
 * selector aborted the build with
 *
 *     ./pages/v2-preview/v2-preview.wxss(150:1): unexpected token '*'
 *
 * This tool is NOT the real compiler and does not claim to be. It is a curated, documented subset
 * check that keeps the stylesheet inside the constructs documented as supported by WXSS, plus a small
 * explicitly-labelled conservative subset of its own. Every check names its rule and reason.
 *
 * Documented WXSS constraints (https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html):
 *   - "WXSS 支持绝大多数 CSS 选择器，但有个别例外：属性名选择器 `[...]` 不会生效；
 *      不支持带参数的伪类和伪元素选择器。"
 *   - Media Query is the documented way to do responsive layout in WXSS.
 * Empirical constraints (observed via the DevTools compiler):
 *   - the universal selector `*` is rejected at parse time ("unexpected token '*'"), so there is no
 *     universal reset; boxes with a definite size and padding/border must declare border-box themselves.
 *
 * Run: node tools/wxss-compat-audit.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { parseDeclarations, parseStylesheet, resolveTokens, lengthPx } from "./ui02r1-layout-audit.mjs";

export const WXSS_DOC = "https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html";

/** Files this audit covers: the stylesheet this task authored. Legacy 1.0 wxss is untouched (digest-pinned). */
export const COMPAT_TARGETS = ["miniprogram/pages/v2-preview/v2-preview.wxss"];

export const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** At-rules accepted in WXSS. Everything else (@supports, @container, @layer, @scope, ...) is rejected. */
export const SUPPORTED_AT_RULES = ["media", "import", "keyframes"];

/** Parameterless pseudo-classes allowed in selectors (parameterised ones are a documented WXSS exception). */
export const SUPPORTED_PSEUDO_CLASSES = ["active", "first-child", "last-child", "before", "after"];

/**
 * Boxes that must size border-box. Derived, not hand-picked: any rule with a definite size in an axis
 * that also has padding/border in that axis needs it, because the removed universal `*` rule used to
 * supply it and the one-screen budget arithmetic is written in border-box terms.
 */
export const BORDER_BOX_CANDIDATES = [
  "screen", "vitals", "attn", "dock-note", "action", "cta", "dev-trigger", "dev-tab",
  "dev-action", "drawer-close", "attention-scroll", "decision-viewport", "archive-viewport",
  "dev-scroll", "drawer-scroll",
  "entry-list", "entry-row", "offer-cand", "opening-row", "entry-attrs", "entry-cta"
];

export const BORDER_BOX_RATIONALE = {
  screen: "height 100vh plus padding; without border-box the root overflows the viewport",
  vitals: "height token plus top/bottom hairlines",
  attn: "height token plus bottom hairline",
  "dock-note": "height token plus hairline border",
  action: "min-height token plus vertical padding and a hairline border (the 44 CSS px target)",
  cta: "min-height token plus a hairline border",
  "dev-trigger": "min-height/min-width touch target plus a hairline border",
  "dev-tab": "min-height plus a hairline border",
  "dev-action": "min-height plus a hairline border",
  "drawer-close": "min-height/min-width plus a hairline border",
  "attention-scroll": "flex-grown scroll viewport with padding; padding must stay inside the box",
  "decision-viewport": "flex-grown scroll viewport with safe-area padding",
  "archive-viewport": "flex-grown scroll viewport with safe-area padding",
  "dev-scroll": "flex-grown scroll viewport with padding",
  "drawer-scroll": "explicit 46vh height plus padding",
  "entry-list": "UI02ENTRY flex-grown bounded scroll viewport with padding (the entry-screen analogue of attention-scroll)",
  "entry-row": "UI02ENTRY height token plus horizontal padding and a bottom hairline",
  "offer-cand": "UI02ENTRY height token plus padding and a full hairline border",
  "opening-row": "UI02ENTRY height token plus a bottom hairline",
  "entry-attrs": "UI02ENTRY height token plus a full hairline border",
  "entry-cta": "UI02ENTRY min-height token plus a 2rpx border (the pre-run primary control's 44 CSS px target)"
};

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

// ------------------------------------------------------------------ selector analysis

/** Selector shape whitelist: element / .class / #id / compound, descendant-joined, optional :pseudo.
 *  Comma-separated selector lists are supported by WXSS, so each part is validated independently. */
export function selectorIsSupported(selector, pseudoClasses = SUPPORTED_PSEUDO_CLASSES) {
  const list = selector.split(",").map((entry) => entry.trim());
  if (list.length === 0) return false;
  return list.every((entry) => {
    const parts = entry.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length === 0) return false;
    return parts.every((part) => {
      const match = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)((?:::{0,1}[a-zA-Z][\w-]*)*)$/.exec(part);
      if (match === null) return false;
      if (match[2] === "" && match[1] === undefined) return false;
      const pseudo = match[3] || "";
      for (const token of pseudo.match(/::?[a-zA-Z][\w-]*/g) || []) {
        if (!pseudoClasses.includes(token.replace(/^::?/, ""))) return false;
      }
      return true;
    });
  });
}

export function atRuleNames(source) {
  return [...stripComments(source).matchAll(/@([a-zA-Z][\w-]*)/g)].map((match) => match[1].toLowerCase());
}

export function allRules(stylesheet) {
  const rules = [...stylesheet.outerRules];
  for (const band of stylesheet.bands) rules.push(...band.rules);
  return rules;
}

// ------------------------------------------------------------------ box model

const ZERO = /^0(?:[a-z%]*)$/i;

function boxValuePx(value, tokens, width) {
  if (value === undefined) return 0;
  const trimmed = value.trim();
  if (ZERO.test(trimmed)) return 0;
  const px = lengthPx(trimmed, tokens, width);
  // Unresolvable values are treated as non-zero: the check must fail closed, never open.
  return Number.isFinite(px) ? px : Number.NaN;
}

/** Vertical padding + border thickness, or NaN when a value cannot be resolved. */
export function verticalInsets(declarations, tokens, width) {
  let total = 0;
  const padding = declarations.get("padding");
  if (padding !== undefined) {
    const parts = padding.split(/\s+/).filter((entry) => entry.length > 0);
    const top = parts[0];
    const bottom = parts.length >= 3 ? parts[2] : parts[0];
    for (const value of [top, bottom]) {
      const px = boxValuePx(value, tokens, width);
      if (!Number.isFinite(px)) return Number.NaN;
      total += px;
    }
  }
  for (const name of ["padding-top", "padding-bottom"]) {
    if (declarations.get(name) === undefined) continue;
    const px = boxValuePx(declarations.get(name), tokens, width);
    if (!Number.isFinite(px)) return Number.NaN;
    total += px;
  }
  for (const name of ["border", "border-top", "border-bottom", "border-width", "border-top-width", "border-bottom-width"]) {
    const value = declarations.get(name);
    if (value === undefined) continue;
    if (/^none\b/i.test(value.trim()) || ZERO.test(value.trim())) continue;
    total += 1; // a declared hairline counts as at least 1rpx of box space
  }
  return total;
}

/** True when the rule has a size that box-sizing actually affects. */
export function hasDefiniteSize(declarations, tokens, width) {
  for (const name of ["height", "min-height"]) {
    const value = declarations.get(name);
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?vh$/.test(trimmed)) return true;
    if (Number.isFinite(lengthPx(trimmed, tokens, width))) return true;
  }
  const flex = declarations.get("flex");
  if (flex !== undefined) {
    const grow = Number.parseFloat(flex.trim().split(/\s+/)[0]);
    if (Number.isFinite(grow) && grow > 0) return true;
  }
  if (declarations.get("flex-grow") !== undefined) {
    const grow = Number.parseFloat(declarations.get("flex-grow"));
    if (Number.isFinite(grow) && grow > 0) return true;
  }
  return false;
}

/** Selectors whose border-box requirement is derived from the declaration body itself.
 *  Fail-closed: a definite-sized box whose padding/border cannot be resolved still counts as needing
 *  border-box, because an unresolvable inset (env(), unsupported function) is assumed non-zero. */
export function derivedBorderBoxSelectors(stylesheet, tokens, width) {
  const derived = [];
  for (const rule of stylesheet.outerRules) {
    const selector = rule.selector.trim();
    if (!selector.startsWith(".") || selector.includes(" ") || selector.includes(",") || selector.includes(":")) continue;
    const declarations = parseDeclarations(rule.body);
    if (!hasDefiniteSize(declarations, tokens, width)) continue;
    const insets = verticalInsets(declarations, tokens, width);
    if (insets === 0) continue;
    derived.push(selector.slice(1));
  }
  return derived.sort();
}

// ------------------------------------------------------------------ audit

function check(name, ok, detail) {
  return { name, ok, detail: detail === undefined ? "" : detail };
}

export function auditWxssCompat(targets = COMPAT_TARGETS, overrides = {}) {
  const checks = [];
  const reports = [];

  for (const relative of targets) {
    const raw = overrides[relative] === undefined ? read(relative) : overrides[relative];
    const code = stripComments(raw);
    const stylesheet = parseStylesheet(raw);
    const tokens = resolveTokens(stylesheet, 320, 500).tokens;
    const rules = allRules(stylesheet);
    const selectors = rules.map((rule) => rule.selector);

    checks.push(check(
      relative + ": no universal `*` selector (the DevTools compiler rejects the `*` token)",
      !/(^|[\s,{}])\*(?=[\s,{}:.]|$)/m.test(code),
      "comments are stripped before scanning, so prose about `*` cannot hide or fake this"
    ));
    checks.push(check(
      relative + ": no attribute selectors (documented WXSS exception)",
      !selectors.some((selector) => /\[/.test(selector)),
      "no `[...]` in any selector"
    ));
    checks.push(check(
      relative + ": no parameterised pseudo-classes or pseudo-elements (documented WXSS exception)",
      !selectors.some((selector) => /:{1,2}[a-zA-Z][\w-]*\s*\(/.test(selector)),
      "no `:fn(...)` / `::fn(...)` in any selector"
    ));
    const unsupportedSelectors = selectors.filter((selector) => !selectorIsSupported(selector));
    checks.push(check(
      relative + ": every selector stays inside the documented WXSS selector subset",
      unsupportedSelectors.length === 0,
      unsupportedSelectors.length === 0 ? selectors.length + " selectors checked" : "offending: " + unsupportedSelectors.join(" | ")
    ));
    const combinators = selectors.filter((selector) => /[>+~]/.test(selector));
    checks.push(check(
      relative + "[subset]: no child/sibling combinators (kept to descendant selectors on purpose)",
      combinators.length === 0,
      combinators.length === 0 ? "none" : combinators.join(" | ")
    ));

    const atRules = [...new Set(atRuleNames(raw))];
    const badAtRules = atRules.filter((name) => !SUPPORTED_AT_RULES.includes(name));
    checks.push(check(
      relative + ": at-rules limited to " + SUPPORTED_AT_RULES.join(" / "),
      badAtRules.length === 0,
      badAtRules.length === 0 ? "found: " + atRules.join(", ") : "unsupported: " + badAtRules.join(", ")
    ));
    const badConditions = stylesheet.bands
      .map((band) => band.query)
      .filter((query) => query.replace(/\(\s*(min|max)-(width|height)\s*:\s*\d+(?:\.\d+)?px\s*\)/g, "").replace(/\band\b/g, "").trim() !== "");
    checks.push(check(
      relative + ": media conditions limited to (min|max)-(width|height) in px",
      badConditions.length === 0 && stylesheet.bands.length > 0,
      badConditions.length === 0 ? stylesheet.bands.length + " media bands" : "offending: " + badConditions.join(" | ")
    ));

    checks.push(check(
      relative + "[subset]: no `position: sticky` (unreliable across WeChat WebViews)",
      !code.includes("position: sticky"),
      "not used"
    ));
    checks.push(check(
      relative + "[subset]: no `display: grid` (this layout is flex-only by contract)",
      !code.includes("display: grid"),
      "not used"
    ));

    const declarationsOf = new Map();
    for (const rule of rules) {
      if (!declarationsOf.has(rule.selector.trim())) declarationsOf.set(rule.selector.trim(), parseDeclarations(rule.body));
    }
    const borderBoxSelectors = [...declarationsOf.entries()]
      .filter(([, declarations]) => declarations.get("box-sizing") === "border-box")
      .map(([selector]) => selector.replace(/^\./, ""));
    const derived = derivedBorderBoxSelectors(stylesheet, tokens, 320);
    const missingBorderBox = derived.filter((name) => !borderBoxSelectors.includes(name));
    checks.push(check(
      relative + ": every definite-sized box with padding/border declares border-box (replaces the removed `*`)",
      missingBorderBox.length === 0,
      missingBorderBox.length === 0
        ? derived.length + " boxes derived and covered: " + derived.join(", ")
        : "missing border-box: " + missingBorderBox.join(", ")
    ));
    const declaredButUndeclared = BORDER_BOX_CANDIDATES.filter((name) => !derived.includes(name));
    checks.push(check(
      relative + ": the border-box requirement list matches the stylesheet (no stale entries)",
      declaredButUndeclared.length === 0,
      declaredButUndeclared.length === 0 ? BORDER_BOX_CANDIDATES.length + " entries, all still needed" : "stale: " + declaredButUndeclared.join(", ")
    ));
    const extraBorderBox = borderBoxSelectors.filter((name) => !derived.includes(name));
    checks.push(check(
      relative + ": no layout box relies on border-box without a definite size (dead declaration)",
      extraBorderBox.length === 0,
      extraBorderBox.length === 0 ? "none" : "unnecessary: " + extraBorderBox.join(", ")
    ));

    checks.push(check(
      relative + ": the stylesheet documents its own WXSS constraints",
      code.includes("WXSS compatibility") || raw.includes("WXSS compatibility"),
      "header note present"
    ));
    checks.push(check(
      relative + ": declaration blocks are well formed (balanced braces, terminated declarations)",
      (() => {
        if ((code.match(/\{/g) || []).length !== (code.match(/\}/g) || []).length) return false;
        return rules.every((rule) => {
          const body = stripComments(rule.body);
          if ((body.match(/\{/g) || []).length !== (body.match(/\}/g) || []).length) return false;
          return body.split("\n").every((line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return true;
            return /[;{}]$/.test(trimmed);
          });
        });
      })(),
      rules.length + " rules parsed"
    ));

    reports.push({
      file: relative,
      selectors: selectors.length,
      atRules,
      mediaBands: stylesheet.bands.length,
      borderBox: borderBoxSelectors.length,
      derivedBorderBox: derived.length
    });
  }

  const failures = checks.filter((entry) => !entry.ok);
  return { checks, failures, reports };
}

function formatReport(result) {
  const lines = [];
  lines.push("WXSS compatibility audit — " + result.checks.length + " checks");
  lines.push("");
  for (const report of result.reports) {
    lines.push("  " + report.file);
    lines.push("    selectors: " + report.selectors + " | at-rules: " + report.atRules.join(", ") + " | media bands: " + report.mediaBands);
    lines.push("    border-box boxes: " + report.borderBox + " (derived requirement: " + report.derivedBorderBox + ")");
  }
  lines.push("");
  if (result.failures.length === 0) {
    lines.push("RESULT: PASS — " + result.checks.length + " checks green");
  } else {
    lines.push("RESULT: FAIL — " + result.failures.length + " of " + result.checks.length + " checks failed");
    for (const failure of result.failures) lines.push("  FAIL " + failure.name + " :: " + failure.detail);
  }
  lines.push("");
  lines.push("This is a curated subset check, NOT the WeChat DevTools WXSS compiler:");
  lines.push("  " + WXSS_DOC);
  lines.push("It cannot prove the stylesheet compiles. DevTools / a real-device build is still the");
  lines.push("authoritative check, and the runtime rendering of every accepted declaration is unverified here.");
  return lines.join("\n");
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/wxss-compat-audit.mjs");

if (isDirectRun) {
  const result = auditWxssCompat();
  console.log(formatReport(result));
  if (result.failures.length > 0) process.exitCode = 1;
}
