# UI04E / UI04E-R1 — Terminal Lifecycle & Multi-Life Boundary

This document describes the terminal presentation lifecycle for the 2.0 WeChat live client.

## What UI04E built

The terminal projection is a bounded, presentation-only sidecar that drives a run from gameplay
end-of-life (`dying` / `ended` / has `ending` / has `deathRecord`) through four authoritative pages:

```
ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE
```

Each advance is settled by a single server-authoritative RPC, `advanceTerminal`. The settlement
*never* mutates `GameState` (stateVersion, age, nodeIndex, RNG, commandLog, snapshot, causes,
NPC state, resources, builds, history all stay byte-identical across a pure transition). It only
bumps a per-run sidecar, persists an exactly-once receipt, and returns the new authoritative
stage. The terminal projection lives entirely on the server; the client renders whichever page the
server publishes.

## What UI04E-R1 corrected

The first UI04E commit (`wb-UI04E` @ `e978ac0`) was rejected because it created the next life
*inside* `advanceTerminal` on the `REBIRTH_RESULT -> NEXT_LIFE` edge and auto-rotated the client
into the new run. The Controller ruled that **arriving at NEXT_LIFE is not the same operation as
starting the next life**. UI04E-R1 separates the two:

### Server invariants

- `advanceTerminal` NEVER creates a new run document.
- `advanceTerminal` NEVER writes a bootstrap mapping.
- `advanceTerminal` NEVER returns `nextBootstrapId` or `nextRunId` on the success envelope.
- The `TerminalTransitionRecord` receipt never carries `nextBootstrapId` or `nextRunId`.
- The runs collection holds exactly one entry before and after every `advanceTerminal` call.
- The bootstraps collection holds exactly one entry before and after every `advanceTerminal` call.
- The OLD run's canonical gameplay bytes are byte-identical before and after a NEXT_LIFE advance.

### Client invariants (the explicit "开启下一世" CTA)

- The NEXT_LIFE page exposes an explicit `开启下一世` button bound to `onStartNextLife`.
- Before calling `controller.startNextLife`, the page reads a dedicated pending storage key
  (`tianfu2:next-life-bootstrap-id`):
  - if absent, mints a new pending bootstrap id (`next-life:<timestamp>:<sequence>`) and persists it;
  - if present (retry/reload), reuses it without rotation.
- The OLD current-bootstrap key (`tianfu2:bootstrap-id`) is left untouched while `createRunOffer`
  is pending or fails.
- If the server commits but the response is lost, the next user retry/reload calls `createRunOffer`
  with the SAME pending bootstrap id. UI04D's bootstrap idempotency returns the same new run
  (never a second new run).
- Only after a successful `createRunOffer` does the page:
  - promote the pending id to the current bootstrap key;
  - clear the pending key;
  - let the controller switch session/runId to the returned run.
- On failure, the pending key is left intact so the next retry can re-issue the same request.

### RPC contract

`ApplicationTransport.advanceTerminal`:

```typescript
advanceTerminal(request: {
  runId: string;
  terminalTransitionId: string;       // exactly-once key
  expectedTerminalStage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
  action: "advance-to-life-book" | "advance-to-rebirth-result" | "advance-to-next-life";
}): Promise<{
  ok: true;
  terminalTransitionId: string;
  stage: "ENDING" | "LIFE_BOOK" | "REBIRTH_RESULT" | "NEXT_LIFE";
  version: number;
} | {
  ok: false;
  terminalTransitionId: string;
  error: { code: string; messageKey: string; retryable: boolean };
}>;
```

The success envelope carries ONLY `stage` and `version` for the OLD run. `nextBootstrapId` /
`nextRunId` are NOT part of the contract; a hostile or legacy server injecting them is ignored by
`parseAdvanceTerminalResult`, not surfaced.

### Fail-closed semantics

`TerminalFlowError` codes (server-side):

- `INVALID_COMMAND` — malformed envelope, unknown stage/action, reused id with a different payload;
- `INVALID_OPTION` — `terminal.not_reached` (run is not end-of-life), `terminal.stage_unknown`,
  `terminal.action_unknown`, `terminal.stage_action_mismatch`;
- `STATE_CONFLICT` — `terminal.stage_drift` (current sidecar stage does not match `expectedTerminalStage`);
- `UNAUTHORIZED` — `run.not_owned`, `auth.player_mismatch`;
- `TRANSIENT` — `terminal.post_commit_timeout` (host wraps the platform-level timeout so the
  client retries with the same `terminalTransitionId`; the exactly-once path then returns the
  recorded result).

