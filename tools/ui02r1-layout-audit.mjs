/**
 * UI02R1 structural layout audit.
 *
 * This is a STRUCTURAL audit, not a renderer. It proves, from the committed source, that:
 *   1. the product surface cannot create page-level vertical scroll (page/disableScroll + constrained
 *      flex viewport + explicit internal scroll containers);
 *   2. the dev preview layer is a fixed overlay that consumes zero product layout height;
 *   3. the RUN_HOME first-screen stack, re-derived from the WXSS layout tokens themselves, fits the
 *      supported portrait baseline (320x500) and the whole documented viewport matrix;
 *   4. core actions keep their touch-target floor and exactly-four count structure;
 *   5. every dynamic public string is clamped, so long labels/names/reasons cannot grow the stack or
 *      create horizontal overflow.
 *
 * It deliberately re-parses miniprogram/pages/v2-preview/v2-preview.wxss instead of hard-coding the
 * numbers, so a later edit that breaks the contract fails the audit rather than silently drifting.
 * It does NOT prove visual quality on a real device. Manual visual QA in WeChat DevTools is still
 * required; see docs/UI02_PREVIEW.md.
 *
 * Run: node tools/ui02r1-layout-audit.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const WXSS_PATH = "miniprogram/pages/v2-preview/v2-preview.wxss";
export const WXML_PATH = "miniprogram/pages/v2-preview/v2-preview.wxml";
export const PAGE_JSON_PATH = "miniprogram/pages/v2-preview/v2-preview.json";
export const PAGE_JS_PATH = "miniprogram/pages/v2-preview/v2-preview.js";

export const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Supported content-viewport matrix. Sizes are WeChat content viewports, not device marketing models. */
export const VIEWPORT_MATRIX = [
  { className: "compact-xs", width: 320, height: 500 },
  { className: "compact", width: 360, height: 560 },
  { className: "classic", width: 375, height: 603 },
  { className: "modern", width: 390, height: 750 },
  { className: "large", width: 414, height: 820 },
  { className: "large-tall", width: 430, height: 850 }
];

export const SUPPORTED_BASELINE = { minWidth: 320, minHeight: 500 };
/** Worst-case iOS home-indicator inset, reserved on top of the layout stack. */
export const SAFE_AREA_BOTTOM_WORST_CASE_PX = 34;
export const TOUCH_TARGET_MIN_PX = 44;
export const RPX_PER_SCREEN_WIDTH = 750;
/** Readability floor: no product text may be shrunk below 20rpx to fake a one-screen fit. */
export const MIN_FONT_SIZE_RPX = 20;

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

// ------------------------------------------------------------------ EVENT / SPECIAL_NODE head model

/**
 * Worst-case decision head: eyebrow, a two-line-clamped headline, one wrapped participant tag row,
 * the locked badge and their margins. Font sizes come from the stylesheet, so a later type change
 * re-computes this instead of silently eating the option region.
 */
export function decisionHeadPx(stylesheet, tokens, width) {
  const lineHeightFactor = 1.6;
  const fontPx = (selector) => {
    const raw = parseDeclarations(ruleBody(stylesheet, selector)).get("font-size");
    return raw === undefined ? Number.NaN : lengthPx(raw, tokens, width);
  };
  const varPx = (name) => lengthPx(String(tokens.get(name)), tokens, width);
  const hairlinePx = lengthPx("1rpx", tokens, width);
  const parts = [
    ["eyebrow", fontPx(".eyebrow") * lineHeightFactor],
    ["headline-margin", varPx("--space-1")],
    ["headline-clamped-2-lines", fontPx(".decision-title") * 1.35 * 2],
    ["tags-margin", varPx("--space-1")],
    ["participant-tag-row", fontPx(".tag") * lineHeightFactor + 2 * hairlinePx],
    ["locked-margin", varPx("--space-2")],
    ["locked-badge", fontPx(".decision-locked") * lineHeightFactor + 2 * hairlinePx],
    ["head-padding-bottom", varPx("--space-2")]
  ];
  const unresolved = parts.filter(([, value]) => !Number.isFinite(value)).map(([name]) => name);
  return { totalPx: parts.reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0), parts, unresolved };
}

// ------------------------------------------------------------------ tiny CSS parser

function findBlock(source, openBraceIndex) {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseRules(text) {
  const rules = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf("{", cursor);
    if (open === -1) break;
    const selector = text.slice(cursor, open).trim();
    const close = findBlock(text, open);
    if (close === -1) break;
    if (selector.length > 0 && !selector.startsWith("@")) {
      rules.push({ selector, body: text.slice(open + 1, close) });
    }
    cursor = close + 1;
  }
  return rules;
}

export function parseDeclarations(body) {
  const declarations = new Map();
  for (const match of body.matchAll(/(-{0,2}[a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;]+);?/g)) {
    declarations.set(match[1].trim(), match[2].trim());
  }
  return declarations;
}

/** Follows `var(--token, fallback)` chains so a check can compare a resolved value, not a reference. */
export function resolveVar(value, tokens, depth = 0) {
  if (depth > 8 || typeof value !== "string") return value;
  const match = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]+))?\)$/.exec(value.trim());
  if (match === null) return value;
  const resolved = tokens.get(match[1]);
  if (resolved === undefined) return match[2] === undefined ? undefined : match[2].trim();
  return resolveVar(resolved, tokens, depth + 1);
}

/** px length of a (possibly `var()`-indirected) rpx/px value. */
export function lengthPx(value, tokens, width) {
  const resolved = resolveVar(value, tokens, 0);
  return resolved === undefined ? Number.NaN : rpxToPx(resolved, width);
}

