# UI04E — Terminal Lifecycle / Multi-Life Vertical Slice

> Commit message: `UI04E: complete the live terminal lifecycle ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE through a single server-authoritative sidecar, the 4th cloud RPC, a regenerated client controller, and the v2-live four-stage render — without mutating canonical gameplay bytes`

## What this slice proves

UI04D shipped the live cloud authority for `createRunOffer` / `fetchView` / `sendCommand`. A
reducer-driven dying run then had no authoritative path into a multi-life loop — the v2-live page
showed only a placeholder. UI04E closes that gap by adding a fourth cloud RPC, a bounded terminal
presentation sidecar, and the four-stage render.

The key invariants:

1. **Terminal state lives outside RuleState.** A dying run projects as `ENDING` (no empty
   `SPECIAL_NODE` dead-end). The sidecar is the only thing that changes between successive
   `ENDING -> LIFE_BOOK -> REBIRTH_RESULT -> NEXT_LIFE` advances.
2. **Exactly-once by `terminalTransitionId`.** An exact retry after a post-commit timeout recovers
   the settled stage without advancing. A reused id with a different payload fails closed.
3. **Pure presentation transitions are byte-identical on gameplay.** `stateVersion`, `age`,
   `nodeIndex`, RNG, `commandLog`, snapshots, causes, NPC state, resources, builds and history
   never move across a terminal advance. `ruleStateHash` is the proof.
4. **NEXT_LIFE is a new document.** The completed run is kept immutable at `NEXT_LIFE`; the new
   life is opened under the trusted `OPENID`-derived `playerId` with a freshly minted
   `bootstrapId` that the page persists and re-sends through `createRunOffer`.

## Architectural placement

```
viewmodel-sidecar
└─ server/src/terminal-flow.ts      (NEW — owns advanceTerminal flow + NEXT_LIFE bootstrap)
   └─ server/src/gateway-store.ts   (TerminalSidecar + terminal transition receipts)
   └─ server/src/cloudbase-store.ts (added 4th collection: tianfu2_terminal_transitions)
   └─ server/src/live-service.ts    (advanceTerminal RPC; maps PostCommitTimeout to TRANSIENT)
   └─ server/src/viewmodel.ts       (terminal projection: LIFE_BOOK / REBIRTH_RESULT / NEXT_LIFE)
   └─ packages/platform-contract/src (advanceTerminal + terminal PublicState projection)
   └─ packages/wechat-shell/src     (controller.advanceTerminal + startNextLife)
   └─ cloudfunctions/tianfu2/index.js (4th operation: advanceTerminal)
   └─ miniprogram/pages/v2-live/*    (4-stage render + persistNextLifeBootstrap)
   └─ miniprogram/runtime            (regenerated artifact: advanceTerminal + TerminalUnavailableError)
   └─ cloudfunctions/tianfu2/runtime  (regenerated artifact: terminal-flow module + facade exports)
```

## RPC surface — added one operation

```
operation: "advanceTerminal"
request:   { runId, terminalTransitionId, expectedTerminalStage, action }
response:  { ok, terminalTransitionId, stage, version, nextBootstrapId?, nextRunId? }
           or { ok: false, terminalTransitionId, error: { code, messageKey, retryable } }
```

The four legal `action` values form a strict forward graph on `terminalStage`:

```
ENDING            --advance-to-life-book-->     LIFE_BOOK
LIFE_BOOK          --advance-to-rebirth-result--> REBIRTH_RESULT
REBIRTH_RESULT     --advance-to-next-life-->     NEXT_LIFE
```

## Why terminal state is a *sidecar*

`StoredRun` gains a `terminal?: TerminalSidecar` field, with three members:

- `stage: TerminalStage` — the authoritative stage the server is currently displaying.
- `version: number` — monotonic per-run, bumped on every settled transition.
- `transitions: Record<terminalTransitionId, TerminalTransitionRecord>` — the exactly-once table.