The terminal graph refuses to skip stages: the only legal forward edges are
`ENDING -> LIFE_BOOK`, `LIFE_BOOK -> REBIRTH_RESULT`, `REBIRTH_RESULT -> NEXT_LIFE`. Any other
edge fails closed with `INVALID_OPTION`.

## Why the new life is created by `createRunOffer`, not a fifth RPC

The terminal flow is presentation/session orchestration. The next-life creation is a real
*gameplay* lifecycle event (mint a fresh `rootSeed`, build an offered `GameState`, persist it,
register a bootstrap mapping). Routing it through the already-accepted `createRunOffer` RPC:

- preserves the UI04D bootstrap idempotency contract;
- keeps the playerId identity on the OPENID-derived trusted path (no new identity surface);
- gives the client a single, well-tested place to drive the lifecycle instead of a fifth cloud
  RPC with overlapping semantics;
- avoids inventing a fake `GameCommand` that would have to be wired into the gateway's envelope
  validator just to start the next life.

## Architectural placement

```
viewmodel-sidecar
└─ server/src/terminal-flow.ts      (NEW — owns advanceTerminal flow; sidecar-only on NEXT_LIFE)
   └─ server/src/gateway-store.ts   (TerminalSidecar + terminal transition receipts)
   └─ server/src/cloudbase-store.ts (added 4th collection: tianfu2_terminal_transitions)
   └─ server/src/live-service.ts    (advanceTerminal RPC; maps PostCommitTimeout to TRANSIENT)
   └─ server/src/viewmodel.ts       (terminal projection: LIFE_BOOK / REBIRTH_RESULT / NEXT_LIFE)
   └─ packages/platform-contract/src (advanceTerminal + terminal PublicState projection)
   └─ packages/wechat-shell/src     (controller.advanceTerminal + startNextLife(pendingId))
   └─ cloudfunctions/tianfu2/index.js (4th operation: advanceTerminal)
   └─ miniprogram/pages/v2-live/*    (4-stage render + explicit 开启下一世 CTA + pending-bootstrap lifecycle)
   └─ miniprogram/runtime            (regenerated artifact: advanceTerminal + TerminalUnavailableError)
   └─ cloudfunctions/tianfu2/runtime  (regenerated artifact: terminal-flow module + facade exports)
```

## What the client renders

```
ENDING         — 翻阅人生书   (cta: advance-to-life-book)
LIFE_BOOK      — public life facts: build count, people count, events count, ending/death facts
                (cta: advance-to-rebirth-result)
REBIRTH_RESULT — 此世回望      (cta: advance-to-next-life)
NEXT_LIFE      — 此生已入卷宗   (cta: 开启下一世 → startNextLife(persistedPendingBootstrapId))
```

The page persists the pending next-life bootstrap id via a dedicated pending storage key
(`tianfu2:next-life-bootstrap-id`, separate from the current bootstrap key) and re-sends it
through `createRunOffer` on the explicit CTA. Only after `createRunOffer` succeeds does the page
promote the pending id to the current bootstrap key and clear the pending key, so a retry or
reload on the NEXT_LIFE page never rotates a fresh bootstrap.

## Forbidden scope (held from earlier tasks)

- **No** `terminalStage` field on `GameState` (asserted in `UI04E_sidecar`).
- **No** reducer change, no Director policy change, no RNG algorithm change, no Progression/Risk
  balance change, no Content rebalance, no new meta-currency, no new rebirth reward system, no
  daily-challenge, no monetization, no default-route replacement, no 1.0 page change, no tabBar
  change, no real production deployment, no `UI04FINAL`, no source-branch push.
- Terminal navigation is **not** a `GameCommand`: no `commandId`/`expectedStateVersion`/command log,
  no reducer, no `STATE_CONFLICT` from the gateway.
- **No** fifth cloud RPC: `createRunOffer` is the only place next-life creation happens.
- **No** automatic run-switch on `REBIRTH_RESULT -> NEXT_LIFE`: the controller's `runId` stays on
  the old run until the explicit `startNextLife` CTA succeeds.
- The cloud runtime closure is unchanged in shape: only `server/src/terminal-flow.ts` is added;
  the facade exposes `TerminalFlowError` and `parseAdvanceTerminalRequest`.
- `wx-server-sdk` stays confined to `cloudfunctions/tianfu2/package.json` (asserted in `UI04E_audit`).
- The transactional CloudBase path still addresses documents by deterministic id and never queries
  (asserted in `UI04E_artifact_scope`).