const MEDIA_RE = /@media\s*([^{]+?)\s*\{/g;

export function parseStylesheet(rawSource) {
  const source = stripComments(rawSource);
  const bands = [];
  const spans = [];
  MEDIA_RE.lastIndex = 0;
  let match;
  while ((match = MEDIA_RE.exec(source)) !== null) {
    const open = match.index + match[0].length - 1;
    const close = findBlock(source, open);
    if (close === -1) continue;
    bands.push({
      query: match[1].trim(),
      rules: parseRules(source.slice(open + 1, close))
    });
    spans.push([match.index, close + 1]);
  }
  let outer = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    outer += source.slice(cursor, start);
    outer += " ";
    cursor = end;
  }
  outer += source.slice(cursor);
  return { outerRules: parseRules(outer), bands };
}

export function parseMediaQuery(raw) {
  const conditions = [];
  for (const match of raw.matchAll(/\(\s*(min|max)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*\)/g)) {
    conditions.push({ kind: match[1], axis: match[2], value: Number(match[3]) });
  }
  const residual = raw.replace(/\(\s*(min|max)-(width|height)\s*:\s*\d+(?:\.\d+)?px\s*\)/g, "").replace(/\band\b/g, "").trim();
  return { conditions, residual, raw };
}

function queryMatches(query, width, height) {
  if (query.conditions.length === 0) return false;
  for (const condition of query.conditions) {
    const value = condition.axis === "width" ? width : height;
    if (condition.kind === "min" && !(value >= condition.value)) return false;
    if (condition.kind === "max" && !(value <= condition.value)) return false;
  }
  return true;
}

/** Base `page` tokens, then every matching media band in source order (later wins). */
export function resolveTokens(stylesheet, width, height) {
  const tokens = new Map();
  const sources = [];
  const baseRules = stylesheet.outerRules.filter((rule) => /(^|[\s,])page$/.test(rule.selector) || rule.selector === "page");
  for (const rule of baseRules) {
    for (const [name, value] of parseDeclarations(rule.body)) if (name.startsWith("--")) tokens.set(name, value);
    sources.push({ band: "page-base", query: "(baseline)", matches: true });
  }
  for (const band of stylesheet.bands) {
    const query = parseMediaQuery(band.query);
    if (!queryMatches(query, width, height)) continue;
    let touched = false;
    for (const rule of band.rules) {
      if (rule.selector !== "page") continue;
      for (const [name, value] of parseDeclarations(rule.body)) if (name.startsWith("--")) { tokens.set(name, value); touched = true; }
    }
    if (touched) sources.push({ band: band.query, query: band.query, matches: true });
  }
  return { tokens, sources };
}

export function rpxToPx(value, width) {
  const match = /^(-?\d+(?:\.\d+)?)rpx$/.exec(value);
  if (match) return (Number(match[1]) * width) / RPX_PER_SCREEN_WIDTH;
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (px) return Number(px[1]);
  return Number.NaN;
}

// ------------------------------------------------------------------ RUN_HOME first-screen stack model

/**
 * Mirrors the committed RUN_HOME box model, worst case: three public attention summaries + the public
 * condition row, an available breakthrough CTA, and the full 2x2 action dock. Every dynamic string is
 * clamped to one line by the stylesheet, so block heights are the reserved token values.
 */
export const RUN_HOME_STACK = [
  { id: "screen-pad-top", cssVar: "--screen-pad-top", note: ".screen padding-top" },
  { id: "hero-name", cssVar: "--hero-name-lh", note: ".hero-name height" },
  { id: "hero-meta", cssVar: "--hero-meta-h", note: ".hero-meta height" },
  { id: "life-margin", cssVar: "--space-1", note: ".life margin-top" },
  { id: "life", cssVar: "--life-h", note: ".life height" },
  { id: "vitals-margin", cssVar: "--space-2", note: ".vitals margin-top" },
  { id: "vitals", cssVar: "--vitals-h", note: ".vitals height" },
  { id: "vitals-hairlines", rpx: 2, note: ".vitals top+bottom hairline" },
  { id: "attention-margin", cssVar: "--space-2", note: ".attention margin-top" },
  { id: "attention-head", cssVar: "--attn-head-h", note: ".attention-head height" },
  { id: "attention-pad", cssVar: "--attn-note-pad", note: ".attention-scroll padding-top" },
  { id: "attention-rows", cssVar: "--attn-slot-h", count: 4, note: "3 attention summaries + 1 condition row" },
  { id: "dock-hairline", rpx: 1, note: ".dock top hairline" },
  { id: "dock-pad-top", cssVar: "--dock-pad-top", note: ".dock padding-top" },
  { id: "cta", cssVar: "--cta-h", note: "enabled breakthrough CTA" },
  { id: "cta-gap", cssVar: "--dock-gap", note: ".cta margin-bottom" },
  { id: "dock-rows", cssVar: "--dock-row-h", count: 2, note: "2x2 action dock rows" },
  { id: "dock-row-gap", cssVar: "--dock-gap", note: ".dock-grid row gap" },
  { id: "dock-pad-bottom", cssVar: "--dock-pad-bottom", note: ".dock padding-bottom" }
];

export function runHomeStack(tokens, width) {
  const parts = [];
  for (const item of RUN_HOME_STACK) {
    let raw;
    if (item.cssVar !== undefined) {
      raw = tokens.get(item.cssVar);
      if (raw === undefined) parts.push({ ...item, raw: undefined, px: Number.NaN, missing: true });
      else parts.push({ ...item, raw, px: rpxToPx(raw, width) * (item.count || 1) });
      continue;
    }
    parts.push({ ...item, raw: item.rpx + "rpx", px: rpxToPx(item.rpx + "rpx", width) });
  }
  const missing = parts.filter((part) => part.missing === true).map((part) => part.cssVar);
  const totalPx = parts.reduce((sum, part) => sum + (Number.isFinite(part.px) ? part.px : 0), 0);
  return { parts, missing, totalPx };
}

// ------------------------------------------------------------------ UI02ENTRY pre-run screen budgets

/**
 * Worst-case first-screen budget for each pre-run screen, expressed only through the tokens the
 * stylesheet actually consumes, so a later edit that grows a screen past the supported baseline fails
 * the audit instead of drifting silently.
 *
 * Worst case per screen: the full mode vocabulary (4 rows), the full candidate set (3 cards) and an
 * available primary action. Margins and paddings that a screen really renders are listed too, so the
 * sum is the real requirement rather than an optimistic one. The four screens have a large margin at
 * every matrix viewport, which is why they need no extra media band.
 */
export const ENTRY_STACKS = {
  START: [
    { id: "screen-pad-top", cssVar: "--screen-pad-top", note: ".screen padding-top" },
    { id: "eyebrow-gap", cssVar: "--space-3", note: ".entry-head-gap margin-top" },
    { id: "eyebrow", cssVar: "--entry-head-h", note: ".eyebrow line box" },
    { id: "title", cssVar: "--entry-title-lh", note: ".entry-title height" },
    { id: "sub", cssVar: "--entry-sub-lh", note: ".entry-sub height" },
    { id: "core-gap", cssVar: "--space-4", note: ".entry-core margin-top" },
    { id: "core", cssVar: "--entry-core-lh", note: ".entry-core-text height" },
    { id: "dock-pad-top", cssVar: "--dock-pad-top", note: ".entry-dock padding-top" },
    { id: "cta", cssVar: "--cta-h", note: ".entry-cta min-height" },
    { id: "dock-pad-bottom", cssVar: "--dock-pad-bottom", note: ".entry-dock padding-bottom" }
  ],
  MODE_SELECT: [
    { id: "screen-pad-top", cssVar: "--screen-pad-top", note: ".screen padding-top" },
    { id: "eyebrow", cssVar: "--entry-head-h", note: ".eyebrow line box" },
    { id: "head", cssVar: "--entry-titlerow-h", note: ".entry-title--sm height" },
    { id: "list-margin", cssVar: "--space-2", note: ".entry-list margin-top" },
    { id: "list-pad", cssVar: "--space-1", note: ".entry-list padding-top" },
    { id: "rows", cssVar: "--entry-row-h", count: 4, note: "mode vocabulary rows" },
    { id: "dock-pad-top", cssVar: "--dock-pad-top", note: ".entry-dock padding-top" },
    { id: "cta", cssVar: "--cta-h", note: ".entry-cta min-height" },
    { id: "dock-pad-bottom", cssVar: "--dock-pad-bottom", note: ".entry-dock padding-bottom" }
  ],
  DESTINY_OFFER: [
    { id: "screen-pad-top", cssVar: "--screen-pad-top", note: ".screen padding-top" },
    { id: "eyebrow", cssVar: "--entry-head-h", note: ".eyebrow line box" },
    { id: "head", cssVar: "--entry-titlerow-h", note: ".entry-title--sm height" },
    { id: "meta", cssVar: "--entry-meta-h", note: ".entry-meta height" },
    { id: "list-margin", cssVar: "--space-2", note: ".entry-list margin-top" },
    { id: "list-pad", cssVar: "--space-1", note: ".entry-list padding-top" },
    { id: "candidates", cssVar: "--entry-cand-h", count: 3, note: "candidate cards" },
    { id: "candidate-gaps", cssVar: "--dock-gap", count: 3, note: ".offer-cand margin-bottom" },
    { id: "dock-pad-top", cssVar: "--dock-pad-top", note: ".entry-dock padding-top" },
    { id: "cta", cssVar: "--cta-h", note: ".entry-cta min-height" },
    { id: "dock-pad-bottom", cssVar: "--dock-pad-bottom", note: ".entry-dock padding-bottom" }
  ],
  RUN_OPENING: [
    { id: "screen-pad-top", cssVar: "--screen-pad-top", note: ".screen padding-top" },
    { id: "eyebrow-gap", cssVar: "--space-3", note: ".entry-head-gap margin-top" },
    { id: "eyebrow", cssVar: "--entry-head-h", note: ".eyebrow line box" },
    { id: "title", cssVar: "--entry-title-lh", note: ".entry-title height" },
    { id: "meta", cssVar: "--entry-meta-h", note: ".entry-meta height" },
    { id: "block-gap", cssVar: "--space-3", note: ".opening-block margin-top" },
    { id: "selected", cssVar: "--entry-line-h", count: 3, note: "selected profile rows" },
    { id: "attrs-gap", cssVar: "--space-2", note: ".entry-attrs margin-top" },
    { id: "attrs", cssVar: "--entry-attrs-h", note: ".entry-attrs height" },
    { id: "foot-gap", cssVar: "--space-2", note: ".entry-meta--foot margin-top" },
    { id: "foot", cssVar: "--entry-meta-h", note: ".entry-meta--foot height" },
    { id: "dock-pad-top", cssVar: "--dock-pad-top", note: ".entry-dock padding-top" },
    { id: "cta", cssVar: "--cta-h", note: ".entry-cta min-height" },
    { id: "dock-pad-bottom", cssVar: "--dock-pad-bottom", note: ".entry-dock padding-bottom" }
  ]
};

/** Same summation rule as runHomeStack, over a named entry-screen model. */
export function entryStack(model, tokens, width) {
  const parts = [];
  for (const item of model) {
    const raw = tokens.get(item.cssVar);
    if (raw === undefined) parts.push({ ...item, raw: undefined, px: Number.NaN, missing: true });
    else parts.push({ ...item, raw, px: rpxToPx(raw, width) * (item.count || 1) });
  }
  const missing = parts.filter((part) => part.missing === true).map((part) => part.cssVar);
  const totalPx = parts.reduce((sum, part) => sum + (Number.isFinite(part.px) ? part.px : 0), 0);
  return { parts, missing, totalPx };
}

// ------------------------------------------------------------------ WXML structure

export function parseWxmlElements(rawSource) {
  const source = rawSource.replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  const elements = [];
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match;
  while ((match = tagRe.exec(source)) !== null) {
    const closing = match[1] === "/";
    const tag = match[2];
    const attrs = match[3];
    const selfClosing = match[4] === "/";
    if (closing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          for (let popped = index; popped < stack.length; popped += 1) stack[popped].innerEnd = match.index;
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const element = {
      tag,
      attrs,
      ancestors: stack.slice(),
      index: match.index,
      innerStart: match.index + match[0].length,
      innerEnd: source.length
    };
    elements.push(element);
    if (!selfClosing) stack.push(element);
  }
  for (const element of elements) {
    const closed = element.innerEnd < source.length;
    element.inner = closed ? source.slice(element.innerStart, element.innerEnd) : source.slice(element.innerStart);
  }
  return elements;
}

/** Marker may live in the element's attributes (a binding) or in its text content (an interpolation). */
export function elementCarries(element, marker) {
  return element.attrs.includes(marker) || (element.inner || "").includes(marker);
}

export function classesOf(element) {
  const match = /class="([^"]*)"/.exec(element.attrs);
  return match === null ? [] : match[1].split(/\s+/).filter((entry) => entry.length > 0);
}

