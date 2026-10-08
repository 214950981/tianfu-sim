import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const WXML = "miniprogram/pages/v2-live/v2-live.wxml";
const PAGE_JS = "miniprogram/pages/v2-live/v2-live.js";

/** The copy that identifies the informational fallback block. Unique in the file. */
const FALLBACK_COPY = "当前页面状态由服务器投影给出";

/**
 * Every server page state the page claims to render, plus one genuinely unknown state.
 * Ordered as the task enumerates them; `null` is the unsupported case.
 */
const KNOWN_PAGE_STATES = [
  "DESTINY_OFFER",
  "RUN_HOME",
  "EVENT",
  "SPECIAL_NODE",
  "ENDING",
  "LIFE_BOOK",
  "REBIRTH_RESULT",
  "NEXT_LIFE"
];
const UNKNOWN_PAGE_STATE = "SOME_FUTURE_SERVER_STATE";

// --------------------------------------------------------------------------- markup model

/**
 * Collect the opening tags that are direct children of the `<block wx:else>` container holding the
 * ready surfaces, in document order, together with the element text each one owns.
 *
 * Depth is tracked generically so a nested `<view class="block">` (which is what the fallback
 * itself is) is never mistaken for a chain member of its parent.
 */
function surfaceChain(wxml) {
  const openTag = "<block wx:else>";
  const containerStart = wxml.indexOf(openTag);
  assert.notEqual(containerStart, -1, "the ready-surface <block wx:else> container must exist");
  const containerEnd = wxml.indexOf("</block>", containerStart);
  assert.notEqual(containerEnd, -1, "the ready-surface container must be closed");
  // Start AFTER the container's own opening tag, so depth 0 means "direct child of the container".
  const bodyStart = containerStart + openTag.length;
  const body = wxml.slice(bodyStart, containerEnd);

  const tagPattern = /<(\/?)([a-zA-Z-]+)([^>]*?)(\/?)>/g;
  const elements = [];
  let depth = 0;
  let current = null;
  let match;
  while ((match = tagPattern.exec(body)) !== null) {
    const [raw, closing, name, attrs, selfClosing] = match;

    if (closing === "/") {
      depth -= 1;
      assert.notEqual(depth, -1, `unbalanced </${name}> in the ready-surface container`);
      if (depth === 0 && current !== null) {
        current.end = match.index + raw.length;
        elements.push(current);
        current = null;
      }
      continue;
    }
    if (selfClosing === "/") {
      if (depth === 0) elements.push({ name, attrs, start: match.index, end: match.index + raw.length });
      continue;
    }
    if (depth === 0) current = { name, attrs, start: match.index, end: -1 };
    depth += 1;
  }

  assert.equal(depth, 0, "every element in the container must be closed");
  assert.equal(current, null, "no direct child may be left open");
  // Report offsets in whole-document coordinates so callers can slice `wxml` directly.
  for (const element of elements) {
    element.start += bodyStart;
    element.end += bodyStart;
  }
  return elements;
}

/** The `wx:if` / `wx:elif` / `wx:else` directive of an element, or null when it has none. */
function directiveOf(element) {
  const ifMatch = /\swx:if\s*=\s*"\{\{([^"]*)\}\}"/.exec(element.attrs);
  if (ifMatch !== null) return { kind: "if", condition: ifMatch[1] };
  const elifMatch = /\swx:elif\s*=\s*"\{\{([^"]*)\}\}"/.exec(element.attrs);
  if (elifMatch !== null) return { kind: "elif", condition: elifMatch[1] };
  if (/\swx:else\b/.test(element.attrs)) return { kind: "else", condition: null };
  return null;
}

/**
 * Compile a WXML expression to a predicate.
 *
 * The fallback condition is plain JavaScript once the moustache is stripped (`!`, `&&`, `===` and
 * `vm.x` are all valid JS), so no bespoke parser is needed — but the character allow-list is
 * fail-closed: an expression outside it throws instead of being silently mis-evaluated.
 */