## Verification gates run

The fast-lane protocol was honored: `runAggregateNpmTest` and `rerunKnownSandboxBaseline` are
explicitly waived. The named gates:

- `ui04e-r1` (dedicated 9-test suite for the corrected boundary) — covers server invariants
  (no next-run document, no bootstrap mapping, byte-identical gameplay, receipts carry no
  next-run ids), cloud-host invariants, client invariants (parseAdvanceTerminalResult refuses
  hostile injection, startNextLife refuses a foreign playerId / same runId), page invariants
  (explicit NEXT_LIFE CTA, pending-bootstrap lifecycle, no auto-call to startNextLife from
  advanceTerminal), and stage-skip refusal.
- `ui04e` (dedicated 26-test suite) — updated to assert the R1 semantics: advanceTerminal never
  publishes nextBootstrapId/nextRunId; advanceTerminal receipts never carry them; the controller's
  current runId does not auto-switch on NEXT_LIFE; parseAdvanceTerminalResult silently drops
  hostile next-run identifiers; v2-live exposes onStartNextLife + pending-bootstrap helpers and
  binds the CTA in the WXML.
- `ui04d`, `server-gateway`, `ui04c`, `viewmodel-ui` — green (no regression).
- `cloud-runtime-artifact-freshness` / `cloud-runtime-dependency-audit` / `cloud-runtime-smoke` —
  green; the new `terminal-flow.ts` module is part of the closure and `TERMINAL_TRANSITIONS_COLLECTION`
  is wired through the deterministic document id.
- `wechat-runtime-artifact` — green; `TerminalUnavailableError` and `advanceTerminal` are reachable
  from the facade.
- `typecheck` — clean.
- `lint` — clean (import boundaries unchanged).
- `secret-scan` — clean; the new code does not introduce any new credentials.
- `content01-lint` — clean (content unchanged).
- `route-guard` — clean (1.0 pages and tabBar untouched).

## Known gaps left for `UI04FINAL`

These are **not** UI04E_R1's scope (and the controller refuses them via `TerminalUnavailableError`):

- Default-route swap into `v2-live` (`app.json` first page is still `pages/start/start`).
- Real production deployment of `cloudfunctions/tianfu2` (the host is exercised via the committed
  fake harness — see `tools/ui04d-cloud-harness.mjs`).
- Multi-user acceptance under a real `OPENID` (only Alice and Bob fake-openids are used here).

The `UI04FINAL` controller-review ticket should pick those up exactly the way the protocol fields
suggest.

## Tooling observations (new)

- **Server-side `advanceTerminal` no longer needs entropy / metaView / offerFixture / schemaVersion.**
  Removing these from the `AdvanceTerminalContext` made the sidecar-only boundary explicit at the
  type level. Any future task that wants to add a fifth RPC for next-life creation must justify
  why `createRunOffer` is not enough.
- **`parseAdvanceTerminalResult` silently drops next-run identifiers.** A hostile or legacy server
  injecting `nextBootstrapId` / `nextRunId` on the success envelope is ignored, not surfaced: the
  contract is "this RPC does not own next-run creation", not "this RPC must reject next-run
  identifiers if present". The drop is a defence-in-depth measure, not a contract violation
  signal.
- **`wechat-shell.controller.startNextLife` now requires a caller-supplied bootstrap id.** The page
  persists this id BEFORE the `createRunOffer` call. A future helper that generates the id inside
  the controller would silently break the retry/reload semantics; the source-level check in
  `UI04E_R1: explicit start-next-life` enforces the page-side persistence.
- **`CloudBase` transactions can throw `PostCommitTimeoutError` when the platform commits but
  loses the response.** For terminal flow this is the *post-commit* retry case the design must
  survive: the transition *did* settle (the receipt is durable), so the caller retries with
  the same `terminalTransitionId` and the exactly-once path returns the recorded result.
  The live service maps `PostCommitTimeoutError` to a `TRANSIENT / retryable` envelope; the
  exactly-once check then recovers the settled stage on the next call.
- **`.codex/context.mjs` strict allowlist rejects unknown task fields.** The UI04E_R1 task
  definition extends the schema with `executionProfile` and `executionBudget` (metadata only);
  the loader's allowlist does not yet know about them. The implementer worked around this by
  reading the task file directly; the field names are documented for the loader's next
  maintenance pass. (No code change is required to load the task today.)