`TerminalTransitionRecord` carries `{ payloadHash, action, fromStage, toStage, playerId, sequence,
nextBootstrapId?, nextRunId? }` — so an exact retry after a post-commit timeout recovers the
recorded `toStage`, `version`, `nextBootstrapId`, and `nextRunId` deterministically.

The contract test (`UI04E_idempotency`) `JSON.stringify`-compares the pre- and post-transition
state on every pure advance and asserts `ruleStateHash` byte-equality.

## What the client renders

```
ENDING         — 翻阅人生书   (cta: advance-to-life-book)
LIFE_BOOK      — public life facts: build count, people count, events count, ending/death facts
REBIRTH_RESULT — 此世回望      (cta: advance-to-next-life)
NEXT_LIFE      — 此生已入卷宗   (no cta; controller swaps session.runId to nextRunId)
```

The page persists the freshly minted `nextBootstrapId` via `tianfu2:next-life-bootstrap-id` and
re-sends it through `createRunOffer` for the next run, so a retry or a reload of the same
`NEXT_LIFE` settles always lands on the same new run document.

## Forbidden scope (held from earlier tasks)

- **No** `terminalStage` field on `GameState` (asserted in `UI04E_sidecar`).
- **No** reducer change, no Director policy change, no RNG algorithm change, no Progression/Risk
  balance change, no Content rebalance, no new meta-currency, no new rebirth reward system, no
  daily-challenge, no monetization, no default-route replacement, no 1.0 page change, no tabBar
  change, no real production deployment, no `UI04FINAL`, no source-branch push.
- Terminal navigation is **not** a `GameCommand`: no `commandId`/`expectedStateVersion`/command log,
  no reducer, no `STATE_CONFLICT` from the gateway.
- The cloud runtime closure is unchanged in shape: only `server/src/terminal-flow.ts` is added;
  the facade exposes `TerminalFlowError` and `parseAdvanceTerminalRequest`.
- `wx-server-sdk` stays confined to `cloudfunctions/tianfu2/package.json` (asserted in `UI04E_audit`).
- The transactional CloudBase path still addresses documents by deterministic id and never queries
  (asserted in `UI04E_artifact_scope`).

## Verification gates run

The fast-lane protocol was honored: `runAggregateNpmTest` and `rerunKnownSandboxBaseline` are
explicitly waived. The named gates:

- `ui04e` (dedicated 26-test suite) — covers sidecar data model, terminal flow ordering, exactly-once
  retry, reused-id conflict, cross-player refusal, end-of-life projection guard, public-viewmodel
  secret-leak guard, commandLog / RNG byte-identity proof, the committed cloud host full chain,
  retry across simulated post-commit timeout, v2-live four-stage render, route guard, v2-live source
  compliance, and runtime registration.
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

## Known gaps left for `UI04FINAL`

These are **not** UI04E's scope (and the controller refuses them via `TerminalUnavailableError`):

- Default-route swap into `v2-live` (`app.json` first page is still `pages/start/start`).
- Real production deployment of `cloudfunctions/tianfu2` (the host is exercised via the committed
  fake harness — see `tools/ui04d-cloud-harness.mjs`).
- Multi-user acceptance under a real `OPENID` (only Alice and Bob fake-openids are used here).

The `UI04FINAL` controller-review ticket should pick those up exactly the way the protocol fields
suggest.

## Tooling observations (new)

- `CloudBase` transactions can throw `PostCommitTimeoutError` when the platform commits but
  loses the response. For terminal flow this is the *post-commit* retry case the design must
  survive: the transition *did* settle (the receipt is durable), so the caller retries with
  the same `terminalTransitionId` and the exactly-once path returns the recorded result.
  The live service maps `PostCommitTimeoutError` to a `TRANSIENT / retryable` envelope; the
  exactly-once check then recovers the settled stage on the next call.
- `runIdSeedFor(playerId, bootstrapId)` is the deterministic seed for `run-<hash>`; the cloud
  runtime MUST use the bootstrap-derived id rather than a fresh random token so the next-life
  document address stays deterministic and `transact` finds it. `assertBootstrapId` enforces the
  character set the document-id hashing assumes.