function compileCondition(expression) {
  assert.match(
    expression,
    /^[A-Za-z0-9_.\s!&=<>'"|()?:+-]+$/,
    `refusing to evaluate unsupported WXML expression: ${expression}`
  );
  const factory = new Function("vm", `return (${expression});`);
  return (vm) => Boolean(factory(vm));
}

/**
 * Does the fallback block render for this `vm`?
 *
 * Modelled with real WXML chain semantics: a chain is a run of `wx:if` / `wx:elif` / `wx:else`
 * siblings, and exactly one member of a chain may render — the first whose condition holds, or
 * the `wx:else` if every earlier member was false. This is precisely why the original markup was
 * wrong: its `wx:else` sat at the end of the TERMINAL chain, so it matched on every non-terminal
 * state.
 */
function fallbackRenders(wxml, vm) {
  const elements = surfaceChain(wxml);
  const fallback = elements.find((element) => wxml.slice(element.start, element.end).includes(FALLBACK_COPY));
  assert.notEqual(fallback, undefined, `the fallback block (${FALLBACK_COPY}) must exist in the markup`);
  const own = directiveOf(fallback);
  assert.notEqual(own, null, "the fallback block must carry an explicit wx:if condition");

  // Walk back to the head of the chain this element belongs to. A chain is terminated by an
  // `wx:if` (which OPENS a chain), so stop as soon as the current element is itself an `wx:if` —
  // looking at the *previous* element instead would run past this chain's head into the preceding
  // one and silently evaluate the wrong chain.
  const index = elements.indexOf(fallback);
  let head = index;
  while (head > 0 && directiveOf(elements[head]).kind !== "if") head -= 1;

  for (let at = head; at <= index; at += 1) {
    const element = elements[at];
    const directive = directiveOf(element);
    if (directive === null) continue;
    if (directive.kind === "else") return true;
    if (compileCondition(directive.condition)(vm)) return at === index;
  }
  // An `wx:if` head that does not hold simply renders nothing.
  return false;
}

// --------------------------------------------------------------------------- vm fixtures

/**
 * The page's own discriminators, mirrored. `LIVEFIX05_page_js` asserts the real page source still
 * states exactly these predicates, so this table cannot silently drift away from the product.
 */
function vmForPageState(pageState) {
  const isTerminal =
    pageState === "ENDING" ||
    pageState === "LIFE_BOOK" ||
    pageState === "REBIRTH_RESULT" ||
    pageState === "NEXT_LIFE";
  return {
    pageState,
    pageStateLabel: pageState,
    isOffer: pageState === "DESTINY_OFFER",
    isHome: pageState === "RUN_HOME",
    isDecision: pageState === "EVENT" || pageState === "SPECIAL_NODE",
    isTerminal,
    // The real page always publishes a `terminal` projection (buildTerminal keys it off pageState),
    // so a terminal state must be able to satisfy its own `vm.terminal.is…` branch. A null here
    // would make every terminal branch unreachable and the negative control would "leak" on all
    // eight states — a fixture artefact, not the defect.
    terminal: {
      isEnding: pageState === "ENDING",
      isLifeBook: pageState === "LIFE_BOOK",
      isRebirthResult: pageState === "REBIRTH_RESULT",
      isNextLife: pageState === "NEXT_LIFE"
    }
  };
}

test("LIVEFIX05_page_js: the page still derives exactly the discriminators the markup tests against", () => {
  const source = read(PAGE_JS);
  for (const predicate of [
    'isOffer: pageState === "DESTINY_OFFER"',
    'isHome: pageState === "RUN_HOME"',
    'isDecision: pageState === "EVENT" || pageState === "SPECIAL_NODE"',
    'isTerminal: pageState === "ENDING" || pageState === "LIFE_BOOK" || pageState === "REBIRTH_RESULT" || pageState === "NEXT_LIFE"'
  ]) {
    assert.ok(source.includes(predicate), `v2-live.js must keep the predicate: ${predicate}`);
  }
});

test("LIVEFIX05_fallback: no known page state renders the server-projection fallback", () => {
  const wxml = read(WXML);
  for (const pageState of KNOWN_PAGE_STATES) {
    assert.equal(
      fallbackRenders(wxml, vmForPageState(pageState)),
      false,
      `${pageState} is a rendered view and must not also show the unsupported-state fallback`
    );
  }
});

test("LIVEFIX05_fallback: only a genuinely unknown state renders the fallback", () => {
  const wxml = read(WXML);
  assert.equal(
    fallbackRenders(wxml, vmForPageState(UNKNOWN_PAGE_STATE)),
    true,
    "an unsupported server projection must still tell the player the page has no local action for it"
  );
});

test("LIVEFIX05_markup: the fallback is an explicit condition, not the terminal chain's wx:else", () => {
  const wxml = read(WXML);
  const elements = surfaceChain(wxml);
  const fallback = elements.find((element) => wxml.slice(element.start, element.end).includes(FALLBACK_COPY));
  const own = directiveOf(fallback);

  assert.equal(own.kind, "if", "the fallback must use wx:if with an explicit condition");
  assert.ok(
    own.condition.includes("vm.isOffer") &&
      own.condition.includes("vm.isHome") &&
      own.condition.includes("vm.isDecision") &&
      own.condition.includes("vm.isTerminal"),
    `the fallback must negate every rendered-view discriminator, got: ${own.condition}`
  );

  // The regression itself, stated structurally: an `wx:if` OPENS a chain, so the fallback is
  // evaluated on its own condition and can never be swallowed by — or inherit — the terminal
  // chain above it. Asserted positively via the chain head, not by inspecting the previous
  // sibling: the element above may legitimately be a `wx:elif`, and it is precisely the case
  // that used to break.
  const index = elements.indexOf(fallback);
  let head = index;
  while (head > 0 && directiveOf(elements[head]).kind !== "if") head -= 1;
  assert.equal(
    head,
    index,
    "the fallback must be the wx:if that opens its own chain, not a member of the terminal chain"
  );
});

test("LIVEFIX05_negative_control: the original terminal-chain wx:else reproduces the leak", () => {
  const wxml = read(WXML);
  const fixed = 'wx:if="{{!vm.isOffer && !vm.isHome && !vm.isDecision && !vm.isTerminal}}"';
  assert.ok(wxml.includes(fixed), "the corrected condition must be present for this control to be meaningful");

  // Surgical mutation, anchored: assert the anchor first so a rename cannot make this pass silently.
  const regressed = wxml.replace(fixed, "wx:else");
  assert.notEqual(regressed, wxml, "the mutation must actually apply");

  const leaked = KNOWN_PAGE_STATES.filter((pageState) => fallbackRenders(regressed, vmForPageState(pageState)));
  assert.deepEqual(
    leaked,
    ["DESTINY_OFFER", "RUN_HOME", "EVENT", "SPECIAL_NODE"],
    "the original markup must be shown to leak the fallback on exactly the non-terminal views"
  );
  assert.equal(
    fallbackRenders(regressed, vmForPageState(UNKNOWN_PAGE_STATE)),
    true,
    "and the unsupported state must still have fallen through to it"
  );
});

test("LIVEFIX05_preserved: server-projected options, handlers and every terminal CTA survive", () => {
  const wxml = read(WXML);
  for (const binding of [
    'wx:for="{{vm.offerCandidates}}"',
    'data-option-id="{{item.optionId}}" bindtap="onOption"',
    'wx:for="{{vm.options}}"',
    "vm.terminal.isEnding",
    "vm.terminal.isLifeBook",
    "vm.terminal.isRebirthResult",
    "vm.terminal.isNextLife",
    'wx:if="{{vm.terminalCta}}"',
    'bindtap="onTerminalAdvance"',
    'bindtap="onStartNextLife"',
    "开启下一世"
  ]) {
    assert.ok(wxml.includes(binding), `v2-live.wxml must keep: ${binding}`);
  }
  // One CTA for each terminal projection that is supposed to advance, plus the explicit next-life start.
  const advanceCount = wxml.split('bindtap="onTerminalAdvance"').length - 1;
  assert.equal(advanceCount, 3, "ENDING, LIFE_BOOK and REBIRTH_RESULT keep exactly their advance CTA");
});