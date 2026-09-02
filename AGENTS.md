# TIANFU 2.0 / CODEX RULES v0.2

Authority: current task defines scope; contracts define semantics; this file defines invariants/workflow. A task may narrow a contract, never override it. Conflict => STOP, report blocker/ADR. Long v0.1 docs are provenance only.

## Global invariants
G01 Core pure: no wx/tt/UI/DB SDK/HTTP/fetch/AI/platform clock.
G02 Rule randomness only via `.codex/contracts/rng.ref`; no Math.random()/Date.now() for rule outcomes.
G03 Rule mutation entry: reduce(State,Command,Context)->{State,Effects,NarrativeFacts,Trace}; creation factories must also be pure.
G04 Client sends intent only; never trust client currency/rank/realm/reward/final-state/player ownership.
G05 Server authoritative for rewards, ranked state, paid/meta currency, challenge results.
G06 Run locks rulesVersion+contentVersion+rootSeed. Same locked inputs+commands => same canonical RuleState hash.
G07 Rule numbers are finite safe integers unless a contract explicitly defines fixed-point/bps. No implicit float semantics.
G08 Content uses versioned schema + whitelisted DSL only. No eval/new Function/arbitrary scripts/direct DB writes.
G09 AI optional narrative only; cannot create DomainEffect/reward/combat/breakthrough/rank result or mutate RuleState. Every AI scene has fallback.
G10 Core/Content never import wx/tt. Transport is application infrastructure, not game rules.
G11 RunState != MetaState. Ended Run is immutable except archival metadata.
G12 Cause/echo must trace to real source; no impossible live-NPC echo.
G13 Challenge: no paid/ad/AI difference may change ranked rule result.
G14 Invalid/failed command mutates no RuleState/stateVersion and consumes no RNG/time.
G15 commandId idempotent; expectedStateVersion guards concurrency.
G16 maxAge is a hard lifespan ceiling, not the expected death mechanism. Earlier death may come from rule-resolved hazards/conditions/causes. Lethal results must be telegraphed or causally traceable; first 3 effective nodes forbid untelegraphed lethal RNG.
G17 Director may change candidate eligibility/weight/slot only; never direct stats/check results/rewards/death. All intervention is deterministic+traced.
G18 Do not silently change frozen assumptions. Use DECISIONS/ADR/blocker.
G19 Prefer smallest diff. No whole-repo rewrite, unrelated cleanup, gameplay scope creep, AI, Douyin, or visual redesign unless task says so.

## Work protocol
1. Run `node .codex/context.mjs Axx` once. Use only printed task+contracts unless blocked.
2. Inspect only code/config needed for task; no broad repo scan unless required.
3. If context reports BLOCKED, stop. Do not self-resolve scheduled/validate decisions.
4. Implement only `in`; never implement `out` while here.
5. Run task tests. Create only the smallest harness allowed by task.
6. Self-check G01-G19 + task acceptance.
7. Output only: changed files; tests/results; blocker/ADR; next-task readiness.

## Merge
P0/P1 => no merge. Determinism/security/fairness/data-loss/idempotency failure >=P1; exploitable reward/rank/other-user access=P0.

## Token discipline
- Do not reread unchanged `.codex` files in one task.
- Do not ingest `docs/*.docx` or audit DOCX unless context cannot resolve a contract conflict.
- Prefer targeted rg/file reads.
- Do not generate prose docs unless ADR explicitly required.