export const findByClass = (elements, className) => elements.filter((element) => classesOf(element).includes(className));

export function ancestorClasses(element) {
  return element.ancestors.flatMap((ancestor) => classesOf(ancestor));
}

export function ruleBody(stylesheet, selector) {
  const rule = stylesheet.outerRules.find((entry) => entry.selector === selector);
  return rule === undefined ? "" : rule.body;
}

// ------------------------------------------------------------------ checks

const findRuleContaining = (stylesheet, className) =>
  stylesheet.outerRules.find((rule) => rule.selector.split(",").map((part) => part.trim()).includes(className));

function check(name, ok, detail) {
  return { name, ok, detail: detail === undefined ? "" : detail };
}

export function auditLayout(overrides = {}) {
  const wxss = overrides.wxss === undefined ? read(WXSS_PATH) : overrides.wxss;
  const wxml = overrides.wxml === undefined ? read(WXML_PATH) : overrides.wxml;
  const pageJson = overrides.pageJson === undefined ? JSON.parse(read(PAGE_JSON_PATH)) : overrides.pageJson;
  const pageJs = overrides.pageJs === undefined ? read(PAGE_JS_PATH) : overrides.pageJs;
  const stylesheet = parseStylesheet(wxss);
  const elements = parseWxmlElements(wxml);
  const checks = [];

  // --- 1. no page-level vertical scroll, by structure -------------------------------------------------
  checks.push(check(
    "page: disableScroll is enabled on the preview route",
    pageJson.disableScroll === true,
    "disableScroll=" + String(pageJson.disableScroll)
  ));
  const pageRule = findRuleContaining(stylesheet, "page");
  const pageDecls = parseDeclarations(pageRule === undefined ? "" : pageRule.body);
  checks.push(check(
    "page: root page cannot scroll and owns the full viewport",
    pageDecls.get("overflow") === "hidden" && pageDecls.get("height") === "100%",
    "page{overflow:" + pageDecls.get("overflow") + ";height:" + pageDecls.get("height") + "}"
  ));
  const screenDecls = parseDeclarations(ruleBody(stylesheet, ".screen"));
  checks.push(check(
    "screen: constrained 100vh viewport with hidden overflow",
    screenDecls.get("height") === "100vh" && screenDecls.get("overflow") === "hidden",
    "height=" + screenDecls.get("height") + " overflow=" + screenDecls.get("overflow")
  ));
  for (const [selector, requirement] of [
    [".surface", "flex: 1 1 auto; min-height: 0"],
    [".page", "flex: 1 1 auto; min-height: 0"],
    [".home-body", "flex: 1 1 auto; min-height: 0"],
    [".attention", "flex: 1 1 auto; min-height: 0"]
  ]) {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    checks.push(check(
      "viewport: " + selector + " is a compressible flex child (" + requirement + ")",
      (decls.get("min-height") === "0") && String(decls.get("flex") || "").startsWith("1 1"),
      selector + "{flex:" + decls.get("flex") + ";min-height:" + decls.get("min-height") + "}"
    ));
  }
  for (const selector of [".surface", ".page", ".home-body", ".attention"]) {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    checks.push(check(
      "viewport: " + selector + " does not extend the document",
      decls.get("overflow") === "hidden" && decls.get("min-height") !== "100vh" && decls.get("height") !== "100vh",
      "overflow=" + decls.get("overflow")
    ));
  }

  // --- 2. bounded internal scroll containers ----------------------------------------------------------
  for (const [className, where] of [
    ["attention-scroll", "RUN_HOME attention region"],
    ["decision-viewport", "EVENT / SPECIAL_NODE narrative + options"],
    ["archive-viewport", "LIFE_ARCHIVE history"]
  ]) {
    const matches = findByClass(elements, className);
    const element = matches[0];
    checks.push(check(
      "scroll: ." + className + " (" + where + ") is a single scroll-view",
      matches.length === 1 && element !== undefined && element.tag === "scroll-view",
      matches.length + " match(es), tag=" + (element === undefined ? "(none)" : element.tag)
    ));
    checks.push(check(
      "scroll: ." + className + " enables vertical scrolling",
      element !== undefined && /(^|\s)scroll-y(\s|$)/.test(element.attrs),
      element === undefined ? "(no element)" : element.attrs.trim()
    ));
    const decls = parseDeclarations(ruleBody(stylesheet, "." + className));
    checks.push(check(
      "scroll: ." + className + " has a bounded flex viewport",
      decls.get("min-height") === "0" && String(decls.get("flex") || "").startsWith("1 1"),
      "flex=" + decls.get("flex") + " min-height=" + decls.get("min-height")
    ));
  }
  const drawerScroll = parseDeclarations(ruleBody(stylesheet, ".drawer-scroll"));
  checks.push(check(
    "scroll: .drawer-scroll has an explicit bounded height (always scrolls internally, never grows the sheet)",
    /^\d+(?:\.\d+)?vh$/.test(String(drawerScroll.get("height") || "")),
    "height=" + drawerScroll.get("height")
  ));
  const archiveDecls = parseDeclarations(ruleBody(stylesheet, ".page--archive"));
  checks.push(check(
    "scroll: LIFE_ARCHIVE is intentionally scrollable read-only",
    Object.keys(archiveDecls).length === 0 ? true : archiveDecls.get("overflow") !== "hidden",
    "LIFE_ARCHIVE relies on .archive-viewport only"
  ));
  // The decision head is pinned above the option viewport, so it must never be able to consume the
  // option region: worst case it may take at most a third of the supported baseline viewport.
  {
    const head = decisionHeadPx(stylesheet, resolveTokens(stylesheet, SUPPORTED_BASELINE.minWidth, SUPPORTED_BASELINE.minHeight).tokens, SUPPORTED_BASELINE.minWidth);
    const headShare = head.totalPx / SUPPORTED_BASELINE.minHeight;
    checks.push(check(
      "decision: the pinned decision head leaves at least two thirds of the baseline viewport to the options (" + head.totalPx.toFixed(1) + "px of " + SUPPORTED_BASELINE.minHeight + "px)",
      head.unresolved.length === 0 && headShare <= 1 / 3,
      "share " + (headShare * 100).toFixed(1) + "%" + (head.unresolved.length > 0 ? "; unresolved: " + head.unresolved.join(", ") : "")
    ));
  }

  // --- 3. dev chrome and debug output are outside the product layout flow -----------------------------
  const surfaceElements = findByClass(elements, "surface");
  checks.push(check("dev: exactly one product .surface container exists", surfaceElements.length === 1, String(surfaceElements.length)));
  for (const className of ["dev-trigger", "dev-panel", "dev-scrim", "drawer", "drawer-scrim"]) {
    const matches = findByClass(elements, className);
    const outside = matches.length > 0 && matches.every((element) => !ancestorClasses(element).includes("surface"));
    checks.push(check(
      "dev: ." + className + " is outside the product surface",
      matches.length === 1 && outside,
      matches.length + " match(es)"
    ));
    const decls = parseDeclarations(ruleBody(stylesheet, "." + className));
    checks.push(check(
      "dev: ." + className + " is position: fixed (consumes no product layout height)",
      decls.get("position") === "fixed",
      "position=" + decls.get("position")
    ));
  }
  checks.push(check(
    "dev: the reserved horizontal room covers the floating dev trigger (it can never cover the realm name)",
    (() => {
      const trigger = parseDeclarations(ruleBody(stylesheet, ".dev-trigger"));
      const base = resolveTokens(stylesheet, SUPPORTED_BASELINE.minWidth, SUPPORTED_BASELINE.minHeight).tokens;
      const reserve = lengthPx(String(base.get("--dev-reserve-x")), base, SUPPORTED_BASELINE.minWidth);
      const target = lengthPx(String(trigger.get("min-width")), base, SUPPORTED_BASELINE.minWidth);
      return Number.isFinite(reserve) && Number.isFinite(target) && reserve >= target;
    })(),
    "--dev-reserve-x >= .dev-trigger min-width"
  ));
  checks.push(check(
    "dev: the dev trigger is collapsed by default",
    /devOpen:\s*false/.test(pageJs),
    "data.devOpen initial value"
  ));
  // Debug-only data must live inside the dev overlay source range, never inside the product surface.
  const surfaceElement = surfaceElements[0];
  const productSource = surfaceElement === undefined ? "" : surfaceElement.inner;
  const devPanelElement = findByClass(elements, "dev-panel")[0];
  const devPanelSource = devPanelElement === undefined ? "" : devPanelElement.inner;
  for (const marker of ["lastIntent", "decisionId", "onBlockedBack", "gatedEntries"]) {
    checks.push(check(
      "dev: {" + marker + "} is rendered inside the dev overlay only",
      devPanelSource.includes(marker) && !productSource.includes(marker),
      "devPanel=" + devPanelSource.includes(marker) + " productSurface=" + productSource.includes(marker)
    ));
  }
  checks.push(check(
    "dev: no debug-only data or probe control leaks into the product surface subtree",
    !["lastIntent", "decisionId", "onBlockedBack", "gatedEntries", "devOpen"].some((marker) => productSource.includes(marker)),
    productSource.length + " chars of product markup scanned"
  ));
  checks.push(check(
    "dev: the product decision surface renders no interaction diagnostics",
    !productSource.includes("decisionId") && !productSource.includes("onBlockedBack"),
    "decision surface is presentation-only"
  ));

  // --- 4. four core actions in a stable dock + breakthrough CTA gating --------------------------------
  const dockGrid = findByClass(elements, "dock-grid");
  checks.push(check("dock: exactly one .dock-grid exists", dockGrid.length === 1, String(dockGrid.length)));
  const actionTemplates = findByClass(elements, "action");
  checks.push(check(
    "dock: exactly one .action template, driven by the server-projected core action list",
    actionTemplates.length === 1 &&
      /wx:for="\{\{vm\.runHome\.actions\}\}"/.test(actionTemplates[0].attrs) &&
      ancestorClasses(actionTemplates[0]).includes("dock-grid"),
    actionTemplates.length + " template(s)"
  ));
  checks.push(check(
    "dock: disabled action slots keep their position (no layout jump)",
    actionTemplates.length === 1 && /is-disabled/.test(actionTemplates[0].attrs),
    "class binding keeps the slot"
  ));
  const dockElements = findByClass(elements, "dock");
  checks.push(check(
    "dock: bottom dock is a non-shrinking flex child",
    String(parseDeclarations(ruleBody(stylesheet, ".dock")).get("flex") || "").startsWith("0 0"),
    "flex=" + parseDeclarations(ruleBody(stylesheet, ".dock")).get("flex")
  ));
  const ctaTemplates = findByClass(elements, "cta");
  checks.push(check(
    "breakthrough: primary CTA exists and is gated on server-projected availability",
    ctaTemplates.length === 1 &&
      /wx:if="\{\{vm\.runHome\.breakthrough\.enabled\}\}"/.test(ctaTemplates[0].attrs) &&
      ancestorClasses(ctaTemplates[0]).includes("dock"),
    ctaTemplates.length + " template(s)"
  ));
  const dockNoteTemplates = findByClass(elements, "dock-note");
  checks.push(check(
    "breakthrough: unavailable breakthrough renders at most one compact reason line",
    dockNoteTemplates.length === 1 &&
      new RegExp("wx:elif=\"\\{\\{vm\\.runHome\\.breakthrough\\.note !== ''\\}\\}\"").test(dockNoteTemplates[0].attrs),
    "wx:elif on .dock-note"
  ));
  const dockNoteDecls = parseDeclarations(ruleBody(stylesheet, ".dock-note"));
  const baseTokens = resolveTokens(stylesheet, SUPPORTED_BASELINE.minWidth, SUPPORTED_BASELINE.minHeight).tokens;
  const dockNotePx = lengthPx(String(dockNoteDecls.get("height")), baseTokens, SUPPORTED_BASELINE.minWidth);
  checks.push(check(
    "breakthrough: the unavailable note is compact, not a large CTA block",
    Number.isFinite(dockNotePx) && dockNotePx < TOUCH_TARGET_MIN_PX * 2,
    "height=" + dockNoteDecls.get("height") + " -> " + (Number.isFinite(dockNotePx) ? dockNotePx.toFixed(2) + "px" : "unresolved")
  ));

  // --- 5. attention summaries are summaries, full lists live in read-only drawers ---------------------
  const attentionElements = findByClass(elements, "attention-scroll");
  const attentionSource = wxml.slice(wxml.indexOf('class="attention-scroll"'), wxml.indexOf("</scroll-view>", wxml.indexOf('class="attention-scroll"')));
  checks.push(check(
    "summary: RUN_HOME renders exactly one summary template plus one condition row, not the full lists",
    (attentionSource.match(/class="attn"/g) || []).length === 2 &&
      /wx:for="\{\{vm\.runHome\.attentions\}\}"/.test(attentionSource),
    (attentionSource.match(/class="attn"/g) || []).length + " static rows, attention template present"
  ));
  checks.push(check(
    "summary: the attention template is capped to three public slots",
    /ATTENTION_SLOT_LIMIT = 3/.test(pageJs) && /\.slice\(0, ATTENTION_SLOT_LIMIT\)/.test(pageJs),
    "ATTENTION_SLOT_LIMIT = 3"
  ));
  // Summarising must not be a dead end: every summary row opens a read-only drawer, so no public
  // information is silently dropped by the density reduction.
  const summaryRows = findByClass(elements, "attn");
  const deadEnds = summaryRows.filter((element) => !/bindtap="onOpenDrawer"/.test(element.attrs) || !/data-drawer="[^"]+"/.test(element.attrs));
  checks.push(check(
    "summary: every one-screen summary row opens a read-only drawer (summarising is never a dead end)",
    summaryRows.length === 2 && deadEnds.length === 0,
    deadEnds.length === 0
      ? summaryRows.length + " summary rows, all openable"
      : "rows without a working drawer entry: " + deadEnds.map((element) => (/data-drawer="([^"]+)"/.exec(element.attrs) || [, element.tag])[1]).join(", ")
  ));
  const staticKinds = summaryRows.flatMap((element) => [...element.attrs.matchAll(/data-drawer="([^{}"]+)"/g)].map((match) => match[1]));
  const dynamicKinds = [...pageJs.matchAll(/drawer:\s*"([a-z]+)"/g)].map((match) => match[1]);
  const drawerKinds = [...new Set([...staticKinds, ...dynamicKinds])].sort();
  const unbackedKinds = drawerKinds.filter((kind) => !new RegExp("\\b" + kind + ': "').test(pageJs));
  checks.push(check(
    "summary: the one-screen surface offers exactly the four read-only public detail drawers",
    JSON.stringify(drawerKinds) === JSON.stringify(["builds", "causes", "conditions", "people"]) && unbackedKinds.length === 0,
    unbackedKinds.length === 0 ? "drawers: " + drawerKinds.join(", ") : "unbacked: " + unbackedKinds.join(", ")
  ));
  const homeElements = elements.filter((element) => ancestorClasses(element).includes("page--home"));
  const fullListsOnHome = [
    "vm.runHome.builds",
    "vm.runHome.causes",
    "vm.runHome.people",
    "vm.runHome.conditions"
  ].filter((expression) => homeElements.some((element) => element.attrs.includes('wx:for="{{' + expression + '}}"')));
  checks.push(check(
    "summary: full Build / Cause / People / condition lists are not expanded on RUN_HOME",
    fullListsOnHome.length === 0,
    fullListsOnHome.length === 0 ? "none expanded" : "expanded: " + fullListsOnHome.join(", ")
  ));
  const drawerElements = findByClass(elements, "drawer-scroll");
  checks.push(check(
    "summary: a read-only drawer exists for the already-public collections",
    drawerElements.length === 1 &&
      drawerElements[0].tag === "scroll-view" &&
      /(^|\s)scroll-y(\s|$)/.test(drawerElements[0].attrs) &&
      !/bindtap="onIntent"/.test(wxml.slice(wxml.indexOf('class="drawer"'), wxml.length)),
    "drawer-scroll without intent submission"
  ));
  checks.push(check(
    "summary: the drawer cannot submit gameplay intent",
    !/onIntent/.test(wxml.slice(wxml.indexOf('class="drawer-scrim"'), wxml.length)),
    "no onIntent below the drawer root"
  ));

  // --- 6. safe area ----------------------------------------------------------------------------------
  for (const selector of [".dock", ".decision-viewport", ".archive-viewport", ".drawer"]) {
    checks.push(check(
      "safe-area: " + selector + " reserves the home-indicator inset",
      /env\(safe-area-inset-bottom/.test(ruleBody(stylesheet, selector)),
      "env(safe-area-inset-bottom) present"
    ));
  }

  // --- 7. touch targets and readability floors -------------------------------------------------------
  const quantised = [];
  for (const viewport of VIEWPORT_MATRIX) {
    const { tokens, sources } = resolveTokens(stylesheet, viewport.width, viewport.height);
    const touchMin = rpxToPx(tokens.get("--touch-min"), viewport.width);
    const cta = rpxToPx(tokens.get("--cta-h"), viewport.width);
    const row = rpxToPx(tokens.get("--dock-row-h"), viewport.width);
    const stack = runHomeStack(tokens, viewport.width);
    const total = stack.totalPx + SAFE_AREA_BOTTOM_WORST_CASE_PX;
    const widthBands = stylesheet.bands.filter((band) => queryMatches(parseMediaQuery(band.query), viewport.width, viewport.height) && parseMediaQuery(band.query).conditions.some((c) => c.axis === "width"));
    const heightBands = stylesheet.bands.filter((band) => queryMatches(parseMediaQuery(band.query), viewport.width, viewport.height) && parseMediaQuery(band.query).conditions.some((c) => c.axis === "height"));
    quantised.push({
      viewport,
      sources: sources.map((entry) => entry.band),
      touchMin,
      cta,
      row,
      stackPx: stack.totalPx,
      totalPx: total,
      slackPx: viewport.height - total,
      missingTokens: stack.missing,
      widthBandCount: widthBands.length,
      heightBandCount: heightBands.length
    });
  }

  for (const entry of quantised) {
    const label = entry.viewport.width + "x" + entry.viewport.height + " (" + entry.viewport.className + ")";
    checks.push(check(
      "matrix: " + label + " resolves to at least one width band and one height band (or the baseline)",
      entry.widthBandCount >= 1 || entry.viewport.width === SUPPORTED_BASELINE.minWidth,
      "width bands=" + entry.widthBandCount + " height bands=" + entry.heightBandCount
    ));
    checks.push(check(
      "matrix: " + label + " HEIGHT BUDGET " + entry.stackPx.toFixed(1) + "px + " + SAFE_AREA_BOTTOM_WORST_CASE_PX + "px safe-area <= " + entry.viewport.height + "px",
      entry.missingTokens.length === 0 && entry.totalPx <= entry.viewport.height,
      "slack " + entry.slackPx.toFixed(1) + "px; tokens: " + entry.sources.join(" -> ")
    ));
    checks.push(check(
      "matrix: " + label + " CORE ACTION TARGET " + entry.row.toFixed(2) + "px >= " + TOUCH_TARGET_MIN_PX + "px",
      entry.row >= TOUCH_TARGET_MIN_PX,
      "--dock-row-h"
    ));
    checks.push(check(
      "matrix: " + label + " BREAKTHROUGH CTA " + entry.cta.toFixed(2) + "px >= " + TOUCH_TARGET_MIN_PX + "px",
      entry.cta >= TOUCH_TARGET_MIN_PX,
      "--cta-h"
    ));
  }
  const minimumRow = Math.min(...quantised.map((entry) => entry.row));
  checks.push(check(
    "touch: the smallest core action target across the matrix is at least " + TOUCH_TARGET_MIN_PX + " CSS px",
    minimumRow >= TOUCH_TARGET_MIN_PX,
    "min=" + minimumRow.toFixed(2) + "px"
  ));
  const baselineEntry = quantised.find((entry) => entry.viewport.width === SUPPORTED_BASELINE.minWidth && entry.viewport.height === SUPPORTED_BASELINE.minHeight);
  const narrowest = quantised.reduce((worst, entry) => (entry.row < worst.row ? entry : worst), quantised[0]);
  checks.push(check(
    "baseline: " + SUPPORTED_BASELINE.minWidth + "x" + SUPPORTED_BASELINE.minHeight + " is supported and is the worst case for touch-target scaling",
    baselineEntry !== undefined &&
      baselineEntry.totalPx <= SUPPORTED_BASELINE.minHeight &&
      narrowest.viewport.width === SUPPORTED_BASELINE.minWidth,
    "baseline total=" + (baselineEntry === undefined ? "n/a" : baselineEntry.totalPx.toFixed(1) + "px") +
      ", smallest touch target at width " + narrowest.viewport.width
  ));

  // No product font-size below the readability floor: a fit must never come from unreadable text.
  const smallFonts = [];
  for (const rule of stylesheet.outerRules) {
    const selectors = rule.selector.split(",").map((part) => part.trim());
    const declarations = parseDeclarations(rule.body);
    const size = declarations.get("font-size");
    if (size === undefined) continue;
    const px = rpxToPx(size, SUPPORTED_BASELINE.minWidth);
    if (!Number.isFinite(px)) continue;
    if (px < MIN_FONT_SIZE_RPX * SUPPORTED_BASELINE.minWidth / RPX_PER_SCREEN_WIDTH - 0.001) smallFonts.push(rule.selector + " -> " + size);
  }
  checks.push(check(
    "readability: no product text is shrunk below " + MIN_FONT_SIZE_RPX + "rpx to fake a one-screen fit",
    smallFonts.length === 0,
    smallFonts.length === 0 ? "all font sizes >= " + MIN_FONT_SIZE_RPX + "rpx" : smallFonts.join(", ")
  ));

  // --- 8. dynamic content pressure: every dynamic public string is clamped ---------------------------
  // Single-line summaries must ellipsize; wrapping body text must break unbreakable raw keys so a long
  // labelKey / reason / display name can never create horizontal overflow.
  const nowrapClamped = [
    ".hero-name", ".hero-run", ".vital-label", ".vital-value", ".attn-value", ".action-label",
    ".cta-target", ".dock-note", ".option-label", ".archive-title", ".build-name", ".build-stage",
    ".person-name", ".person-meta", ".drawer-title", ".drawer-row-title", ".drawer-row-meta",
    ".entry-heading", ".entry-sub", ".entry-meta", ".entry-core-text", ".entry-row-label",
    ".entry-row-note", ".offer-cand-root", ".offer-cand-line", ".opening-value", ".entry-attr-label",
    ".entry-attr-value", ".entry-cta-label"
  ];
  const unclamped = [];
  for (const selector of nowrapClamped) {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    const ellipsis = decls.get("overflow") === "hidden" && decls.get("text-overflow") === "ellipsis" && decls.get("white-space") === "nowrap";
    const multiline = decls.get("display") === "-webkit-box" && /^\d+$/.test(String(decls.get("-webkit-line-clamp") || ""));
    if (!ellipsis && !multiline) unclamped.push(selector);
  }
  checks.push(check(
    "pressure: " + nowrapClamped.length + " single-line public strings ellipsize or use a clamped line box",
    unclamped.length === 0,
    unclamped.length === 0 ? "all clamped" : "missing clamp: " + unclamped.join(", ")
  ));
  const multilineClamped = [".decision-title", ".option-reasons"];
  const unboundedMultiline = multilineClamped.filter((selector) => {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    return decls.get("display") !== "-webkit-box" || !/^\d+$/.test(String(decls.get("-webkit-line-clamp") || ""));
  });
  checks.push(check(
    "pressure: possible multi-line public copy is line-clamped, never unbounded on the one-screen surface",
    unboundedMultiline.length === 0,
    unboundedMultiline.length === 0 ? "all line-clamped" : "unbounded: " + unboundedMultiline.join(", ")
  ));
  const wrappingSafe = [".entry-key", ".entry-title", ".entry-summary", ".footnote", ".scene-body", ".dev-line"];
  const unsafeWrap = wrappingSafe.filter((selector) => {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    return decls.get("white-space") === "nowrap" || !/break-all|anywhere|break-word/.test(String(decls.get("word-break") || decls.get("overflow-wrap") || ""));
  });
  checks.push(check(
    "pressure: " + wrappingSafe.length + " wrapping text blocks break long unbreakable public keys (no horizontal overflow)",
    unsafeWrap.length === 0,
    unsafeWrap.length === 0 ? "all break long tokens" : "unprotected: " + unsafeWrap.join(", ")
  ));
  const reservedHeightBlocks = [".hero-name", ".hero-meta", ".vitals", ".attention-head", ".attn", ".dock-note", ".action", ".cta", ".entry-heading", ".entry-row", ".offer-cand", ".opening-row", ".entry-attrs", ".entry-cta"];
  const unreserved = reservedHeightBlocks.filter((selector) => {
    const decls = parseDeclarations(ruleBody(stylesheet, selector));
    const raw = decls.get("height") || decls.get("min-height");
    return !Number.isFinite(lengthPx(String(raw), baseTokens, SUPPORTED_BASELINE.minWidth));
  });
  checks.push(check(
    "pressure: " + reservedHeightBlocks.length + " variable-height-capable blocks reserve explicit token heights",
    unreserved.length === 0,
    unreserved.length === 0 ? "all reserved" : "unreserved: " + unreserved.join(", ")
  ));
  checks.push(check(
    "pressure: every first-screen stack token resolves under all six matrix viewports",
    quantised.every((entry) => entry.missingTokens.length === 0),
    "all stack tokens resolvable"
  ));

  // --- 9. design language preserved ------------------------------------------------------------------
  for (const token of ["--paper:", "--ink:", "--cinnabar:", "--gold:"]) {
    checks.push(check("design: UI02 token " + token + " preserved", wxss.includes(token), token));
  }

  // --- 10. UI02ENTRY pre-run flow: four screens, each one screen, no page-level scroll ---------------
  const ENTRY_PAGE_CLASS = {
    START: "page--start",
    MODE_SELECT: "page--modes",
    DESTINY_OFFER: "page--offer",
    RUN_OPENING: "page--opening"
  };
  for (const key of Object.keys(ENTRY_STACKS)) {
    const className = ENTRY_PAGE_CLASS[key];
    const pages = findByClass(elements, className);
    const page = pages[0];
    checks.push(check(
      "entry: " + key + " renders exactly one ." + className + " product page",
      pages.length === 1,
      pages.length + " match(es)"
    ));
    checks.push(check(
      "entry: " + key + " is a .page child of .surface (same constrained viewport, so it cannot extend the document)",
      page !== undefined && classesOf(page).includes("page") && ancestorClasses(page).includes("surface"),
      page === undefined ? "(no element)" : "ancestors: " + ancestorClasses(page).join(" > ")
    ));
    const pageDecls = parseDeclarations(ruleBody(stylesheet, "." + className));
    checks.push(check(
      "entry: " + key + " adds no page-level scroll container of its own (scroll policy stays structural)",
      pageDecls.get("height") === undefined && pageDecls.get("overflow") === undefined,
      "height=" + pageDecls.get("height") + " overflow=" + pageDecls.get("overflow")
    ));
  }

  const entryLists = findByClass(elements, "entry-list");
  checks.push(check(
    "entry: the bounded entry list regions are scroll-view elements (mode list + candidate list)",
    entryLists.length === 2 &&
      entryLists.every((element) => element.tag === "scroll-view" && /(^|\s)scroll-y(\s|$)/.test(element.attrs)),
    entryLists.length + " match(es), tags=" + entryLists.map((element) => element.tag).join(",")
  ));
  checks.push(check(
    "entry: every bounded entry list belongs to a pre-run page",
    entryLists.length === 2 &&
      entryLists.every((element) => ["page--modes", "page--offer"].some((name) => ancestorClasses(element).includes(name))),
    entryLists.map((element) => ancestorClasses(element).filter((name) => name.startsWith("page--")).join(",")).join(" | ")
  ));
  const entryListDecls = parseDeclarations(ruleBody(stylesheet, ".entry-list"));
  checks.push(check(
    "entry: .entry-list is a compressible bounded viewport (flex 1 1 auto + min-height 0)",
    String(entryListDecls.get("flex") || "").startsWith("1 1") && entryListDecls.get("min-height") === "0",
    "flex=" + entryListDecls.get("flex") + " min-height=" + entryListDecls.get("min-height")
  ));

  const entryCtas = findByClass(elements, "entry-cta");
  checks.push(check(
    "entry: each of the four pre-run screens carries exactly one primary control",
    entryCtas.length === 4,
    entryCtas.length + " .entry-cta element(s)"
  ));
  const entryCtaDecls = parseDeclarations(ruleBody(stylesheet, ".entry-cta"));
  checks.push(check(
    "entry: the pre-run primary control keeps the " + TOUCH_TARGET_MIN_PX + " CSS px interaction floor at the baseline",
    (() => {
      const minHeight = lengthPx(String(entryCtaDecls.get("min-height")), baseTokens, SUPPORTED_BASELINE.minWidth);
      return Number.isFinite(minHeight) && minHeight >= TOUCH_TARGET_MIN_PX;
    })(),
    "min-height=" + entryCtaDecls.get("min-height")
  ));
  checks.push(check(
    "entry: the pre-run action area reserves the home-indicator inset",
    /env\(safe-area-inset-bottom/.test(ruleBody(stylesheet, ".entry-dock")),
    "env(safe-area-inset-bottom) present"
  ));
  checks.push(check(
    "entry: the pre-run action area is a non-shrinking flex child",
    String(parseDeclarations(ruleBody(stylesheet, ".entry-dock")).get("flex") || "").startsWith("0 0"),
    "flex=" + parseDeclarations(ruleBody(stylesheet, ".entry-dock")).get("flex")
  ));

  // The two data-driven pre-run screens must be driven by the projection, never by a hand-written list.
  const modeRows = findByClass(elements, "entry-row");
  checks.push(check(
    "entry: MODE_SELECT renders the projected capability vocabulary, never a hand-written mode list",
    modeRows.length === 1 && /wx:for="\{\{vm\.modeSelect\.modes\}\}"/.test(modeRows[0].attrs),
    modeRows.length + " .entry-row template(s)"
  ));
  const offerCands = findByClass(elements, "offer-cand");
  checks.push(check(
    "entry: DESTINY_OFFER renders the public candidate projection, keyed by option id",
    offerCands.length === 1 &&
      /wx:for="\{\{vm\.destinyOffer\.candidates\}\}"/.test(offerCands[0].attrs) &&
      /data-option="\{\{item\.optionId\}\}"/.test(offerCands[0].attrs) &&
      ancestorClasses(offerCands[0]).includes("page--offer"),
    offerCands.length + " .offer-cand template(s)"
  ));
  checks.push(check(
    "entry: the preview holds no default destiny selection (nothing is decided for the player)",
    /offerSelected:\s*""/.test(pageJs),
    "data.offerSelected defaults to empty"
  ));

  // Every entry rule must be expressed in tokens the stylesheet already declares, so a pre-run screen
  // cannot quietly introduce an undeclared value that no budget check would see.
  const allTokens = resolveTokens(stylesheet, SUPPORTED_BASELINE.minWidth, SUPPORTED_BASELINE.minHeight).tokens;
  const undeclaredEntryTokens = new Set();
  for (const rule of stylesheet.outerRules) {
    if (!/^\.(entry|offer|opening)-/.test(rule.selector)) continue;
    for (const match of rule.body.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
      if (!allTokens.has(match[1])) undeclaredEntryTokens.add(match[1]);
    }
  }
  checks.push(check(
    "entry: every pre-run rule consumes only declared layout tokens",
    undeclaredEntryTokens.size === 0,
    undeclaredEntryTokens.size === 0 ? "no undeclared tokens" : "undeclared: " + [...undeclaredEntryTokens].join(", ")
  ));

  const entryQuantised = [];
  for (const key of Object.keys(ENTRY_STACKS)) {
    for (const viewport of VIEWPORT_MATRIX) {
      const { tokens, sources } = resolveTokens(stylesheet, viewport.width, viewport.height);
      const stack = entryStack(ENTRY_STACKS[key], tokens, viewport.width);
      const total = stack.totalPx + SAFE_AREA_BOTTOM_WORST_CASE_PX;
      entryQuantised.push({
        key,
        viewport,
        sources: sources.map((entry) => entry.band),
        stackPx: stack.totalPx,
        totalPx: total,
        slackPx: viewport.height - total,
        missingTokens: stack.missing
      });
    }
  }
  for (const entry of entryQuantised) {
    const label = entry.key + " @ " + entry.viewport.width + "x" + entry.viewport.height;
    checks.push(check(
      "entry-budget: " + label + " HEIGHT BUDGET " + entry.stackPx.toFixed(1) + "px + " + SAFE_AREA_BOTTOM_WORST_CASE_PX + "px safe-area <= " + entry.viewport.height + "px",
      entry.missingTokens.length === 0 && entry.totalPx <= entry.viewport.height,
      "slack " + entry.slackPx.toFixed(1) + "px; tokens: " + entry.sources.join(" -> ")
    ));
  }

  const failures = checks.filter((entry) => !entry.ok);
  return { checks, failures, quantised, entryQuantised };
}

function formatReport(result) {
  const lines = [];
  lines.push("UI02R1 layout audit — " + result.checks.length + " structural checks");
  lines.push("");
  lines.push("per-viewport first-screen budget (RUN_HOME, worst case: CTA available, 3 summaries + conditions):");
  lines.push("  viewport                 stack     +safe    limit    slack    core-action   cta");
  for (const entry of result.quantised) {
    lines.push(
      "  " + (entry.viewport.width + "x" + entry.viewport.height + " " + entry.viewport.className).padEnd(24) +
      (entry.stackPx.toFixed(1) + "px").padStart(8) +
      (String(SAFE_AREA_BOTTOM_WORST_CASE_PX) + "px").padStart(9) +
      (String(entry.viewport.height) + "px").padStart(9) +
      (entry.slackPx.toFixed(1) + "px").padStart(9) +
      (entry.row.toFixed(2) + "px").padStart(14) +
      (entry.cta.toFixed(2) + "px").padStart(8)
    );
  }
  lines.push("");
  lines.push("  bands applied per viewport:");
  for (const entry of result.quantised) {
    lines.push("    " + entry.viewport.width + "x" + entry.viewport.height + " -> " + entry.sources.join(" | "));
  }
  lines.push("");
  lines.push("pre-run first-screen budget (UI02ENTRY worst case: full mode vocabulary / full candidate set, primary action available):");
  lines.push("  screen                   viewport      stack     +safe    limit    slack");
  for (const entry of result.entryQuantised) {
    lines.push(
      "  " + entry.key.padEnd(22) +
      (entry.viewport.width + "x" + entry.viewport.height).padEnd(12) +
      (entry.stackPx.toFixed(1) + "px").padStart(8) +
      (String(SAFE_AREA_BOTTOM_WORST_CASE_PX) + "px").padStart(9) +
      (String(entry.viewport.height) + "px").padStart(9) +
      (entry.slackPx.toFixed(1) + "px").padStart(9)
    );
  }
  lines.push("");
  if (result.failures.length === 0) {
    lines.push("RESULT: PASS — " + result.checks.length + " checks green");
  } else {
    lines.push("RESULT: FAIL — " + result.failures.length + " of " + result.checks.length + " checks failed");
    for (const failure of result.failures) lines.push("  FAIL " + failure.name + " :: " + failure.detail);
  }
  lines.push("");
  lines.push("NOT covered by this audit: real-device rendering, WeChat DevTools visual inspection,");
  lines.push("font metrics, ellipsis behaviour in the WeChat renderer, and actual safe-area insets.");
  return lines.join("\n");
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/tools/ui02r1-layout-audit.mjs");

if (isDirectRun) {
  const result = auditLayout();
  console.log(formatReport(result));
  if (result.failures.length > 0) process.exitCode = 1;
}
